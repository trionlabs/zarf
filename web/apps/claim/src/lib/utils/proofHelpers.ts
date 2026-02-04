import { buildMerkleTree, getMerkleProof } from '@zarf/core/crypto/merkleTree';
import type { MerkleProof } from '@zarf/ui/types';

/**
 * Fetch Merkle leaves from the distribution file.
 * 
 * Strategy:
 * 1. Default to `/distribution.json` (Single-tenant / Local Dev Mode)
 * 2. In Multi-tenant Prod, we would use `/distributions/${contractAddress}.json`
 * 
 * @param contractAddress - Functional context (unused currently, reserved for v2)
 */
export async function fetchPublicLeaves(contractAddress: string | null): Promise<bigint[]> {
    const defaultUrl = '/distribution.json';

    // Future-proof: Ready for multi-tenant logic
    // Future-proof: Ready for multi-tenant logic
    const targetUrl = contractAddress ? `/distributions/${contractAddress.toLowerCase()}.json` : defaultUrl;

    // Current: Multi-tenant enabled
    console.log(`[Distribution] Fetching from: ${targetUrl} (Context: ${contractAddress || 'None'})`);

    try {
        let response = await fetch(targetUrl);

        // Fallback Logic: If specific file missing, try default (useful if we enable multi-tenant later)
        if (!response.ok && targetUrl !== defaultUrl) {
            console.warn(`[Distribution] Specific file not found. Falling back to default.`);
            response = await fetch(defaultUrl);
        }

        if (!response.ok) {
            throw new Error(`Failed to load distribution data. Status: ${response.status}`);
        }

        const data = await response.json();
        return processDistributionData(data);

    } catch (e) {
        console.error("[Distribution] Error:", e);
        throw new Error(`Distribution Data Error: ${e instanceof Error ? e.message : 'Unknown error'}`);
    }
}

async function processDistributionData(data: any): Promise<bigint[]> {
    // 1. Secure Format: Direct array of leaves
    // TEMP: Force disabled to debug leaf mismatch. We want to reconstruct from commitments to ensure consistency.
    /*
    if (data.leaves && Array.isArray(data.leaves)) {
        console.log(`[Distribution] Found ${data.leaves.length} public leaves (Secure Format).`);
        return data.leaves.map((l: string) => BigInt(l));
    }
    */

    // 2. Hybrid Format: Reconstruct from Commitments Map (ADR-023 Standard)
    if (data.commitments && typeof data.commitments === 'object') {
        console.log('[Distribution] Leaves array missing. Reconstructing from commitments map...');
        const leavesMap = new Map<number, bigint>();
        let maxIndex = -1;

        // We need crypto tools to re-compute leaf
        const { computeLeafFromCommitment } = await import('@zarf/core/crypto/merkleTree');

        for (const [commitment, metadata] of Object.entries(data.commitments)) {
            const meta = metadata as any;
            const idx = meta.index;
            const amount = BigInt(meta.amount);
            const unlockTime = meta.unlockTime;

            // Recompute Leaf: Hash(IdentityCommitment, Amount, UnlockTime)
            const leaf = await computeLeafFromCommitment(commitment, amount, unlockTime);

            leavesMap.set(idx, leaf);
            if (idx > maxIndex) maxIndex = idx;
        }

        // Convert map to dense array (sparse entries are 0)
        // Tree usually has Size = 2^k, but here we just need up to maxIndex + 1
        const leaves: bigint[] = [];
        for (let i = 0; i <= maxIndex; i++) {
            leaves.push(leavesMap.get(i) || 0n);
        }

        console.log(`[Distribution] Reconstructed ${leaves.length} leaves from commitments.`);
        return leaves;
    }

    // 3. Legacy Format (Dev/Unsafe)
    const list = data.claims || data.recipients;

    if (!list || !Array.isArray(list)) {
        throw new Error("Invalid distribution format: 'leaves', 'commitments' or 'claims' missing.");
    }

    console.warn("[Distribution] Using Legacy/Unsafe JSON format. This should not be used in production.");

    const leaves = list.map((c: any) => {
        if (!c.leaf) return 0n;
        return BigInt(c.leaf);
    });

    console.log(`Loaded ${leaves.length} leaves from distribution.`);
    return leaves;
}

/**
 * Helper to Find User's Leaf and generate a valid Path for the Proof.
 * 
 * @param userLeaf - The leaf computed from user's Identity + Amount
 * @param publicLeaves - The list of other leaves
 */
export async function getProofForLeaf(userLeaf: bigint, publicLeaves: bigint[]): Promise<{
    proof: MerkleProof;
    root: bigint;
}> {
    const leaves = [...publicLeaves];

    // Check if exists
    const index = leaves.findIndex(l => l === userLeaf);

    if (index === -1) {
        throw new Error("Your identity verification generated a leaf that is NOT in the distribution list. Please check your credentials.");
    }

    // Build the tree (re-verify root)
    // Note: In a heavily optimized app, we might download the ready-made proof from the JSON 
    // instead of rebuilding the tree client-side. But for now, ensuring correctness by rebuilding is safer.
    const tree = await buildMerkleTree(leaves);

    // Get Proof
    const proof = getMerkleProof(tree, index);

    return {
        proof,
        root: tree.root
    };
}
