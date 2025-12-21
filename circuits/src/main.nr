use jwt::JWT;
use std::hash::pedersen_hash;

// Max length of the signed JWT data (header.payload in base64)
global MAX_DATA_LENGTH: u32 = 1024;
// Max email length (e.g., "alice@example.com")
global MAX_EMAIL_LENGTH: u32 = 64;

fn main(
    // Private inputs
    data: BoundedVec<u8, MAX_DATA_LENGTH>,
    base64_decode_offset: u32,
    redc_params_limbs: [u128; 18],
    signature_limbs: [u128; 18],
    expected_email: BoundedVec<u8, MAX_EMAIL_LENGTH>,
    // Public inputs
    pubkey_modulus_limbs: pub [u128; 18],
) -> pub Field {
    // Initialize and verify the JWT
    let jwt: JWT<MAX_DATA_LENGTH> = JWT::init(
        data,
        base64_decode_offset,
        pubkey_modulus_limbs,
        redc_params_limbs,
        signature_limbs,
    );

    // Verify the RSA signature
    jwt.verify();

    // Verify the email claim in JWT matches private expected_email
    jwt.assert_claim_string("email".as_bytes(), expected_email);

    // Return Pedersen hash of email as public commitment
    // Convert bytes to Fields for Pedersen (1 byte = 1 Field)
    let storage = expected_email.storage();
    let mut fields: [Field; MAX_EMAIL_LENGTH] = [0; MAX_EMAIL_LENGTH];
    for i in 0..MAX_EMAIL_LENGTH {
        fields[i] = storage[i] as Field;
    }
    pedersen_hash(fields)
}

#[test]
fn test_main() {
    // Test will be run with actual JWT data
    // See web-poc for generating test inputs
}
