import initACVM from '@noir-lang/acvm_js';
import initAbi from '@noir-lang/noirc_abi';
import { Noir } from '@noir-lang/noir_js';
import { UltraHonkBackend } from '@aztec/bb.js';
import { generateInputs } from 'noir-jwt';

// Circuit constants
const TREE_DEPTH = 20;

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
 * Convert a bigint to a hex string for circuit input
 */
function toHex(value) {
  if (typeof value === 'string' && value.startsWith('0x')) {
    return value;
  }
  return '0x' + BigInt(value).toString(16);
}

/**
 * Pad merkle proof arrays to TREE_DEPTH
 */
function padMerkleProof(siblings, indices) {
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
 * Generate a ZK proof for a JWT with Merkle tree membership
 * @param {string} jwt - The JWT string
 * @param {object} publicKey - The JWK public key
 * @param {object} claimData - { email, salt, amount, merkleProof: { siblings, indices }, merkleRoot, recipient }
 * @param {function} onProgress - Progress callback
 * @returns {Promise<{ proof: string, publicInputs: string[], emailHash: string, merkleRoot: string, recipient: string }>}
 */
export async function generateJwtProof(jwt, publicKey, claimData, onProgress = () => {}) {
  try {
    const { email, salt, amount, merkleProof, merkleRoot, recipient } = claimData;

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

    // Convert email to bytes array (padded to 64)
    const emailBytes = Array.from(new TextEncoder().encode(email));
    while (emailBytes.length < 64) {
      emailBytes.push(0);
    }

    // Pad Merkle proof to TREE_DEPTH
    const { siblings, indices } = padMerkleProof(merkleProof.siblings, merkleProof.indices);

    // Prepare full circuit inputs
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
      salt: toHex(salt),
      amount: toHex(amount),
      merkle_siblings: siblings,
      merkle_path_indices: indices,
      // Public inputs
      pubkey_modulus_limbs: jwtInputs.pubkey_modulus_limbs,
      merkle_root: toHex(merkleRoot),
      recipient: recipient || '0x0', // Ethereum address as Field
    };

    onProgress('Generating witness...');
    const { witness } = await noir.execute(inputs);

    onProgress('Generating proof (this may take 30-60 seconds)...');
    const proof = await backend.generateProof(witness, { keccak: true });

    // Convert proof to hex string
    const proofHex =
      '0x' +
      Array.from(proof.proof)
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('');

    onProgress('Proof generated successfully!');

    // Public outputs structure (matches contract layout):
    // [0..17]: pubkey_modulus_limbs (18 limbs)
    // [18]: merkle_root
    // [19]: email_hash (return value 1)
    // [20]: recipient (return value 2)
    const emailHash = proof.publicInputs[19];
    const proofRecipient = proof.publicInputs[20];

    return {
      proof: proofHex,
      publicInputs: proof.publicInputs,
      emailHash,
      merkleRoot: toHex(merkleRoot),
      recipient: proofRecipient,
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
