/// <reference lib="webworker" />

// Polyfill Buffer for @aztec/bb.js which expects it globally in browser
import { Buffer } from 'buffer';
(globalThis as any).Buffer = Buffer;

import {
    buildCircuitInputs,
    toHex,
    MAX_SIGNED_DATA_LENGTH,
    type ClaimData,
    type NoirJwtResult,
} from './proofInputs';

// Dynamic imports - loaded at runtime to avoid WASM access errors at module load
// These will be populated in initialize()
let Noir: any;
let UltraHonkBackend: any;
let generateInputs: any;
let initACVM: any;
let initAbi: any;

// ============ Types ============
export type ProofRequest = {
    type: 'GENERATE_PROOF';
    payload: {
        jwt: string;
        publicKey: any; // JWK
        claimData: ClaimData;
    };
};

// ============ State ============
let initialized = false;
let cachedCircuit: any = null;
let cachedNoir: any = null;
let cachedBackend: any = null;

// ============ Helpers ============

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

    try {
        console.log('[Worker] Starting initialization...');

        // 1. Dynamic import of modules (deferred to avoid WASM access at module load)
        postMessage({ type: 'PROGRESS', message: 'Loading modules...' });
        console.log('[Worker] Dynamically importing modules...');

        const [acvmModule, abiModule, noirModule, bbModule, jwtModule] = await Promise.all([
            import('@noir-lang/acvm_js'),
            import('@noir-lang/noirc_abi'),
            import('@noir-lang/noir_js'),
            import('@aztec/bb.js'),
            import('noir-jwt'),
        ]);

        initACVM = acvmModule.default;
        initAbi = abiModule.default;
        Noir = noirModule.Noir;
        UltraHonkBackend = bbModule.UltraHonkBackend;
        generateInputs = jwtModule.generateInputs;

        console.log('[Worker] Modules imported successfully');

        // 2. Init WASM modules using fetch()
        postMessage({ type: 'PROGRESS', message: 'Loading WASM modules...' });
        console.log('[Worker] Loading WASM from:', baseUrl);

        // Use the new object-based API (not deprecated)
        await Promise.all([
            initACVM({ module_or_path: `${baseUrl}/wasm/acvm_js_bg.wasm` }),
            initAbi({ module_or_path: `${baseUrl}/wasm/noirc_abi_wasm_bg.wasm` }),
        ]);
        console.log('[Worker] ACVM/ABI WASM loaded successfully');

        // 3. Load Circuit with Retry
        postMessage({ type: 'PROGRESS', message: 'Loading ZK Circuit (1.4MB)...' });
        cachedCircuit = await fetchCircuit(`${baseUrl}/circuits/zarf.json`);
        console.log('[Worker] Circuit loaded successfully');

        // 4. Init Noir instance
        postMessage({ type: 'PROGRESS', message: 'Initializing Noir...' });
        cachedNoir = new Noir(cachedCircuit);
        console.log('[Worker] Noir initialized');

        // 5. Init UltraHonkBackend - single thread for worker context
        postMessage({
            type: 'PROGRESS',
            message: 'Initializing Prover Backend (may take 10-20s)...',
        });
        console.log('[Worker] Creating UltraHonkBackend...');
        cachedBackend = new UltraHonkBackend(cachedCircuit.bytecode, { threads: 1 });
        console.log('[Worker] Backend initialized successfully');

        initialized = true;
        postMessage({ type: 'PROGRESS', message: 'Initialization complete!' });
        console.log('[Worker] Fully initialized');
    } catch (error: any) {
        console.error('[Worker] Initialization failed:', error);
        postMessage({
            type: 'ERROR',
            message: `Initialization failed: ${error.message || String(error)}`,
        });
        throw error;
    }
}

/**
 * Main Proof Generation Logic
 * Kept byte-for-byte compatible with the browser proof input contract.
 */
async function generateProof(payload: ProofRequest['payload']) {
    if (!cachedNoir || !cachedBackend) throw new Error('Not initialized');

    const { jwt, publicKey, claimData } = payload;
    const { amount, merkleRoot } = claimData;

    postMessage({ type: 'PROGRESS', message: 'Generating Inputs from JWT...' });

    const jwtInputs = (await generateInputs({
        jwt,
        pubkey: publicKey,
        maxSignedDataLength: MAX_SIGNED_DATA_LENGTH,
    })) as unknown as NoirJwtResult;

    const inputs = buildCircuitInputs(claimData, jwtInputs);

    postMessage({ type: 'PROGRESS', message: 'Generating Witness...' });
    const { witness } = await cachedNoir.execute(inputs);

    postMessage({ type: 'PROGRESS', message: 'Proving (might take 30-60s)...' });

    const proof = await cachedBackend.generateProof(witness, { keccak: true });

    // 5. Format Output
    const proofHex =
        '0x' +
        Array.from(proof.proof)
            .map((b: any) => b.toString(16).padStart(2, '0'))
            .join('');

    // Extract critical public inputs to return for verification/logging
    // [19] = unlock_time (Input)
    // [20] = identity_commitment (Output)
    // [21] = recipient (Output)
    // [22] = amount (Output)
    const identityCommitment = proof.publicInputs[20];
    const proofRecipient = proof.publicInputs[21];

    // Note: Amount is also an output now (index 22), but we have it in inputs too.
    // Using input amount for consistency is safer unless we want to verify circuit output.

    return {
        proof: proofHex,
        publicValues: proof.publicInputs, // Raw array required by contract
        publicInputs: {
            identityCommitment,
            merkleRoot: toHex(merkleRoot),
            recipient: proofRecipient,
            amount: BigInt(amount),
        },
        // Convenience duplicates
        identityCommitment,
        merkleRoot: toHex(merkleRoot),
        recipient: proofRecipient,
        amount: BigInt(amount),
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
