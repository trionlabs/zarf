#![no_std]
use soroban_sdk::{
    contract, contracterror, contractimpl, symbol_short, Bytes, BytesN, Env, Symbol,
};
use ultrahonk_soroban_verifier::UltraHonkVerifier;

/// One day of ledgers at the ~5s close time.
pub const DAY_IN_LEDGERS: u32 = 17_280;
/// TTL target for the instance/code entries: ~120 days, safely under the
/// ~180-day network maximum. The verifier is otherwise stateless — nothing
/// in-protocol would ever bump its TTL, and an archived verifier makes every
/// claim fail until an external restore.
pub const TTL_EXTEND_TO: u32 = 120 * DAY_IN_LEDGERS;
pub const TTL_THRESHOLD: u32 = TTL_EXTEND_TO - DAY_IN_LEDGERS;
pub const CONTRACT_VERSION: u32 = 1;

/// Contract
#[contract]
pub struct UltraHonkVerifierContract;

#[contracterror]
#[repr(u32)]
#[derive(Copy, Clone, Debug, Eq, PartialEq)]
pub enum Error {
    VkParseError = 1,
    ProofParseError = 2,
    VerificationFailed = 3,
    VkNotSet = 4,
}

#[contractimpl]
impl UltraHonkVerifierContract {
    fn key_vk() -> Symbol {
        symbol_short!("vk")
    }

    fn key_vk_hash() -> Symbol {
        symbol_short!("vk_hash")
    }

    /// Initialize the on-chain VK once at deploy time.
    ///
    /// `vk_hash` is bb's own verification-key hash (it feeds the Fiat-Shamir
    /// transcript's first challenge). It is NOT a keccak of `vk_bytes` — bb
    /// derives it internally from the VK fields — so it cannot be recomputed
    /// here. A mismatched pair fails closed (no proof verifies), but a
    /// deployer-supplied *consistent* pair for a different circuit would
    /// verify that other circuit: deployment tooling MUST validate the pair
    /// by verifying a known-good fixture proof against the freshly deployed
    /// instance before wiring it into the factory.
    pub fn __constructor(env: Env, vk_bytes: Bytes, vk_hash: BytesN<32>) -> Result<(), Error> {
        if vk_hash.to_array() == [0_u8; 32] {
            return Err(Error::VkParseError);
        }
        UltraHonkVerifier::new_with_vk_hash(&env, &vk_bytes, vk_hash.to_array())
            .map_err(|_| Error::VkParseError)?;
        env.storage().instance().set(&Self::key_vk(), &vk_bytes);
        env.storage().instance().set(&Self::key_vk_hash(), &vk_hash);
        Self::extend_contract_ttl(&env);
        Ok(())
    }

    pub fn version() -> u32 {
        CONTRACT_VERSION
    }

    /// Return the hash of the parsed verification key.
    pub fn vk_hash(env: Env) -> Result<BytesN<32>, Error> {
        env.storage()
            .instance()
            .get(&Self::key_vk_hash())
            .ok_or(Error::VkNotSet)
    }

    /// Verify an UltraHonk proof using the stored VK.
    pub fn verify_proof(env: Env, public_inputs: Bytes, proof_bytes: Bytes) -> Result<(), Error> {
        let vk_bytes: Bytes = env
            .storage()
            .instance()
            .get(&Self::key_vk())
            .ok_or(Error::VkNotSet)?;
        let vk_hash: BytesN<32> = env
            .storage()
            .instance()
            .get(&Self::key_vk_hash())
            .ok_or(Error::VkNotSet)?;
        // Deserialize verification key bytes
        let verifier = UltraHonkVerifier::new_with_vk_hash(&env, &vk_bytes, vk_hash.to_array())
            .map_err(|_| Error::VkParseError)?;
        if proof_bytes.len() as usize != verifier.expected_proof_bytes() {
            return Err(Error::ProofParseError);
        }

        // Verify
        verifier
            .verify(&proof_bytes, &public_inputs)
            .map_err(|_| Error::VerificationFailed)?;
        // Keep the instance (VK) alive: this contract is otherwise stateless
        // and nothing else in-protocol bumps its TTL.
        Self::extend_contract_ttl(&env);
        Ok(())
    }

    fn extend_contract_ttl(env: &Env) {
        env.deployer()
            .extend_ttl(env.current_contract_address(), TTL_THRESHOLD, TTL_EXTEND_TO);
    }
}
