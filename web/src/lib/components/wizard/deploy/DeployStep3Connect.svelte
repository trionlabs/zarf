<script lang="ts">
    import { walletStore } from "$lib/stores/walletStore.svelte";
    import { wagmiConfig } from "$lib/contracts/wallet";
    import { deployStore } from "$lib/stores/deployStore.svelte";
    import { getPublicClient } from "@wagmi/core";
    import { ERC20ABI } from "$lib/contracts/abis/ERC20";
    import type { Address } from "viem";
    import { formatUnits } from "viem";

    // Distribution from deploy store
    let distribution = $derived(deployStore.distribution);

    // Balance check state
    let checkState = $state({
        isLoading: false,
        balance: BigInt(0),
        symbol: "",
        decimals: 18,
        hasEnoughBalance: false,
        error: null as string | null,
    });

    // Sync wallet state to deploy store
    $effect(() => {
        if (walletStore.isConnected && walletStore.address) {
            deployStore.setWalletState(true, walletStore.address);
        } else {
            deployStore.setWalletState(false, null);
        }
    });

    // Check balance when connected
    $effect(() => {
        if (walletStore.isConnected && walletStore.address && distribution) {
            checkTokenBalance();
        }
    });

    async function checkTokenBalance() {
        if (!walletStore.address || !distribution) return;

        checkState.isLoading = true;
        checkState.error = null;

        try {
            const client = getPublicClient(wagmiConfig);
            if (!client) throw new Error("No public client available");

            const tokenAddress = (distribution as any).tokenDetails
                ?.tokenAddress as Address;
            if (!tokenAddress) throw new Error("No token address configured");

            const [balance, decimals, symbol] = await Promise.all([
                client.readContract({
                    address: tokenAddress,
                    abi: ERC20ABI,
                    functionName: "balanceOf",
                    args: [walletStore.address],
                }),
                client.readContract({
                    address: tokenAddress,
                    abi: ERC20ABI,
                    functionName: "decimals",
                }),
                client.readContract({
                    address: tokenAddress,
                    abi: ERC20ABI,
                    functionName: "symbol",
                }),
            ]);

            const requiredAmount = BigInt(distribution.amount);

            checkState.balance = balance as bigint;
            checkState.decimals = decimals as number;
            checkState.symbol = symbol as string;
            checkState.hasEnoughBalance = (balance as bigint) >= requiredAmount;
        } catch (e: any) {
            console.error("Balance check failed:", e);
            checkState.error =
                e.message ||
                "Failed to fetch token balance. Is the contract address correct?";
        } finally {
            checkState.isLoading = false;
        }
    }

    async function handleConnect() {
        try {
            await walletStore.connect();
        } catch (e) {
            // Error is managed in store
            console.error("Connection failed:", e);
        }
    }

    async function handleDisconnect() {
        await walletStore.disconnect();
    }
</script>

<div class="p-8">
    <div class="mb-6">
        <h2 class="text-2xl font-bold mb-2">Connect Wallet</h2>
        <p class="text-base-content/70">
            Connect the wallet that holds the tokens you want to distribute.
        </p>
    </div>

    <!-- 1. Wallet Connection -->
    <div class="card bg-base-100 border border-base-300 shadow-sm mb-6">
        <div class="card-body">
            <div class="flex items-center justify-between">
                <div class="flex items-center gap-3">
                    <div
                        class="w-10 h-10 rounded-full flex items-center justify-center {walletStore.isConnected
                            ? 'bg-success/10 text-success'
                            : 'bg-base-300 text-base-content/50'}"
                    >
                        {#if walletStore.isConnected}
                            ●
                        {:else}
                            ?
                        {/if}
                    </div>
                    <div>
                        <h3 class="font-bold">
                            {walletStore.isConnected
                                ? "Wallet Connected"
                                : "No Wallet Connected"}
                        </h3>
                        <p class="text-sm font-mono opacity-60">
                            {walletStore.isConnected
                                ? walletStore.shortAddress
                                : "Please connect your wallet"}
                        </p>
                        {#if walletStore.isConnected && walletStore.networkName}
                            <p class="text-xs opacity-40">
                                {walletStore.networkName}
                            </p>
                        {/if}
                    </div>
                </div>

                {#if !walletStore.isConnected}
                    <button
                        class="btn btn-primary"
                        onclick={handleConnect}
                        disabled={walletStore.isConnecting}
                    >
                        {#if walletStore.isConnecting}
                            <span class="loading loading-spinner"></span>
                        {:else}
                            Connect Wallet
                        {/if}
                    </button>
                {:else}
                    <div class="flex items-center gap-2">
                        {#if walletStore.isWrongNetwork}
                            <div class="badge badge-error badge-outline">
                                Wrong Network
                            </div>
                        {:else}
                            <div class="badge badge-success badge-outline">
                                Connected
                            </div>
                        {/if}
                        <button
                            class="btn btn-ghost btn-sm"
                            onclick={handleDisconnect}
                        >
                            Disconnect
                        </button>
                    </div>
                {/if}
            </div>

            {#if walletStore.error}
                <div class="text-error text-sm mt-2">{walletStore.error}</div>
            {/if}

            {#if walletStore.isWrongNetwork}
                <div class="alert alert-warning mt-3">
                    <span
                        >⚠️ Please switch to Ethereum Mainnet or Sepolia Testnet</span
                    >
                </div>
            {/if}
        </div>
    </div>

    <!-- 2. Token Balance Check -->
    {#if walletStore.isConnected && distribution}
        <div class="card bg-base-100 border border-base-300 shadow-sm">
            <div class="card-body">
                <h3 class="card-title text-sm uppercase opacity-50">
                    Token Balance Check
                </h3>

                {#if checkState.isLoading}
                    <div class="flex items-center gap-2 py-4">
                        <span class="loading loading-spinner loading-sm"></span>
                        <span>Checking balance...</span>
                    </div>
                {:else if checkState.error}
                    <div class="alert alert-error text-sm">
                        {checkState.error}
                    </div>
                {:else if checkState.symbol}
                    <div class="flex items-center justify-between py-2">
                        <div>
                            <div class="text-2xl font-mono font-bold">
                                {Number(
                                    formatUnits(
                                        checkState.balance,
                                        checkState.decimals,
                                    ),
                                ).toLocaleString()}
                                {checkState.symbol}
                            </div>
                            <div class="text-xs opacity-50">Your Balance</div>
                        </div>
                        <div class="text-right">
                            <div
                                class="text-xl font-mono font-bold {checkState.hasEnoughBalance
                                    ? 'text-success'
                                    : 'text-error'}"
                            >
                                {Number(distribution.amount).toLocaleString()}
                                {checkState.symbol}
                            </div>
                            <div class="text-xs opacity-50">
                                Required Amount
                            </div>
                        </div>
                    </div>

                    {#if !checkState.hasEnoughBalance}
                        <div class="alert alert-error mt-4">
                            <span
                                >⚠️ You do not have enough tokens to fund this
                                distribution.</span
                            >
                        </div>
                    {:else}
                        <div
                            class="alert alert-success bg-success/10 mt-4 border-none"
                        >
                            <span>✅ Sufficient balance available.</span>
                        </div>
                    {/if}
                {/if}
            </div>
        </div>
    {/if}
</div>
