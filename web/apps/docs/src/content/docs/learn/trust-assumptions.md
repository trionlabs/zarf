---
title: Trust assumptions
description: An honest map of what you must trust to use Zarf, what you don't have to trust, and the mitigations in place — including the pre-audit, testnet-only caveats.
sidebar:
  order: 3
---

Every system has a trust model. Most projects hide theirs. This page lays out
Zarf's plainly — what you're relying on, what you're *not*, and where the honest
gaps are today. It's written for anyone deciding whether to use or evaluate
Zarf, including reviewers and investors.

The short version: **Zarf's servers cannot move your funds or forge a claim** —
that's enforced on-chain. The things you do have to trust are Google's signing
keys, the availability of the pinned distribution data, and (until an audit) that
the deployed contracts match their reviewed source.

## What you don't have to trust

These are guaranteed by the on-chain contracts, not by Trion Labs:

- **Zarf can't take your funds.** Deposited tokens leave a distribution contract
  only through a *valid claim* that a proof has been verified on-chain. There is
  no Zarf-controlled path to withdraw or redirect them. An internal review of the
  contracts found no unprivileged fund-theft or double-claim path.
- **Proofs are verified on-chain, not by a server.** A claim is accepted only if
  the on-chain UltraHonk verifier and JWK Registry both approve it. A Zarf server
  can't wave a bad claim through.
- **Zarf can't see or reconstruct your identity.** Your email never leaves your
  browser, and the wallet↔email link is never published. See the
  [privacy model](/learn/privacy-model/).
- **A stolen proof can't be replayed.** Each proof is cryptographically bound to
  the wallet claiming at that moment, and each allocation can only be claimed
  once (the double-claim marker lives in persistent contract storage).

## What you must trust

| You trust… | Why it matters | Mitigation in place |
|---|---|---|
| **Google's signing keys** | The whole email proof is anchored in a Google-signed login token. If Google's keys were compromised, an attacker could forge eligible logins. | Google's public keys are the industry-standard OAuth anchor; Zarf mirrors their hashes on-chain (see below). |
| **The JWK rotation pipeline** | Google rotates its signing keys (roughly every two weeks). A scheduled worker keeps the on-chain JWK Registry in sync. | Keys are held on-chain with two-step ownership and an activation delay; the worker registers new keys and revokes removed ones. But it can **fail open** — see the honest gap below. |
| **IPFS pinning availability** | The recipient list and schedule are pinned to IPFS. If that data disappears, claim apps may not be able to load the distribution. | Read through pin-proxy is served from multiple gateways and the bytes are re-verified against their content hash (CID). |
| **Deployed code matches source (pre-audit)** | There is no third-party audit yet, and deployed testnet contracts may run slightly older bytecode than the current source (see below). | Contracts are open source and internally reviewed; mainnet is gated on an external audit. |

## Mitigations, in a little more detail

- **On-chain JWK Registry.** Rather than trusting a Zarf server to tell the
  contract which Google keys are genuine, the trusted key hashes live on-chain.
  Ownership uses a two-step propose/accept handover, and new keys carry an
  activation delay before they become usable. See
  [JWK rotation](/developers/jwk-rotation/).
- **CID re-verification.** When the pin-proxy serves distribution data fetched
  from a public IPFS gateway, it re-hashes the bytes and checks them against the
  requested content identifier before passing them on — so a malicious gateway
  can't swap the content. See [IPFS and metadata](/developers/ipfs-and-metadata/).
- **Deterministic, immutable contracts.** A distribution's dependencies (its
  verifier, JWK Registry, and token) are fixed at deploy time and can't be
  swapped afterward.

## The honest gaps

These are real, known limitations. We track them openly.

- **No third-party audit yet.** Zarf is **testnet only**, and mainnet is
  deliberately gated on an external security audit. Do not treat the current
  contracts as production-hardened.
- **Deployed contracts may lag the source.** Some contract fixes are present in
  the source but the deployed testnet contracts may still run older bytecode. See
  [deployed contracts](/resources/deployed-contracts/).
- **Key validity can fail open.** The registry marks a key valid indefinitely
  until the rotation worker revokes it. If that worker stalls, a Google key that
  was rotated out could stay accepted longer than it should. This makes the
  rotation worker's liveness security-critical.
- **Unclaimed email-distribution funds stay locked.** The vesting contract used by
  email (ZK) distributions has no owner withdraw or sweep, so tokens that
  recipients never claim remain locked in the contract with no recovery path.
  Creators should read [costs and funding](/creators/costs-and-funding/) before
  funding.

## Go deeper

For the full threat model, actor/asset analysis, and a status line on every known
issue, see the developer [security model](/developers/security-model/).
