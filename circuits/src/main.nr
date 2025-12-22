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

/// Compute leaf hash: pedersen(email_hash, amount, salt)
fn compute_leaf(email_hash: Field, amount: Field, salt: Field) -> Field {
    pedersen_hash([email_hash, amount, salt])
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

fn main(
    // Private inputs - JWT data
    data: BoundedVec<u8, MAX_DATA_LENGTH>,
    base64_decode_offset: u32,
    redc_params_limbs: [u128; 18],
    signature_limbs: [u128; 18],
    expected_email: BoundedVec<u8, MAX_EMAIL_LENGTH>,
    // Private inputs - Merkle proof
    salt: Field,
    amount: Field,
    merkle_siblings: [Field; TREE_DEPTH],
    merkle_path_indices: [Field; TREE_DEPTH],
    // Private input - recipient (returned as public output)
    recipient: Field,
    // Public inputs
    pubkey_modulus_limbs: pub [u128; 18],
    merkle_root: pub Field,
) -> pub (Field, Field) {
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

    // 3. Compute email hash (public commitment)
    let email_hash = hash_email(expected_email);

    // 4. Compute leaf from email_hash, amount, salt
    let leaf = compute_leaf(email_hash, amount, salt);

    // 5. Verify Merkle proof - computed root must match public merkle_root
    let computed_root = verify_merkle_proof(leaf, merkle_siblings, merkle_path_indices);
    assert(computed_root == merkle_root, "Merkle proof verification failed");

    // 6. Return email hash and recipient as public outputs
    // Both values are cryptographically bound to the proof
    // Contract verifies msg.sender == recipient to prevent front-running
    (email_hash, recipient)
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
