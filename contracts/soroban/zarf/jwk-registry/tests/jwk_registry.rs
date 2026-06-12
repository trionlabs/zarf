use soroban_sdk::{
    testutils::{
        storage::{Instance, Persistent},
        Address as _, Ledger,
    },
    Address, BytesN, Env, String, Vec,
};
use zarf_jwk_registry::{
    DataKey, Error as RegistryError, JwkRegistryContract, JwkRegistryContractClient,
    DAY_IN_LEDGERS, TTL_EXTEND_TO,
};

fn limbs(env: &Env) -> Vec<BytesN<32>> {
    limbs_with_len(env, 18)
}

fn limbs_with_len(env: &Env, len: u32) -> Vec<BytesN<32>> {
    let mut limbs = Vec::new(env);
    for i in 0..len {
        let mut raw = [0_u8; 32];
        raw[31] = (i + 1) as u8;
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
fn register_and_revoke_extend_key_entry_and_instance_ttls() {
    let env = Env::default();
    env.mock_all_auths();

    let owner = Address::generate(&env);
    let id = env.register(JwkRegistryContract, (owner.clone(),));
    let client = JwkRegistryContractClient::new(&env, &id);
    let kid = String::from_str(&env, "google-key-1");
    let limbs = limbs(&env);

    let key_hash = client.register_key(&kid, &limbs);

    let keys = [
        DataKey::Key(key_hash.clone()),
        DataKey::Kid(kid.clone()),
        DataKey::KeyAt(0),
    ];
    for key in keys {
        let ttl = env.as_contract(&id, || env.storage().persistent().get_ttl(&key));
        assert_eq!(ttl, TTL_EXTEND_TO, "ttl not extended for {:?}", key);
    }

    let instance_ttl = env.as_contract(&id, || env.storage().instance().get_ttl());
    assert_eq!(instance_ttl, TTL_EXTEND_TO);

    client.revoke_key(&key_hash);
    let revoked_ttl = env.as_contract(&id, || {
        env.storage()
            .persistent()
            .get_ttl(&DataKey::Key(key_hash.clone()))
    });
    assert_eq!(revoked_ttl, TTL_EXTEND_TO);
    assert!(!client.is_valid_key_hash(&key_hash));
}

#[test]
fn re_register_re_extends_decayed_enumeration_entry_ttl() {
    // The rotation job re-registers live keys daily; that touch must keep the
    // KeyAt/KeyIndex enumeration entries alive, or get_registered_key breaks
    // once they archive while Key/Kid stay live.
    let env = Env::default();
    env.mock_all_auths();

    let owner = Address::generate(&env);
    let id = env.register(JwkRegistryContract, (owner.clone(),));
    let client = JwkRegistryContractClient::new(&env, &id);
    let kid = String::from_str(&env, "google-key-1");
    let limbs = limbs(&env);

    let key_hash = client.register_key(&kid, &limbs);

    env.ledger()
        .with_mut(|ledger| ledger.sequence_number += DAY_IN_LEDGERS + 1);

    client.register_key(&kid, &limbs);
    assert_eq!(client.get_registered_key_count(), 1);

    let keys = [
        DataKey::KeyAt(0),
        DataKey::KeyIndex(key_hash.clone()),
        DataKey::Key(key_hash.clone()),
        DataKey::Kid(kid.clone()),
    ];
    for key in keys {
        let ttl = env.as_contract(&id, || env.storage().persistent().get_ttl(&key));
        assert_eq!(ttl, TTL_EXTEND_TO, "ttl not re-extended for {:?}", key);
    }
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
}

#[test]
fn register_key_rejects_wrong_limb_lengths_without_state_changes() {
    let env = Env::default();
    env.mock_all_auths();

    let owner = Address::generate(&env);
    let id = env.register(JwkRegistryContract, (owner.clone(),));
    let client = JwkRegistryContractClient::new(&env, &id);

    for (kid, len) in [("short-key", 17_u32), ("long-key", 19_u32)] {
        let result =
            client.try_register_key(&String::from_str(&env, kid), &limbs_with_len(&env, len));
        match result {
            Err(Ok(RegistryError::InvalidKeyLength)) => {}
            other => panic!("unexpected key length result for {kid}: {:?}", other),
        }
        assert!(!client.is_kid_registered(&String::from_str(&env, kid)));
        assert_eq!(client.get_registered_key_count(), 0);
    }
}
