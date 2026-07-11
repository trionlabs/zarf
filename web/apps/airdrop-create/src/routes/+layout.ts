// Side-effect import: runs configureCore() before any module touches
// @zarf/core's chain/config code. Must be the first import here.
import '$lib/coreInit';

// Marker export so SvelteKit picks this layout module up unambiguously.
export {};
