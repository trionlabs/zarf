<!--
  WalletConnectButton - Global Wallet Connection UI
  
  A smart button that shows:
  - "Connect Wallet" when disconnected
  - Address + Network badge when connected
  - Dropdown menu for disconnect/copy
  
  FE_DEV.md Compliant:
  - Uses DaisyUI dropdown component (no custom CSS)
  - Template logic moved to $derived variables
  - Only DaisyUI semantic colors
  
  Supports: MetaMask, Rainbow, Rabbit Wallet, and other injected wallets.
-->
<script lang="ts">
    import { walletStore } from "$lib/stores/walletStore.svelte";
    import { onMount } from "svelte";

    // Local UI state
    let copied = $state(false);

    onMount(() => {
        walletStore.init();
        return () => walletStore.destroy();
    });

    // ============================================================================
    // Derived Values (FE_DEV: Clean Markup - no logic in templates)
    // ============================================================================

    const statusIndicatorClass = $derived(
        walletStore.isWrongNetwork ? "bg-warning animate-pulse" : "bg-success",
    );

    const networkBadgeClass = $derived(
        walletStore.isWrongNetwork ? "badge-warning" : "badge-ghost",
    );

    const etherscanUrl = $derived(
        walletStore.chainId === 1
            ? `https://etherscan.io/address/${walletStore.address}`
            : `https://sepolia.etherscan.io/address/${walletStore.address}`,
    );

    // ============================================================================
    // Actions
    // ============================================================================

    async function handleConnect() {
        try {
            await walletStore.connect();
        } catch (e) {
            console.error("Connection failed:", e);
        }
    }

    async function handleDisconnect() {
        await walletStore.disconnect();
    }

    async function copyAddress() {
        if (walletStore.address) {
            await navigator.clipboard.writeText(walletStore.address);
            copied = true;
            setTimeout(() => (copied = false), 2000);
        }
    }
</script>

{#if walletStore.isConnected}
    <!-- Connected State - DaisyUI Dropdown -->
    <div class="dropdown dropdown-end">
        <div tabindex="0" role="button" class="btn btn-ghost btn-sm gap-2">
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

            <!-- View on Etherscan -->
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

<!-- Error Toast -->
{#if walletStore.error}
    <div class="toast toast-end toast-top z-50">
        <div class="alert alert-error">
            <span class="text-sm">{walletStore.error}</span>
            <button
                class="btn btn-ghost btn-xs"
                onclick={() => walletStore.clearError()}
            >
                ✕
            </button>
        </div>
    </div>
{/if}
