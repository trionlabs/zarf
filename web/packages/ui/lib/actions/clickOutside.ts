/**
 * Svelte action that triggers a callback when a click occurs outside the element.
 * Used for dismissing dropdowns, modals, and other overlay components.
 *
 * @example
 * <div use:clickOutside={() => isOpen = false}>
 *   Dropdown content
 * </div>
 */
export function clickOutside(
    node: HTMLElement,
    callback: () => void
): { destroy: () => void; update: (newCallback: () => void) => void } {
    let handler = callback;

    function handleClick(event: MouseEvent) {
        const target = event.target as Node;
        // Check if click is outside the node
        if (node && !node.contains(target) && !event.defaultPrevented) {
            handler();
        }
    }

    function handleKeydown(event: KeyboardEvent) {
        if (event.key === "Escape") {
            handler();
        }
    }

    // Use capture phase to handle clicks before they bubble
    // Small delay to avoid catching the click that opened the dropdown
    setTimeout(() => {
        document.addEventListener("click", handleClick, true);
        document.addEventListener("keydown", handleKeydown, true);
    }, 0);

    return {
        update(newCallback: () => void) {
            handler = newCallback;
        },
        destroy() {
            document.removeEventListener("click", handleClick, true);
            document.removeEventListener("keydown", handleKeydown, true);
        },
    };
}
