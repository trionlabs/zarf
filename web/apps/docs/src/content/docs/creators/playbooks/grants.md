---
title: "Playbook: grants & bounties"
description: A recipe for paying grantees and bounty hunters privately, whether as one-shot payouts or milestone-based releases.
sidebar:
  order: 3
---

**Goal:** pay grant recipients and bounty hunters — often a handful of people,
each with a different amount, and often without publishing who received what.

This playbook orchestrates the how-to pages; follow the links for the details.
Everything here is on **testnet** ([mainnet is audit-gated](/creators/operational-notes/)).
For where this fits among Zarf's use cases, see [use cases](/learn/use-cases/).

## Two shapes

- **Bounty payout** — a one-shot payment once work is delivered. Immediate
  unlock, individually sized amounts.
- **Milestone grant** — payment released as milestones are met.

The honest way to handle milestones is covered in
[step 3](#3-decide-how-milestones-map-to-a-schedule).

## When to use this

Use this over the [airdrop](/creators/playbooks/airdrop/) playbook when payments
are **individually negotiated** and **privacy matters** — you usually do not
want to publish a grantee's identity or amount. The email (ZK) flow keeps
identities off-chain entirely.

## 1. Choose the flow

The **email (ZK) flow** at create.zarf.to is the natural fit: grantees are
identified by email, no identity↔wallet link goes on-chain, and grantees don't
need a wallet before they start. Use the wallet flow only if your grantees are
already on-chain and you're comfortable with an address whitelist — see
[email vs wallet](/creators/email-vs-wallet/).

## 2. Prepare the recipient list

Build a CSV of `email, amount`, one row per grantee with their individual
allocation. Follow [CSV format](/creators/csv-format/) for headers, duplicate
handling, and limits.

## 3. Decide how milestones map to a schedule

- **Bounties / delivered work:** use an **immediate unlock** — the grantee can
  claim as soon as the distribution is live. See
  [vesting design](/creators/vesting-design/).
- **Time-based milestones:** if milestones fall on known dates, a cliff (or a
  period-based schedule) can gate the release to those dates.
- **Approval-based milestones:** if a milestone might not be met, do **not**
  pre-fund it in one contract — unclaimed funds cannot be reclaimed (see the
  warning below). Instead, run a **separate distribution per milestone** and
  create it only once the milestone is approved. It's more transactions, but it
  keeps you from locking funds for work that never lands.

## 4. Fund per grant — carefully

:::danger[Unclaimed funds are locked forever.]
There is no owner withdraw or sweep. If a grantee never claims, or a milestone
you pre-funded is never met, that balance is **permanently locked** in the
contract. Fund only what you can afford to lock. See
[costs and funding](/creators/costs-and-funding/) and
[operational notes](/creators/operational-notes/).
:::

This is exactly why approval-based milestones are best funded one distribution
at a time.

## 5. Deploy and notify grantees

Deploy through the [quickstart](/creators/quickstart/), then send each grantee
their claim link and PIN privately (one per person). Because you're likely
paying named individuals, keep the notification off public channels. Remind them
that Zarf links only live on **claim.zarf.to**, and Zarf never asks for a seed
phrase or private key — link [recipient security](/recipients/security/) and
[claim your tokens](/recipients/claim-your-tokens/). If your token is
non-native, they may need to add a **trustline** to receive it
([troubleshooting](/recipients/troubleshooting/)).

## 6. Monitor

Track claims from the dashboard — see [monitoring](/creators/monitoring/).
Privacy note: on-chain you can see which wallets claimed and the amounts, but
not which grantee maps to which wallet, so reconcile against your own grant
records.

## 7. Wrap up

- Give each grantee a claim deadline and remind them before it — you cannot
  reclaim unclaimed funds.
- For multi-milestone programs, close out each milestone's distribution before
  opening the next.
- For grants that stay live for months with little claim activity, note the
  TTL/rent duty in [operational notes](/creators/operational-notes/).
