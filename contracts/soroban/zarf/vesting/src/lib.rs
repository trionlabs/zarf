#![no_std]

use soroban_sdk::{
    contract, contracterror, contractevent, contractimpl, contracttype, crypto::BnScalar, token,
    xdr::ToXdr, Address, Bytes, BytesN, Env, IntoVal, InvokeError, MuxedAddress, String, Symbol,
    Val, Vec,
};

const FIELD_BYTES: u32 = 32;
const PUBKEY_LIMBS: u32 = 18;
const PUBLIC_INPUT_FIELDS: u32 = 25;
const ROOT_INDEX: u32 = PUBKEY_LIMBS;
const UNLOCK_TIME_INDEX: u32 = PUBKEY_LIMBS + 1;
const EPOCH_COMMITMENT_INDEX: u32 = PUBKEY_LIMBS + 2;
const RECIPIENT_INDEX: u32 = PUBKEY_LIMBS + 3;
const AMOUNT_INDEX: u32 = PUBKEY_LIMBS + 4;
const AUDIENCE_HASH_INDEX: u32 = PUBKEY_LIMBS + 5;
const JWT_EXP_INDEX: u32 = PUBKEY_LIMBS + 6;
const BN254_SCALAR_MODULUS: [u8; 32] = [
    0x30, 0x64, 0x4e, 0x72, 0xe1, 0x31, 0xa0, 0x29, 0xb8, 0x50, 0x45, 0xb6, 0x81, 0x81, 0x58, 0x5d,
    0x28, 0x33, 0xe8, 0x48, 0x79, 0xb9, 0x70, 0x91, 0x43, 0xe1, 0xf5, 0x93, 0xf0, 0x00, 0x00, 0x01,
];

/// One day of ledgers at the ~5s close time.
pub const DAY_IN_LEDGERS: u32 = 17_280;
/// TTL target for the instance, code, and persistent entries: ~120 days,
/// safely under the ~180-day network maximum entry TTL. Vestings can span
/// years, so every state-changing call re-extends; fully dormant contracts
/// still need an external ExtendFootprintTTLOp before this window lapses.
pub const TTL_EXTEND_TO: u32 = 120 * DAY_IN_LEDGERS;
/// Re-extend only once the TTL has decayed by ~a day, so steady traffic pays
/// the rent bump at most once a day instead of on every invocation.
pub const TTL_THRESHOLD: u32 = TTL_EXTEND_TO - DAY_IN_LEDGERS;
/// Cap for `claimed_statuses`, counted in ledger ENTRIES (not bytes): each
/// commitment adds one entry to the read footprint and the network caps
/// footprint entries per transaction (~100), so 64 leaves headroom for the
/// instance and code entries. The cap counts requested items (duplicates
/// included), so it can only over-estimate the real footprint. Deliberately
/// more conservative than the factory's 80-item page cap — claim tooling
/// tends to stack extra reads on top of this call.
pub const MAX_CLAIMED_BATCH: u32 = 64;
pub const CONTRACT_VERSION: u32 = 1;
pub const SCHEMA_VERSION: u32 = 1;
/// Vesting upgrades affect recipient funds, so the minimum delay is longer
/// than registry key activation.
pub const MIN_UPGRADE_DELAY_SECS: u64 = 48 * 3600;

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
    MerkleRootAlreadySet = 11,
    MerkleRootFunded = 12,
    InvalidAudience = 13,
    JwtExpired = 14,
    TokenTransferMismatch = 15,
    TooManyCommitments = 16,
    UpgradeAdminNotSet = 17,
    PendingUpgradeNotFound = 18,
    UpgradeDelayNotElapsed = 19,
    InvalidSchemaVersion = 20,
    AlreadyMigrated = 21,
    PendingUpgradeAdminNotSet = 22,
    InvalidUpgrade = 23,
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
    AudienceHash,
    MetadataCid,
    Claimed(BytesN<32>),
    UpgradeAdmin,
    PendingUpgradeAdmin,
    PendingUpgrade,
    SchemaVersion,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct VestingSummary {
    pub owner: Address,
    pub token: Address,
    pub verifier: Address,
    pub jwk_registry: Address,
    pub name: String,
    pub description: String,
    pub merkle_root: BytesN<32>,
    pub audience_hash: BytesN<32>,
    pub metadata_cid: String,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct PendingUpgrade {
    pub wasm_hash: BytesN<32>,
    pub manifest_hash: BytesN<32>,
    pub proposed_at: u64,
    pub execute_after: u64,
    pub from_version: u32,
    pub to_version: u32,
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

#[contractevent(topics = ["upgrade_proposed"])]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct UpgradeProposed {
    #[topic]
    pub wasm_hash: BytesN<32>,
    #[topic]
    pub manifest_hash: BytesN<32>,
    pub execute_after: u64,
    pub from_version: u32,
    pub to_version: u32,
}

#[contractevent(topics = ["upgrade_cancelled"])]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct UpgradeCancelled {
    #[topic]
    pub wasm_hash: BytesN<32>,
    #[topic]
    pub manifest_hash: BytesN<32>,
}

#[contractevent(topics = ["upgrade_executed"])]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct UpgradeExecuted {
    #[topic]
    pub wasm_hash: BytesN<32>,
    #[topic]
    pub manifest_hash: BytesN<32>,
    pub from_version: u32,
    pub to_version: u32,
}

#[contractevent(topics = ["upgrade_admin_proposed"], data_format = "single-value")]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct UpgradeAdminProposed {
    #[topic]
    pub new_admin: Address,
}

#[contractevent(topics = ["upgrade_admin_set"])]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct UpgradeAdminTransferred {
    #[topic]
    pub previous_admin: Address,
    #[topic]
    pub new_admin: Address,
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
        audience_hash: BytesN<32>,
        metadata_cid: String,
        upgrade_admin: Address,
    ) -> Result<(), Error> {
        Self::validate_initial_root(&merkle_root)?;
        Self::validate_nonzero_field(&audience_hash)?;

        let store = env.storage().instance();
        store.set(&DataKey::Owner, &owner);
        store.set(&DataKey::Token, &token);
        store.set(&DataKey::Verifier, &verifier);
        store.set(&DataKey::JwkRegistry, &jwk_registry);
        store.set(&DataKey::Name, &name);
        store.set(&DataKey::Description, &description);
        store.set(&DataKey::MerkleRoot, &merkle_root);
        store.set(&DataKey::AudienceHash, &audience_hash);
        store.set(&DataKey::MetadataCid, &metadata_cid);
        store.set(&DataKey::UpgradeAdmin, &upgrade_admin);
        store.set(&DataKey::SchemaVersion, &SCHEMA_VERSION);
        Self::extend_contract_ttl(&env);
        Ok(())
    }

    pub fn version() -> u32 {
        CONTRACT_VERSION
    }

    pub fn schema_version(env: Env) -> u32 {
        env.storage()
            .instance()
            .get(&DataKey::SchemaVersion)
            .unwrap_or(0_u32)
    }

    pub fn upgrade_admin(env: Env) -> Result<Address, Error> {
        Self::get_instance(&env, DataKey::UpgradeAdmin)
    }

    pub fn pending_upgrade(env: Env) -> Option<PendingUpgrade> {
        env.storage().instance().get(&DataKey::PendingUpgrade)
    }

    pub fn propose_upgrade_admin(env: Env, new_admin: Address) -> Result<(), Error> {
        Self::require_upgrade_admin(&env)?;
        env.storage()
            .instance()
            .set(&DataKey::PendingUpgradeAdmin, &new_admin);
        Self::extend_contract_ttl(&env);
        UpgradeAdminProposed { new_admin }.publish(&env);
        Ok(())
    }

    pub fn accept_upgrade_admin(env: Env) -> Result<(), Error> {
        let pending: Address = env
            .storage()
            .instance()
            .get(&DataKey::PendingUpgradeAdmin)
            .ok_or(Error::PendingUpgradeAdminNotSet)?;
        pending.require_auth();
        let previous_admin = Self::upgrade_admin(env.clone())?;
        env.storage()
            .instance()
            .set(&DataKey::UpgradeAdmin, &pending);
        env.storage()
            .instance()
            .remove(&DataKey::PendingUpgradeAdmin);
        Self::extend_contract_ttl(&env);
        UpgradeAdminTransferred {
            previous_admin,
            new_admin: pending,
        }
        .publish(&env);
        Ok(())
    }

    pub fn cancel_upgrade_admin_transfer(env: Env) -> Result<(), Error> {
        Self::require_upgrade_admin(&env)?;
        if !env.storage().instance().has(&DataKey::PendingUpgradeAdmin) {
            return Err(Error::PendingUpgradeAdminNotSet);
        }
        env.storage()
            .instance()
            .remove(&DataKey::PendingUpgradeAdmin);
        Self::extend_contract_ttl(&env);
        Ok(())
    }

    pub fn propose_upgrade(
        env: Env,
        wasm_hash: BytesN<32>,
        manifest_hash: BytesN<32>,
        to_version: u32,
    ) -> Result<(), Error> {
        Self::require_upgrade_admin(&env)?;
        Self::validate_upgrade_proposal(&wasm_hash, &manifest_hash, to_version)?;
        let proposed_at = env.ledger().timestamp();
        let pending = PendingUpgrade {
            wasm_hash: wasm_hash.clone(),
            manifest_hash: manifest_hash.clone(),
            proposed_at,
            execute_after: proposed_at.saturating_add(MIN_UPGRADE_DELAY_SECS),
            from_version: CONTRACT_VERSION,
            to_version,
        };
        env.storage()
            .instance()
            .set(&DataKey::PendingUpgrade, &pending);
        Self::extend_contract_ttl(&env);
        UpgradeProposed {
            wasm_hash,
            manifest_hash,
            execute_after: pending.execute_after,
            from_version: pending.from_version,
            to_version,
        }
        .publish(&env);
        Ok(())
    }

    pub fn cancel_upgrade(env: Env) -> Result<(), Error> {
        Self::require_upgrade_admin(&env)?;
        let pending: PendingUpgrade = env
            .storage()
            .instance()
            .get(&DataKey::PendingUpgrade)
            .ok_or(Error::PendingUpgradeNotFound)?;
        env.storage().instance().remove(&DataKey::PendingUpgrade);
        Self::extend_contract_ttl(&env);
        UpgradeCancelled {
            wasm_hash: pending.wasm_hash,
            manifest_hash: pending.manifest_hash,
        }
        .publish(&env);
        Ok(())
    }

    pub fn execute_upgrade(env: Env) -> Result<(), Error> {
        Self::require_upgrade_admin(&env)?;
        let pending: PendingUpgrade = env
            .storage()
            .instance()
            .get(&DataKey::PendingUpgrade)
            .ok_or(Error::PendingUpgradeNotFound)?;
        if env.ledger().timestamp() < pending.execute_after {
            return Err(Error::UpgradeDelayNotElapsed);
        }
        env.storage().instance().remove(&DataKey::PendingUpgrade);
        Self::extend_contract_ttl(&env);
        UpgradeExecuted {
            wasm_hash: pending.wasm_hash.clone(),
            manifest_hash: pending.manifest_hash,
            from_version: pending.from_version,
            to_version: pending.to_version,
        }
        .publish(&env);
        env.deployer()
            .update_current_contract_wasm(pending.wasm_hash);
        Ok(())
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

    pub fn audience_hash(env: Env) -> Result<BytesN<32>, Error> {
        Self::get_instance(&env, DataKey::AudienceHash)
    }

    pub fn metadata_cid(env: Env) -> Result<String, Error> {
        Self::get_instance(&env, DataKey::MetadataCid)
    }

    pub fn summary(env: Env) -> Result<VestingSummary, Error> {
        Ok(VestingSummary {
            owner: Self::get_instance(&env, DataKey::Owner)?,
            token: Self::get_instance(&env, DataKey::Token)?,
            verifier: Self::get_instance(&env, DataKey::Verifier)?,
            jwk_registry: Self::get_instance(&env, DataKey::JwkRegistry)?,
            name: Self::get_instance(&env, DataKey::Name)?,
            description: Self::get_instance(&env, DataKey::Description)?,
            merkle_root: Self::get_instance(&env, DataKey::MerkleRoot)?,
            audience_hash: Self::get_instance(&env, DataKey::AudienceHash)?,
            metadata_cid: Self::get_instance(&env, DataKey::MetadataCid)?,
        })
    }

    pub fn transfer_ownership(env: Env, new_owner: Address) -> Result<(), Error> {
        Self::require_owner(&env)?;
        let old_owner = Self::get_instance::<Address>(&env, DataKey::Owner)?;
        env.storage().instance().set(&DataKey::Owner, &new_owner);
        Self::extend_contract_ttl(&env);
        OwnershipTransferred {
            previous_owner: old_owner,
            new_owner,
        }
        .publish(&env);
        Ok(())
    }

    pub fn set_merkle_root(env: Env, merkle_root: BytesN<32>) -> Result<(), Error> {
        Self::require_owner(&env)?;
        if Self::is_zero_root(&merkle_root) {
            return Err(Error::InvalidMerkleRoot);
        }
        if !Self::is_canonical_field(&merkle_root) {
            return Err(Error::InvalidMerkleRoot);
        }

        let current_root = Self::get_instance::<BytesN<32>>(&env, DataKey::MerkleRoot)?;
        if !Self::is_zero_root(&current_root) {
            return Err(Error::MerkleRootAlreadySet);
        }

        env.storage()
            .instance()
            .set(&DataKey::MerkleRoot, &merkle_root);
        Self::extend_contract_ttl(&env);
        MerkleRootSet { merkle_root }.publish(&env);
        Ok(())
    }

    pub fn deposit(env: Env, amount: i128) -> Result<(), Error> {
        if amount <= 0 {
            return Err(Error::InvalidAmount);
        }
        let owner = Self::require_owner(&env)?;
        let merkle_root = Self::get_instance::<BytesN<32>>(&env, DataKey::MerkleRoot)?;
        if Self::is_zero_root(&merkle_root) {
            return Err(Error::InvalidMerkleRoot);
        }
        if !Self::is_canonical_field(&merkle_root) {
            return Err(Error::InvalidMerkleRoot);
        }
        let token_address = Self::get_instance::<Address>(&env, DataKey::Token)?;
        let contract_address = env.current_contract_address();
        let token_client = token::TokenClient::new(&env, &token_address);
        let before_balance = token_client.balance(&contract_address);
        token_client.transfer_from(&contract_address, &owner, &contract_address, &amount);
        let after_balance = token_client.balance(&contract_address);
        if after_balance
            != before_balance
                .checked_add(amount)
                .ok_or(Error::TokenTransferMismatch)?
        {
            return Err(Error::TokenTransferMismatch);
        }
        Self::extend_contract_ttl(&env);
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

    /// Batch view over the claim guards so callers resolve a recipient's
    /// whole epoch chain in one simulation instead of one per epoch. An
    /// archived (expired-TTL) guard reads as `false` here, same as
    /// `is_claimed`; the on-chain `claim` still rejects after a restore.
    /// The Zarf indexer reads the guard entries via getLedgerEntries and does
    /// not need this; it exists for integrators without an indexer and as
    /// the client-side fallback path.
    pub fn claimed_statuses(
        env: Env,
        epoch_commitments: Vec<BytesN<32>>,
    ) -> Result<Vec<bool>, Error> {
        if epoch_commitments.len() > MAX_CLAIMED_BATCH {
            return Err(Error::TooManyCommitments);
        }
        let mut statuses = Vec::new(&env);
        for epoch_commitment in epoch_commitments.iter() {
            statuses.push_back(Self::is_claimed(env.clone(), epoch_commitment));
        }
        Ok(statuses)
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
        Self::validate_public_inputs_canonical(&env, &public_inputs)?;

        let key_hash = Self::pubkey_hash_from_public_inputs(&env, &public_inputs);
        if !Self::registry_has_key(&env, key_hash)? {
            return Err(Error::InvalidPubkey);
        }

        let stored_root = Self::get_instance::<BytesN<32>>(&env, DataKey::MerkleRoot)?;
        if Self::is_zero_root(&stored_root) || !Self::is_canonical_field(&stored_root) {
            return Err(Error::InvalidMerkleRoot);
        }
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

        let expected_audience = Self::get_instance::<BytesN<32>>(&env, DataKey::AudienceHash)?;
        let proof_audience = Self::field_at(&env, &public_inputs, AUDIENCE_HASH_INDEX)?;
        if proof_audience != expected_audience {
            return Err(Error::InvalidAudience);
        }

        let jwt_exp = Self::field_to_u64(&Self::field_at(&env, &public_inputs, JWT_EXP_INDEX)?)?;
        if env.ledger().timestamp() > jwt_exp {
            return Err(Error::JwtExpired);
        }

        let epoch_commitment = Self::field_at(&env, &public_inputs, EPOCH_COMMITMENT_INDEX)?;
        if Self::is_claimed(env.clone(), epoch_commitment.clone()) {
            return Err(Error::AlreadyClaimed);
        }

        let amount = Self::field_to_i128(&Self::field_at(&env, &public_inputs, AMOUNT_INDEX)?)?;

        env.storage()
            .persistent()
            .set(&DataKey::Claimed(epoch_commitment.clone()), &true);

        if let Err(error) = Self::verify_proof(&env, public_inputs, proof) {
            env.storage()
                .persistent()
                .set(&DataKey::Claimed(epoch_commitment), &false);
            return Err(error);
        }

        let token_address = Self::get_instance::<Address>(&env, DataKey::Token)?;
        let token_client = token::TokenClient::new(&env, &token_address);
        let contract_address = env.current_contract_address();
        let before_contract_balance = token_client.balance(&contract_address);
        let before_recipient_balance = token_client.balance(&recipient);
        let to: MuxedAddress = (&recipient).into();
        token_client.transfer(&contract_address, &to, &amount);
        let after_contract_balance = token_client.balance(&contract_address);
        let after_recipient_balance = token_client.balance(&recipient);
        if after_contract_balance
            != before_contract_balance
                .checked_sub(amount)
                .ok_or(Error::TokenTransferMismatch)?
            || after_recipient_balance
                != before_recipient_balance
                    .checked_add(amount)
                    .ok_or(Error::TokenTransferMismatch)?
        {
            env.storage()
                .persistent()
                .set(&DataKey::Claimed(epoch_commitment.clone()), &false);
            return Err(Error::TokenTransferMismatch);
        }

        env.storage().persistent().extend_ttl(
            &DataKey::Claimed(epoch_commitment.clone()),
            TTL_THRESHOLD,
            TTL_EXTEND_TO,
        );
        Self::extend_contract_ttl(&env);

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

    fn extend_contract_ttl(env: &Env) {
        env.deployer()
            .extend_ttl(env.current_contract_address(), TTL_THRESHOLD, TTL_EXTEND_TO);
    }

    fn require_owner(env: &Env) -> Result<Address, Error> {
        let owner = Self::get_instance::<Address>(env, DataKey::Owner)?;
        owner.require_auth();
        Ok(owner)
    }

    fn require_upgrade_admin(env: &Env) -> Result<Address, Error> {
        let admin = Self::get_instance::<Address>(env, DataKey::UpgradeAdmin)
            .map_err(|_| Error::UpgradeAdminNotSet)?;
        admin.require_auth();
        Ok(admin)
    }

    fn validate_upgrade_proposal(
        wasm_hash: &BytesN<32>,
        manifest_hash: &BytesN<32>,
        to_version: u32,
    ) -> Result<(), Error> {
        if to_version <= CONTRACT_VERSION
            || Self::is_zero_hash(wasm_hash)
            || Self::is_zero_hash(manifest_hash)
        {
            return Err(Error::InvalidUpgrade);
        }
        Ok(())
    }

    fn is_zero_hash(hash: &BytesN<32>) -> bool {
        hash.to_array().iter().all(|byte| *byte == 0)
    }

    fn is_zero_root(root: &BytesN<32>) -> bool {
        root.to_array().iter().all(|byte| *byte == 0)
    }

    fn validate_initial_root(root: &BytesN<32>) -> Result<(), Error> {
        if !Self::is_zero_root(root) && !Self::is_canonical_field(root) {
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

    fn validate_public_inputs_canonical(env: &Env, public_inputs: &Bytes) -> Result<(), Error> {
        for index in 0..PUBLIC_INPUT_FIELDS {
            let field = Self::field_at(env, public_inputs, index)?;
            if !Self::is_canonical_field(&field) {
                return Err(Error::InvalidPublicInputs);
            }
        }
        Ok(())
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
