---
title: Operational notes & limitations
description: The honest constraints of running a Zarf distribution today — testnet status, locked unclaimed funds, contract rent, and the Google key dependency.
sidebar:
  order: 7
---

Before you run a real distribution, read this page in full. It collects the
constraints that are easy to miss and that you, as the creator, are responsible
for. None of these are hidden — they come straight from the contract source and
the project's internal issue tracker.

## Testnet only, on purpose

Zarf runs on **Stellar testnet only** today. There is **no mainnet
deployment**, and mainnet launch is deliberately **gated on a third-party
audit** — it is a gate, not a delay. Treat everything you deploy as a test
distribution using test XLM and test tokens. For the current picture, see
[project status](/resources/project-status/) and the
[deployed contracts](/resources/deployed-contracts/) list.

## Unclaimed funds cannot be withdrawn

:::danger[There is no owner sweep, refund, or recovery.]
The vesting contract has **no** `withdraw`, `sweep`, `refund`, or `recover`
entrypoint. Tokens can leave a vesting contract **only** through a valid
recipient `claim`. Anything a recipient never claims — and anything you
over-fund — stays **permanently locked** in the contract, with no path back to
you.
:::

This is tracked internally as issue 003 and summarized in the
[security model](/developers/security-model/). It is rug-resistant, which is a
feature, but it means funding is a one-way door. Practical consequences and
advice:

- **Fund only what you can afford to lock.** Deposit an amount you are
  comfortable never seeing again if recipients do not all claim.
- **Match the funded total to the sum of allocations.** There is no on-chain
  check that your deposit covers the total claimable across the recipient list.
  Over-funding locks the surplus; under-funding turns claims into
  first-come-first-served until the balance runs out, after which later valid
  claimants fail with a token-transfer/insufficient-balance error.
- **Set expectations with recipients.** Because you cannot reclaim, give
  recipients a clear claim window and remind non-claimers by email (you cannot
  identify them on-chain — see [monitoring](/creators/monitoring/)).

See [costs and funding](/creators/costs-and-funding/) for how to compute the
right deposit.

## Keeping your contract alive (rent / TTL)

Soroban charges rent: contract state has a time-to-live (TTL) and is archived
if the TTL lapses. Zarf's contracts manage this for you as long as they are
being used:

- Each vesting contract targets a TTL of about **120 days** (safely under the
  network's ~180-day maximum entry TTL).
- **Every state-changing call re-extends the TTL** — creation, deposit, setting
  the Merkle root, ownership transfer, and, importantly, **every successful
  claim**. A distribution that sees regular claims keeps itself alive with no
  action from you. A claimed epoch's guard entry is also extended when it is
  claimed.

The duty falls on you only in one case: a **fully dormant** distribution — one
that receives no claims or other calls for roughly 120 days. Before that window
lapses, it needs an external TTL extension (an `ExtendFootprintTTLOp`, e.g. via
the Stellar CLI) or its state will be archived. Archived *persistent* entries
(such as claim guards) restore automatically on next access, but if the
contract's own instance/code entries lapse the contract is unavailable until
restored.

:::note[Deployed WASM may lag the source]
The contract TTL-extension logic and a factory storage-footprint fix were
merged on 2026-06-12. The vesting and factory contracts already live on testnet
may still run the older WASM. This page describes the current source behavior;
if you are auditing a specific deployed contract, verify its behavior against
the WASM it actually runs. See [deployed contracts](/resources/deployed-contracts/).
:::

## The Google key (JWK) dependency

Email (ZK) claims prove ownership of an email using a Google-signed token. The
vesting contract checks that the Google signing key behind each proof is
trusted, by calling the on-chain **JWK Registry**. That registry is kept in
sync with Google by the `jwk-rotation` worker, which polls Google's public keys
on a schedule (**every 6 hours**) and registers new keys / revokes removed ones.

Two things follow from this that matter to you:

- **Liveness.** Google rotates its signing keys periodically. If a recipient's
  Google token is signed by a brand-new key that the rotation worker has not yet
  registered, that recipient's claim will fail until the next sync brings the
  key on-chain. If you see claims failing broadly right after a key rotation,
  this is the likely cause — it usually clears within the polling interval.
- **Fail-open on stale keys (issue 002).** Registered keys currently have no
  on-chain expiry: a key stays valid until the rotation worker explicitly
  revokes it. Safety therefore depends on that off-chain job staying healthy.
  This is a defense-in-depth concern documented in the
  [security model](/developers/security-model/) and the
  [JWK rotation](/developers/jwk-rotation/) reference.

On testnet this shared infrastructure is operated by Trion Labs. Wallet
airdrops do not use Google or the JWK Registry at all, so they are unaffected by
key rotation.

## Known limitations at a glance

These are the open items from the internal contract review. Full write-ups,
with severity and status, live in the [security model](/developers/security-model/).

| Item | What it means for you | Severity |
|---|---|---|
| No owner withdraw/sweep (003) | Unclaimed and over-funded tokens are locked forever. | Fund-safety / UX |
| JWK validity has no on-chain expiry (002) | Trust in claims depends on the rotation worker staying live. | Defense-in-depth |
| Verifier trusts the deployer-supplied verification-key hash (004) | A deploy-time integrity note; not exploitable by recipients. | Info |

## Your lifecycle checklist

- [ ] Confirm you are on **testnet** and using test funds only.
- [ ] Fund with an amount you can afford to lock — match it to the sum of
      allocations, no more.
- [ ] Communicate a clear claim window to recipients; you cannot reclaim
      unclaimed funds.
- [ ] For long-running distributions with little claim activity, plan to extend
      the contract's TTL before ~120 days of dormancy.
- [ ] Watch progress via [monitoring](/creators/monitoring/); nudge
      non-claimers by email, not on-chain.
- [ ] For a repeatable recipe end to end, use the
      [playbooks](/creators/playbooks/airdrop/).
