/**
 * Generate a unique id for ARIA wiring (aria-labelledby, aria-controls,
 * aria-describedby, etc.) on the client.
 *
 * NOT SSR-safe: the counter is module-global and increments on every call,
 * so the same component rendered on server and client will not produce
 * matching ids on a second render pass, and concurrent SSR renders share
 * the same counter. Use this helper only:
 *   - inside `{#if browser}` / `{#if conditionThatRunsClientOnly}` blocks, or
 *   - in components whose entire markup is client-conditional (e.g. modal
 *     bodies behind `{#if isOpen}` where `isOpen` is false during SSR).
 *
 * A proper SSR-safe id strategy (Svelte 5 `$props.id()` or a per-render
 * context counter) is tracked as Phase 3 a11y completeness work.
 *
 * Prefix sanitization: HTML id attributes accept arbitrary strings but
 * ARIA references break on whitespace, so we strip whitespace from the
 * caller-supplied prefix and substitute a safe fallback if the result is
 * empty. The token suffix is always numeric.
 *
 * @example
 * const titleId = uniqueId('dialog-title');
 * <h2 id={titleId}>…</h2>
 * <div role="dialog" aria-labelledby={titleId}>…</div>
 */
let counter = 0;

export function uniqueId(prefix = 'zen'): string {
    counter += 1;
    const safePrefix = prefix.replace(/\s+/g, '-') || 'zen';
    return `${safePrefix}-${counter}`;
}
