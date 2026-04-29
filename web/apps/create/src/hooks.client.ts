/**
 * Client-side hooks - runs before component code
 */

// Configure @zarf/core with this app's env vars before anything else loads.
import './lib/coreInit';

// Buffer polyfill for Barretenberg WASM
import { Buffer } from 'buffer';

if (typeof globalThis !== 'undefined') {
    (globalThis as any).Buffer = Buffer;
}

// Verify SES shim (installed in app.html, this is just a check)
import { isShimInstalled } from '@zarf/core/utils/domPreserve';

if (typeof window !== 'undefined') {
    queueMicrotask(() => {
        if (isShimInstalled()) {
            console.log('[hooks.client] SES compatibility shim active');
        }
    });
}

console.log('[hooks.client] Buffer polyfill installed');
