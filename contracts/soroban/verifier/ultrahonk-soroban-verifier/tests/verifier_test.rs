use soroban_sdk::{testutils::Ledger, Bytes, Env};
use std::{fs, path::Path};
use ultrahonk_soroban_verifier::UltraHonkVerifier;

fn parse_hash_hex(hex: &str) -> Result<[u8; 32], String> {
    let hex = hex.trim().strip_prefix("0x").unwrap_or(hex.trim());
    if hex.len() != 64 {
        return Err("vk_hash hex must be 32 bytes".to_string());
    }
    let mut out = [0_u8; 32];
    for i in 0..32 {
        out[i] = u8::from_str_radix(&hex[i * 2..i * 2 + 2], 16).map_err(|e| e.to_string())?;
    }
    Ok(out)
}

fn read_vk_hash(path: &Path) -> Result<[u8; 32], String> {
    if let Ok(bytes) = fs::read(path.join("vk_hash")) {
        return bytes
            .try_into()
            .map_err(|_| "vk_hash must be 32 bytes".to_string());
    }
    let hex_path = path
        .parent()
        .ok_or_else(|| "missing vk_hash path parent".to_string())?
        .join("vk_hash.hex");
    let hex = fs::read_to_string(hex_path).map_err(|e| e.to_string())?;
    parse_hash_hex(&hex)
}

fn run(dir: &str) -> Result<(), String> {
    let path = Path::new(dir);
    let env = Env::default();
    env.ledger().set_protocol_version(26);
    env.cost_estimate().budget().reset_unlimited();

    // Proof bytes
    let proof_bytes: Vec<u8> = fs::read(path.join("proof")).map_err(|e| e.to_string())?;
    let proof = Bytes::from_slice(&env, &proof_bytes);

    // Use binary VK
    let vk_bytes = fs::read(path.join("vk")).map_err(|e| e.to_string())?;
    let vk = Bytes::from_slice(&env, &vk_bytes);
    let vk_hash = read_vk_hash(path)?;
    let verifier =
        UltraHonkVerifier::new_with_vk_hash(&env, &vk, vk_hash).map_err(|e| format!("{e:?}"))?;

    // Public inputs bytes
    let public_inputs = fs::read(path.join("public_inputs")).map_err(|e| e.to_string())?;
    let public_inputs = Bytes::from_slice(&env, &public_inputs);
    verifier
        .verify(&proof, &public_inputs)
        .map_err(|e| format!("{e:?}"))?;
    Ok(())
}

#[test]
#[ignore = "legacy bb v0.87 fixture; current verifier targets bb v2 proof/vk layout"]
fn simple_circuit_proof_verifies() -> Result<(), String> {
    run("circuits/simple_circuit/target")
}

#[test]
#[ignore = "legacy bb v0.87 fixture; current verifier targets bb v2 proof/vk layout"]
fn fib_chain_proof_verifies() -> Result<(), String> {
    run("circuits/fib_chain/target")
}

#[test]
fn zarf_bb_v2_proof_verifies() -> Result<(), String> {
    run("../tests/zarf/target")
}
