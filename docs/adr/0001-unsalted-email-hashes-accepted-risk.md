# ADR-0001: Unsalted email hashes in public claim lists — accepted risk

- Status: Accepted (product decision, 2026-06-12)
- Deciders: Project owner
- Related: `plans/discovery-privacy-design.md` (local, untracked) — verified upgrade path

## Context

Every distribution publishes a claim-list JSON to public IPFS (the CID is
recorded on-chain). The document contains `emailHashes`: a deterministic,
**unsalted** Pedersen hash of each recipient's normalized email
(`web/packages/core/lib/utils/email.ts` → `hashEmail`). Its only consumer is
the claim dashboard's pre-filter (`web/apps/claim/src/lib/services/emailFilter.ts`),
which hides distributions that do not include the logged-in user's email. The
filter is a UX convenience and intentionally fails open; actual claim
eligibility is enforced by the PIN-based epoch discovery and the on-chain
ZK proof, neither of which uses `emailHashes`.

## Risk being accepted

Because the hash is deterministic and salt-free over a low-entropy input:

1. **Membership testing** — anyone can fetch the public JSON, hash candidate
   emails, and confirm with certainty whether a specific person is a recipient
   of a specific distribution (e.g. reconstruct a company's payroll list from
   guessed `first.last@company.com` addresses, including per-leaf amounts).
2. **Cross-distribution correlation** — the same email yields the same hash in
   every distribution, so recipients can be tracked across all distributions
   ever published.

This is permanent for already-pinned documents (IPFS content is immutable and
content-addressed).

## Decision

Keep `emailHashes` and the dashboard filter unchanged. The dashboard UX
(automatic "your distributions" filtering after Google login) is valued above
the membership-privacy property for the current product stage.

## Upgrade path (pre-designed, not scheduled)

A drop-in replacement ("Sealed-Salt Discovery") was designed and adversarially
reviewed: per-distribution random salt, published tags =
`HMAC-SHA256(salt, normalizedEmail)`, salt HPKE-sealed to a stateless discovery
worker that only evaluates tags for the email inside a verified Google
id_token. It preserves the exact dashboard UX while making outsider membership
testing structurally impossible, requires no contract or circuit changes, and
degrades to today's status quo in the worst key-compromise case. Revisit
before any mainnet launch or marketing claim about recipient privacy.

## Consequences

- Public marketing copy must not claim that recipient *lists* are private;
  only the email→wallet link (protected by the ZK claim path) is.
- New surfaces serving `emailHashes` (e.g. the indexer extraction route) are
  acceptable, since the underlying data is already public by this decision.
