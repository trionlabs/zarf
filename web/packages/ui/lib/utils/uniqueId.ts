/**
 * Generate a stable id for ARIA wiring (aria-labelledby, aria-controls,
 * aria-describedby, etc.). Counter is module-scoped so ids increase
 * monotonically across one render pass.
 *
 * The counter resets per Node process so server-side ids stay
 * deterministic within a single SSR render. Hydration mismatches on
 * ARIA attribute values are non-fatal in browsers (unlike text-node
 * mismatches), so a small client/server drift is acceptable here —
 * we just need uniqueness within the page.
 *
 * @example
 * const titleId = uniqueId('dialog-title');
 * <h2 id={titleId}>…</h2>
 * <div role="dialog" aria-labelledby={titleId}>…</div>
 */
let counter = 0;

export function uniqueId(prefix = 'zen'): string {
    counter += 1;
    return `${prefix}-${counter}`;
}
