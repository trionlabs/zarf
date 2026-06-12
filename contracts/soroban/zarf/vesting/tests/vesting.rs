use soroban_sdk::{
    contract, contracterror, contractimpl, contracttype,
    testutils::{
        storage::{Instance, Persistent},
        Address as _, Ledger,
    },
    token, Address, Bytes, BytesN, ConversionError, Env, IntoVal, InvokeError, String, Symbol, Val,
    Vec,
};
use zarf_jwk_registry::{JwkRegistryContract, JwkRegistryContractClient};
use zarf_vesting_soroban::{
    DataKey, Error as VestingError, ZarfVestingContract, ZarfVestingContractClient, DAY_IN_LEDGERS,
    MAX_CLAIMED_BATCH, TTL_EXTEND_TO,
};

#[contract]
pub struct MockVerifier;

#[contract]
pub struct ReentrantVerifier;

#[contracterror]
#[repr(u32)]
#[derive(Copy, Clone, Debug, Eq, PartialEq)]
pub enum MockVerifierError {
    Rejected = 1,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum ReentrantDataKey {
    Vesting,
    Recipient,
    Attempts,
}

#[contractimpl]
impl MockVerifier {
    pub fn verify_proof(
        _env: Env,
        _public_inputs: Bytes,
        proof: Bytes,
    ) -> Result<(), MockVerifierError> {
        if proof.is_empty() {
            return Err(MockVerifierError::Rejected);
        }
        Ok(())
    }
}

#[contractimpl]
impl ReentrantVerifier {
    pub fn set_target(env: Env, vesting: Address, recipient: Address) {
        env.storage()
            .instance()
            .set(&ReentrantDataKey::Vesting, &vesting);
        env.storage()
            .instance()
            .set(&ReentrantDataKey::Recipient, &recipient);
        env.storage()
            .instance()
            .set(&ReentrantDataKey::Attempts, &0_u32);
    }

    pub fn attempts(env: Env) -> u32 {
        env.storage()
            .instance()
            .get(&ReentrantDataKey::Attempts)
            .unwrap_or(0_u32)
    }

    pub fn verify_proof(
        env: Env,
        public_inputs: Bytes,
        proof: Bytes,
    ) -> Result<(), MockVerifierError> {
        if proof.is_empty() {
            return Err(MockVerifierError::Rejected);
        }

        let attempts = Self::attempts(env.clone());
        env.storage()
            .instance()
            .set(&ReentrantDataKey::Attempts, &(attempts + 1));

        if attempts == 0 {
            let vesting = env
                .storage()
                .instance()
                .get::<ReentrantDataKey, Address>(&ReentrantDataKey::Vesting)
                .expect("vesting target not set");
            let recipient = env
                .storage()
                .instance()
                .get::<ReentrantDataKey, Address>(&ReentrantDataKey::Recipient)
                .expect("recipient target not set");
            let mut args: Vec<Val> = Vec::new(&env);
            args.push_back(proof.into_val(&env));
            args.push_back(public_inputs.into_val(&env));
            args.push_back(recipient.into_val(&env));
            let _ = env.try_invoke_contract::<(), InvokeError>(
                &vesting,
                &Symbol::new(&env, "claim"),
                args,
            );
        }

        Ok(())
    }
}

const BN254_SCALAR_MODULUS_TEST: [u8; 32] = [
    0x30, 0x64, 0x4e, 0x72, 0xe1, 0x31, 0xa0, 0x29, 0xb8, 0x50, 0x45, 0xb6, 0x81, 0x81, 0x58, 0x5d,
    0x28, 0x33, 0xe8, 0x48, 0x79, 0xb9, 0x70, 0x91, 0x43, 0xe1, 0xf5, 0x93, 0xf0, 0x00, 0x00, 0x01,
];

// Shaped like a real 2048-bit RSA modulus (18x120-bit little-endian limbs:
// each limb < 2^120, limb 0 odd, top limb in [2^7, 2^8)) so the registry's
// modulus validation accepts the fixture.
fn limbs(env: &Env) -> Vec<BytesN<32>> {
    let mut limbs = Vec::new(env);
    for i in 0..18 {
        let mut raw = [0_u8; 32];
        raw[31] = if i == 17 { 0x80 } else { i + 1 };
        limbs.push_back(BytesN::from_array(env, &raw));
    }
    limbs
}

fn unregistered_limbs(env: &Env) -> Vec<BytesN<32>> {
    let mut limbs = Vec::new(env);
    for i in 0..18 {
        let mut raw = [0_u8; 32];
        raw[31] = if i == 17 { 0x80 } else { i + 33 };
        limbs.push_back(BytesN::from_array(env, &raw));
    }
    limbs
}

fn field_from_u64(env: &Env, value: u64) -> BytesN<32> {
    let mut raw = [0_u8; 32];
    raw[24..32].copy_from_slice(&value.to_be_bytes());
    BytesN::from_array(env, &raw)
}

fn field_from_i128(env: &Env, value: i128) -> BytesN<32> {
    let mut raw = [0_u8; 32];
    raw[16..32].copy_from_slice(&value.to_be_bytes());
    BytesN::from_array(env, &raw)
}

fn non_canonical_field(env: &Env, add: u8) -> BytesN<32> {
    let mut raw = BN254_SCALAR_MODULUS_TEST;
    let mut carry = add as u16;
    for i in (0..32).rev() {
        if carry == 0 {
            break;
        }
        let sum = raw[i] as u16 + carry;
        raw[i] = sum as u8;
        carry = sum >> 8;
    }
    BytesN::from_array(env, &raw)
}

fn audience_hash(env: &Env) -> BytesN<32> {
    BytesN::from_array(env, &[6_u8; 32])
}

fn other_audience_hash(env: &Env) -> BytesN<32> {
    BytesN::from_array(env, &[11_u8; 32])
}

fn append_field(bytes: &mut Bytes, field: &BytesN<32>) {
    bytes.extend_from_array(&field.to_array());
}

fn public_inputs_with_jwt(
    env: &Env,
    limbs: &Vec<BytesN<32>>,
    root: &BytesN<32>,
    unlock_time: u64,
    epoch_commitment: &BytesN<32>,
    recipient_field: &BytesN<32>,
    amount: i128,
    audience_hash: &BytesN<32>,
    jwt_exp: u64,
) -> Bytes {
    let mut public_inputs = Bytes::new(env);
    for limb in limbs.iter() {
        append_field(&mut public_inputs, &limb);
    }
    append_field(&mut public_inputs, root);
    append_field(&mut public_inputs, &field_from_u64(env, unlock_time));
    append_field(&mut public_inputs, epoch_commitment);
    append_field(&mut public_inputs, recipient_field);
    append_field(&mut public_inputs, &field_from_i128(env, amount));
    append_field(&mut public_inputs, audience_hash);
    append_field(&mut public_inputs, &field_from_u64(env, jwt_exp));
    public_inputs
}

fn public_inputs(
    env: &Env,
    limbs: &Vec<BytesN<32>>,
    root: &BytesN<32>,
    unlock_time: u64,
    epoch_commitment: &BytesN<32>,
    recipient_field: &BytesN<32>,
    amount: i128,
) -> Bytes {
    public_inputs_with_jwt(
        env,
        limbs,
        root,
        unlock_time,
        epoch_commitment,
        recipient_field,
        amount,
        &audience_hash(env),
        1_700_003_600,
    )
}

struct ClaimCase {
    recipient: Address,
    token_id: Address,
    vesting_id: Address,
    limbs: Vec<BytesN<32>>,
    root: BytesN<32>,
    audience_hash: BytesN<32>,
    epoch_commitment: BytesN<32>,
    recipient_field: BytesN<32>,
    amount: i128,
    funded_amount: i128,
    public_inputs: Bytes,
    proof: Bytes,
}

fn setup_claim_case(env: &Env, verifier_id: Address, funded_amount: i128) -> ClaimCase {
    env.ledger()
        .with_mut(|ledger| ledger.timestamp = 1_700_000_000);

    let owner = Address::generate(env);
    let recipient = Address::generate(env);
    let root = BytesN::from_array(env, &[7_u8; 32]);
    let epoch_commitment = BytesN::from_array(env, &[9_u8; 32]);
    let amount = 123_i128;

    let token_asset = env.register_stellar_asset_contract_v2(owner.clone());
    let token_id = token_asset.address();
    let token_admin = token::StellarAssetClient::new(env, &token_id);

    let registry_id = env.register(JwkRegistryContract, (owner.clone(), 0_u64));
    let registry = JwkRegistryContractClient::new(env, &registry_id);
    let limbs = limbs(env);
    registry.register_key(&String::from_str(env, "google-key-1"), &limbs);

    let vesting_id = env.register(
        ZarfVestingContract,
        (
            owner,
            token_id.clone(),
            verifier_id,
            registry_id,
            String::from_str(env, "Zarf"),
            String::from_str(env, "Private vesting"),
            root.clone(),
            audience_hash(env),
            String::from_str(env, "ipfs://claim-list"),
        ),
    );
    if funded_amount > 0 {
        token_admin.mint(&vesting_id, &funded_amount);
    }

    let vesting = ZarfVestingContractClient::new(env, &vesting_id);
    let recipient_field = vesting.recipient_id(&recipient);
    let public_inputs = public_inputs(
        env,
        &limbs,
        &root,
        1_699_999_999,
        &epoch_commitment,
        &recipient_field,
        amount,
    );
    let proof = Bytes::from_array(env, &[1_u8; 32]);

    ClaimCase {
        recipient,
        token_id,
        vesting_id,
        limbs,
        root,
        epoch_commitment,
        recipient_field,
        amount,
        funded_amount,
        public_inputs,
        proof,
        audience_hash: audience_hash(env),
    }
}

fn assert_vesting_error(
    result: Result<Result<(), ConversionError>, Result<VestingError, InvokeError>>,
    expected: VestingError,
) {
    match result {
        Err(Ok(error)) if error == expected => {}
        other => panic!("expected {:?}, got {:?}", expected, other),
    }
}

fn assert_failed_claim_side_effects(env: &Env, case: &ClaimCase, epoch_commitment: &BytesN<32>) {
    let token = token::TokenClient::new(env, &case.token_id);
    let vesting = ZarfVestingContractClient::new(env, &case.vesting_id);
    assert_eq!(token.balance(&case.recipient), 0);
    assert_eq!(token.balance(&case.vesting_id), case.funded_amount);
    assert!(!vesting.is_claimed(epoch_commitment));
}

fn expect_claim_rejection<F>(expected: VestingError, build: F)
where
    F: FnOnce(&Env, &ClaimCase) -> (Bytes, Bytes, BytesN<32>),
{
    let env = Env::default();
    env.mock_all_auths();
    let verifier_id = env.register(MockVerifier, ());
    let case = setup_claim_case(&env, verifier_id, 123);
    let vesting = ZarfVestingContractClient::new(&env, &case.vesting_id);
    let (public_inputs, proof, epoch_commitment) = build(&env, &case);

    assert_vesting_error(
        vesting.try_claim(&proof, &public_inputs, &case.recipient),
        expected,
    );
    assert_failed_claim_side_effects(&env, &case, &epoch_commitment);
}

#[test]
fn claim_checks_registry_root_recipient_time_and_transfers() {
    let env = Env::default();
    env.mock_all_auths();
    env.ledger()
        .with_mut(|ledger| ledger.timestamp = 1_700_000_000);

    let owner = Address::generate(&env);
    let recipient = Address::generate(&env);
    let root = BytesN::from_array(&env, &[7_u8; 32]);
    let epoch_commitment = BytesN::from_array(&env, &[9_u8; 32]);
    let amount = 123_i128;

    let token_asset = env.register_stellar_asset_contract_v2(owner.clone());
    let token_id = token_asset.address();
    let token_admin = token::StellarAssetClient::new(&env, &token_id);

    let registry_id = env.register(JwkRegistryContract, (owner.clone(), 0_u64));
    let registry = JwkRegistryContractClient::new(&env, &registry_id);
    let limbs = limbs(&env);
    registry.register_key(&String::from_str(&env, "google-key-1"), &limbs);

    let verifier_id = env.register(MockVerifier, ());
    let vesting_id = env.register(
        ZarfVestingContract,
        (
            owner.clone(),
            token_id.clone(),
            verifier_id.clone(),
            registry_id.clone(),
            String::from_str(&env, "Zarf"),
            String::from_str(&env, "Private vesting"),
            root.clone(),
            audience_hash(&env),
            String::from_str(&env, "ipfs://claim-list"),
        ),
    );
    let vesting = ZarfVestingContractClient::new(&env, &vesting_id);

    let summary = vesting.summary();
    assert_eq!(summary.owner, owner);
    assert_eq!(summary.token, token_id);
    assert_eq!(summary.verifier, verifier_id);
    assert_eq!(summary.jwk_registry, registry_id);
    assert_eq!(summary.name, String::from_str(&env, "Zarf"));
    assert_eq!(
        summary.description,
        String::from_str(&env, "Private vesting")
    );
    assert_eq!(summary.merkle_root, root);
    assert_eq!(summary.audience_hash, audience_hash(&env));
    assert_eq!(
        summary.metadata_cid,
        String::from_str(&env, "ipfs://claim-list")
    );

    token_admin.mint(&vesting_id, &amount);
    let recipient_field = vesting.recipient_id(&recipient);
    let public_inputs = public_inputs(
        &env,
        &limbs,
        &root,
        1_699_999_999,
        &epoch_commitment,
        &recipient_field,
        amount,
    );
    let proof = Bytes::from_array(&env, &[1_u8; 32]);

    vesting.claim(&proof, &public_inputs, &recipient);

    let token = token::TokenClient::new(&env, &token_id);
    assert_eq!(token.balance(&recipient), amount);
    assert!(vesting.is_claimed(&epoch_commitment));
}

#[test]
fn claim_rejects_non_canonical_public_input_field() {
    let env = Env::default();
    env.mock_all_auths();
    env.ledger()
        .with_mut(|ledger| ledger.timestamp = 1_700_000_000);

    let owner = Address::generate(&env);
    let recipient = Address::generate(&env);
    let root = BytesN::from_array(&env, &[7_u8; 32]);
    let non_canonical_epoch = non_canonical_field(&env, 9);
    let amount = 123_i128;

    let token_asset = env.register_stellar_asset_contract_v2(owner.clone());
    let token_id = token_asset.address();
    let token_admin = token::StellarAssetClient::new(&env, &token_id);

    let registry_id = env.register(JwkRegistryContract, (owner.clone(), 0_u64));
    let registry = JwkRegistryContractClient::new(&env, &registry_id);
    let limbs = limbs(&env);
    registry.register_key(&String::from_str(&env, "google-key-1"), &limbs);

    let verifier_id = env.register(MockVerifier, ());
    let vesting_id = env.register(
        ZarfVestingContract,
        (
            owner.clone(),
            token_id.clone(),
            verifier_id,
            registry_id,
            String::from_str(&env, "Zarf"),
            String::from_str(&env, "Private vesting"),
            root.clone(),
            audience_hash(&env),
            String::from_str(&env, "ipfs://claim-list"),
        ),
    );
    let vesting = ZarfVestingContractClient::new(&env, &vesting_id);
    token_admin.mint(&vesting_id, &amount);

    let recipient_field = vesting.recipient_id(&recipient);
    let public_inputs = public_inputs(
        &env,
        &limbs,
        &root,
        1_699_999_999,
        &non_canonical_epoch,
        &recipient_field,
        amount,
    );
    let proof = Bytes::from_array(&env, &[1_u8; 32]);

    match vesting.try_claim(&proof, &public_inputs, &recipient) {
        Err(Ok(VestingError::InvalidPublicInputs)) => {}
        other => panic!("unexpected non-canonical claim result: {:?}", other),
    }

    let token = token::TokenClient::new(&env, &token_id);
    assert_eq!(token.balance(&recipient), 0);
    assert!(!vesting.is_claimed(&non_canonical_epoch));
}

#[test]
fn claim_negative_matrix_rejects_without_state_changes() {
    expect_claim_rejection(VestingError::InvalidPublicInputs, |env, case| {
        (
            Bytes::from_array(env, &[1_u8; 31]),
            case.proof.clone(),
            case.epoch_commitment.clone(),
        )
    });

    expect_claim_rejection(VestingError::InvalidPubkey, |env, case| {
        (
            public_inputs(
                env,
                &unregistered_limbs(env),
                &case.root,
                1_699_999_999,
                &case.epoch_commitment,
                &case.recipient_field,
                case.amount,
            ),
            case.proof.clone(),
            case.epoch_commitment.clone(),
        )
    });

    expect_claim_rejection(VestingError::InvalidMerkleRoot, |env, case| {
        let wrong_root = BytesN::from_array(env, &[8_u8; 32]);
        (
            public_inputs(
                env,
                &case.limbs,
                &wrong_root,
                1_699_999_999,
                &case.epoch_commitment,
                &case.recipient_field,
                case.amount,
            ),
            case.proof.clone(),
            case.epoch_commitment.clone(),
        )
    });

    expect_claim_rejection(VestingError::InvalidRecipient, |env, case| {
        let other_recipient = Address::generate(env);
        let vesting = ZarfVestingContractClient::new(env, &case.vesting_id);
        let wrong_recipient_field = vesting.recipient_id(&other_recipient);
        (
            public_inputs(
                env,
                &case.limbs,
                &case.root,
                1_699_999_999,
                &case.epoch_commitment,
                &wrong_recipient_field,
                case.amount,
            ),
            case.proof.clone(),
            case.epoch_commitment.clone(),
        )
    });

    expect_claim_rejection(VestingError::EpochLocked, |env, case| {
        (
            public_inputs(
                env,
                &case.limbs,
                &case.root,
                1_700_000_001,
                &case.epoch_commitment,
                &case.recipient_field,
                case.amount,
            ),
            case.proof.clone(),
            case.epoch_commitment.clone(),
        )
    });

    expect_claim_rejection(VestingError::InvalidAmount, |env, case| {
        (
            public_inputs(
                env,
                &case.limbs,
                &case.root,
                1_699_999_999,
                &case.epoch_commitment,
                &case.recipient_field,
                0,
            ),
            case.proof.clone(),
            case.epoch_commitment.clone(),
        )
    });

    expect_claim_rejection(VestingError::InvalidAudience, |env, case| {
        (
            public_inputs_with_jwt(
                env,
                &case.limbs,
                &case.root,
                1_699_999_999,
                &case.epoch_commitment,
                &case.recipient_field,
                case.amount,
                &other_audience_hash(env),
                1_700_003_600,
            ),
            case.proof.clone(),
            case.epoch_commitment.clone(),
        )
    });

    expect_claim_rejection(VestingError::JwtExpired, |env, case| {
        (
            public_inputs_with_jwt(
                env,
                &case.limbs,
                &case.root,
                1_699_999_999,
                &case.epoch_commitment,
                &case.recipient_field,
                case.amount,
                &case.audience_hash,
                1_699_999_999,
            ),
            case.proof.clone(),
            case.epoch_commitment.clone(),
        )
    });

    expect_claim_rejection(VestingError::InvalidProof, |env, case| {
        (
            case.public_inputs.clone(),
            Bytes::new(env),
            case.epoch_commitment.clone(),
        )
    });
}

fn commitment_n(env: &Env, n: u32) -> BytesN<32> {
    let mut raw = [0_u8; 32];
    raw[28..32].copy_from_slice(&n.to_be_bytes());
    BytesN::from_array(env, &raw)
}

#[test]
fn claimed_statuses_reports_batch_in_order() {
    let env = Env::default();
    env.mock_all_auths();
    let verifier_id = env.register(MockVerifier, ());
    let case = setup_claim_case(&env, verifier_id, 123);
    let vesting = ZarfVestingContractClient::new(&env, &case.vesting_id);

    assert_eq!(vesting.claimed_statuses(&Vec::new(&env)).len(), 0);

    vesting.claim(&case.proof, &case.public_inputs, &case.recipient);

    let mut commitments = Vec::new(&env);
    commitments.push_back(commitment_n(&env, 1));
    commitments.push_back(case.epoch_commitment.clone());
    commitments.push_back(commitment_n(&env, 2));

    let mut expected = Vec::new(&env);
    expected.push_back(false);
    expected.push_back(true);
    expected.push_back(false);
    assert_eq!(vesting.claimed_statuses(&commitments), expected);
}

#[test]
fn claimed_statuses_enforces_entry_count_cap() {
    let env = Env::default();
    env.mock_all_auths();
    let verifier_id = env.register(MockVerifier, ());
    let case = setup_claim_case(&env, verifier_id, 123);
    let vesting = ZarfVestingContractClient::new(&env, &case.vesting_id);

    let mut at_cap = Vec::new(&env);
    for n in 0..MAX_CLAIMED_BATCH {
        at_cap.push_back(commitment_n(&env, n));
    }
    assert_eq!(vesting.claimed_statuses(&at_cap).len(), MAX_CLAIMED_BATCH);

    let mut oversized = at_cap.clone();
    oversized.push_back(commitment_n(&env, MAX_CLAIMED_BATCH));
    match vesting.try_claimed_statuses(&oversized) {
        Err(Ok(VestingError::TooManyCommitments)) => {}
        other => panic!("unexpected oversized batch result: {:?}", other),
    }
}

#[test]
fn claim_extends_claimed_entry_and_instance_ttl() {
    let env = Env::default();
    env.mock_all_auths();
    let verifier_id = env.register(MockVerifier, ());
    let case = setup_claim_case(&env, verifier_id, 123);
    let vesting = ZarfVestingContractClient::new(&env, &case.vesting_id);

    vesting.claim(&case.proof, &case.public_inputs, &case.recipient);

    // A freshly written Claimed guard would otherwise live only the network
    // minimum (~a week); claim must push it to the long-lived target.
    let claimed_ttl = env.as_contract(&case.vesting_id, || {
        env.storage()
            .persistent()
            .get_ttl(&DataKey::Claimed(case.epoch_commitment.clone()))
    });
    assert_eq!(claimed_ttl, TTL_EXTEND_TO);

    let instance_ttl = env.as_contract(&case.vesting_id, || env.storage().instance().get_ttl());
    assert_eq!(instance_ttl, TTL_EXTEND_TO);
}

#[test]
fn constructor_extends_instance_ttl() {
    let env = Env::default();
    env.mock_all_auths();
    let verifier_id = env.register(MockVerifier, ());
    let case = setup_claim_case(&env, verifier_id, 0);

    let instance_ttl = env.as_contract(&case.vesting_id, || env.storage().instance().get_ttl());
    assert_eq!(instance_ttl, TTL_EXTEND_TO);
}

#[test]
fn set_merkle_root_re_extends_decayed_instance_ttl() {
    let env = Env::default();
    env.mock_all_auths();

    let owner = Address::generate(&env);
    let zero_root = BytesN::from_array(&env, &[0_u8; 32]);
    let root = BytesN::from_array(&env, &[5_u8; 32]);

    let token_asset = env.register_stellar_asset_contract_v2(owner.clone());
    let token_id = token_asset.address();
    let verifier_id = env.register(MockVerifier, ());
    let registry_id = env.register(JwkRegistryContract, (owner.clone(), 0_u64));
    let vesting_id = env.register(
        ZarfVestingContract,
        (
            owner,
            token_id,
            verifier_id,
            registry_id,
            String::from_str(&env, "Zarf"),
            String::from_str(&env, "Private vesting"),
            zero_root,
            audience_hash(&env),
            String::from_str(&env, "ipfs://claim-list"),
        ),
    );
    let vesting = ZarfVestingContractClient::new(&env, &vesting_id);

    // Decay past the one-day re-extension threshold...
    env.ledger()
        .with_mut(|ledger| ledger.sequence_number += DAY_IN_LEDGERS + 1);
    let decayed = env.as_contract(&vesting_id, || env.storage().instance().get_ttl());
    assert_eq!(decayed, TTL_EXTEND_TO - DAY_IN_LEDGERS - 1);

    // ...and the next state-changing call must bump it back to the target.
    vesting.set_merkle_root(&root);
    let extended = env.as_contract(&vesting_id, || env.storage().instance().get_ttl());
    assert_eq!(extended, TTL_EXTEND_TO);
}

#[test]
fn second_claim_is_rejected_without_double_transfer() {
    let env = Env::default();
    env.mock_all_auths();
    let verifier_id = env.register(MockVerifier, ());
    let case = setup_claim_case(&env, verifier_id, 246);
    let vesting = ZarfVestingContractClient::new(&env, &case.vesting_id);
    let token = token::TokenClient::new(&env, &case.token_id);

    vesting.claim(&case.proof, &case.public_inputs, &case.recipient);
    assert_eq!(token.balance(&case.recipient), case.amount);
    assert_eq!(token.balance(&case.vesting_id), case.amount);
    assert!(vesting.is_claimed(&case.epoch_commitment));

    assert_vesting_error(
        vesting.try_claim(&case.proof, &case.public_inputs, &case.recipient),
        VestingError::AlreadyClaimed,
    );
    assert_eq!(token.balance(&case.recipient), case.amount);
    assert_eq!(token.balance(&case.vesting_id), case.amount);
    assert!(vesting.is_claimed(&case.epoch_commitment));
}

#[test]
fn insufficient_balance_claim_rolls_back_claim_guard() {
    let env = Env::default();
    env.mock_all_auths();
    let verifier_id = env.register(MockVerifier, ());
    let case = setup_claim_case(&env, verifier_id, 122);
    let vesting = ZarfVestingContractClient::new(&env, &case.vesting_id);
    let token = token::TokenClient::new(&env, &case.token_id);

    let result = vesting.try_claim(&case.proof, &case.public_inputs, &case.recipient);
    assert!(result.is_err(), "underfunded claim unexpectedly succeeded");
    assert_eq!(token.balance(&case.recipient), 0);
    assert_eq!(token.balance(&case.vesting_id), 122);
    assert!(!vesting.is_claimed(&case.epoch_commitment));
}

#[test]
fn claim_guard_blocks_reentrant_verifier_callback() {
    let env = Env::default();
    env.mock_all_auths();
    env.ledger()
        .with_mut(|ledger| ledger.timestamp = 1_700_000_000);

    let owner = Address::generate(&env);
    let recipient = Address::generate(&env);
    let root = BytesN::from_array(&env, &[7_u8; 32]);
    let epoch_commitment = BytesN::from_array(&env, &[9_u8; 32]);
    let amount = 123_i128;

    let token_asset = env.register_stellar_asset_contract_v2(owner.clone());
    let token_id = token_asset.address();
    let token_admin = token::StellarAssetClient::new(&env, &token_id);

    let registry_id = env.register(JwkRegistryContract, (owner.clone(), 0_u64));
    let registry = JwkRegistryContractClient::new(&env, &registry_id);
    let limbs = limbs(&env);
    registry.register_key(&String::from_str(&env, "google-key-1"), &limbs);

    let verifier_id = env.register(ReentrantVerifier, ());
    let verifier = ReentrantVerifierClient::new(&env, &verifier_id);
    let vesting_id = env.register(
        ZarfVestingContract,
        (
            owner.clone(),
            token_id.clone(),
            verifier_id,
            registry_id,
            String::from_str(&env, "Zarf"),
            String::from_str(&env, "Private vesting"),
            root.clone(),
            audience_hash(&env),
            String::from_str(&env, "ipfs://claim-list"),
        ),
    );
    let vesting = ZarfVestingContractClient::new(&env, &vesting_id);
    verifier.set_target(&vesting_id, &recipient);
    token_admin.mint(&vesting_id, &(amount * 2));

    let recipient_field = vesting.recipient_id(&recipient);
    let public_inputs = public_inputs(
        &env,
        &limbs,
        &root,
        1_699_999_999,
        &epoch_commitment,
        &recipient_field,
        amount,
    );
    let proof = Bytes::from_array(&env, &[1_u8; 32]);

    vesting.claim(&proof, &public_inputs, &recipient);

    let token = token::TokenClient::new(&env, &token_id);
    assert_eq!(token.balance(&recipient), amount);
    assert_eq!(token.balance(&vesting_id), amount);
    assert_eq!(verifier.attempts(), 1);
    assert!(vesting.is_claimed(&epoch_commitment));
}

#[test]
fn failed_verifier_does_not_leave_claimed_guard() {
    let env = Env::default();
    env.mock_all_auths();
    env.ledger()
        .with_mut(|ledger| ledger.timestamp = 1_700_000_000);

    let owner = Address::generate(&env);
    let recipient = Address::generate(&env);
    let root = BytesN::from_array(&env, &[7_u8; 32]);
    let epoch_commitment = BytesN::from_array(&env, &[9_u8; 32]);
    let amount = 123_i128;

    let token_asset = env.register_stellar_asset_contract_v2(owner.clone());
    let token_id = token_asset.address();
    let token_admin = token::StellarAssetClient::new(&env, &token_id);

    let registry_id = env.register(JwkRegistryContract, (owner.clone(), 0_u64));
    let registry = JwkRegistryContractClient::new(&env, &registry_id);
    let limbs = limbs(&env);
    registry.register_key(&String::from_str(&env, "google-key-1"), &limbs);

    let verifier_id = env.register(MockVerifier, ());
    let vesting_id = env.register(
        ZarfVestingContract,
        (
            owner.clone(),
            token_id.clone(),
            verifier_id,
            registry_id,
            String::from_str(&env, "Zarf"),
            String::from_str(&env, "Private vesting"),
            root.clone(),
            audience_hash(&env),
            String::from_str(&env, "ipfs://claim-list"),
        ),
    );
    let vesting = ZarfVestingContractClient::new(&env, &vesting_id);
    token_admin.mint(&vesting_id, &amount);

    let recipient_field = vesting.recipient_id(&recipient);
    let public_inputs = public_inputs(
        &env,
        &limbs,
        &root,
        1_699_999_999,
        &epoch_commitment,
        &recipient_field,
        amount,
    );
    let proof = Bytes::new(&env);

    match vesting.try_claim(&proof, &public_inputs, &recipient) {
        Err(Ok(VestingError::InvalidProof)) => {}
        other => panic!("unexpected rejected proof result: {:?}", other),
    }

    let token = token::TokenClient::new(&env, &token_id);
    assert_eq!(token.balance(&recipient), 0);
    assert_eq!(token.balance(&vesting_id), amount);
    assert!(!vesting.is_claimed(&epoch_commitment));
}

#[test]
#[should_panic]
fn constructor_rejects_non_canonical_merkle_root() {
    let env = Env::default();
    env.mock_all_auths();

    let owner = Address::generate(&env);
    let token_asset = env.register_stellar_asset_contract_v2(owner.clone());
    let token_id = token_asset.address();
    let verifier_id = env.register(MockVerifier, ());
    let registry_id = env.register(JwkRegistryContract, (owner.clone(), 0_u64));

    let _ = env.register(
        ZarfVestingContract,
        (
            owner,
            token_id,
            verifier_id,
            registry_id,
            String::from_str(&env, "Zarf"),
            String::from_str(&env, "Private vesting"),
            non_canonical_field(&env, 1),
            audience_hash(&env),
            String::from_str(&env, "ipfs://claim-list"),
        ),
    );
}

#[test]
#[should_panic]
fn constructor_rejects_zero_audience_hash() {
    let env = Env::default();
    env.mock_all_auths();

    let owner = Address::generate(&env);
    let token_asset = env.register_stellar_asset_contract_v2(owner.clone());
    let token_id = token_asset.address();
    let verifier_id = env.register(MockVerifier, ());
    let registry_id = env.register(JwkRegistryContract, (owner.clone(), 0_u64));

    let _ = env.register(
        ZarfVestingContract,
        (
            owner,
            token_id,
            verifier_id,
            registry_id,
            String::from_str(&env, "Zarf"),
            String::from_str(&env, "Private vesting"),
            BytesN::from_array(&env, &[7_u8; 32]),
            BytesN::from_array(&env, &[0_u8; 32]),
            String::from_str(&env, "ipfs://claim-list"),
        ),
    );
}

#[test]
#[should_panic]
fn constructor_rejects_non_canonical_audience_hash() {
    let env = Env::default();
    env.mock_all_auths();

    let owner = Address::generate(&env);
    let token_asset = env.register_stellar_asset_contract_v2(owner.clone());
    let token_id = token_asset.address();
    let verifier_id = env.register(MockVerifier, ());
    let registry_id = env.register(JwkRegistryContract, (owner.clone(), 0_u64));

    let _ = env.register(
        ZarfVestingContract,
        (
            owner,
            token_id,
            verifier_id,
            registry_id,
            String::from_str(&env, "Zarf"),
            String::from_str(&env, "Private vesting"),
            BytesN::from_array(&env, &[7_u8; 32]),
            non_canonical_field(&env, 1),
            String::from_str(&env, "ipfs://claim-list"),
        ),
    );
}

#[test]
fn set_merkle_root_is_one_time_before_funding_only() {
    let env = Env::default();
    env.mock_all_auths();

    let owner = Address::generate(&env);
    let zero_root = BytesN::from_array(&env, &[0_u8; 32]);
    let root = BytesN::from_array(&env, &[1_u8; 32]);
    let root2 = BytesN::from_array(&env, &[2_u8; 32]);

    let token_asset = env.register_stellar_asset_contract_v2(owner.clone());
    let token_id = token_asset.address();
    let verifier_id = env.register(MockVerifier, ());
    let registry_id = env.register(JwkRegistryContract, (owner.clone(), 0_u64));
    let vesting_id = env.register(
        ZarfVestingContract,
        (
            owner.clone(),
            token_id,
            verifier_id,
            registry_id,
            String::from_str(&env, "Zarf"),
            String::from_str(&env, "Private vesting"),
            zero_root.clone(),
            audience_hash(&env),
            String::from_str(&env, "ipfs://claim-list"),
        ),
    );
    let vesting = ZarfVestingContractClient::new(&env, &vesting_id);

    match vesting.try_set_merkle_root(&root) {
        Ok(Ok(())) => {}
        other => panic!("unexpected set_merkle_root result: {:?}", other),
    }
    assert_eq!(vesting.merkle_root(), root);

    match vesting.try_set_merkle_root(&root2) {
        Err(Ok(VestingError::MerkleRootAlreadySet)) => {}
        other => panic!("unexpected second set_merkle_root result: {:?}", other),
    }
}

#[test]
fn set_merkle_root_allows_unsolicited_dust_before_root_finalization() {
    let env = Env::default();
    env.mock_all_auths();

    let owner = Address::generate(&env);
    let zero_root = BytesN::from_array(&env, &[0_u8; 32]);
    let root = BytesN::from_array(&env, &[3_u8; 32]);

    let token_asset = env.register_stellar_asset_contract_v2(owner.clone());
    let token_id = token_asset.address();
    let token_admin = token::StellarAssetClient::new(&env, &token_id);
    let verifier_id = env.register(MockVerifier, ());
    let registry_id = env.register(JwkRegistryContract, (owner.clone(), 0_u64));
    let vesting_id = env.register(
        ZarfVestingContract,
        (
            owner.clone(),
            token_id,
            verifier_id,
            registry_id,
            String::from_str(&env, "Zarf"),
            String::from_str(&env, "Private vesting"),
            zero_root,
            audience_hash(&env),
            String::from_str(&env, "ipfs://claim-list"),
        ),
    );
    let vesting = ZarfVestingContractClient::new(&env, &vesting_id);
    token_admin.mint(&vesting_id, &1);

    match vesting.try_set_merkle_root(&root) {
        Ok(Ok(())) => {}
        other => panic!("unexpected dusted set_merkle_root result: {:?}", other),
    }
    assert_eq!(vesting.merkle_root(), root);
}

#[test]
fn set_merkle_root_rejects_zero_root() {
    let env = Env::default();
    env.mock_all_auths();

    let owner = Address::generate(&env);
    let zero_root = BytesN::from_array(&env, &[0_u8; 32]);

    let token_asset = env.register_stellar_asset_contract_v2(owner.clone());
    let token_id = token_asset.address();
    let verifier_id = env.register(MockVerifier, ());
    let registry_id = env.register(JwkRegistryContract, (owner.clone(), 0_u64));
    let vesting_id = env.register(
        ZarfVestingContract,
        (
            owner.clone(),
            token_id,
            verifier_id,
            registry_id,
            String::from_str(&env, "Zarf"),
            String::from_str(&env, "Private vesting"),
            zero_root.clone(),
            audience_hash(&env),
            String::from_str(&env, "ipfs://claim-list"),
        ),
    );
    let vesting = ZarfVestingContractClient::new(&env, &vesting_id);

    match vesting.try_set_merkle_root(&zero_root) {
        Err(Ok(VestingError::InvalidMerkleRoot)) => {}
        other => panic!("unexpected zero set_merkle_root result: {:?}", other),
    }
}

#[test]
fn deposit_rejects_zero_merkle_root() {
    let env = Env::default();
    env.mock_all_auths();

    let owner = Address::generate(&env);
    let zero_root = BytesN::from_array(&env, &[0_u8; 32]);

    let token_asset = env.register_stellar_asset_contract_v2(owner.clone());
    let token_id = token_asset.address();
    let verifier_id = env.register(MockVerifier, ());
    let registry_id = env.register(JwkRegistryContract, (owner.clone(), 0_u64));
    let vesting_id = env.register(
        ZarfVestingContract,
        (
            owner.clone(),
            token_id,
            verifier_id,
            registry_id,
            String::from_str(&env, "Zarf"),
            String::from_str(&env, "Private vesting"),
            zero_root,
            audience_hash(&env),
            String::from_str(&env, "ipfs://claim-list"),
        ),
    );
    let vesting = ZarfVestingContractClient::new(&env, &vesting_id);

    match vesting.try_deposit(&1) {
        Err(Ok(VestingError::InvalidMerkleRoot)) => {}
        other => panic!("unexpected zero-root deposit result: {:?}", other),
    }
}

#[test]
fn owner_methods_require_auth_without_mock_all_auths() {
    let env = Env::default();

    let owner = Address::generate(&env);
    let new_owner = Address::generate(&env);
    let zero_root = BytesN::from_array(&env, &[0_u8; 32]);
    let root = BytesN::from_array(&env, &[4_u8; 32]);

    let token_asset = env.register_stellar_asset_contract_v2(owner.clone());
    let token_id = token_asset.address();
    let verifier_id = env.register(MockVerifier, ());
    let registry_id = env.register(JwkRegistryContract, (owner.clone(), 0_u64));
    let vesting_id = env.register(
        ZarfVestingContract,
        (
            owner.clone(),
            token_id,
            verifier_id,
            registry_id,
            String::from_str(&env, "Zarf"),
            String::from_str(&env, "Private vesting"),
            zero_root.clone(),
            audience_hash(&env),
            String::from_str(&env, "ipfs://claim-list"),
        ),
    );
    let vesting = ZarfVestingContractClient::new(&env, &vesting_id);

    assert!(vesting.try_set_merkle_root(&root).is_err());
    assert!(vesting.try_transfer_ownership(&new_owner).is_err());
    assert_eq!(vesting.merkle_root(), zero_root);
    assert_eq!(vesting.owner(), owner);
}
