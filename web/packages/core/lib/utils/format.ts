/**
 * Display formatters locked to en-US.
 *
 * The UI ships in English; explicit-locale `Intl.NumberFormat` and
 * `Intl.DateTimeFormat` keep the rendered output deterministic
 * regardless of the user's browser or OS locale. Bare `.toLocaleString()`
 * / `.toLocaleDateString()` calls fall back to navigator.language and
 * render `1.234,56` on a Turkish locale where the design expects
 * `1,234.56` — these helpers close that drift.
 */

const AMOUNT_FORMATTER = new Intl.NumberFormat('en-US');

/**
 * Format a numeric amount using en-US grouping ("1,234,567").
 * Accepts number, bigint, or numeric string. Returns "—" for
 * non-finite numbers and parse failures so callers don't have to
 * spread NaN guards across every template.
 */
export function formatAmount(value: number | bigint | string): string {
    if (typeof value === 'string') {
        const parsed = Number(value);
        if (!Number.isFinite(parsed)) return '—';
        return AMOUNT_FORMATTER.format(parsed);
    }
    if (typeof value === 'number' && !Number.isFinite(value)) return '—';
    return AMOUNT_FORMATTER.format(value);
}

const DATE_FORMATTERS = {
    short: new Intl.DateTimeFormat('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
    }),
    monthDay: new Intl.DateTimeFormat('en-US', {
        month: 'short',
        day: 'numeric',
    }),
    long: new Intl.DateTimeFormat('en-US', {
        month: 'long',
        day: 'numeric',
        year: 'numeric',
    }),
};

export type DateStyle = keyof typeof DATE_FORMATTERS;

/**
 * Format a Date, ISO string, or unix-ms timestamp using en-US.
 *
 *  'short'    → "Apr 5, 2026"  (default)
 *  'monthDay' → "Apr 5"
 *  'long'     → "April 5, 2026"
 *
 * Returns "—" for null / undefined / empty / unparseable input.
 * Callers that need a custom missing-value label ("Not set",
 * "Not Started") should guard before calling.
 */
export function formatDate(
    value: Date | string | number | null | undefined,
    style: DateStyle = 'short',
): string {
    if (value === null || value === undefined || value === '') return '—';
    const date = value instanceof Date ? value : new Date(value);
    if (isNaN(date.getTime())) return '—';
    return DATE_FORMATTERS[style].format(date);
}
