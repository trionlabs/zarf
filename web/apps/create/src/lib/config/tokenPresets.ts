/**
 * Back-compat shim. The token data now lives in `tokenRegistry.ts` (the
 * source of truth, which also powers the token picker's search). The
 * quick-launch chips on step-0 still import `getTokenPresets` / `TokenPreset`
 * from here.
 */

export { getTokenPresets, type TokenPreset } from './tokenRegistry';
