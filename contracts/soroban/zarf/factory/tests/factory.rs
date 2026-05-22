use soroban_sdk::{testutils::Address as _, token, Address, BytesN, Env, String};
use zarf_vesting_factory_soroban::{ZarfVestingFactoryContract, ZarfVestingFactoryContractClient};

const VESTING_WASM: &[u8] =
    include_bytes!("../../vesting/target/wasm32v1-none/release/zarf_vesting_soroban.wasm");

mod vesting {
    soroban_sdk::contractimport!(
        file = "../vesting/target/wasm32v1-none/release/zarf_vesting_soroban.wasm"
    );
}

fn test_salt(env: &Env, n: u8) -> BytesN<32> {
    BytesN::from_array(env, &[n; 32])
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

    let predicted = factory.predict_vesting_address(&salt);
    let vesting = factory.create_vesting(
        &owner,
        &token_id,
        &salt,
        &String::from_str(&env, "Zarf"),
        &String::from_str(&env, "Factory deployed"),
        &root,
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
        &1,
        &amount,
        &String::from_str(&env, "ipfs://funded"),
    );

    assert_eq!(token_client.balance(&vesting), amount);
    assert_eq!(factory.get_deployment_count(), 1);
    assert_eq!(factory.get_deployment(&0), vesting);
}
