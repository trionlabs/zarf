/// <reference lib="webworker" />

import initACVM from '@noir-lang/acvm_js';
import initAbi from '@noir-lang/noirc_abi';
import { Noir } from '@noir-lang/noir_js';
import { UltraHonkBackend } from '@aztec/bb.js';
import { generateInputs } from 'noir-jwt';

// ============ Constants ============
const TREE_DEPTH = 20;

// ============ Types ============
export type ProofRequest = {
    type: 'GENERATE_PROOF';
    payload: {
        jwt: string;
        publicKey: any; // JWK
        claimData: {
            email: string;
            salt: string; // Now holds the 8-char Secret Code (e.g. "Xk9mP2qL")
            amount: string; // Hex string '0x...'
            merkleProof: {
                siblings: string[];
                indices: string[];
            };
            merkleRoot: string; // Hex string '0x...'
            recipient: string; // Hex string '0x...'
        };
    };
};

interface NoirJwtResult {
    base64_decode_offset: number;
    redc_params_limbs: string[];
    signature_limbs: string[];
    pubkey_modulus_limbs: string[];
    data: {
        storage: number[];
        len: number;
    };
}

// ============ State ============
let initialized = false;
let cachedCircuit: any = null;
let cachedNoir: Noir | null = null;
let cachedBackend: UltraHonkBackend | null = null;

// ============ Helpers ============

/**
 * Convert a value to a hex string for circuit input
 */
function toHex(value: string | number | bigint): string {
    if (typeof value === 'string' && value.startsWith('0x')) {
        return value;
    }
    return '0x' + BigInt(value).toString(16);
}

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
 * Pad merkle proof arrays to TREE_DEPTH
 */
function padMerkleProof(siblings: string[], indices: string[]) {
    const paddedSiblings = [...siblings];
    const paddedIndices = [...indices];

    while (paddedSiblings.length < TREE_DEPTH) {
        paddedSiblings.push('0x0');
        paddedIndices.push('0x0');
    }

    return {
        siblings: paddedSiblings.map((s) => toHex(s)),
        indices: paddedIndices.map((i) => toHex(i)),
    };
}

/**
 * Fetch circuit with retry logic
 */
async function fetchCircuit(url: string, retries = 3): Promise<any> {
    for (let i = 0; i < retries; i++) {
        try {
            const response = await fetch(url);
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            return await response.json();
        } catch (e) {
            if (i === retries - 1) throw e;
            await new Promise((r) => setTimeout(r, 1000 * (i + 1)));
        }
    }
}

// ============ Logic ============

async function initialize() {
    if (initialized) return;

    const baseUrl = self.location.origin;

    // 1. Init WASM
    await Promise.all([
        initACVM(new URL('/wasm/acvm_js_bg.wasm', baseUrl)),
        initAbi(new URL('/wasm/noirc_abi_wasm_bg.wasm', baseUrl)),
    ]);

    // 2. Load Circuit with Retry
    cachedCircuit = await fetchCircuit('/circuits/zarf.json');

    // 3. Init Prover
    cachedNoir = new Noir(cachedCircuit);
    cachedBackend = new UltraHonkBackend(cachedCircuit.bytecode);

    initialized = true;
    console.log('[Worker] Initialized Noir + Backend');
}

/**
 * Main Proof Generation Logic
 * Ported verbatim from poc/src/lib/jwtProver.js to ensure compatibility.
 */
async function generateProof(payload: ProofRequest['payload']) {
    if (!cachedNoir || !cachedBackend) throw new Error('Not initialized');

    const { jwt, publicKey, claimData } = payload;
    const { email, salt, amount, merkleProof, merkleRoot, recipient } = claimData;

    postMessage({ type: 'PROGRESS', message: 'Generating Inputs from JWT...' });

    // 1. Generate JWT specific inputs (limbs, etc)
    const jwtInputs = (await generateInputs({
        jwt,
        pubkey: publicKey,
        maxSignedDataLength: 1024,
    })) as unknown as NoirJwtResult;

    // 2. Pad Email to 64 bytes
    const emailBytes = Array.from(new TextEncoder().encode(email));
    while (emailBytes.length < 64) {
        emailBytes.push(0);
    }

    // 3. Pad Merkle Proof
    const { siblings, indices } = padMerkleProof(merkleProof.siblings, merkleProof.indices);

    // 4. Construct Final Circuit Inputs
    const inputs = {
        // JWT data
        data: {
            storage: jwtInputs.data.storage,
            len: jwtInputs.data.len,
        },
        base64_decode_offset: jwtInputs.base64_decode_offset,
        redc_params_limbs: jwtInputs.redc_params_limbs,
        signature_limbs: jwtInputs.signature_limbs,
        expected_email: {
            storage: emailBytes,
            len: email.length,
        },
        // Merkle proof data
        // NEW (ADR-012): Pass the 8-char code as 'secret' (converted to hex bytes)
        // Circuit expects field, so we pack the ASCII bytes into a field.
        secret: toHexFromBytes(salt),
        amount: toHex(amount),
        merkle_siblings: siblings,
        merkle_path_indices: indices,
        // Public inputs (must match solidity layout)
        pubkey_modulus_limbs: jwtInputs.pubkey_modulus_limbs,
        merkle_root: toHex(merkleRoot),
        recipient: recipient || '0x0',
    };

    postMessage({ type: 'PROGRESS', message: 'Generating Witness...' });
    const { witness } = await cachedNoir.execute(inputs);

    postMessage({ type: 'PROGRESS', message: 'Proving (might take 30-60s)...' });

    const proof = await cachedBackend.generateProof(witness, { keccak: true });

    // 5. Format Output
    const proofHex = '0x' + Array.from(proof.proof)
        .map((b: any) => b.toString(16).padStart(2, '0'))
        .join('');

    // Extract critical public inputs to return for verification/logging
    // Extract critical public inputs to return for verification/logging
    // [19] = identity_commitment (formerly email_hash)
    // [20] = recipient
    const identityCommitment = proof.publicInputs[19];
    const proofRecipient = proof.publicInputs[20];

    return {
        proof: proofHex,
        publicInputs: proof.publicInputs,
        identityCommitment, // Renamed from emailHash
        merkleRoot: toHex(merkleRoot),
        recipient: proofRecipient
    };
}

// ============ Message Handler ============

self.onmessage = async (e) => {
    const { type, payload } = e.data;

    try {
        if (type === 'GENERATE_PROOF') {
            if (!initialized) {
                postMessage({ type: 'PROGRESS', message: 'Initializing Workers...' });
                await initialize();
            }

            const result = await generateProof(payload);
            postMessage({ type: 'RESULT', data: result });
        }

        if (type === 'CLEANUP') {
            if (cachedBackend) await cachedBackend.destroy();
            initialized = false;
            postMessage({ type: 'CLEANUP_DONE' });
        }
    } catch (error: any) {
        console.error('[Worker Error]', error);
        postMessage({ type: 'ERROR', message: error.message || String(error) });
    }
};
