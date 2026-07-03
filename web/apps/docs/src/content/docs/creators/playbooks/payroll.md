---
title: "Playbook: payroll"
description: A recipe for paying a team on a schedule with Zarf's vesting engine — and an honest account of what still requires manual repetition today.
sidebar:
  order: 2
---

**Goal:** pay a team over time — for example, monthly salary or a token grant
that vests across a pay window.

This playbook orchestrates the how-to pages; follow the links for the details.
Everything here is on **testnet** ([mainnet is audit-gated](/creators/operational-notes/)).

## Be honest about what Zarf does and doesn't do

:::caution[There is no built-in recurring payroll scheduler.]
Zarf does not automatically pay a salary every month forever. What it gives you
is a **vesting engine**: a single distribution can release a total allocation
across a **fixed number of periods** (a cliff plus a vesting duration split into
periods). Employees claim each period as it unlocks. To keep paying **beyond**
the funded window, to **add or remove** people, or to **change amounts**, you
create a **new distribution** — that part is manual repetition each cycle.
:::

So think of payroll as: fund one window (say a quarter) as a period-based
vesting schedule, let employees claim each unlocked slice, then repeat the
create flow for the next window.

## When to use this

Use this shape when payments are **time-locked and recurring within a bounded
window** — monthly salary for a quarter, a vesting employee token grant, a
retention bonus that unlocks over a year.

## 1. Choose the flow

The **email (ZK) flow** at create.zarf.to fits payroll best: employees are
identified by email, they do not need a wallet before they start, and no email
or identity↔wallet link ever goes on-chain. If your team is already fully
on-chain and you prefer address whitelists, the wallet flow works too — see
[email vs wallet](/creators/email-vs-wallet/).

## 2. Prepare the recipient list

Build a CSV of `email, amount`, where each amount is the employee's **total for
the funded window** (the schedule splits it across periods). Follow
[CSV format](/creators/csv-format/) for headers, duplicates, and limits.

## 3. Design the schedule

This is the heart of a payroll setup. Use [vesting design](/creators/vesting-design/)
to choose a cliff (e.g. the first payday) and a vesting duration divided into
periods (e.g. 12 monthly periods). Confirm the granularity you pick is actually
representable before you deploy — the vesting-design page documents exactly
which parameters the contract supports.

## 4. Fund the whole window upfront

You fund the entire schedule at deploy time, not per period.

:::danger[Unclaimed funds are locked forever.]
There is no owner withdraw or sweep. If an employee leaves before claiming, or
you over-fund, that balance is **permanently locked** — you cannot claw it back.
Fund only confirmed people for a window you are comfortable committing to. See
[costs and funding](/creators/costs-and-funding/) and
[operational notes](/creators/operational-notes/).
:::

## 5. Deploy and send claim links

Deploy through the [quickstart](/creators/quickstart/) and send each employee
their claim link and PIN once. They will reuse the same link to claim each
period as it unlocks. Point them at
[claim your tokens](/recipients/claim-your-tokens/) for the first claim and
[vesting claims](/recipients/vesting-claims/) for how claiming multiple unlocked
periods works. Remind them Zarf links only live on **claim.zarf.to** and Zarf
never asks for a seed phrase ([recipient security](/recipients/security/)).

## 6. Monitor

Use [monitoring](/creators/monitoring/) to watch the balance draw down and to
check per-period claim status via the indexer. Privacy note: in the email flow
you can see which wallets claimed and how much, but **not** which employee maps
to which wallet — so reconcile against your own records, not the chain.

## 7. Continue or wind down

- **Next window:** repeat steps 2–5 with an updated CSV and a fresh schedule.
  This is deliberate — there is no auto-renewal.
- **Someone leaves mid-window:** you cannot reclaim their remaining unclaimed
  balance; it stays locked in the contract.
- **Long, quiet contracts:** a vesting contract with sparse claim activity may
  need a TTL/rent extension before ~120 days of dormancy — see
  [operational notes](/creators/operational-notes/).
