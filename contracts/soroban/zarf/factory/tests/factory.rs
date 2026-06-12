use soroban_sdk::{
    testutils::{
        storage::{Instance, Persistent},
        Address as _,
    },
    token, Address, BytesN, Env, String,
};
use zarf_vesting_factory_soroban::{
    DataKey, DeploymentInfo, Error as FactoryError, ZarfVestingFactoryContract,
    ZarfVestingFactoryContractClient, MAX_PAGE_LIMIT, TTL_EXTEND_TO,
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

fn test_salt(env: &Env, n: u8) -> BytesN<32> {
    BytesN::from_array(env, &[n; 32])
}

fn audience_hash(env: &Env) -> BytesN<32> {
    BytesN::from_array(env, &[6_u8; 32])
}

fn non_canonical_field(env: &Env) -> BytesN<32> {
    BytesN::from_array(env, &BN254_SCALAR_MODULUS_TEST)
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
    let token_asset = env.register_stellar_asset_contract_v2(owner.clone());
    let token = token_asset.address();
    let vesting_wasm_hash = env.deployer().upload_contract_wasm(VESTING_WASM);
    let factory_id = env.register(
        ZarfVestingFactoryContract,
        (verifier.clone(), registry.clone(), vesting_wasm_hash),
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
        &root,
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
    let token_asset = env.register_stellar_asset_contract_v2(owner.clone());
    let token_id = token_asset.address();
    let vesting_wasm_hash = env.deployer().upload_contract_wasm(VESTING_WASM);
    let factory_id = env.register(
        ZarfVestingFactoryContract,
        (verifier, registry, vesting_wasm_hash),
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
