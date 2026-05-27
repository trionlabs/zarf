#![no_std]

use soroban_sdk::{
    contract, contracterror, contractevent, contractimpl, contracttype, Address, Bytes, BytesN,
    Env, String, Vec,
};

const PUBKEY_LIMBS: u32 = 18;

#[contract]
pub struct JwkRegistryContract;

#[contracterror]
#[repr(u32)]
#[derive(Copy, Clone, Debug, Eq, PartialEq)]
pub enum Error {
    Unauthorized = 1,
    InvalidKeyLength = 2,
    KeyNotFound = 3,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum DataKey {
    Owner,
    Key(BytesN<32>),
    Kid(String),
    KeyCount,
    KeyAt(u32),
}

#[contractevent(topics = ["owner_set"])]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct OwnershipTransferred {
    #[topic]
    pub previous_owner: Address,
    #[topic]
    pub new_owner: Address,
}

#[contractevent(topics = ["key_registered"])]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct KeyRegistered {
    #[topic]
    pub key_hash: BytesN<32>,
    pub kid: String,
}

#[contractevent(topics = ["key_revoked"], data_format = "single-value")]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct KeyRevoked {
    #[topic]
    pub key_hash: BytesN<32>,
}

#[contractimpl]
impl JwkRegistryContract {
    pub fn __constructor(env: Env, owner: Address) {
        env.storage().instance().set(&DataKey::Owner, &owner);
        env.storage().instance().set(&DataKey::KeyCount, &0_u32);
    }

    pub fn owner(env: Env) -> Address {
        Self::owner_unchecked(&env)
    }

    pub fn transfer_ownership(env: Env, new_owner: Address) {
        let owner = Self::owner_unchecked(&env);
        owner.require_auth();
        env.storage().instance().set(&DataKey::Owner, &new_owner);
        OwnershipTransferred {
            previous_owner: owner,
            new_owner,
        }
        .publish(&env);
    }

    pub fn register_key(
        env: Env,
        kid: String,
        pubkey_limbs: Vec<BytesN<32>>,
    ) -> Result<BytesN<32>, Error> {
        Self::require_owner(&env);
        let key_hash = Self::compute_hash(&env, &pubkey_limbs)?;
        Self::store_key(&env, kid, key_hash.clone());
        Ok(key_hash)
    }

    fn store_key(env: &Env, kid: String, key_hash: BytesN<32>) {
        if !Self::is_valid_key_hash(env.clone(), key_hash.clone()) {
            let count = Self::key_count(env);
            env.storage()
                .persistent()
                .set(&DataKey::KeyAt(count), &key_hash);
            env.storage()
                .instance()
                .set(&DataKey::KeyCount, &(count + 1));
        }

        env.storage()
            .persistent()
            .set(&DataKey::Key(key_hash.clone()), &true);
        env.storage()
            .persistent()
            .set(&DataKey::Kid(kid.clone()), &key_hash);
        KeyRegistered {
            key_hash: key_hash.clone(),
            kid,
        }
        .publish(&env);
    }

    pub fn revoke_key(env: Env, key_hash: BytesN<32>) -> Result<(), Error> {
        Self::require_owner(&env);
        if !Self::is_valid_key_hash(env.clone(), key_hash.clone()) {
            return Err(Error::KeyNotFound);
        }

        env.storage()
            .persistent()
            .set(&DataKey::Key(key_hash.clone()), &false);
        KeyRevoked { key_hash }.publish(&env);
        Ok(())
    }

    pub fn is_valid_key_hash(env: Env, key_hash: BytesN<32>) -> bool {
        env.storage()
            .persistent()
            .get(&DataKey::Key(key_hash))
            .unwrap_or(false)
    }

    pub fn is_valid_key(env: Env, pubkey_limbs: Vec<BytesN<32>>) -> Result<bool, Error> {
        let key_hash = Self::compute_hash(&env, &pubkey_limbs)?;
        Ok(Self::is_valid_key_hash(env, key_hash))
    }

    pub fn compute_key_hash(env: Env, pubkey_limbs: Vec<BytesN<32>>) -> Result<BytesN<32>, Error> {
        Self::compute_hash(&env, &pubkey_limbs)
    }

    pub fn get_registered_key_count(env: Env) -> u32 {
        Self::key_count(&env)
    }

    pub fn get_registered_key(env: Env, index: u32) -> Result<BytesN<32>, Error> {
        env.storage()
            .persistent()
            .get(&DataKey::KeyAt(index))
            .ok_or(Error::KeyNotFound)
    }

    pub fn is_kid_registered(env: Env, kid: String) -> bool {
        let Some(key_hash) = env
            .storage()
            .persistent()
            .get::<DataKey, BytesN<32>>(&DataKey::Kid(kid))
        else {
            return false;
        };
        Self::is_valid_key_hash(env, key_hash)
    }

    fn owner_unchecked(env: &Env) -> Address {
        env.storage()
            .instance()
            .get(&DataKey::Owner)
            .expect("registry owner is not initialized")
    }

    fn require_owner(env: &Env) {
        Self::owner_unchecked(env).require_auth();
    }

    fn key_count(env: &Env) -> u32 {
        env.storage()
            .instance()
            .get(&DataKey::KeyCount)
            .unwrap_or(0_u32)
    }

    fn compute_hash(env: &Env, pubkey_limbs: &Vec<BytesN<32>>) -> Result<BytesN<32>, Error> {
        if pubkey_limbs.len() != PUBKEY_LIMBS {
            return Err(Error::InvalidKeyLength);
        }

        let mut packed = Bytes::new(env);
        for limb in pubkey_limbs.iter() {
            packed.extend_from_array(&limb.to_array());
        }
        Ok(env.crypto().keccak256(&packed).to_bytes())
    }
}
