<script lang="ts">
    import { claimStore } from "../../../stores/claimStore.svelte";
    import { authStore } from "@zarf/ui/stores/authStore.svelte";
    // We import from merkleTree which handles the Barretenberg WASM loading
    import { Lock, Mail, KeyRound, Loader2, ArrowRight, LogOut } from "lucide-svelte";
    import { redirectToGoogle } from "@zarf/ui/utils/googleAuth";
    import type { Address } from "viem";
    import { PIN_LENGTH } from "../../../constants";
    import { browser } from "$app/environment";
    import { onMount } from "svelte";
    import ZenInput from "@zarf/ui/components/ui/ZenInput.svelte";
    import ZenButton from "@zarf/ui/components/ui/ZenButton.svelte";

    let { contractAddress } = $props<{ contractAddress: string }>();

    // Hydration Guard: Ensures SSR and initial client render match
    let mounted = $state(false);
    onMount(() => {
        mounted = true;
    });

    let email = $derived(authStore.gmail.email);
    let jwt = $derived(authStore.gmail.jwt);

    // Double-safe: Only show authenticated after mount AND store says authenticated
    let isAuthenticated = $derived(mounted && authStore.isAuthenticated);

    let pin = $state("");
    let isUnlocking = $state(false);
    let error = $state<string | null>(null);

    // Reset PIN when auth state changes (e.g. user re-logins) or on mount
    $effect(() => {
        if (isAuthenticated) {
            pin = "";
            error = null;
        }
    });

    // Derived state form submission eligibility
    let canSubmit = $derived(
        isAuthenticated && pin.length >= PIN_LENGTH && !isUnlocking,
    );

    function handleGoogleLogin() {
        redirectToGoogle(contractAddress);
    }

    async function handleUnlock() {
        if (!email || !pin || pin.length < PIN_LENGTH || !jwt) return;

        isUnlocking = true;
        error = null;

        try {
            // New Pattern: Delegate discovery loop to the Store
            // This handles Fetch JSON -> Derive Keys -> Check Local -> Check Chain
            await claimStore.discoverEpochs(email, jwt!, pin, contractAddress);

            if (claimStore.isEligible) {
                claimStore.nextStep();
            }
        } catch (e: any) {
            console.error("Unlock failed:", e);
            error = e.message || "Failed to verify identity.";
        } finally {
            isUnlocking = false;
        }
    }
</script>

<div class="max-w-2xl animate-in fade-in zoom-in duration-300">
    <div class="space-y-10">
        <!-- Header -->
        <div class="flex items-center gap-4">
            <div
                class="w-12 h-12 rounded-full bg-zen-primary/10 text-zen-primary flex items-center justify-center shrink-0"
            >
                <Lock class="w-6 h-6" />
            </div>
            <div>
                <h2 class="text-xl font-semibold">Identity Verification</h2>
                <p class="text-sm text-zen-fg-muted font-light mt-1">
                    To preserve privacy, your allocation is hidden.
                </p>
            </div>
        </div>

        <!-- 1. Google Auth -->
        <div class="space-y-3">
            <h3 class="text-xs font-bold uppercase tracking-widest opacity-40">
                1. Verification
            </h3>

            {#if isAuthenticated}
                <div
                    class="flex flex-col sm:flex-row sm:items-center gap-3 p-4 bg-zen-success/5 border border-zen-success/20 rounded-xl text-zen-success group relative overflow-hidden transition-all hover:bg-zen-success/10"
                >
                    <div
                        class="p-2 bg-zen-success/10 rounded-full flex-shrink-0 text-zen-success"
                    >
                        <Mail class="w-5 h-5" />
                    </div>
                    <div class="flex-1 min-w-0">
                        <p
                            class="text-xs font-semibold uppercase tracking-wider opacity-60 mb-0.5"
                        >
                            Verified Account
                        </p>
                        <p
                            class="text-base font-semibold truncate text-zen-fg"
                        >
                            {email}
                        </p>
                    </div>

                    <!-- Switch Account Button -->
                    <ZenButton
                        variant="ghost"
                        size="sm"
                        onclick={() => authStore.clearGmailSession()}
                    >
                        Switch Account
                        <LogOut class="w-3.5 h-3.5" />
                    </ZenButton>

                    <!-- ID Badge used for transition reference mostly -->
                    <div
                        class="absolute -right-4 -top-4 w-20 h-20 bg-zen-success/5 rounded-full blur-2xl pointer-events-none"
                    ></div>
                </div>
            {:else if mounted}
                <ZenButton
                    variant="secondary"
                    class="w-full h-auto min-h-14 justify-start pl-6 gap-4 text-base"
                    onclick={handleGoogleLogin}
                    onmouseenter={() => claimStore.preloadCrypto()}
                    onfocus={() => claimStore.preloadCrypto()}
                >
                    <svg class="w-5 h-5" viewBox="0 0 24 24">
                        <path
                            fill="currentColor"
                            d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                        />
                        <path
                            fill="currentColor"
                            d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                        />
                        <path
                            fill="currentColor"
                            d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.84z"
                        />
                        <path
                            fill="currentColor"
                            d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                        />
                    </svg>
                    Sign in with Google
                </ZenButton>
            {:else}
                <!-- Hydration Skeleton -->
                <div
                    class="w-full h-14 bg-zen-fg/5 animate-pulse rounded-lg border border-zen-border-subtle"
                ></div>
            {/if}
        </div>

        <!-- 2. PIN Input -->
        <div
            class="space-y-3 transition-opacity duration-300 {isAuthenticated
                ? 'opacity-100'
                : 'opacity-30 pointer-events-none'}"
        >
            <h3 class="text-xs font-bold uppercase tracking-widest opacity-40">
                2. Access Code
            </h3>

            <div
                class="relative"
                role="group"
                onmouseenter={() => claimStore.preloadCrypto()}
            >
                <ZenInput
                    type="password"
                    class="input-lg pl-11 tracking-widest font-mono placeholder:font-sans placeholder:tracking-normal"
                    placeholder={`Enter ${PIN_LENGTH}-char PIN`}
                    maxlength={PIN_LENGTH}
                    bind:value={pin}
                    {error}
                    icon={KeyRound}
                    oninput={() => (error = null)}
                    onkeydown={(e) => e.key === "Enter" && handleUnlock()}
                    onfocus={() => claimStore.preloadCrypto()}
                />
            </div>
            {#if !error}
                <p class="text-xs text-zen-fg-subtle pl-1">
                    This code was sent to you privately (DM or Email).
                </p>
            {/if}
        </div>

        <div>
            <ZenButton
                variant="primary"
                size="lg"
                class="w-full"
                disabled={!canSubmit}
                onclick={handleUnlock}
            >
                {#if isUnlocking}
                    <Loader2 class="w-5 h-5 animate-spin" />
                    Searching Blockchain...
                {:else}
                    <div class="flex items-center gap-2">
                        Unlock Allocation
                        <ArrowRight class="w-4 h-4" />
                    </div>
                {/if}
            </ZenButton>
        </div>
    </div>
</div>
