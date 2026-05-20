/**
 * Svelte action that traps focus inside a dialog-like element.
 *
 * On mount: captures the previously focused element, moves focus inside.
 * On Tab / Shift+Tab: cycles focus among focusable descendants.
 * On Escape: invokes `onEscape` (caller decides whether to close).
 * On destroy: returns focus to the previously focused element (or
 * a caller-supplied `returnFocus` target).
 *
 * The action does not render or own any markup — it operates on the
 * existing dialog node, so it composes with any dialog-shaped element
 * without forcing a wrapper component.
 *
 * @example
 * <div role="dialog" use:focusTrap={{ onEscape: () => isOpen = false }}>
 *   <button>Action</button>
 *   <button>Cancel</button>
 * </div>
 */
export interface FocusTrapOptions {
    /** Element (or getter) to focus on mount. Defaults to first tabbable child. */
    initialFocus?: HTMLElement | (() => HTMLElement | null) | null;
    /** Element (or getter) to focus on destroy. Defaults to whatever had focus before mount. */
    returnFocus?: HTMLElement | (() => HTMLElement | null) | null;
    /** Called when Escape is pressed while focus is inside the trap. */
    onEscape?: () => void;
    /** Temporarily disable Tab cycling without removing the action. Default true. */
    enabled?: boolean;
    /**
     * When true, mark every DOM sibling on the ancestor chain (up to <body>)
     * as `inert` for the lifetime of the trap. This blocks pointer + keyboard
     * interaction *and* hides the background from assistive tech, matching
     * the WAI-ARIA modal semantics. Default false (opt-in) to avoid changing
     * existing callers' behavior.
     */
    hideBackground?: boolean;
}

const FOCUSABLE_SELECTOR = [
    'a[href]',
    'button:not([disabled])',
    'input:not([disabled]):not([type="hidden"])',
    'select:not([disabled])',
    'textarea:not([disabled])',
    '[tabindex]:not([tabindex="-1"])',
    '[contenteditable="true"]',
].join(',');

function resolveTarget(
    value: FocusTrapOptions['initialFocus'] | FocusTrapOptions['returnFocus'],
): HTMLElement | null {
    if (typeof value === 'function') return value();
    return value ?? null;
}

export function focusTrap(
    node: HTMLElement,
    options: FocusTrapOptions = {},
): { destroy: () => void; update: (newOptions: FocusTrapOptions) => void } {
    let opts = options;
    const previouslyFocused = (document.activeElement as HTMLElement | null) ?? null;

    function getFocusables(): HTMLElement[] {
        return Array.from(node.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
            // offsetParent === null catches display:none subtrees; it does not
            // catch visibility:hidden or opacity:0 but those are rare in our
            // dialogs and the cost of a perfect check (checkVisibility) is not
            // worth the browser-support hit at this stage.
            (el) => el.offsetParent !== null,
        );
    }

    function handleKeydown(event: KeyboardEvent) {
        if (opts.enabled === false) return;

        if (event.key === 'Escape') {
            opts.onEscape?.();
            return;
        }

        if (event.key !== 'Tab') return;

        const focusables = getFocusables();
        if (focusables.length === 0) {
            event.preventDefault();
            return;
        }

        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        const active = document.activeElement as HTMLElement | null;

        // `active === node` covers the case where initial focus landed on the
        // trap root itself (tabindex="-1" on the dialog element). Without it,
        // node.contains(node) === true → Shift+Tab leaks focus to the element
        // before the trap in DOM order on the very first reverse-tab.
        const atRoot = active === node;

        if (event.shiftKey && (atRoot || active === first || !node.contains(active))) {
            event.preventDefault();
            last.focus();
        } else if (!event.shiftKey && (atRoot || active === last || !node.contains(active))) {
            event.preventDefault();
            first.focus();
        }
    }

    function isFocusable(el: HTMLElement | null): el is HTMLElement {
        return (
            !!el &&
            el.isConnected &&
            !(el as HTMLButtonElement | HTMLInputElement).disabled
        );
    }

    function focusInitial() {
        const explicit = resolveTarget(opts.initialFocus);
        // Validate explicit targets: a closure may resolve to a detached or
        // disabled node (e.g., late bind:this on a button that hasn't mounted
        // yet). Fall through to the first focusable child, then to the trap
        // root, rather than calling .focus() on garbage.
        const target = isFocusable(explicit) ? explicit : getFocusables()[0] ?? node;
        target.focus();
    }

    // Walk up node's ancestor chain and mark every non-chain sibling `inert`.
    // We stop at <html> (parentElement of <body> === documentElement) so that
    // body-level siblings (e.g., toast containers, app shells) are processed
    // but <head> and <body> themselves are not touched. Returning a restore
    // list lets destroy() put the world back the way it found it.
    const inertHistory: { el: HTMLElement; original: boolean }[] = [];
    function applyBackgroundInert() {
        let current: HTMLElement = node;
        while (current.parentElement && current.parentElement !== document.documentElement) {
            const parent = current.parentElement;
            for (const sibling of Array.from(parent.children)) {
                if (sibling === current) continue;
                if (!(sibling instanceof HTMLElement)) continue;
                if (sibling.tagName === 'SCRIPT' || sibling.tagName === 'STYLE' || sibling.tagName === 'LINK') continue;
                inertHistory.push({ el: sibling, original: sibling.inert });
                sibling.inert = true;
            }
            current = parent;
        }
    }
    function restoreBackgroundInert() {
        for (const { el, original } of inertHistory) {
            el.inert = original;
        }
        inertHistory.length = 0;
    }

    node.addEventListener('keydown', handleKeydown);
    if (opts.hideBackground) applyBackgroundInert();
    // Defer to give Svelte a microtask to settle any conditional children.
    queueMicrotask(focusInitial);

    return {
        update(newOptions: FocusTrapOptions) {
            opts = newOptions;
        },
        destroy() {
            node.removeEventListener('keydown', handleKeydown);
            restoreBackgroundInert();
            const explicit = resolveTarget(opts.returnFocus);
            const target =
                explicit ??
                (previouslyFocused && document.contains(previouslyFocused)
                    ? previouslyFocused
                    : null);
            target?.focus();
        },
    };
}
