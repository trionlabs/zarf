#![no_std]

use soroban_sdk::{
    contract, contracterror, contractevent, contractimpl, contracttype, crypto::BnScalar, token,
    xdr::ToXdr, Address, Bytes, BytesN, Env, IntoVal, InvokeError, MuxedAddress, String, Symbol,
    Val, Vec,
};

const FIELD_BYTES: u32 = 32;
const PUBKEY_LIMBS: u32 = 18;
const PUBLIC_INPUT_FIELDS: u32 = 23;
const ROOT_INDEX: u32 = PUBKEY_LIMBS;
const UNLOCK_TIME_INDEX: u32 = PUBKEY_LIMBS + 1;
const EPOCH_COMMITMENT_INDEX: u32 = PUBKEY_LIMBS + 2;
const RECIPIENT_INDEX: u32 = PUBKEY_LIMBS + 3;
const AMOUNT_INDEX: u32 = PUBKEY_LIMBS + 4;

#[contract]
pub struct ZarfVestingContract;

#[contracterror]
#[repr(u32)]
#[derive(Copy, Clone, Debug, Eq, PartialEq)]
pub enum Error {
    InvalidProof = 1,
    InvalidMerkleRoot = 2,
    InvalidRecipient = 3,
    InvalidPubkey = 4,
    AlreadyClaimed = 5,
    EpochLocked = 6,
    Unauthorized = 7,
    InvalidPublicInputs = 8,
    InvalidAmount = 9,
    NotInitialized = 10,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum DataKey {
    Owner,
    Token,
    Verifier,
    JwkRegistry,
    Name,
    Description,
    MerkleRoot,
    Claimed(BytesN<32>),
}

#[contractevent(topics = ["owner_set"])]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct OwnershipTransferred {
    #[topic]
    pub previous_owner: Address,
    #[topic]
    pub new_owner: Address,
}

#[contractevent(topics = ["merkle_root_set"], data_format = "single-value")]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct MerkleRootSet {
    #[topic]
    pub merkle_root: BytesN<32>,
}

#[contractevent(topics = ["deposited"], data_format = "single-value")]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Deposited {
    pub amount: i128,
}

#[contractevent(topics = ["claimed"], data_format = "single-value")]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Claimed {
    #[topic]
    pub epoch_commitment: BytesN<32>,
    #[topic]
    pub recipient: Address,
    pub amount: i128,
}

#[contractimpl]
impl ZarfVestingContract {
    pub fn __constructor(
        env: Env,
        owner: Address,
        token: Address,
        verifier: Address,
        jwk_registry: Address,
        name: String,
        description: String,
        merkle_root: BytesN<32>,
    ) {
        let store = env.storage().instance();
        store.set(&DataKey::Owner, &owner);
        store.set(&DataKey::Token, &token);
        store.set(&DataKey::Verifier, &verifier);
        store.set(&DataKey::JwkRegistry, &jwk_registry);
        store.set(&DataKey::Name, &name);
        store.set(&DataKey::Description, &description);
        store.set(&DataKey::MerkleRoot, &merkle_root);
    }

    pub fn owner(env: Env) -> Result<Address, Error> {
        Self::get_instance(&env, DataKey::Owner)
    }

    pub fn token(env: Env) -> Result<Address, Error> {
        Self::get_instance(&env, DataKey::Token)
    }

    pub fn verifier(env: Env) -> Result<Address, Error> {
        Self::get_instance(&env, DataKey::Verifier)
    }

    pub fn jwk_registry(env: Env) -> Result<Address, Error> {
        Self::get_instance(&env, DataKey::JwkRegistry)
    }

    pub fn name(env: Env) -> Result<String, Error> {
        Self::get_instance(&env, DataKey::Name)
    }

    pub fn description(env: Env) -> Result<String, Error> {
        Self::get_instance(&env, DataKey::Description)
    }

    pub fn merkle_root(env: Env) -> Result<BytesN<32>, Error> {
        Self::get_instance(&env, DataKey::MerkleRoot)
    }

    pub fn transfer_ownership(env: Env, new_owner: Address) -> Result<(), Error> {
        Self::require_owner(&env)?;
        let old_owner = Self::get_instance::<Address>(&env, DataKey::Owner)?;
        env.storage().instance().set(&DataKey::Owner, &new_owner);
        OwnershipTransferred {
            previous_owner: old_owner,
            new_owner,
        }
        .publish(&env);
        Ok(())
    }

    pub fn set_merkle_root(env: Env, merkle_root: BytesN<32>) -> Result<(), Error> {
        Self::require_owner(&env)?;
        env.storage()
            .instance()
            .set(&DataKey::MerkleRoot, &merkle_root);
        MerkleRootSet { merkle_root }.publish(&env);
        Ok(())
    }

    pub fn deposit(env: Env, amount: i128) -> Result<(), Error> {
        if amount <= 0 {
            return Err(Error::InvalidAmount);
        }
        let owner = Self::require_owner(&env)?;
        let token_address = Self::get_instance::<Address>(&env, DataKey::Token)?;
        let contract_address = env.current_contract_address();
        token::TokenClient::new(&env, &token_address).transfer_from(
            &contract_address,
            &owner,
            &contract_address,
            &amount,
        );
        Deposited { amount }.publish(&env);
        Ok(())
    }

    pub fn recipient_id(env: Env, recipient: Address) -> BytesN<32> {
        Self::recipient_field(&env, &recipient)
    }

    pub fn is_claimed(env: Env, epoch_commitment: BytesN<32>) -> bool {
        env.storage()
            .persistent()
            .get(&DataKey::Claimed(epoch_commitment))
            .unwrap_or(false)
    }

    pub fn claim(
        env: Env,
        proof: Bytes,
        public_inputs: Bytes,
        recipient: Address,
    ) -> Result<(), Error> {
        recipient.require_auth();

        if public_inputs.len() != PUBLIC_INPUT_FIELDS * FIELD_BYTES {
            return Err(Error::InvalidPublicInputs);
        }

        let key_hash = Self::pubkey_hash_from_public_inputs(&env, &public_inputs);
        if !Self::registry_has_key(&env, key_hash)? {
            return Err(Error::InvalidPubkey);
        }

        let stored_root = Self::get_instance::<BytesN<32>>(&env, DataKey::MerkleRoot)?;
        let proof_root = Self::field_at(&env, &public_inputs, ROOT_INDEX)?;
        if proof_root != stored_root {
            return Err(Error::InvalidMerkleRoot);
        }

        let proof_recipient = Self::field_at(&env, &public_inputs, RECIPIENT_INDEX)?;
        let expected_recipient = Self::recipient_field(&env, &recipient);
        if proof_recipient != expected_recipient {
            return Err(Error::InvalidRecipient);
        }

        let unlock_time =
            Self::field_to_u64(&Self::field_at(&env, &public_inputs, UNLOCK_TIME_INDEX)?)?;
        if env.ledger().timestamp() < unlock_time {
            return Err(Error::EpochLocked);
        }

        let epoch_commitment = Self::field_at(&env, &public_inputs, EPOCH_COMMITMENT_INDEX)?;
        if Self::is_claimed(env.clone(), epoch_commitment.clone()) {
            return Err(Error::AlreadyClaimed);
        }

        let amount = Self::field_to_i128(&Self::field_at(&env, &public_inputs, AMOUNT_INDEX)?)?;
        Self::verify_proof(&env, public_inputs, proof)?;

        env.storage()
            .persistent()
            .set(&DataKey::Claimed(epoch_commitment.clone()), &true);

        let token_address = Self::get_instance::<Address>(&env, DataKey::Token)?;
        let to: MuxedAddress = (&recipient).into();
        token::TokenClient::new(&env, &token_address).transfer(
            &env.current_contract_address(),
            &to,
            &amount,
        );

        Claimed {
            epoch_commitment,
            recipient,
            amount,
        }
        .publish(&env);
        Ok(())
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

    fn require_owner(env: &Env) -> Result<Address, Error> {
        let owner = Self::get_instance::<Address>(env, DataKey::Owner)?;
        owner.require_auth();
        Ok(owner)
    }

    fn field_at(env: &Env, public_inputs: &Bytes, index: u32) -> Result<BytesN<32>, Error> {
        if index >= PUBLIC_INPUT_FIELDS {
            return Err(Error::InvalidPublicInputs);
        }
        let start = index * FIELD_BYTES;
        let mut raw = [0_u8; 32];
        public_inputs
            .slice(start..start + FIELD_BYTES)
            .copy_into_slice(&mut raw);
        Ok(BytesN::from_array(env, &raw))
    }

    fn pubkey_hash_from_public_inputs(env: &Env, public_inputs: &Bytes) -> BytesN<32> {
        let pubkey_bytes = public_inputs.slice(0..PUBKEY_LIMBS * FIELD_BYTES);
        env.crypto().keccak256(&pubkey_bytes).to_bytes()
    }

    fn registry_has_key(env: &Env, key_hash: BytesN<32>) -> Result<bool, Error> {
        let registry = Self::get_instance::<Address>(env, DataKey::JwkRegistry)?;
        let mut args: Vec<Val> = Vec::new(env);
        args.push_back(key_hash.into_val(env));
        env.try_invoke_contract::<bool, InvokeError>(
            &registry,
            &Symbol::new(env, "is_valid_key_hash"),
            args,
        )
        .map_err(|_| Error::InvalidPubkey)?
        .map_err(|_| Error::InvalidPubkey)
    }

    fn verify_proof(env: &Env, public_inputs: Bytes, proof: Bytes) -> Result<(), Error> {
        let verifier = Self::get_instance::<Address>(env, DataKey::Verifier)?;
        let mut args: Vec<Val> = Vec::new(env);
        args.push_back(public_inputs.into_val(env));
        args.push_back(proof.into_val(env));
        env.try_invoke_contract::<(), InvokeError>(
            &verifier,
            &Symbol::new(env, "verify_proof"),
            args,
        )
        .map_err(|_| Error::InvalidProof)?
        .map_err(|_| Error::InvalidProof)
    }

    fn recipient_field(env: &Env, recipient: &Address) -> BytesN<32> {
        let address_xdr = recipient.clone().to_xdr(env);
        let digest = env.crypto().keccak256(&address_xdr).to_bytes();
        BnScalar::from_bytes(digest).to_bytes()
    }

    fn field_to_u64(field: &BytesN<32>) -> Result<u64, Error> {
        let raw = field.to_array();
        for byte in raw.iter().take(24) {
            if *byte != 0 {
                return Err(Error::InvalidPublicInputs);
            }
        }
        let mut tail = [0_u8; 8];
        tail.copy_from_slice(&raw[24..32]);
        Ok(u64::from_be_bytes(tail))
    }

    fn field_to_i128(field: &BytesN<32>) -> Result<i128, Error> {
        let raw = field.to_array();
        for byte in raw.iter().take(16) {
            if *byte != 0 {
                return Err(Error::InvalidAmount);
            }
        }
        if raw[16] & 0x80 != 0 {
            return Err(Error::InvalidAmount);
        }
        let mut tail = [0_u8; 16];
        tail.copy_from_slice(&raw[16..32]);
        let amount = i128::from_be_bytes(tail);
        if amount <= 0 {
            return Err(Error::InvalidAmount);
        }
        Ok(amount)
    }
}
