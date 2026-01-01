<script lang="ts">
    import { claimStore } from "$lib/stores/claimStore.svelte";
    import { authStore } from "$lib/stores/authStore.svelte";
    import { getClaimStatus } from "$lib/contracts/contracts";
    // We import from merkleTree which handles the Barretenberg WASM loading
    import { computeIdentityCommitment } from "$lib/crypto/merkleTree";
    import { Lock, Mail, KeyRound, Loader2, ArrowRight } from "lucide-svelte";
    import { redirectToGoogle } from "$lib/auth/googleAuth";
    import type { Address } from "viem";

    let { contractAddress } = $props<{ contractAddress: string }>();

    let email = $derived(authStore.gmail.email);
    let jwt = $derived(authStore.gmail.jwt);
    let isAuthenticated = $derived(authStore.gmail.isAuthenticated);

    let pin = $state("");
    let isUnlocking = $state(false);
    let error = $state<string | null>(null);

    function handleGoogleLogin() {
        redirectToGoogle(contractAddress);
    }

    async function handleUnlock() {
        if (!email || !pin || pin.length < 8 || !jwt) return;

        isUnlocking = true;
        error = null;

        try {
            // 1. Compute Identity Commitment locally (Pedersen Hash)
            // This does NOT reveal Email or PIN to the server/node yet
            const commitmentBigInt = await computeIdentityCommitment(
                email,
                pin,
            );
            const commitment = "0x" + commitmentBigInt.toString(16);

            console.log("Searching for commitment:", commitment);

            // 2. Query Contract
            const status = await getClaimStatus(
                commitment,
                contractAddress as Address,
            );

            if (!status || BigInt(status.allocation) === 0n) {
                error = "No allocation found for this account & PIN combo.";
                isUnlocking = false;
                return;
            }

            // 3. Update Store with Discovered Data
            // We store the PIN in memory (claimStore) for ZK proof generation later
            claimStore.setCredentials(email, jwt, pin);
            claimStore.setAllocation(
                BigInt(status.allocation),
                BigInt(status.claimed),
                commitment,
            );

            // 4. Proceed
            claimStore.nextStep();
        } catch (e: any) {
            console.error("Unlock failed:", e);
            error = e.message || "Failed to verify identity.";
        } finally {
            isUnlocking = false;
        }
    }
</script>

<div
    class="card bg-base-100 border border-base-content/5 shadow-xl max-w-lg mx-auto overflow-visible animate-in fade-in zoom-in duration-300"
>
    <div class="card-body gap-6">
        <!-- Header -->
        <div class="text-center space-y-2 mb-2">
            <div
                class="w-12 h-12 rounded-full bg-primary/10 text-primary flex items-center justify-center mx-auto mb-4"
            >
                <Lock class="w-6 h-6" />
            </div>
            <h2 class="card-title justify-center text-xl">
                Identity Verification
            </h2>
            <p class="text-sm text-base-content/60 font-light">
                To preserve privacy, your allocation is hidden. <br />
                Verify your identity to discover your vesting schedule.
            </p>
        </div>

        <!-- 1. Google Auth -->
        <div class="space-y-3">
            <h3 class="text-xs font-bold uppercase tracking-widest opacity-40">
                1. Verification
            </h3>

            {#if isAuthenticated}
                <div
                    class="flex items-center gap-3 p-3 bg-success/10 border border-success/20 rounded-lg text-success group relative"
                >
                    <div class="p-1.5 bg-success/20 rounded-full">
                        <Mail class="w-4 h-4" />
                    </div>
                    <div class="flex-1 min-w-0">
                        <p class="text-xs font-medium opacity-70">
                            Verified Account
                        </p>
                        <p class="text-sm font-semibold truncate">{email}</p>
                    </div>

                    <!-- Disconnect Button -->
                    <button
                        class="btn btn-ghost btn-xs btn-square text-success hover:bg-success/20"
                        onclick={() => authStore.clearGmailSession()}
                        aria-label="Disconnect account"
                    >
                        <svg
                            xmlns="http://www.w3.org/2000/svg"
                            width="16"
                            height="16"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            stroke-width="2"
                            stroke-linecap="round"
                            stroke-linejoin="round"
                            class="lucide lucide-x"
                            ><path d="M18 6 6 18" /><path d="m6 6 12 12" /></svg
                        >
                    </button>
                </div>
            {:else}
                <button
                    class="btn btn-outline w-full gap-3 border-base-content/10 hover:bg-base-content/5 hover:border-base-content/20 transform transition-all active:scale-95"
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
                    class="input input-lg input-bordered w-full pl-11 tracking-widest font-mono text-center placeholder:font-sans placeholder:tracking-normal placeholder:text-base-content/20 focus:border-primary/50 transition-all"
                    placeholder="Enter 8-char PIN"
                    maxlength="8"
                    bind:value={pin}
                    onkeydown={(e) => e.key === "Enter" && handleUnlock()}
                />
                <div
                    class="absolute left-4 top-1/2 -translate-y-1/2 text-base-content/30"
                >
                    <KeyRound class="w-5 h-5" />
                </div>
            </div>
            <p class="text-xs text-center text-base-content/40">
                This code was sent to you privately (DM or Email).
            </p>
        </div>

        <!-- Action -->
        {#if error}
            <div
                class="alert alert-error text-xs py-2 rounded-lg bg-error/10 border-error/20 text-error"
            >
                <span>{error}</span>
            </div>
        {/if}

        <div class="card-actions mt-4">
            <button
                class="btn btn-primary w-full btn-lg shadow-lg shadow-primary/20"
                disabled={!isAuthenticated || pin.length < 1 || isUnlocking}
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
            </button>
        </div>
    </div>
</div>
