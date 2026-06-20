#![no_std]

use soroban_sdk::{
    contract, contracterror, contractevent, contractimpl, contracttype, Address, Bytes, BytesN,
    Env, String, Vec,
};

const PUBKEY_LIMBS: u32 = 18;
/// Each limb carries 120 bits => the top 17 bytes of its 32-byte BE encoding
/// must be zero.
const LIMB_ZERO_PREFIX_BYTES: usize = 17;

/// One day of ledgers at the ~5s close time.
pub const DAY_IN_LEDGERS: u32 = 17_280;
/// TTL target for the instance, code, and key entries: ~120 days, safely
/// under the ~180-day network maximum entry TTL. The JWK rotation job
/// re-registers keys regularly, which re-extends; if rotation ever stalls
/// longer than this window an external ExtendFootprintTTLOp is needed.
pub const TTL_EXTEND_TO: u32 = 120 * DAY_IN_LEDGERS;
/// Re-extend only once the TTL has decayed by ~a day, so steady traffic pays
/// the rent bump at most once a day instead of on every invocation.
pub const TTL_THRESHOLD: u32 = TTL_EXTEND_TO - DAY_IN_LEDGERS;

/// Hard ceiling on the activation delay so a constructor typo cannot brick
/// rotation entirely (Google keys live ~weeks).
pub const MAX_ACTIVATION_DELAY_SECS: u64 = 7 * 24 * 3600;
/// Hard floor on the activation delay so the operator timelock can never be
/// deployed disabled. The delay IS the monitoring window in which the cold
/// owner multisig can `cancel_pending` a compromised hot operator's malicious
/// proposal before it activates. 6h matches the rotation worker's cron cadence
/// and exceeds the Google id_token lifetime (<=1h). A zero/omitted delay
/// (which silently disabled the operator/owner split) is now rejected.
pub const MIN_ACTIVATION_DELAY_SECS: u64 = 6 * 3600;

#[contract]
pub struct JwkRegistryContract;

#[contracterror]
#[repr(u32)]
#[derive(Copy, Clone, Debug, Eq, PartialEq)]
pub enum Error {
    Unauthorized = 1,
    InvalidKeyLength = 2,
    KeyNotFound = 3,
    OperatorNotSet = 4,
    PendingNotFound = 5,
    ActivationDelayNotElapsed = 6,
    InvalidModulus = 7,
    InvalidActivationDelay = 8,
    PendingOwnerNotSet = 9,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum DataKey {
    Owner,
    /// Nominated successor in a two-step ownership handover. Set by
    /// `propose_owner`, cleared on `accept_ownership`/`cancel_ownership_transfer`.
    PendingOwner,
    Key(BytesN<32>),
    Kid(String),
    KeyCount,
    KeyAt(u32),
    /// Reverse lookup hash -> enumeration index, so re-registering or
    /// revoking a key can re-extend its `KeyAt` entry's TTL without scanning.
    /// Presence also marks "this hash has an enumeration slot", which keeps
    /// revoke -> re-register cycles from appending duplicate slots.
    KeyIndex(BytesN<32>),
    /// Hot-path service account: may only *propose* keys (timelocked) and
    /// revoke them (fail-safe direction). Set by the owner.
    Operator,
    /// Seconds a proposed key must wait before `activate_key` succeeds.
    ActivationDelay,
    Pending(BytesN<32>),
    PendingCount,
    PendingAt(u32),
    PendingIndex(BytesN<32>),
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct PendingKey {
    pub kid: String,
    /// Ledger timestamp after which `activate_key` succeeds.
    pub activate_after: u64,
}

#[contractevent(topics = ["owner_set"])]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct OwnershipTransferred {
    #[topic]
    pub previous_owner: Address,
    #[topic]
    pub new_owner: Address,
}

#[contractevent(topics = ["owner_proposed"], data_format = "single-value")]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct OwnerProposed {
    #[topic]
    pub new_owner: Address,
}

#[contractevent(topics = ["operator_set"], data_format = "single-value")]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct OperatorSet {
    #[topic]
    pub operator: Address,
}

#[contractevent(topics = ["key_registered"])]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct KeyRegistered {
    #[topic]
    pub key_hash: BytesN<32>,
    pub kid: String,
}

#[contractevent(topics = ["key_proposed"])]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct KeyProposed {
    #[topic]
    pub key_hash: BytesN<32>,
    pub kid: String,
    pub activate_after: u64,
}

#[contractevent(topics = ["key_activated"], data_format = "single-value")]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct KeyActivated {
    #[topic]
    pub key_hash: BytesN<32>,
}

#[contractevent(topics = ["pending_cancelled"], data_format = "single-value")]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct PendingCancelled {
    #[topic]
    pub key_hash: BytesN<32>,
}

#[contractevent(topics = ["key_revoked"], data_format = "single-value")]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct KeyRevoked {
    #[topic]
    pub key_hash: BytesN<32>,
}

/// Trust root for every Zarf vesting campaign: a proof verifies against any
/// RSA key this registry marks valid, so whoever can register keys can mint
/// claims. v2 therefore splits roles:
///
/// - `owner` — intended to be a cold Stellar account with multisig
///   thresholds (`require_auth` honors classic signer weights). Only the
///   owner can register a key immediately, cancel pendings, rotate the
///   operator, or transfer ownership.
/// - `operator` — the hot rotation-worker key. It can only *propose* keys,
///   which become active after `activation_delay` elapses and anyone calls
///   `activate_key`. The delay is the monitoring window: a compromised
///   worker cannot make a malicious key valid before alerting fires and the
///   owner cancels it. Revocation by the operator is immediate (fail-safe:
///   it can only ever disable keys, never enable them early).
///
/// There is deliberately NO delay bypass below the owner multisig.
#[contractimpl]
impl JwkRegistryContract {
    pub fn __constructor(
        env: Env,
        owner: Address,
        activation_delay_secs: u64,
    ) -> Result<(), Error> {
        if !(MIN_ACTIVATION_DELAY_SECS..=MAX_ACTIVATION_DELAY_SECS).contains(&activation_delay_secs)
        {
            return Err(Error::InvalidActivationDelay);
        }
        env.storage().instance().set(&DataKey::Owner, &owner);
        env.storage().instance().set(&DataKey::KeyCount, &0_u32);
        env.storage().instance().set(&DataKey::PendingCount, &0_u32);
        env.storage()
            .instance()
            .set(&DataKey::ActivationDelay, &activation_delay_secs);
        Self::extend_contract_ttl(&env);
        Ok(())
    }

    pub fn owner(env: Env) -> Address {
        Self::owner_unchecked(&env)
    }

    /// Step 1 of a two-step ownership handover: the current owner nominates a
    /// successor. Nothing changes until the nominee calls `accept_ownership`,
    /// so a fat-fingered or uncontrolled address can never brick the registry
    /// — the trust root for every campaign. Re-proposing overwrites the
    /// pending nominee; the owner can abort via `cancel_ownership_transfer`.
    pub fn propose_owner(env: Env, new_owner: Address) {
        Self::require_owner(&env);
        env.storage()
            .instance()
            .set(&DataKey::PendingOwner, &new_owner);
        Self::extend_contract_ttl(&env);
        OwnerProposed { new_owner }.publish(&env);
    }

    /// Step 2: the nominated successor accepts, proving it controls the
    /// address. Only then does ownership actually move.
    pub fn accept_ownership(env: Env) -> Result<(), Error> {
        let pending: Address = env
            .storage()
            .instance()
            .get(&DataKey::PendingOwner)
            .ok_or(Error::PendingOwnerNotSet)?;
        pending.require_auth();
        let previous_owner = Self::owner_unchecked(&env);
        env.storage().instance().set(&DataKey::Owner, &pending);
        env.storage().instance().remove(&DataKey::PendingOwner);
        Self::extend_contract_ttl(&env);
        OwnershipTransferred {
            previous_owner,
            new_owner: pending,
        }
        .publish(&env);
        Ok(())
    }

    /// The current owner aborts a pending handover before it is accepted.
    pub fn cancel_ownership_transfer(env: Env) -> Result<(), Error> {
        Self::require_owner(&env);
        if !env.storage().instance().has(&DataKey::PendingOwner) {
            return Err(Error::PendingOwnerNotSet);
        }
        env.storage().instance().remove(&DataKey::PendingOwner);
        Self::extend_contract_ttl(&env);
        Ok(())
    }

    pub fn pending_owner(env: Env) -> Option<Address> {
        env.storage().instance().get(&DataKey::PendingOwner)
    }

    pub fn set_operator(env: Env, operator: Address) {
        Self::require_owner(&env);
        env.storage().instance().set(&DataKey::Operator, &operator);
        OperatorSet {
            operator: operator.clone(),
        }
        .publish(&env);
    }

    pub fn get_operator(env: Env) -> Option<Address> {
        env.storage().instance().get(&DataKey::Operator)
    }

    pub fn get_activation_delay(env: Env) -> u64 {
        // Fail CLOSED: if the delay is somehow absent (it is set + range-checked
        // in the constructor and instance storage is kept alive), fall back to
        // the floor, never to 0 — a 0 fallback would let `propose_key` mint an
        // immediately-activatable key and silently bypass the timelock.
        env.storage()
            .instance()
            .get(&DataKey::ActivationDelay)
            .unwrap_or(MIN_ACTIVATION_DELAY_SECS)
    }

    /// Owner-only immediate registration. This is the emergency path and it
    /// sits behind the owner's full signature threshold by design.
    pub fn register_key(
        env: Env,
        kid: String,
        pubkey_limbs: Vec<BytesN<32>>,
    ) -> Result<BytesN<32>, Error> {
        Self::require_owner(&env);
        let key_hash = Self::compute_hash(&env, &pubkey_limbs)?;
        Self::validate_modulus(&pubkey_limbs)?;
        Self::remove_pending(&env, &key_hash);
        Self::store_key(&env, kid, key_hash.clone());
        Ok(key_hash)
    }

    /// Operator path: stage a key for activation after the delay. Proposing
    /// an already-active key just refreshes its TTLs via `activate_key`
    /// being unnecessary — the proposal is recorded regardless so the
    /// rotation worker's flow stays simple.
    pub fn propose_key(
        env: Env,
        kid: String,
        pubkey_limbs: Vec<BytesN<32>>,
    ) -> Result<BytesN<32>, Error> {
        Self::require_operator(&env)?;
        let key_hash = Self::compute_hash(&env, &pubkey_limbs)?;
        Self::validate_modulus(&pubkey_limbs)?;

        let persistent = env.storage().persistent();
        let pending_key = DataKey::Pending(key_hash.clone());
        let existing: Option<PendingKey> = persistent.get(&pending_key);
        let is_new = existing.is_none();

        // Re-proposing an already-pending key MUST preserve its original
        // activation deadline. Recomputing `now + delay` on every call would
        // let a caller that re-proposes the same hash each run (e.g. a worker
        // that cannot read the pending entry and so keeps re-staging it) push
        // the deadline forward indefinitely, starving the key of activation.
        // Only a brand-new proposal starts the clock; the floor was already
        // enforced at first proposal, so keeping the earlier deadline is safe.
        let activate_after = match &existing {
            Some(prev) => prev.activate_after,
            None => env
                .ledger()
                .timestamp()
                .saturating_add(Self::get_activation_delay(env.clone())),
        };
        let pending = PendingKey {
            kid: kid.clone(),
            activate_after,
        };

        persistent.set(&pending_key, &pending);
        persistent.extend_ttl(&pending_key, TTL_THRESHOLD, TTL_EXTEND_TO);
        if is_new {
            Self::pending_enumeration_add(&env, &key_hash);
        }
        Self::extend_contract_ttl(&env);

        KeyProposed {
            key_hash: key_hash.clone(),
            kid,
            activate_after,
        }
        .publish(&env);
        Ok(key_hash)
    }

    /// Permissionless: once the delay has elapsed, anyone may flip the
    /// pending key active. The delay — not the caller — is the control.
    pub fn activate_key(env: Env, key_hash: BytesN<32>) -> Result<(), Error> {
        let pending: PendingKey = env
            .storage()
            .persistent()
            .get(&DataKey::Pending(key_hash.clone()))
            .ok_or(Error::PendingNotFound)?;

        if env.ledger().timestamp() < pending.activate_after {
            return Err(Error::ActivationDelayNotElapsed);
        }

        Self::remove_pending(&env, &key_hash);
        Self::store_key(&env, pending.kid, key_hash.clone());
        KeyActivated { key_hash }.publish(&env);
        Ok(())
    }

    /// Owner veto for the monitoring window.
    pub fn cancel_pending(env: Env, key_hash: BytesN<32>) -> Result<(), Error> {
        Self::require_owner(&env);
        if !env
            .storage()
            .persistent()
            .has(&DataKey::Pending(key_hash.clone()))
        {
            return Err(Error::PendingNotFound);
        }
        Self::remove_pending(&env, &key_hash);
        PendingCancelled { key_hash }.publish(&env);
        Ok(())
    }

    pub fn get_pending(env: Env, key_hash: BytesN<32>) -> Option<PendingKey> {
        env.storage().persistent().get(&DataKey::Pending(key_hash))
    }

    pub fn get_pending_count(env: Env) -> u32 {
        env.storage()
            .instance()
            .get(&DataKey::PendingCount)
            .unwrap_or(0_u32)
    }

    pub fn get_pending_at(env: Env, index: u32) -> Result<BytesN<32>, Error> {
        env.storage()
            .persistent()
            .get(&DataKey::PendingAt(index))
            .ok_or(Error::PendingNotFound)
    }

    fn store_key(env: &Env, kid: String, key_hash: BytesN<32>) {
        let persistent = env.storage().persistent();
        // Gate the enumeration slot on "has this hash EVER been enumerated"
        // (KeyIndex presence), not on current validity: re-registering a
        // previously revoked key must reuse its slot, not append a duplicate.
        if !persistent.has(&DataKey::KeyIndex(key_hash.clone())) {
            let count = Self::key_count(env);
            let key_at = DataKey::KeyAt(count);
            persistent.set(&key_at, &key_hash);
            persistent.extend_ttl(&key_at, TTL_THRESHOLD, TTL_EXTEND_TO);
            let key_index = DataKey::KeyIndex(key_hash.clone());
            persistent.set(&key_index, &count);
            persistent.extend_ttl(&key_index, TTL_THRESHOLD, TTL_EXTEND_TO);
            env.storage()
                .instance()
                .set(&DataKey::KeyCount, &(count + 1));
        } else {
            // Re-registration of a known key: the rotation job does this
            // regularly, and it must also keep the enumeration entry alive or
            // `get_registered_key` breaks once `KeyAt` archives.
            Self::extend_enumeration_ttl(env, &key_hash);
        }

        let key = DataKey::Key(key_hash.clone());
        persistent.set(&key, &true);
        persistent.extend_ttl(&key, TTL_THRESHOLD, TTL_EXTEND_TO);
        let kid_key = DataKey::Kid(kid.clone());
        persistent.set(&kid_key, &key_hash);
        persistent.extend_ttl(&kid_key, TTL_THRESHOLD, TTL_EXTEND_TO);
        Self::extend_contract_ttl(env);
        KeyRegistered {
            key_hash: key_hash.clone(),
            kid,
        }
        .publish(env);
    }

    /// Owner revocation (immediate).
    pub fn revoke_key(env: Env, key_hash: BytesN<32>) -> Result<(), Error> {
        Self::require_owner(&env);
        Self::revoke_internal(&env, key_hash)
    }

    /// Operator revocation (immediate). Fail-safe direction: the hot key can
    /// only ever disable keys, never enable them ahead of the delay.
    pub fn operator_revoke_key(env: Env, key_hash: BytesN<32>) -> Result<(), Error> {
        Self::require_operator(&env)?;
        Self::revoke_internal(&env, key_hash)
    }

    fn revoke_internal(env: &Env, key_hash: BytesN<32>) -> Result<(), Error> {
        if !Self::is_valid_key_hash(env.clone(), key_hash.clone()) {
            return Err(Error::KeyNotFound);
        }

        // A revocation must also clear any outstanding proposal for the same
        // hash. Otherwise `activate_key` (permissionless, once the delay
        // elapses) would resurrect the just-revoked key from the surviving
        // `Pending` entry — defeating the fail-safe revocation guarantee during
        // exactly the incident-response window it exists for.
        Self::remove_pending(env, &key_hash);

        let key = DataKey::Key(key_hash.clone());
        env.storage().persistent().set(&key, &false);
        // Keep the explicit `false` alive: an archived revocation reads the
        // same (absent => false), but a live entry keeps the audit trail
        // restorable and the lookup cheap.
        env.storage()
            .persistent()
            .extend_ttl(&key, TTL_THRESHOLD, TTL_EXTEND_TO);
        Self::extend_enumeration_ttl(env, &key_hash);
        Self::extend_contract_ttl(env);
        KeyRevoked { key_hash }.publish(env);
        Ok(())
    }

    pub fn is_valid_key_hash(env: Env, key_hash: BytesN<32>) -> bool {
        env.storage()
            .persistent()
            .get(&DataKey::Key(key_hash))
            .unwrap_or(false)
    }

    pub fn is_valid_key(env: Env, pubkey_limbs: Vec<BytesN<32>>) -> Result<bool, Error> {
        let key_hash = Self::compute_hash(&env, &pubkey_limbs)?;
        Ok(Self::is_valid_key_hash(env, key_hash))
    }

    pub fn compute_key_hash(env: Env, pubkey_limbs: Vec<BytesN<32>>) -> Result<BytesN<32>, Error> {
        Self::compute_hash(&env, &pubkey_limbs)
    }

    pub fn get_registered_key_count(env: Env) -> u32 {
        Self::key_count(&env)
    }

    pub fn get_registered_key(env: Env, index: u32) -> Result<BytesN<32>, Error> {
        env.storage()
            .persistent()
            .get(&DataKey::KeyAt(index))
            .ok_or(Error::KeyNotFound)
    }

    pub fn is_kid_registered(env: Env, kid: String) -> bool {
        let Some(key_hash) = env
            .storage()
            .persistent()
            .get::<DataKey, BytesN<32>>(&DataKey::Kid(kid))
        else {
            return false;
        };
        Self::is_valid_key_hash(env, key_hash)
    }

    fn owner_unchecked(env: &Env) -> Address {
        env.storage()
            .instance()
            .get(&DataKey::Owner)
            .expect("registry owner is not initialized")
    }

    fn require_owner(env: &Env) {
        Self::owner_unchecked(env).require_auth();
    }

    fn require_operator(env: &Env) -> Result<(), Error> {
        let operator: Address = env
            .storage()
            .instance()
            .get(&DataKey::Operator)
            .ok_or(Error::OperatorNotSet)?;
        operator.require_auth();
        Ok(())
    }

    fn extend_contract_ttl(env: &Env) {
        env.deployer()
            .extend_ttl(env.current_contract_address(), TTL_THRESHOLD, TTL_EXTEND_TO);
    }

    fn extend_enumeration_ttl(env: &Env, key_hash: &BytesN<32>) {
        let persistent = env.storage().persistent();
        let key_index = DataKey::KeyIndex(key_hash.clone());
        if let Some(index) = persistent.get::<DataKey, u32>(&key_index) {
            persistent.extend_ttl(&key_index, TTL_THRESHOLD, TTL_EXTEND_TO);
            persistent.extend_ttl(&DataKey::KeyAt(index), TTL_THRESHOLD, TTL_EXTEND_TO);
        }
    }

    fn pending_enumeration_add(env: &Env, key_hash: &BytesN<32>) {
        let persistent = env.storage().persistent();
        let count = Self::pending_count(env);
        let at = DataKey::PendingAt(count);
        persistent.set(&at, key_hash);
        persistent.extend_ttl(&at, TTL_THRESHOLD, TTL_EXTEND_TO);
        let index_key = DataKey::PendingIndex(key_hash.clone());
        persistent.set(&index_key, &count);
        persistent.extend_ttl(&index_key, TTL_THRESHOLD, TTL_EXTEND_TO);
        env.storage()
            .instance()
            .set(&DataKey::PendingCount, &(count + 1));
    }

    /// Swap-remove from the pending enumeration and drop the entry itself.
    fn remove_pending(env: &Env, key_hash: &BytesN<32>) {
        let persistent = env.storage().persistent();
        let pending_key = DataKey::Pending(key_hash.clone());
        if !persistent.has(&pending_key) {
            return;
        }
        persistent.remove(&pending_key);

        let index_key = DataKey::PendingIndex(key_hash.clone());
        if let Some(index) = persistent.get::<DataKey, u32>(&index_key) {
            let count = Self::pending_count(env);
            let last = count.saturating_sub(1);
            if index != last {
                if let Some(moved) =
                    persistent.get::<DataKey, BytesN<32>>(&DataKey::PendingAt(last))
                {
                    persistent.set(&DataKey::PendingAt(index), &moved);
                    persistent.set(&DataKey::PendingIndex(moved), &index);
                }
            }
            persistent.remove(&DataKey::PendingAt(last));
            persistent.remove(&index_key);
            env.storage().instance().set(&DataKey::PendingCount, &last);
        }
    }

    fn pending_count(env: &Env) -> u32 {
        env.storage()
            .instance()
            .get(&DataKey::PendingCount)
            .unwrap_or(0_u32)
    }

    fn key_count(env: &Env) -> u32 {
        env.storage()
            .instance()
            .get(&DataKey::KeyCount)
            .unwrap_or(0_u32)
    }

    fn compute_hash(env: &Env, pubkey_limbs: &Vec<BytesN<32>>) -> Result<BytesN<32>, Error> {
        if pubkey_limbs.len() != PUBKEY_LIMBS {
            return Err(Error::InvalidKeyLength);
        }

        let mut packed = Bytes::new(env);
        for limb in pubkey_limbs.iter() {
            packed.extend_from_array(&limb.to_array());
        }
        Ok(env.crypto().keccak256(&packed).to_bytes())
    }

    /// Reject limb vectors that cannot be a 2048-bit RSA modulus. The owner
    /// and operator are trusted, but this shrinks the blast radius of a typo
    /// or a buggy worker: limbs must each fit 120 bits (little-endian limb
    /// order), the modulus must be exactly 2048 bits, and it must be odd.
    fn validate_modulus(pubkey_limbs: &Vec<BytesN<32>>) -> Result<(), Error> {
        for limb in pubkey_limbs.iter() {
            let bytes = limb.to_array();
            for &byte in bytes.iter().take(LIMB_ZERO_PREFIX_BYTES) {
                if byte != 0 {
                    return Err(Error::InvalidModulus);
                }
            }
        }

        // Little-endian limb order: limb 0 holds the least significant 120
        // bits. 17 limbs cover 2040 bits, so a 2048-bit modulus needs its
        // top limb in [2^7, 2^8): only the lowest byte set, high bit on.
        let top = pubkey_limbs
            .get(PUBKEY_LIMBS - 1)
            .ok_or(Error::InvalidKeyLength)?
            .to_array();
        for &byte in top.iter().take(31) {
            if byte != 0 {
                return Err(Error::InvalidModulus);
            }
        }
        if top[31] < 0x80 {
            return Err(Error::InvalidModulus);
        }

        // RSA moduli are products of odd primes.
        let low = pubkey_limbs
            .get(0)
            .ok_or(Error::InvalidKeyLength)?
            .to_array();
        if low[31] & 1 == 0 {
            return Err(Error::InvalidModulus);
        }

        Ok(())
    }
}
