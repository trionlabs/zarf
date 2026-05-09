// Side-effect import: runs configureCore() before any other module touches
// @zarf/core's chain/discovery code. Must be the first import in this file.
import '$lib/coreInit';

// Marker export so SvelteKit picks this layout module up unambiguously.
export {};

// Claim is a browser-only wallet/OAuth/proof flow; Cloudflare SSR currently
// trips over nested Svelte snippets before hydration can take over.
export const ssr = false;
