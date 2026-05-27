use soroban_sdk::{Bytes, BytesN, Env};

const CONTRACT_WASM: &[u8] =
    include_bytes!("../target/wasm32v1-none/release/rs_soroban_ultrahonk.wasm");

mod ultrahonk_contract {
    soroban_sdk::contractimport!(file = "target/wasm32v1-none/release/rs_soroban_ultrahonk.wasm");
}

fn hex_to_bytes32(hex: &str) -> [u8; 32] {
    let hex = hex.trim().strip_prefix("0x").unwrap_or(hex.trim());
    assert_eq!(hex.len(), 64, "expected 32-byte hex string");
    let mut out = [0_u8; 32];
    for i in 0..32 {
        out[i] = u8::from_str_radix(&hex[i * 2..i * 2 + 2], 16).expect("valid hex");
    }
    out
}

fn zarf_vk_hash(env: &Env) -> BytesN<32> {
    BytesN::from_array(env, &hex_to_bytes32(include_str!("zarf/vk_hash.hex")))
}

fn wrong_vk_hash(env: &Env) -> BytesN<32> {
    BytesN::from_array(env, &[1_u8; 32])
}

fn register_client<'a>(
    env: &'a Env,
    vk_bytes: &Bytes,
    vk_hash: &BytesN<32>,
) -> ultrahonk_contract::Client<'a> {
    let contract_id = env.register(CONTRACT_WASM, (vk_bytes.clone(), vk_hash.clone()));
    ultrahonk_contract::Client::new(env, &contract_id)
}

#[test]
#[ignore = "legacy bb v0.87 fixture; current verifier targets bb v2 proof/vk layout"]
fn verify_simple_circuit_proof_succeeds() {
    let vk_bytes_raw: &[u8] = include_bytes!("simple_circuit/target/vk");
    let proof_bin: &[u8] = include_bytes!("simple_circuit/target/proof");
    let pub_inputs_bin: &[u8] = include_bytes!("simple_circuit/target/public_inputs");

    let env = Env::default();
    env.cost_estimate().budget().reset_unlimited();

    // Prepare inputs
    let vk_bytes = Bytes::from_slice(&env, vk_bytes_raw);
    let proof_bytes: Bytes = Bytes::from_slice(&env, proof_bin);
    let public_inputs: Bytes = Bytes::from_slice(&env, pub_inputs_bin);

    let client = register_client(&env, &vk_bytes, &zarf_vk_hash(&env));
    client.verify_proof(&public_inputs, &proof_bytes);
}

#[test]
#[ignore = "legacy bb v0.87 fixture; current verifier targets bb v2 proof/vk layout"]
fn verify_fib_chain_proof_succeeds() {
    let vk_bytes_raw: &[u8] = include_bytes!("fib_chain/target/vk");
    let proof_bin: &[u8] = include_bytes!("fib_chain/target/proof");
    let pub_inputs_bin: &[u8] = include_bytes!("fib_chain/target/public_inputs");

    let env = Env::default();
    env.cost_estimate().budget().reset_unlimited();

    // Prepare inputs
    let vk_bytes = Bytes::from_slice(&env, vk_bytes_raw);
    let proof_bytes: Bytes = Bytes::from_slice(&env, proof_bin);
    let public_inputs: Bytes = Bytes::from_slice(&env, pub_inputs_bin);

    let client = register_client(&env, &vk_bytes, &zarf_vk_hash(&env));
    client.verify_proof(&public_inputs, &proof_bytes);
}

#[test]
fn verify_zarf_bb_v2_proof_succeeds() {
    let vk_bytes_raw: &[u8] = include_bytes!("zarf/target/vk");
    let proof_bin: &[u8] = include_bytes!("zarf/target/proof");
    let pub_inputs_bin: &[u8] = include_bytes!("zarf/target/public_inputs");

    let env = Env::default();
    env.cost_estimate().budget().reset_unlimited();

    let vk_bytes = Bytes::from_slice(&env, vk_bytes_raw);
    let proof_bytes: Bytes = Bytes::from_slice(&env, proof_bin);
    let public_inputs: Bytes = Bytes::from_slice(&env, pub_inputs_bin);

    let client = register_client(&env, &vk_bytes, &zarf_vk_hash(&env));
    client.verify_proof(&public_inputs, &proof_bytes);
}

#[test]
fn vk_hash_getter_returns_deployed_fixture_hash() {
    let vk_bytes_raw: &[u8] = include_bytes!("zarf/target/vk");

    let env = Env::default();
    env.cost_estimate().budget().reset_unlimited();

    let vk_hash = zarf_vk_hash(&env);
    let vk_bytes = Bytes::from_slice(&env, vk_bytes_raw);
    let client = register_client(&env, &vk_bytes, &vk_hash);

    assert_eq!(client.vk_hash(), vk_hash);
}

#[test]
#[should_panic]
fn rejects_zero_vk_hash_at_deploy() {
    let vk_bytes_raw: &[u8] = include_bytes!("zarf/target/vk");

    let env = Env::default();
    env.cost_estimate().budget().reset_unlimited();

    let vk_bytes = Bytes::from_slice(&env, vk_bytes_raw);
    let zero_hash = BytesN::from_array(&env, &[0_u8; 32]);
    let _ = register_client(&env, &vk_bytes, &zero_hash);
}

#[test]
fn wrong_vk_hash_bricks_otherwise_valid_proof() {
    let vk_bytes_raw: &[u8] = include_bytes!("zarf/target/vk");
    let proof_bin: &[u8] = include_bytes!("zarf/target/proof");
    let pub_inputs_bin: &[u8] = include_bytes!("zarf/target/public_inputs");

    let env = Env::default();
    env.cost_estimate().budget().reset_unlimited();

    let vk_bytes = Bytes::from_slice(&env, vk_bytes_raw);
    let proof_bytes: Bytes = Bytes::from_slice(&env, proof_bin);
    let public_inputs: Bytes = Bytes::from_slice(&env, pub_inputs_bin);

    let client = register_client(&env, &vk_bytes, &wrong_vk_hash(&env));
    assert!(
        client
            .try_verify_proof(&public_inputs, &proof_bytes)
            .is_err(),
        "wrong VK hash unexpectedly verified",
    );
}

#[test]
fn rejects_truncated_zarf_proof() {
    let vk_bytes_raw: &[u8] = include_bytes!("zarf/target/vk");
    let proof_bin: &[u8] = include_bytes!("zarf/target/proof");
    let pub_inputs_bin: &[u8] = include_bytes!("zarf/target/public_inputs");

    let env = Env::default();
    env.cost_estimate().budget().reset_unlimited();

    let vk_bytes = Bytes::from_slice(&env, vk_bytes_raw);
    let proof_bytes = Bytes::from_slice(&env, &proof_bin[..proof_bin.len() - 1]);
    let public_inputs = Bytes::from_slice(&env, pub_inputs_bin);

    let client = register_client(&env, &vk_bytes, &zarf_vk_hash(&env));
    assert!(
        client
            .try_verify_proof(&public_inputs, &proof_bytes)
            .is_err(),
        "truncated proof unexpectedly verified",
    );
}

#[test]
fn rejects_mutated_zarf_proof() {
    let vk_bytes_raw: &[u8] = include_bytes!("zarf/target/vk");
    let proof_bin: &[u8] = include_bytes!("zarf/target/proof");
    let pub_inputs_bin: &[u8] = include_bytes!("zarf/target/public_inputs");

    let env = Env::default();
    env.cost_estimate().budget().reset_unlimited();

    let mut mutated = proof_bin.to_vec();
    mutated[0] ^= 1;
    let vk_bytes = Bytes::from_slice(&env, vk_bytes_raw);
    let proof_bytes = Bytes::from_slice(&env, &mutated);
    let public_inputs = Bytes::from_slice(&env, pub_inputs_bin);

    let client = register_client(&env, &vk_bytes, &zarf_vk_hash(&env));
    assert!(
        client
            .try_verify_proof(&public_inputs, &proof_bytes)
            .is_err(),
        "mutated proof unexpectedly verified",
    );
}

#[test]
#[should_panic]
fn rejects_invalid_vk_bytes_at_deploy() {
    let env = Env::default();
    env.cost_estimate().budget().reset_unlimited();

    let vk_bytes = Bytes::from_slice(&env, &[1_u8; 32]);
    let _ = register_client(&env, &vk_bytes, &zarf_vk_hash(&env));
}

#[test]
#[should_panic]
fn rejects_unsupported_vk_log_n_at_deploy() {
    let vk_bytes_raw: &[u8] = include_bytes!("zarf/target/vk");
    let mut invalid_vk = vk_bytes_raw.to_vec();
    invalid_vk[31] = 0;

    let env = Env::default();
    env.cost_estimate().budget().reset_unlimited();

    let vk_bytes = Bytes::from_slice(&env, &invalid_vk);
    let _ = register_client(&env, &vk_bytes, &zarf_vk_hash(&env));
}

#[test]
fn malformed_public_inputs_do_not_verify() {
    let vk_bytes_raw: &[u8] = include_bytes!("zarf/target/vk");
    let proof_bin: &[u8] = include_bytes!("zarf/target/proof");

    let env = Env::default();
    env.cost_estimate().budget().reset_unlimited();

    let vk_bytes = Bytes::from_slice(&env, vk_bytes_raw);
    let proof_bytes = Bytes::from_slice(&env, proof_bin);
    let public_inputs = Bytes::from_slice(&env, &[1_u8; 31]);

    let client = register_client(&env, &vk_bytes, &zarf_vk_hash(&env));
    assert!(
        client
            .try_verify_proof(&public_inputs, &proof_bytes)
            .is_err(),
        "malformed public inputs unexpectedly verified",
    );
}

#[test]
#[ignore = "legacy bb v0.87 fixture; current verifier targets bb v2 proof/vk layout"]
fn print_budget_for_deploy_and_verify() {
    let vk_bytes_raw: &[u8] = include_bytes!("simple_circuit/target/vk");
    let proof_bin: &[u8] = include_bytes!("simple_circuit/target/proof");
    let pub_inputs_bin: &[u8] = include_bytes!("simple_circuit/target/public_inputs");

    let env = Env::default();

    // Measure deploy budget usage.
    env.cost_estimate().budget().reset_unlimited();
    let vk_bytes = Bytes::from_slice(&env, vk_bytes_raw);
    let client = register_client(&env, &vk_bytes, &zarf_vk_hash(&env));

    println!("=== Deploy budget usage ===");
    env.cost_estimate().budget().print();

    // Prepare proof inputs
    let proof_bytes: Bytes = Bytes::from_slice(&env, proof_bin);
    let public_inputs: Bytes = Bytes::from_slice(&env, pub_inputs_bin);

    // Measure verify_proof invocation budget usage in isolation.
    env.cost_estimate().budget().reset_unlimited();
    client.verify_proof(&public_inputs, &proof_bytes);
    println!("=== verify_proof budget usage ===");
    env.cost_estimate().budget().print();
}
