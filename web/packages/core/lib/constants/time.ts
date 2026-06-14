/**
 * Time Constants
 * Single source of truth for time-related UI labels and values.
 */

export const MONTH_NAMES = [
    'January',
    'February',
    'March',
    'April',
    'May',
    'June',
    'July',
    'August',
    'September',
    'October',
    'November',
    'December',
] as const;

export const DURATION_UNITS = [
    { value: 'minutes', label: 'Minutes' },
    { value: 'hours', label: 'Hours' },
    { value: 'days', label: 'Daily' },
    { value: 'weeks', label: 'Weekly' },
    { value: 'months', label: 'Monthly' },
    { value: 'quarters', label: 'Quarterly' },
    { value: 'years', label: 'Yearly' },
] as const;

/**
 * Sub-day units (minutes/hours) exist for testnet demos and time-gated tests —
 * watching a vest complete in real time — but are nonsensical for a production
 * distribution. They are hidden from the unit picker outside dev/testnet.
 */
export function getSelectableDurationUnits(includeSubDay: boolean) {
    return includeSubDay
        ? [...DURATION_UNITS]
        : DURATION_UNITS.filter((u) => u.value !== 'minutes' && u.value !== 'hours');
}

export const CLIFF_PRESETS = [
    { label: '+3M', months: 3 },
    { label: '+6M', months: 6 },
    { label: '+1Y', months: 12 },
] as const;

export const TIME_PRESETS = ['00:00', '06:00', '12:00', '18:00'] as const;
