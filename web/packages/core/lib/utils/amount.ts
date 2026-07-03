/**
 * Token amount parsing and formatting helpers.
 */

import { validateTokenDecimals } from './tokenDecimals';

export function parseTokenAmount(value: string | number, decimals: number): bigint {
    validateTokenDecimals(decimals);
    const input = String(value).trim();
    if (!/^\d+(\.\d+)?$/.test(input)) {
        throw new Error(`Invalid token amount: ${input}`);
    }

    const [whole, fraction = ''] = input.split('.');
    if (fraction.length > decimals) {
        throw new Error(`Amount has more than ${decimals} decimal places`);
    }

    const paddedFraction = fraction.padEnd(decimals, '0');
    return BigInt(whole) * 10n ** BigInt(decimals) + BigInt(paddedFraction || '0');
}

/** Soroban i128 ceiling (2^127 - 1) — the maximum representable amount. */
const I128_MAX = (1n << 127n) - 1n;

/**
 * True if `value` is a positive decimal-string amount — the grammar
 * `parseTokenAmount` accepts (no exponent, no IEEE-754 rounding), excluding
 * zero. Decimals-agnostic; use for early grid/CSV validation before the token's
 * decimals are known. Amounts MUST be carried as strings end-to-end so a value
 * above 2^53 base units is not silently rounded before it reaches the leaf.
 */
export function isPositiveAmountString(value: string): boolean {
    const v = value.trim();
    return /^\d+(\.\d+)?$/.test(v) && !/^0*(\.0*)?$/.test(v);
}

/**
 * True if `value` is a valid positive token amount for `decimals`: a positive
 * decimal string within the token's decimal places whose base-unit value fits a
 * Soroban i128. Non-throwing wrapper over `parseTokenAmount` for UI validation
 * before any transaction.
 */
export function isValidTokenAmount(value: string, decimals: number): boolean {
    try {
        const base = parseTokenAmount(value, decimals);
        return base > 0n && base <= I128_MAX;
    } catch {
        return false;
    }
}

export function formatTokenAmount(value: bigint, decimals: number, maxFractionDigits = 4): string {
    validateTokenDecimals(decimals);
    const divisor = 10n ** BigInt(decimals);
    const whole = value / divisor;
    const fraction = value % divisor;

    if (fraction === 0n || maxFractionDigits === 0) {
        return whole.toLocaleString('en-US');
    }

    const fractionText = fraction
        .toString()
        .padStart(decimals, '0')
        .slice(0, maxFractionDigits)
        .replace(/0+$/, '');

    return fractionText
        ? `${whole.toLocaleString('en-US')}.${fractionText}`
        : whole.toLocaleString('en-US');
}
