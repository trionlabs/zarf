---
title: Vesting design
description: Design a vesting schedule that matches what the contract actually enforces.
sidebar:
  order: 4
---

Zarf distributions vest in **discrete periods**, not as a continuous stream.
This page explains the parameters the contract really supports so you design a
schedule that behaves the way you expect.

## The parameters

You set the schedule on the create wizard's **Schedule** step with three inputs:

- **Distribution Pool** — the total amount to hand out.
- **Lock Period** — a calendar date (and time) when the first tokens unlock.
- **Vesting Rules** — a **number of periods** and a **period unit**
  (Minutes, Hours, Weekly, Monthly, Quarterly, or Yearly).

The number you enter is the **count of unlock periods**, not a span of time. If
you enter `12` with unit **Monthly**, you get **12 monthly unlocks** — twelve
separate epochs, each releasing its share.

## How it unlocks

- The pool is split **evenly across the periods**. Any indivisible remainder (in
  base units) is added one unit at a time to the **earliest** periods, so the
  full total is always accounted for.
- **Period 1 unlocks at your lock date.** Each later period unlocks one
  period-length after the one before it.
- Periods are **fixed length**: a "month" is **30 days**, a "quarter" **90
  days**, a "year" **365 days** — they are *not* calendar months. Plan around
  the day count, not the calendar.
- Nothing streams between unlocks: a recipient must reach a period's unlock time
  to claim that period. On-chain, claiming before then is rejected with an
  `EpochLocked` error.

Each period is a separate claim. A recipient on a multi-period schedule claims
**once per period** as each one unlocks — but they keep a **single PIN** for the
whole schedule (the per-period secrets are derived from it). See
[Vesting claims](/recipients/vesting-claims/) for the recipient's view.

:::note[The schedule lives in the Merkle tree, not in a stored schedule]
Zarf bakes each period's unlock time into the Merkle leaves at creation, and the
contract enforces those times when recipients claim. There is no separate
"schedule" object you can edit after deployment — to change a schedule you'd
create a new distribution.
:::

The unlock times the contract enforces come **only** from the Merkle leaves: the
merkle generator derives them from the lock **date at 00:00 UTC** (`period 1 =
00:00 UTC on the lock date`, later periods one fixed period-length apart). The
wizard's time-of-day field is **not** baked into the leaves, so it does not
change when a period actually unlocks on-chain.

<!-- verified 2026-07-02: processWhitelist uses new Date(cliffEndDate) (00:00 UTC) and ignores cliffTime; create_and_fund_vesting stores no schedule, so the leaf unlock_time is the only value the claim's EpochLocked check reads -->

## Worked examples

### 1. One-shot handout

Everyone gets their full amount at a single moment.

- **Lock date:** today (or the launch date).
- **Vesting duration:** `1` period.

```
 lock date
    │
    ▼
  100%  ── all tokens unlock at once
```

<!-- TODO(verify): the wizard also offers a "0" duration labelled "unlock instantly after lock period", but the Merkle generator divides the pool by the period count, so a single period (duration = 1) is the reliable way to express a one-shot unlock -->

### 2. One-year cliff, then quarterly for three years

A classic contributor schedule: nothing for a year, then equal quarterly
releases.

- **Lock date:** one year out (use the `+1Y` preset).
- **Vesting duration:** `12` periods, unit **Quarterly** (12 × 90 days ≈ 3
  years).

```
        cliff = lock date (+1 year)
             │
   locked    │  ▲    ▲    ▲    ▲   …   ▲     12 quarterly unlocks
─────────────┼──┼────┼────┼────┼── … ──┼───►  (~90 days apart)
             0  1    2    3    4       12
                └ each period ≈ 8.33% of the pool; 100% by period 12
```

The first 8.33% unlocks at the one-year cliff; the rest follow every ~90 days.

### 3. Monthly payroll

Twelve equal monthly payments.

- **Lock date:** the first payout date.
- **Vesting duration:** `12` periods, unit **Monthly** (each period = 30 days).

```
 pay 1   pay 2   pay 3            pay 12
   │       │       │       …        │
   ▼       ▼       ▼                ▼
 1/12    1/12    1/12             1/12     (~30 days apart)
```

Because "monthly" here means every 30 days, twelve periods span ~360 days, not a
calendar year. If exact calendar dates matter, account for the drift or use a
shorter series. See the [payroll playbook](/creators/playbooks/payroll/) for the
end-to-end recipe (including the manual repetition today's tooling requires).

## Practical guidance

- **Keep period counts modest.** Each recipient × each period is a separate
  leaf, and the on-chain batch view over a recipient's periods is capped at 64
  entries — schedules with dozens of periods work, but hundreds are impractical.
- **Front-loaded remainders** mean early periods can be one base unit larger than
  later ones; this is expected and keeps the total exact.
- **Long gaps need attention.** If a contract sits idle longer than its
  storage TTL (~120 days) between claims, its state can be archived and must be
  restored before the next claim — see the TTL duty in
  [Operational notes](/creators/operational-notes/).
- **Unclaimed periods stay locked.** There's no owner sweep, so tokens for
  periods a recipient never claims remain in the contract permanently. Read
  [Costs and funding](/creators/costs-and-funding/) before locking a long
  schedule.
