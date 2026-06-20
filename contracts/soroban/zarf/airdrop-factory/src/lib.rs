#![no_std]

//! `ZarfAirdropFactoryContract` — deploys + atomically funds `MerkleAirdrop`
//! instances (`contracts/soroban/zarf/airdrop`) in a single transaction.
//!
//! A ZK-stripped, "keep-trim" derivative of the vesting factory
//! (`contracts/soroban/zarf/factory`). Deliberately separate from Zarf's
//! ZK/email core:
//!
//! * NO BN254 canonical-field check on the root — the airdrop Merkle root is a
//!   raw keccak256 digest, not a BN254 scalar (so `is_canonical_field` /
//!   `InvalidAudience` / `MerkleRootAlreadyUsed` from the ZK factory are NOT
//!   carried). The only root rule is "non-zero".
//! * NO verifier / jwk-registry deps — the instance constructor takes only
//!   `(admin, token, merkle_root, total, deadline, locked)`.
//! * KEEP-TRIM registry: v1 persists only a flat `DeploymentAt(index)` list for
//!   `get_deployment`; the per-owner index, metadata-CID map and range/paging
//!   getters are dropped — campaign discovery runs off the `AirdropCreated`
//!   event + the indexer (M6). The full registry can return in v2.
//!
//! Atomicity: `create_airdrop` deploys the instance, then pulls `total` from the
//! owner via `transfer_from` (the owner must have `approve`d this factory) and
//! verifies the credited balance with a `TokenTransferMismatch` guard. Any
//! failure unwinds the whole transaction, so a half-deployed / unfunded instance
//! can never persist.

use soroban_sdk::{
    contract, contracterror, contractevent, contractimpl, contracttype, token, xdr::ToXdr, Address,
    BytesN, Env, String, Val,
};

/// One day of ledgers at the ~5s close time.
pub const DAY_IN_LEDGERS: u32 = 17_280;
/// TTL target for the instance, code, and registry entries: ~120 days, safely
/// under the ~180-day network maximum entry TTL. Every deployment re-extends; a
/// fully dormant factory still needs an external `ExtendFootprintTTLOp` before
/// this window lapses.
pub const TTL_EXTEND_TO: u32 = 120 * DAY_IN_LEDGERS;
/// Re-extend only once the TTL has decayed by ~a day, so steady traffic pays the
/// rent bump at most once a day instead of on every invocation.
pub const TTL_THRESHOLD: u32 = TTL_EXTEND_TO - DAY_IN_LEDGERS;

#[contract]
pub struct ZarfAirdropFactoryContract;

#[contracterror]
#[repr(u32)]
#[derive(Copy, Clone, Debug, Eq, PartialEq)]
pub enum Error {
    NotInitialized = 1,
    InvalidRecipientCount = 2,
    InvalidAmount = 3,
    // Reserved: range-read paging is trimmed in v1, so nothing constructs this.
    // Kept to freeze the ABI slot numbering against the design spec (02 §2.1).
    InvalidLimit = 4,
    InvalidMerkleRoot = 5,
    // Slot 6 is `InvalidDeadline`, NOT the ZK factory's `InvalidAudience`: the
    // airdrop has no ZK audience binding; it has an optional claim deadline.
    InvalidDeadline = 6,
    TokenTransferMismatch = 7,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum DataKey {
    /// instance storage: `BytesN<32>` — hash of the uploaded `MerkleAirdrop` wasm.
    AirdropWasmHash,
    /// instance storage: `u32` — number of instances deployed so far.
    DeploymentCount,
    /// persistent storage: `Address` — the deployed instance at this index. A
    /// bare `Address` (not a struct): the keep-trim v1 stores no per-deployment
    /// metadata on-chain (that lives in the `AirdropCreated` event / indexer).
    DeploymentAt(u32),
}

// `data_format` deliberately omitted: `AirdropCreated` carries several data
// fields, so the default multi-field encoding is used (mirrors the vesting
// factory's `VestingCreated` and the instance's `Claimed` event).
#[contractevent(topics = ["airdrop_created"])]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct AirdropCreated {
    #[topic]
    pub airdrop: Address,
    #[topic]
    pub owner: Address,
    #[topic]
    pub token: Address,
    /// Funded amount transferred into the instance. Equals `Σ leaf amount` only
    /// by the TRUSTED OFF-CHAIN SOLVENCY INVARIANT — the Merkle root commits
    /// per-leaf `(index, address, amount)`, so the factory cannot sum the leaves
    /// without every proof and verifies only `total >= recipient_count` and the
    /// exact credited balance (`create_airdrop` floor-bind + funding guard).
    pub total_amount: i128,
    /// Off-chain metadata for the indexer: the instance never stores or verifies
    /// a recipient count. The factory only floor-binds it via
    /// `total >= recipient_count` (each leaf amount is `>= 1`); the exact leaf
    /// count is not provable on-chain.
    pub recipient_count: u32,
    pub merkle_root: BytesN<32>,
    /// 0 = no deadline.
    pub deadline: u64,
    pub locked: bool,
    pub metadata_cid: String,
}

#[contractimpl]
impl ZarfAirdropFactoryContract {
    /// One-time init at deploy. Records the `MerkleAirdrop` wasm hash every
    /// instance is cloned from and zeroes the deployment counter. Returns `()`
    /// and performs no validation — a bad hash simply makes later `deploy_v2`
    /// calls fail atomically (this mirrors the vesting factory constructor; do
    /// not confuse it with the instance constructor, which is fallible).
    pub fn __constructor(env: Env, airdrop_wasm_hash: BytesN<32>) {
        let store = env.storage().instance();
        store.set(&DataKey::AirdropWasmHash, &airdrop_wasm_hash);
        store.set(&DataKey::DeploymentCount, &0_u32);
        Self::extend_contract_ttl(&env);
    }

    // ---- views (read-only; no require_auth) ----

    pub fn airdrop_wasm_hash(env: Env) -> Result<BytesN<32>, Error> {
        Self::get_instance(&env, DataKey::AirdropWasmHash)
    }

    /// The deterministic address `create_airdrop(owner, …, salt)` will deploy to.
    /// Lets a campaign owner pin the claim link / IPFS metadata before deploying.
    pub fn predict_airdrop_address(env: Env, owner: Address, salt: BytesN<32>) -> Address {
        let deployment_salt = Self::owner_bound_salt(&env, &owner, &salt);
        env.deployer()
            .with_current_contract(deployment_salt)
            .deployed_address()
    }

    pub fn get_deployment_count(env: Env) -> u32 {
        Self::deployment_count(&env)
    }

    pub fn get_deployment(env: Env, index: u32) -> Result<Address, Error> {
        env.storage()
            .persistent()
            .get(&DataKey::DeploymentAt(index))
            .ok_or(Error::NotInitialized)
    }

    // ---- deploy + atomic fund ----

    /// Deploy a `MerkleAirdrop` instance for `owner` and fund it with `total` in
    /// one transaction. `owner` must have `approve`d this factory as a spender
    /// for at least `total` on `token` (the create-app UX, M4).
    ///
    /// Order (02 §2.5): auth -> validations -> deploy -> fund + guard -> register
    /// + event + TTL -> `Ok(address)`. The returned address equals
    /// `predict_airdrop_address(owner, salt)`. `recipient_count` and
    /// `metadata_cid` are not stored on-chain; they are emitted for the indexer.
    pub fn create_airdrop(
        env: Env,
        owner: Address,
        token: Address,
        merkle_root: BytesN<32>,
        total: i128,
        deadline: u64,
        locked: bool,
        recipient_count: u32,
        salt: BytesN<32>,
        metadata_cid: String,
    ) -> Result<Address, Error> {
        owner.require_auth();

        if recipient_count == 0 {
            return Err(Error::InvalidRecipientCount);
        }
        if total <= 0 {
            return Err(Error::InvalidAmount);
        }
        // Floor-bind `total` to `recipient_count`: every leaf amount is `>= 1`
        // (the instance `claim` rejects `amount <= 0`, lib.rs:150, and the JS
        // claim-list builder rejects `amount <= 0`), and the tree commits exactly
        // `recipient_count` leaves, so an honest `Σ amount >= recipient_count`.
        // A declared `total < recipient_count` is therefore provably under-funded
        // versus the declared recipient set — reject before any deploy/funding.
        // This is the only side of the leaf-sum that is cheaply enforceable
        // on-chain; the exact `total == Σ amount` equality is a TRUSTED OFF-CHAIN
        // SOLVENCY INVARIANT (see the `total` note in `AirdropCreated`): the root
        // commits per-leaf `(index, address, amount)` and the contract cannot sum
        // the leaves without every proof, so it can verify neither over- nor exact
        // funding. Residual risk is bounded: over-declared `total` (Σ < total)
        // strands the surplus, recoverable by the admin via `withdraw_unclaimed`;
        // under-declared `total` (Σ > total) is naturally capped by the funded
        // balance (last claimants fail the transfer — first-come-first-served).
        if total < i128::from(recipient_count) {
            return Err(Error::InvalidAmount);
        }
        if Self::is_zero_root(&merkle_root) {
            return Err(Error::InvalidMerkleRoot);
        }
        if deadline != 0 && deadline <= env.ledger().timestamp() {
            return Err(Error::InvalidDeadline);
        }

        let airdrop = Self::deploy_airdrop(
            &env,
            owner.clone(),
            token.clone(),
            merkle_root.clone(),
            total,
            deadline,
            locked,
            salt,
        )?;

        // Atomic funding: pull `total` from the owner into the fresh instance and
        // assert it was credited in full. A fee-on-transfer / rebasing token that
        // short-credits the instance trips the guard and unwinds the deploy.
        let token_client = token::TokenClient::new(&env, &token);
        let before = token_client.balance(&airdrop);
        token_client.transfer_from(&env.current_contract_address(), &owner, &airdrop, &total);
        let after = token_client.balance(&airdrop);
        if after
            != before
                .checked_add(total)
                .ok_or(Error::TokenTransferMismatch)?
        {
            return Err(Error::TokenTransferMismatch);
        }

        Self::track_deployment(
            &env,
            airdrop.clone(),
            owner,
            token,
            total,
            recipient_count,
            merkle_root,
            deadline,
            locked,
            metadata_cid,
        );
        Ok(airdrop)
    }

    // ---- internal helpers ----

    /// Deploy the instance at the owner-bound deterministic address, forwarding
    /// the 6-arg `MerkleAirdrop` constructor `(admin, token, merkle_root, total,
    /// deadline, locked)`. `owner` is passed as the instance `admin`.
    fn deploy_airdrop(
        env: &Env,
        owner: Address,
        token: Address,
        merkle_root: BytesN<32>,
        total: i128,
        deadline: u64,
        locked: bool,
        salt: BytesN<32>,
    ) -> Result<Address, Error> {
        let wasm_hash = Self::get_instance::<BytesN<32>>(env, DataKey::AirdropWasmHash)?;
        let deployment_salt = Self::owner_bound_salt(env, &owner, &salt);
        Ok(env
            .deployer()
            .with_current_contract(deployment_salt)
            .deploy_v2(
                wasm_hash,
                (owner, token, merkle_root, total, deadline, locked),
            ))
    }

    /// Append the instance to the flat deployment list, bump the counter, extend
    /// TTLs, and emit `AirdropCreated`. Keep-trim: one persistent write per
    /// deploy (the `DeploymentAt` entry); no per-owner / metadata-CID writes.
    fn track_deployment(
        env: &Env,
        airdrop: Address,
        owner: Address,
        token: Address,
        total: i128,
        recipient_count: u32,
        merkle_root: BytesN<32>,
        deadline: u64,
        locked: bool,
        metadata_cid: String,
    ) {
        let count = Self::deployment_count(env);
        let key = DataKey::DeploymentAt(count);
        let persistent = env.storage().persistent();
        persistent.set(&key, &airdrop);
        persistent.extend_ttl(&key, TTL_THRESHOLD, TTL_EXTEND_TO);
        env.storage()
            .instance()
            .set(&DataKey::DeploymentCount, &(count + 1));
        Self::extend_contract_ttl(env);

        AirdropCreated {
            airdrop,
            owner,
            token,
            total_amount: total,
            recipient_count,
            merkle_root,
            deadline,
            locked,
            metadata_cid,
        }
        .publish(env);
    }

    /// `keccak256(owner.to_xdr() ‖ salt)` — binds the CREATE2-style deploy salt to
    /// the owner so distinct owners with the same user salt never collide.
    fn owner_bound_salt(env: &Env, owner: &Address, salt: &BytesN<32>) -> BytesN<32> {
        let mut preimage = owner.clone().to_xdr(env);
        preimage.extend_from_array(&salt.to_array());
        env.crypto().keccak256(&preimage).to_bytes()
    }

    fn is_zero_root(root: &BytesN<32>) -> bool {
        root.to_array().iter().all(|byte| *byte == 0)
    }

    fn get_instance<T>(env: &Env, key: DataKey) -> Result<T, Error>
    where
        T: soroban_sdk::TryFromVal<Env, Val>,
    {
        env.storage()
            .instance()
            .get(&key)
            .ok_or(Error::NotInitialized)
    }

    fn deployment_count(env: &Env) -> u32 {
        env.storage()
            .instance()
            .get(&DataKey::DeploymentCount)
            .unwrap_or(0)
    }

    fn extend_contract_ttl(env: &Env) {
        env.deployer()
            .extend_ttl(env.current_contract_address(), TTL_THRESHOLD, TTL_EXTEND_TO);
    }
}
