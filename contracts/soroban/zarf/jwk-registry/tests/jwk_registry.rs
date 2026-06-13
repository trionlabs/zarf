use soroban_sdk::{
    testutils::{
        storage::{Instance, Persistent},
        Address as _, Ledger, MockAuth, MockAuthInvoke,
    },
    Address, BytesN, Env, IntoVal, String, Vec,
};
use zarf_jwk_registry::{
    DataKey, Error as RegistryError, JwkRegistryContract, JwkRegistryContractClient,
    DAY_IN_LEDGERS, MAX_ACTIVATION_DELAY_SECS, TTL_EXTEND_TO,
};

const DELAY_SECS: u64 = 6 * 3600;

#[test]
#[should_panic]
fn constructor_rejects_activation_delay_over_max() {
    // An activation delay above the hard ceiling is now a typed
    // `InvalidActivationDelay`, not an untyped panic. A constructor that
    // returns Err traps the deployment, so registration fails here.
    let env = Env::default();
    let owner = Address::generate(&env);
    env.register(JwkRegistryContract, (owner, MAX_ACTIVATION_DELAY_SECS + 1));
}

/// Limbs shaped like a real 2048-bit RSA modulus in 18x120-bit little-endian
/// limb order: every limb < 2^120, limb 0 odd, top limb in [2^7, 2^8).
fn limbs(env: &Env) -> Vec<BytesN<32>> {
    limbs_with_seed(env, 1)
}

fn limbs_with_seed(env: &Env, seed: u8) -> Vec<BytesN<32>> {
    let mut limbs = Vec::new(env);
    for i in 0..18_u32 {
        let mut raw = [0_u8; 32];
        raw[31] = match i {
            0 => seed | 1, // modulus must be odd
            17 => 0x80,    // exactly 2048 bits
            _ => seed.wrapping_add(i as u8) | 1,
        };
        limbs.push_back(BytesN::from_array(env, &raw));
    }
    limbs
}

fn limbs_with_len(env: &Env, len: u32) -> Vec<BytesN<32>> {
    let mut limbs = Vec::new(env);
    for i in 0..len {
        let mut raw = [0_u8; 32];
        raw[31] = (i + 1) as u8 | 1;
        if i == len.saturating_sub(1) {
            raw[31] = 0x80;
        }
        limbs.push_back(BytesN::from_array(env, &raw));
    }
    limbs
}

fn setup(env: &Env) -> (Address, Address, JwkRegistryContractClient<'_>) {
    let owner = Address::generate(env);
    let id = env.register(JwkRegistryContract, (owner.clone(), DELAY_SECS));
    let client = JwkRegistryContractClient::new(env, &id);
    (owner, id.clone(), client)
}

#[test]
fn owner_can_register_and_revoke_key() {
    let env = Env::default();
    env.mock_all_auths();

    let (_owner, _id, client) = setup(&env);
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

    let (_owner, id, client) = setup(&env);
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

    let (_owner, id, client) = setup(&env);
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

    let (_owner, _id, client) = setup(&env);
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

    let (_owner, _id, client) = setup(&env);

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

#[test]
fn register_key_rejects_malformed_moduli() {
    let env = Env::default();
    env.mock_all_auths();

    let (_owner, _id, client) = setup(&env);
    let kid = String::from_str(&env, "bad-key");

    // Limb exceeding 120 bits: a byte set inside the zero prefix.
    let mut oversized = limbs(&env);
    let mut raw = [0_u8; 32];
    raw[16] = 1; // bit 127 region — beyond 120 bits
    raw[31] = 0x03;
    oversized.set(3, BytesN::from_array(&env, &raw));

    // Modulus shorter than 2048 bits: top limb without its high bit.
    let mut short = limbs(&env);
    let mut raw = [0_u8; 32];
    raw[31] = 0x7f;
    short.set(17, BytesN::from_array(&env, &raw));

    // Even modulus.
    let mut even = limbs(&env);
    let mut raw = [0_u8; 32];
    raw[31] = 0x02;
    even.set(0, BytesN::from_array(&env, &raw));

    for (label, bad) in [("oversized", oversized), ("short", short), ("even", even)] {
        match client.try_register_key(&kid, &bad) {
            Err(Ok(RegistryError::InvalidModulus)) => {}
            other => panic!("expected InvalidModulus for {label}, got {:?}", other),
        }
    }
    assert_eq!(client.get_registered_key_count(), 0);
}

#[test]
fn revoke_nonexistent_key_returns_key_not_found() {
    let env = Env::default();
    env.mock_all_auths();

    let (_owner, _id, client) = setup(&env);
    let missing = BytesN::from_array(&env, &[9_u8; 32]);
    match client.try_revoke_key(&missing) {
        Err(Ok(RegistryError::KeyNotFound)) => {}
        other => panic!("expected KeyNotFound, got {:?}", other),
    }
}

#[test]
fn re_register_after_revoke_reuses_enumeration_slot() {
    // Regression for the duplicate-KeyAt bug: revoking then re-registering a
    // key must not append a second enumeration slot for the same hash.
    let env = Env::default();
    env.mock_all_auths();

    let (_owner, _id, client) = setup(&env);
    let kid = String::from_str(&env, "google-key-1");
    let limbs = limbs(&env);

    let key_hash = client.register_key(&kid, &limbs);
    client.revoke_key(&key_hash);
    assert!(!client.is_valid_key_hash(&key_hash));

    let re_registered = client.register_key(&kid, &limbs);
    assert_eq!(re_registered, key_hash);
    assert!(client.is_valid_key_hash(&key_hash));
    assert_eq!(client.get_registered_key_count(), 1);
    assert_eq!(client.get_registered_key(&0), key_hash);
}

#[test]
fn two_step_ownership_moves_registration_rights() {
    let env = Env::default();

    let owner = Address::generate(&env);
    let new_owner = Address::generate(&env);
    let id = env.register(JwkRegistryContract, (owner.clone(), DELAY_SECS));
    let client = JwkRegistryContractClient::new(&env, &id);
    let kid = String::from_str(&env, "google-key-1");
    let limbs = limbs(&env);

    // Non-owner cannot propose a successor.
    assert!(client
        .mock_auths(&[MockAuth {
            address: &new_owner,
            invoke: &MockAuthInvoke {
                contract: &id,
                fn_name: "propose_owner",
                args: (&new_owner,).into_val(&env),
                sub_invokes: &[],
            },
        }])
        .try_propose_owner(&new_owner)
        .is_err());

    // Owner proposes the successor; ownership has NOT moved yet.
    client
        .mock_auths(&[MockAuth {
            address: &owner,
            invoke: &MockAuthInvoke {
                contract: &id,
                fn_name: "propose_owner",
                args: (&new_owner,).into_val(&env),
                sub_invokes: &[],
            },
        }])
        .propose_owner(&new_owner);
    assert_eq!(client.owner(), owner);
    assert_eq!(client.pending_owner(), Some(new_owner.clone()));

    // A third party cannot accept; only the nominee can.
    let stranger = Address::generate(&env);
    assert!(client
        .mock_auths(&[MockAuth {
            address: &stranger,
            invoke: &MockAuthInvoke {
                contract: &id,
                fn_name: "accept_ownership",
                args: ().into_val(&env),
                sub_invokes: &[],
            },
        }])
        .try_accept_ownership()
        .is_err());
    assert_eq!(client.owner(), owner);

    // The nominee accepts — only now does ownership move.
    client
        .mock_auths(&[MockAuth {
            address: &new_owner,
            invoke: &MockAuthInvoke {
                contract: &id,
                fn_name: "accept_ownership",
                args: ().into_val(&env),
                sub_invokes: &[],
            },
        }])
        .accept_ownership();
    assert_eq!(client.owner(), new_owner);
    assert_eq!(client.pending_owner(), None);

    // The old owner can no longer register keys.
    assert!(client
        .mock_auths(&[MockAuth {
            address: &owner,
            invoke: &MockAuthInvoke {
                contract: &id,
                fn_name: "register_key",
                args: (&kid, &limbs).into_val(&env),
                sub_invokes: &[],
            },
        }])
        .try_register_key(&kid, &limbs)
        .is_err());

    // The new owner can.
    client
        .mock_auths(&[MockAuth {
            address: &new_owner,
            invoke: &MockAuthInvoke {
                contract: &id,
                fn_name: "register_key",
                args: (&kid, &limbs).into_val(&env),
                sub_invokes: &[],
            },
        }])
        .register_key(&kid, &limbs);
    assert!(client.is_kid_registered(&kid));
}

#[test]
fn cancel_ownership_transfer_aborts_handover() {
    let env = Env::default();

    let owner = Address::generate(&env);
    let nominee = Address::generate(&env);
    let stranger = Address::generate(&env);
    let id = env.register(JwkRegistryContract, (owner.clone(), DELAY_SECS));
    let client = JwkRegistryContractClient::new(&env, &id);

    // Owner proposes a successor.
    client
        .mock_auths(&[MockAuth {
            address: &owner,
            invoke: &MockAuthInvoke {
                contract: &id,
                fn_name: "propose_owner",
                args: (&nominee,).into_val(&env),
                sub_invokes: &[],
            },
        }])
        .propose_owner(&nominee);
    assert_eq!(client.pending_owner(), Some(nominee.clone()));

    // A non-owner cannot abort the handover.
    assert!(client
        .mock_auths(&[MockAuth {
            address: &stranger,
            invoke: &MockAuthInvoke {
                contract: &id,
                fn_name: "cancel_ownership_transfer",
                args: ().into_val(&env),
                sub_invokes: &[],
            },
        }])
        .try_cancel_ownership_transfer()
        .is_err());
    assert_eq!(client.pending_owner(), Some(nominee.clone()));

    // The owner aborts it: the nomination clears and ownership is unchanged.
    client
        .mock_auths(&[MockAuth {
            address: &owner,
            invoke: &MockAuthInvoke {
                contract: &id,
                fn_name: "cancel_ownership_transfer",
                args: ().into_val(&env),
                sub_invokes: &[],
            },
        }])
        .cancel_ownership_transfer();
    assert_eq!(client.pending_owner(), None);
    assert_eq!(client.owner(), owner);

    // The cancelled nominee can no longer accept — the handover is gone.
    match client
        .mock_auths(&[MockAuth {
            address: &nominee,
            invoke: &MockAuthInvoke {
                contract: &id,
                fn_name: "accept_ownership",
                args: ().into_val(&env),
                sub_invokes: &[],
            },
        }])
        .try_accept_ownership()
    {
        Err(Ok(RegistryError::PendingOwnerNotSet)) => {}
        other => panic!("expected PendingOwnerNotSet after cancel, got {:?}", other),
    }
}

#[test]
fn accept_or_cancel_without_pending_nominee_errs() {
    let env = Env::default();
    env.mock_all_auths();

    let (_owner, _id, client) = setup(&env);
    assert_eq!(client.pending_owner(), None);

    match client.try_accept_ownership() {
        Err(Ok(RegistryError::PendingOwnerNotSet)) => {}
        other => panic!("expected PendingOwnerNotSet on accept, got {:?}", other),
    }
    match client.try_cancel_ownership_transfer() {
        Err(Ok(RegistryError::PendingOwnerNotSet)) => {}
        other => panic!("expected PendingOwnerNotSet on cancel, got {:?}", other),
    }
}

#[test]
fn re_propose_overwrites_pending_nominee() {
    let env = Env::default();
    env.mock_all_auths();

    let (_owner, _id, client) = setup(&env);
    let first = Address::generate(&env);
    let second = Address::generate(&env);

    client.propose_owner(&first);
    assert_eq!(client.pending_owner(), Some(first.clone()));

    // Re-proposing replaces the nominee outright; the first is discarded.
    client.propose_owner(&second);
    assert_eq!(client.pending_owner(), Some(second.clone()));

    // Only the current nominee can be installed by accept.
    client.accept_ownership();
    assert_eq!(client.owner(), second);
    assert_eq!(client.pending_owner(), None);
}

#[test]
fn propose_then_activate_after_delay() {
    let env = Env::default();
    env.mock_all_auths();

    let (_owner, _id, client) = setup(&env);
    let operator = Address::generate(&env);
    client.set_operator(&operator);

    let kid = String::from_str(&env, "google-key-1");
    let limbs = limbs(&env);
    let key_hash = client.propose_key(&kid, &limbs);

    // Proposed but not active.
    assert!(!client.is_valid_key_hash(&key_hash));
    let pending = client.get_pending(&key_hash).unwrap();
    assert_eq!(pending.kid, kid);
    assert_eq!(client.get_pending_count(), 1);
    assert_eq!(client.get_pending_at(&0), key_hash);

    // Too early.
    match client.try_activate_key(&key_hash) {
        Err(Ok(RegistryError::ActivationDelayNotElapsed)) => {}
        other => panic!("expected ActivationDelayNotElapsed, got {:?}", other),
    }

    env.ledger().with_mut(|l| l.timestamp += DELAY_SECS + 1);

    // Anyone can activate once the delay elapsed (auth-free call).
    client.activate_key(&key_hash);
    assert!(client.is_valid_key_hash(&key_hash));
    assert!(client.is_kid_registered(&kid));
    assert_eq!(client.get_pending_count(), 0);
    assert!(client.get_pending(&key_hash).is_none());
}

#[test]
fn operator_cannot_bypass_the_delay() {
    let env = Env::default();

    let owner = Address::generate(&env);
    let operator = Address::generate(&env);
    let id = env.register(JwkRegistryContract, (owner.clone(), DELAY_SECS));
    let client = JwkRegistryContractClient::new(&env, &id);
    let kid = String::from_str(&env, "google-key-1");
    let limbs = limbs(&env);

    client
        .mock_auths(&[MockAuth {
            address: &owner,
            invoke: &MockAuthInvoke {
                contract: &id,
                fn_name: "set_operator",
                args: (&operator,).into_val(&env),
                sub_invokes: &[],
            },
        }])
        .set_operator(&operator);

    // The operator's signature does NOT satisfy register_key (owner-only).
    assert!(client
        .mock_auths(&[MockAuth {
            address: &operator,
            invoke: &MockAuthInvoke {
                contract: &id,
                fn_name: "register_key",
                args: (&kid, &limbs).into_val(&env),
                sub_invokes: &[],
            },
        }])
        .try_register_key(&kid, &limbs)
        .is_err());

    // It does satisfy propose_key — which stays timelocked.
    let key_hash = client
        .mock_auths(&[MockAuth {
            address: &operator,
            invoke: &MockAuthInvoke {
                contract: &id,
                fn_name: "propose_key",
                args: (&kid, &limbs).into_val(&env),
                sub_invokes: &[],
            },
        }])
        .propose_key(&kid, &limbs);
    assert!(!client.is_valid_key_hash(&key_hash));
    match client.try_activate_key(&key_hash) {
        Err(Ok(RegistryError::ActivationDelayNotElapsed)) => {}
        other => panic!("expected ActivationDelayNotElapsed, got {:?}", other),
    }
}

#[test]
fn owner_can_cancel_a_pending_key() {
    let env = Env::default();
    env.mock_all_auths();

    let (_owner, _id, client) = setup(&env);
    let operator = Address::generate(&env);
    client.set_operator(&operator);

    let kid = String::from_str(&env, "google-key-1");
    let limbs = limbs(&env);
    let key_hash = client.propose_key(&kid, &limbs);
    assert_eq!(client.get_pending_count(), 1);

    client.cancel_pending(&key_hash);
    assert_eq!(client.get_pending_count(), 0);
    assert!(client.get_pending(&key_hash).is_none());

    env.ledger().with_mut(|l| l.timestamp += DELAY_SECS + 1);
    match client.try_activate_key(&key_hash) {
        Err(Ok(RegistryError::PendingNotFound)) => {}
        other => panic!("expected PendingNotFound after cancel, got {:?}", other),
    }
    assert!(!client.is_valid_key_hash(&key_hash));
}

#[test]
fn pending_enumeration_swap_removes() {
    let env = Env::default();
    env.mock_all_auths();

    let (_owner, _id, client) = setup(&env);
    let operator = Address::generate(&env);
    client.set_operator(&operator);

    let first = client.propose_key(&String::from_str(&env, "k1"), &limbs_with_seed(&env, 1));
    let second = client.propose_key(&String::from_str(&env, "k2"), &limbs_with_seed(&env, 33));
    assert_ne!(first, second);
    assert_eq!(client.get_pending_count(), 2);

    client.cancel_pending(&first);
    assert_eq!(client.get_pending_count(), 1);
    assert_eq!(client.get_pending_at(&0), second);
    assert!(client.try_get_pending_at(&1).is_err());
}

#[test]
fn operator_can_revoke_but_propose_requires_operator() {
    let env = Env::default();

    let owner = Address::generate(&env);
    let operator = Address::generate(&env);
    let id = env.register(JwkRegistryContract, (owner.clone(), DELAY_SECS));
    let client = JwkRegistryContractClient::new(&env, &id);
    let kid = String::from_str(&env, "google-key-1");
    let limbs = limbs(&env);

    // Without an operator configured, propose_key fails closed.
    match client
        .mock_auths(&[MockAuth {
            address: &operator,
            invoke: &MockAuthInvoke {
                contract: &id,
                fn_name: "propose_key",
                args: (&kid, &limbs).into_val(&env),
                sub_invokes: &[],
            },
        }])
        .try_propose_key(&kid, &limbs)
    {
        Err(Ok(RegistryError::OperatorNotSet)) => {}
        other => panic!("expected OperatorNotSet, got {:?}", other),
    }

    client
        .mock_auths(&[MockAuth {
            address: &owner,
            invoke: &MockAuthInvoke {
                contract: &id,
                fn_name: "set_operator",
                args: (&operator,).into_val(&env),
                sub_invokes: &[],
            },
        }])
        .set_operator(&operator);

    let key_hash = client
        .mock_auths(&[MockAuth {
            address: &owner,
            invoke: &MockAuthInvoke {
                contract: &id,
                fn_name: "register_key",
                args: (&kid, &limbs).into_val(&env),
                sub_invokes: &[],
            },
        }])
        .register_key(&kid, &limbs);
    assert!(client.is_valid_key_hash(&key_hash));

    // Operator may revoke immediately (fail-safe direction)...
    client
        .mock_auths(&[MockAuth {
            address: &operator,
            invoke: &MockAuthInvoke {
                contract: &id,
                fn_name: "operator_revoke_key",
                args: (&key_hash,).into_val(&env),
                sub_invokes: &[],
            },
        }])
        .operator_revoke_key(&key_hash);
    assert!(!client.is_valid_key_hash(&key_hash));

    // ...but a random key cannot.
    let stranger = Address::generate(&env);
    assert!(client
        .mock_auths(&[MockAuth {
            address: &stranger,
            invoke: &MockAuthInvoke {
                contract: &id,
                fn_name: "operator_revoke_key",
                args: (&key_hash,).into_val(&env),
                sub_invokes: &[],
            },
        }])
        .try_operator_revoke_key(&key_hash)
        .is_err());
}

#[test]
fn owner_register_overrides_a_pending_proposal() {
    // Emergency path: an owner registration of a proposed key clears the
    // pending entry so it cannot later "re-activate" state confusingly.
    let env = Env::default();
    env.mock_all_auths();

    let (_owner, _id, client) = setup(&env);
    let operator = Address::generate(&env);
    client.set_operator(&operator);

    let kid = String::from_str(&env, "google-key-1");
    let limbs = limbs(&env);
    let key_hash = client.propose_key(&kid, &limbs);
    assert_eq!(client.get_pending_count(), 1);

    client.register_key(&kid, &limbs);
    assert!(client.is_valid_key_hash(&key_hash));
    assert_eq!(client.get_pending_count(), 0);
    assert!(client.get_pending(&key_hash).is_none());
}
