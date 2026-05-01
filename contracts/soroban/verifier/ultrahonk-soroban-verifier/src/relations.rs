//!
//! UltraHonk relation accumulator for bb v2 UltraKeccak flavor.

use crate::field::Fr;
use crate::types::{RelationParameters, Wire, NUMBER_OF_SUBRELATIONS};

fn neg_half() -> Fr {
    Fr::from_str("0x183227397098d014dc2822db40c0ac2e9419f4243cdcb848a1f0fac9f8000000")
}

fn internal_matrix_diagonal() -> [Fr; 4] {
    [
        Fr::from_str("0x10dc6e9c006ea38b04b1e03b4bd9490c0d03f98929ca1d7fb56821fd19d3b6e7"),
        Fr::from_str("0x0c28145b6a44df3e0149b3d0a30b3bb599df9756d4dd9b84a86b38cfb45a740b"),
        Fr::from_str("0x00544b8338791518b2c7645a50392798b21f75bb60e3596170067d00141cac15"),
        Fr::from_str("0x222c01175718386f2e2e82eb122789e352e105a3b8fa852613bc534433ee428b"),
    ]
}

#[inline(always)]
fn wire(vals: &[Fr], w: Wire) -> Fr {
    vals[w.index()]
}

fn accumulate_arithmetic_relation(p: &[Fr], evals: &mut [Fr], domain_sep: Fr) {
    let q_arith = wire(p, Wire::QArith);

    let mut accum = (q_arith - Fr::from_u64(3))
        * wire(p, Wire::Qm)
        * wire(p, Wire::Wr)
        * wire(p, Wire::Wl)
        * neg_half();
    accum = accum
        + wire(p, Wire::Ql) * wire(p, Wire::Wl)
        + wire(p, Wire::Qr) * wire(p, Wire::Wr)
        + wire(p, Wire::Qo) * wire(p, Wire::Wo)
        + wire(p, Wire::Q4) * wire(p, Wire::W4)
        + wire(p, Wire::Qc);
    accum = accum + (q_arith - Fr::one()) * wire(p, Wire::W4Shift);
    evals[0] = accum * q_arith * domain_sep;

    let mut accum =
        wire(p, Wire::Wl) + wire(p, Wire::W4) - wire(p, Wire::WlShift) + wire(p, Wire::Qm);
    accum = accum * (q_arith - Fr::from_u64(2)) * (q_arith - Fr::one()) * q_arith;
    evals[1] = accum * domain_sep;
}

fn accumulate_permutation_relation(
    p: &[Fr],
    rp: &RelationParameters,
    evals: &mut [Fr],
    domain_sep: Fr,
) {
    let grand_product_numerator = {
        let mut num = wire(p, Wire::Wl) + wire(p, Wire::Id1) * rp.beta + rp.gamma;
        num = num
            * (wire(p, Wire::Wr) + wire(p, Wire::Id2) * rp.beta + rp.gamma)
            * (wire(p, Wire::Wo) + wire(p, Wire::Id3) * rp.beta + rp.gamma)
            * (wire(p, Wire::W4) + wire(p, Wire::Id4) * rp.beta + rp.gamma);
        num
    };

    let grand_product_denominator = {
        let mut den = wire(p, Wire::Wl) + wire(p, Wire::Sigma1) * rp.beta + rp.gamma;
        den = den
            * (wire(p, Wire::Wr) + wire(p, Wire::Sigma2) * rp.beta + rp.gamma)
            * (wire(p, Wire::Wo) + wire(p, Wire::Sigma3) * rp.beta + rp.gamma)
            * (wire(p, Wire::W4) + wire(p, Wire::Sigma4) * rp.beta + rp.gamma);
        den
    };

    evals[2] = ((wire(p, Wire::ZPerm) + wire(p, Wire::LagrangeFirst))
        * grand_product_numerator
        - (wire(p, Wire::ZPermShift) + wire(p, Wire::LagrangeLast) * rp.public_inputs_delta)
            * grand_product_denominator)
        * domain_sep;

    evals[3] = wire(p, Wire::LagrangeLast) * wire(p, Wire::ZPermShift) * domain_sep;
}

fn accumulate_log_derivative_lookup_relation(
    p: &[Fr],
    rp: &RelationParameters,
    evals: &mut [Fr],
    domain_sep: Fr,
) {
    let write_term = wire(p, Wire::Table1)
        + rp.gamma
        + wire(p, Wire::Table2) * rp.eta
        + wire(p, Wire::Table3) * rp.eta_two
        + wire(p, Wire::Table4) * rp.eta_three;

    let derived_entry_1 = wire(p, Wire::Wl) + rp.gamma + wire(p, Wire::Qr) * wire(p, Wire::WlShift);
    let derived_entry_2 = wire(p, Wire::Wr) + wire(p, Wire::Qm) * wire(p, Wire::WrShift);
    let derived_entry_3 = wire(p, Wire::Wo) + wire(p, Wire::Qc) * wire(p, Wire::WoShift);

    let read_term = derived_entry_1
        + derived_entry_2 * rp.eta
        + derived_entry_3 * rp.eta_two
        + wire(p, Wire::Qo) * rp.eta_three;

    let read_inverse = wire(p, Wire::LookupInverses) * write_term;
    let write_inverse = wire(p, Wire::LookupInverses) * read_term;
    let inverse_exists_xor = wire(p, Wire::LookupReadTags) + wire(p, Wire::QLookup)
        - wire(p, Wire::LookupReadTags) * wire(p, Wire::QLookup);

    evals[4] = (read_term * write_term * wire(p, Wire::LookupInverses) - inverse_exists_xor)
        * domain_sep;
    evals[5] = wire(p, Wire::QLookup) * read_inverse
        - wire(p, Wire::LookupReadCounts) * write_inverse;

    let read_tag = wire(p, Wire::LookupReadTags);
    evals[6] = (read_tag * read_tag - read_tag) * domain_sep;
}

fn accumulate_delta_range_relation(p: &[Fr], evals: &mut [Fr], domain_sep: Fr) {
    let minus_one = Fr::zero() - Fr::one();
    let minus_two = Fr::zero() - Fr::from_u64(2);
    let minus_three = Fr::zero() - Fr::from_u64(3);

    let delta_1 = wire(p, Wire::Wr) - wire(p, Wire::Wl);
    let delta_2 = wire(p, Wire::Wo) - wire(p, Wire::Wr);
    let delta_3 = wire(p, Wire::W4) - wire(p, Wire::Wo);
    let delta_4 = wire(p, Wire::WlShift) - wire(p, Wire::W4);
    let deltas = [delta_1, delta_2, delta_3, delta_4];

    for i in 0..4 {
        let delta = deltas[i];
        evals[7 + i] = delta
            * (delta + minus_one)
            * (delta + minus_two)
            * (delta + minus_three)
            * wire(p, Wire::QRange)
            * domain_sep;
    }
}

fn accumulate_elliptic_relation(p: &[Fr], evals: &mut [Fr], domain_sep: Fr) {
    let x_1 = wire(p, Wire::Wr);
    let y_1 = wire(p, Wire::Wo);
    let x_2 = wire(p, Wire::WlShift);
    let y_2 = wire(p, Wire::W4Shift);
    let y_3 = wire(p, Wire::WoShift);
    let x_3 = wire(p, Wire::WrShift);

    let q_sign = wire(p, Wire::Ql);
    let q_is_double = wire(p, Wire::Qm);
    let q_elliptic = wire(p, Wire::QElliptic);
    let x_diff = x_2 - x_1;
    let y1_sqr = y_1 * y_1;

    let y2_sqr = y_2 * y_2;
    let y1y2 = y_1 * y_2 * q_sign;
    let x_add_identity = (x_3 + x_2 + x_1) * x_diff * x_diff - y2_sqr - y1_sqr + y1y2 + y1y2;

    let y_diff = y_2 * q_sign - y_1;
    let y_add_identity = (y_1 + y_3) * x_diff + (x_3 - x_1) * y_diff;

    let x_pow_4 = (y1_sqr + Fr::from_u64(17)) * x_1;
    let y1_sqr_mul_4 = y1_sqr + y1_sqr + y1_sqr + y1_sqr;
    let x1_pow_4_mul_9 = x_pow_4 * Fr::from_u64(9);
    let x_double_identity = (x_3 + x_1 + x_1) * y1_sqr_mul_4 - x1_pow_4_mul_9;

    let x1_sqr_mul_3 = (x_1 + x_1 + x_1) * x_1;
    let y_double_identity = x1_sqr_mul_3 * (x_1 - x_3) - (y_1 + y_1) * (y_1 + y_3);

    evals[11] = x_add_identity * domain_sep * q_elliptic * (Fr::one() - q_is_double)
        + x_double_identity * domain_sep * q_elliptic * q_is_double;
    evals[12] = y_add_identity * domain_sep * q_elliptic * (Fr::one() - q_is_double)
        + y_double_identity * domain_sep * q_elliptic * q_is_double;
}

fn accumulate_memory_relation(
    p: &[Fr],
    rp: &RelationParameters,
    evals: &mut [Fr],
    domain_sep: Fr,
) {
    let mut memory_record_check = wire(p, Wire::Wo) * rp.eta_three
        + wire(p, Wire::Wr) * rp.eta_two
        + wire(p, Wire::Wl) * rp.eta
        + wire(p, Wire::Qc);
    let partial_record_check = memory_record_check;
    memory_record_check = memory_record_check - wire(p, Wire::W4);

    let index_delta = wire(p, Wire::WlShift) - wire(p, Wire::Wl);
    let record_delta = wire(p, Wire::W4Shift) - wire(p, Wire::W4);
    let index_is_monotonically_increasing = index_delta * (index_delta - Fr::one());
    let adjacent_values_match_if_adjacent_indices_match = (Fr::one() - index_delta) * record_delta;

    let q_memory_by_domain = wire(p, Wire::QMemory) * domain_sep;
    evals[14] = adjacent_values_match_if_adjacent_indices_match
        * wire(p, Wire::Ql)
        * wire(p, Wire::Qr)
        * q_memory_by_domain;
    evals[15] = index_is_monotonically_increasing
        * wire(p, Wire::Ql)
        * wire(p, Wire::Qr)
        * q_memory_by_domain;

    let access_type = wire(p, Wire::W4) - partial_record_check;
    let access_check = access_type * (access_type - Fr::one());

    let mut next_gate_access_type = wire(p, Wire::WoShift) * rp.eta_three
        + wire(p, Wire::WrShift) * rp.eta_two
        + wire(p, Wire::WlShift) * rp.eta;
    next_gate_access_type = wire(p, Wire::W4Shift) - next_gate_access_type;

    let value_delta = wire(p, Wire::WoShift) - wire(p, Wire::Wo);
    let adjacent_values_match_if_adjacent_indices_match_and_next_access_is_a_read_operation =
        (Fr::one() - index_delta) * value_delta * (Fr::one() - next_gate_access_type);

    evals[16] = adjacent_values_match_if_adjacent_indices_match_and_next_access_is_a_read_operation
        * wire(p, Wire::Qo)
        * q_memory_by_domain;
    evals[17] = index_is_monotonically_increasing * wire(p, Wire::Qo) * q_memory_by_domain;
    evals[18] = (next_gate_access_type * next_gate_access_type - next_gate_access_type)
        * wire(p, Wire::Qo)
        * q_memory_by_domain;

    let rom_consistency_check_identity =
        memory_record_check * wire(p, Wire::Ql) * wire(p, Wire::Qr);
    let ram_timestamp_check_identity =
        (Fr::one() - index_delta) * (wire(p, Wire::WrShift) - wire(p, Wire::Wr))
            - wire(p, Wire::Wo);
    let ram_consistency_check_identity = access_check * wire(p, Wire::Qo);

    let memory_identity = rom_consistency_check_identity
        + ram_timestamp_check_identity * wire(p, Wire::Q4) * wire(p, Wire::Ql)
        + memory_record_check * wire(p, Wire::Qm) * wire(p, Wire::Ql)
        + ram_consistency_check_identity;

    evals[13] = memory_identity * q_memory_by_domain;
}

fn accumulate_nnf_relation(p: &[Fr], evals: &mut [Fr], domain_sep: Fr) {
    let limb_size = Fr::from_str("0x100000000000000000");
    let sublimb_shift = Fr::from_u64(1 << 14);

    let mut limb_subproduct =
        wire(p, Wire::Wl) * wire(p, Wire::WrShift) + wire(p, Wire::WlShift) * wire(p, Wire::Wr);

    let mut non_native_field_gate_2 = wire(p, Wire::Wl) * wire(p, Wire::W4)
        + wire(p, Wire::Wr) * wire(p, Wire::Wo)
        - wire(p, Wire::WoShift);
    non_native_field_gate_2 =
        non_native_field_gate_2 * limb_size - wire(p, Wire::W4Shift) + limb_subproduct;
    non_native_field_gate_2 = non_native_field_gate_2 * wire(p, Wire::Q4);

    limb_subproduct =
        limb_subproduct * limb_size + wire(p, Wire::WlShift) * wire(p, Wire::WrShift);

    let non_native_field_gate_1 =
        (limb_subproduct - (wire(p, Wire::Wo) + wire(p, Wire::W4))) * wire(p, Wire::Qo);
    let non_native_field_gate_3 = (limb_subproduct + wire(p, Wire::W4)
        - (wire(p, Wire::WoShift) + wire(p, Wire::W4Shift)))
        * wire(p, Wire::Qm);

    let non_native_field_identity =
        (non_native_field_gate_1 + non_native_field_gate_2 + non_native_field_gate_3)
            * wire(p, Wire::Qr);

    let mut limb_accumulator_1 = wire(p, Wire::WrShift) * sublimb_shift + wire(p, Wire::WlShift);
    limb_accumulator_1 = limb_accumulator_1 * sublimb_shift + wire(p, Wire::Wo);
    limb_accumulator_1 = limb_accumulator_1 * sublimb_shift + wire(p, Wire::Wr);
    limb_accumulator_1 = limb_accumulator_1 * sublimb_shift + wire(p, Wire::Wl);
    limb_accumulator_1 = (limb_accumulator_1 - wire(p, Wire::W4)) * wire(p, Wire::Q4);

    let mut limb_accumulator_2 = wire(p, Wire::WoShift) * sublimb_shift + wire(p, Wire::WrShift);
    limb_accumulator_2 = limb_accumulator_2 * sublimb_shift + wire(p, Wire::WlShift);
    limb_accumulator_2 = limb_accumulator_2 * sublimb_shift + wire(p, Wire::W4);
    limb_accumulator_2 = limb_accumulator_2 * sublimb_shift + wire(p, Wire::Wo);
    limb_accumulator_2 = (limb_accumulator_2 - wire(p, Wire::W4Shift)) * wire(p, Wire::Qm);

    let limb_accumulator_identity = (limb_accumulator_1 + limb_accumulator_2) * wire(p, Wire::Qo);
    let nnf_identity = non_native_field_identity + limb_accumulator_identity;
    evals[19] = nnf_identity * wire(p, Wire::QNnf) * domain_sep;
}

fn accumulate_poseidon_external_relation(p: &[Fr], evals: &mut [Fr], domain_sep: Fr) {
    let s1 = wire(p, Wire::Wl) + wire(p, Wire::Ql);
    let s2 = wire(p, Wire::Wr) + wire(p, Wire::Qr);
    let s3 = wire(p, Wire::Wo) + wire(p, Wire::Qo);
    let s4 = wire(p, Wire::W4) + wire(p, Wire::Q4);

    let u1 = s1.pow(5);
    let u2 = s2.pow(5);
    let u3 = s3.pow(5);
    let u4 = s4.pow(5);

    let t0 = u1 + u2;
    let t1 = u3 + u4;
    let t2 = u2 + u2 + t1;
    let t3 = u4 + u4 + t0;
    let v4 = t1 + t1 + t1 + t1 + t3;
    let v2 = t0 + t0 + t0 + t0 + t2;
    let v1 = t3 + v2;
    let v3 = t2 + v4;

    let q_pos_by_scaling = wire(p, Wire::QPoseidon2External) * domain_sep;
    evals[20] = evals[20] + q_pos_by_scaling * (v1 - wire(p, Wire::WlShift));
    evals[21] = evals[21] + q_pos_by_scaling * (v2 - wire(p, Wire::WrShift));
    evals[22] = evals[22] + q_pos_by_scaling * (v3 - wire(p, Wire::WoShift));
    evals[23] = evals[23] + q_pos_by_scaling * (v4 - wire(p, Wire::W4Shift));
}

fn accumulate_poseidon_internal_relation(p: &[Fr], evals: &mut [Fr], domain_sep: Fr) {
    let u1 = (wire(p, Wire::Wl) + wire(p, Wire::Ql)).pow(5);
    let u2 = wire(p, Wire::Wr);
    let u3 = wire(p, Wire::Wo);
    let u4 = wire(p, Wire::W4);
    let u_sum = u1 + u2 + u3 + u4;
    let diag = internal_matrix_diagonal();
    let q_pos_by_scaling = wire(p, Wire::QPoseidon2Internal) * domain_sep;

    evals[24] = evals[24] + q_pos_by_scaling * (u1 * diag[0] + u_sum - wire(p, Wire::WlShift));
    evals[25] = evals[25] + q_pos_by_scaling * (u2 * diag[1] + u_sum - wire(p, Wire::WrShift));
    evals[26] = evals[26] + q_pos_by_scaling * (u3 * diag[2] + u_sum - wire(p, Wire::WoShift));
    evals[27] = evals[27] + q_pos_by_scaling * (u4 * diag[3] + u_sum - wire(p, Wire::W4Shift));
}

fn scale_and_batch_subrelations(evaluations: &[Fr], subrelation_challenges: &[Fr]) -> Fr {
    let mut accumulator = evaluations[0];
    for i in 1..NUMBER_OF_SUBRELATIONS {
        accumulator = accumulator + evaluations[i] * subrelation_challenges[i - 1];
    }
    accumulator
}

pub fn accumulate_relation_evaluations(
    purported_evaluations: &[Fr],
    rp: &RelationParameters,
    alphas: &[Fr],
    pow_partial_eval: Fr,
) -> Fr {
    let mut evaluations = [Fr::zero(); NUMBER_OF_SUBRELATIONS];

    accumulate_arithmetic_relation(purported_evaluations, &mut evaluations, pow_partial_eval);
    accumulate_permutation_relation(
        purported_evaluations,
        rp,
        &mut evaluations,
        pow_partial_eval,
    );
    accumulate_log_derivative_lookup_relation(
        purported_evaluations,
        rp,
        &mut evaluations,
        pow_partial_eval,
    );
    accumulate_delta_range_relation(purported_evaluations, &mut evaluations, pow_partial_eval);
    accumulate_elliptic_relation(purported_evaluations, &mut evaluations, pow_partial_eval);
    accumulate_memory_relation(
        purported_evaluations,
        rp,
        &mut evaluations,
        pow_partial_eval,
    );
    accumulate_nnf_relation(purported_evaluations, &mut evaluations, pow_partial_eval);
    accumulate_poseidon_external_relation(
        purported_evaluations,
        &mut evaluations,
        pow_partial_eval,
    );
    accumulate_poseidon_internal_relation(
        purported_evaluations,
        &mut evaluations,
        pow_partial_eval,
    );

    scale_and_batch_subrelations(&evaluations, alphas)
}
