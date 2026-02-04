/**
 * DOM Intrinsics Compatibility Layer for SES/Svelte 5
 *
 * MetaMask and WalletConnect use SES (Secure EcmaScript) which freezes
 * JavaScript intrinsics. Svelte 5 relies on Object.getOwnPropertyDescriptor
 * to get DOM getters like nextSibling, firstChild, etc.
 *
 * The primary defense is in app.html which patches Object.getOwnPropertyDescriptor
 * BEFORE any modules load. This module provides runtime utilities and detection.
 *
 * @module utils/domPreserve
 */

const isBrowser = typeof window !== 'undefined' && typeof document !== 'undefined';

/**
 * Detect if SES lockdown has occurred
 */
export function detectSESLockdown(): boolean {
    if (!isBrowser) return false;

    const signals = [
        Object.isFrozen(Object.prototype),
        Object.isFrozen(Array.prototype),
        Object.isFrozen(Function.prototype),
        typeof (globalThis as any).lockdown === 'function',
        typeof (globalThis as any).Compartment === 'function',
    ];

    return signals.some(s => s);
}

/**
 * Check if our app.html shim is installed
 */
export function isShimInstalled(): boolean {
    if (!isBrowser) return false;

    // The shim patches Object.getOwnPropertyDescriptor
    // We can detect it by checking if it returns a descriptor for a locked-down property
    try {
        const desc = Object.getOwnPropertyDescriptor(Node.prototype, 'nextSibling');
        return desc !== undefined && typeof desc.get === 'function';
    } catch {
        return false;
    }
}

/**
 * Install the SES compatibility shim at runtime (fallback if app.html missed)
 * This is a backup - the app.html version runs earlier and is preferred.
 */
export function installSESShim(): void {
    if (!isBrowser) return;

    // Check if already installed
    if ((globalThis as any).__SES_SHIM_INSTALLED__) return;

    const originalGOPD = Object.getOwnPropertyDescriptor;
    const domProps = [
        'nextSibling', 'previousSibling', 'firstChild', 'lastChild',
        'childNodes', 'parentNode', 'parentElement', 'textContent',
        'nextElementSibling', 'previousElementSibling',
        'firstElementChild', 'lastElementChild', 'children'
    ];

    Object.getOwnPropertyDescriptor = function(obj: any, prop: PropertyKey): PropertyDescriptor | undefined {
        const desc = originalGOPD(obj, prop);

        // If it's a DOM prototype and the property is a known DOM traversal property
        if (
            (obj === Node.prototype || obj === Element.prototype) &&
            typeof prop === 'string' &&
            domProps.includes(prop)
        ) {
            // If SES removed the getter, return a synthetic one
            if (!desc || !desc.get) {
                return {
                    configurable: true,
                    enumerable: true,
                    get: function(this: any) { return this[prop]; }
                };
            }
        }

        return desc;
    };

    (globalThis as any).__SES_SHIM_INSTALLED__ = true;
    console.log('[DOM Preserve] SES compatibility shim installed');
}

/**
 * Restore native DOM refs - no longer needed with shim approach
 * @deprecated Use installSESShim instead
 */
export function restoreNativeDOMRefs(): boolean {
    // With the shim approach, we don't need to restore refs
    // The shim handles it transparently
    if (!isShimInstalled()) {
        installSESShim();
        return true;
    }
    return false;
}

// Auto-verify shim on module load
if (isBrowser) {
    queueMicrotask(() => {
        if (!isShimInstalled()) {
            console.warn('[DOM Preserve] app.html shim not detected, installing runtime fallback');
            installSESShim();
        } else {
            console.log('[DOM Preserve] SES compatibility shim verified');
        }
    });
}
