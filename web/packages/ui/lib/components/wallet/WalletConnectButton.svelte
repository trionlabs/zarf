<!--
  WalletConnectButton - Global Wallet Connection UI

  A smart button that shows:
  - "Connect Wallet" when disconnected (Triggers Global Modal)
  - Address + Network badge when connected
  - Dropdown menu for Balance/Disconnect/Copy/Explorer

  Uses Zen design tokens
-->
<script lang="ts">
    import { onMount } from 'svelte';
    import { walletStore } from '../../stores/walletStore.svelte';
    import {
        Copy,
        Check,
        ExternalLink,
        RefreshCw,
        LogOut,
        ChevronDown,
        Wallet,
    } from 'lucide-svelte';
    import ZenButton from '../ui/ZenButton.svelte';
    import ZenSpinner from '../ui/ZenSpinner.svelte';
    import { warn } from '@zarf/core/utils/log';

    let mounted = $state(false);
    let copied = $state(false);
    let isOpen = $state(false);
    let dropdownRef = $state<HTMLDivElement | null>(null);

    onMount(() => {
        mounted = true;
    });

    const statusIndicatorClass = $derived(
        walletStore.isWrongNetwork ? 'bg-zen-warning animate-pulse' : 'bg-zen-success',
    );

    const explorerUrl = $derived.by(() => {
        return walletStore.accountExplorerUrl;
    });

    const canShowExplorer = $derived(explorerUrl !== null);

    // Close dropdown when clicking outside
    function handleClickOutside(event: MouseEvent) {
        if (dropdownRef && !dropdownRef.contains(event.target as Node)) {
            isOpen = false;
        }
    }

    $effect(() => {
        if (isOpen) {
            document.addEventListener('click', handleClickOutside);
            return () => document.removeEventListener('click', handleClickOutside);
        }
    });

    // Actions
    async function handleConnectClick() {
        await walletStore.requestConnection();
    }

    async function handleDisconnect() {
        await walletStore.disconnect();
        isOpen = false;
    }

    async function handleChangeWallet() {
        isOpen = false;
        await walletStore.disconnect();
        setTimeout(() => {
            walletStore.requestConnection();
        }, 100);
    }

    async function copyAddress() {
        if (!walletStore.address) return;
        try {
            await navigator.clipboard.writeText(walletStore.address);
            copied = true;
            setTimeout(() => (copied = false), 2000);
        } catch {
            warn('Clipboard API not available');
        }
    }
</script>

{#if !mounted}
    <!-- SSR placeholder - prevents hydration mismatch -->
    <div class="w-[140px] h-8 rounded-lg bg-zen-fg/5 animate-pulse"></div>
{:else if walletStore.isConnected}
    <div class="relative" bind:this={dropdownRef}>
        <!-- Trigger Button -->
        <button
            type="button"
            class="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-zen-fg/5 hover:bg-zen-fg/10 transition-colors text-sm"
            onclick={() => (isOpen = !isOpen)}
            aria-expanded={isOpen}
            aria-haspopup="true"
        >
            <span class="w-2 h-2 rounded-full {statusIndicatorClass}"></span>
            <span class="font-mono text-xs text-zen-fg">{walletStore.shortAddress}</span>
            <span
                class="px-1.5 py-0.5 rounded text-[10px] font-medium bg-zen-fg/5 text-zen-fg-muted"
            >
                {walletStore.networkName}
            </span>
            <ChevronDown
                class="w-3 h-3 text-zen-fg-subtle transition-transform {isOpen ? 'rotate-180' : ''}"
            />
        </button>

        <!-- Dropdown Menu -->
        {#if isOpen}
            <div
                class="absolute right-0 top-full mt-2 w-72 rounded-xl bg-zen-bg border border-zen-border shadow-lg z-50 overflow-hidden animate-zen-scale-in origin-top-right"
            >
                <!-- Balance Section -->
                <div class="px-4 py-3 bg-zen-fg/5">
                    <span
                        class="text-[10px] uppercase tracking-wider text-zen-fg-subtle font-medium"
                        >Total Balance</span
                    >
                    <div class="text-lg font-bold text-zen-fg mt-0.5">
                        {#if walletStore.formattedBalance}
                            {walletStore.formattedBalance}
                        {:else}
                            <ZenSpinner size="sm" />
                        {/if}
                    </div>
                </div>

                <!-- Address -->
                <div class="px-4 py-2 border-b border-zen-border-subtle">
                    <div class="font-mono text-[10px] text-zen-fg-muted break-all">
                        {walletStore.address}
                    </div>
                </div>

                <!-- Network -->
                <div class="px-4 py-2 border-b border-zen-border-subtle">
                    <span
                        class="text-[10px] uppercase tracking-wider text-zen-fg-subtle font-medium"
                        >Network</span
                    >
                    <div class="mt-1 flex items-center gap-2">
                        <span
                            class="w-2 h-2 rounded-full {walletStore.isWrongNetwork
                                ? 'bg-zen-warning'
                                : 'bg-zen-success'}"
                        ></span>
                        <span class="text-sm text-zen-fg-muted">{walletStore.networkName}</span>
                    </div>
                    {#if walletStore.isWrongNetwork}
                        <p class="mt-2 text-xs text-zen-warning">
                            Select the configured Stellar network in Freighter.
                        </p>
                    {/if}
                </div>

                <div class="h-px bg-zen-border-subtle mx-4"></div>

                <!-- Actions -->
                <button
                    type="button"
                    class="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-zen-fg/5 transition-colors text-left"
                    onclick={copyAddress}
                >
                    {#if copied}
                        <Check class="w-4 h-4 text-zen-success" />
                        <span class="text-sm text-zen-success">Copied!</span>
                    {:else}
                        <Copy class="w-4 h-4 text-zen-fg-subtle" />
                        <span class="text-sm text-zen-fg-muted">Copy Address</span>
                    {/if}
                </button>

                {#if canShowExplorer}
                    <a
                        href={explorerUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        class="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-zen-fg/5 transition-colors text-left"
                    >
                        <ExternalLink class="w-4 h-4 text-zen-fg-subtle" />
                        <span class="text-sm text-zen-fg-muted">View on Stellar Expert</span>
                    </a>
                {/if}

                <div class="h-px bg-zen-border-subtle mx-4"></div>

                <button
                    type="button"
                    class="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-zen-fg/5 transition-colors text-left"
                    onclick={handleChangeWallet}
                >
                    <RefreshCw class="w-4 h-4 text-zen-fg-subtle" />
                    <span class="text-sm text-zen-fg-muted">Change Wallet</span>
                </button>

                <button
                    type="button"
                    class="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-zen-error/10 transition-colors text-left"
                    onclick={handleDisconnect}
                >
                    <LogOut class="w-4 h-4 text-zen-error" />
                    <span class="text-sm text-zen-error">Disconnect</span>
                </button>
            </div>
        {/if}
    </div>
{:else}
    <ZenButton
        variant="primary"
        onclick={handleConnectClick}
        disabled={walletStore.isConnecting}
        loading={walletStore.isConnecting}
    >
        {#if walletStore.isConnecting}
            Connecting...
        {:else}
            <Wallet class="w-4 h-4 mr-1" />
            Connect Wallet
        {/if}
    </ZenButton>
{/if}
