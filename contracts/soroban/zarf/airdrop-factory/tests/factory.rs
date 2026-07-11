#![cfg(test)]

//! Factory tests. The instance wasm is loaded via `include_bytes!`, so the M1
//! `zarf-airdrop-soroban` crate must be built `--release` for `wasm32v1-none`
//! BEFORE running these tests (see the M2 DoD / CLAUDE.md "factory test needs
//! the instance wasm built first").

use soroban_sdk::{
    testutils::{
        storage::{Instance, Persistent},
        Address as _, Events as _, Ledger,
    },
    token, vec,
    xdr::ToXdr,
    Address, Bytes, BytesN, Env, Event, String, Vec,
};
use zarf_airdrop_factory_soroban::{
    AirdropCreated, DataKey, Error as FactoryError, ZarfAirdropFactoryContract,
    ZarfAirdropFactoryContractClient, TTL_EXTEND_TO,
};

/// The deployed `MerkleAirdrop` instance wasm (M1, built `--release` first).
const AIRDROP_WASM: &[u8] =
    include_bytes!("../../airdrop/target/wasm32v1-none/release/zarf_airdrop_soroban.wasm");

/// Typed client for the deployed instance — used to read its config and drive a
/// real claim in the integration test (#9). `contractimport!` resolves relative
/// to the crate root, hence the single `../` (vs `../../` for `include_bytes!`).
mod airdrop {
    soroban_sdk::contractimport!(
        file = "../airdrop/target/wasm32v1-none/release/zarf_airdrop_soroban.wasm"
    );
}

/// In-test fee-on-transfer token: `transfer_from` credits the recipient one unit
/// SHORT, so the factory's funding guard sees `after != before + total` and
/// returns `TokenTransferMismatch`. A real SAC always moves the exact amount and
/// can never trip the guard, so this custom mock is the only way to exercise
/// that path (#4).
mod fee_token {
    use soroban_sdk::{contract, contractimpl, Address, Env};

    #[contract]
    pub struct FeeOnTransferToken;

    #[contractimpl]
    impl FeeOnTransferToken {
        pub fn mint(env: Env, to: Address, amount: i128) {
            let b: i128 = env.storage().instance().get(&to).unwrap_or(0);
            env.storage().instance().set(&to, &(b + amount));
        }
        pub fn balance(env: Env, id: Address) -> i128 {
            env.storage().instance().get(&id).unwrap_or(0)
        }
        // `mock_all_auths` is on; the mock skips real allowance bookkeeping.
        pub fn approve(_env: Env, _from: Address, _spender: Address, _amount: i128, _exp: u32) {}
        pub fn transfer_from(
            env: Env,
            _spender: Address,
            from: Address,
            to: Address,
            amount: i128,
        ) {
            let fb: i128 = env.storage().instance().get(&from).unwrap_or(0);
            env.storage().instance().set(&from, &(fb - amount));
            let tb: i128 = env.storage().instance().get(&to).unwrap_or(0);
            env.storage().instance().set(&to, &(tb + amount - 1)); // short-credit
        }
    }
}
use fee_token::{FeeOnTransferToken, FeeOnTransferTokenClient};

// ---- helpers ----

fn test_salt(env: &Env, n: u8) -> BytesN<32> {
    BytesN::from_array(env, &[n; 32])
}

fn nonzero_root(env: &Env, n: u8) -> BytesN<32> {
    BytesN::from_array(env, &[n; 32])
}

fn cid(env: &Env) -> String {
    String::from_str(env, "ipfs://campaign")
}

/// In-Rust mirror of the instance leaf hash (airdrop `leaf()`), used to build a
/// real single-recipient claim. For one recipient the Merkle root IS the leaf
/// and the proof is empty.
fn leaf(env: &Env, index: u32, addr: &Address, amount: i128) -> BytesN<32> {
    let mut buf = Bytes::new(env);
    buf.append(&Bytes::from_array(env, &[0x00]));
    buf.append(&Bytes::from_array(env, &index.to_be_bytes()));
    buf.append(&addr.clone().to_xdr(env));
    buf.append(&Bytes::from_array(env, &amount.to_be_bytes()));
    env.crypto().keccak256(&buf).to_bytes()
}

/// Register the factory over a fresh SAC token. Returns (factory client,
/// factory id, token address). The token's issuer/admin is internal; the
/// campaign `owner` is generated per test.
fn setup(env: &Env) -> (ZarfAirdropFactoryContractClient<'_>, Address, Address) {
    env.mock_all_auths();
    let issuer = Address::generate(env);
    let token = env.register_stellar_asset_contract_v2(issuer).address();
    let wasm_hash = env.deployer().upload_contract_wasm(AIRDROP_WASM);
    let factory_id = env.register(ZarfAirdropFactoryContract, (wasm_hash,));
    let factory = ZarfAirdropFactoryContractClient::new(env, &factory_id);
    (factory, factory_id, token)
}

/// Mint `amount` to `owner` and approve the factory to pull it (the M4 UX step).
fn fund_owner(env: &Env, token: &Address, owner: &Address, factory_id: &Address, amount: i128) {
    token::StellarAssetClient::new(env, token).mint(owner, &amount);
    token::TokenClient::new(env, token).approve(owner, factory_id, &amount, &1000);
}

// ---- 1. constructor ----

#[test]
fn constructor_records_wasm_hash_and_zero_count() {
    let env = Env::default();
    let (factory, _factory_id, _token) = setup(&env);
    let wasm_hash = env.deployer().upload_contract_wasm(AIRDROP_WASM);

    assert_eq!(factory.airdrop_wasm_hash(), wasm_hash);
    assert_eq!(factory.get_deployment_count(), 0);
}

// ---- 2. happy path: deploy + atomic fund + register + instance config ----

#[test]
fn create_airdrop_deploys_funds_and_registers() {
    let env = Env::default();
    let (factory, factory_id, token) = setup(&env);
    let token_client = token::TokenClient::new(&env, &token);

    let owner = Address::generate(&env);
    let total = 500_i128;
    fund_owner(&env, &token, &owner, &factory_id, total);

    let salt = test_salt(&env, 9);
    let root = nonzero_root(&env, 10);
    let predicted = factory.predict_airdrop_address(&owner, &salt);
    let instance = factory.create_airdrop(
        &owner,
        &token,
        &root,
        &total,
        &0u64,
        &false,
        &3u32,
        &salt,
        &cid(&env),
    );

    // determinism + atomic funding (owner fully debited, instance fully credited)
    assert_eq!(instance, predicted);
    assert_eq!(token_client.balance(&instance), total);
    assert_eq!(token_client.balance(&owner), 0);

    // registry
    assert_eq!(factory.get_deployment_count(), 1);
    assert_eq!(factory.get_deployment(&0), instance);

    // the instance was constructed from the forwarded 6-tuple (owner -> admin)
    let cfg = airdrop::Client::new(&env, &instance).config();
    assert_eq!(cfg.admin, owner);
    assert_eq!(cfg.token, token);
    assert_eq!(cfg.merkle_root, root);
    assert_eq!(cfg.total, total);
    assert_eq!(cfg.deadline, 0);
    assert!(!cfg.locked);
}

// ---- 3. atomicity: missing allowance deploys + funds nothing ----

#[test]
fn create_airdrop_without_allowance_deploys_nothing() {
    let env = Env::default();
    let (factory, _factory_id, token) = setup(&env);
    let token_client = token::TokenClient::new(&env, &token);

    let owner = Address::generate(&env);
    let total = 500_i128;
    // Mint to owner but DO NOT approve the factory -> transfer_from reverts.
    token::StellarAssetClient::new(&env, &token).mint(&owner, &total);

    let salt = test_salt(&env, 11);
    let predicted = factory.predict_airdrop_address(&owner, &salt);
    let result = factory.try_create_airdrop(
        &owner,
        &token,
        &nonzero_root(&env, 10),
        &total,
        &0u64,
        &false,
        &1u32,
        &salt,
        &cid(&env),
    );

    assert!(result.is_err(), "funding without allowance must fail");
    // atomic unwind: owner keeps funds, nothing deployed, registry untouched
    assert_eq!(token_client.balance(&owner), total);
    assert_eq!(token_client.balance(&predicted), 0);
    assert_eq!(factory.get_deployment_count(), 0);
    assert!(factory.try_get_deployment(&0).is_err());
}

// ---- 4. fee-on-transfer token trips the TokenTransferMismatch guard ----

#[test]
fn fee_on_transfer_token_trips_mismatch_guard() {
    let env = Env::default();
    let (factory, factory_id, _sac) = setup(&env);

    let owner = Address::generate(&env);
    let total = 500_i128;
    let mock_id = env.register(FeeOnTransferToken, ());
    let mock = FeeOnTransferTokenClient::new(&env, &mock_id);
    mock.mint(&owner, &total);
    mock.approve(&owner, &factory_id, &total, &1000);

    let result = factory.try_create_airdrop(
        &owner,
        &mock_id,
        &nonzero_root(&env, 10),
        &total,
        &0u64,
        &false,
        &1u32,
        &test_salt(&env, 12),
        &cid(&env),
    );

    assert!(matches!(
        result,
        Err(Ok(FactoryError::TokenTransferMismatch))
    ));
    assert_eq!(factory.get_deployment_count(), 0);
}

// ---- 5. input validations (all reject BEFORE any token movement) ----

#[test]
fn create_airdrop_rejects_invalid_inputs_without_funding() {
    let env = Env::default();
    let (factory, factory_id, token) = setup(&env);
    let token_client = token::TokenClient::new(&env, &token);

    let owner = Address::generate(&env);
    let amount = 500_i128;
    fund_owner(&env, &token, &owner, &factory_id, amount);

    let good = nonzero_root(&env, 10);
    let c = cid(&env);

    // recipient_count == 0
    assert!(matches!(
        factory.try_create_airdrop(
            &owner,
            &token,
            &good,
            &amount,
            &0u64,
            &false,
            &0u32,
            &test_salt(&env, 1),
            &c
        ),
        Err(Ok(FactoryError::InvalidRecipientCount))
    ));
    // total == 0
    assert!(matches!(
        factory.try_create_airdrop(
            &owner,
            &token,
            &good,
            &0i128,
            &0u64,
            &false,
            &1u32,
            &test_salt(&env, 2),
            &c
        ),
        Err(Ok(FactoryError::InvalidAmount))
    ));
    // total < 0
    assert!(matches!(
        factory.try_create_airdrop(
            &owner,
            &token,
            &good,
            &(-5i128),
            &0u64,
            &false,
            &1u32,
            &test_salt(&env, 3),
            &c
        ),
        Err(Ok(FactoryError::InvalidAmount))
    ));
    // all-zero root
    assert!(matches!(
        factory.try_create_airdrop(
            &owner,
            &token,
            &BytesN::from_array(&env, &[0u8; 32]),
            &amount,
            &0u64,
            &false,
            &1u32,
            &test_salt(&env, 4),
            &c
        ),
        Err(Ok(FactoryError::InvalidMerkleRoot))
    ));
    // past deadline (deadline != 0 && deadline <= now)
    env.ledger().set_timestamp(1_000);
    assert!(matches!(
        factory.try_create_airdrop(
            &owner,
            &token,
            &good,
            &amount,
            &500u64,
            &false,
            &1u32,
            &test_salt(&env, 5),
            &c
        ),
        Err(Ok(FactoryError::InvalidDeadline))
    ));
    // deadline == now is now-INCLUSIVE -> still rejected. Pins the `<=` boundary:
    // the strictly-past (500) and strictly-future (2000) cases would both survive a
    // `<=`->`<` off-by-one, so this exact-equality case is what kills that mutation.
    assert!(matches!(
        factory.try_create_airdrop(
            &owner,
            &token,
            &good,
            &amount,
            &1_000u64,
            &false,
            &1u32,
            &test_salt(&env, 6),
            &c
        ),
        Err(Ok(FactoryError::InvalidDeadline))
    ));

    // every reject short-circuits before transfer_from
    assert_eq!(token_client.balance(&owner), amount);
    assert_eq!(factory.get_deployment_count(), 0);
}

#[test]
fn total_below_recipient_count_is_rejected_without_funding() {
    // Floor-bind: every leaf amount is `>= 1` and there are `recipient_count`
    // leaves, so an honest `Σ amount >= recipient_count`. A declared
    // `total < recipient_count` is provably under-funded vs the declared
    // recipient set and must be rejected (InvalidAmount) before any deploy/fund.
    let env = Env::default();
    let (factory, factory_id, token) = setup(&env);
    let token_client = token::TokenClient::new(&env, &token);

    let owner = Address::generate(&env);
    let amount = 1_000_i128;
    fund_owner(&env, &token, &owner, &factory_id, amount);

    let good = nonzero_root(&env, 11);
    let c = cid(&env);

    // total (2) < recipient_count (3) -> InvalidAmount, no deploy, no transfer.
    assert!(matches!(
        factory.try_create_airdrop(
            &owner,
            &token,
            &good,
            &2i128,
            &0u64,
            &false,
            &3u32,
            &test_salt(&env, 7),
            &c
        ),
        Err(Ok(FactoryError::InvalidAmount))
    ));

    // Boundary: total == recipient_count is ACCEPTED (the minimal honest sum,
    // every leaf == 1). Pins the `<` boundary against a `<`->`<=` mutation.
    let a = factory.create_airdrop(
        &owner,
        &token,
        &good,
        &3i128,
        &0u64,
        &false,
        &3u32,
        &test_salt(&env, 8),
        &c,
    );
    assert_eq!(token_client.balance(&a), 3);
    assert_eq!(factory.get_deployment_count(), 1);
    // The rejected call short-circuited before transfer_from: owner only lost the
    // 3 pulled by the accepted boundary deploy.
    assert_eq!(token_client.balance(&owner), amount - 3);
}

#[test]
fn future_and_unset_deadlines_are_accepted() {
    let env = Env::default();
    let (factory, factory_id, token) = setup(&env);
    env.ledger().set_timestamp(1_000);

    let owner = Address::generate(&env);
    let amount = 200_i128;
    fund_owner(&env, &token, &owner, &factory_id, amount);

    // deadline strictly in the future is accepted
    let a = factory.create_airdrop(
        &owner,
        &token,
        &nonzero_root(&env, 6),
        &amount,
        &2_000u64,
        &false,
        &1u32,
        &test_salt(&env, 6),
        &cid(&env),
    );
    assert_eq!(airdrop::Client::new(&env, &a).config().deadline, 2_000);
}

// ---- 6. owner-bound salt determinism + duplicate rejection ----

#[test]
fn predict_address_is_owner_bound() {
    let env = Env::default();
    let (factory, _factory_id, _token) = setup(&env);

    let owner = Address::generate(&env);
    let other = Address::generate(&env);
    let salt = test_salt(&env, 7);

    // same owner + same salt is stable; distinct owners never collide
    assert_eq!(
        factory.predict_airdrop_address(&owner, &salt),
        factory.predict_airdrop_address(&owner, &salt)
    );
    assert_ne!(
        factory.predict_airdrop_address(&owner, &salt),
        factory.predict_airdrop_address(&other, &salt)
    );
}

#[test]
fn duplicate_owner_salt_is_rejected() {
    let env = Env::default();
    let (factory, factory_id, token) = setup(&env);

    let owner = Address::generate(&env);
    let total = 100_i128;
    fund_owner(&env, &token, &owner, &factory_id, total * 2);

    let salt = test_salt(&env, 8);
    let root = nonzero_root(&env, 3);
    let first = factory.create_airdrop(
        &owner,
        &token,
        &root,
        &total,
        &0u64,
        &false,
        &1u32,
        &salt,
        &cid(&env),
    );
    assert_eq!(first, factory.predict_airdrop_address(&owner, &salt));

    // redeploying to the same owner-bound address fails; registry stays at 1
    let dup = factory.try_create_airdrop(
        &owner,
        &token,
        &root,
        &total,
        &0u64,
        &false,
        &1u32,
        &salt,
        &cid(&env),
    );
    assert!(dup.is_err());
    assert_eq!(factory.get_deployment_count(), 1);
}

// ---- 7. registry counts + indexes + OOB ----

#[test]
fn deployment_registry_counts_and_indexes() {
    let env = Env::default();
    let (factory, factory_id, token) = setup(&env);

    let owner = Address::generate(&env);
    let total = 100_i128;
    fund_owner(&env, &token, &owner, &factory_id, total * 2);

    let root = nonzero_root(&env, 5);
    let a0 = factory.create_airdrop(
        &owner,
        &token,
        &root,
        &total,
        &0u64,
        &false,
        &1u32,
        &test_salt(&env, 20),
        &cid(&env),
    );
    let a1 = factory.create_airdrop(
        &owner,
        &token,
        &root,
        &total,
        &0u64,
        &false,
        &1u32,
        &test_salt(&env, 21),
        &cid(&env),
    );

    assert_eq!(factory.get_deployment_count(), 2);
    assert_eq!(factory.get_deployment(&0), a0);
    assert_eq!(factory.get_deployment(&1), a1);
    assert_ne!(a0, a1);
    assert!(factory.try_get_deployment(&2).is_err()); // out of bounds
}

// ---- 8. AirdropCreated event (topics + every data field) ----

#[test]
fn create_airdrop_emits_event() {
    let env = Env::default();
    let (factory, factory_id, token) = setup(&env);

    let owner = Address::generate(&env);
    let total = 250_i128;
    fund_owner(&env, &token, &owner, &factory_id, total);

    let salt = test_salt(&env, 30);
    let root = nonzero_root(&env, 8);
    let metadata = String::from_str(&env, "ipfs://event-cid");
    let recipient_count = 4u32;
    let deadline = 0u64;
    let locked = true;
    let instance = factory.create_airdrop(
        &owner,
        &token,
        &root,
        &total,
        &deadline,
        &locked,
        &recipient_count,
        &salt,
        &metadata,
    );

    // Build the expected event from the typed struct's own encoding (the
    // #[contractevent] `Event` impl), so topics + the sorted data map are exact.
    let expected = AirdropCreated {
        airdrop: instance,
        owner: owner.clone(),
        token: token.clone(),
        total_amount: total,
        recipient_count,
        merkle_root: root,
        deadline,
        locked,
        metadata_cid: metadata,
    };
    let factory_events = env.events().all().filter_by_contract(&factory_id);
    assert_eq!(
        factory_events,
        vec![
            &env,
            (
                factory_id.clone(),
                expected.topics(&env),
                expected.data(&env)
            )
        ]
    );
}

// ---- 9. integration: factory -> instance -> one real claim (parity proof) ----

#[test]
fn factory_deployed_instance_accepts_a_real_claim() {
    let env = Env::default();
    let (factory, factory_id, token) = setup(&env);
    let token_client = token::TokenClient::new(&env, &token);

    let owner = Address::generate(&env);
    let claimant = Address::generate(&env);
    let amount = 1_000_i128;
    fund_owner(&env, &token, &owner, &factory_id, amount);

    // single recipient: root == leaf, empty proof (M1 hashing, computed in-Rust)
    let root = leaf(&env, 0, &claimant, amount);
    let proof: Vec<BytesN<32>> = Vec::new(&env);

    let instance = factory.create_airdrop(
        &owner,
        &token,
        &root,
        &amount,
        &0u64,
        &false,
        &1u32,
        &test_salt(&env, 40),
        &cid(&env),
    );
    assert_eq!(token_client.balance(&instance), amount);

    // the recipient claims their full allocation from the factory-funded instance
    let instance_client = airdrop::Client::new(&env, &instance);
    instance_client.claim(&0u32, &claimant, &amount, &proof);

    assert_eq!(token_client.balance(&claimant), amount);
    assert_eq!(token_client.balance(&instance), 0);
    assert!(instance_client.is_claimed(&0));
}

// ---- 10. create requires owner auth ----

#[test]
fn create_airdrop_requires_owner_auth() {
    // Fresh env with NO mock_all_auths: owner.require_auth() must gate the call.
    let env = Env::default();
    let issuer = Address::generate(&env);
    let token = env.register_stellar_asset_contract_v2(issuer).address();
    let wasm_hash = env.deployer().upload_contract_wasm(AIRDROP_WASM);
    let factory_id = env.register(ZarfAirdropFactoryContract, (wasm_hash,));
    let factory = ZarfAirdropFactoryContractClient::new(&env, &factory_id);

    let owner = Address::generate(&env);
    let result = factory.try_create_airdrop(
        &owner,
        &token,
        &nonzero_root(&env, 10),
        &100i128,
        &0u64,
        &false,
        &1u32,
        &test_salt(&env, 50),
        &cid(&env),
    );

    assert!(result.is_err(), "unauthenticated create must fail");
    assert_eq!(factory.get_deployment_count(), 0);
}

// ---- 11. TTL extension on the factory's own state ----

#[test]
fn create_airdrop_extends_ttls() {
    let env = Env::default();
    let (factory, factory_id, token) = setup(&env);

    let owner = Address::generate(&env);
    let total = 100_i128;
    fund_owner(&env, &token, &owner, &factory_id, total);
    factory.create_airdrop(
        &owner,
        &token,
        &nonzero_root(&env, 4),
        &total,
        &0u64,
        &false,
        &1u32,
        &test_salt(&env, 60),
        &cid(&env),
    );

    let deployment_ttl = env.as_contract(&factory_id, || {
        env.storage()
            .persistent()
            .get_ttl(&DataKey::DeploymentAt(0))
    });
    assert_eq!(deployment_ttl, TTL_EXTEND_TO);

    let instance_ttl = env.as_contract(&factory_id, || env.storage().instance().get_ttl());
    assert_eq!(instance_ttl, TTL_EXTEND_TO);
}

// ============================================================================
// M8 (T3) — funding-atomicity property (`proptest`, doc 06 §6).
//
// Sweeps create_airdrop across randomized (total, recipient_count, deadline,
// locked) and three funding legs, asserting the INV-9 guarantee: an instance is
// funded with EXACTLY `total`, or the whole call unwinds (no deploy, no
// registry entry, funds untouched). The unwind error is TokenTransferMismatch —
// repr 7 in THIS factory enum (the instance's is 10; distinct enums).
// `PROPTEST_CASES=<n>` raises the case count for a deeper sweep.
// ============================================================================
mod proptests {
    use super::*;
    use proptest::prelude::*;

    fn case_count(default: u32) -> u32 {
        std::env::var("PROPTEST_CASES")
            .ok()
            .and_then(|s| s.parse().ok())
            .unwrap_or(default)
    }

    proptest! {
        #![proptest_config(ProptestConfig { cases: case_count(48), ..ProptestConfig::default() })]
        #[test]
        fn factory_funds_exactly_total_or_unwinds(
            total in 1i128..=1_000_000_000i128,
            recipient_count in 1u32..=100_000u32,
            use_deadline in any::<bool>(),
            locked in any::<bool>(),
            leg in 0u8..3u8,
            salt_n in any::<u8>(),
        ) {
            let env = Env::default();
            let (factory, factory_id, sac) = setup(&env);
            let owner = Address::generate(&env);
            let root = nonzero_root(&env, 10);
            let salt = test_salt(&env, salt_n);
            let deadline: u64 = if use_deadline { 1_000_000 } else { 0 };
            // Respect the create_airdrop floor-bind (`total >= recipient_count`):
            // these legs exercise funding atomicity, not the floor check, so clamp
            // the count to `total` (total <= 1e9 < u32::MAX) — otherwise a drawn
            // `total < recipient_count` would short-circuit with InvalidAmount and
            // mask the funding-path assertions below.
            let recipient_count = recipient_count.min(total as u32);

            match leg {
                0 => {
                    // Exact-fund leg: owner approves >= total -> instance gets total.
                    let token_client = token::TokenClient::new(&env, &sac);
                    fund_owner(&env, &sac, &owner, &factory_id, total);
                    let predicted = factory.predict_airdrop_address(&owner, &salt);
                    let instance = factory.create_airdrop(
                        &owner, &sac, &root, &total, &deadline, &locked,
                        &recipient_count, &salt, &cid(&env),
                    );
                    prop_assert_eq!(&instance, &predicted);
                    prop_assert_eq!(token_client.balance(&instance), total);
                    prop_assert_eq!(token_client.balance(&owner), 0i128);
                    prop_assert_eq!(factory.get_deployment_count(), 1u32);
                    prop_assert_eq!(factory.get_deployment(&0), instance);
                }
                1 => {
                    // No-allowance leg: transfer_from reverts -> full unwind.
                    let token_client = token::TokenClient::new(&env, &sac);
                    token::StellarAssetClient::new(&env, &sac).mint(&owner, &total);
                    let predicted = factory.predict_airdrop_address(&owner, &salt);
                    let res = factory.try_create_airdrop(
                        &owner, &sac, &root, &total, &deadline, &locked,
                        &recipient_count, &salt, &cid(&env),
                    );
                    prop_assert!(res.is_err());
                    prop_assert_eq!(token_client.balance(&owner), total);
                    prop_assert_eq!(token_client.balance(&predicted), 0i128);
                    prop_assert_eq!(factory.get_deployment_count(), 0u32);
                    prop_assert!(factory.try_get_deployment(&0).is_err());
                }
                _ => {
                    // Fee-on-transfer leg: short-credit trips the funding guard ->
                    // TokenTransferMismatch (repr 7), full unwind.
                    let mock_id = env.register(FeeOnTransferToken, ());
                    let mock = FeeOnTransferTokenClient::new(&env, &mock_id);
                    mock.mint(&owner, &total);
                    mock.approve(&owner, &factory_id, &total, &1000);
                    let res = factory.try_create_airdrop(
                        &owner, &mock_id, &root, &total, &deadline, &locked,
                        &recipient_count, &salt, &cid(&env),
                    );
                    prop_assert_eq!(res, Err(Ok(FactoryError::TokenTransferMismatch)));
                    prop_assert_eq!(factory.get_deployment_count(), 0u32);
                    prop_assert!(factory.try_get_deployment(&0).is_err());
                }
            }
        }
    }
}

// ============================================================================
// M8 (T8) — resource / fee profile (doc 06 §8.4, doc 05). Operator-local,
// `#[ignore]`. Native `env.cost_estimate()` (metering is auto-enabled). The
// instance is deployed by the factory as real WASM, so claim/withdraw VM costs
// are metered; the factory itself is a native test contract, so create_airdrop
// slightly UNDERESTIMATES the factory's own execution (the instance deploy IS
// metered). Per-claim cost scales with proof length (= log2(N)), so a depth-D
// proof is synthesized in O(D) instead of building 2^D real leaves.
//
// Run: cargo test -p zarf-airdrop-factory-soroban --test factory \
//        -- --ignored --nocapture fee_profile
// ============================================================================
mod fee_sim {
    use super::*;

    /// Sorted-pair node hash (mirror of the instance contract's hash_node).
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

    /// Fold `leaf` with `depth` arbitrary siblings to get the matching root and
    /// a depth-length proof — verify_merkle folds identically, so a real claim
    /// succeeds with this proof WITHOUT materializing 2^depth leaves.
    fn synthetic_proof(env: &Env, leaf: &BytesN<32>, depth: u32) -> (BytesN<32>, Vec<BytesN<32>>) {
        let mut node = leaf.clone();
        let mut proof = Vec::new(env);
        for i in 0..depth {
            let sibling =
                BytesN::from_array(env, &[(i as u8).wrapping_mul(7).wrapping_add(0x11); 32]);
            proof.push_back(sibling.clone());
            node = hash_node(env, &node, &sibling);
        }
        (node, proof) // node == root
    }

    fn report(label: &str, env: &Env) {
        let r = env.cost_estimate().resources();
        let f = env.cost_estimate().fee();
        let rent = f.persistent_entry_rent + f.temporary_entry_rent;
        std::println!(
            "{label}\n    cpu_insns={} mem={}B | disk_read_entries={} mem_read_entries={} write_entries={} disk_read_bytes={} write_bytes={} events={}B\n    fee_total={} stroops (~{:.5} XLM): exec+io={} stroops, rent={} stroops (persistent={}, temp={})\n    mainnet limits: insns {}/600000000, write_bytes {}/132096, write_entries {}/50, disk_read_entries {}/100",
            r.instructions, r.mem_bytes, r.disk_read_entries, r.memory_read_entries, r.write_entries,
            r.disk_read_bytes, r.write_bytes, r.contract_events_size_bytes,
            f.total, f.total as f64 / 1e7, f.total - rent, rent, f.persistent_entry_rent, f.temporary_entry_rent,
            r.instructions, r.write_bytes, r.write_entries, r.disk_read_entries,
        );
    }

    #[test]
    #[ignore]
    fn fee_profile() {
        let amount = 1_000_000_i128;

        // create_airdrop + claim at proof depths 10 / 14 / 17 (~1k / 16k / 131k).
        for depth in [10u32, 14, 17] {
            let env = Env::default();
            let (factory, factory_id, token) = setup(&env);
            let owner = Address::generate(&env);
            let claimant = Address::generate(&env);
            fund_owner(&env, &token, &owner, &factory_id, amount);

            let base_leaf = leaf(&env, 0, &claimant, amount);
            let (root, proof) = synthetic_proof(&env, &base_leaf, depth);
            let recipient_count = 1u32 << depth;

            let instance = factory.create_airdrop(
                &owner,
                &token,
                &root,
                &amount,
                &0u64,
                &false,
                &recipient_count,
                &test_salt(&env, depth as u8),
                &cid(&env),
            );
            report(
                &std::format!(
                    "create_airdrop (N=2^{}={}, deploy+fund)",
                    depth,
                    recipient_count
                ),
                &env,
            );

            airdrop::Client::new(&env, &instance).claim(&0u32, &claimant, &amount, &proof);
            report(
                &std::format!(
                    "claim (proof depth={} ~ {} recipients)",
                    depth,
                    recipient_count
                ),
                &env,
            );
        }

        // withdraw_unclaimed (full sweep) on an unlocked, fully-unclaimed instance.
        let env = Env::default();
        let (factory, factory_id, token) = setup(&env);
        let owner = Address::generate(&env);
        let claimant = Address::generate(&env);
        fund_owner(&env, &token, &owner, &factory_id, amount);
        let base_leaf = leaf(&env, 0, &claimant, amount);
        let (root, _) = synthetic_proof(&env, &base_leaf, 17);
        let instance = factory.create_airdrop(
            &owner,
            &token,
            &root,
            &amount,
            &0u64,
            &false,
            &131_072u32,
            &test_salt(&env, 99),
            &cid(&env),
        );
        let sink = Address::generate(&env);
        airdrop::Client::new(&env, &instance).withdraw_unclaimed(&sink);
        report("withdraw_unclaimed (full sweep)", &env);
    }
}
