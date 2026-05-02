/**
 * Token amount parsing and formatting helpers.
 */

export function parseTokenAmount(value: string | number, decimals: number): bigint {
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

export function formatTokenAmount(value: bigint, decimals: number, maxFractionDigits = 4): string {
    const divisor = 10n ** BigInt(decimals);
    const whole = value / divisor;
    const fraction = value % divisor;

    if (fraction === 0n || maxFractionDigits === 0) {
        return whole.toLocaleString();
    }

    const fractionText = fraction
        .toString()
        .padStart(decimals, '0')
        .slice(0, maxFractionDigits)
        .replace(/0+$/, '');

    return fractionText ? `${whole.toLocaleString()}.${fractionText}` : whole.toLocaleString();
}
