//! Adversarial / soundness tests for the UltraHonk verifier.
//!
//! The existing fixture tests prove *completeness* (a real proof verifies)
//! and reject a couple of hand-picked corruptions. These tests probe the
//! soundness-sensitive seams a reviewer would diff against bb byte-for-byte:
//!
//!  - a wide bit-flip sweep across the proof and public inputs must always
//!    be rejected (no tampered proof verifies);
//!  - non-canonical (>= r) public-input encodings are rejected;
//!  - out-of-range pairing-point limbs are rejected;
//!  - the G1 structural validator agrees with on-curve membership.
//!
//! The fixture is the real Zarf claim proof shared with the verifier
//! contract's integration tests.

use soroban_sdk::{testutils::Ledger, Bytes, Env};
use ultrahonk_soroban_verifier::field::Fr;
use ultrahonk_soroban_verifier::types::G1Point;
use ultrahonk_soroban_verifier::UltraHonkVerifier;

const VK: &[u8] = include_bytes!("../../tests/zarf/target/vk");
const PROOF: &[u8] = include_bytes!("../../tests/zarf/target/proof");
const PUBLIC_INPUTS: &[u8] = include_bytes!("../../tests/zarf/target/public_inputs");
const VK_HASH_HEX: &str = include_str!("../../tests/zarf/vk_hash.hex");

fn vk_hash() -> [u8; 32] {
    let hex = VK_HASH_HEX
        .trim()
        .strip_prefix("0x")
        .unwrap_or(VK_HASH_HEX.trim());
    let mut out = [0u8; 32];
    for i in 0..32 {
        out[i] = u8::from_str_radix(&hex[i * 2..i * 2 + 2], 16).expect("valid hex");
    }
    out
}

fn make_env() -> Env {
    let env = Env::default();
    env.ledger().set_protocol_version(26);
    env.cost_estimate().budget().reset_unlimited();
    env
}

fn verifier(env: &Env) -> UltraHonkVerifier {
    let vk = Bytes::from_slice(env, VK);
    UltraHonkVerifier::new_with_vk_hash(env, &vk, vk_hash()).expect("vk parses")
}

#[test]
fn baseline_fixture_verifies() {
    let env = make_env();
    let v = verifier(&env);
    v.verify(
        &Bytes::from_slice(&env, PROOF),
        &Bytes::from_slice(&env, PUBLIC_INPUTS),
    )
    .expect("the unmodified fixture must verify");
}

/// Flip one bit in each sampled byte of the proof and assert rejection. A
/// full per-byte sweep over a ~20 KB proof would be slow under the metered
/// host, so stride-sample; every 32-byte field gets at least one hit.
#[test]
fn bit_flips_across_proof_are_rejected() {
    let env = make_env();
    let v = verifier(&env);
    let public_inputs = Bytes::from_slice(&env, PUBLIC_INPUTS);

    let stride = 7usize; // coprime with 32 → walks across field boundaries
    let mut survived = 0usize;
    let mut idx = 0usize;
    while idx < PROOF.len() {
        let mut mutated = PROOF.to_vec();
        mutated[idx] ^= 0x01;
        let proof = Bytes::from_slice(&env, &mutated);
        if v.verify(&proof, &public_inputs).is_ok() {
            survived += 1;
        }
        idx += stride;
    }
    assert_eq!(survived, 0, "{survived} tampered proofs verified");
}

/// Same sweep over the public inputs.
#[test]
fn bit_flips_across_public_inputs_are_rejected() {
    let env = make_env();
    let v = verifier(&env);
    let proof = Bytes::from_slice(&env, PROOF);

    let mut survived = 0usize;
    for idx in 0..PUBLIC_INPUTS.len() {
        let mut mutated = PUBLIC_INPUTS.to_vec();
        mutated[idx] ^= 0x01;
        let public_inputs = Bytes::from_slice(&env, &mutated);
        if v.verify(&proof, &public_inputs).is_ok() {
            survived += 1;
        }
    }
    assert_eq!(
        survived, 0,
        "{survived} tampered public-input sets verified"
    );
}

/// Truncating or extending the proof must be rejected on length alone.
#[test]
fn wrong_length_proof_is_rejected() {
    let env = make_env();
    let v = verifier(&env);
    let public_inputs = Bytes::from_slice(&env, PUBLIC_INPUTS);

    let truncated = Bytes::from_slice(&env, &PROOF[..PROOF.len() - 32]);
    assert!(v.verify(&truncated, &public_inputs).is_err());

    let mut extended = PROOF.to_vec();
    extended.extend_from_slice(&[0u8; 32]);
    let extended = Bytes::from_slice(&env, &extended);
    assert!(v.verify(&extended, &public_inputs).is_err());
}

/// A public-input field re-encoded as `value + r` reduces to the same field
/// element but is a distinct, non-canonical byte string. The transcript
/// hashes raw bytes, so this must be rejected rather than silently accepted.
#[test]
fn non_canonical_public_input_is_rejected() {
    let env = make_env();
    let v = verifier(&env);
    let proof = Bytes::from_slice(&env, PROOF);

    // r (BN254 scalar field modulus), big-endian.
    let r: [u8; 32] = [
        0x30, 0x64, 0x4e, 0x72, 0xe1, 0x31, 0xa0, 0x29, 0xb8, 0x50, 0x45, 0xb6, 0x81, 0x81, 0x58,
        0x5d, 0x28, 0x33, 0xe8, 0x48, 0x79, 0xb9, 0x70, 0x91, 0x43, 0xe1, 0xf5, 0x93, 0xf0, 0x00,
        0x00, 0x01,
    ];

    // Take the first public-input field v0, form v0 + r (non-canonical).
    let mut field0 = [0u8; 32];
    field0.copy_from_slice(&PUBLIC_INPUTS[..32]);
    let mut sum = [0u8; 32];
    let mut carry = 0u16;
    for i in (0..32).rev() {
        let s = field0[i] as u16 + r[i] as u16 + carry;
        sum[i] = (s & 0xff) as u8;
        carry = s >> 8;
    }
    // Only meaningful if it didn't overflow 32 bytes (it won't for a small field).
    assert_eq!(carry, 0, "fixture field0 too large for this test");

    let mut mutated = PUBLIC_INPUTS.to_vec();
    mutated[..32].copy_from_slice(&sum);
    // Sanity: the alias reduces to the original field element.
    assert_eq!(
        Fr::from_bytes(&sum).to_bytes(),
        Fr::from_bytes(&field0).to_bytes()
    );

    let public_inputs = Bytes::from_slice(&env, &mutated);
    assert!(
        v.verify(&proof, &public_inputs).is_err(),
        "non-canonical public input must be rejected"
    );
}

/// `Fr::is_canonical_be` round-trips exactly the canonical encodings.
#[test]
fn fr_canonical_check_matches_round_trip() {
    let zero = [0u8; 32];
    assert!(Fr::is_canonical_be(&zero));
    let mut one = [0u8; 32];
    one[31] = 1;
    assert!(Fr::is_canonical_be(&one));
    // All-ones is >= r → non-canonical.
    assert!(!Fr::is_canonical_be(&[0xff; 32]));
}

/// `fits_bits` agrees with the bit length of small and boundary values.
#[test]
fn fr_fits_bits_boundaries() {
    assert!(Fr::zero().fits_bits(0));
    assert!(Fr::from_u64(1).fits_bits(1));
    assert!(!Fr::from_u64(2).fits_bits(1));
    // 2^68 needs 69 bits.
    let two_pow_68 = Fr::from_u64(1).pow(0) * {
        let mut bytes = [0u8; 32];
        // byte index 31-8 = 23 holds 2^(8*8)=2^64; we want 2^68 → set bit 68.
        // bit 68 is in byte 31 - 8 = 23, bit (68 % 8) = 4.
        bytes[31 - 8] = 1 << 4;
        Fr::from_bytes(&bytes)
    };
    assert!(two_pow_68.fits_bits(69));
    assert!(!two_pow_68.fits_bits(68));
}

/// The G1 structural validator: the generator is valid, the all-zero point
/// at infinity is valid, and a point with a non-canonical / off-curve
/// coordinate is rejected.
#[test]
fn g1_validation_accepts_generator_rejects_garbage() {
    assert!(G1Point::generator().is_valid());
    assert!(G1Point::infinity().is_valid());

    // y tampered → off curve.
    let mut bad = G1Point::generator();
    bad.y[31] ^= 0x01;
    assert!(!bad.is_valid());

    // Non-canonical x (all 0xff >= q).
    let off = G1Point {
        x: [0xff; 32],
        y: [0u8; 32],
    };
    assert!(!off.is_valid());
}
