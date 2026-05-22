// SSR boundary: keep this barrel free of @stellar/stellar-sdk-laden modules.
// Eager-graph consumers (root layouts, authStore, claim/landing app entries)
// import from here; pulling in ./address would drag StrKey + buffer polyfill
// into Vite's SSR module runner and reproduce the regression fixed in cf69e01.
// Use the deep-path import @zarf/core/utils/address (or /addressShape for the
// SDK-free shape mirror) at consumer sites that need contract validation.

export * from './date';
export * from './email';
export * from './error';
export * from './format';
export * from './json';
export * from './log';
export * from './vesting';
export * from './domPreserve';
