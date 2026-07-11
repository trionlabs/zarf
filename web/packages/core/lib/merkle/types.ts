/**
 * Public types for the airdrop Merkle module.
 *
 * Standalone wallet-address + Merkle-claim distributor — deliberately separate
 * from the Zarf ZK core (no BN254 field reduction). Byte-format authority is
 * `plans/airdrop_tool/09-merkle-data-contract.md`.
 *
 * @module merkle/types
 */

/** One recipient row. */
export interface Row {
    /** Base strkey, `G…` (account) or `C…` (contract). Muxed `M…` is rejected. */
    address: string;
    /**
     * Amount in the token's smallest unit. Decimal string (not `number`) so the
     * full i128 range survives without IEEE-754 precision loss. Must be `> 0`.
     */
    amount: string;
}

/** A built Merkle tree. Every hash is `0x`-prefixed, lowercase, 64 hex chars. */
export interface Tree {
    root: string;
    leaves: string[];
    /** Per-row sibling hashes, leaf→root order (no direction bit; nodes sorted). */
    proofs: string[][];
}

/** Machine-readable pin of the hash contract, embedded in the claim-list JSON. */
export interface ClaimListFormat {
    hash: 'keccak256';
    leaf: '0x00|index_be32|claimant_xdr|amount_be128';
    node: '0x01|sorted(L,R)';
    leafBinding: 'none' | 'contract';
}

/** Caller-supplied metadata for a claim-list (everything not derived from rows). */
export interface ClaimListMeta {
    network: 'testnet' | 'mainnet';
    /** Airdrop instance contract address (`C…`). */
    airdrop: string;
    /** Token contract address (SAC / SEP-41, `C…`). */
    token: string;
    /** Defaults to `'none'`. */
    leafBinding?: 'none' | 'contract';
}

/** The public claim-list document (pinned to IPFS; doc 02 §6 / doc 09 §6). */
export interface AirdropClaimListJson {
    v: 1;
    network: 'testnet' | 'mainnet';
    airdrop: string;
    token: string;
    root: string;
    format: ClaimListFormat;
    /** `index` is implicit = array position (0-based); contract receives that `i`. */
    claims: Array<{ address: string; amount: string; proof: string[] }>;
}
