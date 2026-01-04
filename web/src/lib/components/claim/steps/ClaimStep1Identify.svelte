<script lang="ts">
    import { claimStore } from "$lib/stores/claimStore.svelte";
    import { authStore } from "$lib/stores/authStore.svelte";
    // We import from merkleTree which handles the Barretenberg WASM loading
    import { Lock, Mail, KeyRound, Loader2, ArrowRight } from "lucide-svelte";
    import { redirectToGoogle } from "$lib/auth/googleAuth";
    import type { Address } from "viem";
    import { PIN_LENGTH } from "$lib/constants";
    import { browser } from "$app/environment";
    import { onMount } from "svelte";

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
    <div class="space-y-8">
        <!-- Header -->
        <!-- Header -->
        <div class="space-y-4 mb-2">
            <div class="flex items-center gap-4">
                <div
                    class="w-12 h-12 rounded-full bg-primary/10 text-primary flex items-center justify-center shrink-0"
                >
                    <Lock class="w-6 h-6" />
                </div>
                <div>
                    <h2 class="card-title text-xl">Identity Verification</h2>
                    <p class="text-sm text-base-content/60 font-light mt-1">
                        To preserve privacy, your allocation is hidden.
                    </p>
                </div>
            </div>
        </div>

        <!-- 1. Google Auth -->
        <div class="space-y-3">
            <h3 class="text-xs font-bold uppercase tracking-widest opacity-40">
                1. Verification
            </h3>

            {#if isAuthenticated}
                <div
                    class="flex flex-col sm:flex-row sm:items-center gap-3 p-4 bg-success/5 border border-success/20 rounded-xl text-success group relative overflow-hidden transition-all hover:bg-success/10"
                >
                    <div
                        class="p-2 bg-success/10 rounded-full flex-shrink-0 text-success"
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
                            class="text-base font-semibold truncate text-base-content"
                        >
                            {email}
                        </p>
                    </div>

                    <!-- Switch Account Button -->
                    <button
                        class="btn btn-sm btn-ghost border border-base-content/10 hover:bg-base-content/5 hover:border-base-content/20 gap-2 font-normal text-base-content/70"
                        onclick={() => authStore.clearGmailSession()}
                    >
                        Switch Account
                        <svg
                            xmlns="http://www.w3.org/2000/svg"
                            width="14"
                            height="14"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            stroke-width="2"
                            stroke-linecap="round"
                            stroke-linejoin="round"
                            class="lucide lucide-log-out"
                            ><path
                                d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"
                            /><polyline points="16 17 21 12 16 7" /><line
                                x1="21"
                                x2="9"
                                y1="12"
                                y2="12"
                            /></svg
                        >
                    </button>

                    <!-- ID Badge used for transition reference mostly -->
                    <div
                        class="absolute -right-4 -top-4 w-20 h-20 bg-success/5 rounded-full blur-2xl pointer-events-none"
                    ></div>
                </div>
            {:else if mounted}
                <button
                    class="btn btn-outline w-full gap-3 py-4 h-auto min-h-[3.5rem] border-base-content/10 hover:bg-base-content/5 hover:border-base-content/20 transform transition-all active:scale-[0.99] text-base font-medium"
                    onclick={handleGoogleLogin}
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
                </button>
            {:else}
                <!-- Hydration Skeleton -->
                <div
                    class="w-full h-14 bg-base-content/5 animate-pulse rounded-lg border border-base-content/5"
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

            <div class="relative">
                <input
                    type="password"
                    class="input input-lg input-bordered w-full pl-11 tracking-widest font-mono placeholder:font-sans placeholder:tracking-normal placeholder:text-base-content/20 focus:border-primary/50 transition-all"
                    class:input-error={error !== null}
                    placeholder={`Enter ${PIN_LENGTH}-char PIN`}
                    maxlength={PIN_LENGTH}
                    bind:value={pin}
                    oninput={() => (error = null)}
                    onkeydown={(e) => e.key === "Enter" && handleUnlock()}
                />
                <div
                    class="absolute left-4 top-1/2 -translate-y-1/2 text-base-content/30"
                >
                    <KeyRound class="w-5 h-5" />
                </div>
            </div>
            {#if error}
                <p
                    class="text-xs text-error font-medium pl-1 animate-in slide-in-from-top-1"
                >
                    {error}
                </p>
            {:else}
                <p class="text-xs text-base-content/40 pl-1">
                    This code was sent to you privately (DM or Email).
                </p>
            {/if}
        </div>

        <div class="card-actions mt-4">
            <button
                class="btn btn-primary w-full btn-lg shadow-sm shadow-primary/10 disabled:shadow-none disabled:bg-base-content/5 disabled:text-base-content/20"
                disabled={!canSubmit}
                onclick={handleUnlock}
            >
                {#if isUnlocking}
                    <Loader2 class="w-5 h-5 animate-spin" />
                    Searching Blockchain...
                    <span class="text-xs opacity-70 block font-normal"
                        >{claimStore.statusMessage}</span
                    >
                {:else}
                    <div class="flex items-center gap-2">
                        Unlock Allocation
                        <ArrowRight class="w-4 h-4" />
                    </div>
                {/if}
            </button>
        </div>
    </div>
</div>
