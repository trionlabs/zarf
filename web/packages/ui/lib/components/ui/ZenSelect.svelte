<script lang="ts">
    import { clickOutside } from "@zarf/ui/actions/clickOutside";
    import ChevronDown from "lucide-svelte/icons/chevron-down";
    import Check from "lucide-svelte/icons/check";

    type OptionValue = string | number;

    interface Option {
        readonly value: OptionValue;
        readonly label: string;
    }

    interface Props {
        value?: OptionValue;
        options: readonly Option[] | Option[];
        size?: "sm" | "md" | "lg" | "xl";
        variant?: "default" | "ghost";
        placeholder?: string;
        disabled?: boolean;
        class?: string;
        "aria-label"?: string;
        onchange?: (value: OptionValue) => void;
    }

    let {
        value = $bindable(),
        options,
        size = "md",
        variant = "default",
        placeholder = "Select...",
        disabled = false,
        class: className = "",
        "aria-label": ariaLabel,
        onchange,
    }: Props = $props();

    // --- Local State ---
    let isOpen = $state(false);
    let highlightedIndex = $state(0);
    let triggerRef = $state<HTMLButtonElement | null>(null);

    // --- Derived ---
    const selectedOption = $derived(options.find((o) => o.value === value));
    const selectedLabel = $derived(selectedOption?.label ?? placeholder);

    /**
     * SIZE CONFIGURATION
     * xl variant matches the large display text in date/duration pickers
     */
    const sizeClasses = {
        sm: "text-sm h-8 px-2 gap-1",
        md: "text-base h-10 px-3 gap-2",
        lg: "text-xl h-12 px-4 gap-2",
        xl: "!text-4xl h-auto px-1 py-0 gap-2 font-medium tracking-tighter leading-none",
    } as const;

    const dropdownSizes = {
        sm: "text-sm py-1",
        md: "text-base py-1.5",
        lg: "text-lg py-2",
        xl: "text-xl py-2",
    } as const;

    const optionSizes = {
        sm: "px-2 py-1.5 text-sm",
        md: "px-3 py-2 text-base",
        lg: "px-4 py-2.5 text-lg",
        xl: "px-4 py-3 text-xl",
    } as const;

    const chevronSizes = {
        sm: "w-3 h-3",
        md: "w-4 h-4",
        lg: "w-5 h-5",
        xl: "w-5 h-5",
    } as const;

    /**
     * VARIANT CONFIGURATION
     */
    const variantClasses = {
        default: `
            bg-[oklch(from_var(--zen-bg)_l_c_h_/_0.5)]
            border-[0.5px] border-zen-border
            rounded-[var(--zen-radius-input)]
            hover:border-zen-border-strong
        `,
        ghost: `
            bg-transparent border-none
            hover:bg-zen-fg/5
            rounded-lg
        `,
    } as const;

    const baseClasses = `
        inline-flex items-center justify-between
        text-zen-fg transition-all duration-200
        disabled:opacity-50 disabled:cursor-not-allowed
        focus:outline-none cursor-pointer
    `;

    // --- Actions ---
    function toggle() {
        if (disabled) return;
        isOpen = !isOpen;
        if (isOpen) {
            // Set highlighted index to current selection
            const currentIndex = options.findIndex((o) => o.value === value);
            highlightedIndex = currentIndex >= 0 ? currentIndex : 0;
        }
    }

    function close() {
        isOpen = false;
    }

    function selectOption(index: number) {
        const option = options[index];
        if (option) {
            value = option.value;
            onchange?.(option.value);
        }
        close();
        triggerRef?.focus();
    }

    function handleKeydown(e: KeyboardEvent) {
        if (!isOpen) {
            if (e.key === "Enter" || e.key === " " || e.key === "ArrowDown") {
                e.preventDefault();
                toggle();
            }
            return;
        }

        switch (e.key) {
            case "ArrowDown":
                e.preventDefault();
                highlightedIndex = (highlightedIndex + 1) % options.length;
                break;
            case "ArrowUp":
                e.preventDefault();
                highlightedIndex =
                    (highlightedIndex - 1 + options.length) % options.length;
                break;
            case "Enter":
            case " ":
                e.preventDefault();
                selectOption(highlightedIndex);
                break;
            case "Escape":
                e.preventDefault();
                close();
                triggerRef?.focus();
                break;
            case "Tab":
                close();
                break;
        }
    }
</script>

<div class="relative inline-block {className}" use:clickOutside={close}>
    <!-- Trigger Button -->
    <button
        bind:this={triggerRef}
        type="button"
        class="{baseClasses} {sizeClasses[size]} {variantClasses[variant]}"
        onclick={toggle}
        onkeydown={handleKeydown}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-label={ariaLabel}
        {disabled}
    >
        <span class:text-zen-fg-muted={!selectedOption}>
            {selectedLabel}
        </span>
        <ChevronDown
            class="{chevronSizes[
                size
            ]} text-zen-fg-muted transition-transform duration-200 shrink-0"
            style="transform: rotate({isOpen ? 180 : 0}deg);"
        />
    </button>

    <!-- Dropdown Panel -->
    {#if isOpen}
        <div
            class="absolute z-50 mt-1 min-w-full w-max max-h-60 overflow-auto
                   bg-zen-bg border border-zen-border
                   rounded-xl shadow-lg {dropdownSizes[size]}"
            role="listbox"
            tabindex="-1"
            aria-activedescendant={options[highlightedIndex]
                ? `option-${highlightedIndex}`
                : undefined}
        >
            {#each options as option, i}
                <button
                    id="option-{i}"
                    type="button"
                    role="option"
                    aria-selected={value === option.value}
                    class="w-full flex items-center justify-between {optionSizes[
                        size
                    ]}
                           text-left transition-colors cursor-pointer
                           {i === highlightedIndex
                        ? 'bg-zen-fg/10 text-zen-fg'
                        : 'text-zen-fg-muted hover:bg-zen-fg/5 hover:text-zen-fg'}
                           {value === option.value ? 'font-medium' : ''}"
                    onclick={() => selectOption(i)}
                    onmouseenter={() => (highlightedIndex = i)}
                >
                    <span>{option.label}</span>
                    {#if value === option.value}
                        <Check class="w-4 h-4 text-zen-primary" />
                    {/if}
                </button>
            {/each}
        </div>
    {/if}
</div>
