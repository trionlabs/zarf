/**
 * airdrop-claim service — load the pinned claim-list, find the connected
 * wallet's entry, verify its Merkle proof, and derive the single-screen claim
 * state. Pure + network-free (except `loadClaimList`); the component wires these
 * to live wallet/contract reads.
 *
 * Trust model (LOAD-BEARING, trap #1): the fetched JSON is CID-verified by
 * `fetchIpfsJson`, but that only proves "this is the content at this CID" — the
 * caller MUST bind `doc.root` to the on-chain `config().merkle_root` before
 * trusting eligibility. The contract re-verifies the proof on `claim`, so a
 * tampered list can never drain funds; the root-binding stops the UI from
 * showing a spoofed "you're eligible". See doc 02 §6 / 07 §4.
 *
 * @module services/airdropClaim
 */
import { fetchIpfsJson, IpfsFetchError } from '@zarf/core/utils/ipfsFetch';
import type { AirdropClaimListJson } from '@zarf/core/merkle';
import { normalizeAirdropAddress } from '@zarf/core/utils/airdropAddress';

const HEX_32 = /^0x[0-9a-f]{64}$/;
const UINT = /^\d+$/;

/** Thrown when the claim-list is unreachable or fails schema validation. */
export class ClaimListError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'ClaimListError';
    }
}

/** One matched claim. `index` is the array position the contract's `claim` receives. */
export interface MatchedClaim {
    index: number;
    /** The stored (producer-normalized) address — used verbatim for the leaf. */
    address: string;
    /** Amount in the token's smallest unit (decimal string). */
    amount: string;
    proof: string[];
}

/**
 * Validate loaded JSON against the frozen claim-list schema (doc 09 §6). Mirrors
 * the pin-proxy's `validateAirdropClaimList` so consumer and producer agree.
 */
export function validateClaimList(doc: unknown): AirdropClaimListJson {
    if (!doc || typeof doc !== 'object') throw new ClaimListError('Claim list is not an object');
    const d = doc as Record<string, unknown>;
    if (d.v !== 1) throw new ClaimListError('Unsupported claim-list version');
    if (d.network !== 'testnet' && d.network !== 'mainnet')
        throw new ClaimListError('Invalid network');
    if (typeof d.airdrop !== 'string' || d.airdrop.length === 0)
        throw new ClaimListError('Missing airdrop address');
    if (typeof d.token !== 'string' || d.token.length === 0)
        throw new ClaimListError('Missing token address');
    if (typeof d.root !== 'string' || !HEX_32.test(d.root))
        throw new ClaimListError('Invalid merkle root');
    if (!d.format || typeof d.format !== 'object') throw new ClaimListError('Missing format');
    if (!Array.isArray(d.claims) || d.claims.length === 0)
        throw new ClaimListError('Empty claim list');
    d.claims.forEach((c, i) => {
        if (!c || typeof c !== 'object') throw new ClaimListError(`Claim ${i}: not an object`);
        const cc = c as Record<string, unknown>;
        if (typeof cc.address !== 'string' || cc.address.length === 0)
            throw new ClaimListError(`Claim ${i}: bad address`);
        if (typeof cc.amount !== 'string' || !UINT.test(cc.amount))
            throw new ClaimListError(`Claim ${i}: bad amount`);
        if (
            !Array.isArray(cc.proof) ||
            !cc.proof.every((p) => typeof p === 'string' && HEX_32.test(p))
        )
            throw new ClaimListError(`Claim ${i}: bad proof`);
    });
    return doc as AirdropClaimListJson;
}

/** Map a fetch failure to a user-facing `ClaimListError` (pure; unit-tested). */
export function mapLoadError(err: unknown): ClaimListError {
    // Match by instanceof OR name (robust across module/bundle boundaries).
    const isIpfsError = err instanceof IpfsFetchError || (err as Error)?.name === 'IpfsFetchError';
    if (isIpfsError) {
        const code = (err as { code?: string })?.code;
        return new ClaimListError(
            code === 'INVALID_CID'
                ? 'This claim link is malformed.'
                : 'Could not load the airdrop list — try again.',
        );
    }
    return new ClaimListError('Could not load the airdrop list.');
}

/**
 * Fetch + validate the claim-list for `cid`. Uses the CID-verified gateway
 * fetcher (indexer-free in this app → falls back to public gateways).
 */
export async function loadClaimList(cid: string): Promise<AirdropClaimListJson> {
    let raw: unknown;
    try {
        raw = await fetchIpfsJson<unknown>(cid);
    } catch (err) {
        throw mapLoadError(err);
    }
    return validateClaimList(raw);
}

/**
 * Find `address` in the claim-list (UPPERCASE+trim on both sides). The returned
 * `index` is the array position, which the contract's `claim(index, …)` expects
 * — the array order is the index, so never re-sort `claims` (trap #2).
 */
export function findClaim(doc: AirdropClaimListJson, address: string): MatchedClaim | null {
    const target = normalizeAirdropAddress(address);
    const index = doc.claims.findIndex((c) => normalizeAirdropAddress(c.address) === target);
    if (index < 0) return null;
    const c = doc.claims[index];
    return { index, address: c.address, amount: c.amount, proof: c.proof };
}

/** The single-screen claim states (doc 07 §4). */
export type ClaimStatus =
    | 'loading'
    | 'load-error'
    | 'invalid-list'
    | 'wrong-network'
    | 'no-wallet'
    | 'not-in-list'
    | 'expired'
    | 'already-claimed'
    | 'eligible'
    | 'submitting'
    | 'success'
    | 'tx-error';

export interface ClaimStatusInputs {
    /** Doc fetch or initial chain read in flight. */
    loading: boolean;
    /** Doc fetch (IPFS) or chain read (RPC) failed — retryable. */
    loadFailed: boolean;
    doc: AirdropClaimListJson | null;
    /** Active app network (networkStore.activeId). */
    appNetwork: 'testnet' | 'mainnet';
    walletConnected: boolean;
    /** walletStore.isWrongNetwork — wallet on a different network than the app. */
    walletWrongNetwork: boolean;
    /** findClaim(doc, walletAddress); null when no wallet or not found. */
    matched: MatchedClaim | null;
    /** Client-side proof check; null until a claim is matched. */
    proofValid: boolean | null;
    /** doc.root === on-chain config.merkleRoot; null until config is read (trap #1). */
    rootMatches: boolean | null;
    /** On-chain deadline (unix seconds, 0 = none); null until read. */
    deadline: number | null;
    /** On-chain is_claimed(index); null until read. */
    isClaimedOnChain: boolean | null;
    nowSec: number;
    tx: { submitting: boolean; success: boolean; failed: boolean };
}

/**
 * Pure state-machine for the claim screen (doc 07 §4). Precedence is deliberate:
 * in-flight tx > load state > network > wallet > list membership > the
 * load-bearing integrity checks (proof + on-chain root binding) > eligibility.
 */
export function deriveClaimStatus(i: ClaimStatusInputs): ClaimStatus {
    if (i.tx.submitting) return 'submitting';
    if (i.tx.success) return 'success';
    if (i.tx.failed) return 'tx-error';

    if (i.loading) return 'loading';
    if (i.loadFailed || !i.doc) return 'load-error';

    // App on the wrong network for this airdrop (switchable via the NetworkToggle).
    if (i.doc.network !== i.appNetwork) return 'wrong-network';

    if (!i.walletConnected) return 'no-wallet';
    // Wallet on a different network than the app.
    if (i.walletWrongNetwork) return 'wrong-network';

    if (!i.matched) return 'not-in-list';

    // Integrity: the client proof must verify AND the list root must match the
    // on-chain airdrop (binds this CID to this `?a=` instance — trap #1).
    if (i.proofValid === false) return 'invalid-list';
    if (i.rootMatches === false) return 'invalid-list';

    // Still reading the instance config / claimed bit.
    if (i.rootMatches === null || i.deadline === null || i.isClaimedOnChain === null)
        return 'loading';

    if (i.deadline > 0 && i.nowSec > i.deadline) return 'expired';
    if (i.isClaimedOnChain) return 'already-claimed';
    return 'eligible';
}
