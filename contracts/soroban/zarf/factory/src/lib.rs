#![no_std]

use soroban_sdk::{
    contract, contracterror, contractevent, contractimpl, contracttype, crypto::BnScalar, token,
    xdr::ToXdr, Address, BytesN, Env, String, Val, Vec,
};

const BN254_SCALAR_MODULUS: [u8; 32] = [
    0x30, 0x64, 0x4e, 0x72, 0xe1, 0x31, 0xa0, 0x29, 0xb8, 0x50, 0x45, 0xb6, 0x81, 0x81, 0x58, 0x5d,
    0x28, 0x33, 0xe8, 0x48, 0x79, 0xb9, 0x70, 0x91, 0x43, 0xe1, 0xf5, 0x93, 0xf0, 0x00, 0x00, 0x01,
];

/// One day of ledgers at the ~5s close time.
pub const DAY_IN_LEDGERS: u32 = 17_280;
/// TTL target for the instance, code, and registry entries: ~120 days,
/// safely under the ~180-day network maximum entry TTL. Every deployment
/// re-extends; a fully dormant factory still needs an external
/// ExtendFootprintTTLOp before this window lapses.
pub const TTL_EXTEND_TO: u32 = 120 * DAY_IN_LEDGERS;
/// Re-extend only once the TTL has decayed by ~a day, so steady traffic pays
/// the rent bump at most once a day instead of on every invocation.
pub const TTL_THRESHOLD: u32 = TTL_EXTEND_TO - DAY_IN_LEDGERS;
/// Page cap for range reads, counted in ledger ENTRIES (not bytes): each
/// item is one persistent entry in the read footprint and the network caps
/// footprint entries per transaction (~100), so 80 leaves headroom for the
/// instance and code entries.
pub const MAX_PAGE_LIMIT: u32 = 80;
pub const CLAIM_AUTHORIZATION_EMAIL_ZK: u32 = 0;
pub const CLAIM_AUTHORIZATION_WALLET: u32 = 1;
pub const CLAIM_SCHEDULE_EPOCHS: u32 = 0;
pub const CLAIM_SCHEDULE_IMMEDIATE: u32 = 1;
pub const RECLAIM_POLICY_NONE: u32 = 0;
pub const RECLAIM_POLICY_AFTER_DEADLINE: u32 = 1;
pub const RECLAIM_POLICY_ANYTIME: u32 = 2;
pub const FUNDING_MODE_DEFERRED: u32 = 0;
pub const FUNDING_MODE_ATOMIC: u32 = 1;

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
    MerkleRootAlreadyUsed = 8,
    InvalidDeadline = 9,
    InvalidCampaignMode = 10,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum DataKey {
    Verifier,
    JwkRegistry,
    VestingWasmHash,
    AirdropWasmHash,
    DeploymentCount,
    /// Holds a full `DeploymentInfo` so range reads cost one ledger entry
    /// per item. Factories deployed from earlier builds stored a bare
    /// `Address` here; there is no upgrade path, so the layouts never mix —
    /// but an in-place WASM upgrade would require a storage migration.
    DeploymentAt(u32),
    OwnerDeploymentCount(Address),
    /// Same `DeploymentInfo` layout (and same caveat) as `DeploymentAt`.
    OwnerDeploymentAt(Address, u32),
    MetadataCid(Address),
    /// Marks a merkle root already consumed by a factory-created campaign, so
    /// two campaigns can never share one. A proof is bound to (merkle_root,
    /// audience_hash) but NOT to a vesting contract address, so identically
    /// rooted siblings would each accept the same proof.
    UsedRoot(BytesN<32>),
    /// Unified campaign registry. Vesting-specific discovery keeps using
    /// `DeploymentAt`, so wallet campaigns never get mistaken for ZK/email
    /// vesting contracts by existing indexers.
    CampaignCount,
    CampaignAt(u32),
    OwnerCampaignCount(Address),
    OwnerCampaignAt(Address, u32),
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum ClaimAuthorization {
    EmailZk,
    Wallet,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum ClaimSchedule {
    Epochs,
    Immediate,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum ReclaimPolicy {
    None,
    AfterDeadline,
    Anytime,
}

#[derive(Copy, Clone, Debug, Eq, PartialEq)]
enum FundingMode {
    Deferred,
    Atomic,
}

#[contractevent(topics = ["campaign_created"])]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct CampaignCreated {
    #[topic]
    pub campaign: Address,
    #[topic]
    pub owner: Address,
    #[topic]
    pub token: Address,
    pub claim_authorization: ClaimAuthorization,
    pub claim_schedule: ClaimSchedule,
    pub reclaim_policy: ReclaimPolicy,
    pub claim_deadline: u64,
    pub total_amount: i128,
    pub recipient_count: u32,
    pub merkle_root: BytesN<32>,
    pub metadata_cid: String,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct DeploymentInfo {
    pub address: Address,
    pub metadata_cid: String,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct CampaignInfo {
    pub address: Address,
    pub owner: Address,
    pub token: Address,
    pub claim_authorization: ClaimAuthorization,
    pub claim_schedule: ClaimSchedule,
    pub reclaim_policy: ReclaimPolicy,
    pub claim_deadline: u64,
    pub total_amount: i128,
    pub recipient_count: u32,
    pub merkle_root: BytesN<32>,
    pub metadata_cid: String,
}

#[contractimpl]
impl ZarfVestingFactoryContract {
    pub fn __constructor(
        env: Env,
        verifier: Address,
        jwk_registry: Address,
        vesting_wasm_hash: BytesN<32>,
        airdrop_wasm_hash: BytesN<32>,
    ) {
        let store = env.storage().instance();
        store.set(&DataKey::Verifier, &verifier);
        store.set(&DataKey::JwkRegistry, &jwk_registry);
        store.set(&DataKey::VestingWasmHash, &vesting_wasm_hash);
        store.set(&DataKey::AirdropWasmHash, &airdrop_wasm_hash);
        store.set(&DataKey::DeploymentCount, &0_u32);
        store.set(&DataKey::CampaignCount, &0_u32);
        Self::extend_contract_ttl(&env);
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

    pub fn airdrop_wasm_hash(env: Env) -> Result<BytesN<32>, Error> {
        Self::get_instance(&env, DataKey::AirdropWasmHash)
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

    pub fn predict_airdrop_address(env: Env, owner: Address, salt: BytesN<32>) -> Address {
        let deployment_salt = Self::airdrop_bound_salt(&env, &owner, &salt);
        env.deployer()
            .with_current_contract(deployment_salt)
            .deployed_address()
    }

    #[allow(clippy::too_many_arguments)]
    pub fn create_campaign(
        env: Env,
        owner: Address,
        token: Address,
        salt: BytesN<32>,
        claim_authorization: u32,
        claim_schedule: u32,
        reclaim_policy: u32,
        name: String,
        description: String,
        merkle_root: BytesN<32>,
        audience_hash: BytesN<32>,
        recipient_count: u32,
        total_amount: i128,
        claim_deadline: u64,
        metadata_cid: String,
        funding_mode: u32,
    ) -> Result<Address, Error> {
        owner.require_auth();

        let reclaim_policy = Self::reclaim_policy_from_code(reclaim_policy)?;
        let funding_mode = Self::funding_mode_from_code(funding_mode)?;

        match (claim_authorization, claim_schedule) {
            (CLAIM_AUTHORIZATION_EMAIL_ZK, CLAIM_SCHEDULE_EPOCHS) => {
                if reclaim_policy != ReclaimPolicy::None || claim_deadline != 0 {
                    return Err(Error::InvalidCampaignMode);
                }
                Self::create_email_zk_campaign(
                    &env,
                    owner,
                    token,
                    salt,
                    name,
                    description,
                    merkle_root,
                    audience_hash,
                    recipient_count,
                    total_amount,
                    metadata_cid,
                    funding_mode,
                )
            }
            (CLAIM_AUTHORIZATION_WALLET, CLAIM_SCHEDULE_IMMEDIATE) => {
                if funding_mode != FundingMode::Atomic {
                    return Err(Error::InvalidCampaignMode);
                }
                Self::create_wallet_campaign(
                    &env,
                    owner,
                    token,
                    merkle_root,
                    total_amount,
                    claim_deadline,
                    reclaim_policy,
                    recipient_count,
                    salt,
                    metadata_cid,
                )
            }
            _ => Err(Error::InvalidCampaignMode),
        }
    }

    pub fn get_deployment_count(env: Env) -> u32 {
        Self::deployment_count(&env)
    }

    pub fn get_deployment(env: Env, index: u32) -> Result<Address, Error> {
        Ok(Self::deployment_info(&env, DataKey::DeploymentAt(index))?.address)
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
        Ok(Self::deployment_info(&env, DataKey::OwnerDeploymentAt(owner, index))?.address)
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

    pub fn get_campaign_count(env: Env) -> u32 {
        Self::campaign_count(&env)
    }

    pub fn get_campaign(env: Env, index: u32) -> Result<Address, Error> {
        Ok(Self::campaign_info(&env, DataKey::CampaignAt(index))?.address)
    }

    pub fn get_campaign_info(env: Env, index: u32) -> Result<CampaignInfo, Error> {
        Self::campaign_info(&env, DataKey::CampaignAt(index))
    }

    pub fn get_campaign_infos(
        env: Env,
        start: u32,
        limit: u32,
    ) -> Result<Vec<CampaignInfo>, Error> {
        Self::range_campaign_infos(&env, start, limit, None)
    }

    pub fn get_owner_campaign_count(env: Env, owner: Address) -> u32 {
        Self::owner_campaign_count(&env, &owner)
    }

    pub fn get_owner_campaign(env: Env, owner: Address, index: u32) -> Result<Address, Error> {
        Ok(Self::campaign_info(&env, DataKey::OwnerCampaignAt(owner, index))?.address)
    }

    pub fn get_owner_campaign_info(
        env: Env,
        owner: Address,
        index: u32,
    ) -> Result<CampaignInfo, Error> {
        Self::campaign_info(&env, DataKey::OwnerCampaignAt(owner, index))
    }

    pub fn get_owner_campaign_infos(
        env: Env,
        owner: Address,
        start: u32,
        limit: u32,
    ) -> Result<Vec<CampaignInfo>, Error> {
        Self::range_campaign_infos(&env, start, limit, Some(owner))
    }

    #[allow(clippy::too_many_arguments)]
    fn create_email_zk_campaign(
        env: &Env,
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
        funding_mode: FundingMode,
    ) -> Result<Address, Error> {
        let require_funding = funding_mode == FundingMode::Atomic;
        Self::validate_metadata(recipient_count, total_amount, require_funding)?;
        // Require a canonical, non-zero root even on the unfunded path: a
        // deferred (zero) root would skip the `UsedRoot` reservation below,
        // letting a later vesting-side `set_merkle_root` collide with a root
        // already consumed by another campaign (L-1 replay). The funded path
        // already required this; both paths now agree.
        Self::validate_initial_root(&merkle_root, true)?;
        Self::validate_nonzero_field(&audience_hash)?;
        Self::reserve_merkle_root(env, &merkle_root)?;

        let vesting = Self::deploy_vesting(
            env,
            owner.clone(),
            token.clone(),
            salt,
            name,
            description,
            merkle_root.clone(),
            audience_hash,
            metadata_cid.clone(),
        )?;

        if require_funding {
            Self::fund_deployment(env, &owner, &token, &vesting, total_amount)?;
        }

        Self::track_deployment(
            env,
            vesting.clone(),
            owner,
            token,
            total_amount,
            recipient_count,
            merkle_root,
            metadata_cid,
        );
        Ok(vesting)
    }

    #[allow(clippy::too_many_arguments)]
    fn create_wallet_campaign(
        env: &Env,
        owner: Address,
        token: Address,
        merkle_root: BytesN<32>,
        total: i128,
        deadline: u64,
        reclaim_policy: ReclaimPolicy,
        recipient_count: u32,
        salt: BytesN<32>,
        metadata_cid: String,
    ) -> Result<Address, Error> {
        Self::validate_wallet_campaign_metadata(
            recipient_count,
            total,
            deadline,
            &reclaim_policy,
            env,
        )?;
        if Self::is_zero_root(&merkle_root) {
            return Err(Error::InvalidMerkleRoot);
        }

        let locked = Self::airdrop_locked_for_reclaim_policy(deadline, &reclaim_policy)?;
        let airdrop = Self::deploy_airdrop(
            env,
            owner.clone(),
            token.clone(),
            merkle_root.clone(),
            total,
            deadline,
            locked,
            salt,
        )?;

        Self::fund_deployment(env, &owner, &token, &airdrop, total)?;

        Self::track_airdrop_deployment(
            env,
            airdrop.clone(),
            owner,
            token,
            total,
            recipient_count,
            merkle_root,
            deadline,
            locked,
            metadata_cid,
        );
        Ok(airdrop)
    }

    fn fund_deployment(
        env: &Env,
        owner: &Address,
        token: &Address,
        target: &Address,
        amount: i128,
    ) -> Result<(), Error> {
        let token_client = token::TokenClient::new(env, token);
        let before_balance = token_client.balance(target);
        token_client.transfer_from(&env.current_contract_address(), owner, target, &amount);
        let after_balance = token_client.balance(target);
        if after_balance
            != before_balance
                .checked_add(amount)
                .ok_or(Error::TokenTransferMismatch)?
        {
            return Err(Error::TokenTransferMismatch);
        }
        Ok(())
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

    #[allow(clippy::too_many_arguments)]
    fn deploy_airdrop(
        env: &Env,
        owner: Address,
        token: Address,
        merkle_root: BytesN<32>,
        total: i128,
        deadline: u64,
        locked: bool,
        salt: BytesN<32>,
    ) -> Result<Address, Error> {
        let wasm_hash = Self::get_instance::<BytesN<32>>(env, DataKey::AirdropWasmHash)?;
        let deployment_salt = Self::airdrop_bound_salt(env, &owner, &salt);
        Ok(env
            .deployer()
            .with_current_contract(deployment_salt)
            .deploy_v2(
                wasm_hash,
                (owner, token, merkle_root, total, deadline, locked),
            ))
    }

    fn track_deployment(
        env: &Env,
        vesting: Address,
        owner: Address,
        token: Address,
        total_amount: i128,
        recipient_count: u32,
        merkle_root: BytesN<32>,
        metadata_cid: String,
    ) {
        let info = DeploymentInfo {
            address: vesting.clone(),
            metadata_cid: metadata_cid.clone(),
        };
        let persistent = env.storage().persistent();

        let deployment_count = Self::deployment_count(env);
        let deployment_key = DataKey::DeploymentAt(deployment_count);
        persistent.set(&deployment_key, &info);
        persistent.extend_ttl(&deployment_key, TTL_THRESHOLD, TTL_EXTEND_TO);
        env.storage()
            .instance()
            .set(&DataKey::DeploymentCount, &(deployment_count + 1));

        let owner_count = Self::owner_deployment_count(env, &owner);
        let owner_deployment_key = DataKey::OwnerDeploymentAt(owner.clone(), owner_count);
        persistent.set(&owner_deployment_key, &info);
        persistent.extend_ttl(&owner_deployment_key, TTL_THRESHOLD, TTL_EXTEND_TO);
        let owner_count_key = DataKey::OwnerDeploymentCount(owner.clone());
        persistent.set(&owner_count_key, &(owner_count + 1));
        persistent.extend_ttl(&owner_count_key, TTL_THRESHOLD, TTL_EXTEND_TO);
        let metadata_key = DataKey::MetadataCid(vesting.clone());
        persistent.set(&metadata_key, &metadata_cid);
        persistent.extend_ttl(&metadata_key, TTL_THRESHOLD, TTL_EXTEND_TO);

        Self::track_campaign(
            env,
            CampaignInfo {
                address: vesting,
                owner,
                token,
                claim_authorization: ClaimAuthorization::EmailZk,
                claim_schedule: ClaimSchedule::Epochs,
                reclaim_policy: ReclaimPolicy::None,
                claim_deadline: 0,
                total_amount,
                recipient_count,
                merkle_root,
                metadata_cid,
            },
        );
    }

    #[allow(clippy::too_many_arguments)]
    fn track_airdrop_deployment(
        env: &Env,
        airdrop: Address,
        owner: Address,
        token: Address,
        total_amount: i128,
        recipient_count: u32,
        merkle_root: BytesN<32>,
        deadline: u64,
        locked: bool,
        metadata_cid: String,
    ) {
        Self::track_campaign(
            env,
            CampaignInfo {
                address: airdrop,
                owner,
                token,
                claim_authorization: ClaimAuthorization::Wallet,
                claim_schedule: ClaimSchedule::Immediate,
                reclaim_policy: Self::airdrop_reclaim_policy(deadline, locked),
                claim_deadline: deadline,
                total_amount,
                recipient_count,
                merkle_root,
                metadata_cid,
            },
        );
    }

    fn track_campaign(env: &Env, info: CampaignInfo) {
        let persistent = env.storage().persistent();

        let count = Self::campaign_count(env);
        let key = DataKey::CampaignAt(count);
        persistent.set(&key, &info);
        persistent.extend_ttl(&key, TTL_THRESHOLD, TTL_EXTEND_TO);
        env.storage()
            .instance()
            .set(&DataKey::CampaignCount, &(count + 1));

        let owner_count = Self::owner_campaign_count(env, &info.owner);
        let owner_key = DataKey::OwnerCampaignAt(info.owner.clone(), owner_count);
        persistent.set(&owner_key, &info);
        persistent.extend_ttl(&owner_key, TTL_THRESHOLD, TTL_EXTEND_TO);
        let owner_count_key = DataKey::OwnerCampaignCount(info.owner.clone());
        persistent.set(&owner_count_key, &(owner_count + 1));
        persistent.extend_ttl(&owner_count_key, TTL_THRESHOLD, TTL_EXTEND_TO);

        Self::extend_contract_ttl(env);

        CampaignCreated {
            campaign: info.address,
            owner: info.owner,
            token: info.token,
            claim_authorization: info.claim_authorization,
            claim_schedule: info.claim_schedule,
            reclaim_policy: info.reclaim_policy,
            claim_deadline: info.claim_deadline,
            total_amount: info.total_amount,
            recipient_count: info.recipient_count,
            merkle_root: info.merkle_root,
            metadata_cid: info.metadata_cid,
        }
        .publish(env);
    }

    /// Reserve a merkle root so no two factory campaigns can share one.
    ///
    /// A proof is bound to (merkle_root, audience_hash) but NOT to a specific
    /// vesting contract address, so two funded contracts with the same root
    /// would each accept the same proof — letting a recipient draw the same
    /// allocation from both. Reserving the root at creation closes this for
    /// every factory-created campaign.
    ///
    /// Both create paths now reject a zero/deferred root up front
    /// (`validate_initial_root(.., true)`), so this fails CLOSED on a zero root
    /// rather than silently skipping the reservation. The only remaining
    /// cross-contract replay surface is a *standalone* (non-factory) vesting:
    /// two of those sharing one (merkle_root, audience_hash) sit outside the
    /// factory's view. Full closure requires binding the proof to the contract
    /// instance in the circuit (a VK-redeploy event).
    fn reserve_merkle_root(env: &Env, merkle_root: &BytesN<32>) -> Result<(), Error> {
        if Self::is_zero_root(merkle_root) {
            return Err(Error::InvalidMerkleRoot);
        }
        let key = DataKey::UsedRoot(merkle_root.clone());
        if env.storage().persistent().has(&key) {
            return Err(Error::MerkleRootAlreadyUsed);
        }
        env.storage().persistent().set(&key, &true);
        env.storage()
            .persistent()
            .extend_ttl(&key, TTL_THRESHOLD, TTL_EXTEND_TO);
        Ok(())
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

    fn validate_wallet_campaign_metadata(
        recipient_count: u32,
        total: i128,
        deadline: u64,
        reclaim_policy: &ReclaimPolicy,
        env: &Env,
    ) -> Result<(), Error> {
        if recipient_count == 0 {
            return Err(Error::InvalidRecipientCount);
        }
        if total <= 0 || total < i128::from(recipient_count) {
            return Err(Error::InvalidAmount);
        }
        if deadline != 0 && deadline <= env.ledger().timestamp() {
            return Err(Error::InvalidDeadline);
        }
        if matches!(reclaim_policy, ReclaimPolicy::AfterDeadline) && deadline == 0 {
            return Err(Error::InvalidDeadline);
        }
        if matches!(reclaim_policy, ReclaimPolicy::None) && deadline != 0 {
            return Err(Error::InvalidCampaignMode);
        }
        Ok(())
    }

    fn airdrop_reclaim_policy(deadline: u64, locked: bool) -> ReclaimPolicy {
        if !locked {
            return ReclaimPolicy::Anytime;
        }
        if deadline == 0 {
            return ReclaimPolicy::None;
        }
        ReclaimPolicy::AfterDeadline
    }

    fn airdrop_locked_for_reclaim_policy(
        deadline: u64,
        reclaim_policy: &ReclaimPolicy,
    ) -> Result<bool, Error> {
        match reclaim_policy {
            ReclaimPolicy::Anytime => Ok(false),
            ReclaimPolicy::AfterDeadline => {
                if deadline == 0 {
                    return Err(Error::InvalidDeadline);
                }
                Ok(true)
            }
            ReclaimPolicy::None => {
                if deadline != 0 {
                    return Err(Error::InvalidCampaignMode);
                }
                Ok(true)
            }
        }
    }

    fn reclaim_policy_from_code(code: u32) -> Result<ReclaimPolicy, Error> {
        match code {
            RECLAIM_POLICY_NONE => Ok(ReclaimPolicy::None),
            RECLAIM_POLICY_AFTER_DEADLINE => Ok(ReclaimPolicy::AfterDeadline),
            RECLAIM_POLICY_ANYTIME => Ok(ReclaimPolicy::Anytime),
            _ => Err(Error::InvalidCampaignMode),
        }
    }

    fn funding_mode_from_code(code: u32) -> Result<FundingMode, Error> {
        match code {
            FUNDING_MODE_DEFERRED => Ok(FundingMode::Deferred),
            FUNDING_MODE_ATOMIC => Ok(FundingMode::Atomic),
            _ => Err(Error::InvalidCampaignMode),
        }
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

    fn airdrop_bound_salt(env: &Env, owner: &Address, salt: &BytesN<32>) -> BytesN<32> {
        let mut preimage = owner.clone().to_xdr(env);
        preimage.extend_from_array(b":airdrop:");
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

    fn campaign_count(env: &Env) -> u32 {
        env.storage()
            .instance()
            .get(&DataKey::CampaignCount)
            .unwrap_or(0)
    }

    fn owner_deployment_count(env: &Env, owner: &Address) -> u32 {
        env.storage()
            .persistent()
            .get(&DataKey::OwnerDeploymentCount(owner.clone()))
            .unwrap_or(0)
    }

    fn owner_campaign_count(env: &Env, owner: &Address) -> u32 {
        env.storage()
            .persistent()
            .get(&DataKey::OwnerCampaignCount(owner.clone()))
            .unwrap_or(0)
    }

    fn range(
        env: &Env,
        start: u32,
        limit: u32,
        owner: Option<Address>,
    ) -> Result<Vec<Address>, Error> {
        let mut out = Vec::new(env);
        for info in Self::range_infos(env, start, limit, owner)?.iter() {
            out.push_back(info.address);
        }
        Ok(out)
    }

    fn range_infos(
        env: &Env,
        start: u32,
        limit: u32,
        owner: Option<Address>,
    ) -> Result<Vec<DeploymentInfo>, Error> {
        if limit > MAX_PAGE_LIMIT {
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

    fn range_campaign_infos(
        env: &Env,
        start: u32,
        limit: u32,
        owner: Option<Address>,
    ) -> Result<Vec<CampaignInfo>, Error> {
        if limit > MAX_PAGE_LIMIT {
            return Err(Error::InvalidLimit);
        }

        let count = match &owner {
            Some(owner) => Self::owner_campaign_count(env, owner),
            None => Self::campaign_count(env),
        };
        let mut out = Vec::new(env);
        let end = core::cmp::min(start.saturating_add(limit), count);
        for index in start..end {
            let key = match owner.clone() {
                Some(owner) => DataKey::OwnerCampaignAt(owner, index),
                None => DataKey::CampaignAt(index),
            };
            out.push_back(Self::campaign_info(env, key)?);
        }
        Ok(out)
    }

    fn deployment_info(env: &Env, key: DataKey) -> Result<DeploymentInfo, Error> {
        env.storage()
            .persistent()
            .get(&key)
            .ok_or(Error::NotInitialized)
    }

    fn campaign_info(env: &Env, key: DataKey) -> Result<CampaignInfo, Error> {
        env.storage()
            .persistent()
            .get(&key)
            .ok_or(Error::NotInitialized)
    }

    fn extend_contract_ttl(env: &Env) {
        env.deployer()
            .extend_ttl(env.current_contract_address(), TTL_THRESHOLD, TTL_EXTEND_TO);
    }
}
