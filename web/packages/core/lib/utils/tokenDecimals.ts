/**
 * Validate a Soroban token's `decimals` metadata.
 *
 * Stellar classic assets are fixed at 7 decimals. Soroban's reference
 * token implementation caps at 18 decimals (matching the EVM ERC-20
 * de facto standard). A token contract returning a value outside this
 * range is either malicious or buggy; rejecting it before downstream
 * math (`10n ** BigInt(decimals)`) avoids both a runtime throw on
 * negative inputs and silently-wrong amounts on absurdly large ones.
 *
 * @throws {Error} If `decimals` is not a finite integer in `[0, 18]`.
 */
export function validateTokenDecimals(decimals: number): void {
    if (typeof decimals !== 'number' || !Number.isFinite(decimals) || !Number.isInteger(decimals)) {
        throw new Error(`Token decimals must be an integer (got: ${String(decimals)})`);
    }
    if (decimals < 0 || decimals > 18) {
        throw new Error(`Token decimals ${decimals} is outside the supported range [0, 18]`);
    }
}
