<!--
  WalletSelectionModal - Global Wallet Selector

  Controls:
  - Triggered by: walletStore.requestConnection()
  - State: walletStore.isModalOpen

  Features:
  - Prompts Freighter access
-->
<script lang="ts">
    import { walletStore } from '../../stores/walletStore.svelte';
    import { X, Wallet } from 'lucide-svelte';
    import ZenButton from '../ui/ZenButton.svelte';

    async function handleConnect() {
        try {
            await walletStore.connect();
            // Modal closes automatically via store logic on success
        } catch (e) {
            // Error handling is done in store
        }
    }

    function handleClose() {
        walletStore.closeModal();
    }

    function handleBackdropClick(e: MouseEvent) {
        if (e.target === e.currentTarget) {
            handleClose();
        }
    }
</script>

{#if walletStore.isModalOpen}
    <!-- Backdrop -->
    <div
        class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-zen-fade-in"
        onclick={handleBackdropClick}
        onkeydown={(e) => e.key === 'Escape' && handleClose()}
        role="dialog"
        aria-modal="true"
        tabindex="-1"
    >
        <!-- Modal Box -->
        <div
            class="
                w-full max-w-sm
                bg-zen-bg
                border-[0.5px] border-zen-border
                rounded-2xl shadow-2xl
                animate-zen-scale-in
            "
        >
            <!-- Header -->
            <div
                class="flex items-center justify-between p-5 border-b-[0.5px] border-zen-border-subtle"
            >
                <h3 class="text-lg font-semibold text-zen-fg">Connect Wallet</h3>
                <button
                    class="p-1.5 rounded-lg text-zen-fg-muted hover:text-zen-fg hover:bg-zen-fg/5 transition-colors"
                    onclick={handleClose}
                    aria-label="Close"
                >
                    <X class="w-4 h-4" />
                </button>
            </div>

            <!-- Body -->
            <div class="p-5 space-y-4">
                <p class="text-sm text-zen-fg-muted">Zarf connects to Stellar through Freighter.</p>

                <div class="space-y-2">
                    <button
                        class="
                            w-full flex items-center gap-3 p-3.5
                            rounded-xl border-[0.5px] border-zen-border
                            bg-transparent hover:bg-zen-fg/5
                            hover:border-zen-border-strong
                            transition-all duration-200
                        "
                        onclick={handleConnect}
                    >
                        <div
                            class="w-8 h-8 rounded-lg bg-zen-fg/10 flex items-center justify-center text-xs font-bold text-zen-fg-muted"
                        >
                            <Wallet class="w-4 h-4" />
                        </div>
                        <div class="flex flex-col items-start">
                            <span class="font-medium text-zen-fg">Freighter</span>
                            <span class="text-xs text-zen-fg-faint">Stellar wallet</span>
                        </div>
                    </button>

                    <a
                        href="https://www.freighter.app/"
                        target="_blank"
                        rel="noopener noreferrer"
                        class="
                            w-full flex items-center justify-center gap-2 p-3.5
                            rounded-xl
                            bg-zen-primary text-zen-primary-content
                            font-medium text-sm
                            hover:opacity-90 transition-opacity
                        "
                    >
                        Install Freighter
                    </a>
                </div>
            </div>

            <!-- Footer -->
            <div class="p-5 border-t-[0.5px] border-zen-border-subtle">
                <ZenButton variant="ghost" class="w-full" onclick={handleClose}>Cancel</ZenButton>
            </div>
        </div>
    </div>
{/if}
