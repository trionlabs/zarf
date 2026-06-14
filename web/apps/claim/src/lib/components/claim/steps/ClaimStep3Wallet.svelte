<script lang="ts">
    import { claimStore } from '../../../stores/claimStore.svelte';
    import { walletStore } from '@zarf/ui/stores/walletStore.svelte';
    import { Wallet, ArrowRight } from 'lucide-svelte';
    import ZenButton from '@zarf/ui/components/ui/ZenButton.svelte';
    import {
        decodeJwt,
        recipientNonce,
        redirectToGoogleWithRecipient,
    } from '@zarf/ui/utils/googleAuth';
    import { recipientId } from '@zarf/core/contracts';
    import { toMessage } from '@zarf/core/utils/error';
    import { err } from '@zarf/core/utils/log';

    let { contractAddress } = $props<{ contractAddress: string }>();

    let isConnected = $derived(walletStore.isConnected);
    let address = $derived(walletStore.address);
    let isAdvancing = $state(false);
    let error = $state<string | null>(null);

    async function handleContinue() {
        if (!address) return;
        isAdvancing = true;
        error = null;
        try {
            claimStore.setTargetWallet(address);

            // The nonce-binding circuit requires the id_token's `nonce` to equal
            // the canonical 64-hex of the recipient field, which is only known
            // once the wallet is selected. If the token in hand already binds
            // this wallet, proceed; otherwise re-auth so the id_token carries
            // the recipient-bound nonce. The re-auth is a full-page redirect
            // (COOP forbids a state-preserving popup) and PIN material is never
            // persisted, so the recipient re-enters their PIN once on return —
            // after which this guard matches and the flow advances to the proof.
            const recipientFieldHex = await recipientId(contractAddress, address);
            const requiredNonce = recipientNonce(recipientFieldHex);

            const jwt = claimStore.jwt;
            let currentNonce: string | null = null;
            if (jwt) {
                try {
                    currentNonce = decodeJwt(jwt).payload.nonce ?? null;
                } catch {
                    currentNonce = null;
                }
            }

            if (currentNonce === requiredNonce) {
                claimStore.nextStep();
                return;
            }

            const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;
            if (!clientId) {
                throw new Error('VITE_GOOGLE_CLIENT_ID is not defined');
            }
            redirectToGoogleWithRecipient({
                clientId,
                redirectUri: `${window.location.origin}/`,
                contractAddress,
                recipientFieldHex,
            });
        } catch (e) {
            err('[Claim] Recipient-bound verification failed:', e);
            error = toMessage(e, 'Could not start verification. Please retry.');
            isAdvancing = false;
        }
    }
</script>

<div class="space-y-8 py-8 animate-in fade-in slide-in-from-top-4 duration-500">
    <div class="max-w-xl mx-auto space-y-8">
        <!-- Minimal Header -->
        <div class="space-y-1">
            <h2 class="text-xl font-medium text-zen-fg tracking-tight">Recipient Wallet</h2>
            <p class="text-xs text-zen-fg-subtle font-light italic">
                Specify the address where your tokens will be sent.
            </p>
        </div>

        <!-- Connection / Selection Area -->
        <div class="space-y-4">
            {#if isConnected && address}
                <div
                    class="group relative p-6 rounded-2xl border border-zen-border-subtle bg-zen-fg/5 hover:bg-zen-fg/10 transition-all"
                >
                    <div class="flex items-center justify-between mb-2">
                        <span class="text-xs uppercase tracking-widest text-zen-success font-bold"
                            >Connected Address</span
                        >
                        <div class="flex gap-1.5">
                            <div
                                class="w-1.5 h-1.5 rounded-full bg-zen-success animate-pulse"
                            ></div>
                        </div>
                    </div>
                    <div class="font-mono text-lg text-zen-fg-muted break-all leading-tight">
                        {address}
                    </div>

                    <button
                        class="absolute -bottom-3 right-6 px-3 py-1 rounded-full bg-zen-bg border border-zen-border text-xs uppercase tracking-widest text-zen-fg-subtle hover:text-zen-primary transition-colors hover:border-zen-primary/20"
                        onclick={() => walletStore.requestConnection()}
                    >
                        Switch Account
                    </button>
                </div>
            {:else}
                <div
                    class="p-10 rounded-2xl border border-dashed border-zen-border bg-zen-fg/5 flex flex-col items-center justify-center gap-6"
                >
                    <div
                        class="w-12 h-12 rounded-full bg-zen-fg/5 flex items-center justify-center"
                    >
                        <Wallet class="w-5 h-5 text-zen-fg-faint" />
                    </div>
                    <div class="text-center space-y-1">
                        <p class="text-sm text-zen-fg-subtle">No wallet connected</p>
                        <p class="text-xs text-zen-fg-faint max-w-[200px] leading-relaxed">
                            Please connect your wallet to set as the recipient.
                        </p>
                    </div>
                    <ZenButton
                        variant="primary"
                        size="sm"
                        class="px-6 h-10 uppercase tracking-widest text-xs"
                        onclick={() => walletStore.requestConnection()}
                    >
                        Connect Wallet
                    </ZenButton>
                </div>
            {/if}
        </div>

        {#if error}
            <p class="text-xs text-zen-error text-center">{error}</p>
        {/if}

        <!-- Action Bar -->
        <div class="pt-4 border-t border-zen-border-subtle flex items-center justify-between">
            <div class="flex items-center gap-2">
                <div
                    class="w-2 h-2 rounded-full bg-zen-primary/20 flex items-center justify-center"
                >
                    <div class="w-1 h-1 rounded-full bg-zen-primary"></div>
                </div>
                <span class="text-xs uppercase tracking-widest text-zen-fg-subtle font-medium"
                    >Ready to confirm</span
                >
            </div>

            <ZenButton
                variant="primary"
                size="lg"
                class="px-8 uppercase tracking-widest text-xs font-bold group"
                disabled={!isConnected || isAdvancing}
                onclick={handleContinue}
            >
                Confirm & Proceed
                <ArrowRight
                    class="w-3.5 h-3.5 ml-2 group-hover:translate-x-1 transition-transform"
                />
            </ZenButton>
        </div>
    </div>
</div>
