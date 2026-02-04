use jwt::JWT;
use std::hash::pedersen_hash;

// Max length of the signed JWT data (header.payload in base64)
global MAX_DATA_LENGTH: u32 = 1024;
// Max email length (e.g., "alice@example.com")
global MAX_EMAIL_LENGTH: u32 = 64;
// Merkle tree depth (supports 2^20 = 1M users)
global TREE_DEPTH: u32 = 20;

/// Compute Pedersen hash of email bytes (1 byte = 1 Field)
fn hash_email(email: BoundedVec<u8, MAX_EMAIL_LENGTH>) -> Field {
    let storage = email.storage();
    let mut fields: [Field; MAX_EMAIL_LENGTH] = [0; MAX_EMAIL_LENGTH];
    for i in 0..MAX_EMAIL_LENGTH {
        fields[i] = storage[i] as Field;
    }
    pedersen_hash(fields)
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
) -> pub (Field, Field, Field) {
    // 1. Initialize and verify the JWT
    let jwt: JWT<MAX_DATA_LENGTH> = JWT::init(
        data,
        base64_decode_offset,
        pubkey_modulus_limbs,
        redc_params_limbs,
        signature_limbs,
    );
    jwt.verify();

    // 2. Verify the email claim in JWT matches private expected_email
    jwt.assert_claim_string("email".as_bytes(), expected_email);

    // 3. Compute email hash (intermediate value, NOT exposed publicly)
    let email_hash = hash_email(expected_email);

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

    // 8. Return identity_commitment, recipient AND amount as public outputs
    // identity_commitment replaces email_hash (ADR-012 privacy upgrade)
    // Contract verifies msg.sender == recipient to prevent front-running
    // Contract needs amount to transfer tokens
    (identity_commitment, recipient, amount)
}

#[test]
fn test_hash_email() {
    // Test with a simple email
    let mut email: BoundedVec<u8, MAX_EMAIL_LENGTH> = BoundedVec::new();
    let test_bytes = "test@example.com".as_bytes();
    for b in test_bytes {
        email.push(b);
    }
    let hash = hash_email(email);
    // Just check it doesn't panic
    assert(hash != 0);
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
    
    let email_hash = hash_email(email);
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
    
    let email_hash = hash_email(email);
    
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
