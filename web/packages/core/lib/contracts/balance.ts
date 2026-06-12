/**
 * XLM amount math — pure and string-based so it is EXACT for any balance.
 *
 * Floating point loses precision above ~9e9 XLM (Number.MAX_SAFE_INTEGER /
 * 1e7), so a money app must never route balances through `Number`. Everything
 * here works on the decimal string and bigint stroops, and is fully unit-tested.
 *
 * 1 XLM = 10,000,000 stroops. Stellar's base reserve is 0.5 XLM; an account's
 * minimum (reserved, non-spendable) balance is
 *   (2 + subentries + sponsoring − sponsored) × base reserve.
 */

export const STROOPS_PER_XLM = 10_000_000n;
export const BASE_RESERVE_STROOPS = 5_000_000n; // 0.5 XLM

/**
 * Parse a Horizon decimal-XLM string (e.g. "10000.0000000") to exact stroops.
 * Returns 0n for empty/garbage input. Fractions beyond 7 digits are truncated
 * (Horizon never emits more, but be defensive).
 */
export function xlmToStroops(decimal: string): bigint {
    const trimmed = (decimal ?? '').trim();
    if (!trimmed) return 0n;
    const negative = trimmed.startsWith('-');
    const unsigned = negative ? trimmed.slice(1) : trimmed;
    const [whole = '', fraction = ''] = unsigned.split('.');
    const wholeDigits = whole.replace(/\D/g, '') || '0';
    const fracDigits = (fraction.replace(/\D/g, '') + '0000000').slice(0, 7);
    const stroops = BigInt(wholeDigits) * STROOPS_PER_XLM + BigInt(fracDigits);
    return negative ? -stroops : stroops;
}

/**
 * Format stroops as a human XLM string, TRUNCATED (never rounded up — never
 * overstate a balance) to `decimals` places. A non-zero amount that truncates
 * to all-zero is shown as "< 0.00…1" so dust never reads as exactly zero.
 */
export function formatXlmAmount(stroops: bigint, decimals = 4): string {
    const negative = stroops < 0n;
    const abs = negative ? -stroops : stroops;
    const whole = abs / STROOPS_PER_XLM;
    const fraction = abs % STROOPS_PER_XLM;
    const fracStr = fraction.toString().padStart(7, '0').slice(0, decimals);

    if (abs > 0n && whole === 0n && !/[1-9]/.test(fracStr)) {
        return `< 0.${'0'.repeat(Math.max(decimals - 1, 0))}1`;
    }
    const sign = negative ? '-' : '';
    return decimals > 0 ? `${sign}${whole}.${fracStr}` : `${sign}${whole}`;
}

/** Minimum reserved (non-spendable) balance in stroops for a subentry profile. */
export function computeReserveStroops(
    subentryCount: number,
    numSponsoring = 0,
    numSponsored = 0,
): bigint {
    const slots = 2 + subentryCount + numSponsoring - numSponsored;
    return slots > 0 ? BigInt(slots) * BASE_RESERVE_STROOPS : 0n;
}
