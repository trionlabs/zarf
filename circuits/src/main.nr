use jwt::JWT;
use std::hash::pedersen_hash;

// Max length of the signed JWT data (header.payload in base64).
// Sized for a real Google id_token that also carries the 64-char `nonce`
// claim this circuit binds; 1024 was tight for production tokens.
global MAX_DATA_LENGTH: u32 = 1536;
// Max email length (e.g., "alice@example.com")
global MAX_EMAIL_LENGTH: u32 = 64;
// Max Google OAuth client ID length.
global MAX_AUDIENCE_LENGTH: u32 = 128;
// Max accepted issuer length: "https://accounts.google.com"
global MAX_ISSUER_LENGTH: u32 = 27;
// OIDC nonce: lowercase 64-hex encoding of the recipient field.
global NONCE_LENGTH: u32 = 64;
// Merkle tree depth (supports 2^20 = 1M users)
global TREE_DEPTH: u32 = 20;

/// Compute Pedersen hash of bounded bytes (1 byte = 1 Field)
fn hash_bounded_bytes<let MAX_LENGTH: u32>(value: BoundedVec<u8, MAX_LENGTH>) -> Field {
    let storage = value.storage();
    let mut fields: [Field; MAX_LENGTH] = [0; MAX_LENGTH];
    for i in 0..MAX_LENGTH {
        fields[i] = storage[i] as Field;
    }
    pedersen_hash(fields)
}

fn google_issuer_full() -> BoundedVec<u8, MAX_ISSUER_LENGTH> {
    let mut issuer: BoundedVec<u8, MAX_ISSUER_LENGTH> = BoundedVec::new();
    for byte in "https://accounts.google.com".as_bytes() {
        issuer.push(byte);
    }
    issuer
}

fn google_issuer_bare() -> BoundedVec<u8, MAX_ISSUER_LENGTH> {
    let mut issuer: BoundedVec<u8, MAX_ISSUER_LENGTH> = BoundedVec::new();
    for byte in "accounts.google.com".as_bytes() {
        issuer.push(byte);
    }
    issuer
}

fn assert_google_issuer(issuer: BoundedVec<u8, MAX_ISSUER_LENGTH>) {
    assert(
        (issuer == google_issuer_full()) | (issuer == google_issuer_bare()),
        "invalid issuer",
    );
}

fn assert_expected_audience(
    actual: BoundedVec<u8, MAX_AUDIENCE_LENGTH>,
    expected: BoundedVec<u8, MAX_AUDIENCE_LENGTH>,
) {
    assert(actual == expected, "invalid audience");
}

fn assert_verified_email(email_verified: bool) {
    assert(email_verified == true, "email not verified");
}

/// Decode one lowercase ASCII hex digit ('0'-'9', 'a'-'f') to its value.
/// Asserts the byte is a valid lowercase hex digit (rejects uppercase and
/// any non-hex byte) so the nonce encoding is canonical.
fn hex_digit_value(c: u8) -> Field {
    let is_digit = (c >= 48) & (c <= 57); // '0'..'9'
    let is_lower = (c >= 97) & (c <= 102); // 'a'..'f'
    assert(is_digit | is_lower, "nonce must be lowercase hex");
    if is_digit {
        (c - 48) as Field
    } else {
        (c - 97 + 10) as Field
    }
}

/// Bind the OIDC `nonce` claim to the recipient: the JWT (signed by Google)
/// must carry nonce == lowercase 64-hex of `recipient`. A stolen id_token
/// therefore only proves for the recipient the victim requested, closing the
/// token-theft claim-redirection path.
fn assert_nonce_binds_recipient(nonce: BoundedVec<u8, NONCE_LENGTH>, recipient: Field) {
    assert(nonce.len() == NONCE_LENGTH, "nonce must be 64 hex chars");
    let storage = nonce.storage();
    let mut acc: Field = 0;
    for i in 0..NONCE_LENGTH {
        acc = acc * 16 + hex_digit_value(storage[i]);
    }
    assert(acc == recipient, "nonce does not bind recipient");
}

/// Compute leaf hash: pedersen(identity_commitment, amount, unlock_time)
fn compute_leaf(identity_commitment: Field, amount: Field, unlock_time: Field) -> Field {
    pedersen_hash([identity_commitment, amount, unlock_time])
}

/// Verify Merkle proof and return computed root
fn verify_merkle_proof(
    leaf: Field,
    siblings: [Field; TREE_DEPTH],
    path_indices: [Field; TREE_DEPTH],
) -> Field {
    let mut current = leaf;
    for i in 0..TREE_DEPTH {
        let sibling = siblings[i];
        let is_right = path_indices[i];
        // If is_right == 1, current is on right, so hash(sibling, current)
        // If is_right == 0, current is on left, so hash(current, sibling)
        let left = if is_right == 1 { sibling } else { current };
        let right = if is_right == 1 { current } else { sibling };
        current = pedersen_hash([left, right]);
    }
    current
}

/// Compute secret hash from secret code field
/// The secret is already converted to Field by the prover (frontend)
/// Secret = Pedersen hash of 8-char alphanumeric code
fn hash_secret(secret: Field) -> Field {
    pedersen_hash([secret])
}

/// Compute IdentityCommitment = Pedersen(emailHash, secretHash)
/// This creates an unlinkable identity - same email with different secrets
/// produces completely different commitments
fn compute_identity_commitment(email_hash: Field, secret_hash: Field) -> Field {
    pedersen_hash([email_hash, secret_hash])
}

fn main(
    // Private inputs - JWT data
    data: BoundedVec<u8, MAX_DATA_LENGTH>,
    base64_decode_offset: u32,
    redc_params_limbs: [u128; 18],
    signature_limbs: [u128; 18],
    expected_email: BoundedVec<u8, MAX_EMAIL_LENGTH>,
    expected_audience: BoundedVec<u8, MAX_AUDIENCE_LENGTH>,
    // Private inputs - Merkle proof
    amount: Field,
    merkle_siblings: [Field; TREE_DEPTH],
    merkle_path_indices: [Field; TREE_DEPTH],
    // Private input - recipient (returned as public output)
    recipient: Field,
    // Private input - Secret code (ADR-012: for unlinkable identity)
    secret: Field,
    // Public inputs
    pubkey_modulus_limbs: pub [u128; 18],
    merkle_root: pub Field,
    // New Public Input for Discrete Vesting (ADR-023)
    unlock_time: pub Field,
) -> pub (Field, Field, Field, Field, Field) {
    // 1. Initialize and verify the JWT
    let jwt: JWT<MAX_DATA_LENGTH> = JWT::init(
        data,
        base64_decode_offset,
        pubkey_modulus_limbs,
        redc_params_limbs,
        signature_limbs,
    );
    jwt.verify();

    // 2. Verify JWT claims that bind the proof to Google, this app, and a verified email.
    let issuer: BoundedVec<u8, MAX_ISSUER_LENGTH> = jwt.get_claim_string("iss".as_bytes());
    assert_google_issuer(issuer);
    let audience: BoundedVec<u8, MAX_AUDIENCE_LENGTH> = jwt.get_claim_string("aud".as_bytes());
    assert_expected_audience(audience, expected_audience);
    let email_verified = jwt.get_claim_bool("email_verified".as_bytes());
    assert_verified_email(email_verified);
    jwt.assert_claim_string("email".as_bytes(), expected_email);
    let jwt_exp: u64 = jwt.get_claim_number("exp".as_bytes());

    // Bind the recipient into the Google-signed token via the OIDC nonce, so
    // a leaked id_token cannot be replayed to redirect the claim to an
    // attacker-chosen wallet (the recipient is otherwise a free private input).
    let nonce: BoundedVec<u8, NONCE_LENGTH> = jwt.get_claim_string("nonce".as_bytes());
    assert_nonce_binds_recipient(nonce, recipient);

    // 3. Compute email hash (intermediate value, NOT exposed publicly)
    let email_hash = hash_bounded_bytes(expected_email);
    let audience_hash = hash_bounded_bytes(expected_audience);

    // 4. Compute secret hash (ADR-012)
    let secret_hash = hash_secret(secret);

    // 5. Compute IdentityCommitment (ADR-012)
    // This replaces the raw email_hash as the public identity
    // Same email + different secret = different identity (unlinkability)
    let identity_commitment = compute_identity_commitment(email_hash, secret_hash);

    // 6. Compute leaf from identity_commitment, amount AND unlock_time (ADR-023)
    // Note: Leaf now uses identity_commitment instead of email_hash
    // REFACTOR: Added unlock_time to bind vesting schedule to the leaf
    let leaf = compute_leaf(identity_commitment, amount, unlock_time);

    // 7. Verify Merkle proof - computed root must match public merkle_root
    let computed_root = verify_merkle_proof(leaf, merkle_siblings, merkle_path_indices);
    assert(computed_root == merkle_root, "Merkle proof verification failed");

    // 8. Return identity_commitment, recipient, amount, audience_hash, and JWT exp as public outputs
    // identity_commitment replaces email_hash (ADR-012 privacy upgrade)
    // Contract verifies msg.sender == recipient to prevent front-running
    // Contract needs amount to transfer tokens and JWT claims to bind the proof
    (identity_commitment, recipient, amount, audience_hash, jwt_exp as Field)
}

#[test]
fn test_hash_email() {
    // Test with a simple email
    let mut email: BoundedVec<u8, MAX_EMAIL_LENGTH> = BoundedVec::new();
    let test_bytes = "test@example.com".as_bytes();
    for b in test_bytes {
        email.push(b);
    }
    let hash = hash_bounded_bytes(email);
    // Just check it doesn't panic
    assert(hash != 0);
}

#[test]
fn test_google_issuer_accepts_full_and_bare_forms() {
    assert_google_issuer(google_issuer_full());
    assert_google_issuer(google_issuer_bare());
}

#[test(should_fail_with = "invalid issuer")]
fn test_google_issuer_rejects_unknown_issuer() {
    let mut issuer: BoundedVec<u8, MAX_ISSUER_LENGTH> = BoundedVec::new();
    for byte in "https://evil.example.com".as_bytes() {
        issuer.push(byte);
    }
    assert_google_issuer(issuer);
}

#[test]
fn test_expected_audience_accepts_exact_match() {
    let mut actual: BoundedVec<u8, MAX_AUDIENCE_LENGTH> = BoundedVec::new();
    for byte in "test-client-id".as_bytes() {
        actual.push(byte);
    }
    let mut expected: BoundedVec<u8, MAX_AUDIENCE_LENGTH> = BoundedVec::new();
    for byte in "test-client-id".as_bytes() {
        expected.push(byte);
    }
    assert_expected_audience(actual, expected);
}

#[test(should_fail_with = "invalid audience")]
fn test_expected_audience_rejects_mismatch() {
    let mut actual: BoundedVec<u8, MAX_AUDIENCE_LENGTH> = BoundedVec::new();
    for byte in "wrong-client-id".as_bytes() {
        actual.push(byte);
    }
    let mut expected: BoundedVec<u8, MAX_AUDIENCE_LENGTH> = BoundedVec::new();
    for byte in "test-client-id".as_bytes() {
        expected.push(byte);
    }
    assert_expected_audience(actual, expected);
}

#[test(should_fail_with = "email not verified")]
fn test_email_verified_rejects_false() {
    assert_verified_email(false);
}

fn nonce_from_hex(hex: str<64>) -> BoundedVec<u8, NONCE_LENGTH> {
    let mut nonce: BoundedVec<u8, NONCE_LENGTH> = BoundedVec::new();
    for byte in hex.as_bytes() {
        nonce.push(byte);
    }
    nonce
}

#[test]
fn test_nonce_binds_matching_recipient() {
    // 0x...000a11ce encoded as 64 lowercase hex chars.
    let nonce = nonce_from_hex("00000000000000000000000000000000000000000000000000000000000a11ce");
    assert_nonce_binds_recipient(nonce, 0x0a11ce);
}

#[test(should_fail_with = "nonce does not bind recipient")]
fn test_nonce_rejects_wrong_recipient() {
    let nonce = nonce_from_hex("00000000000000000000000000000000000000000000000000000000000a11ce");
    assert_nonce_binds_recipient(nonce, 0x0a11cf);
}

#[test(should_fail_with = "nonce must be lowercase hex")]
fn test_nonce_rejects_uppercase_hex() {
    // Same value but uppercase 'E' -- must be rejected as non-canonical.
    let nonce = nonce_from_hex("00000000000000000000000000000000000000000000000000000000000A11CE");
    assert_nonce_binds_recipient(nonce, 0x0a11ce);
}

#[test]
fn test_hash_secret() {
    // Test that secret hashing works
    let secret: Field = 12345678; // Simulated secret code as Field
    let hash = hash_secret(secret);
    assert(hash != 0);
    assert(hash != secret); // Hash should differ from input
}

#[test]
fn test_identity_commitment() {
    // Test that identity commitment is computed correctly
    let mut email: BoundedVec<u8, MAX_EMAIL_LENGTH> = BoundedVec::new();
    let test_bytes = "alice@example.com".as_bytes();
    for b in test_bytes {
        email.push(b);
    }
    
    let email_hash = hash_bounded_bytes(email);
    let secret: Field = 98765432;
    let secret_hash = hash_secret(secret);
    
    let commitment = compute_identity_commitment(email_hash, secret_hash);
    assert(commitment != 0);
    assert(commitment != email_hash); // Commitment should differ from email_hash
}

#[test]
fn test_identity_unlinkability() {
    // CRITICAL TEST: Same email with different secrets = different commitments
    // This proves the unlinkability property of ADR-012
    let mut email: BoundedVec<u8, MAX_EMAIL_LENGTH> = BoundedVec::new();
    let test_bytes = "bob@example.com".as_bytes();
    for b in test_bytes {
        email.push(b);
    }
    
    let email_hash = hash_bounded_bytes(email);
    
    // Two different secrets
    let secret1: Field = 11111111;
    let secret2: Field = 22222222;
    
    let secret_hash1 = hash_secret(secret1);
    let secret_hash2 = hash_secret(secret2);
    
    let commitment1 = compute_identity_commitment(email_hash, secret_hash1);
    let commitment2 = compute_identity_commitment(email_hash, secret_hash2);
    
    // MUST be different - this is the core privacy property
    assert(commitment1 != commitment2, "Unlinkability failed: same email with different secrets must produce different commitments");
}
