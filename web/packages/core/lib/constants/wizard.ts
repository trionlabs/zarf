/**
 * Wizard Constants
 * Single source of truth for wizard-related UI configuration.
 */

export const CREATION_STEPS = [
    { id: 0, label: "Identity", shortLabel: "1" },
    { id: 1, label: "Schedule", shortLabel: "2" },
    { id: 2, label: "Recipients", shortLabel: "3" },
] as const;

export const PERCENTAGE_PRESETS = [1, 3, 5, 10, 20] as const;
