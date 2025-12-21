import initACVM from '@noir-lang/acvm_js';
import initAbi from '@noir-lang/noirc_abi';
import { Noir } from '@noir-lang/noir_js';
import { UltraHonkBackend } from '@aztec/bb.js';
import { generateInputs } from 'noir-jwt';

let initialized = false;
let cachedCircuit = null;
let cachedNoir = null;
let cachedBackend = null;

/**
 * Initialize WASM modules for Noir
 */
async function initializeWasm() {
  if (initialized) return;

  await Promise.all([
    initACVM(new URL('/wasm/acvm_js_bg.wasm', window.location.origin)),
    initAbi(new URL('/wasm/noirc_abi_wasm_bg.wasm', window.location.origin)),
  ]);

  initialized = true;
  console.log('WASM modules initialized');
}

/**
 * Load the compiled circuit
 */
async function loadCircuit() {
  if (cachedCircuit) return cachedCircuit;

  const response = await fetch('/circuits/zarf.json');
  cachedCircuit = await response.json();
  console.log('Circuit loaded');
  return cachedCircuit;
}

/**
 * Initialize Noir and the proving backend
 */
async function initializeBackend(circuit) {
  if (cachedNoir && cachedBackend) {
    return { noir: cachedNoir, backend: cachedBackend };
  }

  cachedNoir = new Noir(circuit);
  // bb.js 2.x API: pass bytecode string directly
  cachedBackend = new UltraHonkBackend(circuit.bytecode);

  console.log('Backend initialized');
  return { noir: cachedNoir, backend: cachedBackend };
}

/**
 * Check if the browser supports proof generation
 */
export function isProofGenerationSupported() {
  return typeof WebAssembly !== 'undefined' && typeof BigInt !== 'undefined';
}

/**
 * Generate a ZK proof for a JWT
 * @param {string} jwt - The JWT string
 * @param {object} publicKey - The JWK public key
 * @param {string} expectedEmail - The email to prove
 * @param {function} onProgress - Progress callback
 * @returns {Promise<{ proof: string, publicInputs: string[] }>}
 */
export async function generateJwtProof(jwt, publicKey, expectedEmail, onProgress = () => {}) {
  try {
    onProgress('Initializing WASM modules...');
    await initializeWasm();

    onProgress('Loading circuit...');
    const circuit = await loadCircuit();

    onProgress('Initializing proving backend...');
    const { noir, backend } = await initializeBackend(circuit);

    onProgress('Generating circuit inputs from JWT...');
    const jwtInputs = await generateInputs({
      jwt,
      pubkey: publicKey,
      maxSignedDataLength: 1024,
    });

    // Convert email to bytes array
    const emailBytes = Array.from(new TextEncoder().encode(expectedEmail));
    // Pad to MAX_EMAIL_LENGTH (64)
    while (emailBytes.length < 64) {
      emailBytes.push(0);
    }

    // Prepare full circuit inputs
    const inputs = {
      data: {
        storage: jwtInputs.data.storage,
        len: jwtInputs.data.len,
      },
      base64_decode_offset: jwtInputs.base64_decode_offset,
      pubkey_modulus_limbs: jwtInputs.pubkey_modulus_limbs,
      redc_params_limbs: jwtInputs.redc_params_limbs,
      signature_limbs: jwtInputs.signature_limbs,
      expected_email: {
        storage: emailBytes,
        len: expectedEmail.length,
      },
    };

    onProgress('Generating witness...');
    const { witness } = await noir.execute(inputs);

    onProgress('Generating proof (this may take 30-60 seconds)...');
    // keccak: true for EVM-compatible proof verification
    const proof = await backend.generateProof(witness, { keccak: true });

    // Convert proof to hex string
    const proofHex =
      '0x' +
      Array.from(proof.proof)
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('');

    onProgress('Proof generated successfully!');

    // Public outputs structure:
    // 1. pubkey_modulus_limbs[0..17] (18 limbs), public input
    // 2. email_hash (1 Field), return value (Pedersen hash of email)
    const emailHash = proof.publicInputs[proof.publicInputs.length - 1];

    return {
      proof: proofHex,
      publicInputs: proof.publicInputs,
      emailHash,
    };
  } catch (error) {
    console.error('Proof generation failed:', error);
    throw error;
  }
}

/**
 * Cleanup resources
 */
export async function cleanup() {
  if (cachedBackend) {
    await cachedBackend.destroy();
    cachedBackend = null;
  }
  cachedNoir = null;
  cachedCircuit = null;
}
