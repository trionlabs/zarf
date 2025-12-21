#!/usr/bin/env node
/**
 * Generate a test proof with a self-signed JWT for integration testing.
 *
 * This script:
 * 1. Generates an RSA keypair
 * 2. Creates a JWT signed with the private key
 * 3. Builds a Merkle tree with test data (using Pedersen hash)
 * 4. Generates a ZK proof
 * 5. Outputs proof + public inputs for Foundry tests
 */

import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { generateInputs } = require('noir-jwt');
import { Noir } from '@noir-lang/noir_js';
import { UltraHonkBackend, Barretenberg, Fr } from '@aztec/bb.js';
import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { webcrypto } from 'crypto';

const __dirname = dirname(fileURLToPath(import.meta.url));
const TREE_DEPTH = 20;

// Use webcrypto for Node.js
const crypto = webcrypto;

// Barretenberg instance for Pedersen hashing
let bb = null;

async function initBarretenberg() {
  if (!bb) {
    bb = await Barretenberg.new();
  }
  return bb;
}

/**
 * Pedersen hash of bytes (each byte as a Field)
 */
async function pedersenHashBytes(bytes) {
  const bar = await initBarretenberg();
  const fields = Array.from(bytes).map((b) => new Fr(BigInt(b)));
  const hash = await bar.pedersenHash(fields, 0);
  return BigInt(hash.toString());
}

/**
 * Pedersen hash of two Field elements
 */
async function pedersenHashPair(left, right) {
  const bar = await initBarretenberg();
  const hash = await bar.pedersenHash([new Fr(left), new Fr(right)], 0);
  return BigInt(hash.toString());
}

/**
 * Pedersen hash of multiple Field elements
 */
async function pedersenHashFields(fields) {
  const bar = await initBarretenberg();
  const frFields = fields.map((f) => new Fr(f));
  const hash = await bar.pedersenHash(frFields, 0);
  return BigInt(hash.toString());
}

/**
 * String to padded bytes (64 bytes for email)
 */
function stringToBytes(str, maxLength = 64) {
  const bytes = new TextEncoder().encode(str);
  const padded = new Uint8Array(maxLength);
  padded.set(bytes.slice(0, maxLength));
  return padded;
}

/**
 * Compute leaf: pedersen(email_hash, amount, salt)
 */
async function computeLeaf(email, amount, salt) {
  const emailBytes = stringToBytes(email.toLowerCase().trim(), 64);
  const emailHash = await pedersenHashBytes(emailBytes);
  const leaf = await pedersenHashFields([emailHash, BigInt(amount), BigInt(salt)]);
  return { leaf, emailHash };
}

/**
 * Precompute empty subtree hashes
 */
async function getEmptyHashes() {
  const hashes = [0n];
  for (let i = 0; i < TREE_DEPTH; i++) {
    hashes.push(await pedersenHashPair(hashes[i], hashes[i]));
  }
  return hashes;
}

/**
 * Build Merkle tree with single leaf
 */
async function buildMerkleTree(leaves) {
  const emptyHashes = await getEmptyHashes();
  const minDepth = Math.max(1, Math.ceil(Math.log2(leaves.length)));
  const minSize = Math.pow(2, minDepth);

  const paddedLeaves = [...leaves];
  while (paddedLeaves.length < minSize) {
    paddedLeaves.push(0n);
  }

  // Build minimal tree
  const layers = [paddedLeaves];
  let currentLayer = paddedLeaves;

  for (let level = 0; level < minDepth; level++) {
    const nextLayer = [];
    for (let i = 0; i < currentLayer.length; i += 2) {
      const parent = await pedersenHashPair(currentLayer[i], currentLayer[i + 1]);
      nextLayer.push(parent);
    }
    layers.push(nextLayer);
    currentLayer = nextLayer;
  }

  // Hash up to TREE_DEPTH
  let root = currentLayer[0];
  for (let level = minDepth; level < TREE_DEPTH; level++) {
    root = await pedersenHashPair(root, emptyHashes[level]);
  }

  return { root, layers, minDepth, emptyHashes };
}

/**
 * Get Merkle proof
 */
function getMerkleProof(tree, leafIndex) {
  const { layers, minDepth, emptyHashes } = tree;
  const siblings = [];
  const indices = [];
  let index = leafIndex;

  for (let i = 0; i < minDepth; i++) {
    const isRight = index % 2 === 1;
    const siblingIndex = isRight ? index - 1 : index + 1;
    siblings.push(layers[i][siblingIndex] ?? 0n);
    indices.push(isRight ? 1n : 0n);
    index = Math.floor(index / 2);
  }

  for (let i = minDepth; i < TREE_DEPTH; i++) {
    siblings.push(emptyHashes[i]);
    indices.push(0n);
  }

  return { siblings, indices };
}

/**
 * Generate RSA keypair
 */
async function generateRSAKeypair() {
  return await crypto.subtle.generateKey(
    {
      name: 'RSASSA-PKCS1-v1_5',
      modulusLength: 2048,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: 'SHA-256',
    },
    true,
    ['sign', 'verify']
  );
}

/**
 * Export key to JWK
 */
async function exportKeyToJWK(key) {
  return await crypto.subtle.exportKey('jwk', key);
}

/**
 * Base64URL encode
 */
function base64UrlEncode(data) {
  const base64 = Buffer.from(data).toString('base64');
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/**
 * Create JWT with custom claims
 */
async function createJWT(privateKey, claims) {
  const header = { alg: 'RS256', typ: 'JWT', kid: 'test-key-id' };
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    iss: 'https://accounts.google.com',
    aud: 'test-client-id',
    sub: '1234567890',
    iat: now,
    exp: now + 3600,
    ...claims,
  };

  const headerB64 = base64UrlEncode(JSON.stringify(header));
  const payloadB64 = base64UrlEncode(JSON.stringify(payload));
  const signedData = `${headerB64}.${payloadB64}`;

  const signature = await crypto.subtle.sign(
    { name: 'RSASSA-PKCS1-v1_5' },
    privateKey,
    new TextEncoder().encode(signedData)
  );

  return `${signedData}.${base64UrlEncode(new Uint8Array(signature))}`;
}

/**
 * Convert to hex string
 */
function toHex(value) {
  if (typeof value === 'string' && value.startsWith('0x')) return value;
  return '0x' + BigInt(value).toString(16);
}


/**
 * Main
 */
async function main() {
  console.log('=== Test Proof Generation ===\n');

  // Test data
  const testEmail = 'alice@example.com';
  const testAmount = 1000n;
  const testSalt = Fr.random().toString(); // Random salt within field
  const testRecipient = '0x000000000000000000000000000000000000A11CE';

  console.log('1. Generating RSA keypair...');
  const { privateKey, publicKey } = await generateRSAKeypair();
  const publicKeyJWK = await exportKeyToJWK(publicKey);

  console.log('2. Creating test JWT...');
  const jwt = await createJWT(privateKey, { email: testEmail });
  console.log(`   Email: ${testEmail}`);

  console.log('3. Generating JWT circuit inputs...');
  const jwtInputs = await generateInputs({
    jwt,
    pubkey: publicKeyJWK,
    maxSignedDataLength: 1024,
  });

  console.log('4. Building Merkle tree with Pedersen hash...');
  const { leaf, emailHash } = await computeLeaf(testEmail, testAmount, testSalt);
  const tree = await buildMerkleTree([leaf]);
  const merkleProof = getMerkleProof(tree, 0);
  console.log(`   Leaf: ${leaf.toString(16).slice(0, 16)}...`);
  console.log(`   Root: ${tree.root.toString(16).slice(0, 16)}...`);

  console.log('5. Loading circuit...');
  const circuitPath = resolve(__dirname, '../public/circuits/zarf.json');
  const circuit = JSON.parse(readFileSync(circuitPath, 'utf-8'));

  console.log('7. Preparing circuit inputs...');
  const emailBytes = Array.from(stringToBytes(testEmail, 64));

  const inputs = {
    data: {
      storage: jwtInputs.data.storage,
      len: jwtInputs.data.len,
    },
    base64_decode_offset: jwtInputs.base64_decode_offset,
    redc_params_limbs: jwtInputs.redc_params_limbs,
    signature_limbs: jwtInputs.signature_limbs,
    expected_email: {
      storage: emailBytes,
      len: testEmail.length,
    },
    salt: toHex(testSalt),
    amount: toHex(testAmount),
    merkle_siblings: merkleProof.siblings.map((s) => toHex(s)),
    merkle_path_indices: merkleProof.indices.map((i) => toHex(i)),
    pubkey_modulus_limbs: jwtInputs.pubkey_modulus_limbs,
    merkle_root: toHex(tree.root),
    recipient: testRecipient,
  };

  console.log('8. Generating witness...');
  const noir = new Noir(circuit);
  const { witness } = await noir.execute(inputs);

  console.log('9. Generating proof (this takes 30-60 seconds)...');
  const backend = new UltraHonkBackend(circuit.bytecode);
  const proof = await backend.generateProof(witness, { keccak: true });
  console.log('   Proof generated!');

  // Format output
  const proofHex =
    '0x' +
    Array.from(proof.proof)
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');

  const publicInputsHex = proof.publicInputs.map((pi) => {
    const hex = BigInt(pi).toString(16).padStart(64, '0');
    return '0x' + hex;
  });

  // Recipient as proper address
  const recipientAddress = '0x' + BigInt(testRecipient).toString(16).padStart(40, '0');

  const output = {
    proof: proofHex,
    publicInputs: publicInputsHex,
    publicInputsCount: publicInputsHex.length,
    testData: {
      email: testEmail,
      emailHash: toHex(emailHash),
      amount: testAmount.toString(),
      salt: testSalt.toString(),
      recipient: recipientAddress,
      merkleRoot: toHex(tree.root),
    },
  };

  // Ensure fixture directory exists
  const fixtureDir = resolve(__dirname, '../../contracts/test/fixtures');
  mkdirSync(fixtureDir, { recursive: true });

  // Write fixture
  const fixturePath = resolve(fixtureDir, 'testProof.json');
  writeFileSync(fixturePath, JSON.stringify(output, null, 2));
  console.log(`\n10. Fixture written to: ${fixturePath}`);

  console.log('\n=== Summary ===');
  console.log(`Proof length: ${proofHex.length} chars (${proof.proof.length} bytes)`);
  console.log(`Public inputs: ${publicInputsHex.length}`);
  console.log(`Email hash: ${output.testData.emailHash}`);
  console.log(`Merkle root: ${output.testData.merkleRoot}`);
  console.log(`Recipient: ${output.testData.recipient}`);

  await backend.destroy();
  console.log('\nDone!');
}

main().catch((err) => {
  console.error('Error:', err);
  process.exit(1);
});
