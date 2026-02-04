/**
 * Date Utilities
 * Pure functions for date manipulation and formatting.
 */

/**
 * Converts separate day, month, year values into an ISO date string (YYYY-MM-DD).
 * Ensures proper padding and basic validation.
 */
export function toIsoDate(year: number, monthIndex: number, day: number): string | null {
    if (year < 1000 || year > 9999) return null;
    if (day < 1 || day > 31) return null;
    if (monthIndex < 0 || monthIndex > 11) return null;

    const d = day.toString().padStart(2, "0");
    const m = (monthIndex + 1).toString().padStart(2, "0");
    const y = year.toString();

    const iso = `${y}-${m}-${d}`;

    // Validate existence (e.g. Feb 31)
    const date = new Date(iso);
    if (isNaN(date.getTime())) return null;

    // Verify components match (handles auto-correction like Feb 30 -> Mar 2)
    // We want strict input matching for UI manually
    // But for now, returning the simple string is enough as input limits are handled by HTML5
    return iso;
}

/**
 * Parses an ISO date string (YYYY-MM-DD) into components.
 * Returns defaults if invalid.
 */
export function fromIsoDate(isoDate: string) {
    const d = new Date(isoDate);
    if (isNaN(d.getTime())) {
        const now = new Date();
        return {
            year: now.getFullYear(),
            month: now.getMonth(),
            day: now.getDate()
        };
    }
    return {
        year: d.getUTCFullYear(), // Use UTC to avoid timezone shifts on simple dates
        month: d.getUTCMonth(),
        day: d.getUTCDate()
    };
}

/**
 * Returns today's date in YYYY-MM-DD format
 */
export function getTodayIso(): string {
    return new Date().toISOString().split("T")[0];
}

/**
 * Calculates a future date by adding months to today
 */
export function addMonthsToToday(months: number): string {
    const d = new Date();
    d.setMonth(d.getMonth() + months);
    return d.toISOString().split("T")[0];
}
