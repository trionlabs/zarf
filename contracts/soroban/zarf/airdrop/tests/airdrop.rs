#![cfg(test)]

//! Unit + integration tests for the MerkleAirdrop instance (doc 11 §6 matrix).
//! The in-test tree builder mirrors the contract's leaf/node hashing (09 §3-4)
//! so claims run against real, contract-verifiable proofs.

use std::vec::Vec as StdVec;

use soroban_sdk::{
    testutils::{Address as _, Ledger},
    token, vec,
    xdr::ToXdr,
    Address, Bytes, BytesN, Env, Vec,
};
use zarf_airdrop_soroban::{Config, Error, MerkleAirdrop, MerkleAirdropClient};

// ---- in-test mirror of the contract's hashing (09 §3-4) ----

fn leaf(env: &Env, index: u32, addr: &Address, amount: i128) -> BytesN<32> {
    let mut buf = Bytes::new(env);
    buf.append(&Bytes::from_array(env, &[0x00]));
    buf.append(&Bytes::from_array(env, &index.to_be_bytes()));
    buf.append(&addr.clone().to_xdr(env));
    buf.append(&Bytes::from_array(env, &amount.to_be_bytes()));
    env.crypto().keccak256(&buf).to_bytes()
}

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

/// Sorted-pair Merkle tree with odd-node promotion. Returns (root, per-leaf proof).
fn build_tree(env: &Env, leaves: &[BytesN<32>]) -> (BytesN<32>, StdVec<StdVec<BytesN<32>>>) {
    let n = leaves.len();
    let mut proofs: StdVec<StdVec<BytesN<32>>> = (0..n).map(|_| StdVec::new()).collect();
    if n == 1 {
        return (leaves[0].clone(), proofs);
    }
    let mut level: StdVec<BytesN<32>> = leaves.to_vec();
    let mut positions: StdVec<usize> = (0..n).collect();
    while level.len() > 1 {
        let mut next: StdVec<BytesN<32>> = StdVec::new();
        let mut i = 0;
        while i < level.len() {
            if i + 1 < level.len() {
                for (orig, &pos) in positions.iter().enumerate() {
                    if pos == i {
                        proofs[orig].push(level[i + 1].clone());
                    } else if pos == i + 1 {
                        proofs[orig].push(level[i].clone());
                    }
                }
                next.push(hash_node(env, &level[i], &level[i + 1]));
            } else {
                next.push(level[i].clone()); // lone node carries up, no sibling
            }
            i += 2;
        }
        for p in positions.iter_mut() {
            *p /= 2;
        }
        level = next;
    }
    (level[0].clone(), proofs)
}

fn soroban_proof(env: &Env, p: &[BytesN<32>]) -> Vec<BytesN<32>> {
    let mut v = Vec::new(env);
    for h in p {
        v.push_back(h.clone());
    }
    v
}

fn balance(env: &Env, token: &Address, who: &Address) -> i128 {
    token::TokenClient::new(env, token).balance(who)
}

// ---- fixture ----

struct Campaign {
    env: Env,
    contract: Address,
    token: Address,
    admin: Address,
    /// (index, address, amount, proof) per recipient.
    recipients: StdVec<(u32, Address, i128, StdVec<BytesN<32>>)>,
}

impl Campaign {
    fn client(&self) -> MerkleAirdropClient<'_> {
        MerkleAirdropClient::new(&self.env, &self.contract)
    }
}

/// Build a token + a Merkle tree over `amounts` (one generated recipient each),
/// deploy the instance, and fund it with the full total. `mock_all_auths` is on.
fn setup(amounts: &[i128], deadline: u64, locked: bool) -> Campaign {
    let env = Env::default();
    env.mock_all_auths();

    let admin = Address::generate(&env);
    let token = env
        .register_stellar_asset_contract_v2(admin.clone())
        .address();

    let mut leaves: StdVec<BytesN<32>> = StdVec::new();
    let mut addrs: StdVec<Address> = StdVec::new();
    let mut total: i128 = 0;
    for (i, amount) in amounts.iter().enumerate() {
        let addr = Address::generate(&env);
        leaves.push(leaf(&env, i as u32, &addr, *amount));
        addrs.push(addr);
        total += *amount;
    }
    let (root, proofs) = build_tree(&env, &leaves);

    let contract = env.register(
        MerkleAirdrop,
        (admin.clone(), token.clone(), root, total, deadline, locked),
    );
    // The factory funds atomically; here we mint the full total to the instance.
    token::StellarAssetClient::new(&env, &token).mint(&contract, &total);

    let recipients = (0..amounts.len())
        .map(|i| (i as u32, addrs[i].clone(), amounts[i], proofs[i].clone()))
        .collect();

    Campaign {
        env,
        contract,
        token,
        admin,
        recipients,
    }
}

// ---- 1-2. constructor ----

#[test]
fn constructor_stores_config() {
    let c = setup(&[100], 0, false);
    let cfg: Config = c.client().config();
    assert_eq!(cfg.admin, c.admin);
    assert_eq!(cfg.token, c.token);
    assert_eq!(cfg.total, 100);
    assert_eq!(cfg.deadline, 0);
    assert!(!cfg.locked);
}

#[test]
#[should_panic]
fn constructor_rejects_zero_total() {
    let env = Env::default();
    let admin = Address::generate(&env);
    let token = env
        .register_stellar_asset_contract_v2(admin.clone())
        .address();
    let root: BytesN<32> = BytesN::from_array(&env, &[7u8; 32]);
    env.register(MerkleAirdrop, (admin, token, root, 0i128, 0u64, false));
}

#[test]
#[should_panic]
fn constructor_rejects_zero_root() {
    let env = Env::default();
    let admin = Address::generate(&env);
    let token = env
        .register_stellar_asset_contract_v2(admin.clone())
        .address();
    let zero: BytesN<32> = BytesN::from_array(&env, &[0u8; 32]);
    env.register(MerkleAirdrop, (admin, token, zero, 100i128, 0u64, false));
}

// ---- 3-6. claim ----

#[test]
fn claim_single_recipient_pays_out() {
    let c = setup(&[1_000], 0, false);
    let (idx, addr, amount, proof) = c.recipients[0].clone();
    c.client()
        .claim(&idx, &addr, &amount, &soroban_proof(&c.env, &proof));
    assert_eq!(balance(&c.env, &c.token, &addr), 1_000);
    assert!(c.client().is_claimed(&0));
}

#[test]
fn claim_twice_is_rejected() {
    let c = setup(&[1_000], 0, false);
    let (idx, addr, amount, proof) = c.recipients[0].clone();
    let p = soroban_proof(&c.env, &proof);
    c.client().claim(&idx, &addr, &amount, &p);
    assert_eq!(
        c.client().try_claim(&idx, &addr, &amount, &p),
        Err(Ok(Error::AlreadyClaimed))
    );
    assert_eq!(balance(&c.env, &c.token, &addr), 1_000); // not paid twice
}

#[test]
fn claim_wrong_amount_is_invalid_proof() {
    let c = setup(&[1_000], 0, false);
    let (idx, addr, _amount, proof) = c.recipients[0].clone();
    assert_eq!(
        c.client()
            .try_claim(&idx, &addr, &999, &soroban_proof(&c.env, &proof)),
        Err(Ok(Error::InvalidProof))
    );
}

#[test]
fn claim_zero_amount_is_invalid_amount() {
    let c = setup(&[1_000], 0, false);
    let (idx, addr, _amount, proof) = c.recipients[0].clone();
    assert_eq!(
        c.client()
            .try_claim(&idx, &addr, &0, &soroban_proof(&c.env, &proof)),
        Err(Ok(Error::InvalidAmount))
    );
}

#[test]
fn claim_after_deadline_is_expired() {
    let c = setup(&[1_000], 500, false);
    c.env.ledger().set_timestamp(1_000); // past the deadline
    let (idx, addr, amount, proof) = c.recipients[0].clone();
    assert_eq!(
        c.client()
            .try_claim(&idx, &addr, &amount, &soroban_proof(&c.env, &proof)),
        Err(Ok(Error::Expired))
    );
}

#[test]
fn claim_multiple_recipients() {
    let c = setup(&[100, 250, 7], 0, false);
    for (idx, addr, amount, proof) in c.recipients.clone() {
        c.client()
            .claim(&idx, &addr, &amount, &soroban_proof(&c.env, &proof));
    }
    for (_, addr, amount, _) in c.recipients.clone() {
        assert_eq!(balance(&c.env, &c.token, &addr), amount);
    }
}

// ---- 12. multi-word bitmap (>128 indices) ----

#[test]
fn bitmap_spans_multiple_words() {
    let amounts: StdVec<i128> = std::vec![10i128; 130];
    let c = setup(&amounts, 0, false);

    for &i in &[5usize, 129usize] {
        let (idx, addr, amount, proof) = c.recipients[i].clone();
        c.client()
            .claim(&idx, &addr, &amount, &soroban_proof(&c.env, &proof));
    }
    assert!(c.client().is_claimed(&5)); // word 0
    assert!(c.client().is_claimed(&129)); // word 1
    assert!(!c.client().is_claimed(&6));
    assert!(!c.client().is_claimed(&128));
}

// ---- 9. withdraw_unclaimed: 4 trust modes ----

#[test]
fn withdraw_unlocked_anytime() {
    let c = setup(&[1_000], 0, false); // locked=false
    let sink = Address::generate(&c.env);
    c.client().withdraw_unclaimed(&sink);
    assert_eq!(balance(&c.env, &c.token, &sink), 1_000);
}

#[test]
fn withdraw_locked_blocked_then_allowed_after_deadline() {
    let c = setup(&[1_000], 500, true); // locked=true, deadline=500
    let sink = Address::generate(&c.env);

    c.env.ledger().set_timestamp(100); // before deadline -> blocked
    assert_eq!(
        c.client().try_withdraw_unclaimed(&sink),
        Err(Ok(Error::NotYetWithdrawable))
    );

    c.env.ledger().set_timestamp(600); // after deadline -> allowed
    c.client().withdraw_unclaimed(&sink);
    assert_eq!(balance(&c.env, &c.token, &sink), 1_000);
}

#[test]
fn withdraw_trustless_always_blocked() {
    let c = setup(&[1_000], 0, true); // locked=true, deadline=0 => trustless
    let sink = Address::generate(&c.env);
    c.env.ledger().set_timestamp(10_000_000);
    assert_eq!(
        c.client().try_withdraw_unclaimed(&sink),
        Err(Ok(Error::NotYetWithdrawable))
    );
}

#[test]
fn withdraw_empty_balance_is_nothing_to_withdraw() {
    let c = setup(&[1_000], 0, false);
    let (idx, addr, amount, proof) = c.recipients[0].clone();
    c.client()
        .claim(&idx, &addr, &amount, &soroban_proof(&c.env, &proof));
    let sink = Address::generate(&c.env);
    assert_eq!(
        c.client().try_withdraw_unclaimed(&sink),
        Err(Ok(Error::NothingToWithdraw))
    );
}

#[test]
fn withdraw_requires_admin_auth() {
    let c = setup(&[1_000], 0, false);
    let sink = Address::generate(&c.env);
    c.client().withdraw_unclaimed(&sink);
    // the admin (not the sink) must have authorized
    assert!(c.env.auths().iter().any(|(addr, _)| *addr == c.admin));
}

// ---- 11. claimed_statuses paging ----

#[test]
fn claimed_statuses_rejects_oversized_limit() {
    let c = setup(&[1_000], 0, false);
    assert_eq!(
        c.client().try_claimed_statuses(&0, &81),
        Err(Ok(Error::InvalidLimit))
    );
    let statuses = c.client().claimed_statuses(&0, &4);
    assert_eq!(statuses, vec![&c.env, false, false, false, false]);
}
