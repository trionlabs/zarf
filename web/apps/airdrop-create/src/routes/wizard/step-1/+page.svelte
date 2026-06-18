<script lang="ts">
    import { onMount } from 'svelte';
    import { goto } from '$app/navigation';
    import {
        ArrowLeft,
        ArrowRight,
        Wallet,
        Coins,
        AlertCircle,
        CheckCircle2,
        Lock,
        Unlock,
        Loader2,
    } from 'lucide-svelte';
    import ZenButton from '@zarf/ui/components/ui/ZenButton.svelte';
    import ZenCard from '@zarf/ui/components/ui/ZenCard.svelte';
    import ZenCheckbox from '@zarf/ui/components/ui/ZenCheckbox.svelte';
    import { walletStore } from '@zarf/ui/stores/walletStore.svelte';
    import { isValidAddressShape } from '@zarf/core/utils/addressShape';
    import {
        parseTokenAmount,
        formatTokenAmount,
        isPositiveAmountString,
        isValidTokenAmount,
    } from '@zarf/core/utils/amount';
    import { getTokenBalanceRpc } from '@zarf/core/contracts';
    import { warn } from '@zarf/core/utils/log';
    import { campaignStore } from '$lib/stores/campaignStore.svelte';
    import { normalizeAirdropAddress } from '$lib/csv/airdropCsv';
    import { findDuplicateAddresses } from '$lib/recipients';
    import RecipientGrid from '$lib/components/RecipientGrid.svelte';
    import type { RecipientRow, StellarAddress, StellarContractId } from '$lib/stores/types';

    let recipients = $state<RecipientRow[]>(campaignStore.recipients.map((r) => ({ ...r })));
    let noDeadline = $state(campaignStore.deadline === 0);
    let deadlineLocal = $state('');
    let locked = $state(campaignStore.locked);

    let balance = $state<bigint | null>(null);
    let balanceLoading = $state(false);
    let balanceError = $state<string | null>(null);
    let balanceKey: string | null = null;

    const decimals = $derived(campaignStore.tokenDetails.tokenDecimals);
    const symbol = $derived(campaignStore.tokenDetails.tokenSymbol ?? 'tokens');

    onMount(() => {
        campaignStore.goToStep(1);
        if (campaignStore.deadline > 0) {
            // Render the stored unix-seconds deadline back into a local datetime-local value.
            const d = new Date(campaignStore.deadline * 1000);
            const pad = (n: number) => String(n).padStart(2, '0');
            deadlineLocal = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
        }
    });

    // Persist the draft list as it changes (recovers on reload).
    $effect(() => {
        campaignStore.setRecipients(recipients.map((r) => ({ ...r })));
    });

    // ---- Validation ----------------------------------------------------------
    const dupAddrs = $derived(findDuplicateAddresses(recipients));
    const allRowsValid = $derived(
        recipients.length > 0 &&
            recipients.every(
                (r) =>
                    isValidAddressShape(normalizeAirdropAddress(r.address)) &&
                    // Full check once decimals are known (precision + i128 range);
                    // grammar-only while the token is still loading.
                    (decimals === null
                        ? isPositiveAmountString(r.amount)
                        : isValidTokenAmount(r.amount, decimals)) &&
                    !dupAddrs.has(normalizeAirdropAddress(r.address)),
            ),
    );

    const nowSeconds = Math.floor(Date.now() / 1000);
    const deadlineSeconds = $derived(
        noDeadline || !deadlineLocal ? 0 : Math.floor(new Date(deadlineLocal).getTime() / 1000),
    );
    const deadlineInPast = $derived(
        !noDeadline && deadlineSeconds > 0 && deadlineSeconds <= nowSeconds,
    );
    const deadlineMissing = $derived(!noDeadline && !deadlineLocal);

    // Required funding in base units (null = decimals unknown or invalid amounts).
    const requiredBase = $derived.by(() => {
        if (decimals === null) return null;
        try {
            return recipients.reduce((sum, r) => {
                if (!isPositiveAmountString(r.amount)) return sum;
                return sum + parseTokenAmount(r.amount, decimals);
            }, 0n);
        } catch {
            return null; // e.g. an amount with more decimal places than the token allows
        }
    });

    const hasEnough = $derived(
        balance !== null && requiredBase !== null && balance >= requiredBase,
    );

    const canContinue = $derived(allRowsValid && !deadlineInPast && !deadlineMissing);

    // Fetch balance once per (wallet, token); hasEnough recomputes live as amounts change.
    $effect(() => {
        const source = walletStore.address as StellarAddress | null;
        const token = campaignStore.tokenDetails.tokenAddress;
        if (!source || !token) return;
        const key = `${source}:${token}`;
        if (key === balanceKey) return;
        balanceKey = key;
        balance = null;
        balanceError = null;
        balanceLoading = true;
        getTokenBalanceRpc(source, token as StellarContractId, source)
            .then((b) => {
                balance = b;
            })
            .catch((e) => {
                balanceError = 'Could not read your balance from the network.';
                warn('[step-1] balance read failed', e);
            })
            .finally(() => {
                balanceLoading = false;
            });
    });

    function commitDeadline() {
        campaignStore.setDeadline(deadlineSeconds);
    }
    function commitLocked() {
        campaignStore.setLocked(locked);
    }

    function handleBack() {
        campaignStore.previousStep();
        goto('/wizard/step-0');
    }
    function handleNext() {
        if (!canContinue) return;
        campaignStore.setRecipients(recipients.map((r) => ({ ...r })));
        campaignStore.setDeadline(deadlineSeconds);
        campaignStore.setLocked(locked);
        campaignStore.nextStep();
        goto('/wizard/step-2');
    }
</script>

<div class="mx-auto max-w-3xl space-y-8 py-8">
    <header>
        <h1 class="text-2xl font-semibold tracking-tight text-zen-fg">Recipients</h1>
        <p class="mt-1 text-sm text-zen-fg-muted">
            Add the wallet addresses and amounts. Each address claims its share from the published
            list.
        </p>
    </header>

    <RecipientGrid bind:recipients tokenSymbol={symbol} />

    <!-- Deadline -->
    <ZenCard class="space-y-4 p-5">
        <div class="flex items-center justify-between">
            <div>
                <h2 class="text-sm font-semibold text-zen-fg">Claim deadline</h2>
                <p class="text-xs text-zen-fg-muted">
                    After the deadline, unclaimed funds can be reclaimed by you.
                </p>
            </div>
            <ZenCheckbox bind:checked={noDeadline} label="No deadline" onchange={commitDeadline} />
        </div>
        {#if !noDeadline}
            <input
                type="datetime-local"
                bind:value={deadlineLocal}
                onchange={commitDeadline}
                aria-label="Claim deadline"
                aria-invalid={deadlineInPast || deadlineMissing}
                class="w-full rounded-lg border border-zen-border-subtle bg-zen-bg px-3 py-2 text-sm text-zen-fg focus:outline-none focus:ring-1 focus:ring-zen-fg/30"
            />
            {#if deadlineInPast}
                <p class="text-xs text-zen-error">The deadline must be in the future.</p>
            {/if}
        {/if}
    </ZenCard>

    <!-- Locked toggle (02 §3.7 trust matrix) -->
    <ZenCard class="space-y-3 p-5">
        <div class="flex items-start gap-3">
            <div class="mt-0.5 text-zen-fg-muted">
                {#if locked}<Lock class="h-5 w-5" />{:else}<Unlock class="h-5 w-5" />{/if}
            </div>
            <div class="flex-1">
                <h2 class="text-sm font-semibold text-zen-fg">Lock funds until the deadline</h2>
                <p class="text-xs text-zen-fg-muted">
                    {#if locked}
                        <strong class="text-zen-fg">On.</strong> You
                        <strong>cannot</strong> withdraw funds before the deadline — recipients are guaranteed
                        the window to claim. Strongest trust signal.
                    {:else}
                        <strong class="text-zen-fg">Off.</strong> You can reclaim unclaimed funds at any
                        time. More flexible, weaker guarantee for recipients.
                    {/if}
                </p>
                {#if locked && noDeadline}
                    <p class="mt-1 text-xs text-zen-warning">
                        With no deadline, locked funds can never be reclaimed.
                    </p>
                {/if}
            </div>
            <ZenCheckbox bind:checked={locked} label="" onchange={commitLocked} />
        </div>
    </ZenCard>

    <!-- Balance check -->
    {#if walletStore.isConnected}
        <ZenCard variant="bordered" class="overflow-hidden p-0">
            {#if balanceLoading}
                <div class="flex items-center justify-center gap-3 p-6 text-sm text-zen-fg-subtle">
                    <Loader2 class="h-4 w-4 animate-spin" /> Checking your balance…
                </div>
            {:else if balanceError}
                <div class="p-4 text-sm text-zen-warning">{balanceError}</div>
            {:else if decimals === null}
                <div class="p-4 text-xs text-zen-fg-muted">
                    Token details are still loading — the balance check will appear shortly.
                </div>
            {:else if requiredBase === null}
                <div class="p-4 text-sm text-zen-warning">
                    One or more amounts are invalid — fix the highlighted rows to see the balance
                    check.
                </div>
            {:else if balance !== null && decimals !== null}
                <div class="grid grid-cols-2 divide-x divide-zen-border-subtle">
                    <div class="p-4">
                        <span
                            class="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-zen-fg-subtle"
                        >
                            <Wallet class="h-3.5 w-3.5" /> Your balance
                        </span>
                        <div class="mt-1 font-mono text-xl font-bold text-zen-fg">
                            {formatTokenAmount(balance, decimals)}
                        </div>
                    </div>
                    <div class="p-4">
                        <span
                            class="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-zen-fg-subtle"
                        >
                            <Coins class="h-3.5 w-3.5" /> Required
                        </span>
                        <div
                            class="mt-1 font-mono text-xl font-bold {hasEnough
                                ? 'text-zen-success'
                                : 'text-zen-error'}"
                        >
                            {formatTokenAmount(requiredBase, decimals)}
                        </div>
                    </div>
                </div>
                <div
                    class="flex items-center gap-2 border-t border-zen-border-subtle p-3 text-sm {hasEnough
                        ? 'text-zen-success'
                        : 'text-zen-error'}"
                >
                    {#if hasEnough}
                        <CheckCircle2 class="h-4 w-4" /> You have enough {symbol} to fund this distribution.
                    {:else}
                        <AlertCircle class="h-4 w-4" /> Insufficient balance to fund this distribution.
                    {/if}
                </div>
            {/if}
        </ZenCard>
    {/if}

    <!-- Nav -->
    <div class="flex items-center justify-between">
        <ZenButton variant="ghost" onclick={handleBack}>
            <ArrowLeft class="mr-1 h-4 w-4" /> Back
        </ZenButton>
        <ZenButton variant="primary" disabled={!canContinue} onclick={handleNext}>
            Review &amp; distribute <ArrowRight class="ml-1 h-4 w-4" />
        </ZenButton>
    </div>
</div>
