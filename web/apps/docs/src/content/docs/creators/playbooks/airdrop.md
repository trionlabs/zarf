---
title: "Playbook: community airdrop"
description: An end-to-end recipe for distributing tokens to a community, using either the email or the wallet flow.
sidebar:
  order: 1
---

**Goal:** get tokens into the hands of a community — supporters, early users, a
whitelist — with the least friction for them.

This playbook is thin on purpose: it orchestrates the how-to pages rather than
repeating them. Each step links to the page with the details.

Everything here is on **testnet**. Mainnet is
[audit-gated](/creators/operational-notes/).

## When to use this

An airdrop is the right shape when the reward is **one-shot**: recipients should
be able to claim their full allocation right away, with no cliff or long vesting
tail. If you need time-locked or milestone-based releases, see the
[payroll](/creators/playbooks/payroll/) or [grants](/creators/playbooks/grants/)
playbooks instead.

## 1. Choose the flow

- **You have a list of emails** → use the **email (ZK) flow** at
  create.zarf.to. Recipients claim by signing in with Google; no email ever
  touches the chain, and recipients do not need a wallet before they start.
- **You already have on-chain wallet addresses** → use the **wallet airdrop**
  at airdrop.zarf.to. Classic address whitelist, no Google, no PIN.

Not sure? The [email vs wallet](/creators/email-vs-wallet/) comparison walks
through the trade-offs.

## 2. Prepare the recipient list

Build a CSV of `recipient, amount` — emails for the email flow, Stellar
addresses for the wallet flow. Amounts can differ per recipient or be uniform.
The exact accepted format, header handling, duplicate rules, and size limits are
in [CSV format](/creators/csv-format/). Validate it in the app before you
deploy; fixing a list after funding is not possible.

## 3. Set the schedule to immediate

For a straightforward airdrop, choose an **immediate unlock** — no cliff, no
vesting period — so recipients can claim as soon as the distribution is live.
See [vesting design](/creators/vesting-design/) if you want a short lock instead.

## 4. Fund it — and size it carefully

Fund the distribution with the sum of all allocations. Read
[costs and funding](/creators/costs-and-funding/) first, because of one
hard rule:

:::danger[Unclaimed funds are locked forever.]
There is no owner withdraw or sweep. Anything recipients never claim, and any
amount you over-fund, is **permanently locked** in the contract. Fund only what
you can afford to lock. See [operational notes](/creators/operational-notes/).
:::

## 5. Deploy

Follow the [quickstart](/creators/quickstart/) to upload the CSV, pick the
token, confirm the schedule, review costs, and sign the deploy-and-fund
transaction. For the email flow, this is also where you download
`secrets.csv` — each recipient's email and PIN — to send out with the claim
link, which points at your deployed distribution.

## 6. Announce and send claim links

- **Email flow:** send each recipient their claim link and PIN. Tell them the
  link will only ever be on **claim.zarf.to**, and that Zarf will **never** ask
  for a seed phrase or private key — point them at
  [recipient security](/recipients/security/).
- **Wallet flow:** publish the airdrop's claim link on your official channels.
  The claim link lives on **airdrop.zarf.to**.
- Either way, remind recipients they claim with their own wallet and pay a small
  network fee, and that receiving a non-native token may require adding a
  **trustline**. Link them to
  [claim your tokens](/recipients/claim-your-tokens/) (email) or
  [claim with wallet](/recipients/claim-with-wallet/) and
  [troubleshooting](/recipients/troubleshooting/).

## 7. Monitor

Track claim progress from the dashboard: watch the remaining balance fall and
count `claimed` events. [Monitoring](/creators/monitoring/) covers what you can
and cannot see — in the email flow you can see which wallets claimed, but not
which email maps to which wallet.

## 8. Wrap up

- Give recipients a clear deadline, and send a reminder before it — you cannot
  reclaim unclaimed funds later.
- A distribution stays "Active" until its balance reaches zero; a residual
  balance from non-claimers simply stays locked.
- If this airdrop should stay live for months with little activity, note the
  TTL/rent duty in [operational notes](/creators/operational-notes/).
