---
title: Project status
description: Where Zarf stands today — live on Stellar testnet, mainnet gated on a third-party audit, with an honest list of known issues.
sidebar:
  order: 2
---

Zarf is a **showcase project by [Trion Labs](https://trionlabs.dev)**,
demonstrating a privacy-first token distribution protocol on Stellar/Soroban.
This page is an honest snapshot of what is live, what is not, and why.

## Live on testnet today

Both product families run on **Stellar testnet**:

- **Email (ZK) distributions** — created at `create.zarf.to`, claimed at
  `claim.zarf.to`. Only a Merkle root of the audience goes on-chain; recipients
  prove email ownership with a zero-knowledge proof (Noir / UltraHonk) verified
  **on-chain** by the verifier contract using Soroban's native BN254 host
  functions. A measured ZK claim costs roughly **0.0225 XLM** on testnet.
- **Wallet airdrops** — created at `create.zarf.to/airdrop` and claimed at
  `airdrop.zarf.to`. Classic address-whitelist distributions with the same
  vesting engine and no ZK.

The supporting services are live too: the [indexer](/developers/indexer-api/)
(`indexer.zarf.to`), the [pin-proxy](/developers/ipfs-and-metadata/)
(`pin.zarf.to`), and the [JWK rotation worker](/developers/jwk-rotation/)
(`jwt.zarf.to`), which keeps Google's signing keys synced to the on-chain
registry.

See [what is Zarf](/learn/what-is-zarf/) for the product overview and
[deployed contracts](/resources/deployed-contracts/) for the current testnet
addresses.

## Mainnet is gated on an audit

Zarf is **not deployed to Stellar mainnet.** This is deliberate: launch is gated
on a completed third-party security audit. It is a gate, not a delay — real
funds will not move through Zarf until the audit is done.

## Known issues

An internal contract audit reviewed the core claim / verify / factory / custody
logic and found **no unprivileged fund-theft or double-claim exploit**. The open
items are trust-assumption, defense-in-depth, and fund-safety concerns. They are
tracked in `issues/` in the repository and summarized honestly in the
[security model](/developers/security-model/):

- **Issue 001 — resolved.** A flagged missing JWK-registry hardening was a
  stale-checkout artifact; the hardening exists on `origin/main`.
- **Issue 002 (medium) — open.** Registered JWK keys have no on-chain validity
  expiry, so the registry is fail-open on stale keys and safety depends on the
  rotation worker running. Keep it monitored; never disable `REVOKE_REMOVED_KEYS`.
- **Issue 003 (low) — open.** The vesting contract has **no owner
  withdraw/sweep**: unclaimed or over-funded tokens are permanently locked. This
  is rug-resistant, but a real footgun for creators — see
  [costs and funding](/creators/costs-and-funding/) and
  [operational notes](/creators/operational-notes/).
- **Issue 004 (info) — open.** The verifier trusts a deployer-supplied
  `vk_hash` without recomputing it — a deploy-time integrity note, not a
  third-party exploit.

## Deployed WASM may lag source

The deployed testnet contracts may run older WASM than the current source tree
(contract fixes were merged 2026-06-12; deployed contracts stay on their original
WASM). Confirm behavior against the live interface rather than the source. See
[deployed contracts](/resources/deployed-contracts/).

## Changelog

There is no separate changelog; the Git history in the repository is the record
of changes.

<!-- TODO(verify): confirm whether a public source repository URL / changelog page should be linked here (README points at trionlabs.dev and the MIT license, not a public repo URL). -->

## Contact

Zarf is built by **Trion Labs**, a team focused on applied cryptography,
zero-knowledge systems, and protocol design.

- Website: [trionlabs.dev](https://trionlabs.dev)
- Email: [contact@trionlabs.dev](mailto:contact@trionlabs.dev)
- X: [@trionlabs](https://x.com/trionlabs)

For production implementations or collaborations, get in touch. For security
disclosures, see the [security model](/developers/security-model/).
