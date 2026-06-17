#![cfg(test)]

//! Unit + integration tests for the MerkleAirdrop instance (doc 11 §6 matrix).
//! The in-test tree builder mirrors the contract's leaf/node hashing (09 §3-4)
//! so claims run against real, contract-verifiable proofs.

use std::vec::Vec as StdVec;

use soroban_sdk::{
    testutils::{
        storage::{Instance, Persistent},
        Address as _, Events as _, Ledger, MockAuth, MockAuthInvoke,
    },
    token, vec,
    xdr::ToXdr,
    Address, Bytes, BytesN, Env, Event, IntoVal, Vec,
};
use zarf_airdrop_soroban::{
    Claimed, Config, DataKey, Error, MerkleAirdrop, MerkleAirdropClient, Withdrawn, TTL_EXTEND_TO,
};

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

#[test]
#[should_panic]
fn constructor_rejects_past_deadline() {
    // Defense in depth (the factory guards this too): a direct deploy with a
    // deadline at or before `now` is born-expired -> InvalidDeadline. Pins the
    // boundary at equality (`deadline <= now`), matching the factory's gate.
    let env = Env::default();
    env.ledger().set_timestamp(1_000);
    let admin = Address::generate(&env);
    let token = env
        .register_stellar_asset_contract_v2(admin.clone())
        .address();
    let root: BytesN<32> = BytesN::from_array(&env, &[7u8; 32]);
    env.register(
        MerkleAirdrop,
        (admin, token, root, 100i128, 1_000u64, false),
    );
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

// ============================================================================
// M8 (T3.5) — negatif-auth + fee-on-transfer + event/TTL corpus.
//
// The 17 tests above run under `mock_all_auths` + a faithful SAC, so three
// load-bearing guards are never exercised by them: the claimant/admin auth
// gates (lib.rs claim:162 / withdraw:198), the claim balance-guard + rollback
// (lib.rs:177-182), and the Claimed/Withdrawn events + ClaimedWord/instance
// TTL extends. `cargo mutants` can only mark a guard CAUGHT if some test fails
// when the guard is removed — so these catching tests are authored BEFORE the
// mutation pass (M8 plan D30: authoring-before-measuring).
// ============================================================================

/// In-test fee-on-transfer token. The instance pays out via `transfer`, so this
/// mock credits the recipient one unit SHORT, tripping the claim balance-guard
/// (`after_claimant != before_claimant + amount`) — the contract then rolls the
/// claimed bit back and returns `TokenTransferMismatch`. A real SAC always moves
/// the exact amount, so a custom mock is the only way to exercise that path.
/// (Mirror of the factory's `transfer_from` fee mock, adapted to `transfer`.)
mod fee_token {
    use soroban_sdk::{contract, contractimpl, Address, Env, MuxedAddress};

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
        pub fn transfer(env: Env, from: Address, to: MuxedAddress, amount: i128) {
            let base = to.address(); // base G... carries the balance
            let fb: i128 = env.storage().instance().get(&from).unwrap_or(0);
            env.storage().instance().set(&from, &(fb - amount));
            let tb: i128 = env.storage().instance().get(&base).unwrap_or(0);
            env.storage().instance().set(&base, &(tb + amount - 1)); // short-credit
        }
    }
}
use fee_token::{FeeOnTransferToken, FeeOnTransferTokenClient};

// ---- auth gates (selective mock_auths, not blanket mock_all_auths) ----

#[test]
fn claim_without_claimant_auth_rejected() {
    let c = setup(&[1_000], 0, false);
    let (idx, addr, amount, proof) = c.recipients[0].clone();
    let p = soroban_proof(&c.env, &proof);

    // Replace the blanket mock with an allow-list that OMITS the claimant, so
    // `claimant.require_auth()` (lib.rs:162) has nothing to satisfy it. If a
    // mutant deletes that line the proof-valid claim would succeed -> CAUGHT.
    let stranger = Address::generate(&c.env);
    c.env.mock_auths(&[MockAuth {
        address: &stranger,
        invoke: &MockAuthInvoke {
            contract: &c.contract,
            fn_name: "claim",
            args: (idx, addr.clone(), amount, p.clone()).into_val(&c.env),
            sub_invokes: &[],
        },
    }]);

    assert!(c.client().try_claim(&idx, &addr, &amount, &p).is_err());
    assert!(!c.client().is_claimed(&0)); // auth runs before set_claimed
}

#[test]
fn withdraw_by_non_admin_rejected() {
    let c = setup(&[1_000], 0, false); // unlocked: only the admin gate stands
    let sink = Address::generate(&c.env);

    // Authorize a stranger, never the admin -> `cfg.admin.require_auth()`
    // (lib.rs:198) fails. Deleting that line would let the sweep through -> CAUGHT.
    let stranger = Address::generate(&c.env);
    c.env.mock_auths(&[MockAuth {
        address: &stranger,
        invoke: &MockAuthInvoke {
            contract: &c.contract,
            fn_name: "withdraw_unclaimed",
            args: (sink.clone(),).into_val(&c.env),
            sub_invokes: &[],
        },
    }]);

    assert!(c.client().try_withdraw_unclaimed(&sink).is_err());
    assert_eq!(balance(&c.env, &c.token, &sink), 0); // nothing moved
}

// ---- balance-guard + rollback (fee-on-transfer) ----

#[test]
fn claim_fee_on_transfer_short_credit_rolls_back() {
    let env = Env::default();
    env.mock_all_auths();

    let token = env.register(FeeOnTransferToken, ());
    let amount: i128 = 1_000;
    let claimant = Address::generate(&env);
    // Single leaf: root == leaf, empty proof.
    let (root, proofs) = build_tree(&env, &[leaf(&env, 0, &claimant, amount)]);

    let admin = Address::generate(&env);
    let contract = env.register(
        MerkleAirdrop,
        (admin, token.clone(), root, amount, 0u64, false),
    );
    FeeOnTransferTokenClient::new(&env, &token).mint(&contract, &amount);

    let client = MerkleAirdropClient::new(&env, &contract);
    let p = soroban_proof(&env, &proofs[0]);
    assert_eq!(
        client.try_claim(&0, &claimant, &amount, &p),
        Err(Ok(Error::TokenTransferMismatch))
    );
    assert!(!client.is_claimed(&0)); // rolled back (lib.rs:180)
    assert_eq!(balance(&env, &token, &claimant), 0); // recipient never credited
}

// ---- events ----

#[test]
fn claim_emits_claimed_event() {
    let c = setup(&[1_000], 0, false);
    let (idx, addr, amount, proof) = c.recipients[0].clone();
    c.client()
        .claim(&idx, &addr, &amount, &soroban_proof(&c.env, &proof));

    let expected = Claimed {
        to: addr.clone(),
        index: idx,
        amount,
    };
    let events = c.env.events().all().filter_by_contract(&c.contract);
    assert_eq!(
        events,
        vec![
            &c.env,
            (
                c.contract.clone(),
                expected.topics(&c.env),
                expected.data(&c.env)
            )
        ]
    );
}

#[test]
fn withdraw_emits_withdrawn_event() {
    let c = setup(&[1_000], 0, false);
    let sink = Address::generate(&c.env);
    c.client().withdraw_unclaimed(&sink);

    let expected = Withdrawn {
        to: sink.clone(),
        amount: 1_000,
    };
    let events = c.env.events().all().filter_by_contract(&c.contract);
    assert_eq!(
        events,
        vec![
            &c.env,
            (
                c.contract.clone(),
                expected.topics(&c.env),
                expected.data(&c.env)
            )
        ]
    );
}

// ---- TTL extends ----

#[test]
fn claim_extends_claimedword_and_instance_ttl() {
    let c = setup(&[1_000], 0, false);
    let (idx, addr, amount, proof) = c.recipients[0].clone();
    c.client()
        .claim(&idx, &addr, &amount, &soroban_proof(&c.env, &proof));

    // `set_claimed` extends the ClaimedWord(0) persistent entry (lib.rs:307-309).
    let word_ttl = c.env.as_contract(&c.contract, || {
        c.env
            .storage()
            .persistent()
            .get_ttl(&DataKey::ClaimedWord(0))
    });
    assert_eq!(word_ttl, TTL_EXTEND_TO);

    // `extend_contract_ttl` bumps the instance entry (lib.rs:278-280).
    let instance_ttl = c
        .env
        .as_contract(&c.contract, || c.env.storage().instance().get_ttl());
    assert_eq!(instance_ttl, TTL_EXTEND_TO);
}

// ============================================================================
// M8 (T3) — property-based tests (`proptest`, doc 06 §6 P1-P5).
//
// The example tests above pin one hand-picked case each. These sweep randomized
// recipient sets / claim subsets / claim orders and assert the load-bearing
// value + bitmap invariants hold for ALL of them. Each case builds a fresh `Env`
// + a real Merkle tree via `setup`, so case counts are deliberately modest;
// `PROPTEST_CASES=<n>` raises them for a deeper (manual/nightly) sweep.
// ============================================================================
mod proptests {
    use super::*;
    use proptest::prelude::*;
    use proptest::sample::Index;

    /// `PROPTEST_CASES` (if set) overrides the per-property default, so a deeper
    /// sweep needs no source edit.
    fn case_count(default: u32) -> u32 {
        std::env::var("PROPTEST_CASES")
            .ok()
            .and_then(|s| s.parse().ok())
            .unwrap_or(default)
    }

    // P1 — Σ(payout) == Σ(claimed amounts) ≤ total; instance debited exactly.
    proptest! {
        #![proptest_config(ProptestConfig { cases: case_count(32), ..ProptestConfig::default() })]
        #[test]
        fn p1_sum_claimed_le_funded(
            rows in prop::collection::vec((1i128..=1_000_000_000i128, any::<bool>()), 1..=12usize),
        ) {
            let amounts: StdVec<i128> = rows.iter().map(|(a, _)| *a).collect();
            let total: i128 = amounts.iter().sum();
            let c = setup(&amounts, 0, false);

            let mut sum_claimed: i128 = 0;
            for (i, (idx, addr, amount, proof)) in c.recipients.iter().enumerate() {
                if rows[i].1 {
                    c.client().claim(idx, addr, amount, &soroban_proof(&c.env, proof));
                    sum_claimed += *amount;
                }
            }

            let sum_payout: i128 = c
                .recipients
                .iter()
                .map(|(_, addr, _, _)| balance(&c.env, &c.token, addr))
                .sum();
            prop_assert_eq!(sum_payout, sum_claimed);
            prop_assert!(sum_claimed <= total);
            prop_assert_eq!(balance(&c.env, &c.token, &c.contract), total - sum_claimed);
        }
    }

    // P2 — claiming the same index twice: 2nd call AlreadyClaimed, no double-pay.
    proptest! {
        #![proptest_config(ProptestConfig { cases: case_count(32), ..ProptestConfig::default() })]
        #[test]
        fn p2_claim_idempotent(
            amounts in prop::collection::vec(1i128..=1_000_000_000i128, 1..=12usize),
            pick in any::<Index>(),
        ) {
            let c = setup(&amounts, 0, false);
            let (idx, addr, amount, proof) = c.recipients[pick.index(c.recipients.len())].clone();
            let p = soroban_proof(&c.env, &proof);

            c.client().claim(&idx, &addr, &amount, &p);
            let bal = balance(&c.env, &c.token, &addr);
            let inst = balance(&c.env, &c.token, &c.contract);
            prop_assert!(c.client().is_claimed(&idx));

            // The bit-check (lib.rs:153) precedes proof-verify (lib.rs:158), so the
            // second call errs AlreadyClaimed (not InvalidProof); nothing moves.
            prop_assert_eq!(
                c.client().try_claim(&idx, &addr, &amount, &p),
                Err(Ok(Error::AlreadyClaimed))
            );
            prop_assert_eq!(balance(&c.env, &c.token, &addr), bal);
            prop_assert_eq!(balance(&c.env, &c.token, &c.contract), inst);
            prop_assert!(c.client().is_claimed(&idx));
        }
    }

    // P3 — claiming a fixed subset in any order yields identical final state.
    proptest! {
        #![proptest_config(ProptestConfig { cases: case_count(16), ..ProptestConfig::default() })]
        #[test]
        fn p3_order_independence(
            amounts in prop::collection::vec(1i128..=1_000_000_000i128, 1..=10usize),
            mask in prop::collection::vec(any::<bool>(), 10usize),
            order_keys in prop::collection::vec(any::<u64>(), 10usize),
        ) {
            let n = amounts.len();
            let subset: StdVec<usize> = (0..n).filter(|&i| mask[i]).collect();
            let mut permuted = subset.clone();
            permuted.sort_by_key(|&i| order_keys[i]);

            // Instance A claims the subset in ascending-index order...
            let a = setup(&amounts, 0, false);
            for &i in &subset {
                let (idx, addr, amount, proof) = &a.recipients[i];
                a.client().claim(idx, addr, amount, &soroban_proof(&a.env, proof));
            }
            // ...instance B claims the SAME subset in a key-derived permutation.
            let b = setup(&amounts, 0, false);
            for &i in &permuted {
                let (idx, addr, amount, proof) = &b.recipients[i];
                b.client().claim(idx, addr, amount, &soroban_proof(&b.env, proof));
            }

            // Identical per-recipient payout, identical pool remainder, identical bitmap.
            for i in 0..n {
                prop_assert_eq!(
                    balance(&a.env, &a.token, &a.recipients[i].1),
                    balance(&b.env, &b.token, &b.recipients[i].1)
                );
            }
            let total: i128 = amounts.iter().sum();
            let claimed: i128 = subset.iter().map(|&i| amounts[i]).sum();
            prop_assert_eq!(balance(&a.env, &a.token, &a.contract), total - claimed);
            prop_assert_eq!(balance(&b.env, &b.token, &b.contract), total - claimed);

            let lim = n as u32; // n ≤ 10 < MAX_PAGE_LIMIT(80)
            let sa: StdVec<bool> = a.client().claimed_statuses(&0, &lim).iter().collect();
            let sb: StdVec<bool> = b.client().claimed_statuses(&0, &lim).iter().collect();
            prop_assert_eq!(sa, sb);
        }
    }

    // P4 — claims + (when withdrawable) withdraw_unclaimed conserves `total`.
    proptest! {
        #![proptest_config(ProptestConfig { cases: case_count(16), ..ProptestConfig::default() })]
        #[test]
        fn p4_withdraw_plus_claims_eq_total(
            amounts in prop::collection::vec(1i128..=1_000_000_000i128, 1..=10usize),
            mask in prop::collection::vec(any::<bool>(), 10usize),
            locked in any::<bool>(),
            use_deadline in any::<bool>(),
        ) {
            let n = amounts.len();
            let deadline: u64 = if use_deadline { 1_000_000 } else { 0 };
            // Never claim the last recipient -> the pool always retains a positive
            // remainder, so each withdrawable leg sweeps a real (non-empty) balance.
            let subset: StdVec<usize> = (0..n).filter(|&i| i + 1 < n && mask[i]).collect();

            let c = setup(&amounts, deadline, locked);
            let mut claimed: i128 = 0;
            for &i in &subset {
                let (idx, addr, amount, proof) = &c.recipients[i];
                c.client().claim(idx, addr, amount, &soroban_proof(&c.env, proof));
                claimed += *amount;
            }
            let total: i128 = amounts.iter().sum();
            let remainder = total - claimed;
            prop_assert!(remainder > 0);

            let sink = Address::generate(&c.env);
            if !locked {
                // Unlocked: withdrawable at any time.
                c.client().withdraw_unclaimed(&sink);
                prop_assert_eq!(balance(&c.env, &c.token, &c.contract), 0);
                prop_assert_eq!(balance(&c.env, &c.token, &sink), remainder);
                prop_assert_eq!(claimed + balance(&c.env, &c.token, &sink), total);
            } else if deadline != 0 {
                // Locked + future deadline: blocked now, allowed strictly after it.
                prop_assert_eq!(
                    c.client().try_withdraw_unclaimed(&sink),
                    Err(Ok(Error::NotYetWithdrawable))
                );
                c.env.ledger().set_timestamp(deadline + 1);
                c.client().withdraw_unclaimed(&sink);
                prop_assert_eq!(balance(&c.env, &c.token, &c.contract), 0);
                prop_assert_eq!(balance(&c.env, &c.token, &sink), remainder);
                prop_assert_eq!(claimed + balance(&c.env, &c.token, &sink), total);
            } else {
                // Locked + no deadline (trustless): permanently non-withdrawable;
                // the pool keeps the unclaimed remainder forever (INV-1 holds).
                prop_assert_eq!(
                    c.client().try_withdraw_unclaimed(&sink),
                    Err(Ok(Error::NotYetWithdrawable))
                );
                prop_assert_eq!(balance(&c.env, &c.token, &c.contract), remainder);
            }
        }
    }

    // P5 — claiming index i sets ONLY bit i; no cross-index / cross-word aliasing.
    // N=260 straddles TWO u128 word boundaries (indices 128 and 256), so the
    // {127,128} and {255,256} cross-word neighbor pairs are both exercised. Bits
    // are read back via the paged `claimed_statuses` view (cheap, and also covers
    // an 80-wide window straddling a word boundary).
    proptest! {
        #![proptest_config(ProptestConfig { cases: case_count(16), ..ProptestConfig::default() })]
        #[test]
        fn p5_bitmap_no_aliasing(
            claim_indices in prop::collection::hash_set(0usize..260usize, 0..=8usize),
        ) {
            const N: usize = 260;
            let amounts = std::vec![1_000i128; N];
            let c = setup(&amounts, 0, false);

            for &i in &claim_indices {
                let (idx, addr, amount, proof) = &c.recipients[i];
                c.client().claim(idx, addr, amount, &soroban_proof(&c.env, proof));
            }

            // Read the whole bitmap back through paged windows (limit ≤ MAX_PAGE_LIMIT=80).
            let mut got: StdVec<bool> = StdVec::new();
            let mut start: u32 = 0;
            while (start as usize) < N {
                let lim = core::cmp::min(80u32, N as u32 - start);
                for b in c.client().claimed_statuses(&start, &lim).iter() {
                    got.push(b);
                }
                start += lim;
            }
            for (i, &g) in got.iter().enumerate() {
                let want = claim_indices.contains(&i);
                prop_assert_eq!(g, want, "bit {} should be {}", i, want);
            }
        }
    }
}
