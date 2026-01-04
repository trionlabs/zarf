<script lang="ts">
    import { walletStore } from "$lib/stores/walletStore.svelte";
    import { wagmiConfig } from "$lib/contracts/wallet";
    import { deployStore } from "$lib/stores/deployStore.svelte";
    import { wizardStore } from "$lib/stores/wizardStore.svelte";
    import { getPublicClient } from "@wagmi/core";
    import { ERC20ABI } from "$lib/contracts/abis/ERC20";
    import type { Address } from "viem";
    import { formatUnits } from "viem";
    import {
        Wallet,
        Loader2,
        CheckCircle2,
        AlertCircle,
        LogOut,
        CreditCard,
        Coins,
    } from "lucide-svelte";

    // Distribution from deploy store
    let distribution = $derived(deployStore.distribution);

    // Clean Markup: Extract template logic to $derived
    const showNetworkName = $derived(
        walletStore.isConnected && walletStore.networkName,
    );
    const showBalanceCheck = $derived(
        walletStore.isConnected && distribution !== null,
    );

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

            const tokenAddress = wizardStore.tokenDetails.tokenAddress;
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
            await walletStore.requestConnection();
        } catch (e) {
            // Error is managed in store
            console.error("Connection failed:", e);
        }
    }

    async function handleDisconnect() {
        await walletStore.disconnect();
    }
</script>

<div class="max-w-2xl py-4">
    <div class="mb-8 flex items-start gap-4">
        <div
            class="w-12 h-12 rounded-2xl bg-primary/10 text-primary flex items-center justify-center shrink-0"
        >
            <Wallet class="w-6 h-6" />
        </div>
        <div>
            <h2 class="text-2xl font-bold text-base-content">Connect Wallet</h2>
            <p class="text-base-content/60 mt-1">
                Connect the wallet that holds the tokens you want to distribute
                to your recipients.
            </p>
        </div>
    </div>

    <!-- 1. Wallet Connection -->
    <div
        class="card bg-base-100 shadow-xl shadow-base-200/50 border border-base-200 overflow-hidden group transition-all duration-300 hover:shadow-2xl hover:shadow-base-200/50 hover:-translate-y-0.5"
    >
        <!-- Status Indicator Bar -->
        <div
            class="h-1 w-full {walletStore.isConnected
                ? 'bg-success'
                : 'bg-base-300'} transition-colors duration-300"
        ></div>

        <div class="card-body p-6 sm:p-8">
            <div
                class="flex flex-col sm:flex-row items-center justify-between gap-6"
            >
                <div class="flex items-center gap-4 w-full sm:w-auto">
                    <div class="relative">
                        <div
                            class="w-14 h-14 rounded-full flex items-center justify-center
                            {walletStore.isConnected
                                ? 'bg-success/10 text-success'
                                : 'bg-base-200/50 text-base-content/30'} 
                            transition-colors duration-300"
                        >
                            {#if walletStore.isConnected}
                                <Wallet class="w-6 h-6" />
                            {:else}
                                <CreditCard class="w-6 h-6" />
                            {/if}
                        </div>
                        {#if walletStore.isConnected}
                            <div
                                class="absolute -bottom-1 -right-1 bg-base-100 rounded-full p-1 border border-base-100"
                            >
                                <div
                                    class="w-4 h-4 bg-success rounded-full border-2 border-base-100 indicator-item"
                                ></div>
                            </div>
                        {/if}
                    </div>

                    <div>
                        <h3 class="font-bold text-lg">
                            {walletStore.isConnected
                                ? "Wallet Connected"
                                : "No Wallet Connected"}
                        </h3>
                        {#if walletStore.isConnected}
                            <p
                                class="font-mono text-sm opacity-60 bg-base-200/50 px-2 py-0.5 rounded text-center sm:text-left mt-1 inline-block"
                            >
                                {walletStore.shortAddress}
                            </p>
                        {:else}
                            <p class="text-sm opacity-60 text-balance">
                                Connect your wallet to proceed
                            </p>
                        {/if}
                        {#if showNetworkName}
                            <div
                                class="flex items-center gap-1.5 mt-2 text-xs opacity-50"
                            >
                                <div
                                    class="w-1.5 h-1.5 rounded-full bg-base-content/50"
                                ></div>
                                {walletStore.networkName}
                            </div>
                        {/if}
                    </div>
                </div>

                <div
                    class="flex flex-col items-stretch sm:items-end gap-2 w-full sm:w-auto"
                >
                    {#if !walletStore.isConnected}
                        <button
                            class="btn btn-primary btn-lg shadow-md shadow-primary/10 min-w-[160px] disabled:shadow-none"
                            onclick={handleConnect}
                            disabled={walletStore.isConnecting}
                        >
                            {#if walletStore.isConnecting}
                                <Loader2 class="w-5 h-5 animate-spin" />
                                Connecting...
                            {:else}
                                Connect Wallet
                            {/if}
                        </button>
                    {:else}
                        <div
                            class="flex items-center justify-center sm:justify-end gap-2 w-full"
                        >
                            {#if walletStore.isWrongNetwork}
                                <div class="badge badge-error gap-1 py-3 px-4">
                                    <AlertCircle class="w-4 h-4" />
                                    Wrong Network
                                </div>
                            {:else}
                                <div
                                    class="badge badge-success badge-soft gap-1 py-3 px-4"
                                >
                                    <CheckCircle2 class="w-4 h-4" />
                                    Connected
                                </div>
                            {/if}
                            <button
                                class="btn btn-sm btn-ghost border border-base-content/10 hover:bg-base-content/5 hover:border-base-content/20 gap-2 font-normal text-base-content/70"
                                onclick={handleDisconnect}
                            >
                                <LogOut class="w-4 h-4" />
                                Switch Wallet
                            </button>
                        </div>
                    {/if}
                </div>
            </div>

            {#if walletStore.error}
                <div
                    class="mt-4 p-3 bg-error/10 text-error rounded-xl text-sm flex items-start gap-2"
                >
                    <AlertCircle class="w-5 h-5 shrink-0 mt-0.5" />
                    <span>{walletStore.error}</span>
                </div>
            {/if}

            {#if walletStore.isWrongNetwork}
                <div
                    class="mt-4 p-3 bg-warning/10 text-warning-content rounded-xl text-sm flex items-start gap-2 border border-warning/20"
                >
                    <AlertCircle class="w-5 h-5 shrink-0 mt-0.5 text-warning" />
                    <span
                        >Please switch to Ethereum Mainnet or Sepolia Testnet to
                        continue.</span
                    >
                </div>
            {/if}
        </div>
    </div>

    <!-- 2. Token Balance Check -->
    {#if showBalanceCheck}
        <div class="relative mt-6">
            <div
                class="absolute inset-0 bg-gradient-to-b from-base-200/50 to-transparent rounded-3xl -z-10 blur-xl opacity-50"
            ></div>

            <div
                class="card bg-base-100 border border-base-200 shadow-sm relative overflow-hidden"
            >
                {#if checkState.isLoading}
                    <div
                        class="card-body py-12 flex flex-col items-center justify-center text-center gap-4 animate-pulse"
                    >
                        <div
                            class="w-12 h-12 bg-base-200 rounded-full flex items-center justify-center"
                        >
                            <Loader2 class="w-6 h-6 animate-spin opacity-50" />
                        </div>
                        <div>
                            <div
                                class="h-4 w-32 bg-base-200 rounded mx-auto mb-2"
                            ></div>
                            <p class="text-sm opacity-50">
                                Verifying token balance...
                            </p>
                        </div>
                    </div>
                {:else if checkState.error}
                    <div class="card-body">
                        <div class="alert alert-error shadow-sm">
                            <AlertCircle class="w-6 h-6" />
                            <div>
                                <h3 class="font-bold">Check Failed</h3>
                                <div class="text-xs">{checkState.error}</div>
                            </div>
                        </div>
                    </div>
                {:else if checkState.symbol}
                    <div class="card-body p-0">
                        <div
                            class="grid grid-cols-1 sm:grid-cols-2 divide-y sm:divide-y-0 sm:divide-x divide-base-200"
                        >
                            <!-- Current Balance -->
                            <div class="p-6 sm:p-8 flex flex-col gap-1">
                                <span
                                    class="text-sm uppercase tracking-wider opacity-50 font-semibold flex items-center gap-2"
                                >
                                    <Wallet class="w-4 h-4" /> Your Balance
                                </span>
                                <div
                                    class="text-3xl sm:text-4xl font-mono font-bold tracking-tight text-base-content mt-2 truncate"
                                >
                                    {Number(
                                        formatUnits(
                                            checkState.balance,
                                            checkState.decimals,
                                        ),
                                    ).toLocaleString(undefined, {
                                        maximumFractionDigits: 4,
                                    })}
                                    <span
                                        class="text-lg text-base-content/40 ml-1 font-sans font-normal"
                                        >{checkState.symbol}</span
                                    >
                                </div>
                            </div>

                            <!-- Required Amount -->
                            <div
                                class="p-6 sm:p-8 flex flex-col gap-1 bg-base-200/30"
                            >
                                <span
                                    class="text-sm uppercase tracking-wider opacity-50 font-semibold flex items-center gap-2"
                                >
                                    <Coins class="w-4 h-4" /> Required
                                </span>
                                <div
                                    class="text-3xl sm:text-4xl font-mono font-bold tracking-tight mt-2 truncate {checkState.hasEnoughBalance
                                        ? 'text-success'
                                        : 'text-error'}"
                                >
                                    {Number(
                                        distribution?.amount ?? 0,
                                    ).toLocaleString()}
                                    <span
                                        class="text-lg opacity-40 ml-1 font-sans font-normal text-base-content"
                                        >{checkState.symbol}</span
                                    >
                                </div>
                            </div>
                        </div>

                        <!-- Status Footer -->
                        {#if !checkState.hasEnoughBalance}
                            <div
                                class="p-4 bg-error/10 border-t border-error/10 flex items-center gap-3 text-error"
                            >
                                <AlertCircle class="w-5 h-5 shrink-0" />
                                <span class="font-medium text-sm"
                                    >Insufficient balance to fund this
                                    distribution.</span
                                >
                            </div>
                        {:else}
                            <div
                                class="p-4 bg-success/10 border-t border-success/10 flex items-center gap-3 text-success"
                            >
                                <CheckCircle2 class="w-5 h-5 shrink-0" />
                                <span class="font-medium text-sm"
                                    >You have sufficient funds to proceed.</span
                                >
                            </div>
                        {/if}
                    </div>
                {/if}
            </div>
        </div>
    {/if}
</div>
