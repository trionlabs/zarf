use jwt::JWT;

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
    // Public inputs
    pubkey_modulus_limbs: pub [u128; 18],
    expected_email: pub BoundedVec<u8, MAX_EMAIL_LENGTH>,
) {
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

    // Verify the email claim matches expected
    jwt.assert_claim_string("email".as_bytes(), expected_email);
}

#[test]
fn test_main() {
    // Test will be run with actual JWT data
    // See web-poc for generating test inputs
}
