<script lang="ts">
    import { onMount } from "svelte";
    import { readVestingContract } from "$lib/contracts/contracts";
    import { initiateGoogleLogin } from "$lib/auth/googleAuth";
    import type { Address } from "viem";

    let { contractAddress, isAuthenticated } = $props<{
        contractAddress: string;
        isAuthenticated: boolean;
    }>();

    let details = $state<{ name: string; tokenSymbol: string } | null>(null);

    // Fetch details on mount
    onMount(async () => {
        try {
            const data = await readVestingContract(contractAddress as Address);
            details = { name: data.name, tokenSymbol: data.tokenSymbol };
        } catch (e) {
            console.error("Failed to load details", e);
        }
    });

    function handleLogin() {
        const CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || "";
        const REDIRECT_URI = window.location.origin + "/claim"; // Return directly to claim page
        console.log("Initiating Google Login with Redirect URI:", REDIRECT_URI);
        initiateGoogleLogin(CLIENT_ID, REDIRECT_URI);
    }
</script>

<div class="card bg-base-100 shadow-xl overflow-hidden relative min-h-[300px]">
    <!-- Header (Always Visible) -->
    <div class="p-6 border-b border-base-300 z-0">
        <div class="badge badge-primary badge-outline mb-2">
            Vesting Distribution
        </div>
        {#if details}
            <h2 class="card-title text-2xl">{details.name}</h2>
            <p class="text-base-content/60 font-mono text-xs mt-1">
                {contractAddress}
            </p>
        {:else}
            <div class="h-8 w-48 bg-base-300 animate-pulse rounded"></div>
        {/if}
    </div>

    <!-- Content Area (Blurred State) -->
    <div class="p-6 space-y-4 relative">
        <!-- Fake Content to Represent "Hidden Data" -->
        <div
            class="flex justify-between items-center opacity-30 blur-sm pointer-events-none select-none"
        >
            <div class="space-y-2">
                <div class="h-4 w-24 bg-current rounded"></div>
                <div class="h-8 w-32 bg-current rounded"></div>
            </div>
            <div class="h-12 w-24 bg-current rounded"></div>
        </div>

        <div
            class="h-32 bg-base-200 rounded-lg opacity-30 blur-sm pointer-events-none"
        ></div>

        <!-- The "Gate" Overlay -->
        {#if !isAuthenticated}
            <div
                class="absolute inset-0 z-10 flex flex-col items-center justify-center bg-base-100/60 backdrop-blur-md p-6 text-center space-y-6"
            >
                <div class="prose">
                    <h3 class="font-bold text-lg">Verify Identity</h3>
                    <p class="text-sm">
                        To check for your allocations in this distribution, you
                        must verify ownership of your email address.
                    </p>
                </div>

                <div
                    class="alert alert-info text-left text-xs shadow-lg max-w-xs"
                >
                    <svg
                        xmlns="http://www.w3.org/2000/svg"
                        fill="none"
                        viewBox="0 0 24 24"
                        class="stroke-current shrink-0 w-6 h-6"
                        ><path
                            stroke-linecap="round"
                            stroke-linejoin="round"
                            stroke-width="2"
                            d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                        ></path></svg
                    >
                    <span>
                        <b>Privacy Preserved:</b> Your email is verified
                        off-chain using ZK Proofs. It is <u>never</u> revealed to
                        the blockchain.
                    </span>
                </div>

                <button
                    class="btn btn-neutral btn-wide gap-2"
                    onclick={handleLogin}
                >
                    <!-- Google G Icon -->
                    <svg
                        viewBox="0 0 24 24"
                        class="w-5 h-5"
                        xmlns="http://www.w3.org/2000/svg"
                        ><g transform="matrix(1, 0, 0, 1, 27.009001, -39.23856)"
                            ><path
                                fill="#4285F4"
                                d="M -3.264 51.509 C -3.264 50.719 -3.334 49.969 -3.454 49.239 L -14.754 49.239 L -14.754 53.749 L -8.284 53.749 C -8.574 55.229 -9.424 56.479 -10.684 57.329 L -10.684 60.329 L -6.824 60.329 C -4.564 58.239 -3.264 55.159 -3.264 51.509 Z"
                            /><path
                                fill="#34A853"
                                d="M -14.754 63.239 C -11.514 63.239 -8.804 62.159 -6.824 60.329 L -10.684 57.329 C -11.764 58.049 -13.134 58.489 -14.754 58.489 C -17.884 58.489 -20.534 56.379 -21.484 53.529 L -25.464 53.529 L -25.464 56.619 C -23.494 60.539 -19.444 63.239 -14.754 63.239 Z"
                            /><path
                                fill="#FBBC05"
                                d="M -21.484 53.529 C -21.734 52.769 -21.864 51.959 -21.864 51.129 C -21.864 50.299 -21.734 49.489 -21.484 48.729 L -21.484 45.639 L -25.464 45.639 C -26.284 47.269 -26.754 49.129 -26.754 51.129 C -26.754 53.129 -26.284 54.989 -25.464 56.619 L -21.484 53.529 Z"
                            /><path
                                fill="#EA4335"
                                d="M -14.754 43.769 C -12.984 43.769 -11.424 44.379 -10.174 45.579 L -6.714 42.119 C -8.804 40.169 -11.514 39.019 -14.754 39.019 C -19.444 39.019 -23.494 41.719 -25.464 45.639 L -21.484 48.729 C -20.534 45.879 -17.884 43.769 -14.754 43.769 Z"
                            /></g
                        ></svg
                    >
                    Check Allocations
                </button>
            </div>
        {/if}

        {#if isAuthenticated}
            <!-- SUCCESS STATE: This would normally transition to Step 1 / Wizard -->
            <div
                class="flex flex-col items-center justify-center p-12 text-center text-success animate-in fade-in zoom-in duration-500"
            >
                <svg
                    xmlns="http://www.w3.org/2000/svg"
                    class="h-16 w-16 mb-4"
                    viewBox="0 0 20 20"
                    fill="currentColor"
                >
                    <path
                        fill-rule="evenodd"
                        d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                        clip-rule="evenodd"
                    />
                </svg>
                <h3 class="text-xl font-bold">Identity Verified</h3>
                <!-- In next steps, this view will be replaced by the Upload Wizard -->
                <a
                    href={`/claim/wizard?address=${contractAddress}`}
                    class="btn btn-primary mt-4">Continue to Claim</a
                >
            </div>
        {/if}
    </div>
</div>
