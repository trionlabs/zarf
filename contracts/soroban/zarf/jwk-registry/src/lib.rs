#![no_std]

use soroban_sdk::{
    contract, contracterror, contractevent, contractimpl, contracttype, Address, Bytes, BytesN,
    Env, String, Vec,
};

const PUBKEY_LIMBS: u32 = 18;

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

#[contract]
pub struct JwkRegistryContract;

#[contracterror]
#[repr(u32)]
#[derive(Copy, Clone, Debug, Eq, PartialEq)]
pub enum Error {
    Unauthorized = 1,
    InvalidKeyLength = 2,
    KeyNotFound = 3,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum DataKey {
    Owner,
    Key(BytesN<32>),
    Kid(String),
    KeyCount,
    KeyAt(u32),
    /// Reverse lookup hash -> enumeration index, so re-registering or
    /// revoking a key can re-extend its `KeyAt` entry's TTL without scanning.
    KeyIndex(BytesN<32>),
}

#[contractevent(topics = ["owner_set"])]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct OwnershipTransferred {
    #[topic]
    pub previous_owner: Address,
    #[topic]
    pub new_owner: Address,
}

#[contractevent(topics = ["key_registered"])]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct KeyRegistered {
    #[topic]
    pub key_hash: BytesN<32>,
    pub kid: String,
}

#[contractevent(topics = ["key_revoked"], data_format = "single-value")]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct KeyRevoked {
    #[topic]
    pub key_hash: BytesN<32>,
}

#[contractimpl]
impl JwkRegistryContract {
    pub fn __constructor(env: Env, owner: Address) {
        env.storage().instance().set(&DataKey::Owner, &owner);
        env.storage().instance().set(&DataKey::KeyCount, &0_u32);
        Self::extend_contract_ttl(&env);
    }

    pub fn owner(env: Env) -> Address {
        Self::owner_unchecked(&env)
    }

    pub fn transfer_ownership(env: Env, new_owner: Address) {
        let owner = Self::owner_unchecked(&env);
        owner.require_auth();
        env.storage().instance().set(&DataKey::Owner, &new_owner);
        OwnershipTransferred {
            previous_owner: owner,
            new_owner,
        }
        .publish(&env);
    }

    pub fn register_key(
        env: Env,
        kid: String,
        pubkey_limbs: Vec<BytesN<32>>,
    ) -> Result<BytesN<32>, Error> {
        Self::require_owner(&env);
        let key_hash = Self::compute_hash(&env, &pubkey_limbs)?;
        Self::store_key(&env, kid, key_hash.clone());
        Ok(key_hash)
    }

    fn store_key(env: &Env, kid: String, key_hash: BytesN<32>) {
        let persistent = env.storage().persistent();
        if !Self::is_valid_key_hash(env.clone(), key_hash.clone()) {
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
            // Re-registration of a live key: the rotation job does this daily,
            // and it must also keep the enumeration entry alive or
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

    pub fn revoke_key(env: Env, key_hash: BytesN<32>) -> Result<(), Error> {
        Self::require_owner(&env);
        if !Self::is_valid_key_hash(env.clone(), key_hash.clone()) {
            return Err(Error::KeyNotFound);
        }

        let key = DataKey::Key(key_hash.clone());
        env.storage().persistent().set(&key, &false);
        // Keep the explicit `false` alive: an archived revocation reads the
        // same (absent => false), but a live entry keeps the audit trail
        // restorable and the lookup cheap.
        env.storage()
            .persistent()
            .extend_ttl(&key, TTL_THRESHOLD, TTL_EXTEND_TO);
        Self::extend_enumeration_ttl(&env, &key_hash);
        Self::extend_contract_ttl(&env);
        KeyRevoked { key_hash }.publish(&env);
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
}
