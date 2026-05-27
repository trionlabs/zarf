use soroban_sdk::{testutils::Address as _, Address, BytesN, Env, String, Vec};
use zarf_jwk_registry::{JwkRegistryContract, JwkRegistryContractClient};

fn limbs(env: &Env) -> Vec<BytesN<32>> {
    let mut limbs = Vec::new(env);
    for i in 0..18 {
        let mut raw = [0_u8; 32];
        raw[31] = i + 1;
        limbs.push_back(BytesN::from_array(env, &raw));
    }
    limbs
}

#[test]
fn owner_can_register_and_revoke_key() {
    let env = Env::default();
    env.mock_all_auths();

    let owner = Address::generate(&env);
    let id = env.register(JwkRegistryContract, (owner.clone(),));
    let client = JwkRegistryContractClient::new(&env, &id);
    let kid = String::from_str(&env, "google-key-1");
    let limbs = limbs(&env);

    let key_hash = client.compute_key_hash(&limbs);
    assert!(!client.is_valid_key_hash(&key_hash));

    let registered = client.register_key(&kid, &limbs);
    assert_eq!(registered, key_hash);
    assert!(client.is_valid_key_hash(&key_hash));
    assert!(client.is_valid_key(&limbs));
    assert!(client.is_kid_registered(&kid));
    assert_eq!(client.get_registered_key_count(), 1);
    assert_eq!(client.get_registered_key(&0), key_hash);

    client.revoke_key(&key_hash);
    assert!(!client.is_valid_key_hash(&key_hash));
    assert!(!client.is_kid_registered(&kid));
}

#[test]
fn owner_can_register_precomputed_key_hash() {
    let env = Env::default();
    env.mock_all_auths();

    let owner = Address::generate(&env);
    let id = env.register(JwkRegistryContract, (owner.clone(),));
    let client = JwkRegistryContractClient::new(&env, &id);
    let kid = String::from_str(&env, "google-key-hash");
    let key_hash = BytesN::from_array(&env, &[42_u8; 32]);

    let registered = client.register_key_hash(&kid, &key_hash);
    assert_eq!(registered, key_hash);
    assert!(client.is_valid_key_hash(&key_hash));
    assert!(client.is_kid_registered(&kid));
    assert_eq!(client.get_registered_key_count(), 1);
}

#[test]
fn key_mutations_require_owner_auth_without_mock_all_auths() {
    let env = Env::default();

    let owner = Address::generate(&env);
    let id = env.register(JwkRegistryContract, (owner.clone(),));
    let client = JwkRegistryContractClient::new(&env, &id);
    let kid = String::from_str(&env, "google-key-1");
    let limbs = limbs(&env);
    let key_hash = client.compute_key_hash(&limbs);

    assert!(client.try_register_key(&kid, &limbs).is_err());
    assert!(!client.is_valid_key_hash(&key_hash));
    assert!(!client.is_kid_registered(&kid));
    assert_eq!(client.get_registered_key_count(), 0);

    assert!(client.try_register_key_hash(&kid, &key_hash).is_err());
    assert!(!client.is_valid_key_hash(&key_hash));
    assert!(!client.is_kid_registered(&kid));
    assert_eq!(client.get_registered_key_count(), 0);
}
