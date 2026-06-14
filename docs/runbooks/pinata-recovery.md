# Runbook: IPFS / Pinata loss and recovery

## Why this matters

Each distribution's claim list (Merkle leaves, per-epoch commitments, schedule)
lives **only on IPFS**. On-chain, the vesting contract stores just the Merkle
**root** and the metadata **CID** — not the leaves. If the pinned document
disappears and no copy exists, recipients can still be *paid* (the proof only
needs the recipient's own leaf path, which they can recompute from the backup),
but the **claim app cannot reconstruct the distribution view** (epoch discovery
walks the published `commitments`).

Pinning is currently single-provider (Pinata, via the `pin-proxy` Worker).
This is a single point of failure.

## Detection

- `pin-proxy` / gateway 404s for a known CID.
- Claim app "distribution not found" for a contract that exists on-chain.
- Indexer `/v1/ipfs/:cid` failures across all gateways.

## Recovery options (in order)

1. **Re-pin from a surviving copy.** Any node that has the bytes can re-add
   them; the CID is content-addressed, so a re-pin of the identical document
   restores the exact CID. Sources, in order of likelihood:
   - the indexer/gateway caches (short-lived);
   - the creator's browser localStorage WAL (only fields, not the full tree —
     usually insufficient on its own);
   - a public IPFS gateway that still has the block.

2. **Rebuild from the creator's backup.** The creator downloaded a backup CSV
   (`email,pin`) at deploy time (mandatory before deploy). Combined with the
   recipient list + amounts + schedule (from the create-app wizard export or
   the on-chain factory event), the claim list is **deterministically
   regenerable** with `processWhitelist` (same input order → same leaves →
   same root → same CID). Steps:
   - reconstruct the `{email, amount, pin}` rows in the original order;
   - run the merkle build (`@zarf/core/crypto/merkleTree processWhitelist`);
   - rebuild the claim-list doc (`buildClaimList`/`serializeClaimList`);
   - verify the resulting Merkle root equals the on-chain root **and** the CID
     equals the on-chain CID before re-pinning. If either differs, the input
     order or amounts are wrong — do not pin a mismatched document.
   - re-pin via `pin-proxy` `/pin`.

3. **Direct recipient payout (no claim app).** If only individual recipients
   need to be paid and the doc cannot be rebuilt, a recipient with their PIN
   can still generate a proof for their own epoch (the circuit needs only their
   leaf + Merkle path, derivable from the root + their secret). This is a
   manual, per-recipient fallback.

## Hardening (do before mainnet)

- **Multi-provider pinning**: pin to a second service (web3.storage / a
  self-hosted IPFS node) in `pin-proxy` so a single provider loss is survivable.
- **Scheduled pin verification**: a cron that re-fetches every known CID and
  re-pins on miss; alert via `ALERT_WEBHOOK_URL`.
- **Document the backup format** to creators and make the backup download
  recoverable (re-downloadable) within the create app.
