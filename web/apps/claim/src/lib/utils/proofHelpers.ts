import { buildMerkleTree, getMerkleProof } from '@zarf/core/crypto/merkleTree';
import type { MerkleProof } from '@zarf/ui/types';
import type { Address } from 'viem';
import { getCidForVesting } from '@zarf/core/services/vestingDiscovery';
import { fetchIpfsJson } from '@zarf/core/utils/ipfsFetch';

/**
 * Fetch Merkle leaves for a vesting from IPFS.
 *
 * The CID is resolved from the factory's VestingCreated event log.
 *
 * @param contractAddress - Vesting contract address
 */
export async function fetchPublicLeaves(contractAddress: string | null): Promise<bigint[]> {
    if (!contractAddress) {
        throw new Error('Distribution Data Error: contractAddress is required');
    }

    const cid = await getCidForVesting(contractAddress as Address);
    if (!cid) {
        throw new Error(`No metadata CID found for vesting ${contractAddress}`);
    }
    const data = await fetchIpfsJson(cid);
    return processDistributionData(data);
}

interface ClaimListShape {
    commitments?: Record<string, { amount: string; unlockTime: number; index: number }>;
}

async function processDistributionData(data: unknown): Promise<bigint[]> {
    const doc = data as ClaimListShape;
    if (!doc.commitments || typeof doc.commitments !== 'object') {
        throw new Error("Invalid distribution format: 'commitments' missing");
    }

    const { computeLeafFromCommitment } = await import('@zarf/core/crypto/merkleTree');

    const leavesMap = new Map<number, bigint>();
    let maxIndex = -1;
    for (const [commitment, meta] of Object.entries(doc.commitments)) {
        const leaf = await computeLeafFromCommitment(
            commitment,
            BigInt(meta.amount),
            meta.unlockTime,
        );
        leavesMap.set(meta.index, leaf);
        if (meta.index > maxIndex) maxIndex = meta.index;
    }

    const leaves: bigint[] = [];
    for (let i = 0; i <= maxIndex; i++) {
        leaves.push(leavesMap.get(i) ?? 0n);
    }
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
