use soroban_sdk::{
    contract, contracterror, contractimpl,
    testutils::{Address as _, Ledger},
    token, Address, Bytes, BytesN, Env, String, Vec,
};
use zarf_jwk_registry::{JwkRegistryContract, JwkRegistryContractClient};
use zarf_vesting_soroban::{ZarfVestingContract, ZarfVestingContractClient};

#[contract]
pub struct MockVerifier;

#[contracterror]
#[repr(u32)]
#[derive(Copy, Clone, Debug, Eq, PartialEq)]
pub enum MockVerifierError {
    Rejected = 1,
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

fn limbs(env: &Env) -> Vec<BytesN<32>> {
    let mut limbs = Vec::new(env);
    for i in 0..18 {
        let mut raw = [0_u8; 32];
        raw[31] = i + 1;
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

fn append_field(bytes: &mut Bytes, field: &BytesN<32>) {
    bytes.extend_from_array(&field.to_array());
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
    let mut public_inputs = Bytes::new(env);
    for limb in limbs.iter() {
        append_field(&mut public_inputs, &limb);
    }
    append_field(&mut public_inputs, root);
    append_field(&mut public_inputs, &field_from_u64(env, unlock_time));
    append_field(&mut public_inputs, epoch_commitment);
    append_field(&mut public_inputs, recipient_field);
    append_field(&mut public_inputs, &field_from_i128(env, amount));
    public_inputs
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

    let registry_id = env.register(JwkRegistryContract, (owner.clone(),));
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
