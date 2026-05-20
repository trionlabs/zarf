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
 * existing dialog node, so it composes with ZenModal, ClaimModal,
 * WalletSelectionModal and the distributions slide-over without
 * forcing a wrapper component.
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

        if (event.shiftKey && (active === first || !node.contains(active))) {
            event.preventDefault();
            last.focus();
        } else if (!event.shiftKey && (active === last || !node.contains(active))) {
            event.preventDefault();
            first.focus();
        }
    }

    function focusInitial() {
        const explicit = resolveTarget(opts.initialFocus);
        const target = explicit ?? getFocusables()[0] ?? node;
        target.focus();
    }

    node.addEventListener('keydown', handleKeydown);
    // Defer to give Svelte a microtask to settle any conditional children.
    queueMicrotask(focusInitial);

    return {
        update(newOptions: FocusTrapOptions) {
            opts = newOptions;
        },
        destroy() {
            node.removeEventListener('keydown', handleKeydown);
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
