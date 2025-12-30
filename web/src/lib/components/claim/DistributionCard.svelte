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
        // Use just origin (like POC) - /claim path not registered in Google Console
        const REDIRECT_URI = window.location.origin + "/";
        console.log("Initiating Google Login with Redirect URI:", REDIRECT_URI);

        // Pass contract address as state to preserve context
        const state = JSON.stringify({ address: contractAddress });
        initiateGoogleLogin(CLIENT_ID, REDIRECT_URI, state);
    }
</script>

<div
    class="h-full border border-base-content/10 rounded-3xl overflow-hidden relative min-h-[400px] bg-base-100/50"
>
    <!-- Header -->
    <div class="p-8 border-b border-base-content/5 bg-base-100">
        {#if details}
            <div class="flex items-center gap-5">
                <div
                    class="w-14 h-14 rounded-full bg-primary/5 flex items-center justify-center text-primary font-bold shadow-inner ring-1 ring-base-content/5 text-xl shrink-0"
                >
                    {details.tokenSymbol.charAt(0) || "T"}
                </div>

                <div class="flex-1 min-w-0">
                    <div class="flex items-center gap-3 flex-wrap">
                        <h2
                            class="font-bold text-lg text-base-content tracking-tight"
                        >
                            {details.name}
                        </h2>
                        <span
                            class="badge badge-neutral font-mono text-xs opacity-80"
                        >
                            {details.tokenSymbol}
                        </span>
                        <div
                            class="flex items-center gap-1 text-success text-xs font-medium px-2 py-0.5 bg-success/10 rounded-full"
                        >
                            <svg
                                xmlns="http://www.w3.org/2000/svg"
                                class="w-3 h-3"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                stroke-width="2"
                                stroke-linecap="round"
                                stroke-linejoin="round"
                                ><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"
                                ></path><polyline points="22 4 12 14.01 9 11.01"
                                ></polyline></svg
                            >
                            Verified
                        </div>
                    </div>
                    <div class="flex items-center gap-2 mt-1.5">
                        <div
                            class="text-xs uppercase tracking-wider font-bold opacity-30"
                        >
                            Contract
                        </div>
                        <div
                            class="font-mono text-sm text-base-content/70 truncate max-w-[300px]"
                            title={contractAddress}
                        >
                            {contractAddress}
                        </div>
                    </div>
                </div>
            </div>
        {:else}
            <div class="flex items-center gap-4 animate-pulse">
                <div class="w-14 h-14 rounded-full bg-base-200"></div>
                <div class="space-y-2">
                    <div class="h-5 w-32 bg-base-200 rounded"></div>
                    <div class="h-4 w-48 bg-base-200 rounded"></div>
                </div>
            </div>
        {/if}
    </div>

    <!-- Content Area (Blurred State) -->
    <div class="p-8 space-y-6 relative h-full">
        <!-- Fake Content to Represent "Hidden Data" -->
        <div
            class="space-y-6 opacity-20 pointer-events-none select-none blur-[2px]"
        >
            <div class="flex justify-between items-center">
                <div class="space-y-2">
                    <div class="h-4 w-24 bg-base-content rounded"></div>
                    <div class="h-8 w-32 bg-base-content rounded"></div>
                </div>
                <div class="h-12 w-24 bg-base-content rounded-xl"></div>
            </div>
            <div class="h-32 bg-base-content/10 rounded-xl"></div>
            <div class="flex justify-between items-center">
                <div class="h-4 w-48 bg-base-content rounded"></div>
                <div class="h-4 w-12 bg-base-content rounded"></div>
            </div>
        </div>

        <!-- The "Gate" Overlay -->
        {#if !isAuthenticated}
            <div
                class="absolute inset-0 z-10 flex flex-col items-center justify-center bg-base-100/40 backdrop-blur-md p-8 text-center"
            >
                <div
                    class="max-w-md w-full space-y-8 animate-in zoom-in fade-in duration-300"
                >
                    <div class="space-y-2">
                        <h3 class="font-bold text-xl tracking-tight">
                            Verify Identity
                        </h3>
                        <p class="text-base-content/60 leading-relaxed">
                            To check for your allocations in this distribution,
                            you must verify ownership of your email address.
                        </p>
                    </div>

                    <div
                        class="text-left text-sm p-4 rounded-xl border border-primary/10 bg-primary/5 text-base-content/80 flex gap-4"
                    >
                        <div
                            class="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0 text-primary"
                        >
                            <svg
                                xmlns="http://www.w3.org/2000/svg"
                                class="w-4 h-4"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                stroke-width="2"
                                stroke-linecap="round"
                                stroke-linejoin="round"
                                ><path
                                    d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"
                                ></path></svg
                            >
                        </div>
                        <div>
                            <span
                                class="font-bold block text-base-content mb-0.5"
                                >Privacy Preserved</span
                            >
                            <span class="leading-relaxed opacity-80">
                                Your email is verified off-chain using ZK
                                Proofs. It is <u>never</u> revealed to the blockchain.
                            </span>
                        </div>
                    </div>

                    <button
                        class="btn btn-primary w-full shadow-lg shadow-primary/20 hover:shadow-primary/30 transition-all transform active:scale-95"
                        onclick={handleLogin}
                    >
                        <!-- Google G Icon - Simplified -->
                        <div
                            class="w-5 h-5 bg-white rounded-full flex items-center justify-center mr-2"
                        >
                            <svg viewBox="0 0 24 24" class="w-3.5 h-3.5"
                                ><path
                                    fill="#4285F4"
                                    d="M23.745 12.27c0-.79-.07-1.54-.19-2.27h-11.3v4.51h6.47c-.29 1.48-1.14 2.73-2.4 3.58v3h3.86c2.26-2.09 3.56-5.17 3.56-8.82z"
                                /><path
                                    fill="#34A853"
                                    d="M12.255 24c3.24 0 5.95-1.08 7.96-2.91l-3.86-3c-1.08.72-2.45 1.16-4.1 1.16-3.13 0-5.78-2.11-6.73-4.96h-3.98v3.09C3.515 21.3 7.565 24 12.255 24z"
                                /><path
                                    fill="#FBBC05"
                                    d="M5.525 14.29c-.25-.72-.38-1.49-.38-2.29s.14-1.57.38-2.29V6.62h-3.98a11.86 11.86 0 000 10.76l3.98-3.09z"
                                /><path
                                    fill="#EA4335"
                                    d="M12.255 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C18.205 1.19 15.495 0 12.255 0c-4.69 0-8.74 2.7-10.71 6.62l3.98 3.09c.95-2.85 3.6-4.96 6.73-4.96z"
                                /></svg
                            >
                        </div>
                        Check Allocations
                    </button>
                </div>
            </div>
        {/if}

        {#if isAuthenticated}
            <!-- SUCCESS STATE -->
            <div
                class="absolute inset-0 z-10 flex flex-col items-center justify-center bg-base-100/95"
            >
                <div
                    class="text-center animate-in zoom-in fade-in duration-300"
                >
                    <div
                        class="w-16 h-16 bg-success/10 text-success rounded-full flex items-center justify-center mx-auto mb-4 ring-1 ring-success/20"
                    >
                        <svg
                            xmlns="http://www.w3.org/2000/svg"
                            class="w-8 h-8"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            stroke-width="2"
                            stroke-linecap="round"
                            stroke-linejoin="round"
                            ><polyline points="20 6 9 17 4 12"></polyline></svg
                        >
                    </div>
                    <h3 class="text-xl font-bold mb-2">Identity Verified</h3>
                    <p class="text-base-content/50 mb-6 max-w-xs mx-auto">
                        You can now proceed to check your eligible allocations.
                    </p>

                    <a
                        href={`/claim/wizard?address=${contractAddress}`}
                        class="btn btn-primary px-8 shadow-lg shadow-primary/20 hover:shadow-primary/30"
                    >
                        Continue to Claim
                        <svg
                            xmlns="http://www.w3.org/2000/svg"
                            class="w-4 h-4 ml-2"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            stroke-width="2"
                            stroke-linecap="round"
                            stroke-linejoin="round"
                            ><line x1="5" y1="12" x2="19" y2="12"
                            ></line><polyline points="12 5 19 12 12 19"
                            ></polyline></svg
                        >
                    </a>
                </div>
            </div>
        {/if}
    </div>
</div>
