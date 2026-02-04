import type { VestingSchedule, DurationUnit, UnlockMarker } from "../types";

// Re-export for convenience
export type { DurationUnit };

export type PeriodStatus = "claimed" | "claimable" | "locked";

export type VestingPeriod = {
    index: number;
    unlockDate: Date;
    amount: bigint;
    status: PeriodStatus;
    cumulativeAmount: bigint;
};

/**
 * Adds months to a date correctly handling end-of-month overflows.
 */
export function addMonths(date: Date, months: number): void {
    const d = date.getDate();
    date.setMonth(date.getMonth() + months);
    if (date.getDate() !== d) {
        date.setDate(0);
    }
}

/**
 * Calculates the exact end date based on cliff start, duration, and unit.
 */
export function calculateEndDate(
    cliffDate: Date | null,
    duration: number,
    durationUnit: DurationUnit
): Date | null {
    if (!cliffDate) return null;
    if (duration <= 0) return new Date(cliffDate);

    const d = new Date(cliffDate);
    switch (durationUnit) {
        case "minutes":
            d.setMinutes(d.getMinutes() + duration);
            break;
        case "hours":
            d.setHours(d.getHours() + duration);
            break;
        case "weeks":
            d.setDate(d.getDate() + duration * 7);
            break;
        case "months":
            addMonths(d, duration);
            break;
        case "quarters":
            addMonths(d, duration * 3);
            break;
        case "years":
            d.setFullYear(d.getFullYear() + duration);
            break;
    }
    return d;
}

/**
 * Calculates the total number of unlock events.
 */
export function calculateUnlockEvents(
    cliffDate: Date | null,
    endDate: Date | null,
    duration: number
): number {
    if (!cliffDate || !endDate) return 0;
    if (duration === 0) return 1;
    return Math.max(Math.round(duration), 1);
}

/**
 * Generates the list of unlock markers for visualization.
 */
export function generateUnlockMarkers(
    cliffDate: Date | null,
    endDate: Date | null,
    unlockEvents: number,
    durationUnit: DurationUnit,
    totalTokens: number,
    lockPeriodPercent: number,
    maxBars: number = 24
): UnlockMarker[] {
    if (!cliffDate || !endDate) return [];

    if (cliffDate.getTime() === endDate.getTime() || unlockEvents <= 0) {
        return [{
            x: 100,
            percent: 100,
            tokens: totalTokens,
            date: cliffDate,
            event: 1,
            isGrouped: false,
        }];
    }

    const markers: UnlockMarker[] = [];
    const groupSize = unlockEvents > maxBars ? Math.ceil(unlockEvents / maxBars) : 1;
    const displayBars = Math.ceil(unlockEvents / groupSize);
    const vestingWidth = 100 - lockPeriodPercent;

    for (let i = 1; i <= displayBars; i++) {
        const eventNum = i * groupSize;
        const actualEvent = Math.min(eventNum, unlockEvents);
        const percentCompletion = actualEvent / unlockEvents;

        let unlockDate = new Date(cliffDate.getTime());

        switch (durationUnit) {
            case "minutes":
                unlockDate.setMinutes(unlockDate.getMinutes() + actualEvent);
                break;
            case "hours":
                unlockDate.setHours(unlockDate.getHours() + actualEvent);
                break;
            case "weeks":
                unlockDate.setDate(unlockDate.getDate() + actualEvent * 7);
                break;
            case "months":
                addMonths(unlockDate, actualEvent);
                break;
            case "quarters":
                addMonths(unlockDate, actualEvent * 3);
                break;
            case "years":
                unlockDate.setFullYear(unlockDate.getFullYear() + actualEvent);
                break;
        }

        const x = lockPeriodPercent + (vestingWidth * percentCompletion);

        markers.push({
            x,
            percent: Math.round(percentCompletion * 100),
            tokens: Math.round(percentCompletion * totalTokens),
            date: unlockDate,
            event: actualEvent,
            isGrouped: groupSize > 1,
        });
    }
    return markers;
}

/**
 * Converts duration and unit to total seconds for smart contract compatibility.
 */
export function durationToSeconds(duration: number, unit: DurationUnit): bigint {
    const DAY = 24n * 60n * 60n;
    switch (unit) {
        case "minutes":
            return BigInt(duration) * 60n;
        case "hours":
            return BigInt(duration) * 60n * 60n;
        case "weeks":
            return BigInt(duration) * 7n * DAY;
        case "months":
            return BigInt(duration) * 30n * DAY;
        case "quarters":
            return BigInt(duration) * 90n * DAY;
        case "years":
            return BigInt(duration) * 365n * DAY;
    }
}

/**
 * Calculates the cliff duration in seconds relative to current time.
 * @param cliffEndDate Date string in YYYY-MM-DD format
 * @param cliffTime Optional time string in HH:MM format (UTC). Defaults to "00:00"
 */
export function cliffDateToSeconds(cliffEndDate: string, cliffTime: string = "00:00"): bigint {
    if (!cliffEndDate) return 0n;
    // Combine date and time into ISO format for proper UTC parsing
    const isoString = `${cliffEndDate}T${cliffTime}:00Z`;
    const cliffMs = new Date(isoString).getTime();
    const nowMs = Date.now();
    return BigInt(Math.max(0, Math.floor((cliffMs - nowMs) / 1000)));
}

/**
 * Converts a duration unit to the period duration in seconds.
 */
export function unitToPeriodSeconds(unit: DurationUnit): bigint {
    const DAY = 24n * 60n * 60n;
    switch (unit) {
        case "minutes":
            return 60n;
        case "hours":
            return 60n * 60n;
        case "weeks":
            return 7n * DAY;
        case "months":
            return 30n * DAY;
        case "quarters":
            return 90n * DAY;
        case "years":
            return 365n * DAY;
        default:
            throw new Error(`Unsupported duration unit: ${unit}`);
    }
}

/**
 * Calculates the full schedule of vesting periods based on contract parameters.
 * @param schedule The vesting schedule parameters (start, duration, cliff, etc.)
 * @param totalAllocation The total amount of tokens allocated
 * @param claimedEpochs An array of booleans or objects indicating if a specific epoch index is claimed
 * @returns Array of VestingPeriod objects
 */
export function calculateVestingPeriods(
    schedule: VestingSchedule | null,
    totalAllocation: bigint,
    claimedEpochs: Record<number, boolean> = {}
): VestingPeriod[] {
    if (!schedule || totalAllocation === 0n) {
        return [];
    }

    const result: VestingPeriod[] = [];
    const now = Date.now() / 1000;

    // Avoid division by zero if period is 0 (should act as single unlock)
    const periodDuration = schedule.vestingPeriod === 0 ? schedule.vestingDuration : schedule.vestingPeriod;

    // Calculate total number of unlocks
    // If vestingPeriod is 0, it means linear streaming or single unlock at end? 
    // Assuming standard discrete vesting steps:
    const totalPeriods = Number(schedule.vestingPeriod) > 0
        ? Math.floor(Number(schedule.vestingDuration) / Number(schedule.vestingPeriod))
        : 1;

    const amountPerPeriod = totalAllocation / BigInt(totalPeriods);

    for (let i = 0; i < totalPeriods; i++) {
        // Unlock time = Start + Cliff + ((i + 1) * PeriodLength)
        // Usually cliff is part of the duration, but in some contracts cliff is a delay.
        // Based on typical solidity: start + cliff + duration.
        // Let's match the logic previously used in the UI:
        // unlockTimestamp = info.vestingStart + info.cliffDuration + (i + 1) * info.vestingPeriod;

        const unlockTimestamp =
            Number(schedule.vestingStart) +
            Number(schedule.cliffDuration) +
            (i + 1) * Number(schedule.vestingPeriod);

        const unlockDate = new Date(unlockTimestamp * 1000);

        let status: PeriodStatus;
        const isPast = now >= unlockTimestamp;

        if (isPast) {
            // Check if this specific epoch index is marked as claimed
            if (claimedEpochs[i]) {
                status = "claimed";
            } else {
                status = "claimable";
            }
        } else {
            status = "locked";
        }

        result.push({
            index: i + 1,
            unlockDate,
            amount: amountPerPeriod,
            status,
            cumulativeAmount: amountPerPeriod * BigInt(i + 1),
        });
    }

    return result;
}