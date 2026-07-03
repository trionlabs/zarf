/**
 * `@zarf/core/merkle` — airdrop Merkle public API (doc 09 §8).
 *
 * Plain keccak256, byte-identical to the Rust airdrop contract; NO BN254
 * reduction. Entirely separate from the ZK `crypto/merkleTree` (Pedersen/BN254,
 * email leaves) — do not conflate the two.
 *
 * @module merkle
 */

export type { Row, Tree, ClaimListMeta, ClaimListFormat, AirdropClaimListJson } from './types';
export { leafHash, buildTree, verifyProof } from './tree';
export { buildClaimList, serializeClaimList } from './claimList';
