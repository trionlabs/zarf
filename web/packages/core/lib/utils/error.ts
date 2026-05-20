/**
 * Coerce an unknown caught value into a human-readable message.
 *
 * Pairs with `catch (e: unknown)` so consumers can keep the `e.message ||
 * 'fallback'` pattern without resorting to `: any` or hand-rolling the
 * `instanceof Error` narrow at every catch site.
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
