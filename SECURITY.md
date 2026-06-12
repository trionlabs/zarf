# Security Policy

Zarf is a showcase project by [Trion Labs](https://trionlabs.dev) demonstrating
a privacy-first, ZK-based token distribution protocol on Stellar/Soroban. It
currently runs on **testnet** only.

## Reporting a vulnerability

Please report security issues privately to **security@trionlabs.dev** (or
contact@trionlabs.dev). Do not open a public issue for a suspected
vulnerability. Include: a description, affected component, reproduction steps,
and impact assessment. We aim to acknowledge within 3 business days.

## Trust model and known accepted risks

The threat model and a number of deliberately-accepted risks are documented as
ADRs under [`docs/adr/`](docs/adr/). The most important to understand:

- **Unsalted email hashes are membership-testable** — published claim-list
  documents on public IPFS contain deterministic, unsalted hashes of recipient
  emails. Anyone can confirm whether a guessed email is a recipient. This is an
  accepted product trade-off for the dashboard filter UX
  ([ADR-0001](docs/adr/0001-unsalted-email-hashes-accepted-risk.md)); a
  sealed-salt upgrade is designed and ready if the decision changes.
- **Proofs are succinct but not formally zero-knowledge** — the current
  UltraKeccakHonk flavor omits the ZK masking rounds
  ([ADR-0002](docs/adr/0002-non-zk-ultrahonk-flavor.md)). The email/JWT are not
  *published*, but the proof is not formally hiding. A ZK-flavor port is
  planned before any mainnet value.

## Components and where the security boundaries are

- **Noir circuit (`circuits/`)** — proves a Google-signed JWT for an email in
  the distribution, binds the recipient via the OIDC nonce. Verified on-chain.
- **UltraHonk verifier (`contracts/soroban/verifier/`)** — hand-ported Rust
  verifier. It carries an adversarial test harness, but **a third-party audit
  is a prerequisite for mainnet** (tracked as an accepted gate).
- **JWK registry (`contracts/soroban/zarf/jwk-registry/`)** — the trust root:
  any RSA key it marks valid can mint claims. v2 splits a cold owner (intended
  multisig) from a hot operator that can only propose timelocked keys.
- **Vesting / factory** — fund custody, claim replay protection, recipient
  binding.
- **Cloudflare Workers** — `pin-proxy` (IPFS pinning, signature-gated +
  rate-limited), `indexer` (read cache, rate-limited), `jwk-rotation`
  (keeps the registry in sync with Google's JWKS, with revocation safety rails).

## Pre-mainnet security checklist

- [ ] Third-party audit of `ultrahonk-soroban-verifier` and the contract suite.
- [ ] Registry owner migrated to a multisig; operator key isolated.
- [ ] ZK-flavor proof port (ADR-0002) OR an explicit, disclosed acceptance.
- [ ] Resolve or disclose the emailHashes membership-testability (ADR-0001).
- [ ] Re-run `prettier --write` baseline and flip the format gate to blocking.
