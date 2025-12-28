<!--
  WalletConnectButton - Global Wallet Connection UI
  
  A smart button that shows:
  - "Connect Wallet" when disconnected
  - Address + Network badge when connected
  - Dropdown menu for disconnect/copy/switch network
  
  FE_DEV.md Compliant:
  - Uses DaisyUI dropdown component (no custom CSS)
  - Template logic moved to $derived variables
  - Only DaisyUI semantic colors
  
  NOTE: walletStore.init() is called ONCE in root +layout.svelte (not here)
  NOTE: Error toast is rendered in root +layout.svelte (not here)
-->
<script lang="ts">
    import { walletStore } from "$lib/stores/walletStore.svelte";

    // Local UI state
    let copied = $state(false);
    let dropdownRef = $state<HTMLDetailsElement | null>(null);

    // ============================================================================
    // Derived Values (FE_DEV: Clean Markup - no logic in templates)
    // ============================================================================

    const statusIndicatorClass = $derived(
        walletStore.isWrongNetwork ? "bg-warning animate-pulse" : "bg-success",
    );

    const networkBadgeClass = $derived(
        walletStore.isWrongNetwork ? "badge-warning" : "badge-ghost",
    );

    // Safe Etherscan URL with null checks and proper chain handling
    const etherscanUrl = $derived.by(() => {
        if (!walletStore.address) return null;

        switch (walletStore.chainId) {
            case 1:
                return `https://etherscan.io/address/${walletStore.address}`;
            case 11155111:
                return `https://sepolia.etherscan.io/address/${walletStore.address}`;
            default:
                return null; // Unsupported chain - don't show link
        }
    });

    const canShowEtherscan = $derived(etherscanUrl !== null);

    // ============================================================================
    // Actions
    // ============================================================================

    async function handleConnect() {
        try {
            await walletStore.connect();
        } catch (e) {
            // Error is handled by walletStore and shown in global toast
        }
    }

    async function handleDisconnect() {
        await walletStore.disconnect();
        closeDropdown();
    }

    async function handleSwitchNetwork() {
        try {
            await walletStore.switchToSepolia();
            closeDropdown();
        } catch (e) {
            // Error handled by store
        }
    }

    async function copyAddress() {
        if (!walletStore.address) return;

        try {
            await navigator.clipboard.writeText(walletStore.address);
            copied = true;
            setTimeout(() => (copied = false), 2000);
        } catch (e) {
            // Fallback for browsers without clipboard API
            console.warn("Clipboard API not available");
        }
    }

    function closeDropdown() {
        // Close DaisyUI dropdown by blurring the trigger
        if (document.activeElement instanceof HTMLElement) {
            document.activeElement.blur();
        }
    }
</script>

{#if walletStore.isConnected}
    <!-- Connected State - DaisyUI Dropdown -->
    <div class="dropdown dropdown-end">
        <div
            tabindex="0"
            role="button"
            class="btn btn-ghost btn-sm gap-2"
            aria-label="Wallet menu: {walletStore.shortAddress}"
        >
            <!-- Status indicator -->
            <span class="w-2 h-2 rounded-full {statusIndicatorClass}"></span>
            <!-- Address -->
            <span class="font-mono text-xs">{walletStore.shortAddress}</span>
            <!-- Network badge -->
            <span class="badge badge-xs {networkBadgeClass}">
                {walletStore.networkName}
            </span>
        </div>

        <!-- Dropdown Menu -->
        <ul
            class="dropdown-content menu bg-base-100 rounded-box z-50 w-56 p-2 shadow-lg border border-base-300"
        >
            <!-- Wallet Info Header -->
            <li class="menu-title">
                <span class="text-xs">Connected Wallet</span>
            </li>
            <li>
                <div
                    class="font-mono text-xs break-all py-2 pointer-events-none"
                >
                    {walletStore.address}
                </div>
            </li>

            <div class="divider my-0"></div>

            <!-- Switch Network (only show if wrong network) -->
            {#if walletStore.isWrongNetwork}
                <li>
                    <button onclick={handleSwitchNetwork} class="text-warning">
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
                                d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                            />
                        </svg>
                        Switch to Sepolia
                    </button>
                </li>
                <div class="divider my-0"></div>
            {/if}

            <!-- Copy Address -->
            <li>
                <button onclick={copyAddress}>
                    {#if copied}
                        <svg
                            class="w-4 h-4 text-success"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                        >
                            <path
                                stroke-linecap="round"
                                stroke-linejoin="round"
                                stroke-width="2"
                                d="M5 13l4 4L19 7"
                            />
                        </svg>
                        Copied!
                    {:else}
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
                                d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
                            />
                        </svg>
                        Copy Address
                    {/if}
                </button>
            </li>

            <!-- View on Etherscan (only if supported chain) -->
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
                        >
                            <path
                                stroke-linecap="round"
                                stroke-linejoin="round"
                                stroke-width="2"
                                d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
                            />
                        </svg>
                        View on Etherscan
                    </a>
                </li>
            {/if}

            <div class="divider my-0"></div>

            <!-- Disconnect -->
            <li>
                <button onclick={handleDisconnect} class="text-error">
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
                            d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"
                        />
                    </svg>
                    Disconnect
                </button>
            </li>
        </ul>
    </div>
{:else}
    <!-- Disconnected State -->
    <button
        class="btn btn-primary btn-sm gap-2"
        onclick={handleConnect}
        disabled={walletStore.isConnecting}
        aria-label="Connect your Ethereum wallet"
    >
        {#if walletStore.isConnecting}
            <span class="loading loading-spinner loading-xs"></span>
            Connecting...
        {:else}
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
                    d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1"
                />
            </svg>
            Connect
        {/if}
    </button>
{/if}
