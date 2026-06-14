//! Utilities for loading Proof and VerificationKey, plus byte↔field/point conversion.

use crate::field::Fr;
use crate::hash::hash32;
use crate::types::{
    G1Point, Proof, VerificationKey, BATCHED_RELATION_PARTIAL_LENGTH, CONST_PROOF_SIZE_LOG_N,
    NUMBER_OF_ENTITIES, PAIRING_POINTS_SIZE,
};
use core::array;
use soroban_sdk::Bytes;

/// Convert a 32-byte big-endian array into an Fr.
fn bytes32_to_fr(bytes: &[u8; 32]) -> Fr {
    Fr::from_bytes(bytes)
}

/// Split a 32-byte big-endian field element into (low136, high) limbs.
pub fn coord_to_halves_be(coord: &[u8; 32]) -> ([u8; 32], [u8; 32]) {
    let mut low = [0u8; 32];
    let mut high = [0u8; 32];
    low[15..].copy_from_slice(&coord[15..]); // 17 bytes
    high[17..].copy_from_slice(&coord[..15]); // 15 bytes
    (low, high)
}

fn read_bytes<const N: usize>(bytes: &Bytes, idx: &mut u32) -> [u8; N] {
    let mut out = [0u8; N];
    let end = *idx + N as u32;
    bytes.slice(*idx..end).copy_into_slice(&mut out);
    *idx = end;
    out
}

pub fn proof_fields_for_log_n(log_n: usize) -> usize {
    assert!(is_supported_log_n(log_n), "unsupported proof log_n");
    // bb v2 UltraKeccakHonk proof layout:
    // pairing points + 8 witness commitments + sumcheck + evaluations
    // + Gemini folds/evaluations + Shplonk/KZG commitments.
    PAIRING_POINTS_SIZE
        + 8 * 2
        + log_n * BATCHED_RELATION_PARTIAL_LENGTH
        + NUMBER_OF_ENTITIES
        + (log_n - 1) * 2
        + log_n
        + 2 * 2
}

pub fn proof_bytes_for_log_n(log_n: usize) -> usize {
    proof_fields_for_log_n(log_n) * 32
}

pub fn is_supported_log_n(log_n: usize) -> bool {
    log_n > 0 && log_n <= CONST_PROOF_SIZE_LOG_N
}

/// Load a bb v2 UltraKeccakHonk proof from a byte array.
///
/// Returns `None` on length mismatch or any structurally invalid G1 point
/// (off-curve / non-canonical coordinates), so callers can surface a clean
/// error instead of letting the host trap mid-MSM.
pub fn load_proof(proof_bytes: &Bytes, log_n: usize) -> Option<Proof> {
    if proof_bytes.len() as usize != proof_bytes_for_log_n(log_n) {
        return None;
    }
    let mut boundary = 0u32;

    fn bytes_to_g1_proof_point(bytes: &Bytes, cur: &mut u32) -> Option<G1Point> {
        let x = read_bytes::<32>(bytes, cur);
        let y = read_bytes::<32>(bytes, cur);
        let point = G1Point { x, y };
        point.is_valid().then_some(point)
    }

    // Helper: bytesToFr (read next 32 bytes as Fr)
    fn bytes_to_fr(bytes: &Bytes, cur: &mut u32) -> Fr {
        let arr = read_bytes::<32>(bytes, cur);
        bytes32_to_fr(&arr)
    }

    // 0) pairing point object
    let pairing_point_object: [Fr; PAIRING_POINTS_SIZE] =
        array::from_fn(|_| bytes_to_fr(proof_bytes, &mut boundary));

    // 1) w1, w2, w3
    let w1 = bytes_to_g1_proof_point(proof_bytes, &mut boundary)?;
    let w2 = bytes_to_g1_proof_point(proof_bytes, &mut boundary)?;
    let w3 = bytes_to_g1_proof_point(proof_bytes, &mut boundary)?;

    // 2) lookup_read_counts, lookup_read_tags
    let lookup_read_counts = bytes_to_g1_proof_point(proof_bytes, &mut boundary)?;
    let lookup_read_tags = bytes_to_g1_proof_point(proof_bytes, &mut boundary)?;

    // 3) w4
    let w4 = bytes_to_g1_proof_point(proof_bytes, &mut boundary)?;

    // 4) lookup_inverses, z_perm
    let lookup_inverses = bytes_to_g1_proof_point(proof_bytes, &mut boundary)?;
    let z_perm = bytes_to_g1_proof_point(proof_bytes, &mut boundary)?;

    // 5) sumcheck_univariates
    let mut sumcheck_univariates =
        [[Fr::zero(); BATCHED_RELATION_PARTIAL_LENGTH]; CONST_PROOF_SIZE_LOG_N];
    for r in 0..log_n {
        for i in 0..BATCHED_RELATION_PARTIAL_LENGTH {
            sumcheck_univariates[r][i] = bytes_to_fr(proof_bytes, &mut boundary);
        }
    }

    // 6) sumcheck_evaluations
    let sumcheck_evaluations: [Fr; NUMBER_OF_ENTITIES] =
        array::from_fn(|_| bytes_to_fr(proof_bytes, &mut boundary));

    // 7) gemini_fold_comms
    let mut gemini_fold_comms = [G1Point::infinity(); CONST_PROOF_SIZE_LOG_N - 1];
    for fold in gemini_fold_comms.iter_mut().take(log_n - 1) {
        *fold = bytes_to_g1_proof_point(proof_bytes, &mut boundary)?;
    }

    // 8) gemini_a_evaluations
    let mut gemini_a_evaluations = [Fr::zero(); CONST_PROOF_SIZE_LOG_N];
    for eval in gemini_a_evaluations.iter_mut().take(log_n) {
        *eval = bytes_to_fr(proof_bytes, &mut boundary);
    }

    // 9) shplonk_q, kzg_quotient
    let shplonk_q = bytes_to_g1_proof_point(proof_bytes, &mut boundary)?;
    let kzg_quotient = bytes_to_g1_proof_point(proof_bytes, &mut boundary)?;

    Some(Proof {
        pairing_point_object,
        w1,
        w2,
        w3,
        w4,
        lookup_read_counts,
        lookup_read_tags,
        lookup_inverses,
        z_perm,
        sumcheck_univariates,
        sumcheck_evaluations,
        gemini_fold_comms,
        gemini_a_evaluations,
        shplonk_q,
        kzg_quotient,
    })
}

/// Load a VerificationKey and derive its byte hash with the local Keccak helper.
pub fn load_vk_from_bytes(bytes: &Bytes) -> Option<VerificationKey> {
    load_vk_from_bytes_with_hash(bytes, hash32(bytes))
}

/// Load a VerificationKey with a caller-supplied canonical hash.
pub fn load_vk_from_bytes_with_hash(bytes: &Bytes, vk_hash: [u8; 32]) -> Option<VerificationKey> {
    const HEADER_WORDS: usize = 3;
    const NUM_POINTS: usize = 28;
    const EXPECTED_LEN: usize = HEADER_WORDS * 32 + NUM_POINTS * 64;
    if bytes.len() as usize != EXPECTED_LEN {
        return None;
    }

    fn read_word_u64(bytes: &Bytes, idx: &mut u32) -> u64 {
        let word = read_bytes::<32>(bytes, idx);
        let mut out = [0u8; 8];
        out.copy_from_slice(&word[24..]);
        u64::from_be_bytes(out)
    }
    fn read_point(bytes: &Bytes, idx: &mut u32) -> Option<G1Point> {
        let x = read_bytes::<32>(bytes, idx);
        let y = read_bytes::<32>(bytes, idx);
        // The Soroban host re-checks curve membership on use but traps on
        // failure; validating here turns a malformed VK into a clean parse
        // error at construction time instead.
        let point = G1Point { x, y };
        point.is_valid().then_some(point)
    }

    let mut idx = 0u32;
    let log_circuit_size = read_word_u64(bytes, &mut idx);
    let public_inputs_size = read_word_u64(bytes, &mut idx);
    let public_inputs_offset = read_word_u64(bytes, &mut idx);
    if log_circuit_size == 0 || log_circuit_size > CONST_PROOF_SIZE_LOG_N as u64 {
        return None;
    }
    if public_inputs_size < PAIRING_POINTS_SIZE as u64 {
        return None;
    }
    let circuit_size = 1u64.checked_shl(log_circuit_size as u32)?;
    let public_inputs_end = public_inputs_offset.checked_add(public_inputs_size)?;
    if public_inputs_offset >= circuit_size || public_inputs_end > circuit_size {
        return None;
    }

    let qm = read_point(bytes, &mut idx)?;
    let qc = read_point(bytes, &mut idx)?;
    let ql = read_point(bytes, &mut idx)?;
    let qr = read_point(bytes, &mut idx)?;
    let qo = read_point(bytes, &mut idx)?;
    let q4 = read_point(bytes, &mut idx)?;
    let q_lookup = read_point(bytes, &mut idx)?;
    let q_arith = read_point(bytes, &mut idx)?;
    let q_delta_range = read_point(bytes, &mut idx)?;
    let q_elliptic = read_point(bytes, &mut idx)?;
    let q_memory = read_point(bytes, &mut idx)?;
    let q_nnf = read_point(bytes, &mut idx)?;
    let q_poseidon2_external = read_point(bytes, &mut idx)?;
    let q_poseidon2_internal = read_point(bytes, &mut idx)?;
    let s1 = read_point(bytes, &mut idx)?;
    let s2 = read_point(bytes, &mut idx)?;
    let s3 = read_point(bytes, &mut idx)?;
    let s4 = read_point(bytes, &mut idx)?;
    let id1 = read_point(bytes, &mut idx)?;
    let id2 = read_point(bytes, &mut idx)?;
    let id3 = read_point(bytes, &mut idx)?;
    let id4 = read_point(bytes, &mut idx)?;
    let t1 = read_point(bytes, &mut idx)?;
    let t2 = read_point(bytes, &mut idx)?;
    let t3 = read_point(bytes, &mut idx)?;
    let t4 = read_point(bytes, &mut idx)?;
    let lagrange_first = read_point(bytes, &mut idx)?;
    let lagrange_last = read_point(bytes, &mut idx)?;

    Some(VerificationKey {
        vk_hash,
        circuit_size,
        log_circuit_size,
        public_inputs_size,
        public_inputs_offset,
        qm,
        qc,
        ql,
        qr,
        qo,
        q4,
        q_lookup,
        q_arith,
        q_delta_range,
        q_elliptic,
        q_memory,
        q_nnf,
        q_poseidon2_external,
        q_poseidon2_internal,
        s1,
        s2,
        s3,
        s4,
        id1,
        id2,
        id3,
        id4,
        t1,
        t2,
        t3,
        t4,
        lagrange_first,
        lagrange_last,
    })
}
