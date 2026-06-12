use rs_soroban_ultrahonk::UltraHonkVerifierContract;
use soroban_sdk::{
    testutils::{Address as _, Ledger},
    token, Address, Bytes, BytesN, Env, String, Vec,
};
use std::rc::Rc;
use zarf_jwk_registry::{JwkRegistryContract, JwkRegistryContractClient};
use zarf_vesting_soroban::{ZarfVestingContract, ZarfVestingContractClient};

const ALICE: &str = "GC6TCMKAV55B5M3ESAJZLEJXSD2KF6UGWXCIFZDB7VURMTLYW724ITS4";
const FIELD_BYTES: u32 = 32;
const PUBKEY_LIMBS: u32 = 18;
const ROOT_INDEX: u32 = 18;
const EPOCH_COMMITMENT_INDEX: u32 = 20;
const AMOUNT_INDEX: u32 = 22;
const AUDIENCE_HASH_INDEX: u32 = 23;

fn field_at(env: &Env, public_inputs: &Bytes, index: u32) -> BytesN<32> {
    let start = index * FIELD_BYTES;
    let mut raw = [0_u8; 32];
    public_inputs
        .slice(start..start + FIELD_BYTES)
        .copy_into_slice(&mut raw);
    BytesN::from_array(env, &raw)
}

fn bytesn_from_hex(env: &Env, hex: &str) -> BytesN<32> {
    let hex = hex.trim().strip_prefix("0x").unwrap_or(hex.trim());
    assert_eq!(hex.len(), 64, "expected 32-byte hex string");
    let mut raw = [0_u8; 32];
    for i in 0..32 {
        raw[i] = u8::from_str_radix(&hex[i * 2..i * 2 + 2], 16).expect("valid hex");
    }
    BytesN::from_array(env, &raw)
}

fn pubkey_limbs(env: &Env, public_inputs: &Bytes) -> Vec<BytesN<32>> {
    let mut limbs = Vec::new(env);
    for index in 0..PUBKEY_LIMBS {
        limbs.push_back(field_at(env, public_inputs, index));
    }
    limbs
}

fn field_to_i128(field: &BytesN<32>) -> i128 {
    let raw = field.to_array();
    let mut tail = [0_u8; 16];
    tail.copy_from_slice(&raw[16..32]);
    i128::from_be_bytes(tail)
}

fn ensure_account_exists(env: &Env, address: &Address) {
    use soroban_sdk::xdr::{
        AccountEntry, AccountEntryExt, LedgerEntry, LedgerEntryData, LedgerEntryExt, LedgerKey,
        LedgerKeyAccount, ScAddress, SequenceNumber, Thresholds, VecM,
    };

    let ScAddress::Account(account_id) = ScAddress::from(address) else {
        panic!("expected account address");
    };
    let key = Rc::new(LedgerKey::Account(LedgerKeyAccount {
        account_id: account_id.clone(),
    }));
    if env.host().get_ledger_entry(&key).unwrap().is_some() {
        return;
    }
    let entry = Rc::new(LedgerEntry {
        data: LedgerEntryData::Account(AccountEntry {
            account_id,
            balance: 0,
            flags: 0,
            home_domain: Default::default(),
            inflation_dest: None,
            num_sub_entries: 0,
            seq_num: SequenceNumber(0),
            thresholds: Thresholds([1; 4]),
            signers: VecM::default(),
            ext: AccountEntryExt::V0,
        }),
        last_modified_ledger_seq: 0,
        ext: LedgerEntryExt::V0,
    });
    env.host().add_ledger_entry(&key, &entry, None).unwrap();
}

#[test]
fn real_zarf_proof_claims_through_real_ultrahonk_verifier() {
    let env = Env::default();
    env.cost_estimate().budget().reset_unlimited();
    env.mock_all_auths();
    env.ledger().with_mut(|ledger| {
        ledger.protocol_version = 26;
        ledger.timestamp = 1_700_000_000;
    });

    let vk = Bytes::from_slice(&env, include_bytes!("fixtures/zarf-stellar-recipient/vk"));
    let vk_hash = bytesn_from_hex(
        &env,
        include_str!("fixtures/zarf-stellar-recipient/vk_hash.hex"),
    );
    let proof = Bytes::from_slice(
        &env,
        include_bytes!("fixtures/zarf-stellar-recipient/proof"),
    );
    let public_inputs = Bytes::from_slice(
        &env,
        include_bytes!("fixtures/zarf-stellar-recipient/public_inputs"),
    );

    let owner = Address::generate(&env);
    let recipient = Address::from_str(&env, ALICE);
    ensure_account_exists(&env, &recipient);
    let token_asset = env.register_stellar_asset_contract_v2(owner.clone());
    let token_id = token_asset.address();
    let token_admin = token::StellarAssetClient::new(&env, &token_id);
    let token = token::TokenClient::new(&env, &token_id);

    let verifier_id = env.register(UltraHonkVerifierContract, (vk, vk_hash));
    let registry_id = env.register(JwkRegistryContract, (owner.clone(), 0_u64));
    let registry = JwkRegistryContractClient::new(&env, &registry_id);

    registry.register_key(
        &String::from_str(&env, "test-key-id"),
        &pubkey_limbs(&env, &public_inputs),
    );

    let merkle_root = field_at(&env, &public_inputs, ROOT_INDEX);
    let audience_hash = field_at(&env, &public_inputs, AUDIENCE_HASH_INDEX);
    let epoch_commitment = field_at(&env, &public_inputs, EPOCH_COMMITMENT_INDEX);
    let amount = field_to_i128(&field_at(&env, &public_inputs, AMOUNT_INDEX));

    let vesting_id = env.register(
        ZarfVestingContract,
        (
            owner,
            token_id,
            verifier_id,
            registry_id,
            String::from_str(&env, "Zarf"),
            String::from_str(&env, "Real Zarf proof fixture"),
            merkle_root,
            audience_hash,
            String::from_str(&env, "ipfs://real-zarf-proof-fixture"),
        ),
    );
    let vesting = ZarfVestingContractClient::new(&env, &vesting_id);

    assert_eq!(
        vesting.recipient_id(&recipient).to_array(),
        field_at(&env, &public_inputs, 21).to_array()
    );

    token_admin.trust(&recipient);
    token_admin.mint(&vesting_id, &amount);
    let before = token.balance(&recipient);

    vesting.claim(&proof, &public_inputs, &recipient);

    assert_eq!(token.balance(&recipient), before + amount);
    assert!(vesting.is_claimed(&epoch_commitment));
}
