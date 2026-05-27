#![no_std]
use soroban_sdk::{
    contract, contracterror, contractimpl, symbol_short, Bytes, BytesN, Env, Symbol,
};
use ultrahonk_soroban_verifier::UltraHonkVerifier;

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
    pub fn __constructor(env: Env, vk_bytes: Bytes, vk_hash: BytesN<32>) -> Result<(), Error> {
        if vk_hash.to_array() == [0_u8; 32] {
            return Err(Error::VkParseError);
        }
        UltraHonkVerifier::new_with_vk_hash(&env, &vk_bytes, vk_hash.to_array())
            .map_err(|_| Error::VkParseError)?;
        env.storage().instance().set(&Self::key_vk(), &vk_bytes);
        env.storage().instance().set(&Self::key_vk_hash(), &vk_hash);
        Ok(())
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
        Ok(())
    }
}
