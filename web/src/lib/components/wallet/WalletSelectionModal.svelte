<!--
  WalletSelectionModal - Global Wallet Selector
  
  Controls:
  - Triggered by: walletStore.requestConnection()
  - State: walletStore.isModalOpen
  
  Features:
  - Lists all detected Injected Connectors (EIP-6963)
  - Handles connection logic
-->
<script lang="ts">
    import { walletStore } from "$lib/stores/walletStore.svelte";
    import type { Connector } from "@wagmi/core";

    async function handleConnect(connector: Connector) {
        try {
            await walletStore.connect(connector);
            // Modal closes automatically via store logic on success
        } catch (e) {
            // Error handling is done in store
        }
    }

    function handleClose() {
        walletStore.closeModal();
    }
</script>

<dialog class="modal" class:modal-open={walletStore.isModalOpen}>
    <div class="modal-box">
        <h3 class="font-bold text-lg mb-4">Connect Wallet</h3>

        {#if walletStore.connectors.length > 1}
            <p class="text-sm opacity-70 mb-4">
                Multiple wallets detected. Please select one.
            </p>
        {:else if walletStore.connectors.length === 0}
            <p class="text-sm text-warning mb-4">
                No wallets detected. Please install a Web3 wallet.
            </p>
        {/if}

        <div class="grid gap-2">
            {#each walletStore.connectors as connector}
                <button
                    class="btn btn-outline justify-start gap-3 h-14"
                    onclick={() => handleConnect(connector)}
                >
                    <!-- Icon Placeholder -->
                    {#if connector.icon}
                        <img
                            src={connector.icon}
                            alt={connector.name}
                            class="w-6 h-6"
                        />
                    {:else}
                        <div
                            class="w-6 h-6 rounded-full bg-base-300 flex items-center justify-center text-xs"
                        >
                            W
                        </div>
                    {/if}
                    <div class="flex flex-col items-start">
                        <span class="font-bold">{connector.name}</span>
                        <span class="text-xs opacity-60">Detected Wallet</span>
                    </div>
                </button>
            {/each}

            {#if walletStore.connectors.length === 0}
                <a
                    href="https://metamask.io/download/"
                    target="_blank"
                    class="btn btn-primary">Install MetaMask</a
                >
            {/if}
        </div>

        <div class="modal-action">
            <button class="btn" onclick={handleClose}>Close</button>
        </div>
    </div>

    <!-- Backdrop click to close -->
    <form method="dialog" class="modal-backdrop">
        <button onclick={handleClose}>close</button>
    </form>
</dialog>
