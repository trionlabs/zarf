/**
 * Pure-TS helpers for the claim flow.
 *
 * Separated out of `apps/claim/src/lib/stores/claimStore.svelte.ts` so the
 * amount math, cliff math, and epoch-selection logic can be unit-tested
 * without a SvelteKit runtime. The store is a thin Svelte adapter that
 * delegates to these.
 *
 * @module domain/claimFlow
 */

import type { DistributionData } from '../services/distribution';
import type { VestingPeriod } from '../utils/vesting';

/**
 * Subset of the claim store's `EpochClaim` that the pure helpers actually
 * need. Defined locally to avoid pulling app types into core.
 */
export interface EpochAmount {
    amount: bigint;
    unlockTime: number;
    isClaimed: boolean;
    isLocked: boolean;
}

export interface EpochSelectable extends EpochAmount {
    canClaim?: boolean;
}

// ──────────────────────────────────────────────────────────────────────────
// Amount totals
// ──────────────────────────────────────────────────────────────────────────

const sumIf = <T>(xs: ReadonlyArray<T>, pred: (x: T) => boolean, get: (x: T) => bigint): bigint =>
    xs.reduce((acc, x) => (pred(x) ? acc + get(x) : acc), 0n);

export function totalAllocation(epochs: ReadonlyArray<EpochAmount>): bigint {
    return sumIf(
        epochs,
        () => true,
        (e) => e.amount,
    );
}

export function claimedAmount(epochs: ReadonlyArray<EpochAmount>): bigint {
    return sumIf(
        epochs,
        (e) => e.isClaimed,
        (e) => e.amount,
    );
}

/** Unlocked = anything not currently locked, regardless of whether claimed yet. */
export function unlockedAmount(epochs: ReadonlyArray<EpochAmount>): bigint {
    return sumIf(
        epochs,
        (e) => !e.isLocked,
        (e) => e.amount,
    );
}

/** Claimable = unlocked AND not yet claimed. */
export function claimableAmount(epochs: ReadonlyArray<EpochAmount>): bigint {
    return sumIf(
        epochs,
        (e) => !e.isLocked && !e.isClaimed,
        (e) => e.amount,
    );
}

// ──────────────────────────────────────────────────────────────────────────
// Cliff math
// ──────────────────────────────────────────────────────────────────────────

export type Schedule = DistributionData['schedule'];

/**
 * Has the cliff passed?
 * Returns `null` when the schedule is unknown — encoding "don't know" as
 * `true` (the previous default) lets UI render a CTA momentarily before
 * data loads. Callers must handle the null case.
 */
export function isCliffPassed(
    schedule: Schedule | null | undefined,
    nowMs: number = Date.now(),
): boolean | null {
    if (!schedule) return null;
    const cliffMs = (Number(schedule.vestingStart) + Number(schedule.cliffDuration)) * 1000;
    return nowMs >= cliffMs;
}

export function cliffEndDate(schedule: Schedule | null | undefined): Date | null {
    if (!schedule) return null;
    return new Date((Number(schedule.vestingStart) + Number(schedule.cliffDuration)) * 1000);
}

// ──────────────────────────────────────────────────────────────────────────
// Epoch selection
// ──────────────────────────────────────────────────────────────────────────

/**
 * Find the index of the first epoch that's claimable: not locked AND not
 * yet claimed. Returns `null` if nothing qualifies.
 */
export function findNextClaimableIdx(epochs: ReadonlyArray<EpochSelectable>): number | null {
    const idx = epochs.findIndex((e) => !e.isLocked && !e.isClaimed);
    return idx === -1 ? null : idx;
}

// ──────────────────────────────────────────────────────────────────────────
// Periods derivation
// ──────────────────────────────────────────────────────────────────────────

/**
 * Build the vesting-periods table from the discovered claim epochs. The
 * commitments are authoritative for claim count, amount, unlock time, and
 * the claimed/locked status; nothing is derived from schedule metadata.
 *
 * Ordering contract: epochs arrive in hash-chain discovery order (epoch 0,
 * 1, 2, …), which the claim-list builder constructs with monotonically
 * increasing unlock times — so the table is chronological by construction.
 * `index` is 1-based for display; consumers map back to the epochs array
 * with `index - 1`.
 */
export function buildVestingPeriods(epochs: ReadonlyArray<EpochAmount>): VestingPeriod[] {
    let cumulativeAmount = 0n;

    return epochs.map((epoch, i) => {
        cumulativeAmount += epoch.amount;

        return {
            index: i + 1,
            unlockDate: new Date(epoch.unlockTime * 1000),
            amount: epoch.amount,
            status: epoch.isClaimed ? 'claimed' : epoch.isLocked ? 'locked' : 'claimable',
            cumulativeAmount,
        };
    });
}
