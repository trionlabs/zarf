/**
 * Input Validator
 * 
 * Validates the schema of the uploaded claim-data.json file.
 * Ensures all cryptographic fields are present and correctly formatted.
 */

export interface ClaimData {
    email: string;
    emailHash: string;  // Pedersen hash of email - needed for contract queries (getClaimable)
    salt: string;
    amount: string;
    merkleProof: {
        siblings: string[];
        indices: string[];
    };
    merkleRoot: string;
    recipient: string;
}

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const HEX_REGEX = /^0x[a-fA-F0-9]+$/;

/**
 * Validate the uploaded claim data JSON.
 * @param json - Parsed JSON object
 */
export function validateClaimData(json: any): { success: boolean; data?: ClaimData; error?: string } {
    if (!json || typeof json !== 'object') {
        return { success: false, error: 'Invalid JSON object' };
    }

    // 1. Email
    if (!json.email || typeof json.email !== 'string' || !EMAIL_REGEX.test(json.email)) {
        return { success: false, error: `Invalid or missing email: ${json.email}` };
    }

    // 2. Salt (Critical security parameter)
    if (!json.salt || typeof json.salt !== 'string' || !HEX_REGEX.test(json.salt)) {
        return { success: false, error: 'Invalid salt. Must be a 0x-prefixed hex string.' };
    }

    // 3. EmailHash (Pedersen hash of email - for contract queries)
    if (!json.emailHash || typeof json.emailHash !== 'string' || !HEX_REGEX.test(json.emailHash)) {
        return { success: false, error: 'Invalid emailHash. Must be a 0x-prefixed hex string.' };
    }

    // 4. Amount
    if (!json.amount || typeof json.amount !== 'string' || (!HEX_REGEX.test(json.amount) && isNaN(Number(json.amount)))) {
        return { success: false, error: 'Invalid amount. Must be a hex string or number string.' };
    }

    // 5. Recipient
    if (!json.recipient || typeof json.recipient !== 'string' || !/^0x[a-fA-F0-9]{40}$/.test(json.recipient)) {
        return { success: false, error: 'Invalid recipient address. Must be a 42-char ox-string.' };
    }

    // 6. Merkle Root
    if (!json.merkleRoot || typeof json.merkleRoot !== 'string' || !HEX_REGEX.test(json.merkleRoot)) {
        return { success: false, error: 'Invalid merkleRoot. Must be a 0x-prefixed hex string.' };
    }

    // 7. Merkle Proof Structure
    if (!json.merkleProof || typeof json.merkleProof !== 'object') {
        return { success: false, error: 'Missing merkleProof object.' };
    }
    if (!Array.isArray(json.merkleProof.siblings) || !Array.isArray(json.merkleProof.indices)) {
        return { success: false, error: 'Invalid merkleProof. Must contain "siblings" and "indices" arrays.' };
    }
    if (json.merkleProof.siblings.length !== json.merkleProof.indices.length) {
        return { success: false, error: 'Mismatch in merkleProof siblings/indices length.' };
    }

    return { success: true, data: json as ClaimData };
}
