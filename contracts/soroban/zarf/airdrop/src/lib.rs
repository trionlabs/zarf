#![no_std]

//! `MerkleAirdrop` — standalone wallet-address + Merkle-claim airdrop instance.
//!
//! One instance per campaign. Recipients claim their allocation by presenting a
//! keccak256 Merkle proof and pay their own transaction fee. Deliberately separate
//! from Zarf's ZK/email core: NO ZK proof, NO BN254 field reduction on the leaf
//! (plain keccak256), NO trustline branching (uniform `token::TokenClient`).
//!
//! Mirrors the patterns of `contracts/soroban/zarf/vesting/src/lib.rs`
//! (constructor / claim guard+rollback / MuxedAddress payout / TTL).

use soroban_sdk::{
    contract, contracterror, contractevent, contractimpl, contracttype, token, xdr::ToXdr, Address,
    Bytes, BytesN, Env, MuxedAddress, Vec,
};

/// One day of ledgers at the ~5s close time.
pub const DAY_IN_LEDGERS: u32 = 17_280;
/// TTL target for instance, code, and persistent entries: ~120 days, safely under
/// the ~180-day network maximum entry TTL. Every state-changing call re-extends;
/// fully dormant campaigns still need an external ExtendFootprintTTLOp before lapse.
pub const TTL_EXTEND_TO: u32 = 120 * DAY_IN_LEDGERS;
/// Re-extend only once TTL has decayed by ~a day, so steady traffic pays the rent
/// bump at most once a day instead of on every invocation.
pub const TTL_THRESHOLD: u32 = TTL_EXTEND_TO - DAY_IN_LEDGERS;
/// Cap for `claimed_statuses`, counted in bitmap indices. Each word holds 128
/// indices, so 80 indices is well under the ~100 footprint-entries-per-tx cap.
pub const MAX_PAGE_LIMIT: u32 = 80;
/// Bits per claimed-bitmap word (`u128`).
const BITMAP_WORD_BITS: u32 = 128;

#[contract]
pub struct MerkleAirdrop;

#[contracterror]
#[repr(u32)]
#[derive(Copy, Clone, Debug, Eq, PartialEq)]
pub enum Error {
    AlreadyClaimed = 1,
    InvalidProof = 2,
    Expired = 3,
    NotYetWithdrawable = 4,
    Unauthorized = 5, // reserved (admin gated via require_auth); unused in v1 flow
    InvalidIndex = 6, // reserved (bitmap-word overflow defense); unused in v1 flow
    NothingToWithdraw = 7,
    NotInitialized = 8,
    InvalidAmount = 9,
    TokenTransferMismatch = 10,
    InvalidLimit = 11, // claimed_statuses limit > MAX_PAGE_LIMIT
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Config {
    pub admin: Address,
    pub token: Address,
    pub merkle_root: BytesN<32>,
    pub total: i128,
    pub deadline: u64,
    pub locked: bool,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum DataKey {
    Config,           // instance storage: Config
    ClaimedWord(u32), // persistent storage: u128 bitmap word (word = index / 128)
}

// `data_format` deliberately omitted: `Claimed` carries two data fields
// (`index`, `amount`), so the default multi-field encoding is used.
#[contractevent(topics = ["claim"])]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Claimed {
    #[topic]
    pub to: Address,
    pub index: u32,
    pub amount: i128,
}

#[contractevent(topics = ["withdraw"])]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Withdrawn {
    #[topic]
    pub to: Address,
    pub amount: i128,
}

#[contractimpl]
impl MerkleAirdrop {
    /// Atomic init at deploy. Validates `total > 0` and a nonzero root (defense in
    /// depth — the factory checks these too). No BN254 canonical-field check: the
    /// root is a raw keccak256 digest, not a BN254 scalar.
    pub fn __constructor(
        env: Env,
        admin: Address,
        token: Address,
        merkle_root: BytesN<32>,
        total: i128,
        deadline: u64,
        locked: bool,
    ) -> Result<(), Error> {
        if total <= 0 {
            return Err(Error::InvalidAmount);
        }
        if Self::is_zero_root(&merkle_root) {
            return Err(Error::InvalidProof);
        }
        let cfg = Config {
            admin,
            token,
            merkle_root,
            total,
            deadline,
            locked,
        };
        env.storage().instance().set(&DataKey::Config, &cfg);
        Self::extend_contract_ttl(&env);
        Ok(())
    }

    /// Claim `amount` for the leaf at `index`. Recipient signs and pays the fee.
    ///
    /// Order (02 §3.6): config -> expired -> amount -> already-claimed -> proof ->
    /// auth -> set-claimed (BEFORE transfer) -> transfer + balance guard (rollback
    /// the bit on mismatch) -> event + TTL.
    pub fn claim(
        env: Env,
        index: u32,
        claimant: Address,
        amount: i128,
        proof: Vec<BytesN<32>>,
    ) -> Result<(), Error> {
        let cfg = Self::load_config(&env)?;

        if cfg.deadline > 0 && env.ledger().timestamp() > cfg.deadline {
            return Err(Error::Expired);
        }
        if amount <= 0 {
            return Err(Error::InvalidAmount);
        }
        if Self::is_claimed_inner(&env, index) {
            return Err(Error::AlreadyClaimed);
        }

        let leaf = Self::leaf(&env, index, &claimant, amount);
        if !Self::verify_merkle(&env, &cfg.merkle_root, &leaf, &proof) {
            return Err(Error::InvalidProof);
        }

        claimant.require_auth();

        // Set the claimed bit BEFORE the transfer; roll it back if the transfer
        // guard fails (mirrors vesting:364-397). The Err also reverts the whole
        // invocation, so the explicit rollback is belt-and-suspenders.
        Self::set_claimed(&env, index);

        let token_client = token::TokenClient::new(&env, &cfg.token);
        let contract = env.current_contract_address();
        let before_contract = token_client.balance(&contract);
        let before_claimant = token_client.balance(&claimant);
        let to: MuxedAddress = (&claimant).into();
        token_client.transfer(&contract, &to, &amount);
        let after_contract = token_client.balance(&contract);
        let after_claimant = token_client.balance(&claimant);
        if before_contract.checked_sub(amount) != Some(after_contract)
            || before_claimant.checked_add(amount) != Some(after_claimant)
        {
            Self::unset_claimed(&env, index);
            return Err(Error::TokenTransferMismatch);
        }

        Self::extend_contract_ttl(&env);
        Claimed {
            to: claimant,
            index,
            amount,
        }
        .publish(&env);
        Ok(())
    }

    /// Admin sweeps the remaining balance to `to`. Gated by the `locked`/`deadline`
    /// trust matrix (02 §3.7): `locked && (deadline==0 || now<=deadline)` => blocked.
    pub fn withdraw_unclaimed(env: Env, to: Address) -> Result<(), Error> {
        let cfg = Self::load_config(&env)?;
        cfg.admin.require_auth();

        let now = env.ledger().timestamp();
        if cfg.locked && (cfg.deadline == 0 || now <= cfg.deadline) {
            return Err(Error::NotYetWithdrawable);
        }

        let token_client = token::TokenClient::new(&env, &cfg.token);
        let contract = env.current_contract_address();
        let balance = token_client.balance(&contract);
        if balance <= 0 {
            return Err(Error::NothingToWithdraw);
        }

        let before_to = token_client.balance(&to);
        let to_mux: MuxedAddress = (&to).into();
        token_client.transfer(&contract, &to_mux, &balance);
        if balance.checked_sub(balance) != Some(token_client.balance(&contract))
            || before_to.checked_add(balance) != Some(token_client.balance(&to))
        {
            return Err(Error::TokenTransferMismatch);
        }

        Self::extend_contract_ttl(&env);
        Withdrawn {
            to,
            amount: balance,
        }
        .publish(&env);
        Ok(())
    }

    // ---- views (read-only; no require_auth) ----

    pub fn config(env: Env) -> Result<Config, Error> {
        Self::load_config(&env)
    }

    pub fn is_claimed(env: Env, index: u32) -> bool {
        Self::is_claimed_inner(&env, index)
    }

    /// Bitmap status over `start..(start+limit)`. No on-chain recipient count
    /// exists, so the full window is returned (unwritten words read all-false);
    /// only `MAX_PAGE_LIMIT` bounds it.
    pub fn claimed_statuses(env: Env, start: u32, limit: u32) -> Result<Vec<bool>, Error> {
        if limit > MAX_PAGE_LIMIT {
            return Err(Error::InvalidLimit);
        }
        let mut statuses = Vec::new(&env);
        let end = start.saturating_add(limit);
        let mut i = start;
        while i < end {
            statuses.push_back(Self::is_claimed_inner(&env, i));
            i += 1;
        }
        Ok(statuses)
    }

    pub fn admin(env: Env) -> Result<Address, Error> {
        Ok(Self::load_config(&env)?.admin)
    }

    pub fn token(env: Env) -> Result<Address, Error> {
        Ok(Self::load_config(&env)?.token)
    }

    pub fn merkle_root(env: Env) -> Result<BytesN<32>, Error> {
        Ok(Self::load_config(&env)?.merkle_root)
    }

    // ---- internal helpers ----

    fn load_config(env: &Env) -> Result<Config, Error> {
        env.storage()
            .instance()
            .get(&DataKey::Config)
            .ok_or(Error::NotInitialized)
    }

    fn extend_contract_ttl(env: &Env) {
        env.deployer()
            .extend_ttl(env.current_contract_address(), TTL_THRESHOLD, TTL_EXTEND_TO);
    }

    fn is_zero_root(root: &BytesN<32>) -> bool {
        root.to_array().iter().all(|byte| *byte == 0)
    }

    fn word_bit(index: u32) -> (u32, u32) {
        (index / BITMAP_WORD_BITS, index % BITMAP_WORD_BITS)
    }

    fn is_claimed_inner(env: &Env, index: u32) -> bool {
        let (word, bit) = Self::word_bit(index);
        let value: u128 = env
            .storage()
            .persistent()
            .get(&DataKey::ClaimedWord(word))
            .unwrap_or(0u128);
        (value & (1u128 << bit)) != 0
    }

    fn set_claimed(env: &Env, index: u32) {
        let (word, bit) = Self::word_bit(index);
        let key = DataKey::ClaimedWord(word);
        let mut value: u128 = env.storage().persistent().get(&key).unwrap_or(0u128);
        value |= 1u128 << bit;
        env.storage().persistent().set(&key, &value);
        env.storage()
            .persistent()
            .extend_ttl(&key, TTL_THRESHOLD, TTL_EXTEND_TO);
    }

    fn unset_claimed(env: &Env, index: u32) {
        let (word, bit) = Self::word_bit(index);
        let key = DataKey::ClaimedWord(word);
        let mut value: u128 = env.storage().persistent().get(&key).unwrap_or(0u128);
        value &= !(1u128 << bit);
        env.storage().persistent().set(&key, &value);
    }

    /// `leaf = keccak256( 0x00 ‖ index_be(4B) ‖ claimant.to_xdr() ‖ amount_be(16B) )`.
    /// Plain keccak256 — NO BN254 reduction (09 §2). `to_xdr` is the ScVal(ScAddress)
    /// serialization; JS must match via `Address.fromString().toScVal().toXDR()`.
    fn leaf(env: &Env, index: u32, claimant: &Address, amount: i128) -> BytesN<32> {
        let mut buf = Bytes::new(env);
        buf.append(&Bytes::from_array(env, &[0x00]));
        buf.append(&Bytes::from_array(env, &index.to_be_bytes()));
        buf.append(&claimant.clone().to_xdr(env));
        buf.append(&Bytes::from_array(env, &amount.to_be_bytes()));
        env.crypto().keccak256(&buf).to_bytes()
    }

    /// `node = keccak256( 0x01 ‖ sorted(lo, hi) )` — lexicographic, no direction bit.
    fn hash_node(env: &Env, a: &BytesN<32>, b: &BytesN<32>) -> BytesN<32> {
        let (lo, hi) = if a.to_array() <= b.to_array() {
            (a, b)
        } else {
            (b, a)
        };
        let mut buf = Bytes::new(env);
        buf.append(&Bytes::from_array(env, &[0x01]));
        buf.append(&Bytes::from_array(env, &lo.to_array()));
        buf.append(&Bytes::from_array(env, &hi.to_array()));
        env.crypto().keccak256(&buf).to_bytes()
    }

    fn verify_merkle(
        env: &Env,
        root: &BytesN<32>,
        leaf: &BytesN<32>,
        proof: &Vec<BytesN<32>>,
    ) -> bool {
        let mut computed = leaf.clone();
        for sibling in proof.iter() {
            computed = Self::hash_node(env, &computed, &sibling);
        }
        &computed == root
    }
}
