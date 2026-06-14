#!/usr/bin/env node
/**
 * Generate a Zarf proof in raw bb format for the yugocabrio Stellar verifier.
 * Outputs: proof, vk, public_inputs as raw bytes to /tmp/zarf-stellar-artifacts/
 *
 * Stellar-specific behavior:
 * - Uses current circuit signature (secret + unlock_time instead of salt)
 * - Computes leaf with new formula: pedersen(identity_commitment, amount, unlock_time)
 * - Saves raw bytes (not hex JSON) for Stellar verifier compatibility
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
import { keccak_256 } from '@noble/hashes/sha3.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const TREE_DEPTH = 20;
const MAX_AUDIENCE_LENGTH = 128;
const crypto = webcrypto;
const DEFAULT_OUT_DIR = '/tmp/zarf-stellar-artifacts';

let bb = null;
async function initBarretenberg() {
  if (!bb) bb = await Barretenberg.new();
  return bb;
}

async function pedersenHashBytes(bytes) {
  const bar = await initBarretenberg();
  const fields = Array.from(bytes).map((b) => new Fr(BigInt(b)));
  const hash = await bar.pedersenHash(fields, 0);
  return BigInt(hash.toString());
}
async function pedersenHashPair(left, right) {
  const bar = await initBarretenberg();
  const hash = await bar.pedersenHash([new Fr(left), new Fr(right)], 0);
  return BigInt(hash.toString());
}
async function pedersenHashFields(fields) {
  const bar = await initBarretenberg();
  const frs = fields.map((f) => new Fr(f));
  const hash = await bar.pedersenHash(frs, 0);
  return BigInt(hash.toString());
}
function stringToBytes(str, maxLength = 64) {
  const bytes = new TextEncoder().encode(str);
  const padded = new Uint8Array(maxLength);
  padded.set(bytes.slice(0, maxLength));
  return padded;
}

async function getEmptyHashes() {
  const hashes = [0n];
  for (let i = 0; i < TREE_DEPTH; i++) hashes.push(await pedersenHashPair(hashes[i], hashes[i]));
  return hashes;
}

async function buildMerkleTree(leaves) {
  const emptyHashes = await getEmptyHashes();
  const minDepth = Math.max(1, Math.ceil(Math.log2(leaves.length)));
  const minSize = 2 ** minDepth;
  const padded = [...leaves];
  while (padded.length < minSize) padded.push(0n);
  const layers = [padded];
  let cur = padded;
  for (let lvl = 0; lvl < minDepth; lvl++) {
    const next = [];
    for (let i = 0; i < cur.length; i += 2) next.push(await pedersenHashPair(cur[i], cur[i + 1]));
    layers.push(next);
    cur = next;
  }
  let root = cur[0];
  for (let lvl = minDepth; lvl < TREE_DEPTH; lvl++) root = await pedersenHashPair(root, emptyHashes[lvl]);
  return { root, layers, minDepth, emptyHashes };
}

function getMerkleProof(tree, leafIndex) {
  const { layers, minDepth, emptyHashes } = tree;
  const siblings = [];
  const indices = [];
  let idx = leafIndex;
  for (let i = 0; i < minDepth; i++) {
    const isRight = idx % 2 === 1;
    const sibIdx = isRight ? idx - 1 : idx + 1;
    siblings.push(layers[i][sibIdx] ?? 0n);
    indices.push(isRight ? 1n : 0n);
    idx = Math.floor(idx / 2);
  }
  for (let i = minDepth; i < TREE_DEPTH; i++) {
    siblings.push(emptyHashes[i]);
    indices.push(0n);
  }
  return { siblings, indices };
}

async function generateRSAKeypair() {
  return await crypto.subtle.generateKey(
    { name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' },
    true,
    ['sign', 'verify']
  );
}
async function exportKeyToJWK(key) {
  return await crypto.subtle.exportKey('jwk', key);
}
function base64UrlEncode(data) {
  return Buffer.from(data).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
async function createJWT(privateKey, claims) {
  const header = { alg: 'RS256', typ: 'JWT', kid: 'test-key-id' };
  const now = Math.floor(Date.now() / 1000);
  const payload = { iss: 'https://accounts.google.com', aud: 'test-client-id', sub: '1234567890', iat: now, exp: now + 3600, ...claims };
  const headerB64 = base64UrlEncode(JSON.stringify(header));
  const payloadB64 = base64UrlEncode(JSON.stringify(payload));
  const signedData = `${headerB64}.${payloadB64}`;
  const sig = await crypto.subtle.sign({ name: 'RSASSA-PKCS1-v1_5' }, privateKey, new TextEncoder().encode(signedData));
  return `${signedData}.${base64UrlEncode(new Uint8Array(sig))}`;
}
function toHex(v) {
  if (typeof v === 'string' && v.startsWith('0x')) return v;
  return '0x' + BigInt(v).toString(16);
}
function fieldHex(v) {
  const clean = toHex(v).slice(2).padStart(64, '0');
  return `0x${clean}`;
}
function bytesToHex(bytes) {
  return `0x${Array.from(bytes).map((b) => b.toString(16).padStart(2, '0')).join('')}`;
}
function keccak256(bytes) {
  return bytesToHex(keccak_256(bytes));
}
function proofSettings() {
  return {
    ipaAccumulation: false,
    oracleHashType: 'keccak',
    disableZk: true,
    optimizedSolidityVerifier: false,
  };
}
function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (!arg.startsWith('--')) continue;
    const key = arg.slice(2);
    const next = argv[i + 1];
    if (next && !next.startsWith('--')) {
      args[key] = next;
      i++;
    } else {
      args[key] = 'true';
    }
  }
  return args;
}

async function main() {
  console.log('=== Zarf → Stellar Verifier Artifact Generator ===\n');
  const args = parseArgs(process.argv.slice(2));
  const outDir = args['out-dir'] ?? args.outDir ?? DEFAULT_OUT_DIR;

  const testEmail = args.email ?? 'alice@example.com';
  const testAudience = args.audience ?? 'test-client-id';
  const testAmount = BigInt(args.amount ?? '1000');
  const testSecret = args.secret ? BigInt(args.secret) : BigInt(Fr.random().toString());
  const testUnlockTime = BigInt(args['unlock-time'] ?? args.unlockTime ?? '0');
  const testRecipient = fieldHex(args.recipient ?? '0x000000000000000000000000000000000000A11CE');

  mkdirSync(outDir, { recursive: true });

  console.log('1. RSA keypair...');
  const { privateKey, publicKey } = await generateRSAKeypair();
  const publicKeyJWK = await exportKeyToJWK(publicKey);

  console.log('2. JWT...');
  // The circuit binds the recipient via the OIDC nonce: nonce must be the
  // lowercase 64-hex encoding of the recipient field.
  const recipientNonce = testRecipient.slice(2).padStart(64, '0').toLowerCase();
  const jwt = await createJWT(privateKey, {
    email: testEmail,
    aud: testAudience,
    email_verified: true,
    nonce: args.nonce ?? recipientNonce,
  });

  console.log('3. JWT inputs (RSA limbs, signature, base64 offset)...');
  const jwtInputs = await generateInputs({ jwt, pubkey: publicKeyJWK, maxSignedDataLength: 1536 });

  console.log('4. Compute identity_commitment + leaf (new formula)...');
  const emailBytes = stringToBytes(testEmail.toLowerCase().trim(), 64);
  const emailHash = await pedersenHashBytes(emailBytes);
  const audienceBytes = stringToBytes(testAudience, MAX_AUDIENCE_LENGTH);
  const audienceHash = await pedersenHashBytes(audienceBytes);
  const secretHash = await pedersenHashFields([BigInt(testSecret)]);
  const identityCommitment = await pedersenHashFields([emailHash, secretHash]);
  const leaf = await pedersenHashFields([identityCommitment, testAmount, testUnlockTime]);

  console.log('5. Merkle tree...');
  const tree = await buildMerkleTree([leaf]);
  const merkleProof = getMerkleProof(tree, 0);

  console.log('6. Load circuit...');
  const circuitPath = resolve(__dirname, '../public/circuits/zarf.json');
  const circuit = JSON.parse(readFileSync(circuitPath, 'utf-8'));

  console.log('7. Build inputs (current signature: secret + unlock_time)...');
  const emailBytesArr = Array.from(emailBytes);
  const inputs = {
    data: { storage: jwtInputs.data.storage, len: jwtInputs.data.len },
    base64_decode_offset: jwtInputs.base64_decode_offset,
    redc_params_limbs: jwtInputs.redc_params_limbs,
    signature_limbs: jwtInputs.signature_limbs,
    expected_email: { storage: emailBytesArr, len: testEmail.length },
    expected_audience: { storage: Array.from(audienceBytes), len: testAudience.length },
    amount: fieldHex(testAmount),
    merkle_siblings: merkleProof.siblings.map((s) => toHex(s)),
    merkle_path_indices: merkleProof.indices.map((i) => toHex(i)),
    recipient: testRecipient,
    secret: fieldHex(testSecret),
    pubkey_modulus_limbs: jwtInputs.pubkey_modulus_limbs,
    merkle_root: fieldHex(tree.root),
    unlock_time: fieldHex(testUnlockTime),
  };

  console.log('8. Witness via noir.execute()...');
  const noir = new Noir(circuit);
  const { witness } = await noir.execute(inputs);
  console.log(`   witness size (gz): ${witness.length} bytes`);

  console.log('9. Generate proof (keccak honk)... [30-60s]');
  const backend = new UltraHonkBackend(circuit.bytecode);
  const proofData = await backend.generateProof(witness, { keccak: true });
  console.log(`   proof: ${proofData.proof.length} bytes (${proofData.proof.length / 32} fields)`);
  console.log(`   public inputs: ${proofData.publicInputs.length}`);

  console.log('   verify proof with bb.js...');
  const verified = await backend.verifyProof(proofData, { keccak: true });
  if (!verified) {
    throw new Error('generated proof failed bb.js verification');
  }

  console.log('10. Get VK...');
  const vkResult = await backend.api.circuitComputeVk({
    circuit: {
      name: 'circuit',
      bytecode: Buffer.from(backend.acirUncompressedBytecode),
    },
    settings: proofSettings(),
  });
  const vk = vkResult.bytes;
  const vkHashHex = bytesToHex(vkResult.hash);
  console.log(`    vk: ${vk.length} bytes`);
  console.log(`    vk_hash: ${vkHashHex}`);
  if (args['solidity-out']) {
    const verifierSolidity = await backend.getSolidityVerifier(vk);
    writeFileSync(args['solidity-out'], verifierSolidity);
    console.log(`    solidity verifier: ${args['solidity-out']}`);
  }

  // Write raw bytes
  writeFileSync(`${outDir}/proof`, proofData.proof);
  writeFileSync(`${outDir}/vk`, vk);
  writeFileSync(`${outDir}/vk_hash`, vkResult.hash);
  writeFileSync(`${outDir}/vk_hash.hex`, `${vkHashHex}\n`);
  // public_inputs: concat each Fr as 32 bytes BE
  const piBytes = new Uint8Array(proofData.publicInputs.length * 32);
  proofData.publicInputs.forEach((piHex, i) => {
    const clean = piHex.startsWith('0x') ? piHex.slice(2) : piHex;
    const padded = clean.padStart(64, '0');
    for (let j = 0; j < 32; j++) {
      piBytes[i * 32 + j] = parseInt(padded.substr(j * 2, 2), 16);
    }
  });
  writeFileSync(`${outDir}/public_inputs`, piBytes);

  const publicInputsHex = proofData.publicInputs.map(fieldHex);
  if (fieldHex(audienceHash) !== publicInputsHex[23]) {
    throw new Error('audience hash public input mismatch');
  }
  const metadata = {
    email: testEmail,
    amount: testAmount.toString(),
    unlock_time: testUnlockTime.toString(),
    recipient: testRecipient,
    merkle_root: publicInputsHex[18],
    epoch_commitment: publicInputsHex[20],
    proof_recipient: publicInputsHex[21],
    proof_amount: publicInputsHex[22],
    audience_hash: publicInputsHex[23],
    jwt_exp: publicInputsHex[24],
    vk_hash: vkHashHex,
    key_hash: keccak256(piBytes.slice(0, 18 * 32)),
    proof_hex: bytesToHex(proofData.proof),
    public_inputs_hex: bytesToHex(piBytes),
    public_inputs: publicInputsHex,
  };
  writeFileSync(`${outDir}/metadata.json`, `${JSON.stringify(metadata, null, 2)}\n`);

  console.log('\n=== Artifacts saved ===');
  console.log(`Output dir: ${outDir}`);
  console.log(`  proof: ${proofData.proof.length} bytes`);
  console.log(`  vk: ${vk.length} bytes`);
  console.log(`  public_inputs: ${piBytes.length} bytes (${proofData.publicInputs.length} fields)`);
  console.log(`  merkle_root: ${metadata.merkle_root}`);
  console.log(`  key_hash: ${metadata.key_hash}`);
  console.log(`  audience_hash: ${metadata.audience_hash}`);
  console.log(`  recipient: ${metadata.proof_recipient}`);

  // Compare to yugocabrio expected
  console.log(`\nYugocabrio simple_circuit expects: PROOF_BYTES = 14592 (456 fields × 32)`);
  console.log(`Zarf circuit produced: ${proofData.proof.length} bytes (${proofData.proof.length / 32} fields)`);

  await backend.destroy();
  if (bb) await bb.destroy();
}

main().catch((e) => { console.error(e); process.exit(1); });
