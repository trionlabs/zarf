use soroban_sdk::{
    contract, contractimpl, contracttype,
    testutils::{
        storage::{Instance, Persistent},
        Address as _, Ledger,
    },
    token, Address, BytesN, Env, String,
};
use zarf_vesting_factory_soroban::{
    DataKey, DeploymentInfo, Error as FactoryError, PendingVerifierUpdate,
    ZarfVestingFactoryContract, ZarfVestingFactoryContractClient, MAX_PAGE_LIMIT,
    MIN_VERIFIER_UPDATE_DELAY_SECS, TTL_EXTEND_TO,
};

const VESTING_WASM: &[u8] =
    include_bytes!("../../vesting/target/wasm32v1-none/release/zarf_vesting_soroban.wasm");

const BN254_SCALAR_MODULUS_TEST: [u8; 32] = [
    0x30, 0x64, 0x4e, 0x72, 0xe1, 0x31, 0xa0, 0x29, 0xb8, 0x50, 0x45, 0xb6, 0x81, 0x81, 0x58, 0x5d,
    0x28, 0x33, 0xe8, 0x48, 0x79, 0xb9, 0x70, 0x91, 0x43, 0xe1, 0xf5, 0x93, 0xf0, 0x00, 0x00, 0x01,
];

mod vesting {
    soroban_sdk::contractimport!(
        file = "../vesting/target/wasm32v1-none/release/zarf_vesting_soroban.wasm"
    );
}

#[contract]
pub struct MockVerifier;

#[contracttype]
#[derive(Clone)]
pub enum MockVerifierKey {
    VkHash,
}

#[contractimpl]
impl MockVerifier {
    pub fn __constructor(env: Env, vk_hash: BytesN<32>) {
        env.storage()
            .instance()
            .set(&MockVerifierKey::VkHash, &vk_hash);
    }

    pub fn vk_hash(env: Env) -> BytesN<32> {
        env.storage()
            .instance()
            .get(&MockVerifierKey::VkHash)
            .expect("mock verifier initialized")
    }
}

fn test_salt(env: &Env, n: u8) -> BytesN<32> {
    BytesN::from_array(env, &[n; 32])
}

fn audience_hash(env: &Env) -> BytesN<32> {
    BytesN::from_array(env, &[6_u8; 32])
}

fn non_canonical_field(env: &Env) -> BytesN<32> {
    BytesN::from_array(env, &BN254_SCALAR_MODULUS_TEST)
}

fn mock_verifier(env: &Env, n: u8) -> (Address, BytesN<32>) {
    let vk_hash = BytesN::from_array(env, &[n; 32]);
    let verifier = env.register(MockVerifier, (vk_hash.clone(),));
    (verifier, vk_hash)
}

fn setup(
    env: &Env,
) -> (
    ZarfVestingFactoryContractClient<'_>,
    Address,
    Address,
    Address,
    Address,
) {
    env.mock_all_auths();

    let verifier = Address::generate(env);
    let registry = Address::generate(env);
    let owner = Address::generate(env);
    let upgrade_admin = Address::generate(env);
    let token_asset = env.register_stellar_asset_contract_v2(owner.clone());
    let token = token_asset.address();
    let vesting_wasm_hash = env.deployer().upload_contract_wasm(VESTING_WASM);
    let factory_id = env.register(
        ZarfVestingFactoryContract,
        (
            verifier.clone(),
            registry.clone(),
            vesting_wasm_hash,
            upgrade_admin,
        ),
    );
    let factory = ZarfVestingFactoryContractClient::new(env, &factory_id);

    (factory, factory_id, verifier, registry, token)
}

#[test]
fn creates_vesting_and_tracks_metadata() {
    let env = Env::default();
    let (factory, _factory_id, verifier, registry, token_id) = setup(&env);

    let owner = Address::generate(&env);
    let salt = test_salt(&env, 7);
    let root = BytesN::from_array(&env, &[8_u8; 32]);
    let cid = String::from_str(&env, "ipfs://metadata");

    let predicted = factory.predict_vesting_address(&owner, &salt);
    let vesting = factory.create_vesting(
        &owner,
        &token_id,
        &salt,
        &String::from_str(&env, "Zarf"),
        &String::from_str(&env, "Factory deployed"),
        &root,
        &audience_hash(&env),
        &2,
        &300,
        &cid,
    );
    assert_eq!(vesting, predicted);

    let vesting_client = vesting::Client::new(&env, &vesting);
    assert_eq!(vesting_client.owner(), owner);
    assert_eq!(vesting_client.token(), token_id);
    assert_eq!(vesting_client.verifier(), verifier);
    assert_eq!(vesting_client.jwk_registry(), registry);
    assert_eq!(vesting_client.merkle_root(), root);
    assert_eq!(vesting_client.metadata_cid(), cid);

    let summary = vesting_client.summary();
    assert_eq!(summary.owner, owner);
    assert_eq!(summary.token, token_id);
    assert_eq!(summary.verifier, verifier);
    assert_eq!(summary.jwk_registry, registry);
    assert_eq!(summary.name, String::from_str(&env, "Zarf"));
    assert_eq!(
        summary.description,
        String::from_str(&env, "Factory deployed")
    );
    assert_eq!(summary.merkle_root, root);
    assert_eq!(summary.audience_hash, audience_hash(&env));
    assert_eq!(summary.metadata_cid, cid);

    assert_eq!(factory.get_deployment_count(), 1);
    assert_eq!(factory.get_deployment(&0), vesting);
    assert_eq!(factory.get_owner_deployment_count(&owner), 1);
    assert_eq!(factory.get_owner_deployment(&owner, &0), vesting);
    assert_eq!(factory.vesting_metadata_cid(&vesting), cid);

    let all = factory.get_deployments(&0, &10);
    assert_eq!(all.len(), 1);
    assert_eq!(all.get_unchecked(0), vesting);

    let all_infos = factory.get_deployment_infos(&0, &10);
    assert_eq!(all_infos.len(), 1);
    assert_eq!(all_infos.get_unchecked(0).address, vesting);
    assert_eq!(all_infos.get_unchecked(0).metadata_cid, cid);

    let owner_deployments = factory.get_owner_deployments(&owner, &0, &10);
    assert_eq!(owner_deployments.len(), 1);
    assert_eq!(owner_deployments.get_unchecked(0), vesting);

    let owner_infos = factory.get_owner_deployment_infos(&owner, &0, &10);
    assert_eq!(owner_infos.len(), 1);
    assert_eq!(owner_infos.get_unchecked(0).address, vesting);
    assert_eq!(owner_infos.get_unchecked(0).metadata_cid, cid);
}

#[test]
fn factory_verifier_update_is_timelocked_and_future_deployments_only() {
    let env = Env::default();
    let (factory, _factory_id, old_verifier, _registry, token) = setup(&env);
    let owner = Address::generate(&env);
    let (new_verifier, new_vk_hash) = mock_verifier(&env, 44);
    let circuit_hash = BytesN::from_array(&env, &[45_u8; 32]);
    let manifest_hash = BytesN::from_array(&env, &[46_u8; 32]);

    match factory.try_propose_verifier_update(
        &old_verifier,
        &new_vk_hash,
        &circuit_hash,
        &manifest_hash,
    ) {
        Err(Ok(FactoryError::InvalidVerifierUpdate)) => {}
        other => panic!("unexpected same-verifier proposal result: {:?}", other),
    }
    match factory.try_propose_verifier_update(
        &new_verifier,
        &BytesN::from_array(&env, &[99_u8; 32]),
        &circuit_hash,
        &manifest_hash,
    ) {
        Err(Ok(FactoryError::InvalidVerifierUpdate)) => {}
        other => panic!("unexpected wrong-vk proposal result: {:?}", other),
    }
    match factory.try_propose_verifier_update(
        &new_verifier,
        &new_vk_hash,
        &circuit_hash,
        &BytesN::from_array(&env, &[0_u8; 32]),
    ) {
        Err(Ok(FactoryError::InvalidVerifierUpdate)) => {}
        other => panic!("unexpected zero-manifest proposal result: {:?}", other),
    }
    match factory.try_propose_verifier_update(
        &Address::generate(&env),
        &new_vk_hash,
        &circuit_hash,
        &manifest_hash,
    ) {
        Err(Ok(FactoryError::VerifierUpdateCallFailed)) => {}
        other => panic!("unexpected missing-vk proposal result: {:?}", other),
    }

    factory.propose_verifier_update(&new_verifier, &new_vk_hash, &circuit_hash, &manifest_hash);
    factory.cancel_verifier_update();
    assert!(factory.pending_verifier_update().is_none());
    match factory.try_execute_verifier_update() {
        Err(Ok(FactoryError::PendingVerifierUpdateNotFound)) => {}
        other => panic!("unexpected cancelled verifier execute result: {:?}", other),
    }

    factory.propose_verifier_update(&new_verifier, &new_vk_hash, &circuit_hash, &manifest_hash);
    let pending = factory
        .pending_verifier_update()
        .expect("pending verifier update");
    assert_eq!(pending.verifier, new_verifier);
    assert_eq!(pending.vk_hash, new_vk_hash);
    assert_eq!(pending.circuit_hash, circuit_hash);
    assert_eq!(pending.manifest_hash, manifest_hash);
    assert_eq!(
        pending.execute_after - pending.proposed_at,
        MIN_VERIFIER_UPDATE_DELAY_SECS
    );

    let old_child = factory.create_vesting(
        &owner,
        &token,
        &test_salt(&env, 71),
        &String::from_str(&env, "Zarf"),
        &String::from_str(&env, "Old verifier child"),
        &BytesN::from_array(&env, &[7_u8; 32]),
        &audience_hash(&env),
        &1,
        &100,
        &String::from_str(&env, "ipfs://old-verifier-child"),
    );
    let old_child_client = vesting::Client::new(&env, &old_child);
    assert_eq!(old_child_client.verifier(), old_verifier);

    match factory.try_execute_verifier_update() {
        Err(Ok(FactoryError::VerifierUpdateDelayNotElapsed)) => {}
        other => panic!("unexpected early verifier execute result: {:?}", other),
    }

    env.ledger().set_timestamp(pending.execute_after);
    factory.execute_verifier_update();
    assert!(factory.pending_verifier_update().is_none());
    assert_eq!(factory.verifier(), new_verifier);
    let current_metadata = factory
        .current_verifier_metadata()
        .expect("current verifier metadata");
    assert_eq!(current_metadata.verifier, new_verifier);
    assert_eq!(current_metadata.vk_hash, new_vk_hash);
    assert_eq!(current_metadata.circuit_hash, circuit_hash);
    assert_eq!(current_metadata.manifest_hash, manifest_hash);
    assert_eq!(current_metadata.activated_at, pending.execute_after);
    assert_eq!(old_child_client.verifier(), old_verifier);

    let new_child = factory.create_vesting(
        &owner,
        &token,
        &test_salt(&env, 72),
        &String::from_str(&env, "Zarf"),
        &String::from_str(&env, "New verifier child"),
        &BytesN::from_array(&env, &[8_u8; 32]),
        &audience_hash(&env),
        &1,
        &100,
        &String::from_str(&env, "ipfs://new-verifier-child"),
    );
    let new_child_client = vesting::Client::new(&env, &new_child);
    assert_eq!(new_child_client.verifier(), new_verifier);
}

#[test]
fn factory_verifier_update_requires_upgrade_admin_auth() {
    let env = Env::default();
    let verifier = Address::generate(&env);
    let registry = Address::generate(&env);
    let upgrade_admin = Address::generate(&env);
    let vesting_wasm_hash = env.deployer().upload_contract_wasm(VESTING_WASM);
    let factory_id = env.register(
        ZarfVestingFactoryContract,
        (verifier, registry, vesting_wasm_hash, upgrade_admin),
    );
    let factory = ZarfVestingFactoryContractClient::new(&env, &factory_id);
    let (new_verifier, new_vk_hash) = mock_verifier(&env, 47);
    let circuit_hash = BytesN::from_array(&env, &[48_u8; 32]);
    let manifest_hash = BytesN::from_array(&env, &[49_u8; 32]);

    assert!(factory
        .try_propose_verifier_update(&new_verifier, &new_vk_hash, &circuit_hash, &manifest_hash)
        .is_err());
    env.as_contract(&factory_id, || {
        env.storage().instance().set(
            &DataKey::PendingVerifierUpdate,
            &PendingVerifierUpdate {
                verifier: new_verifier,
                vk_hash: new_vk_hash,
                circuit_hash,
                manifest_hash,
                proposed_at: 0,
                execute_after: 0,
            },
        );
    });
    assert!(factory.try_cancel_verifier_update().is_err());
    assert!(factory.try_execute_verifier_update().is_err());
}

#[test]
fn factory_upgrade_admin_controls_pause_and_child_vesting_admin() {
    let env = Env::default();
    env.mock_all_auths();

    let verifier = Address::generate(&env);
    let registry = Address::generate(&env);
    let owner = Address::generate(&env);
    let upgrade_admin = Address::generate(&env);
    let token_asset = env.register_stellar_asset_contract_v2(owner.clone());
    let token = token_asset.address();
    let vesting_wasm_hash = env.deployer().upload_contract_wasm(VESTING_WASM);
    let factory_id = env.register(
        ZarfVestingFactoryContract,
        (verifier, registry, vesting_wasm_hash, upgrade_admin.clone()),
    );
    let factory = ZarfVestingFactoryContractClient::new(&env, &factory_id);

    assert_eq!(factory.version(), 2);
    assert_eq!(factory.schema_version(), 1);
    assert_eq!(factory.upgrade_admin(), upgrade_admin);

    let vesting = factory.create_vesting(
        &owner,
        &token,
        &test_salt(&env, 31),
        &String::from_str(&env, "Zarf"),
        &String::from_str(&env, "Factory deployed"),
        &BytesN::from_array(&env, &[8_u8; 32]),
        &audience_hash(&env),
        &1,
        &100,
        &String::from_str(&env, "ipfs://admin"),
    );
    let vesting_client = vesting::Client::new(&env, &vesting);
    assert_eq!(vesting_client.upgrade_admin(), factory_id);

    let child_wasm_hash = BytesN::from_array(&env, &[4_u8; 32]);
    let child_manifest_hash = BytesN::from_array(&env, &[5_u8; 32]);
    match factory.try_propose_upgrade(&child_wasm_hash, &child_manifest_hash, &1) {
        Err(Ok(FactoryError::InvalidUpgrade)) => {}
        other => panic!(
            "unexpected non-incrementing factory upgrade result: {:?}",
            other
        ),
    }
    match factory.try_propose_vesting_upgrade(
        &vesting,
        &BytesN::from_array(&env, &[0_u8; 32]),
        &child_manifest_hash,
        &2,
    ) {
        Err(Ok(FactoryError::InvalidUpgrade)) => {}
        other => panic!("unexpected zero child wasm hash result: {:?}", other),
    }
    match factory.try_propose_vesting_upgrade(
        &vesting,
        &child_wasm_hash,
        &BytesN::from_array(&env, &[0_u8; 32]),
        &2,
    ) {
        Err(Ok(FactoryError::InvalidUpgrade)) => {}
        other => panic!("unexpected zero child manifest hash result: {:?}", other),
    }

    factory.propose_vesting_upgrade(&vesting, &child_wasm_hash, &child_manifest_hash, &2);
    let pending = vesting_client
        .pending_upgrade()
        .expect("child pending upgrade");
    assert_eq!(pending.wasm_hash, child_wasm_hash);
    assert_eq!(pending.manifest_hash, child_manifest_hash);

    factory.pause();
    assert!(factory.is_paused());
    let result = factory.try_create_vesting(
        &owner,
        &token,
        &test_salt(&env, 32),
        &String::from_str(&env, "Zarf"),
        &String::from_str(&env, "Factory deployed"),
        &BytesN::from_array(&env, &[9_u8; 32]),
        &audience_hash(&env),
        &1,
        &100,
        &String::from_str(&env, "ipfs://paused"),
    );
    match result {
        Err(Ok(FactoryError::Paused)) => {}
        other => panic!("unexpected paused create result: {:?}", other),
    }
}

#[test]
fn factory_upgrade_admin_transfer_is_two_step() {
    let env = Env::default();
    let (factory, _factory_id, _verifier, _registry, _token) = setup(&env);
    let original_admin = factory.upgrade_admin();
    let new_admin = Address::generate(&env);

    factory.propose_upgrade_admin(&new_admin);
    assert_eq!(factory.upgrade_admin(), original_admin);
    factory.accept_upgrade_admin();
    assert_eq!(factory.upgrade_admin(), new_admin);
}

#[test]
fn deployment_record_packs_address_and_cid_into_one_entry() {
    // Range reads cost one ledger entry per item; pin the packed layout so a
    // regression back to two entries per item (address + separate cid)
    // fails loudly.
    let env = Env::default();
    let (factory, factory_id, _verifier, _registry, token_id) = setup(&env);

    let owner = Address::generate(&env);
    let cid = String::from_str(&env, "ipfs://packed");
    let vesting = factory.create_vesting(
        &owner,
        &token_id,
        &test_salt(&env, 22),
        &String::from_str(&env, "Zarf"),
        &String::from_str(&env, "Factory deployed"),
        &BytesN::from_array(&env, &[8_u8; 32]),
        &audience_hash(&env),
        &1,
        &100,
        &cid,
    );

    let record: DeploymentInfo = env.as_contract(&factory_id, || {
        env.storage()
            .persistent()
            .get(&DataKey::DeploymentAt(0))
            .unwrap()
    });
    assert_eq!(record.address, vesting);
    assert_eq!(record.metadata_cid, cid);

    let owner_record: DeploymentInfo = env.as_contract(&factory_id, || {
        env.storage()
            .persistent()
            .get(&DataKey::OwnerDeploymentAt(owner.clone(), 0))
            .unwrap()
    });
    assert_eq!(owner_record.address, vesting);
    assert_eq!(owner_record.metadata_cid, cid);
}

#[test]
fn range_reads_reject_limits_above_footprint_budget() {
    let env = Env::default();
    let (factory, _factory_id, _verifier, _registry, _token_id) = setup(&env);
    let owner = Address::generate(&env);

    assert_eq!(factory.get_deployments(&0, &MAX_PAGE_LIMIT).len(), 0);
    assert_eq!(factory.get_deployment_infos(&0, &MAX_PAGE_LIMIT).len(), 0);

    let over = MAX_PAGE_LIMIT + 1;
    for result in [
        factory.try_get_deployments(&0, &over).map(|_| ()),
        factory.try_get_deployment_infos(&0, &over).map(|_| ()),
        factory
            .try_get_owner_deployments(&owner, &0, &over)
            .map(|_| ()),
        factory
            .try_get_owner_deployment_infos(&owner, &0, &over)
            .map(|_| ()),
    ] {
        match result {
            Err(Ok(FactoryError::InvalidLimit)) => {}
            other => panic!("unexpected oversized range result: {:?}", other),
        }
    }
}

#[test]
fn create_vesting_extends_registry_entry_and_instance_ttls() {
    let env = Env::default();
    let (factory, factory_id, _verifier, _registry, token_id) = setup(&env);

    let owner = Address::generate(&env);
    let vesting = factory.create_vesting(
        &owner,
        &token_id,
        &test_salt(&env, 23),
        &String::from_str(&env, "Zarf"),
        &String::from_str(&env, "Factory deployed"),
        &BytesN::from_array(&env, &[8_u8; 32]),
        &audience_hash(&env),
        &1,
        &100,
        &String::from_str(&env, "ipfs://ttl"),
    );

    let keys = [
        DataKey::DeploymentAt(0),
        DataKey::OwnerDeploymentAt(owner.clone(), 0),
        DataKey::OwnerDeploymentCount(owner.clone()),
        DataKey::MetadataCid(vesting.clone()),
    ];
    for key in keys {
        let ttl = env.as_contract(&factory_id, || env.storage().persistent().get_ttl(&key));
        assert_eq!(ttl, TTL_EXTEND_TO, "ttl not extended for {:?}", key);
    }

    let instance_ttl = env.as_contract(&factory_id, || env.storage().instance().get_ttl());
    assert_eq!(instance_ttl, TTL_EXTEND_TO);
}

#[test]
fn create_and_fund_vesting_consumes_factory_allowance() {
    let env = Env::default();
    let (factory, factory_id, _verifier, _registry, token_id) = setup(&env);

    let owner = Address::generate(&env);
    let amount = 500_i128;
    let token_admin = token::StellarAssetClient::new(&env, &token_id);
    let token_client = token::TokenClient::new(&env, &token_id);
    token_admin.mint(&owner, &amount);
    token_client.approve(&owner, &factory_id, &amount, &1000);

    let salt = test_salt(&env, 9);
    let root = BytesN::from_array(&env, &[10_u8; 32]);
    let vesting = factory.create_and_fund_vesting(
        &owner,
        &token_id,
        &salt,
        &String::from_str(&env, "Funded Zarf"),
        &String::from_str(&env, "Factory deployed and funded"),
        &root,
        &audience_hash(&env),
        &1,
        &amount,
        &String::from_str(&env, "ipfs://funded"),
    );

    assert_eq!(token_client.balance(&vesting), amount);
    assert_eq!(factory.get_deployment_count(), 1);
    assert_eq!(factory.get_deployment(&0), vesting);
}

#[test]
fn failed_funding_does_not_track_deployment() {
    let env = Env::default();
    let (factory, _factory_id, _verifier, _registry, token_id) = setup(&env);

    let owner = Address::generate(&env);
    let amount = 500_i128;
    let token_admin = token::StellarAssetClient::new(&env, &token_id);
    let token_client = token::TokenClient::new(&env, &token_id);
    token_admin.mint(&owner, &amount);

    let salt = test_salt(&env, 11);
    let root = BytesN::from_array(&env, &[10_u8; 32]);
    let predicted = factory.predict_vesting_address(&owner, &salt);
    let result = factory.try_create_and_fund_vesting(
        &owner,
        &token_id,
        &salt,
        &String::from_str(&env, "Funded Zarf"),
        &String::from_str(&env, "Factory deployed and funded"),
        &root,
        &audience_hash(&env),
        &1,
        &amount,
        &String::from_str(&env, "ipfs://funded"),
    );

    assert!(
        result.is_err(),
        "funding without allowance unexpectedly succeeded"
    );
    assert_eq!(token_client.balance(&owner), amount);
    assert_eq!(token_client.balance(&predicted), 0);
    assert_eq!(factory.get_deployment_count(), 0);
    assert!(factory.try_get_deployment(&0).is_err());
    assert!(factory.try_vesting_metadata_cid(&predicted).is_err());
}

#[test]
fn same_salt_is_owner_scoped() {
    let env = Env::default();
    let (factory, _factory_id, _verifier, _registry, token_id) = setup(&env);

    let owner_a = Address::generate(&env);
    let owner_b = Address::generate(&env);
    let salt = test_salt(&env, 14);
    let root_a = BytesN::from_array(&env, &[10_u8; 32]);
    let root_b = BytesN::from_array(&env, &[11_u8; 32]);

    let predicted_a = factory.predict_vesting_address(&owner_a, &salt);
    let predicted_b = factory.predict_vesting_address(&owner_b, &salt);
    assert_ne!(predicted_a, predicted_b);

    let vesting_a = factory.create_vesting(
        &owner_a,
        &token_id,
        &salt,
        &String::from_str(&env, "Zarf A"),
        &String::from_str(&env, "Factory deployed"),
        &root_a,
        &audience_hash(&env),
        &1,
        &100,
        &String::from_str(&env, "ipfs://metadata-a"),
    );
    let vesting_b = factory.create_vesting(
        &owner_b,
        &token_id,
        &salt,
        &String::from_str(&env, "Zarf B"),
        &String::from_str(&env, "Factory deployed"),
        &root_b,
        &audience_hash(&env),
        &1,
        &100,
        &String::from_str(&env, "ipfs://metadata-b"),
    );

    assert_eq!(vesting_a, predicted_a);
    assert_eq!(vesting_b, predicted_b);
    assert_eq!(factory.get_owner_deployment_count(&owner_a), 1);
    assert_eq!(factory.get_owner_deployment_count(&owner_b), 1);
}

#[test]
fn same_owner_same_salt_second_deploy_reverts_without_tracking() {
    let env = Env::default();
    let (factory, _factory_id, _verifier, _registry, token_id) = setup(&env);

    let owner = Address::generate(&env);
    let salt = test_salt(&env, 16);
    let root = BytesN::from_array(&env, &[10_u8; 32]);
    // Distinct root for the duplicate so this test still exercises the
    // salt/address collision path rather than the root-uniqueness guard.
    let dup_root = BytesN::from_array(&env, &[11_u8; 32]);
    let metadata = String::from_str(&env, "ipfs://metadata");

    let first = factory.create_vesting(
        &owner,
        &token_id,
        &salt,
        &String::from_str(&env, "Zarf"),
        &String::from_str(&env, "Factory deployed"),
        &root,
        &audience_hash(&env),
        &1,
        &100,
        &metadata,
    );

    let result = factory.try_create_vesting(
        &owner,
        &token_id,
        &salt,
        &String::from_str(&env, "Zarf duplicate"),
        &String::from_str(&env, "Factory deployed"),
        &dup_root,
        &audience_hash(&env),
        &1,
        &100,
        &String::from_str(&env, "ipfs://duplicate"),
    );

    assert!(result.is_err(), "duplicate salt unexpectedly deployed");
    assert_eq!(factory.get_deployment_count(), 1);
    assert_eq!(factory.get_owner_deployment_count(&owner), 1);
    assert_eq!(factory.get_deployment(&0), first);
    assert_eq!(factory.vesting_metadata_cid(&first), metadata);
}

#[test]
fn duplicate_merkle_root_is_rejected_across_campaigns() {
    let env = Env::default();
    let (factory, _factory_id, _verifier, _registry, token_id) = setup(&env);

    let owner_a = Address::generate(&env);
    let owner_b = Address::generate(&env);
    let root = BytesN::from_array(&env, &[42_u8; 32]);

    // First campaign reserves the root.
    let first = factory.create_vesting(
        &owner_a,
        &token_id,
        &test_salt(&env, 20),
        &String::from_str(&env, "Zarf A"),
        &String::from_str(&env, "Factory deployed"),
        &root,
        &audience_hash(&env),
        &1,
        &100,
        &String::from_str(&env, "ipfs://a"),
    );

    // A different owner with a different salt (so the address does NOT
    // collide) cannot reuse the same root — that is the cross-campaign replay
    // vector, and it must be rejected before any deploy or tracking happens.
    let result = factory.try_create_vesting(
        &owner_b,
        &token_id,
        &test_salt(&env, 21),
        &String::from_str(&env, "Zarf B"),
        &String::from_str(&env, "Factory deployed"),
        &root,
        &audience_hash(&env),
        &1,
        &100,
        &String::from_str(&env, "ipfs://b"),
    );

    match result {
        Err(Ok(FactoryError::MerkleRootAlreadyUsed)) => {}
        other => panic!("expected MerkleRootAlreadyUsed, got {:?}", other),
    }

    // Only the first campaign was tracked.
    assert_eq!(factory.get_deployment_count(), 1);
    assert_eq!(factory.get_deployment(&0), first);
    assert_eq!(factory.get_owner_deployment_count(&owner_b), 0);
}

#[test]
fn unfunded_create_vesting_rejects_deferred_zero_root() {
    let env = Env::default();
    let (factory, _factory_id, _verifier, _registry, token_id) = setup(&env);

    let owner = Address::generate(&env);
    let zero_root = BytesN::from_array(&env, &[0_u8; 32]);

    // The unfunded create path no longer accepts a deferred (zero) root: a
    // zero root would skip the UsedRoot reservation, so a later vesting-side
    // `set_merkle_root` could collide with another campaign's root (L-1).
    // Reject up front and track nothing.
    let result = factory.try_create_vesting(
        &owner,
        &token_id,
        &test_salt(&env, 30),
        &String::from_str(&env, "Zarf deferred"),
        &String::from_str(&env, "Factory deployed"),
        &zero_root,
        &audience_hash(&env),
        &1,
        &100,
        &String::from_str(&env, "ipfs://deferred"),
    );

    match result {
        Err(Ok(FactoryError::InvalidMerkleRoot)) => {}
        other => panic!("expected InvalidMerkleRoot, got {:?}", other),
    }
    assert_eq!(factory.get_deployment_count(), 0);
}

#[test]
fn funded_vesting_requires_nonzero_canonical_merkle_root() {
    let env = Env::default();
    let (factory, _factory_id, _verifier, _registry, token_id) = setup(&env);

    let owner = Address::generate(&env);
    let zero_root = BytesN::from_array(&env, &[0_u8; 32]);
    let result = factory.try_create_and_fund_vesting(
        &owner,
        &token_id,
        &test_salt(&env, 15),
        &String::from_str(&env, "Funded Zarf"),
        &String::from_str(&env, "Factory deployed and funded"),
        &zero_root,
        &audience_hash(&env),
        &1,
        &100,
        &String::from_str(&env, "ipfs://funded"),
    );

    match result {
        Err(Ok(FactoryError::InvalidMerkleRoot)) => {}
        other => panic!("unexpected zero root result: {:?}", other),
    }
    assert_eq!(factory.get_deployment_count(), 0);
}

#[test]
fn create_vesting_rejects_non_canonical_root_and_bad_audience_without_tracking() {
    let env = Env::default();
    let (factory, _factory_id, _verifier, _registry, token_id) = setup(&env);

    let owner = Address::generate(&env);
    let good_root = BytesN::from_array(&env, &[10_u8; 32]);
    let zero_audience = BytesN::from_array(&env, &[0_u8; 32]);

    let bad_root = factory.try_create_vesting(
        &owner,
        &token_id,
        &test_salt(&env, 17),
        &String::from_str(&env, "Zarf"),
        &String::from_str(&env, "Factory deployed"),
        &non_canonical_field(&env),
        &audience_hash(&env),
        &1,
        &100,
        &String::from_str(&env, "ipfs://metadata"),
    );
    match bad_root {
        Err(Ok(FactoryError::InvalidMerkleRoot)) => {}
        other => panic!("unexpected non-canonical root result: {:?}", other),
    }

    let zero_aud = factory.try_create_vesting(
        &owner,
        &token_id,
        &test_salt(&env, 18),
        &String::from_str(&env, "Zarf"),
        &String::from_str(&env, "Factory deployed"),
        &good_root,
        &zero_audience,
        &1,
        &100,
        &String::from_str(&env, "ipfs://metadata"),
    );
    match zero_aud {
        Err(Ok(FactoryError::InvalidAudience)) => {}
        other => panic!("unexpected zero audience result: {:?}", other),
    }

    let bad_aud = factory.try_create_vesting(
        &owner,
        &token_id,
        &test_salt(&env, 19),
        &String::from_str(&env, "Zarf"),
        &String::from_str(&env, "Factory deployed"),
        &good_root,
        &non_canonical_field(&env),
        &1,
        &100,
        &String::from_str(&env, "ipfs://metadata"),
    );
    match bad_aud {
        Err(Ok(FactoryError::InvalidAudience)) => {}
        other => panic!("unexpected non-canonical audience result: {:?}", other),
    }

    assert_eq!(factory.get_deployment_count(), 0);
    assert_eq!(factory.get_owner_deployment_count(&owner), 0);
}

#[test]
fn funded_create_rejects_invalid_root_or_audience_without_token_movement() {
    let env = Env::default();
    let (factory, factory_id, _verifier, _registry, token_id) = setup(&env);

    let owner = Address::generate(&env);
    let amount = 500_i128;
    let token_admin = token::StellarAssetClient::new(&env, &token_id);
    let token_client = token::TokenClient::new(&env, &token_id);
    token_admin.mint(&owner, &amount);
    token_client.approve(&owner, &factory_id, &amount, &1000);

    let invalid_root = factory.try_create_and_fund_vesting(
        &owner,
        &token_id,
        &test_salt(&env, 20),
        &String::from_str(&env, "Funded Zarf"),
        &String::from_str(&env, "Factory deployed and funded"),
        &non_canonical_field(&env),
        &audience_hash(&env),
        &1,
        &amount,
        &String::from_str(&env, "ipfs://funded"),
    );
    match invalid_root {
        Err(Ok(FactoryError::InvalidMerkleRoot)) => {}
        other => panic!("unexpected funded invalid root result: {:?}", other),
    }

    let invalid_audience = factory.try_create_and_fund_vesting(
        &owner,
        &token_id,
        &test_salt(&env, 21),
        &String::from_str(&env, "Funded Zarf"),
        &String::from_str(&env, "Factory deployed and funded"),
        &BytesN::from_array(&env, &[10_u8; 32]),
        &non_canonical_field(&env),
        &1,
        &amount,
        &String::from_str(&env, "ipfs://funded"),
    );
    match invalid_audience {
        Err(Ok(FactoryError::InvalidAudience)) => {}
        other => panic!("unexpected funded invalid audience result: {:?}", other),
    }

    assert_eq!(token_client.balance(&owner), amount);
    assert_eq!(factory.get_deployment_count(), 0);
    assert_eq!(factory.get_owner_deployment_count(&owner), 0);
}

#[test]
fn invalid_factory_metadata_rejects_without_tracking() {
    let env = Env::default();
    let (factory, _factory_id, _verifier, _registry, token_id) = setup(&env);

    let owner = Address::generate(&env);
    let salt = test_salt(&env, 12);
    let root = BytesN::from_array(&env, &[10_u8; 32]);
    let result = factory.try_create_vesting(
        &owner,
        &token_id,
        &salt,
        &String::from_str(&env, "Zarf"),
        &String::from_str(&env, "Factory deployed"),
        &root,
        &audience_hash(&env),
        &0,
        &300,
        &String::from_str(&env, "ipfs://metadata"),
    );

    match result {
        Err(Ok(FactoryError::InvalidRecipientCount)) => {}
        other => panic!("unexpected invalid metadata result: {:?}", other),
    }
    assert_eq!(factory.get_deployment_count(), 0);
}

#[test]
fn create_vesting_requires_owner_auth_without_mock_all_auths() {
    let env = Env::default();

    let verifier = Address::generate(&env);
    let registry = Address::generate(&env);
    let owner = Address::generate(&env);
    let upgrade_admin = Address::generate(&env);
    let token_asset = env.register_stellar_asset_contract_v2(owner.clone());
    let token_id = token_asset.address();
    let vesting_wasm_hash = env.deployer().upload_contract_wasm(VESTING_WASM);
    let factory_id = env.register(
        ZarfVestingFactoryContract,
        (verifier, registry, vesting_wasm_hash, upgrade_admin),
    );
    let factory = ZarfVestingFactoryContractClient::new(&env, &factory_id);

    let result = factory.try_create_vesting(
        &owner,
        &token_id,
        &test_salt(&env, 13),
        &String::from_str(&env, "Zarf"),
        &String::from_str(&env, "Factory deployed"),
        &BytesN::from_array(&env, &[8_u8; 32]),
        &audience_hash(&env),
        &1,
        &300,
        &String::from_str(&env, "ipfs://metadata"),
    );

    assert!(
        result.is_err(),
        "unauthenticated create unexpectedly succeeded"
    );
    assert_eq!(factory.get_deployment_count(), 0);
}
