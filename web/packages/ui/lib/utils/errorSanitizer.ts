/**
 * Convert a wallet / contract error into a user-friendly message.
 *
 * One source of truth — the three previous copies (in factoryDeploy.ts,
 * ClaimStep5Submit.svelte, walletStore.svelte.ts) had drifted in both
 * coverage and wording, so users hit different copy depending on which
 * code path ran.
 *
 * Built-in rules cover the common cases (user rejection, insufficient
 * funds/balance/allowance, RPC rate limit, network errors). Caller-specific
 * rules (e.g. contract revert names like `AlreadyClaimed`) are passed in
 * via `customRules` and tried FIRST so they win when they overlap.
 */

export interface ErrorRule {
    /** Substring (case-sensitive) or regex. If the error message matches, `message` is returned. */
    match: string | RegExp;
    /** User-facing replacement message. */
    message: string;
}

export interface SanitizeErrorOptions {
    /** Caller-specific rules; tried before built-ins. */
    customRules?: ErrorRule[];
    /** Fallback when nothing matches. Default: 'An unexpected error occurred'. */
    fallback?: string;
}

const BUILTIN_RULES: ErrorRule[] = [
    // User rejection must come first.
    { match: /reject|denied/i, message: 'Request rejected. Please try again when ready.' },

    // Funds / balance / allowance
    { match: 'insufficient funds', message: 'Insufficient funds to cover gas fees.' },
    { match: 'insufficient balance', message: 'Insufficient token balance.' },
    { match: 'insufficient allowance', message: 'Insufficient token approval. Please approve more tokens.' },

    // RPC / rate limit
    { match: /rate limit|too many|resource not available|resourceunavailable/i,
      message: 'RPC rate limited. Please try again in a moment.' },

    // Network
    { match: /network|disconnected/i, message: 'Network error. Please check your connection and try again.' },
];

export function sanitizeBlockchainError(
    err: unknown,
    options: SanitizeErrorOptions = {},
): string {
    const { customRules = [], fallback = 'An unexpected error occurred' } = options;

    const e = err as { message?: string; code?: number; toString?: () => string } | null;
    const message = (e?.message || (typeof e?.toString === 'function' ? e.toString() : '') || '').toString();
    const normalizedMessage = message.toLowerCase();
    const code = e?.code;

    // Some wallets surface "request already pending" as code -32002 with no useful message.
    if (code === -32002) {
        return 'A wallet request is already pending. Check your wallet and try again.';
    }

    const matches = (rule: ErrorRule) =>
        typeof rule.match === 'string'
            ? normalizedMessage.includes(rule.match.toLowerCase())
            : rule.match.test(message);

    for (const rule of customRules) if (matches(rule)) return rule.message;
    for (const rule of BUILTIN_RULES) if (matches(rule)) return rule.message;

    if (import.meta.env.DEV) {
        console.error('[sanitizeBlockchainError] unmatched:', err);
        return message || fallback;
    }
    return fallback;
}
