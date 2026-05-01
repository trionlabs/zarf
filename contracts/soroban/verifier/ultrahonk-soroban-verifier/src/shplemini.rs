//! Shplemini batch-opening verifier for BN254.

use crate::ec::helpers::negate;
use crate::ec::{g1_msm, pairing_check};
use crate::field::{batch_inverse, Fr};
use crate::hash::hash32;
use crate::types::{
    G1Point, Proof, Transcript, VerificationKey, CONST_PROOF_SIZE_LOG_N, NUMBER_TO_BE_SHIFTED,
    NUMBER_UNSHIFTED, SHIFTED_COMMITMENTS_START,
};
use soroban_sdk::{crypto::bn254::Bn254G1Affine, Bytes, Env};

fn fr_low_u128(fr: Fr) -> u128 {
    let bytes = fr.to_bytes();
    let mut out = [0u8; 16];
    out.copy_from_slice(&bytes[16..]);
    u128::from_be_bytes(out)
}

fn or_shifted_limb(words: &mut [u64; 4], limb: u128, shift: usize) {
    let word = shift / 64;
    let bits = shift % 64;
    let low = limb as u64;
    let high = (limb >> 64) as u64;

    if word < 4 {
        words[word] |= low << bits;
    }
    if bits == 0 {
        if word + 1 < 4 {
            words[word + 1] |= high;
        }
    } else {
        if word + 1 < 4 {
            words[word + 1] |= (low >> (64 - bits)) | (high << bits);
        }
        if word + 2 < 4 {
            words[word + 2] |= high >> (64 - bits);
        }
    }
}

fn limbs_to_be(limbs: &[Fr]) -> [u8; 32] {
    let mut words = [0u64; 4];
    for (i, limb) in limbs.iter().enumerate() {
        or_shifted_limb(&mut words, fr_low_u128(*limb), i * 68);
    }

    let mut out = [0u8; 32];
    for (i, word) in words.iter().rev().enumerate() {
        out[i * 8..(i + 1) * 8].copy_from_slice(&word.to_be_bytes());
    }
    out
}

fn convert_pairing_points_to_g1(proof: &Proof) -> (G1Point, G1Point) {
    let lhs_x = limbs_to_be(&proof.pairing_point_object[0..4]);
    let lhs_y = limbs_to_be(&proof.pairing_point_object[4..8]);
    let rhs_x = limbs_to_be(&proof.pairing_point_object[8..12]);
    let rhs_y = limbs_to_be(&proof.pairing_point_object[12..16]);
    (
        G1Point::from_xy(lhs_x, lhs_y),
        G1Point::from_xy(rhs_x, rhs_y),
    )
}

fn g1_from_affine(point: &Bn254G1Affine) -> G1Point {
    G1Point::from_bytes(point.to_array())
}

fn push_point(buf: &mut Bytes, point: &G1Point) {
    buf.extend_from_slice(&point.x);
    buf.extend_from_slice(&point.y);
}

fn generate_recursion_separator(
    env: &Env,
    proof: &Proof,
    acc_lhs: &Bn254G1Affine,
    acc_rhs: &Bn254G1Affine,
) -> Fr {
    let (proof_lhs, proof_rhs) = convert_pairing_points_to_g1(proof);
    let acc_lhs = g1_from_affine(acc_lhs);
    let acc_rhs = g1_from_affine(acc_rhs);

    let mut data = Bytes::new(env);
    push_point(&mut data, &proof_lhs);
    push_point(&mut data, &proof_rhs);
    push_point(&mut data, &acc_lhs);
    push_point(&mut data, &acc_rhs);
    Fr::from_bytes(&hash32(&data))
}

fn mul_with_separator(
    env: &Env,
    base: &Bn254G1Affine,
    other: &G1Point,
    separator: Fr,
) -> Result<Bn254G1Affine, &'static str> {
    let base = g1_from_affine(base);
    g1_msm(env, &[base, *other], &[separator, Fr::one()])
}

pub fn verify_shplemini(
    env: &Env,
    proof: &Proof,
    vk: &VerificationKey,
    tp: &Transcript,
) -> Result<(), &'static str> {
    let log_n = vk.log_circuit_size as usize;

    let mut r_pows = [Fr::zero(); CONST_PROOF_SIZE_LOG_N];
    r_pows[0] = tp.gemini_r;
    for i in 1..log_n {
        r_pows[i] = r_pows[i - 1] * r_pows[i - 1];
    }

    const MAX_BATCH: usize = 3 * CONST_PROOF_SIZE_LOG_N + 1;
    let batch_size = 3 + log_n + 2 * (log_n - 1);
    let mut to_invert = [Fr::zero(); MAX_BATCH];
    let mut inverted = [Fr::zero(); MAX_BATCH];

    to_invert[0] = tp.shplonk_z - r_pows[0];
    to_invert[1] = tp.shplonk_z + r_pows[0];
    to_invert[2] = tp.gemini_r;

    for j in (1..=log_n).rev() {
        let u = tp.sumcheck_u_challenges[j - 1];
        to_invert[3 + (log_n - j)] = r_pows[j - 1] * (Fr::one() - u) + u;
    }

    let further_base = 3 + log_n;
    for j in 1..log_n {
        to_invert[further_base + 2 * (j - 1)] = tp.shplonk_z - r_pows[j];
        to_invert[further_base + 2 * (j - 1) + 1] = tp.shplonk_z + r_pows[j];
    }

    batch_inverse(&to_invert[..batch_size], &mut inverted[..batch_size]).map_err(|_| {
        "shplemini: batch inversion failed (zero denominator in shplonk/gemini/fold)"
    })?;

    let pos0 = inverted[0];
    let neg0 = inverted[1];
    let gemini_r_inv = inverted[2];
    let unshifted = pos0 + tp.shplonk_nu * neg0;
    let shifted = gemini_r_inv * (pos0 - tp.shplonk_nu * neg0);

    const MAX_TOTAL: usize = NUMBER_UNSHIFTED + CONST_PROOF_SIZE_LOG_N + 2;
    let total = NUMBER_UNSHIFTED + log_n + 2;
    let mut scalars = [Fr::zero(); MAX_TOTAL];
    let mut coms = [G1Point::infinity(); MAX_TOTAL];

    scalars[0] = Fr::one();
    coms[0] = proof.shplonk_q;

    let mut batching_challenge = Fr::one();
    let mut batched_evaluation = Fr::zero();
    let unshifted_neg = -unshifted;
    let shifted_neg = -shifted;

    for i in 1..=NUMBER_UNSHIFTED {
        scalars[i] = unshifted_neg * batching_challenge;
        batched_evaluation =
            batched_evaluation + proof.sumcheck_evaluations[i - 1] * batching_challenge;
        batching_challenge = batching_challenge * tp.rho;
    }

    for i in 0..NUMBER_TO_BE_SHIFTED {
        let scalar_off = i + SHIFTED_COMMITMENTS_START;
        let evaluation_off = i + NUMBER_UNSHIFTED;
        scalars[scalar_off] = scalars[scalar_off] + shifted_neg * batching_challenge;
        batched_evaluation =
            batched_evaluation + proof.sumcheck_evaluations[evaluation_off] * batching_challenge;
        batching_challenge = batching_challenge * tp.rho;
    }

    coms[1] = vk.qm;
    coms[2] = vk.qc;
    coms[3] = vk.ql;
    coms[4] = vk.qr;
    coms[5] = vk.qo;
    coms[6] = vk.q4;
    coms[7] = vk.q_lookup;
    coms[8] = vk.q_arith;
    coms[9] = vk.q_delta_range;
    coms[10] = vk.q_elliptic;
    coms[11] = vk.q_memory;
    coms[12] = vk.q_nnf;
    coms[13] = vk.q_poseidon2_external;
    coms[14] = vk.q_poseidon2_internal;
    coms[15] = vk.s1;
    coms[16] = vk.s2;
    coms[17] = vk.s3;
    coms[18] = vk.s4;
    coms[19] = vk.id1;
    coms[20] = vk.id2;
    coms[21] = vk.id3;
    coms[22] = vk.id4;
    coms[23] = vk.t1;
    coms[24] = vk.t2;
    coms[25] = vk.t3;
    coms[26] = vk.t4;
    coms[27] = vk.lagrange_first;
    coms[28] = vk.lagrange_last;

    coms[29] = proof.w1;
    coms[30] = proof.w2;
    coms[31] = proof.w3;
    coms[32] = proof.w4;
    coms[33] = proof.z_perm;
    coms[34] = proof.lookup_inverses;
    coms[35] = proof.lookup_read_counts;
    coms[36] = proof.lookup_read_tags;

    let mut fold_pos = [Fr::zero(); CONST_PROOF_SIZE_LOG_N];
    let mut cur = batched_evaluation;
    for j in (1..=log_n).rev() {
        let r2 = r_pows[j - 1];
        let u = tp.sumcheck_u_challenges[j - 1];
        let num = r2 * cur * Fr::from_u64(2)
            - proof.gemini_a_evaluations[j - 1] * (r2 * (Fr::one() - u) - u);
        let den_inv = inverted[3 + (log_n - j)];
        cur = num * den_inv;
        fold_pos[j - 1] = cur;
    }

    let mut const_acc = fold_pos[0] * pos0 + proof.gemini_a_evaluations[0] * tp.shplonk_nu * neg0;
    let mut v_pow = tp.shplonk_nu * tp.shplonk_nu;

    for i in 0..(log_n - 1) {
        let pos_inv = inverted[further_base + 2 * i];
        let neg_inv = inverted[further_base + 2 * i + 1];
        let sp = v_pow * pos_inv;
        let sn = v_pow * tp.shplonk_nu * neg_inv;

        let idx = NUMBER_UNSHIFTED + 1 + i;
        scalars[idx] = -(sn + sp);
        const_acc = const_acc + proof.gemini_a_evaluations[i + 1] * sn + fold_pos[i + 1] * sp;
        v_pow = v_pow * tp.shplonk_nu * tp.shplonk_nu;

        coms[idx] = proof.gemini_fold_comms[i];
    }

    let one_idx = NUMBER_UNSHIFTED + log_n;
    coms[one_idx] = G1Point::generator();
    scalars[one_idx] = const_acc;

    let q_idx = one_idx + 1;
    coms[q_idx] = proof.kzg_quotient;
    scalars[q_idx] = tp.shplonk_z;

    let p0 = g1_msm(env, &coms[..total], &scalars[..total])?;
    let p1 = negate(env, &proof.kzg_quotient);

    let recursion_separator = generate_recursion_separator(env, proof, &p0, &p1);
    let (proof_lhs, proof_rhs) = convert_pairing_points_to_g1(proof);
    let p0 = mul_with_separator(env, &p0, &proof_lhs, recursion_separator)?;
    let p1 = mul_with_separator(env, &p1, &proof_rhs, recursion_separator)?;

    if pairing_check(env, &p0, &p1) {
        Ok(())
    } else {
        Err("Shplonk pairing check failed")
    }
}
