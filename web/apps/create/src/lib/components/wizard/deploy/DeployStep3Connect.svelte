<script lang="ts">
    import { walletStore } from '@zarf/ui/stores/walletStore.svelte';
    import { deployStore } from '../../../stores/deployStore.svelte';
    import { wizardStore } from '../../../stores/wizardStore.svelte';
    // Contracts module dynamic-imported inside checkTokenBalance so the
    // stellar-sdk + buffer closure doesn't load at SSR module evaluation.
    import { formatTokenAmount, parseTokenAmount } from '@zarf/core/utils/amount';
    import { Wallet, CheckCircle2, AlertCircle, LogOut, CreditCard, Coins } from 'lucide-svelte';
    import ZenCard from '@zarf/ui/components/ui/ZenCard.svelte';
    import ZenButton from '@zarf/ui/components/ui/ZenButton.svelte';
    import ZenAlert from '@zarf/ui/components/ui/ZenAlert.svelte';
    import ZenBadge from '@zarf/ui/components/ui/ZenBadge.svelte';
    import ZenSpinner from '@zarf/ui/components/ui/ZenSpinner.svelte';
    import { toMessage } from '@zarf/core/utils/error';
    import { err } from '@zarf/core/utils/log';
    import { formatAmount } from '@zarf/core/utils/format';

    let distribution = $derived(deployStore.distribution);

    const showNetworkName = $derived(walletStore.isConnected && walletStore.networkName);
    const showBalanceCheck = $derived(walletStore.isConnected && distribution !== null);

    let checkState = $state({
        isLoading: false,
        balance: BigInt(0),
        symbol: '',
        decimals: 7,
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
            const tokenAddress = wizardStore.tokenDetails.tokenAddress;
            if (!tokenAddress) throw new Error('No token address configured');

            const { getTokenBalance, readTokenContract } = await import('@zarf/core/contracts');
            const metadata = await readTokenContract(tokenAddress);
            const decimals = metadata.decimals ?? wizardStore.tokenDetails.tokenDecimals ?? 7;
            const symbol = metadata.symbol ?? wizardStore.tokenDetails.tokenSymbol ?? 'XLM';
            const balance = await getTokenBalance(tokenAddress, walletStore.address);
            const requiredAmount = parseTokenAmount(distribution.amount, decimals);

            checkState.balance = balance;
            checkState.decimals = decimals;
            checkState.symbol = symbol;
            checkState.hasEnoughBalance = balance >= requiredAmount;
        } catch (e: unknown) {
            err('Balance check failed:', e);
            const msg = toMessage(e, 'Failed to fetch token balance. Please try again.');
            if (msg.includes('NetworkError') || msg.includes('fetch')) {
                checkState.error =
                    'Network error connecting to Stellar RPC. Please check your internet connection and try again.';
            } else {
                checkState.error = msg;
            }
        } finally {
            checkState.isLoading = false;
        }
    }

    async function handleConnect() {
        try {
            await walletStore.requestConnection();
        } catch (e) {
            err('Connection failed:', e);
        }
    }

    async function handleDisconnect() {
        await walletStore.disconnect();
    }
</script>

<div class="max-w-2xl py-4">
    <div class="mb-8 flex items-start gap-4">
        <div class="relative flex items-center justify-center shrink-0">
            <div
                class="absolute w-14 h-14 rounded-full bg-zen-primary/10 blur-md animate-pulse"
            ></div>
            <div
                class="w-12 h-12 rounded-xl border border-zen-border bg-zen-bg-elevated flex items-center justify-center relative animate-float text-zen-primary"
            >
                <Wallet class="w-5 h-5" />
            </div>
        </div>
        <div>
            <h2 class="text-2xl font-bold">Connect Wallet</h2>
            <p class="text-zen-fg-muted mt-1">
                Connect the wallet that holds the tokens you want to distribute to your recipients.
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
            <div class="flex flex-col sm:flex-row items-center justify-between gap-6">
                <div class="flex items-center gap-4 w-full sm:w-auto">
                    <div class="relative flex items-center justify-center">
                        <div
                            class="absolute w-16 h-16 rounded-full blur-xl animate-pulse-glow
                            {walletStore.isConnected ? 'bg-zen-success/15' : 'bg-zen-fg/5'}"
                        ></div>
                        <div
                            class="w-14 h-14 rounded-full border flex items-center justify-center relative animate-float transition-all duration-300
                            {walletStore.isConnected
                                ? 'border-zen-success/30 bg-zen-bg-elevated text-zen-success'
                                : 'border-zen-border bg-zen-bg-elevated/50 text-zen-fg-faint'}"
                        >
                            {#if walletStore.isConnected}
                                <Wallet class="w-5 h-5" />
                            {:else}
                                <CreditCard class="w-5 h-5" />
                            {/if}
                        </div>
                        {#if walletStore.isConnected}
                            <div class="absolute -bottom-1 -right-1 bg-zen-bg rounded-full p-1">
                                <div
                                    class="w-4 h-4 bg-zen-success rounded-full border-2 border-zen-bg"
                                ></div>
                            </div>
                        {/if}
                    </div>

                    <div>
                        <h3 class="font-bold text-lg">
                            {walletStore.isConnected ? 'Wallet Connected' : 'No Wallet Connected'}
                        </h3>
                        {#if walletStore.isConnected}
                            <p
                                class="font-mono text-sm text-zen-fg-muted bg-zen-fg/5 px-2 py-0.5 rounded text-center sm:text-left mt-1 inline-block"
                            >
                                {walletStore.shortAddress}
                            </p>
                        {:else}
                            <p class="text-sm text-zen-fg-muted">Connect your wallet to proceed</p>
                        {/if}
                        {#if showNetworkName}
                            <div class="flex items-center gap-1.5 mt-2 text-xs text-zen-fg-subtle">
                                <div class="w-1.5 h-1.5 rounded-full bg-zen-fg-subtle"></div>
                                {walletStore.networkName}
                            </div>
                        {/if}
                    </div>
                </div>

                <div class="flex flex-col items-stretch sm:items-end gap-2 w-full sm:w-auto">
                    {#if !walletStore.isConnected}
                        <ZenButton
                            variant="primary"
                            size="lg"
                            class="min-w-[160px]"
                            onclick={handleConnect}
                            disabled={walletStore.isConnecting}
                            loading={walletStore.isConnecting}
                        >
                            {walletStore.isConnecting ? 'Connecting...' : 'Connect Wallet'}
                        </ZenButton>
                    {:else}
                        <div class="flex items-center justify-center sm:justify-end gap-2 w-full">
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
                            <ZenButton variant="ghost" size="sm" onclick={handleDisconnect}>
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
                        Please switch Freighter to the configured Stellar network.
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
                    <div class="p-12 flex flex-col items-center justify-center text-center gap-4">
                        <div
                            class="w-12 h-12 bg-zen-fg/5 rounded-full flex items-center justify-center"
                        >
                            <ZenSpinner size="md" />
                        </div>
                        <p class="text-sm text-zen-fg-subtle">Verifying token balance...</p>
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
                                    {formatTokenAmount(checkState.balance, checkState.decimals)}
                                    <span
                                        class="text-lg text-zen-fg-faint ml-1 font-sans font-normal"
                                        >{checkState.symbol}</span
                                    >
                                </div>
                            </div>

                            <!-- Required Amount -->
                            <div class="p-6 sm:p-8 flex flex-col gap-1 bg-zen-fg/5">
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
                                    {formatAmount(distribution?.amount ?? 0)}
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
                                    >Insufficient balance to fund this distribution.</span
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

<style>
    @keyframes float {
        0%,
        100% {
            transform: translateY(0px);
        }
        50% {
            transform: translateY(-4px);
        }
    }

    @keyframes pulse-glow {
        0%,
        100% {
            opacity: 0.35;
            transform: scale(0.95);
        }
        50% {
            opacity: 0.65;
            transform: scale(1.05);
        }
    }

    .animate-float {
        animation: float 4s ease-in-out infinite;
    }

    .animate-pulse-glow {
        animation: pulse-glow 3s ease-in-out infinite;
    }
</style>
