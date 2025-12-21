/**
 * Merkle Tree utilities for whitelist verification
 * Uses Pedersen hash to match Noir circuit
 */

import { Barretenberg, Fr } from '@aztec/bb.js';

let barretenberg = null;
let initPromise = null;

/**
 * Initialize Barretenberg for Pedersen hashing
 * Uses a promise to prevent multiple concurrent initializations
 */
async function initBarretenberg() {
  if (barretenberg) return barretenberg;

  // Prevent concurrent initialization attempts
  if (initPromise) return initPromise;

  initPromise = (async () => {
    try {
      barretenberg = await Barretenberg.new();
      return barretenberg;
    } catch (e) {
      // Reset on failure so retry is possible
      initPromise = null;
      throw e;
    }
  })();

  return initPromise;
}

/**
 * Convert a string to a padded byte array (matching circuit's MAX_EMAIL_LENGTH = 64)
 */
export function stringToBytes(str, maxLength = 64) {
  const bytes = new TextEncoder().encode(str);
  const padded = new Uint8Array(maxLength);
  padded.set(bytes.slice(0, maxLength));
  return padded;
}

/**
 * Compute Pedersen hash of byte array (matching Noir's pedersen_hash)
 * Each byte becomes a Field element
 */
export async function pedersenHashBytes(bytes) {
  const bb = await initBarretenberg();
  // Convert bytes to Fr elements (each byte as a separate field)
  const fields = Array.from(bytes).map((b) => new Fr(BigInt(b)));
  // Use bb.js pedersenHash (returns Fr)
  const hash = await bb.pedersenHash(fields, 0);
  // Convert Fr to bigint
  return BigInt(hash.toString());
}

/**
 * Compute Pedersen hash of two Field elements (for Merkle tree nodes)
 */
export async function pedersenHashPair(left, right) {
  const bb = await initBarretenberg();
  const hash = await bb.pedersenHash([new Fr(left), new Fr(right)], 0);
  return BigInt(hash.toString());
}

/**
 * Compute leaf hash from email, amount, and salt
 * leaf = pedersen(email_hash, amount, salt)
 */
export async function computeLeaf(email, amount, salt) {
  const bb = await initBarretenberg();

  // First hash the email bytes
  const emailBytes = stringToBytes(email.toLowerCase().trim(), 64);
  const emailHash = await pedersenHashBytes(emailBytes);

  // Then hash (emailHash, amount, salt)
  const fields = [new Fr(emailHash), new Fr(BigInt(amount)), new Fr(BigInt(salt))];
  const leafHash = await bb.pedersenHash(fields, 0);
  return BigInt(leafHash.toString());
}

/**
 * Generate a random salt within BN254 field
 */
export function generateSalt() {
  // Fr.random() generates value reduced modulo field modulus
  const salt = Fr.random();
  return salt.toString();
}

// Must match circuit's TREE_DEPTH
const TREE_DEPTH = 20;

// Cache for empty subtree hashes at each level
let emptyHashes = null;

/**
 * Precompute empty subtree hashes for each level
 * emptyHashes[0] = 0 (empty leaf)
 * emptyHashes[1] = H(0, 0)
 * emptyHashes[2] = H(emptyHashes[1], emptyHashes[1])
 * etc.
 */
async function getEmptyHashes() {
  if (emptyHashes) return emptyHashes;

  try {
    const hashes = [0n];
    for (let i = 0; i < TREE_DEPTH; i++) {
      const prev = hashes[i];
      hashes.push(await pedersenHashPair(prev, prev));
    }
    emptyHashes = hashes;
    return emptyHashes;
  } catch (e) {
    // Don't cache partial results
    emptyHashes = null;
    throw e;
  }
}

/**
 * Build a sparse Merkle tree from leaves with fixed TREE_DEPTH
 * Only stores necessary nodes, uses precomputed empty subtree hashes
 */
export async function buildMerkleTree(leaves) {
  if (leaves.length === 0) {
    throw new Error('Cannot build tree with no leaves');
  }

  const empty = await getEmptyHashes();

  // Pad leaves to next power of 2 for the minimal tree
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
      const left = currentLayer[i];
      const right = currentLayer[i + 1];
      const parent = await pedersenHashPair(left, right);
      nextLayer.push(parent);
    }
    layers.push(nextLayer);
    currentLayer = nextLayer;
  }

  // Continue hashing with empty subtrees up to TREE_DEPTH
  let root = currentLayer[0];
  for (let level = minDepth; level < TREE_DEPTH; level++) {
    root = await pedersenHashPair(root, empty[level]);
  }

  return {
    root,
    layers,
    minDepth,
    depth: TREE_DEPTH,
    emptyHashes: empty,
  };
}

/**
 * Get Merkle proof for a leaf at given index
 * Returns { siblings, indices } matching circuit format
 */
export function getMerkleProof(tree, leafIndex) {
  const { layers, minDepth, emptyHashes } = tree;
  const siblings = [];
  const indices = [];

  let index = leafIndex;

  // Get siblings from actual tree layers
  for (let i = 0; i < minDepth; i++) {
    const layer = layers[i];
    const isRight = index % 2 === 1;
    const siblingIndex = isRight ? index - 1 : index + 1;

    siblings.push(layer[siblingIndex] ?? 0n);
    indices.push(isRight ? 1 : 0);

    index = Math.floor(index / 2);
  }

  // For levels beyond minDepth, sibling is empty subtree hash
  // and current node is always on the left (index 0)
  for (let i = minDepth; i < TREE_DEPTH; i++) {
    siblings.push(emptyHashes[i]);
    indices.push(0); // current is on left
  }

  return { siblings, indices };
}

/**
 * Verify a Merkle proof
 */
export async function verifyMerkleProof(leaf, proof, root) {
  const { siblings, indices } = proof;
  let current = leaf;

  for (let i = 0; i < siblings.length; i++) {
    const sibling = siblings[i];
    const isRight = indices[i] === 1;

    if (isRight) {
      current = await pedersenHashPair(sibling, current);
    } else {
      current = await pedersenHashPair(current, sibling);
    }
  }

  return current === root;
}

/**
 * Process a whitelist and build Merkle tree
 * Input: [{ email, amount }]
 * Output: { root, claims: [{ email, amount, salt, leafIndex, leaf }] }
 */
export async function processWhitelist(entries) {
  const claims = [];
  const leaves = [];

  for (let i = 0; i < entries.length; i++) {
    const { email, amount } = entries[i];
    const salt = generateSalt();
    const leaf = await computeLeaf(email, amount, salt);

    claims.push({
      email: email.toLowerCase().trim(),
      amount,
      salt,
      leafIndex: i,
      leaf,
    });
    leaves.push(leaf);
  }

  const tree = await buildMerkleTree(leaves);

  return {
    root: tree.root,
    tree,
    claims,
  };
}
