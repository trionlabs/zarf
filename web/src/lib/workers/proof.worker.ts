/// <reference lib="webworker" />

// Dynamic imports - loaded at runtime to avoid WASM access errors at module load
// These will be populated in initialize()
let Noir: any;
let UltraHonkBackend: any;
let generateInputs: any;
let initACVM: any;
let initAbi: any;

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
            unlockTime: string; // Hex string '0x...' (ADR-023)
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
let cachedNoir: any = null;
let cachedBackend: any = null;

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

        const [acvmWasm, abiWasm] = await Promise.all([
            fetch(`${baseUrl}/wasm/acvm_js_bg.wasm`),
            fetch(`${baseUrl}/wasm/noirc_abi_wasm_bg.wasm`),
        ]);

        await Promise.all([
            initACVM(acvmWasm),
            initAbi(abiWasm),
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
        postMessage({ type: 'PROGRESS', message: 'Initializing Prover Backend (may take 10-20s)...' });
        console.log('[Worker] Creating UltraHonkBackend...');
        cachedBackend = new UltraHonkBackend(cachedCircuit.bytecode, { threads: 1 });
        console.log('[Worker] Backend initialized successfully');

        initialized = true;
        postMessage({ type: 'PROGRESS', message: 'Initialization complete!' });
        console.log('[Worker] Fully initialized');
    } catch (error: any) {
        console.error('[Worker] Initialization failed:', error);
        postMessage({ type: 'ERROR', message: `Initialization failed: ${error.message || String(error)}` });
        throw error;
    }
}

/**
 * Main Proof Generation Logic
 * Ported verbatim from poc/src/lib/jwtProver.js to ensure compatibility.
 */
async function generateProof(payload: ProofRequest['payload']) {
    if (!cachedNoir || !cachedBackend) throw new Error('Not initialized');

    const { jwt, publicKey, claimData } = payload;
    const { email, salt, amount, merkleProof, merkleRoot, recipient, unlockTime } = claimData;

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
        unlock_time: toHex(unlockTime), // ADR-023
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
            amount: BigInt(amount)
        },
        // Convenience duplicates
        identityCommitment,
        merkleRoot: toHex(merkleRoot),
        recipient: proofRecipient,
        amount: BigInt(amount)
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
