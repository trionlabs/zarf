/**
 * Canonical Stellar-address normalization for airdrop claim lists.
 *
 * Stellar strkeys are case-sensitive uppercase base32. The Merkle leaf hashes
 * `Address.fromString(address).toScVal().toXDR()`, so producer and consumer
 * must both trim and uppercase an address before hashing or matching it.
 */

/** Canonicalize a Stellar address for airdrop hashing and matching. */
export function normalizeAirdropAddress(address: string): string {
    return address.trim().toUpperCase();
}
