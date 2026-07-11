<script lang="ts">
    import { onMount } from 'svelte';
    import { goto } from '$app/navigation';
    import {
        Loader2,
        CheckCircle2,
        AlertCircle,
        ArrowLeft,
        ShieldAlert,
        ExternalLink,
    } from 'lucide-svelte';
    import ZenButton from '@zarf/ui/components/ui/ZenButton.svelte';
    import ZenCard from '@zarf/ui/components/ui/ZenCard.svelte';
    import ZenCheckbox from '@zarf/ui/components/ui/ZenCheckbox.svelte';
    import WalletConnectButton from '@zarf/ui/components/wallet/WalletConnectButton.svelte';
    import { walletStore } from '@zarf/ui/stores/walletStore.svelte';
    import { networkStore } from '@zarf/ui/stores/networkStore.svelte';
    import { sanitizeBlockchainError } from '@zarf/ui/utils/errorSanitizer';
    import { getAirdropFactoryAddress } from '@zarf/core/config/runtime';
    import { getContractExplorerUrl } from '@zarf/core/contracts/explorer';
    import { formatTokenAmount } from '@zarf/core/utils/amount';
    import { warn } from '@zarf/core/utils/log';
    import { campaignStore } from '$lib/airdrop/stores/campaignStore.svelte';
    import type { StellarAddress, StellarContractId } from '$lib/airdrop/stores/types';

    let busy = $state(false);
    let error = $state<string | null>(null);
    let progressMsg = $state('');
    let mainnetConfirmed = $state(false);

    const td = $derived(campaignStore.tokenDetails);
    const deploy = $derived(campaignStore.activeDeploy);
    const step = $derived(deploy?.step ?? 1); // 1 Prepare · 2 Approve · 3 Distribute
    const symbol = $derived(td.tokenSymbol ?? 'tokens');
    const decimals = $derived(td.tokenDecimals ?? 7);
    const recipientCount = $derived(campaignStore.recipients.length);
    const isMainnet = $derived(networkStore.activeId === 'mainnet');
    const network = $derived<'testnet' | 'mainnet'>(isMainnet ? 'mainnet' : 'testnet');
    const totalDisplay = $derived(
        deploy?.total ? formatTokenAmount(BigInt(deploy.total), decimals) : '—',
    );

    const STEPS = ['Prepare', 'Approve', 'Distribute'];

    onMount(() => {
        campaignStore.goToStep(2);
        if (!campaignStore.tokenDetails.tokenAddress || campaignStore.recipients.length === 0) {
            goto('/airdrop/wizard/step-1');
            return;
        }
        if (!campaignStore.activeDeploy) campaignStore.startDeploy();
    });

    function requireDeployInputs(): {
        owner: StellarAddress;
        factory: StellarContractId;
        token: StellarContractId;
    } | null {
        const owner = walletStore.address as StellarAddress | null;
        const factory = getAirdropFactoryAddress() ?? null;
        const token = td.tokenAddress;
        if (!owner || !factory || !token) {
            error = 'Connect your wallet (and configure a factory) to continue.';
            return null;
        }
        return { owner, factory, token };
    }

    async function handlePrepare() {
        error = null;
        const inputs = requireDeployInputs();
        if (!inputs) return;
        busy = true;
        try {
            const mod = await import('$lib/airdrop/services/airdropDeploy');
            let salt = campaignStore.activeDeploy?.salt ?? null;
            if (!salt) {
                salt = mod.generateSalt();
                campaignStore.updateDeploy({ salt });
            }

            let dec = td.tokenDecimals;
            if (dec === null) {
                progressMsg = 'Reading token details…';
                const { readTokenMetaRpc } = await import('@zarf/core/contracts');
                const meta = await readTokenMetaRpc(inputs.owner, inputs.token);
                campaignStore.setTokenDetails({
                    tokenDecimals: meta.decimals,
                    tokenSymbol: meta.symbol,
                    tokenName: meta.name,
                });
                dec = meta.decimals;
            }

            progressMsg = 'Predicting the address and pinning the claim list…';
            const res = await mod.prepareCampaign({
                factoryAddress: inputs.factory,
                owner: inputs.owner,
                token: inputs.token,
                network,
                salt,
                recipients: campaignStore.recipients,
                decimals: dec,
            });
            campaignStore.updateDeploy({
                predictedAddress: res.predictedAddress,
                merkleRoot: res.merkleRoot,
                metadataCid: res.metadataCid,
                total: res.total,
                step: 2,
            });
        } catch (e) {
            error = sanitizeBlockchainError(e, {
                fallback: 'Could not prepare the distribution. Please try again.',
            });
            warn('[step-2] prepare failed', e);
        } finally {
            busy = false;
            progressMsg = '';
        }
    }

    async function handleApprove() {
        error = null;
        const inputs = requireDeployInputs();
        const total = campaignStore.activeDeploy?.total;
        if (!inputs || !total) return;
        busy = true;
        try {
            const mod = await import('$lib/airdrop/services/airdropDeploy');
            progressMsg = 'Approving the factory to fund the airdrop…';
            const hash = await mod.approveCampaign(
                {
                    token: inputs.token,
                    owner: inputs.owner,
                    factoryAddress: inputs.factory,
                    total: BigInt(total),
                },
                () => {
                    progressMsg = 'Waiting for approval confirmation…';
                },
            );
            campaignStore.updateDeploy({ approveTxHash: hash, step: 3 });
        } catch (e) {
            error = sanitizeBlockchainError(e, { fallback: 'Approval failed. Please try again.' });
            warn('[step-2] approve failed', e);
        } finally {
            busy = false;
            progressMsg = '';
        }
    }

    async function handleDistribute() {
        error = null;
        if (isMainnet && !mainnetConfirmed) return;
        const inputs = requireDeployInputs();
        const d = campaignStore.activeDeploy;
        if (
            !inputs ||
            !d?.predictedAddress ||
            !d.merkleRoot ||
            !d.metadataCid ||
            !d.total ||
            !d.salt
        ) {
            error = 'Missing deploy state — please re-run Prepare.';
            return;
        }
        busy = true;
        try {
            const mod = await import('$lib/airdrop/services/airdropDeploy');
            progressMsg = 'Deploying and funding the airdrop…';
            const hash = await mod.createCampaign(
                {
                    factoryAddress: inputs.factory,
                    owner: inputs.owner,
                    token: inputs.token,
                    merkleRoot: d.merkleRoot,
                    total: BigInt(d.total),
                    deadline: campaignStore.deadline,
                    locked: campaignStore.locked,
                    recipientCount: campaignStore.recipients.length,
                    salt: d.salt,
                    metadataCid: d.metadataCid,
                },
                () => {
                    progressMsg = 'Waiting for deploy confirmation…';
                },
            );
            const campaign = campaignStore.moveCampaignToLaunched(hash);
            const query = campaign
                ? `?a=${encodeURIComponent(campaign.airdropAddress)}&cid=${encodeURIComponent(campaign.metadataCid)}`
                : '';
            goto(`/airdrop/wizard/done${query}`);
        } catch (e) {
            error = sanitizeBlockchainError(e, {
                fallback: 'Deployment failed. Please try again.',
            });
            warn('[step-2] distribute failed', e);
        } finally {
            busy = false;
            progressMsg = '';
        }
    }

    function handleBack() {
        campaignStore.previousStep();
        goto('/airdrop/wizard/step-1');
    }
</script>

<div class="mx-auto max-w-2xl space-y-8 py-8">
    <header>
        <h1 class="text-2xl font-semibold tracking-tight text-zen-fg">Review &amp; distribute</h1>
        <p class="mt-1 text-sm text-zen-fg-muted">
            Build the claim list, approve the funding, then deploy — in three steps.
        </p>
    </header>

    <!-- Step indicator -->
    <ol class="flex items-center gap-3" aria-label="Deploy progress">
        {#each STEPS as label, i (label)}
            {@const n = i + 1}
            <li class="flex flex-1 items-center gap-2">
                <span
                    class="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold {step >
                    n
                        ? 'bg-zen-success text-zen-bg'
                        : step === n
                          ? 'bg-zen-fg text-zen-bg'
                          : 'bg-zen-fg/10 text-zen-fg-faint'}"
                >
                    {#if step > n}<CheckCircle2 class="h-4 w-4" />{:else}{n}{/if}
                </span>
                <span class="text-xs font-medium {step >= n ? 'text-zen-fg' : 'text-zen-fg-faint'}"
                    >{label}</span
                >
                {#if i < STEPS.length - 1}
                    <span class="h-px flex-1 bg-zen-border-subtle"></span>
                {/if}
            </li>
        {/each}
    </ol>

    {#if !walletStore.isConnected}
        <!-- Connect gate: every sub-step needs the wallet -->
        <ZenCard class="flex flex-col items-center gap-4 p-8 text-center">
            <ShieldAlert class="h-8 w-8 text-zen-fg-muted" />
            <div>
                <h2 class="text-base font-semibold text-zen-fg">Connect your wallet</h2>
                <p class="mt-1 text-sm text-zen-fg-muted">
                    Deploying reads the network, signs the claim-list, and funds the airdrop — all
                    from your wallet.
                </p>
            </div>
            <WalletConnectButton />
        </ZenCard>
    {:else}
        {#if error}
            <div
                class="flex items-start gap-2 rounded-xl bg-zen-error/5 p-3 text-sm text-zen-error"
            >
                <AlertCircle class="mt-0.5 h-4 w-4 shrink-0" />
                <span>{error}</span>
            </div>
        {/if}

        <!-- Summary -->
        <ZenCard class="grid grid-cols-2 gap-4 p-5 sm:grid-cols-3">
            <div>
                <span class="block text-[10px] uppercase tracking-wider text-zen-fg-muted"
                    >Recipients</span
                >
                <span class="text-lg font-semibold tabular-nums text-zen-fg">{recipientCount}</span>
            </div>
            <div>
                <span class="block text-[10px] uppercase tracking-wider text-zen-fg-muted"
                    >Total</span
                >
                <span class="text-lg font-semibold tabular-nums text-zen-fg"
                    >{totalDisplay} <span class="text-xs font-normal">{symbol}</span></span
                >
            </div>
            <div>
                <span class="block text-[10px] uppercase tracking-wider text-zen-fg-muted"
                    >Lock</span
                >
                <span class="text-lg font-semibold text-zen-fg"
                    >{campaignStore.locked ? 'Locked' : 'Open'}</span
                >
            </div>
        </ZenCard>

        {#if deploy?.predictedAddress}
            <div class="rounded-xl border border-zen-border-subtle p-4 text-sm">
                <div class="flex items-center justify-between gap-2">
                    <span class="text-xs font-medium text-zen-fg-muted">Distribution address</span>
                    <a
                        href={getContractExplorerUrl(deploy.predictedAddress)}
                        target="_blank"
                        rel="noopener noreferrer"
                        class="inline-flex items-center gap-1 text-xs text-zen-fg-muted hover:text-zen-fg"
                    >
                        Explorer <ExternalLink class="h-3 w-3" />
                    </a>
                </div>
                <p class="mt-1 break-all font-mono text-[11px] text-zen-fg">
                    {deploy.predictedAddress}
                </p>
                {#if deploy.metadataCid}
                    <p class="mt-2 break-all font-mono text-[11px] text-zen-fg-faint">
                        Claim list: {deploy.metadataCid}
                    </p>
                {/if}
            </div>
        {/if}

        <!-- Action for the current step -->
        {#if step === 1}
            <ZenCard class="space-y-3 p-5">
                <h2 class="text-sm font-semibold text-zen-fg">1 · Prepare the claim list</h2>
                <p class="text-xs text-zen-fg-muted">
                    Fixes the distribution address, builds the Merkle tree, and publishes the claim
                    list to IPFS. Nothing is spent yet.
                </p>
                <ZenButton variant="primary" class="w-full" disabled={busy} onclick={handlePrepare}>
                    {#if busy}<Loader2 class="mr-1 h-4 w-4 animate-spin" />{/if}
                    Prepare distribution
                </ZenButton>
            </ZenCard>
        {:else if step === 2}
            <ZenCard class="space-y-3 p-5">
                <h2 class="text-sm font-semibold text-zen-fg">2 · Approve funding</h2>
                <p class="text-xs text-zen-fg-muted">
                    Authorize the factory to move {totalDisplay}
                    {symbol} from your wallet when it deploys the airdrop.
                </p>
                <ZenButton variant="primary" class="w-full" disabled={busy} onclick={handleApprove}>
                    {#if busy}<Loader2 class="mr-1 h-4 w-4 animate-spin" />{/if}
                    Approve {totalDisplay}
                    {symbol}
                </ZenButton>
            </ZenCard>
        {:else}
            <ZenCard class="space-y-3 p-5">
                <h2 class="text-sm font-semibold text-zen-fg">3 · Distribute &amp; fund</h2>
                <p class="text-xs text-zen-fg-muted">
                    Deploys the airdrop and funds it in a single atomic transaction. If anything
                    fails, no funds move.
                </p>
                {#if isMainnet}
                    <div class="rounded-lg border border-zen-warning/30 bg-zen-warning/5 p-3">
                        <ZenCheckbox
                            bind:checked={mainnetConfirmed}
                            label="I understand this deploys to MAINNET and spends real funds."
                        />
                    </div>
                {/if}
                <ZenButton
                    variant="primary"
                    class="w-full"
                    disabled={busy || (isMainnet && !mainnetConfirmed)}
                    onclick={handleDistribute}
                >
                    {#if busy}<Loader2 class="mr-1 h-4 w-4 animate-spin" />{/if}
                    Distribute &amp; fund
                </ZenButton>
            </ZenCard>
        {/if}

        {#if busy && progressMsg}
            <p class="flex items-center justify-center gap-2 text-xs text-zen-fg-muted">
                <Loader2 class="h-3.5 w-3.5 animate-spin" />
                {progressMsg}
            </p>
        {/if}
    {/if}

    <div>
        <ZenButton variant="ghost" disabled={busy} onclick={handleBack}>
            <ArrowLeft class="mr-1 h-4 w-4" /> Back
        </ZenButton>
    </div>
</div>
