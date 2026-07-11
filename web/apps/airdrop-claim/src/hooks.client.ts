/**
 * Client-side hooks - runs before component code
 */

// Configure @zarf/core with this app's env vars before anything else loads.
// The +layout.ts side-effect import alone is NOT enough on the client:
// SvelteKit imports route nodes in parallel, so a page module's dependency
// (e.g. networkStore's module-scope getActiveStellarNetworkId()) can evaluate
// before +layout.ts, killing hydration with "configureCore was not called".
// hooks.client.ts is statically imported by the generated client app and is
// guaranteed to evaluate first.
import './lib/coreInit';
