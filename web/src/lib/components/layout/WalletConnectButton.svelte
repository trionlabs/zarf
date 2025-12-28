<!--
  WalletConnectButton - Global Wallet Connection UI
  
  A smart button that shows:
  - "Connect Wallet" when disconnected
  - Address + Network badge when connected
  - Dropdown menu for Balance/Disconnect/Copy/Switch Network
  - Wallet Selection Modal if multiple wallets detected

  FE_DEV.md Compliant:
  - Uses DaisyUI dropdown & modal
  - Template logic moved to $derived variables
  - Only DaisyUI semantic colors
-->
<script lang="ts">
    import { walletStore } from "$lib/stores/walletStore.svelte";
    import { type Connector } from "@wagmi/core";

    let copied = $state(false);
    let modalRef = $state<HTMLDialogElement | null>(null);

    const statusIndicatorClass = $derived(
        walletStore.isWrongNetwork ? "bg-warning animate-pulse" : "bg-success",
    );

    const networkBadgeClass = $derived(
        walletStore.isWrongNetwork ? "badge-warning" : "badge-ghost",
    );

    const etherscanUrl = $derived.by(() => {
        if (!walletStore.address) return null;
        switch (walletStore.chainId) {
            case 1:
                return `https://etherscan.io/address/${walletStore.address}`;
            case 11155111:
                return `https://sepolia.etherscan.io/address/${walletStore.address}`;
            default:
                return null;
        }
    });

    const canShowEtherscan = $derived(etherscanUrl !== null);

    // Smart Connect Logic
    async function handleConnectClick() {
        const connectors = walletStore.connectors;

        // If multiple connectors (e.g. MetaMask + Phantom), show modal
        if (connectors.length > 1) {
            modalRef?.showModal();
        } else {
            // If just one (or none), try direct connect
            await performConnect();
        }
    }

    async function performConnect(connector?: Connector) {
        modalRef?.close();
        try {
            await walletStore.connect(connector);
        } catch (e) {
            /* Handled by store */
        }
    }

    async function handleDisconnect() {
        await walletStore.disconnect();
        closeDropdown();
    }

    async function handleSwitchNetwork(chainId: number) {
        try {
            await walletStore.switchChain(chainId);
            closeDropdown();
        } catch (e) {
            /* Handled by store */
        }
    }

    async function copyAddress() {
        if (!walletStore.address) return;
        try {
            await navigator.clipboard.writeText(walletStore.address);
            copied = true;
            setTimeout(() => (copied = false), 2000);
        } catch (e) {
            console.warn("Clipboard API not available");
        }
    }

    function closeDropdown() {
        if (document.activeElement instanceof HTMLElement) {
            document.activeElement.blur();
        }
    }
</script>

<!-- Wallet Selection Modal -->
<dialog bind:this={modalRef} class="modal">
    <div class="modal-box">
        <h3 class="font-bold text-lg mb-4">Connect Wallet</h3>

        <div class="grid gap-2">
            {#each walletStore.connectors as connector}
                <button
                    class="btn btn-outline justify-start gap-3 h-14"
                    onclick={() => performConnect(connector)}
                >
                    <!-- Icon Placeholder (Wagmi gives connector.icon) -->
                    {#if connector.icon}
                        <img
                            src={connector.icon}
                            alt={connector.name}
                            class="w-6 h-6"
                        />
                    {:else}
                        <div class="w-6 h-6 rounded-full bg-base-300"></div>
                    {/if}
                    <div class="flex flex-col items-start">
                        <span class="font-bold">{connector.name}</span>
                        <span class="text-xs opacity-60">Injected Wallet</span>
                    </div>
                </button>
            {/each}
        </div>

        <div class="modal-action">
            <form method="dialog">
                <button class="btn">Close</button>
            </form>
        </div>
    </div>
    <form method="dialog" class="modal-backdrop">
        <button>close</button>
    </form>
</dialog>

{#if walletStore.isConnected}
    <div class="dropdown dropdown-end">
        <div
            tabindex="0"
            role="button"
            class="btn btn-ghost btn-sm gap-2"
            aria-label="Wallet menu: {walletStore.shortAddress}"
        >
            <span class="w-2 h-2 rounded-full {statusIndicatorClass}"></span>
            <span class="font-mono text-xs">{walletStore.shortAddress}</span>
            <span class="badge badge-xs {networkBadgeClass}">
                {walletStore.networkName}
            </span>
        </div>

        <ul
            class="dropdown-content menu bg-base-100 rounded-box z-50 w-64 p-2 shadow-lg border border-base-300"
        >
            <!-- Balance Section (Zen Highlight) -->
            <li class="menu-title px-4 py-2">
                <span class="text-xs font-normal opacity-60">Total Balance</span
                >
                <div class="text-lg font-bold text-base-content mt-0.5">
                    {#if walletStore.formattedBalance}
                        {walletStore.formattedBalance}
                    {:else}
                        <span class="loading loading-dots loading-xs opacity-50"
                        ></span>
                    {/if}
                </div>
            </li>

            <div class="divider my-0"></div>

            <!-- Address -->
            <li>
                <div
                    class="font-mono text-xs break-all py-2 pointer-events-none opacity-70"
                >
                    {walletStore.address}
                </div>
            </li>

            <!-- Network Selection -->
            <li class="menu-title px-4 py-1 mt-2">
                <span class="text-xs font-normal opacity-60">Network</span>
            </li>

            <li>
                <button
                    onclick={() => handleSwitchNetwork(1)}
                    class="justify-between {walletStore.chainId === 1
                        ? 'active font-bold'
                        : ''}"
                >
                    <div class="flex items-center gap-2">
                        <span class="w-2 h-2 rounded-full bg-blue-500"></span>
                        Ethereum
                    </div>
                    {#if walletStore.chainId === 1}
                        <svg
                            class="w-4 h-4"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                            ><path
                                stroke-linecap="round"
                                stroke-linejoin="round"
                                stroke-width="2"
                                d="M5 13l4 4L19 7"
                            /></svg
                        >
                    {/if}
                </button>
            </li>

            <li>
                <button
                    onclick={() => handleSwitchNetwork(11155111)}
                    class="justify-between {walletStore.chainId === 11155111
                        ? 'active font-bold'
                        : ''}"
                >
                    <div class="flex items-center gap-2">
                        <span class="w-2 h-2 rounded-full bg-purple-500"></span>
                        Sepolia
                    </div>
                    {#if walletStore.chainId === 11155111}
                        <svg
                            class="w-4 h-4"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                            ><path
                                stroke-linecap="round"
                                stroke-linejoin="round"
                                stroke-width="2"
                                d="M5 13l4 4L19 7"
                            /></svg
                        >
                    {/if}
                </button>
            </li>

            <div class="divider my-0"></div>

            <!-- Actions -->
            <li>
                <button onclick={copyAddress}>
                    {#if copied}
                        <svg
                            class="w-4 h-4 text-success"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                            ><path
                                stroke-linecap="round"
                                stroke-linejoin="round"
                                stroke-width="2"
                                d="M5 13l4 4L19 7"
                            /></svg
                        >
                        Copied!
                    {:else}
                        <svg
                            class="w-4 h-4"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                            ><path
                                stroke-linecap="round"
                                stroke-linejoin="round"
                                stroke-width="2"
                                d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
                            /></svg
                        >
                        Copy Address
                    {/if}
                </button>
            </li>

            {#if canShowEtherscan}
                <li>
                    <a
                        href={etherscanUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                    >
                        <svg
                            class="w-4 h-4"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                            ><path
                                stroke-linecap="round"
                                stroke-linejoin="round"
                                stroke-width="2"
                                d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
                            /></svg
                        >
                        View on Etherscan
                    </a>
                </li>
            {/if}

            <div class="divider my-0"></div>

            <li>
                <button
                    onclick={handleDisconnect}
                    class="text-error hover:bg-error/10"
                >
                    <svg
                        class="w-4 h-4"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                        ><path
                            stroke-linecap="round"
                            stroke-linejoin="round"
                            stroke-width="2"
                            d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"
                        /></svg
                    >
                    Disconnect
                </button>
            </li>
        </ul>
    </div>
{:else}
    <button
        class="btn btn-primary btn-sm gap-2"
        onclick={handleConnectClick}
        disabled={walletStore.isConnecting}
    >
        {#if walletStore.isConnecting}
            <span class="loading loading-spinner loading-xs"></span> Connecting...
        {:else}
            <svg
                class="w-4 h-4"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                ><path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    stroke-width="2"
                    d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1"
                /></svg
            >
            Connect Wallet
        {/if}
    </button>
{/if}
