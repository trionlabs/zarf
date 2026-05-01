use soroban_sdk::{Bytes, Env};
mod c { soroban_sdk::contractimport!(file = "target/wasm32v1-none/release/rs_soroban_ultrahonk.wasm"); }
const WASM: &[u8] = include_bytes!("../target/wasm32v1-none/release/rs_soroban_ultrahonk.wasm");

fn measure(name: &str, vk: &[u8], proof: &[u8], pi: &[u8]) {
    let env = Env::default();
    env.cost_estimate().budget().reset_unlimited();
    let id = env.register(WASM, (Bytes::from_slice(&env, vk),));
    let cli = c::Client::new(&env, &id);
    cli.verify_proof(&Bytes::from_slice(&env, pi), &Bytes::from_slice(&env, proof));
    let b = env.cost_estimate().budget();
    println!("=== {} ===\n{:#?}", name, b);
}

#[test]
#[ignore = "legacy bb v0.87 fixture; current verifier targets bb v2 proof/vk layout"]
fn cost_simple() {
    let vk: &[u8] = include_bytes!("simple_circuit/target/vk");
    let proof: &[u8] = include_bytes!("simple_circuit/target/proof");
    let pi: &[u8] = include_bytes!("simple_circuit/target/public_inputs");
    measure("simple_circuit (x!=y)", vk, proof, pi);
}

#[test]
#[ignore = "legacy bb v0.87 fixture; current verifier targets bb v2 proof/vk layout"]
fn cost_fib() {
    let vk: &[u8] = include_bytes!("fib_chain/target/vk");
    let proof: &[u8] = include_bytes!("fib_chain/target/proof");
    let pi: &[u8] = include_bytes!("fib_chain/target/public_inputs");
    measure("fib_chain (fib10)", vk, proof, pi);
}

#[test]
fn cost_zarf_bb_v2() {
    let vk: &[u8] = include_bytes!("zarf/target/vk");
    let proof: &[u8] = include_bytes!("zarf/target/proof");
    let pi: &[u8] = include_bytes!("zarf/target/public_inputs");
    measure("zarf (bb v2.1.9)", vk, proof, pi);
}
