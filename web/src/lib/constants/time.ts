/**
 * Time Constants
 * Single source of truth for time-related UI labels and values.
 */

export const MONTH_NAMES = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December"
] as const;

export const DURATION_UNITS = [
    { value: "weeks", label: "Weekly" },
    { value: "months", label: "Monthly" },
    { value: "quarters", label: "Quarterly" },
    { value: "years", label: "Yearly" }
] as const;

export const CLIFF_PRESETS = [
    { label: "+3M", months: 3 },
    { label: "+6M", months: 6 },
    { label: "+1Y", months: 12 }
] as const;

export const TIME_PRESETS = ["00:00", "06:00", "12:00", "18:00"] as const;
