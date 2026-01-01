/**
 * Vesting Logic Utility
 * Pure functions for calculating vesting schedules, end dates, and unlock events.
 */

export type DurationUnit = "minutes" | "hours" | "weeks" | "months" | "quarters" | "years";

export interface UnlockMarker {
    x: number;
    percent: number;
    tokens: number;
    date: Date | null;
    event: number;
    isGrouped: boolean;
}

/**
 * Adds months to a date correctly handling end-of-month overflows.
 * e.g. Jan 31 + 1 month -> Feb 28 (or 29)
 */
export function addMonths(date: Date, months: number): void {
    const d = date.getDate();
    date.setMonth(date.getMonth() + months);
    // If date changed (overflow), clamp to last day of previous month
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
 * Strict Unit-Based Logic: 1 Unit = 1 Event.
 * e.g. 12 Weeks = 12 Events.
 */
export function calculateUnlockEvents(
    cliffDate: Date | null,
    endDate: Date | null,
    duration: number
): number {
    if (!cliffDate || !endDate) return 0;
    if (duration === 0) return 1; // Instant

    // Strict 1:1 mapping
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

    // Instant unlock special case
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

        // Calculate Precise Date for this Event
        // Event 1 = Cliff + 1 * Unit
        // Event N = Cliff + N * Unit
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
 * If the date is in the past, returns 0.
 */
export function cliffDateToSeconds(cliffEndDate: string): bigint {
    if (!cliffEndDate) return 0n;
    const cliffMs = new Date(cliffEndDate).getTime();
    const nowMs = Date.now();
    return BigInt(Math.max(0, Math.floor((cliffMs - nowMs) / 1000)));
}

/**
 * Converts a duration unit to the period duration in seconds.
 * Used for discrete/periodic vesting where tokens unlock in complete periods.
 * 
 * @example
 * unitToPeriodSeconds("weeks") → 604800n (7 days)
 * unitToPeriodSeconds("months") → 2592000n (30 days)
 * 
 * @dev This is critical for security: ensures users can only claim complete periods.
 *      With 30-day period, at day 29 = 0 tokens claimable, at day 30 = 1 period unlocks.
 */
export function unitToPeriodSeconds(unit: DurationUnit): bigint {
    const DAY = 24n * 60n * 60n;
    switch (unit) {
        case "minutes":
            return 60n;                // 60 seconds
        case "hours":
            return 60n * 60n;          // 3,600 seconds
        case "weeks":
            return 7n * DAY;           // 604,800 seconds
        case "months":
            return 30n * DAY;          // 2,592,000 seconds
        case "quarters":
            return 90n * DAY;          // 7,776,000 seconds
        case "years":
            return 365n * DAY;         // 31,536,000 seconds
        default:
            throw new Error(`Unsupported duration unit: ${unit}`);
    }
}
