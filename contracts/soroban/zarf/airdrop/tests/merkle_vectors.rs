#![cfg(test)]

//! Canonical Rust<->JS Merkle test-vector contract (doc 09 §7, doc 06 §15.3).
//!
//! The generator (`#[ignore]`) writes `tests/fixtures/merkle-vectors.json` from
//! the REAL host keccak256 + real `Address::to_xdr` — Rust is the source of truth;
//! the JS side (M3) only consumes a byte-copy. The differential consumer reads the
//! committed fixture and INDEPENDENTLY recomputes each leaf + verifies each proof
//! reproduces the root, so fixture drift fails CI.
//!
//! Regenerate:  cargo test -p zarf-airdrop-soroban --test merkle_vectors -- --ignored

use serde::{Deserialize, Serialize};
use std::string::String as StdString;
use std::vec::Vec as StdVec;

use soroban_sdk::{
    testutils::Address as _, xdr::ToXdr, Address, Bytes, BytesN, Env, String as SString,
};

const FIXTURE: &str = concat!(
    env!("CARGO_MANIFEST_DIR"),
    "/tests/fixtures/merkle-vectors.json"
);

// ---- fixture schema (camelCase to match docs 06 §15.2 / 09 §6) ----

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct Vectors {
    schema_version: u32,
    format: Format,
    trees: StdVec<Tree>,
}

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct Format {
    hash: StdString,
    leaf: StdString,
    node: StdString,
    field_reduction: StdString,
}

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct Tree {
    name: StdString,
    recipient_count: usize,
    root: StdString,
    cases: StdVec<Case>,
}

#[derive(Serialize, Deserialize)]
struct Case {
    index: u32,
    address: StdString,
    amount: StdString,
    leaf: StdString,
    proof: StdVec<StdString>,
}

// ---- hex (0x-prefixed, lowercase — per the 2026-06-15 reconciliation) ----

fn hex0x(bytes: &[u8]) -> StdString {
    let mut s = StdString::from("0x");
    for b in bytes {
        s.push_str(&std::format!("{:02x}", b));
    }
    s
}

fn from_hex0x(s: &str) -> [u8; 32] {
    let s = s.strip_prefix("0x").unwrap_or(s);
    assert_eq!(s.len(), 64, "expected 32-byte hex");
    let mut out = [0u8; 32];
    for i in 0..32 {
        out[i] = u8::from_str_radix(&s[i * 2..i * 2 + 2], 16).expect("valid hex");
    }
    out
}

// ---- hashing (mirrors the contract; 09 §3-4) ----

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
                next.push(level[i].clone());
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

const I128_MAX_STR: &str = "170141183460469231731687303715884105727";

/// Extract the base32 strkey (`G…`/`C…`) from an Address. `Address` has no
/// `Display`, but its inherent `to_string()` yields the strkey as a soroban String.
fn addr_strkey(addr: &Address) -> StdString {
    let ss = addr.to_string();
    let mut buf = std::vec![0u8; ss.len() as usize];
    ss.copy_into_slice(&mut buf);
    StdString::from_utf8(buf).expect("strkey is ascii")
}

/// Build one named scenario tree from `(address, amount)` rows.
fn make_tree(env: &Env, name: &str, rows: &[(Address, i128)]) -> Tree {
    let leaves: StdVec<BytesN<32>> = rows
        .iter()
        .enumerate()
        .map(|(i, (a, amt))| leaf(env, i as u32, a, *amt))
        .collect();
    let (root, proofs) = build_tree(env, &leaves);
    let cases = rows
        .iter()
        .enumerate()
        .map(|(i, (a, amt))| Case {
            index: i as u32,
            address: addr_strkey(a),
            amount: amt.to_string(),
            leaf: hex0x(&leaves[i].to_array()),
            proof: proofs[i].iter().map(|h| hex0x(&h.to_array())).collect(),
        })
        .collect();
    Tree {
        name: name.into(),
        recipient_count: rows.len(),
        root: hex0x(&root.to_array()),
        cases,
    }
}

#[test]
#[ignore = "generator: writes the committed fixture; run with --ignored"]
fn generate_merkle_vectors() {
    let env = Env::default();
    // A real G… (account/ed25519) address pins the account-XDR leaf path (44 bytes);
    // `Address::generate` yields C… (contract) addresses (40 bytes), pinning that path.
    const ALICE: &str = "GC6TCMKAV55B5M3ESAJZLEJXSD2KF6UGWXCIFZDB7VURMTLYW724ITS4";
    let g = Address::from_string(&SString::from_str(&env, ALICE));
    let c1 = Address::generate(&env);
    let c2 = Address::generate(&env);

    let i128_max: i128 = I128_MAX_STR.parse().unwrap();

    let vectors = Vectors {
        schema_version: 1,
        format: Format {
            hash: "keccak256".into(),
            leaf: "0x00 | index_be32 | claimant.to_xdr | amount_be128".into(),
            node: "0x01 | sorted(L,R)".into(),
            field_reduction: "NONE".into(), // NO BN254 reduction (09 §2)
        },
        trees: std::vec![
            // single G… recipient: root == leaf, proof []
            make_tree(&env, "single-g", &[(g.clone(), 1)]),
            // odd count (promotion) + G/C mix + amount bounds (i128::MAX, 1)
            make_tree(
                &env,
                "odd-three-mixed",
                &[(g, 100), (c1, i128_max), (c2, 1)]
            ),
        ],
    };

    let json = serde_json::to_string_pretty(&vectors).unwrap();
    std::fs::create_dir_all(std::path::Path::new(FIXTURE).parent().unwrap()).unwrap();
    std::fs::write(FIXTURE, json + "\n").unwrap();
    std::println!("wrote {}", FIXTURE);
}

#[test]
fn merkle_vectors_differential() {
    let data = std::fs::read_to_string(FIXTURE).expect(
        "fixture missing — generate it first: \
         cargo test -p zarf-airdrop-soroban --test merkle_vectors -- --ignored",
    );
    let vectors: Vectors = serde_json::from_str(&data).expect("valid fixture json");
    assert_eq!(vectors.format.field_reduction, "NONE");

    let env = Env::default();
    for tree in &vectors.trees {
        let root = BytesN::from_array(&env, &from_hex0x(&tree.root));
        assert_eq!(tree.cases.len(), tree.recipient_count);
        for case in &tree.cases {
            let addr = Address::from_string(&SString::from_str(&env, &case.address));
            let amount: i128 = case.amount.parse().expect("i128 amount");

            // independently recompute the leaf (real host keccak + real to_xdr)
            let recomputed = leaf(&env, case.index, &addr, amount);
            assert_eq!(
                hex0x(&recomputed.to_array()),
                case.leaf,
                "leaf mismatch {}#{}",
                tree.name,
                case.index
            );

            // the proof must reproduce the frozen root
            let mut computed = recomputed;
            for sib_hex in &case.proof {
                let sib = BytesN::from_array(&env, &from_hex0x(sib_hex));
                computed = hash_node(&env, &computed, &sib);
            }
            assert_eq!(
                computed.to_array(),
                root.to_array(),
                "root mismatch {}#{}",
                tree.name,
                case.index
            );
        }
    }
}
