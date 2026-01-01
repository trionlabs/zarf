/**
 * ZK Proof Generation for JWT Claims with Merkle Membership
 * 
 * This module handles the generation of Zero-Knowledge proofs using Noir circuits.
 * It proves that a user owns a JWT with an email in the whitelist without revealing
 * which email they own.
 * 
 * **PERFORMANCE WARNING:** 
 * Proof generation takes 30-60 seconds and should be moved to a Web Worker
 * in production to prevent UI blocking.
 * 
 * @module crypto/jwtProver
 */

import initACVM from '@noir-lang/acvm_js';
import initAbi from '@noir-lang/noirc_abi';
import { Noir } from '@noir-lang/noir_js';
import { UltraHonkBackend } from '@aztec/bb.js';
import { generateInputs } from 'noir-jwt';
import type { ZKProof, ZKClaimData, GooglePublicKey, MerkleProof } from '../types';
import type { Address } from 'viem';

// ============================================================================
// Constants
// ============================================================================

/**
 * Merkle tree depth (must match circuit)
 */
const TREE_DEPTH = 20;

/**
 * Maximum signed data length for JWT (must match circuit)
 */
const MAX_SIGNED_DATA_LENGTH = 1024;

/**
 * Maximum email length (must match circuit)
 */
const MAX_EMAIL_LENGTH = 64;

// ============================================================================
// WASM Initialization
// ============================================================================

let initialized = false;
let cachedCircuit: any = null;
let cachedNoir: Noir | null = null;
let cachedBackend: UltraHonkBackend | null = null;

/**
 * Initialize WASM modules for Noir (ACVM and ABI).
 * Must be called before any proof generation.
 * 
 * @throws {Error} If WASM files are not found or fail to load
 * 
 * @internal
 */
async function initializeWasm(): Promise<void> {
    if (initialized) return;

    try {
        await Promise.all([
            initACVM(new URL('/wasm/acvm_js_bg.wasm', window.location.origin)),
            initAbi(new URL('/wasm/noirc_abi_wasm_bg.wasm', window.location.origin)),
        ]);

        initialized = true;
        console.log('[JWTProver] WASM modules initialized');
    } catch (error) {
        throw new Error(
            `Failed to initialize WASM modules: ${error instanceof Error ? error.message : 'unknown error'}`
        );
    }
}

/**
 * Load the compiled Noir circuit.
 * Circuit JSON must be in /static/circuits/zarf.json
 * 
 * @returns Parsed circuit JSON
 * 
 * @throws {Error} If circuit file is not found or invalid
 * 
 * @internal
 */
async function loadCircuit(): Promise<any> {
    if (cachedCircuit) return cachedCircuit;

    try {
        const response = await fetch('/circuits/zarf.json');

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        cachedCircuit = await response.json();
        console.log('[JWTProver] Circuit loaded');
        return cachedCircuit;
    } catch (error) {
        throw new Error(
            `Failed to load circuit: ${error instanceof Error ? error.message : 'unknown error'}. Ensure /static/circuits/zarf.json exists.`
        );
    }
}

/**
 * Initialize Noir and UltraHonk proving backend.
 * 
 * @param circuit - Compiled circuit JSON
 * @returns Noir instance and backend
 * 
 * @throws {Error} If initialization fails
 * 
 * @internal
 */
async function initializeBackend(circuit: any): Promise<{
    noir: Noir;
    backend: UltraHonkBackend;
}> {
    if (cachedNoir && cachedBackend) {
        return { noir: cachedNoir, backend: cachedBackend };
    }

    try {
        cachedNoir = new Noir(circuit);
        cachedBackend = new UltraHonkBackend(circuit.bytecode);

        console.log('[JWTProver] Backend initialized');
        return { noir: cachedNoir, backend: cachedBackend };
    } catch (error) {
        throw new Error(
            `Failed to initialize backend: ${error instanceof Error ? error.message : 'unknown error'}`
        );
    }
}

// ============================================================================
// Feature Detection
// ============================================================================

/**
 * Check if the browser supports ZK proof generation.
 * Requires WebAssembly and BigInt support.
 * 
 * @returns True if supported, false otherwise
 * 
 * @example
 * ```typescript
 * if (!isProofGenerationSupported()) {
 *   alert('Your browser does not support ZK proofs');
 *   return;
 * }
 * ```
 */
export function isProofGenerationSupported(): boolean {
    return typeof WebAssembly !== 'undefined' && typeof BigInt !== 'undefined';
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Convert ASCII string to Hex string of its bytes
 * e.g. "ABC" -> "0x414243"
 */
function toHexFromBytes(str: string): string {
    const encoder = new TextEncoder();
    const bytes = encoder.encode(str);
    return '0x' + Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Convert value to hex string.
 * 
 * @param value - Value to convert (string, number, or bigint)
 * @returns Hex string with 0x prefix
 * 
 * @internal
 */
function toHex(value: string | number | bigint): string {
    if (typeof value === 'string' && value.startsWith('0x')) {
        return value;
    }
    return '0x' + BigInt(value).toString(16);
}

/**
 * Pad Merkle proof arrays to TREE_DEPTH.
 * Circuit expects fixed-size arrays.
 * 
 * @param siblings - Sibling hashes
 * @param indices - Path indices
 * @returns Padded arrays as hex strings
 * 
 * @internal
 */
function padMerkleProof(
    siblings: string[],
    indices: number[]
): {
    siblings: string[];
    indices: string[];
} {
    const paddedSiblings = [...siblings];
    const paddedIndices = [...indices];

    while (paddedSiblings.length < TREE_DEPTH) {
        paddedSiblings.push('0x0');
        paddedIndices.push(0);
    }

    return {
        siblings: paddedSiblings.map((s) => toHex(s)),
        indices: paddedIndices.map((i) => toHex(i)),
    };
}

/**
 * Convert email string to padded byte array.
 * 
 * @param email - Email string
 * @returns Byte array padded to MAX_EMAIL_LENGTH
 * 
 * @internal
 */
function emailToBytes(email: string): number[] {
    const bytes = Array.from(new TextEncoder().encode(email));

    while (bytes.length < MAX_EMAIL_LENGTH) {
        bytes.push(0);
    }

    return bytes.slice(0, MAX_EMAIL_LENGTH);
}

// ============================================================================
// Proof Generation
// ============================================================================

/**
 * Progress callback function type
 */
export type ProgressCallback = (message: string) => void;

/**
 * Generate a Zero-Knowledge proof for JWT claim with Merkle membership.
 * 
 * **Proof Components:**
 * 1. JWT signature verification (RSA)
 * 2. Email extraction and hashing
 * 3. Merkle tree membership proof
 * 4. Recipient binding (prevents front-running)
 * 
 * **Performance:**
 * - Witness generation: ~2-5 seconds
 * - Proof generation: ~30-60 seconds
 * - **IMPORTANT:** Move to Web Worker in production!
 * 
 * @param jwt - JWT id_token from Google OAuth
 * @param publicKey - Google's public key (JWK)
 * @param claimData - Claim data including Merkle proof
 * @param onProgress - Optional callback for progress updates
 * @returns ZK proof with public inputs
 * 
 * @throws {Error} If proof generation fails at any stage
 * 
 * @example
 * ```typescript
 * const proof = await generateJwtProof(
 *   jwt,
 *   publicKey,
 *   {
 *     email: 'alice@example.com',
 *     salt: '0x123...',
 *     amount: 1000,
 *     merkleProof: { siblings: [...], indices: [...] },
 *     merkleRoot: 0x456...,
 *     recipient: '0x789...'
 *   },
 *   (msg) => console.log(msg)
 * );
 * 
 * // Submit proof to contract
 * await submitClaim(proof.proof, proof.publicInputs, proof.recipient);
 * ```
 */
export async function generateJwtProof(
    jwt: string,
    publicKey: GooglePublicKey,
    claimData: ZKClaimData,
    onProgress: ProgressCallback = () => { }
): Promise<ZKProof> {
    try {
        const { email, salt, amount, merkleProof, merkleRoot, recipient } = claimData;

        // Stage 1: Initialize WASM
        onProgress('Initializing WASM modules...');
        await initializeWasm();

        // Stage 2: Load circuit
        onProgress('Loading circuit...');
        const circuit = await loadCircuit();

        // Stage 3: Initialize backend
        onProgress('Initializing proving backend...');
        const { noir, backend } = await initializeBackend(circuit);

        // Stage 4: Generate JWT inputs
        onProgress('Generating circuit inputs from JWT...');
        const jwtInputs = await generateInputs({
            jwt,
            pubkey: publicKey,
            maxSignedDataLength: MAX_SIGNED_DATA_LENGTH,
        });

        // Stage 5: Prepare circuit inputs
        onProgress('Preparing circuit inputs...');

        const emailBytes = emailToBytes(email);
        const { siblings, indices } = padMerkleProof(merkleProof.siblings, merkleProof.indices);

        const inputs = {
            // JWT verification data
            data: {
                storage: jwtInputs.data?.storage || [],
                len: jwtInputs.data?.len || 0,
            },
            base64_decode_offset: jwtInputs.base64_decode_offset,
            redc_params_limbs: jwtInputs.redc_params_limbs,
            signature_limbs: jwtInputs.signature_limbs,

            // Email to prove ownership of
            expected_email: {
                storage: emailBytes,
                len: email.length,
            },

            // Merkle proof data
            secret: toHexFromBytes(salt), // New (ADR-012)
            amount: toHex(amount),
            merkle_siblings: siblings,
            merkle_path_indices: indices,

            // Public inputs
            pubkey_modulus_limbs: jwtInputs.pubkey_modulus_limbs,
            merkle_root: toHex(merkleRoot),
            recipient: recipient || '0x0', // Ethereum address as Field
        };

        // Stage 6: Generate witness
        onProgress('Generating witness...');
        const { witness } = await noir.execute(inputs);

        // Stage 7: Generate proof (LONG operation)
        onProgress('Generating proof (this may take 30-60 seconds)...');
        const proof = await backend.generateProof(witness, { keccak: true });

        // Stage 8: Convert proof to hex
        const proofHex =
            '0x' +
            Array.from(proof.proof)
                .map((byte: number) => byte.toString(16).padStart(2, '0'))
                .join('');

        onProgress('Proof generated successfully!');

        // Public outputs structure (matches Solidity contract):
        // [0..17]: pubkey_modulus_limbs (18 limbs)
        // [18]: merkle_root
        // [19]: email_hash (return value 1)
        // [20]: recipient (return value 2)
        const emailHash = proof.publicInputs[19];
        const proofRecipient = proof.publicInputs[20];

        return {
            proof: proofHex,
            publicValues: proof.publicInputs, // Raw array for contract
            publicInputs: {
                identityCommitment: emailHash,
                merkleRoot: toHex(merkleRoot),
                recipient: proofRecipient as Address,
                amount,
            },
            // Convenience duplicates
            identityCommitment: emailHash,
            merkleRoot: toHex(merkleRoot),
            recipient: proofRecipient as Address,
            amount,
        };
    } catch (error) {
        console.error('[JWTProver] Proof generation failed:', error);

        // Re-throw with more context
        if (error instanceof Error) {
            throw new Error(`Proof generation failed: ${error.message}`);
        }
        throw new Error('Proof generation failed: unknown error');
    }
}

// ============================================================================
// Resource Management
// ============================================================================

/**
 * Cleanup WASM resources.
 * Call this when unmounting components that use proofs.
 * 
 * @example
 * ```typescript
 * import { onDestroy } from 'svelte';
 * 
 * onDestroy(async () => {
 *   await cleanup();
 * });
 * ```
 */
export async function cleanup(): Promise<void> {
    if (cachedBackend) {
        await cachedBackend.destroy();
        cachedBackend = null;
    }
    cachedNoir = null;
    cachedCircuit = null;
    console.log('[JWTProver] Resources cleaned up');
}
