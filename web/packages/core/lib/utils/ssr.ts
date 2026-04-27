/**
 * SSR-safe browser check, framework-agnostic.
 *
 * Use this in code that lives in `packages/core` or `packages/ui` — anywhere
 * a SvelteKit-specific `$app/environment` import would create an unwanted
 * coupling. Inside a SvelteKit app's own files, prefer the SvelteKit one.
 */
export const browser = typeof window !== 'undefined';
