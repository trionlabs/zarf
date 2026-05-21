/**
 * Pure helpers for ZK circuit input construction.
 *
 * Split out of `proof.worker.ts` so they can be unit-tested without a
 * Web Worker / WASM environment. The worker imports from here; the
 * behavior (including byte layout) is exactly what was inlined before.
 */

import { TREE_DEPTH, MAX_EMAIL_LENGTH, MAX_SIGNED_DATA_LENGTH } from '../constants';
export { TREE_DEPTH, MAX_EMAIL_LENGTH, MAX_SIGNED_DATA_LENGTH };

/**
 * Result of `noir-jwt`'s `generateInputs`. Treated as an opaque
 * carrier here — we only forward the named fields into the circuit.
 */
export interface NoirJwtResult {
    base64_decode_offset: number;
    redc_params_limbs: string[];
    signature_limbs: string[];
    pubkey_modulus_limbs: string[];
    data: {
        storage: number[];
        len: number;
    };
}

export interface ClaimData {
    email: string;
    /** 8-char Secret Code (e.g. "Xk9mP2qL") packed as a field element hex */
    salt: string;
    /** Hex string '0x...' */
    amount: string;
    merkleProof: {
        siblings: string[];
        indices: string[];
    };
    /** Hex string '0x...' */
    merkleRoot: string;
    /** Hex string '0x...' */
    recipient: string;
    /** Hex string '0x...' (ADR-023) */
    unlockTime: string;
}

/**
 * Convert a value to a hex string for circuit input.
 * - Strings already prefixed with `0x` pass through unchanged.
 * - Strings without prefix and numeric values are coerced via BigInt.
 */
export function toHex(value: string | number | bigint): string {
    if (typeof value === 'string' && value.startsWith('0x')) {
        return value;
    }
    return '0x' + BigInt(value).toString(16);
}

/**
 * Convert ASCII string to a hex string of its UTF-8 bytes.
 * e.g. "ABC" -> "0x414243"
 */
export function toHexFromBytes(str: string): string {
    const encoder = new TextEncoder();
    const bytes = encoder.encode(str);
    return (
        '0x' +
        Array.from(bytes)
            .map((b) => b.toString(16).padStart(2, '0'))
            .join('')
    );
}

/**
 * Pad a merkle proof's siblings/indices arrays out to TREE_DEPTH with `0x0`
 * entries, then normalize every entry through `toHex`.
 */
export function padMerkleProof(siblings: string[], indices: string[], depth: number = TREE_DEPTH) {
    if (siblings.length !== indices.length) {
        throw new Error(
            `padMerkleProof: siblings/indices length mismatch (${siblings.length}/${indices.length})`,
        );
    }
    if (siblings.length > depth || indices.length > depth) {
        throw new Error(
            `padMerkleProof: proof length ${siblings.length}/${indices.length} exceeds depth ${depth}`,
        );
    }

    const paddedSiblings = [...siblings];
    const paddedIndices = [...indices];

    while (paddedSiblings.length < depth) {
        paddedSiblings.push('0x0');
        paddedIndices.push('0x0');
    }

    return {
        siblings: paddedSiblings.map((s) => toHex(s)),
        indices: paddedIndices.map((i) => toHex(i)),
    };
}

/**
 * Pad an email string to a fixed byte array (default MAX_EMAIL_LENGTH bytes),
 * zero-filled. Returns the padded byte array AND the original length, matching
 * what the circuit expects as `expected_email`.
 */
export function padEmail(email: string, length: number = MAX_EMAIL_LENGTH) {
    const emailBytes = Array.from(new TextEncoder().encode(email));
    const byteLength = emailBytes.length;
    if (byteLength > length) {
        throw new Error(`Email exceeds MAX_EMAIL_LENGTH (${length} bytes)`);
    }
    while (emailBytes.length < length) {
        emailBytes.push(0);
    }
    return { storage: emailBytes, len: byteLength };
}

/**
 * Construct the input object passed into `Noir.execute(...)`.
 *
 * This is pure: identical inputs MUST produce identical outputs. Any drift
 * here changes the witness and therefore the proof, so it's the highest-
 * value place to lock down with characterization tests.
 */
export function buildCircuitInputs(claimData: ClaimData, jwtInputs: NoirJwtResult) {
    const { email, salt, amount, merkleProof, merkleRoot, recipient, unlockTime } = claimData;
    const { siblings, indices } = padMerkleProof(merkleProof.siblings, merkleProof.indices);
    const expected_email = padEmail(email);

    return {
        // JWT data
        data: {
            storage: jwtInputs.data.storage,
            len: jwtInputs.data.len,
        },
        base64_decode_offset: jwtInputs.base64_decode_offset,
        redc_params_limbs: jwtInputs.redc_params_limbs,
        signature_limbs: jwtInputs.signature_limbs,
        expected_email,
        // Merkle proof data
        // Hash Chain secret is ALREADY a field element hex string.
        secret: salt,
        amount: toHex(amount),
        merkle_siblings: siblings,
        merkle_path_indices: indices,
        // Public inputs (must match the Soroban claim layout)
        pubkey_modulus_limbs: jwtInputs.pubkey_modulus_limbs,
        merkle_root: toHex(merkleRoot),
        unlock_time: toHex(unlockTime), // ADR-023
        recipient: recipient || '0x0',
    };
}
