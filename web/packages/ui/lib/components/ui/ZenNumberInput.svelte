<script lang="ts">
    import type { HTMLInputAttributes } from "svelte/elements";

    interface Props extends Omit<HTMLInputAttributes, "type" | "size"> {
        value?: number;
        min?: number;
        max?: number;
        step?: number;
        size?: "sm" | "md" | "lg" | "xl";
        variant?: "default" | "ghost";
        showStepper?: boolean;
        suffix?: string;
        align?: "left" | "center" | "right";
    }

    let {
        value = $bindable(),
        min,
        max,
        step = 1,
        size = "md",
        variant = "default",
        showStepper = false,
        suffix,
        align = "left",
        class: className = "",
        disabled,
        ...rest
    }: Props = $props();

    /**
     * SIZE CONFIGURATION
     * Matches ZenButton scale with xl for display numbers
     */
    const sizeClasses = {
        sm: "text-sm h-8 px-2",
        md: "text-base h-10 px-3",
        lg: "text-xl h-12 px-4",
        xl: "!text-4xl h-auto p-0 font-medium tracking-tighter leading-none",
    } as const;

    const stepperSizes = {
        sm: "w-6 h-6 text-xs",
        md: "w-8 h-8 text-sm",
        lg: "w-10 h-10 text-base",
        xl: "w-10 h-10 text-lg",
    } as const;

    const suffixSizes = {
        sm: "text-xs",
        md: "text-sm",
        lg: "text-base",
        xl: "text-lg font-medium",
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
            focus:border-[oklch(from_var(--zen-primary)_l_c_h_/_0.5)]
            w-full
        `,
        ghost: `
            bg-transparent border-none
            hover:bg-zen-fg/5
            rounded-lg
        `,
    } as const;

    const alignClasses = {
        left: "text-left",
        center: "text-center",
        right: "text-right",
    } as const;

    const baseClasses = `
        transition-all duration-200
        text-zen-fg placeholder:text-zen-fg/20
        disabled:opacity-50 disabled:cursor-not-allowed
        focus:outline-none bg-transparent
        [appearance:textfield]
        [&::-webkit-outer-spin-button]:appearance-none
        [&::-webkit-inner-spin-button]:appearance-none
    `;

    // --- Derived ---
    const isInlineMode = $derived(
        size === "xl" && variant === "ghost" && !showStepper,
    );

    // --- Actions ---
    function increment() {
        if (disabled) return;
        const current = value ?? 0;
        const newValue = current + step;
        if (max === undefined || newValue <= max) {
            value = newValue;
        }
    }

    function decrement() {
        if (disabled) return;
        const current = value ?? 0;
        const newValue = current - step;
        if (min === undefined || newValue >= min) {
            value = newValue;
        }
    }

    function handleKeydown(e: KeyboardEvent) {
        if (e.key === "ArrowUp") {
            e.preventDefault();
            increment();
        } else if (e.key === "ArrowDown") {
            e.preventDefault();
            decrement();
        }
    }

    function handleInput(e: Event) {
        const target = e.currentTarget as HTMLInputElement;
        const parsed = parseFloat(target.value);
        if (!isNaN(parsed)) {
            value = parsed;
        } else if (target.value === "") {
            value = undefined;
        }
    }
</script>

<!--
    For xl ghost variant without stepper, render minimal inline structure
    matching the original date picker inputs
-->
{#if isInlineMode}
    <input
        type="text"
        inputmode="numeric"
        pattern="[0-9]*"
        value={value ?? ""}
        oninput={handleInput}
        onkeydown={handleKeydown}
        {min}
        {max}
        {disabled}
        class="{baseClasses} {sizeClasses[size]} {variantClasses[
            variant
        ]} {alignClasses[align]} {className}"
        {...rest}
    />
{:else}
    <div
        class="inline-flex items-center gap-2"
        class:w-full={variant === "default"}
    >
        {#if showStepper}
            <button
                type="button"
                class="flex items-center justify-center rounded-full bg-zen-fg/5 hover:bg-zen-fg/10 text-zen-fg-muted hover:text-zen-fg transition-all disabled:opacity-50 disabled:cursor-not-allowed {stepperSizes[
                    size
                ]}"
                onclick={decrement}
                {disabled}
                aria-label="Decrease value"
            >
                <svg
                    class="w-4 h-4"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                >
                    <path
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        stroke-width="2"
                        d="M20 12H4"
                    />
                </svg>
            </button>
        {/if}

        <div
            class="relative inline-flex items-center"
            class:flex-1={variant === "default"}
        >
            <input
                type="text"
                inputmode="numeric"
                pattern="[0-9]*"
                value={value ?? ""}
                oninput={handleInput}
                onkeydown={handleKeydown}
                {min}
                {max}
                {disabled}
                class="{baseClasses} {sizeClasses[size]} {variantClasses[
                    variant
                ]} {alignClasses[align]} {className}"
                {...rest}
            />
            {#if suffix}
                <span
                    class="pointer-events-none text-zen-fg/50 {suffixSizes[
                        size
                    ]}"
                    class:absolute={variant === "default"}
                    class:right-3={variant === "default"}
                    class:ml-1={variant === "ghost"}
                >
                    {suffix}
                </span>
            {/if}
        </div>

        {#if showStepper}
            <button
                type="button"
                class="flex items-center justify-center rounded-full bg-zen-fg/5 hover:bg-zen-fg/10 text-zen-fg-muted hover:text-zen-fg transition-all disabled:opacity-50 disabled:cursor-not-allowed {stepperSizes[
                    size
                ]}"
                onclick={increment}
                {disabled}
                aria-label="Increase value"
            >
                <svg
                    class="w-4 h-4"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                >
                    <path
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        stroke-width="2"
                        d="M12 4v16m8-8H4"
                    />
                </svg>
            </button>
        {/if}
    </div>
{/if}
