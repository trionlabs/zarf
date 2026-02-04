<script lang="ts">
    import { walletStore } from "@zarf/ui/stores/walletStore.svelte";
    import { wagmiConfig } from "@zarf/core/contracts/wallet";
    import { deployStore } from "../../../stores/deployStore.svelte";
    import { wizardStore } from "../../../stores/wizardStore.svelte";
    import { getWalletClient } from "@wagmi/core";
    import { ERC20ABI } from "@zarf/core/contracts/abis/ERC20";
    import type { Address } from "viem";
    import { formatUnits, publicActions } from "viem";
    import {
        Wallet,
        Loader2,
        CheckCircle2,
        AlertCircle,
        LogOut,
        CreditCard,
        Coins,
    } from "lucide-svelte";
    import ZenCard from "@zarf/ui/components/ui/ZenCard.svelte";
    import ZenButton from "@zarf/ui/components/ui/ZenButton.svelte";
    import ZenAlert from "@zarf/ui/components/ui/ZenAlert.svelte";
    import ZenBadge from "@zarf/ui/components/ui/ZenBadge.svelte";
    import ZenSpinner from "@zarf/ui/components/ui/ZenSpinner.svelte";

    let distribution = $derived(deployStore.distribution);

    const showNetworkName = $derived(
        walletStore.isConnected && walletStore.networkName,
    );
    const showBalanceCheck = $derived(
        walletStore.isConnected && distribution !== null,
    );

    let checkState = $state({
        isLoading: false,
        balance: BigInt(0),
        symbol: "",
        decimals: 18,
        hasEnoughBalance: false,
        error: null as string | null,
    });

    $effect(() => {
        if (walletStore.isConnected && walletStore.address) {
            deployStore.setWalletState(true, walletStore.address);
        } else {
            deployStore.setWalletState(false, null);
        }
    });

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
            // MASTERCLASS: Use wallet's RPC via publicActions extension
            // Routes reads through MetaMask - no CORS, no public RPC limits
            const walletClient = await getWalletClient(wagmiConfig);
            if (!walletClient) throw new Error("Wallet not connected");

            const client = walletClient.extend(publicActions);

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
            // Provide user-friendly error messages based on error type
            if (e.message?.includes('NetworkError') || e.message?.includes('fetch')) {
                checkState.error = "Network error connecting to RPC. Please check your internet connection and try again.";
            } else if (e.message?.includes('call revert') || e.message?.includes('execution reverted')) {
                checkState.error = "Token contract call failed. Is the contract address correct for this network?";
            } else {
                checkState.error = e.message || "Failed to fetch token balance. Please try again.";
            }
        } finally {
            checkState.isLoading = false;
        }
    }

    async function handleConnect() {
        try {
            await walletStore.requestConnection();
        } catch (e) {
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
            class="w-12 h-12 rounded-2xl bg-zen-fg/10 text-zen-fg flex items-center justify-center shrink-0"
        >
            <Wallet class="w-6 h-6" />
        </div>
        <div>
            <h2 class="text-2xl font-bold">Connect Wallet</h2>
            <p class="text-zen-fg-muted mt-1">
                Connect the wallet that holds the tokens you want to distribute
                to your recipients.
            </p>
        </div>
    </div>

    <!-- Wallet Connection Card -->
    <ZenCard variant="elevated" class="overflow-hidden">
        <!-- Status Indicator Bar -->
        <div
            class="h-1 w-full {walletStore.isConnected
                ? 'bg-zen-success'
                : 'bg-zen-border'} transition-colors duration-300"
        ></div>

        <div class="p-6 sm:p-8">
            <div
                class="flex flex-col sm:flex-row items-center justify-between gap-6"
            >
                <div class="flex items-center gap-4 w-full sm:w-auto">
                    <div class="relative">
                        <div
                            class="w-14 h-14 rounded-full flex items-center justify-center transition-colors duration-300
                            {walletStore.isConnected
                                ? 'bg-zen-success-muted text-zen-success'
                                : 'bg-zen-fg/5 text-zen-fg-faint'}"
                        >
                            {#if walletStore.isConnected}
                                <Wallet class="w-6 h-6" />
                            {:else}
                                <CreditCard class="w-6 h-6" />
                            {/if}
                        </div>
                        {#if walletStore.isConnected}
                            <div
                                class="absolute -bottom-1 -right-1 bg-zen-bg rounded-full p-1"
                            >
                                <div
                                    class="w-4 h-4 bg-zen-success rounded-full border-2 border-zen-bg"
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
                                class="font-mono text-sm text-zen-fg-muted bg-zen-fg/5 px-2 py-0.5 rounded text-center sm:text-left mt-1 inline-block"
                            >
                                {walletStore.shortAddress}
                            </p>
                        {:else}
                            <p class="text-sm text-zen-fg-muted">
                                Connect your wallet to proceed
                            </p>
                        {/if}
                        {#if showNetworkName}
                            <div
                                class="flex items-center gap-1.5 mt-2 text-xs text-zen-fg-subtle"
                            >
                                <div
                                    class="w-1.5 h-1.5 rounded-full bg-zen-fg-subtle"
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
                        <ZenButton
                            variant="primary"
                            size="lg"
                            class="min-w-[160px]"
                            onclick={handleConnect}
                            disabled={walletStore.isConnecting}
                            loading={walletStore.isConnecting}
                        >
                            {walletStore.isConnecting ? "Connecting..." : "Connect Wallet"}
                        </ZenButton>
                    {:else}
                        <div
                            class="flex items-center justify-center sm:justify-end gap-2 w-full"
                        >
                            {#if walletStore.isWrongNetwork}
                                <ZenBadge variant="error" size="lg">
                                    <AlertCircle class="w-4 h-4 mr-1" />
                                    Wrong Network
                                </ZenBadge>
                            {:else}
                                <ZenBadge variant="success" size="lg">
                                    <CheckCircle2 class="w-4 h-4 mr-1" />
                                    Connected
                                </ZenBadge>
                            {/if}
                            <ZenButton
                                variant="ghost"
                                size="sm"
                                onclick={handleDisconnect}
                            >
                                <LogOut class="w-4 h-4 mr-1" />
                                Switch
                            </ZenButton>
                        </div>
                    {/if}
                </div>
            </div>

            {#if walletStore.error}
                <div class="mt-4">
                    <ZenAlert variant="error">
                        {walletStore.error}
                    </ZenAlert>
                </div>
            {/if}

            {#if walletStore.isWrongNetwork}
                <div class="mt-4">
                    <ZenAlert variant="warning">
                        Please switch to Ethereum Mainnet or Sepolia Testnet to continue.
                    </ZenAlert>
                </div>
            {/if}
        </div>
    </ZenCard>

    <!-- Token Balance Check -->
    {#if showBalanceCheck}
        <div class="mt-6">
            <ZenCard variant="bordered" class="overflow-hidden">
                {#if checkState.isLoading}
                    <div
                        class="p-12 flex flex-col items-center justify-center text-center gap-4"
                    >
                        <div
                            class="w-12 h-12 bg-zen-fg/5 rounded-full flex items-center justify-center"
                        >
                            <ZenSpinner size="md" />
                        </div>
                        <p class="text-sm text-zen-fg-subtle">
                            Verifying token balance...
                        </p>
                    </div>
                {:else if checkState.error}
                    <div class="p-6">
                        <ZenAlert variant="error">
                            {#snippet title()}Check Failed{/snippet}
                            {checkState.error}
                        </ZenAlert>
                    </div>
                {:else if checkState.symbol}
                    <div class="p-0">
                        <div
                            class="grid grid-cols-1 sm:grid-cols-2 divide-y sm:divide-y-0 sm:divide-x divide-zen-border-subtle"
                        >
                            <!-- Current Balance -->
                            <div class="p-6 sm:p-8 flex flex-col gap-1">
                                <span
                                    class="text-sm uppercase tracking-wider text-zen-fg-subtle font-semibold flex items-center gap-2"
                                >
                                    <Wallet class="w-4 h-4" /> Your Balance
                                </span>
                                <div
                                    class="text-3xl sm:text-4xl font-mono font-bold tracking-tight mt-2 truncate"
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
                                        class="text-lg text-zen-fg-faint ml-1 font-sans font-normal"
                                        >{checkState.symbol}</span
                                    >
                                </div>
                            </div>

                            <!-- Required Amount -->
                            <div
                                class="p-6 sm:p-8 flex flex-col gap-1 bg-zen-fg/5"
                            >
                                <span
                                    class="text-sm uppercase tracking-wider text-zen-fg-subtle font-semibold flex items-center gap-2"
                                >
                                    <Coins class="w-4 h-4" /> Required
                                </span>
                                <div
                                    class="text-3xl sm:text-4xl font-mono font-bold tracking-tight mt-2 truncate {checkState.hasEnoughBalance
                                        ? 'text-zen-success'
                                        : 'text-zen-error'}"
                                >
                                    {Number(
                                        distribution?.amount ?? 0,
                                    ).toLocaleString()}
                                    <span
                                        class="text-lg text-zen-fg-faint ml-1 font-sans font-normal"
                                        >{checkState.symbol}</span
                                    >
                                </div>
                            </div>
                        </div>

                        <!-- Status Footer -->
                        {#if !checkState.hasEnoughBalance}
                            <div
                                class="p-4 bg-zen-error-muted border-t-[0.5px] border-zen-error/10 flex items-center gap-3 text-zen-error"
                            >
                                <AlertCircle class="w-5 h-5 shrink-0" />
                                <span class="font-medium text-sm"
                                    >Insufficient balance to fund this
                                    distribution.</span
                                >
                            </div>
                        {:else}
                            <div
                                class="p-4 bg-zen-success-muted border-t-[0.5px] border-zen-success/10 flex items-center gap-3 text-zen-success"
                            >
                                <CheckCircle2 class="w-5 h-5 shrink-0" />
                                <span class="font-medium text-sm"
                                    >You have sufficient funds to proceed.</span
                                >
                            </div>
                        {/if}
                    </div>
                {/if}
            </ZenCard>
        </div>
    {/if}
</div>
