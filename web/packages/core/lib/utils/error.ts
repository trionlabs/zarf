/**
 * Coerce an unknown caught value into a human-readable message.
 *
 * Pairs with `catch (e: unknown)` so consumers can keep the `e.message ||
 * 'fallback'` pattern without resorting to `: any` or hand-rolling the
 * `instanceof Error` narrow at every catch site.
 *
 * Choosing between this and `sanitizeBlockchainError` in
 * `@zarf/ui/utils/errorSanitizer`:
 *
 *   - `toMessage(e)` — use when you just need a message string for
 *     logging, internal display, or substring inspection. Generic, no
 *     UX opinions.
 *   - `sanitizeBlockchainError(e, opts)` — use when the error comes
 *     from a wallet or contract call and you want UX-tailored copy
 *     (rejection, insufficient funds, network errors, RPC rate limits)
 *     mapped from cryptic provider messages. App-specific narrowing
 *     lives in the `customRules` option.
 *
 * The two complement each other; they are NOT interchangeable. The
 * Phase 6.1 commit body that introduced this helper called it a "single
 * source of truth" — that framing was wrong and is corrected here:
 * `toMessage` does NOT replace `sanitizeBlockchainError` or the three
 * local `sanitizeError` wrappers that bind app-specific rules.
 */
export function toMessage(e: unknown, fallback = 'Unknown error'): string {
    if (e instanceof Error) return e.message || fallback;
    if (typeof e === 'string') return e || fallback;
    if (e && typeof e === 'object' && 'message' in e) {
        const m = (e as { message: unknown }).message;
        if (typeof m === 'string' && m.length > 0) return m;
    }
    return fallback;
}
