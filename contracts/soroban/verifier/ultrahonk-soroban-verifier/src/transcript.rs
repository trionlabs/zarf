//! Fiat–Shamir transcript for UltraHonk

use crate::trace;
use crate::{
    field::Fr,
    hash::hash32,
    types::{
        G1Point, Proof, RelationParameters, Transcript, CONST_PROOF_SIZE_LOG_N, NUMBER_OF_ALPHAS,
        PAIRING_POINTS_SIZE,
    },
};
use soroban_sdk::{Bytes, Env};

fn push_point(buf: &mut Bytes, pt: &G1Point) {
    buf.extend_from_slice(&pt.x);
    buf.extend_from_slice(&pt.y);
}

fn split_challenge(challenge: Fr) -> (Fr, Fr) {
    let challenge_bytes = challenge.to_bytes();
    let mut low_bytes = [0u8; 32];
    low_bytes[16..].copy_from_slice(&challenge_bytes[16..]);
    let mut high_bytes = [0u8; 32];
    high_bytes[16..].copy_from_slice(&challenge_bytes[..16]);
    (Fr::from_bytes(&low_bytes), Fr::from_bytes(&high_bytes))
}

#[inline(always)]
fn hash_to_fr(bytes: &Bytes) -> Fr {
    Fr::from_bytes(&hash32(bytes))
}

fn generate_eta_challenge(
    env: &Env,
    proof: &Proof,
    public_inputs: &Bytes,
    vk_hash: &[u8; 32],
    public_inputs_size: u64,
) -> (Fr, Fr, Fr, Fr) {
    let mut data = Bytes::new(env);
    data.extend_from_slice(vk_hash);
    data.append(public_inputs);
    debug_assert_eq!(
        public_inputs.len() as u64 / 32 + PAIRING_POINTS_SIZE as u64,
        public_inputs_size
    );
    for fr in &proof.pairing_point_object {
        data.extend_from_slice(&fr.to_bytes());
    }
    for w in &[&proof.w1, &proof.w2, &proof.w3] {
        push_point(&mut data, w);
    }

    let previous_challenge = hash_to_fr(&data);
    let (eta, eta_two) = split_challenge(previous_challenge);
    let prev_bytes = Bytes::from_array(env, &previous_challenge.to_bytes());
    let previous_challenge = hash_to_fr(&prev_bytes);
    let (eta_three, _) = split_challenge(previous_challenge);

    (eta, eta_two, eta_three, previous_challenge)
}

fn generate_beta_and_gamma_challenges(
    env: &Env,
    previous_challenge: Fr,
    proof: &Proof,
) -> (Fr, Fr, Fr) {
    let mut data = Bytes::new(env);
    data.extend_from_slice(&previous_challenge.to_bytes());
    for w in &[
        &proof.lookup_read_counts,
        &proof.lookup_read_tags,
        &proof.w4,
    ] {
        push_point(&mut data, w);
    }
    let next_previous_challenge = hash_to_fr(&data);
    let (beta, gamma) = split_challenge(next_previous_challenge);
    (beta, gamma, next_previous_challenge)
}

fn generate_alpha_challenges(
    env: &Env,
    previous_challenge: Fr,
    proof: &Proof,
) -> ([Fr; NUMBER_OF_ALPHAS], Fr) {
    let mut data = Bytes::new(env);
    data.extend_from_slice(&previous_challenge.to_bytes());
    for w in &[&proof.lookup_inverses, &proof.z_perm] {
        push_point(&mut data, w);
    }
    let mut next_previous_challenge = hash_to_fr(&data);

    let mut alphas = [Fr::zero(); NUMBER_OF_ALPHAS];
    let (a0, a1) = split_challenge(next_previous_challenge);
    alphas[0] = a0;
    alphas[1] = a1;

    for i in 1..(NUMBER_OF_ALPHAS / 2) {
        let next_bytes = Bytes::from_array(env, &next_previous_challenge.to_bytes());
        next_previous_challenge = hash_to_fr(&next_bytes);
        let (lo, hi) = split_challenge(next_previous_challenge);
        alphas[2 * i] = lo;
        alphas[2 * i + 1] = hi;
    }

    if (NUMBER_OF_ALPHAS & 1) == 1 && NUMBER_OF_ALPHAS > 2 {
        let next_bytes = Bytes::from_array(env, &next_previous_challenge.to_bytes());
        next_previous_challenge = hash_to_fr(&next_bytes);
        let (last, _) = split_challenge(next_previous_challenge);
        alphas[NUMBER_OF_ALPHAS - 1] = last;
    }

    (alphas, next_previous_challenge)
}

fn generate_relation_parameters_challenges(
    env: &Env,
    proof: &Proof,
    public_inputs: &Bytes,
    vk_hash: &[u8; 32],
    public_inputs_size: u64,
) -> (RelationParameters, Fr) {
    let (eta, eta_two, eta_three, previous_challenge) =
        generate_eta_challenge(env, proof, public_inputs, vk_hash, public_inputs_size);
    let (beta, gamma, next_previous_challenge) =
        generate_beta_and_gamma_challenges(env, previous_challenge, proof);
    let rp = RelationParameters {
        eta,
        eta_two,
        eta_three,
        beta,
        gamma,
        public_inputs_delta: Fr::zero(),
    };
    (rp, next_previous_challenge)
}

fn generate_gate_challenges(
    env: &Env,
    previous_challenge: Fr,
    log_n: usize,
) -> ([Fr; CONST_PROOF_SIZE_LOG_N], Fr) {
    let mut gate_challenges = [Fr::zero(); CONST_PROOF_SIZE_LOG_N];
    let next_bytes = Bytes::from_array(env, &previous_challenge.to_bytes());
    let next_previous_challenge = hash_to_fr(&next_bytes);
    gate_challenges[0] = split_challenge(next_previous_challenge).0;
    for i in 1..log_n {
        gate_challenges[i] = gate_challenges[i - 1] * gate_challenges[i - 1];
    }
    (gate_challenges, next_previous_challenge)
}

fn generate_sumcheck_challenges(
    env: &Env,
    proof: &Proof,
    previous_challenge: Fr,
    log_n: usize,
) -> ([Fr; CONST_PROOF_SIZE_LOG_N], Fr) {
    let mut next_previous_challenge = previous_challenge;
    let mut sumcheck_challenges = [Fr::zero(); CONST_PROOF_SIZE_LOG_N];
    for r in 0..log_n {
        let mut data = Bytes::new(env);
        data.extend_from_slice(&next_previous_challenge.to_bytes());
        for &c in proof.sumcheck_univariates[r].iter() {
            data.extend_from_slice(&c.to_bytes());
        }
        next_previous_challenge = hash_to_fr(&data);
        sumcheck_challenges[r] = split_challenge(next_previous_challenge).0;
    }
    (sumcheck_challenges, next_previous_challenge)
}

fn generate_rho_challenge(env: &Env, proof: &Proof, previous_challenge: Fr) -> (Fr, Fr) {
    let mut data = Bytes::new(env);
    data.extend_from_slice(&previous_challenge.to_bytes());
    for &e in proof.sumcheck_evaluations.iter() {
        data.extend_from_slice(&e.to_bytes());
    }
    let next_previous_challenge = hash_to_fr(&data);
    let rho = split_challenge(next_previous_challenge).0;
    (rho, next_previous_challenge)
}

fn generate_gemini_r_challenge(
    env: &Env,
    proof: &Proof,
    previous_challenge: Fr,
    log_n: usize,
) -> (Fr, Fr) {
    let mut data = Bytes::new(env);
    data.extend_from_slice(&previous_challenge.to_bytes());
    for pt in proof.gemini_fold_comms.iter().take(log_n - 1) {
        push_point(&mut data, pt);
    }
    let next_previous_challenge = hash_to_fr(&data);
    let gemini_r = split_challenge(next_previous_challenge).0;
    (gemini_r, next_previous_challenge)
}

fn generate_shplonk_nu_challenge(
    env: &Env,
    proof: &Proof,
    previous_challenge: Fr,
    log_n: usize,
) -> (Fr, Fr) {
    let mut data = Bytes::new(env);
    data.extend_from_slice(&previous_challenge.to_bytes());
    for &a in proof.gemini_a_evaluations.iter().take(log_n) {
        data.extend_from_slice(&a.to_bytes());
    }
    let next_previous_challenge = hash_to_fr(&data);
    let shplonk_nu = split_challenge(next_previous_challenge).0;
    (shplonk_nu, next_previous_challenge)
}

fn generate_shplonk_z_challenge(env: &Env, proof: &Proof, previous_challenge: Fr) -> (Fr, Fr) {
    let mut data = Bytes::new(env);
    data.extend_from_slice(&previous_challenge.to_bytes());
    push_point(&mut data, &proof.shplonk_q);
    let next_previous_challenge = hash_to_fr(&data);
    let shplonk_z = split_challenge(next_previous_challenge).0;
    (shplonk_z, next_previous_challenge)
}

pub fn generate_transcript(
    env: &Env,
    proof: &Proof,
    public_inputs: &Bytes,
    vk_hash: &[u8; 32],
    public_inputs_size: u64,
    log_n: usize,
) -> Transcript {
    // 1) eta/beta/gamma
    let (rp, previous_challenge) = generate_relation_parameters_challenges(
        env,
        proof,
        public_inputs,
        vk_hash,
        public_inputs_size,
    );

    // 2) alphas
    let (alphas, previous_challenge) = generate_alpha_challenges(env, previous_challenge, proof);

    // 3) gate challenges
    let (gate_chals, previous_challenge) = generate_gate_challenges(env, previous_challenge, log_n);

    // 4) sumcheck challenges
    let (u_chals, previous_challenge) =
        generate_sumcheck_challenges(env, proof, previous_challenge, log_n);

    // 5) rho
    let (rho, previous_challenge) = generate_rho_challenge(env, proof, previous_challenge);

    // 6) gemini_r
    let (gemini_r, previous_challenge) =
        generate_gemini_r_challenge(env, proof, previous_challenge, log_n);

    // 7) shplonk_nu
    let (shplonk_nu, previous_challenge) =
        generate_shplonk_nu_challenge(env, proof, previous_challenge, log_n);

    // 8) shplonk_z
    let (shplonk_z, _previous_challenge) =
        generate_shplonk_z_challenge(env, proof, previous_challenge);

    trace!("===== TRANSCRIPT PARAMETERS =====");
    trace!("eta = 0x{}", hex::encode(rp.eta.to_bytes()));
    trace!("eta_two = 0x{}", hex::encode(rp.eta_two.to_bytes()));
    trace!("eta_three = 0x{}", hex::encode(rp.eta_three.to_bytes()));
    trace!("beta = 0x{}", hex::encode(rp.beta.to_bytes()));
    trace!("gamma = 0x{}", hex::encode(rp.gamma.to_bytes()));
    trace!("rho = 0x{}", hex::encode(rho.to_bytes()));
    trace!("gemini_r = 0x{}", hex::encode(gemini_r.to_bytes()));
    trace!("shplonk_nu = 0x{}", hex::encode(shplonk_nu.to_bytes()));
    trace!("shplonk_z = 0x{}", hex::encode(shplonk_z.to_bytes()));
    trace!("vk_hash = 0x{}", hex::encode(vk_hash));
    trace!("public_inputs_total = {}", public_inputs_size);
    trace!("log_n = {}", log_n);
    trace!("=================================");

    Transcript {
        rel_params: rp,
        alphas,
        gate_challenges: gate_chals,
        sumcheck_u_challenges: u_chals,
        rho,
        gemini_r,
        shplonk_nu,
        shplonk_z,
    }
}
