/**
 * Client-side Merkle proof verification. Split into its own module because
 * `@zarf/core/merkle` pulls in stellar-sdk (the leaf encodes the address XDR via
 * `Address.fromString`), and the claim page lazy-imports this so stellar-sdk
 * stays OFF the initial paint — the load/find/status path is stellar-sdk-free.
 *
 * @module services/proof
 */
import { leafHash, verifyProof, type AirdropClaimListJson } from '@zarf/core/merkle';
import type { MatchedClaim } from './airdropClaim';

/** Verify `claim`'s proof reproduces `doc.root` (instant feedback before any tx). */
export function verifyClaimProof(doc: AirdropClaimListJson, claim: MatchedClaim): boolean {
    return verifyProof(doc.root, leafHash(claim.index, claim.address, claim.amount), claim.proof);
}
