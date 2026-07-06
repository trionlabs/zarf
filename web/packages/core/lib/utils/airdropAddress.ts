/**
 * Canonical Stellar-address normalization for airdrop claim-lists.
 *
 * LOAD-BEARING (doc 07 §3.2): addresses normalize to **UPPERCASE**, never
 * lowercase. Stellar strkeys are case-sensitive uppercase base32; the airdrop
 * leaf hashes `Address.fromString(addr).toScVal().toXDR()`, and a lowercased
 * strkey THROWS inside `Address.fromString`, silently breaking that recipient.
 *
 * This is the SINGLE source of truth shared by the producer (the wallet create
 * route builds the Merkle tree from these addresses) and the consumer
 * (airdrop-claim matches a connected wallet against `claims[].address`). They MUST normalize
 * identically, or claims silently miss — and the Rust↔JS differential vectors do
 * NOT catch a normalization drift (they are generated from uppercase fixtures).
 * Hence one shared function, not two copies.
 *
 * @module utils/airdropAddress
 */

/** Canonicalize a Stellar address for airdrop hashing/matching: trim + UPPERCASE. */
export function normalizeAirdropAddress(address: string): string {
    return address.trim().toUpperCase();
}
