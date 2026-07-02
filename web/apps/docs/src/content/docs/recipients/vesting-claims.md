---
title: Vesting claims
description: Understand cliffs, unlock periods, and partial claims when your Zarf allocation releases over time.
sidebar:
  order: 3
---

Some distributions release all at once. Others release **over time** — a little
becomes available on a set schedule. This is called *vesting*, and it is common
for team allocations, grants, and payroll. This page explains what you will see
and when you can claim.

## The two ideas: cliff and periods

- **Cliff** — a waiting period at the start during which nothing can be claimed
  yet. For example, a one-month cliff means nothing unlocks in the first month.
- **Unlock periods** — after the cliff, your allocation is released in a series
  of equal batches on fixed dates (for example, once a month).

Zarf unlocks in **whole batches on their unlock date** — it does not drip tokens
out continuously between dates. A period is either not yet unlocked, or fully
unlocked and ready to claim.

## A simple timeline

Here is a distribution with a 3-month cliff, then 12 monthly unlocks:

```
  START            CLIFF ENDS                                    END
    |------ 3 months (locked) ------|--#1--#2--#3-- … --#12--|
    Apr 1                          Jul 1  Aug Sep            Jun 1
                                     ▲
                                     Each numbered period becomes
                                     claimable once its date passes.
```

- Before **Jul 1**, nothing is claimable — you are in the cliff.
- On **Jul 1**, period #1 unlocks and you can claim it.
- Each following month, the next period unlocks. Periods you have not claimed
  yet stay available — they do not expire between unlocks.

## How much is claimable, and when

Your dashboard at `claim.zarf.to` breaks your allocation into four numbers:

- **Total Allocation** — everything set aside for you across all periods.
- **Already Claimed** — what you have already taken.
- **Total Vested** — everything that has unlocked so far (claimed or not).
- **Claimable Now** — the unlocked amount you have not claimed yet.

While the cliff is still active, the dashboard shows a countdown to the first
unlock instead of these numbers.

## Claiming period by period

Each unlocked period is claimed separately:

1. Open your dashboard and find a row marked **Ready** in the *Unlock Schedule*.
2. Select **Claim** on that row and complete the claim (connect your wallet,
   let your browser build the private proof, then sign).
3. The row switches to **Claimed**.

You can come back whenever you like. When the next period unlocks, its row turns
**Ready** and you claim it the same way. There is no penalty for claiming a few
periods at once after they have unlocked, or for waiting.

Because each period is claimed on its own, each claim is a separate transaction
with its own small network fee. If you would rather claim less often, you can
wait and claim several unlocked periods across separate transactions in one
sitting.

## Where to see it

Everything above lives on your claim dashboard — the same page you reach from
your claim link after signing in. The full step-by-step is in
[claim your tokens](/recipients/claim-your-tokens/). Each unlocked period follows
those same steps.

## If something goes wrong

- **Everything shows *Locked*** — you are still within the cliff, or the next
  unlock date has not arrived. Return after the date shown.
- **A period you expected is missing or the amount looks wrong** — check
  [troubleshooting](/recipients/troubleshooting/), then contact whoever sent you
  the distribution.
- **A claim won't go through** — see
  [troubleshooting](/recipients/troubleshooting/).
