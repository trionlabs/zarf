/**
 * Merkle Tree Utilities for Whitelist Verification
 * 
 * Uses Pedersen hashing via Aztec's Barretenberg to match Noir circuit.
 * Implements sparse Merkle trees with fixed depth (20) for ZK proofs.
 * 
 * @module crypto/merkleTree
 */

import { Barretenberg, Fr } from '@aztec/bb.js';
import type { WhitelistEntry, MerkleTreeData, MerkleProof, MerkleClaim, Schedule } from '../types';

// ============================================================================
// Constants
// ============================================================================

/**
 * Fixed Merkle tree depth (must match Noir circuit)
 */
const TREE_DEPTH = 20;

/**
 * Maximum email length for padding (must match circuit)
 */
const MAX_EMAIL_LENGTH = 64;

// ============================================================================
// Barretenberg Singleton
// ============================================================================

let barretenberg: Barretenberg | null = null;
let initPromise: Promise<Barretenberg> | null = null;

/**
 * Initialize Barretenberg for Pedersen hashing.
 * Uses singleton pattern to prevent multiple WASM loads.
 * 
 * @returns Initialized Barretenberg instance
 * 
 * @throws {Error} If WASM loading fails
 * 
 * @internal
 */
async function initBarretenberg(): Promise<Barretenberg> {
    if (barretenberg) return barretenberg;

    // Prevent concurrent initialization
    if (initPromise) return initPromise;

    initPromise = (async () => {
        try {
            barretenberg = await Barretenberg.new();
            return barretenberg;
        } catch (error) {
            // Reset on failure to allow retry
            initPromise = null;
            throw new Error(
                `Failed to initialize Barretenberg: ${error instanceof Error ? error.message : 'unknown error'}`
            );
        }
    })();

    return initPromise;
}

// ============================================================================
// Hashing Primitives
// ============================================================================

/**
 * Convert string to padded byte array.
 * Matches circuit's MAX_EMAIL_LENGTH requirement.
 * 
 * @param str - Input string (email)
 * @param maxLength - Target length (default: 64)
 * @returns Padded byte array
 * 
 * @example
 * ```typescript
 * const bytes = stringToBytes('alice@example.com', 64);
 * // Uint8Array[97, 108, 105, 99, 101, ..., 0, 0, 0] (length: 64)
 * ```
 */
export function stringToBytes(str: string, maxLength: number = MAX_EMAIL_LENGTH): Uint8Array {
    const bytes = new TextEncoder().encode(str);
    const padded = new Uint8Array(maxLength);

    // Copy up to maxLength bytes, rest remain 0 (padding)
    padded.set(bytes.slice(0, maxLength));

    return padded;
}

/**
 * Compute Pedersen hash of byte array.
 * Each byte becomes a separate field element.
 * Matches Noir's `pedersen_hash` function.
 * 
 * @param bytes - Byte array to hash
 * @returns Hash as bigint
 * 
 * @throws {Error} If Barretenberg initialization fails
 * 
 * @example
 * ```typescript
 * const emailBytes = stringToBytes('alice@example.com');
 * const emailHash = await pedersenHashBytes(emailBytes);
 * // bigint (field element)
 * ```
 */
export async function pedersenHashBytes(bytes: Uint8Array): Promise<bigint> {
    const bb = await initBarretenberg();

    // Convert each byte to a field element
    const fields = Array.from(bytes).map((byte) => new Fr(BigInt(byte)));

    // Hash with generator index 0
    const hash = await bb.pedersenHash(fields, 0);

    return BigInt(hash.toString());
}

/**
 * Compute Pedersen hash of two field elements.
 * Used for Merkle tree internal node hashing.
 * 
 * @param left - Left child hash
 * @param right - Right child hash
 * @returns Parent hash as bigint
 * 
 * @throws {Error} If Barretenberg initialization fails
 * 
 * @example
 * ```typescript
 * const parent = await pedersenHashPair(leftLeaf, rightLeaf);
 * ```
 */
export async function pedersenHashPair(left: bigint, right: bigint): Promise<bigint> {
    const bb = await initBarretenberg();

    const hash = await bb.pedersenHash([new Fr(left), new Fr(right)], 0);

    return BigInt(hash.toString());
}

/**
 * Compute leaf hash from email, amount, and salt.
 * 
 * Formula: leaf = pedersen(email_hash, amount, unlock_time)
 * 
 * @param email - User's email (will be normalized)
 * @param amount - Claim amount
 * @param code - 8-char secure code (Epoch Secret)
 * @param unlockTime - Unix timestamp for this epoch
 * @returns Leaf hash as bigint
 */
export async function computeLeaf(
    email: string,
    amount: bigint,
    code: string,
    unlockTime: number
): Promise<bigint> {
    const bb = await initBarretenberg();

    // 1. Compute Identity Commitment
    const identityCommitment = await computeIdentityCommitment(email, code);

    // 2. Leaf = Pedersen(IdentityCommitment, Amount, UnlockTime)
    // UnlockTime is cast to Field
    const fields = [new Fr(identityCommitment), new Fr(amount), new Fr(BigInt(unlockTime))];
    const leafHash = await bb.pedersenHash(fields, 0);

    return BigInt(leafHash.toString());
}

/**
 * Compute Identity Commitment for a user.
 * 
 * Formula: Identity = Pedersen(email, Pedersen(code))
 * 
 * @param email - User's email
 * @param code - 8-char secure code
 * @returns Identity Commitment as bigint
 */
export async function computeIdentityCommitment(email: string, code: string): Promise<bigint> {
    const bb = await initBarretenberg();

    // 1. Hash the email (as bytes)
    const emailBytes = stringToBytes(email.toLowerCase().trim(), MAX_EMAIL_LENGTH);
    const emailHash = await pedersenHashBytes(emailBytes);

    // 2. Hash the code (Packed as single Field)
    // Circuit expects: hash_secret(secret: Field) -> pedersen([secret])
    // So we must pack the 8 ASCII bytes into one BigInt.

    // "ABC" -> 0x414243
    const encoder = new TextEncoder();
    const codeBytes = encoder.encode(code);
    const codeHex = '0x' + Array.from(codeBytes).map(b => b.toString(16).padStart(2, '0')).join('');
    const codeField = BigInt(codeHex);

    const codeHashResult = await bb.pedersenHash([new Fr(codeField)], 0);
    const codeHash = BigInt(codeHashResult.toString());

    // 3. Identity = Pedersen(emailHash, codeHash)
    const identity = await bb.pedersenHash([new Fr(emailHash), new Fr(codeHash)], 0);

    return BigInt(identity.toString());
}

/**
 * Generate a random salt within BN254 field modulus.
 * 
 * @returns Random salt as hex string
 * 
 * @example
 * const code = generateSecureCode();
 * // "Xk9mP2qL"
 * ```
 */
/**
 * Generate a random salt within BN254 field modulus.
 * 
 * @returns Random 8-character alphanumeric code
 */
export function generateSecureCode(): string {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789'; // Base58-like (no I, l, O, 0)
    const length = 8;
    const randomValues = new Uint8Array(length);

    // Use Web Crypto API (Browser & Modern Node 19+) for CSP compliance and security
    if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
        crypto.getRandomValues(randomValues);
    } else if (typeof window !== 'undefined' && window.crypto) {
        window.crypto.getRandomValues(randomValues);
    } else if (typeof process !== 'undefined' && process.versions != null && process.versions.node != null) {
        // Fallback for Node.js environments (e.g. tests) - Dynamic import to avoid Bundler errors
        // This block needs to be `await`ed or handled with a callback/promise.
        // For synchronous `generateSecureCode`, we'll use a synchronous fallback.
        // @ts-ignore
        try {
            // eslint-disable-next-line @typescript-eslint/no-var-requires
            const nodeCrypto = require('crypto');
            nodeCrypto.randomFillSync(randomValues);
        } catch (e) {
            console.warn("Node.js crypto not available, falling back to Math.random for secure code generation.");
            for (let k = 0; k < length; k++) randomValues[k] = Math.floor(Math.random() * 256);
        }
    } else {
        // Fallback for very old environments or strict contexts without crypto
        // Using Math.random is NOT cryptographically secure but prevents build errors.
        // For production keys, strict crypto is required.
        console.warn('Warning: Using non-secure RNG for salt generation');
        for (let i = 0; i < length; i++) {
            randomValues[i] = Math.floor(Math.random() * 256);
        }
    }

    let result = '';
    for (let i = 0; i < length; i++) {
        result += chars[randomValues[i] % chars.length];
    }
    return result;
}

// ============================================================================
// Empty Tree Cache
// ============================================================================

let emptyHashes: bigint[] | null = null;

/**
 * Precompute empty subtree hashes for each level.
 * 
 * - emptyHashes[0] = 0 (empty leaf)
 * - emptyHashes[1] = H(0, 0)
 * - emptyHashes[2] = H(emptyHashes[1], emptyHashes[1])
 * - ...
 * - emptyHashes[TREE_DEPTH] = root of empty tree
 * 
 * Cached after first computation.
 * 
 * @returns Array of empty hashes (length: TREE_DEPTH + 1)
 * 
 * @throws {Error} If hashing fails
 * 
 * @internal
 */
async function getEmptyHashes(): Promise<bigint[]> {
    if (emptyHashes) return emptyHashes;

    try {
        const hashes: bigint[] = [0n]; // Level 0: empty leaf

        for (let i = 0; i < TREE_DEPTH; i++) {
            const prev = hashes[i];
            const next = await pedersenHashPair(prev, prev);
            hashes.push(next);
        }

        emptyHashes = hashes;
        return emptyHashes;
    } catch (error) {
        // Don't cache partial results on error
        emptyHashes = null;
        throw error;
    }
}

// ============================================================================
// Merkle Tree Construction
// ============================================================================

/**
 * Build sparse Merkle tree from leaf hashes.
 * 
 * - Pads leaves to next power of 2
 * - Builds minimal tree layers
 * - Extends to TREE_DEPTH using empty subtrees
 * 
 * @param leaves - Array of leaf hashes (bigint)
 * @returns Merkle tree structure with root and layers
 * 
 * @throws {Error} If no leaves provided or hashing fails
 * 
 * @example
 * ```typescript
 * const leaves = [leaf1, leaf2, leaf3];
 * const tree = await buildMerkleTree(leaves);
 * console.log(tree.root); // Root hash
 * console.log(tree.minDepth); // Minimal tree depth
 * ```
 */
export async function buildMerkleTree(
    leaves: bigint[]
): Promise<{
    root: bigint;
    layers: bigint[][];
    minDepth: number;
    depth: number;
    emptyHashes: bigint[];
}> {
    if (leaves.length === 0) {
        throw new Error('Cannot build Merkle tree with no leaves');
    }

    const empty = await getEmptyHashes();

    // Calculate minimal tree depth (next power of 2)
    const minDepth = Math.max(1, Math.ceil(Math.log2(leaves.length)));
    const minSize = Math.pow(2, minDepth);

    // Pad leaves with zeros
    const paddedLeaves = [...leaves];
    while (paddedLeaves.length < minSize) {
        paddedLeaves.push(0n);
    }

    // Build tree layers bottom-up
    const layers: bigint[][] = [paddedLeaves];
    let currentLayer = paddedLeaves;

    for (let level = 0; level < minDepth; level++) {
        const nextLayer: bigint[] = [];

        for (let i = 0; i < currentLayer.length; i += 2) {
            const left = currentLayer[i];
            const right = currentLayer[i + 1];
            const parent = await pedersenHashPair(left, right);
            nextLayer.push(parent);
        }

        layers.push(nextLayer);
        currentLayer = nextLayer;
    }

    // Extend to full TREE_DEPTH using empty subtrees
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
 * Get Merkle proof for a leaf at given index.
 * Returns sibling hashes and path indices matching circuit format.
 * 
 * @param tree - Merkle tree structure from buildMerkleTree
 * @param leafIndex - Index of the leaf (0-based)
 * @returns Merkle proof with siblings and indices
 * 
 * @example
 * ```typescript
 * const tree = await buildMerkleTree(leaves);
 * const proof = getMerkleProof(tree, 2); // Proof for 3rd leaf
 * 
 * // proof.siblings: ['0x...', '0x...', ...]
 * // proof.indices: [0, 1, 0, ...]  (0=left, 1=right)
 * ```
 */
export function getMerkleProof(
    tree: {
        layers: bigint[][];
        minDepth: number;
        emptyHashes: bigint[];
    },
    leafIndex: number
): MerkleProof {
    const { layers, minDepth, emptyHashes } = tree;
    const siblings: string[] = [];
    const indices: number[] = [];

    let index = leafIndex;

    // Get siblings from actual tree layers
    for (let i = 0; i < minDepth; i++) {
        const layer = layers[i];
        const isRight = index % 2 === 1;
        const siblingIndex = isRight ? index - 1 : index + 1;

        const sibling = layer[siblingIndex] ?? 0n;
        siblings.push(`0x${sibling.toString(16)}`);
        indices.push(isRight ? 1 : 0);

        index = Math.floor(index / 2);
    }

    // For levels beyond minDepth, sibling is empty subtree hash
    // Current node is always on the left (index 0)
    for (let i = minDepth; i < TREE_DEPTH; i++) {
        siblings.push(`0x${emptyHashes[i].toString(16)}`);
        indices.push(0);
    }

    return { siblings, indices };
}

/**
 * Verify a Merkle proof against a root.
 * 
 * @param leaf - Leaf hash to verify
 * @param proof - Merkle proof (siblings + indices)
 * @param root - Expected root hash
 * @returns True if proof is valid
 * 
 * @throws {Error} If hashing fails
 * 
 * @example
 * ```typescript
 * const isValid = await verifyMerkleProof(leafHash, proof, tree.root);
 * if (!isValid) {
 *   throw new Error('Invalid Merkle proof');
 * }
 * ```
 */
export async function verifyMerkleProof(
    leaf: bigint,
    proof: MerkleProof,
    root: bigint
): Promise<boolean> {
    const { siblings, indices } = proof;
    let current = leaf;

    for (let i = 0; i < siblings.length; i++) {
        const sibling = BigInt(siblings[i]);
        const isRight = indices[i] === 1;

        if (isRight) {
            // Current is on right, sibling on left
            current = await pedersenHashPair(sibling, current);
        } else {
            // Current is on left, sibling on right
            current = await pedersenHashPair(current, sibling);
        }
    }

    return current === root;
}

// ============================================================================
// High-Level Whitelist Processing
// ============================================================================

/**
 * Process whitelist entries into Merkle tree with claims.
 * 
 * This is the main entry point for whitelist generation:
 * 1. Generates random salt for each entry
 * 2. Computes leaf hashes
 * 3. Builds Merkle tree
 * 4. Returns root, tree, and claim data
 * 
 * @param entries - Whitelist entries (email, amount)
 * @returns Complete Merkle tree data with claims
 * 
 * @throws {Error} If entries array is empty or hashing fails
 * 
 * @example
 * ```typescript
 * const entries = [
 *   { email: 'alice@example.com', amount: 1000 },
 *   { email: 'bob@example.com', amount: 2000 }
 * ];
 * 
 * const result = await processWhitelist(entries);
 * 
 * // Save to localStorage
 * localStorage.setItem('whitelist', JSON.stringify({
 *   root: result.root.toString(),
 *   claims: result.claims.map(c => ({
 *     ...c,
 *     leaf: c.leaf.toString()
 *   }))
 * }));
 * ```
 */
/**
 * Process whitelist entries into Merkle tree with claims (Discrete Vesting).
 * 
 * Generates N leaves per user based on the vesting schedule.
 * 
 * @param entries - Whitelist entries (email, totalAmount)
 * @param schedule - Vesting schedule configuration
 * @returns Complete Merkle tree data with claims
 */
export async function processWhitelist(
    entries: { email: string; amount: bigint }[],
    schedule: Schedule
): Promise<MerkleTreeData> {
    if (entries.length === 0) {
        throw new Error('Cannot process empty whitelist');
    }

    const claims: MerkleClaim[] = [];
    const leaves: bigint[] = [];

    // Parse Schedule
    const cliffEnd = new Date(schedule.cliffEndDate).getTime() / 1000;
    // For simplicity, we assume 'distributionDuration' is count of periods (e.g. 12 months -> 12 epochs)
    // If durationUnit is months, period is roughly 30 days.
    const epochs = schedule.distributionDuration;

    // Calculate Period Length in Seconds
    let periodSeconds = 0;
    switch (schedule.durationUnit) {
        case 'minutes': periodSeconds = 60; break;
        case 'hours': periodSeconds = 3600; break;
        case 'weeks': periodSeconds = 7 * 24 * 3600; break;
        case 'months': periodSeconds = 30 * 24 * 3600; break;
        case 'quarters': periodSeconds = 90 * 24 * 3600; break;
        case 'years': periodSeconds = 365 * 24 * 3600; break;
    }

    // Process each user
    for (let i = 0; i < entries.length; i++) {
        const { email, amount } = entries[i];

        // Master Salt for the user
        const masterSalt = generateSecureCode();

        // Split amount into epochs
        const amountPerEpoch = amount / BigInt(epochs);
        const remainder = amount % BigInt(epochs);

        // Generate N leaves
        for (let epoch = 0; epoch < epochs; epoch++) {
            // Distribute remainder to first epochs
            const currentAmount = epoch < Number(remainder) ? amountPerEpoch + 1n : amountPerEpoch;

            // Unlock time: CliffEnd + (EpochIndex * Period)
            // Epoch 0 unlocks AT cliff end.
            const unlockTime = Math.floor(cliffEnd + (epoch * periodSeconds));

            // Derive Epoch Secret: MasterSalt + "_" + Index
            const epochSecret = `${masterSalt}_${epoch}`;

            // Compute Identity Commitment for this Epoch (Unlinkable)
            const identityCommitmentBigInt = await computeIdentityCommitment(email, epochSecret);
            const identityCommitment = '0x' + identityCommitmentBigInt.toString(16);

            // Compute Leaf: H(EpochCommitment, Amount, UnlockTime)
            const leaf = await computeLeaf(email, currentAmount, epochSecret, unlockTime);

            claims.push({
                email: email.toLowerCase().trim(),
                amount: currentAmount,
                salt: epochSecret, // Derived secret
                identityCommitment,
                leafIndex: leaves.length, // Global index
                leaf,
                unlockTime
            });

            leaves.push(leaf);
        }
    }

    // Build tree
    const tree = await buildMerkleTree(leaves);

    return {
        root: tree.root,
        tree: {
            minDepth: tree.minDepth,
            depth: tree.depth,
            layers: tree.layers,
            emptyHashes: tree.emptyHashes,
        },
        claims: claims, // Note: claims list is now N times larger than entries
    };
}
