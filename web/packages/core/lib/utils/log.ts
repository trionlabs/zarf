/**
 * Frontend logging helpers. Thin wrappers over `console.*` that make
 * dev-only vs ships-to-prod intent explicit at the call site.
 *
 * Backstory: the three frontend apps strip `console.log` /
 * `console.info` / `console.debug` via `esbuild.pure` in vite.config.
 * That strip is invisible at the reader level. `dev()` self-documents
 * the dev-only intent, and `warn()` / `err()` give a single insertion
 * point for future telemetry (Sentry / datadog) so nothing has to be
 * grep-and-replaced when the hook lands.
 *
 * Drift gate: `scripts/check-console-allow-list.mjs` blocks direct
 * `console.*` outside this file + the listed boundary sites.
 */

/**
 * Dev-only `console.log`. No-op in production.
 *
 * Caveat — argument evaluation in production:
 *   The wrapper call still happens in prod; only the body short-circuits
 *   to a no-op. Arguments evaluate BEFORE the gate. So:
 *     GOOD: dev('user:', user.id);                  // cheap
 *     BAD:  dev('serialized:', JSON.stringify(big)); // serialized in prod
 *   `esbuild.pure` cannot strip wrapper calls with non-constant args.
 *   Direct `console.log` + esbuild.pure DOES eliminate arguments —
 *   that's the trade-off accepted for explicit-intent helper semantics.
 *
 * Caveat — Vite-only DEV gate:
 *   `import.meta.env.DEV` is defined by Vite. In non-Vite runtimes
 *   (Cloudflare Workers, Node CLI tools, backend workers in this
 *   monorepo: indexer, jwk-rotation, pin-proxy) the value is undefined
 *   → falsy → `dev()` is permanently silent even in local development.
 *   Backend code must use direct `console.log` (allow-listed) or its
 *   own runtime-appropriate gate; do NOT import `dev()` in backend
 *   workers.
 */
export function dev(...args: unknown[]): void {
    if (import.meta.env.DEV) console.log(...args);
}

/**
 * Tagged dev-only log factory. Reduces repetitive prefix typing:
 *   const log = devTag('claimStore');
 *   log('Setting epochs:', epochs.length);
 *   // → [claimStore] Setting epochs: 4
 *
 * Pattern discipline:
 *   ALWAYS bind at module top-level:
 *     const log = devTag('claimStore');     // ✓ one closure per module
 *     function setEpochs() { log('...'); }
 *   NEVER inline at the call site:
 *     function setEpochs() {
 *       devTag('claimStore')('...');         // ✗ new closure every call
 *     }
 *   Closure-per-call isn't a perf cliff but the inline form is harder
 *   to grep and easier to drift — the convention is for readability +
 *   consistency.
 *
 * Same DEV-gate + argument-evaluation caveats as `dev()` above.
 */
export function devTag(label: string) {
    return (...args: unknown[]): void => {
        if (import.meta.env.DEV) console.log(`[${label}]`, ...args);
    };
}

/**
 * Warning that ships to production. Use for unexpected-but-recoverable
 * states (stale cache, recoverable I/O failure). One thin wrapper over
 * `console.warn` so future telemetry has a single hook.
 */
export function warn(...args: unknown[]): void {
    console.warn(...args);
}

/**
 * Error that ships to production. Use for unrecoverable or
 * user-impacting conditions. Same telemetry-seam rationale as `warn()`.
 */
export function err(...args: unknown[]): void {
    console.error(...args);
}
