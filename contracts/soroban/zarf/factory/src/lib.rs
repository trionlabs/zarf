#![no_std]

use soroban_sdk::{
    contract, contracterror, contractevent, contractimpl, contracttype, crypto::BnScalar, token,
    xdr::ToXdr, Address, BytesN, Env, String, Val, Vec,
};

const BN254_SCALAR_MODULUS: [u8; 32] = [
    0x30, 0x64, 0x4e, 0x72, 0xe1, 0x31, 0xa0, 0x29, 0xb8, 0x50, 0x45, 0xb6, 0x81, 0x81, 0x58, 0x5d,
    0x28, 0x33, 0xe8, 0x48, 0x79, 0xb9, 0x70, 0x91, 0x43, 0xe1, 0xf5, 0x93, 0xf0, 0x00, 0x00, 0x01,
];

#[contract]
pub struct ZarfVestingFactoryContract;

#[contracterror]
#[repr(u32)]
#[derive(Copy, Clone, Debug, Eq, PartialEq)]
pub enum Error {
    NotInitialized = 1,
    InvalidRecipientCount = 2,
    InvalidAmount = 3,
    InvalidLimit = 4,
    InvalidMerkleRoot = 5,
    InvalidAudience = 6,
    TokenTransferMismatch = 7,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum DataKey {
    Verifier,
    JwkRegistry,
    VestingWasmHash,
    DeploymentCount,
    DeploymentAt(u32),
    OwnerDeploymentCount(Address),
    OwnerDeploymentAt(Address, u32),
    MetadataCid(Address),
}

#[contractevent(topics = ["vesting_created"])]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct VestingCreated {
    #[topic]
    pub vesting: Address,
    #[topic]
    pub owner: Address,
    #[topic]
    pub token: Address,
    pub total_amount: i128,
    pub recipient_count: u32,
    pub metadata_cid: String,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct DeploymentInfo {
    pub address: Address,
    pub metadata_cid: String,
}

#[contractimpl]
impl ZarfVestingFactoryContract {
    pub fn __constructor(
        env: Env,
        verifier: Address,
        jwk_registry: Address,
        vesting_wasm_hash: BytesN<32>,
    ) {
        let store = env.storage().instance();
        store.set(&DataKey::Verifier, &verifier);
        store.set(&DataKey::JwkRegistry, &jwk_registry);
        store.set(&DataKey::VestingWasmHash, &vesting_wasm_hash);
        store.set(&DataKey::DeploymentCount, &0_u32);
    }

    pub fn verifier(env: Env) -> Result<Address, Error> {
        Self::get_instance(&env, DataKey::Verifier)
    }

    pub fn jwk_registry(env: Env) -> Result<Address, Error> {
        Self::get_instance(&env, DataKey::JwkRegistry)
    }

    pub fn vesting_wasm_hash(env: Env) -> Result<BytesN<32>, Error> {
        Self::get_instance(&env, DataKey::VestingWasmHash)
    }

    pub fn recipient_id(env: Env, recipient: Address) -> BytesN<32> {
        let address_xdr = recipient.to_xdr(&env);
        let digest = env.crypto().keccak256(&address_xdr).to_bytes();
        BnScalar::from_bytes(digest).to_bytes()
    }

    pub fn predict_vesting_address(env: Env, owner: Address, salt: BytesN<32>) -> Address {
        let deployment_salt = Self::owner_bound_salt(&env, &owner, &salt);
        env.deployer()
            .with_current_contract(deployment_salt)
            .deployed_address()
    }

    #[allow(clippy::too_many_arguments)]
    pub fn create_vesting(
        env: Env,
        owner: Address,
        token: Address,
        salt: BytesN<32>,
        name: String,
        description: String,
        merkle_root: BytesN<32>,
        audience_hash: BytesN<32>,
        recipient_count: u32,
        total_amount: i128,
        metadata_cid: String,
    ) -> Result<Address, Error> {
        owner.require_auth();
        Self::validate_metadata(recipient_count, total_amount, false)?;
        Self::validate_initial_root(&merkle_root, false)?;
        Self::validate_nonzero_field(&audience_hash)?;

        let vesting = Self::deploy_vesting(
            &env,
            owner.clone(),
            token.clone(),
            salt,
            name,
            description,
            merkle_root,
            audience_hash,
            metadata_cid.clone(),
        )?;
        Self::track_deployment(
            &env,
            vesting.clone(),
            owner,
            token,
            total_amount,
            recipient_count,
            metadata_cid,
        );
        Ok(vesting)
    }

    #[allow(clippy::too_many_arguments)]
    pub fn create_and_fund_vesting(
        env: Env,
        owner: Address,
        token: Address,
        salt: BytesN<32>,
        name: String,
        description: String,
        merkle_root: BytesN<32>,
        audience_hash: BytesN<32>,
        recipient_count: u32,
        total_amount: i128,
        metadata_cid: String,
    ) -> Result<Address, Error> {
        owner.require_auth();
        Self::validate_metadata(recipient_count, total_amount, true)?;
        Self::validate_initial_root(&merkle_root, true)?;
        Self::validate_nonzero_field(&audience_hash)?;

        let vesting = Self::deploy_vesting(
            &env,
            owner.clone(),
            token.clone(),
            salt,
            name,
            description,
            merkle_root,
            audience_hash,
            metadata_cid.clone(),
        )?;

        let token_client = token::TokenClient::new(&env, &token);
        let before_balance = token_client.balance(&vesting);
        token_client.transfer_from(
            &env.current_contract_address(),
            &owner,
            &vesting,
            &total_amount,
        );
        let after_balance = token_client.balance(&vesting);
        if after_balance
            != before_balance
                .checked_add(total_amount)
                .ok_or(Error::TokenTransferMismatch)?
        {
            return Err(Error::TokenTransferMismatch);
        }

        Self::track_deployment(
            &env,
            vesting.clone(),
            owner,
            token,
            total_amount,
            recipient_count,
            metadata_cid,
        );
        Ok(vesting)
    }

    pub fn get_deployment_count(env: Env) -> u32 {
        Self::deployment_count(&env)
    }

    pub fn get_deployment(env: Env, index: u32) -> Result<Address, Error> {
        env.storage()
            .persistent()
            .get(&DataKey::DeploymentAt(index))
            .ok_or(Error::NotInitialized)
    }

    pub fn get_deployments(env: Env, start: u32, limit: u32) -> Result<Vec<Address>, Error> {
        Self::range(&env, start, limit, None)
    }

    pub fn get_deployment_info(env: Env, index: u32) -> Result<DeploymentInfo, Error> {
        Self::deployment_info(&env, DataKey::DeploymentAt(index))
    }

    pub fn get_deployment_infos(
        env: Env,
        start: u32,
        limit: u32,
    ) -> Result<Vec<DeploymentInfo>, Error> {
        Self::range_infos(&env, start, limit, None)
    }

    pub fn get_owner_deployment_count(env: Env, owner: Address) -> u32 {
        Self::owner_deployment_count(&env, &owner)
    }

    pub fn get_owner_deployment(env: Env, owner: Address, index: u32) -> Result<Address, Error> {
        env.storage()
            .persistent()
            .get(&DataKey::OwnerDeploymentAt(owner, index))
            .ok_or(Error::NotInitialized)
    }

    pub fn get_owner_deployments(
        env: Env,
        owner: Address,
        start: u32,
        limit: u32,
    ) -> Result<Vec<Address>, Error> {
        Self::range(&env, start, limit, Some(owner))
    }

    pub fn get_owner_deployment_info(
        env: Env,
        owner: Address,
        index: u32,
    ) -> Result<DeploymentInfo, Error> {
        Self::deployment_info(&env, DataKey::OwnerDeploymentAt(owner, index))
    }

    pub fn get_owner_deployment_infos(
        env: Env,
        owner: Address,
        start: u32,
        limit: u32,
    ) -> Result<Vec<DeploymentInfo>, Error> {
        Self::range_infos(&env, start, limit, Some(owner))
    }

    pub fn vesting_metadata_cid(env: Env, vesting: Address) -> Result<String, Error> {
        env.storage()
            .persistent()
            .get(&DataKey::MetadataCid(vesting))
            .ok_or(Error::NotInitialized)
    }

    #[allow(clippy::too_many_arguments)]
    fn deploy_vesting(
        env: &Env,
        owner: Address,
        token: Address,
        salt: BytesN<32>,
        name: String,
        description: String,
        merkle_root: BytesN<32>,
        audience_hash: BytesN<32>,
        metadata_cid: String,
    ) -> Result<Address, Error> {
        let wasm_hash = Self::get_instance::<BytesN<32>>(env, DataKey::VestingWasmHash)?;
        let verifier = Self::get_instance::<Address>(env, DataKey::Verifier)?;
        let jwk_registry = Self::get_instance::<Address>(env, DataKey::JwkRegistry)?;
        let deployment_salt = Self::owner_bound_salt(env, &owner, &salt);
        Ok(env
            .deployer()
            .with_current_contract(deployment_salt)
            .deploy_v2(
                wasm_hash,
                (
                    owner,
                    token,
                    verifier,
                    jwk_registry,
                    name,
                    description,
                    merkle_root,
                    audience_hash,
                    metadata_cid,
                ),
            ))
    }

    fn track_deployment(
        env: &Env,
        vesting: Address,
        owner: Address,
        token: Address,
        total_amount: i128,
        recipient_count: u32,
        metadata_cid: String,
    ) {
        let deployment_count = Self::deployment_count(env);
        env.storage()
            .persistent()
            .set(&DataKey::DeploymentAt(deployment_count), &vesting);
        env.storage()
            .instance()
            .set(&DataKey::DeploymentCount, &(deployment_count + 1));

        let owner_count = Self::owner_deployment_count(env, &owner);
        env.storage().persistent().set(
            &DataKey::OwnerDeploymentAt(owner.clone(), owner_count),
            &vesting,
        );
        env.storage().persistent().set(
            &DataKey::OwnerDeploymentCount(owner.clone()),
            &(owner_count + 1),
        );
        env.storage()
            .persistent()
            .set(&DataKey::MetadataCid(vesting.clone()), &metadata_cid);

        VestingCreated {
            vesting,
            owner,
            token,
            total_amount,
            recipient_count,
            metadata_cid,
        }
        .publish(env);
    }

    fn validate_metadata(
        recipient_count: u32,
        total_amount: i128,
        require_funding: bool,
    ) -> Result<(), Error> {
        if recipient_count == 0 {
            return Err(Error::InvalidRecipientCount);
        }
        if total_amount < 0 || (require_funding && total_amount == 0) {
            return Err(Error::InvalidAmount);
        }
        Ok(())
    }

    fn validate_initial_root(root: &BytesN<32>, require_nonzero: bool) -> Result<(), Error> {
        if Self::is_zero_root(root) {
            if require_nonzero {
                return Err(Error::InvalidMerkleRoot);
            }
            return Ok(());
        }
        if !Self::is_canonical_field(root) {
            return Err(Error::InvalidMerkleRoot);
        }
        Ok(())
    }

    fn validate_nonzero_field(field: &BytesN<32>) -> Result<(), Error> {
        if Self::is_zero_root(field) || !Self::is_canonical_field(field) {
            return Err(Error::InvalidAudience);
        }
        Ok(())
    }

    fn is_zero_root(root: &BytesN<32>) -> bool {
        root.to_array().iter().all(|byte| *byte == 0)
    }

    fn is_canonical_field(field: &BytesN<32>) -> bool {
        let raw = field.to_array();
        for i in 0..32 {
            if raw[i] < BN254_SCALAR_MODULUS[i] {
                return true;
            }
            if raw[i] > BN254_SCALAR_MODULUS[i] {
                return false;
            }
        }
        false
    }

    fn owner_bound_salt(env: &Env, owner: &Address, salt: &BytesN<32>) -> BytesN<32> {
        let mut preimage = owner.clone().to_xdr(env);
        preimage.extend_from_array(&salt.to_array());
        env.crypto().keccak256(&preimage).to_bytes()
    }

    fn get_instance<T>(env: &Env, key: DataKey) -> Result<T, Error>
    where
        T: soroban_sdk::TryFromVal<Env, Val>,
    {
        env.storage()
            .instance()
            .get(&key)
            .ok_or(Error::NotInitialized)
    }

    fn deployment_count(env: &Env) -> u32 {
        env.storage()
            .instance()
            .get(&DataKey::DeploymentCount)
            .unwrap_or(0)
    }

    fn owner_deployment_count(env: &Env, owner: &Address) -> u32 {
        env.storage()
            .persistent()
            .get(&DataKey::OwnerDeploymentCount(owner.clone()))
            .unwrap_or(0)
    }

    fn range(
        env: &Env,
        start: u32,
        limit: u32,
        owner: Option<Address>,
    ) -> Result<Vec<Address>, Error> {
        if limit > 100 {
            return Err(Error::InvalidLimit);
        }

        let count = match &owner {
            Some(owner) => Self::owner_deployment_count(env, owner),
            None => Self::deployment_count(env),
        };
        let mut out = Vec::new(env);
        let end = core::cmp::min(start.saturating_add(limit), count);
        for index in start..end {
            let key = match owner.clone() {
                Some(owner) => DataKey::OwnerDeploymentAt(owner, index),
                None => DataKey::DeploymentAt(index),
            };
            let deployment = env
                .storage()
                .persistent()
                .get(&key)
                .ok_or(Error::NotInitialized)?;
            out.push_back(deployment);
        }
        Ok(out)
    }

    fn range_infos(
        env: &Env,
        start: u32,
        limit: u32,
        owner: Option<Address>,
    ) -> Result<Vec<DeploymentInfo>, Error> {
        if limit > 100 {
            return Err(Error::InvalidLimit);
        }

        let count = match &owner {
            Some(owner) => Self::owner_deployment_count(env, owner),
            None => Self::deployment_count(env),
        };
        let mut out = Vec::new(env);
        let end = core::cmp::min(start.saturating_add(limit), count);
        for index in start..end {
            let key = match owner.clone() {
                Some(owner) => DataKey::OwnerDeploymentAt(owner, index),
                None => DataKey::DeploymentAt(index),
            };
            out.push_back(Self::deployment_info(env, key)?);
        }
        Ok(out)
    }

    fn deployment_info(env: &Env, key: DataKey) -> Result<DeploymentInfo, Error> {
        let address: Address = env
            .storage()
            .persistent()
            .get(&key)
            .ok_or(Error::NotInitialized)?;
        let metadata_cid = env
            .storage()
            .persistent()
            .get(&DataKey::MetadataCid(address.clone()))
            .ok_or(Error::NotInitialized)?;
        Ok(DeploymentInfo {
            address,
            metadata_cid,
        })
    }
}
