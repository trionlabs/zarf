<script lang="ts">
    import { deployStore } from '../../../stores/deployStore.svelte';
    import { wizardStore } from '../../../stores/wizardStore.svelte';
    import {
        FactoryDeployService,
        getFactoryAddress,
        isFactoryAvailable,
        type FactoryDeployProgress,
    } from '../../../services/factoryDeploy';
    import { addOptimisticContract } from '@zarf/core/services/distributionDiscovery';
    import { buildFactoryDeployInputs } from '@zarf/core/domain/merkleResultAdapter';
    import { planDeploy, buildOptimisticContract } from '@zarf/core/domain/deployPlanner';
    import { parseTokenAmount } from '@zarf/core/utils/amount';
    import { toMessage } from '@zarf/core/utils/error';
    import { dev, warn, err } from '@zarf/core/utils/log';
    import { walletStore } from '@zarf/ui/stores/walletStore.svelte';
    import { goto } from '$app/navigation';
    import { Check, Rocket, Copy } from 'lucide-svelte';
    import type { TransactionHash } from '@zarf/core/types';
    import ZenButton from '@zarf/ui/components/ui/ZenButton.svelte';
    import ZenAlert from '@zarf/ui/components/ui/ZenAlert.svelte';
    import ZenSpinner from '@zarf/ui/components/ui/ZenSpinner.svelte';
    import DeploymentSummary from './DeploymentSummary.svelte';
    import DeploymentSuccessCard from './DeploymentSuccessCard.svelte';
    import DeploymentReport from './DeploymentReport.svelte';
    import DeploymentPipeline from './DeploymentPipeline.svelte';

    // Local state from stores
    let distribution = $derived(deployStore.distribution);
    let merkleResult = $derived(deployStore.merkleResult);
    let isDeployed = $derived(deployStore.isDeployed);
    let contractAddress = $derived(deployStore.contractAddress);

    // Wallet state
    let walletAddress = $derived(walletStore.address);
    let isWrongNetwork = $derived(walletStore.isWrongNetwork);
    let networkName = $derived(walletStore.networkName);
    let isMainnet = $derived(walletStore.isMainnet);

    // Real-funds gate: a mainnet deploy must be explicitly confirmed once.
    let mainnetConfirmed = $state(false);
    let showMainnetGate = $state(false);

    // Local deployment state
    let isDeploying = $state(false);
    let currentStep = $state<'idle' | 'approve' | 'create' | 'complete' | 'error'>('idle');
    let currentMessage = $state('');
    let error = $state<string | null>(null);

    // Use persisted state from store
    // This enables recovery after refresh
    let approveTxHash = $derived(deployStore.approveTxHash as TransactionHash | null);
    let createTxHash = $derived(deployStore.createTxHash as TransactionHash | null);
    let submittedCreateTxHash = $state<TransactionHash | null>(null);

    // Factory availability check
    let factoryAvailable = $derived(isFactoryAvailable());

    // Clean Markup: Extract template logic to $derived
    const showFactoryWarning = $derived(!factoryAvailable);
    const showNotDeployedIdle = $derived(!isDeployed && currentStep === 'idle');

    function resetDeployState() {
        if (confirm('Are you sure you want to reset the deployment state?')) {
            deployStore.reset(true);
            isDeploying = false;
            currentStep = 'idle';
            error = null;
            currentMessage = '';
        }
    }

    async function handleDeploy() {
        if (!distribution || !merkleResult || !walletAddress) return;

        if (isWrongNetwork) {
            error = 'Switch Freighter to the configured Stellar network before deploying.';
            return;
        }

        // Real-funds gate — require one explicit confirmation before the first
        // mainnet deploy. The gate UI calls confirmMainnetDeploy() to re-enter.
        if (isMainnet && !mainnetConfirmed) {
            showMainnetGate = true;
            return;
        }

        const currentFactoryAddress = getFactoryAddress();
        if (!currentFactoryAddress) {
            error = 'Stellar factory contract is not configured.';
            return;
        }

        isDeploying = true;
        currentStep = 'idle';
        error = null;
        // Do not reset hashes here, they are managed by store persistence
        // approveTxHash = null;
        // createTxHash = null;

        // Get token decimals (Stellar assets commonly use 7 decimals)
        const tokenDecimals = wizardStore.tokenDetails.tokenDecimals ?? 7;

        // Validate every claim, build factory inputs, and plan the deploy
        // (past-date override + integrity check). Pure-TS — testable.
        let config: ReturnType<typeof planDeploy>;
        try {
            const factoryInputs = buildFactoryDeployInputs(merkleResult.claims, merkleResult.root);
            const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID ?? '';
            const { hashAudience } = await import('@zarf/core/crypto/merkleTree');
            const audienceHash = await hashAudience(clientId);

            // Pinning is done in Step 1 (Prepare). If the CID is missing
            // here, the user shouldn't have been allowed past that step.
            const metadataCid = deployStore.metadataCid;
            if (!metadataCid) {
                throw new Error('Claim list CID missing — go back to Step 1 to re-pin');
            }

            const plannedAt = deployStore.schedulePlanAtMs
                ? new Date(deployStore.schedulePlanAtMs)
                : new Date();

            config = planDeploy(
                {
                    factoryAddress: currentFactoryAddress,
                    tokenAddress: wizardStore.tokenDetails.tokenAddress!,
                    owner: walletAddress!,
                    name: distribution.name,
                    description: distribution.description || '',
                    schedule: distribution.schedule,
                    totalAmount: parseTokenAmount(String(distribution.amount), tokenDecimals),
                    merkleRoot: factoryInputs.merkleRoot,
                    audienceHash,
                    recipientCount: factoryInputs.recipientCount,
                    allocationsTotal: factoryInputs.totalAllocation,
                    metadataCid,
                },
                plannedAt,
            );
        } catch (e) {
            error = `Pre-deploy step failed: ${(e as Error).message}`;
            isDeploying = false;
            currentStep = 'error';
            return;
        }
        if (config.immediateUnlock) {
            dev('Past date detected: configured for immediate unlock');
        }

        const service = new FactoryDeployService(config, (progress: FactoryDeployProgress) => {
            currentStep = progress.step;
            currentMessage = progress.message;

            if (progress.txHash) {
                if (progress.step === 'approve') {
                    deployStore.setApproveTx(progress.txHash);
                } else if (progress.step === 'create') {
                    submittedCreateTxHash = progress.txHash;
                    deployStore.setCreateTx(progress.txHash);
                }
            }

            if (progress.step === 'error') {
                error = progress.message;
            }
        });

        try {
            const vestingAddress = await service.deploy();

            if (vestingAddress) {
                currentStep = 'complete';
                deployStore.setDeployed(vestingAddress);

                // Deploy spent XLM (fees + funding) — refresh the wallet balance.
                void walletStore.refreshBalance();

                // Persist to Global Store
                wizardStore.moveDistributionToLaunched(
                    distribution.id,
                    submittedCreateTxHash || createTxHash || '',
                );

                // Optimistic UI Update — show in dashboard before next RPC fetch
                try {
                    addOptimisticContract(
                        walletAddress,
                        buildOptimisticContract({
                            address: vestingAddress,
                            name: distribution.name,
                            description: distribution.description || '',
                            tokenAddress: wizardStore.tokenDetails.tokenAddress!,
                            tokenSymbol: wizardStore.tokenDetails.tokenSymbol,
                            tokenDecimals: wizardStore.tokenDetails.tokenDecimals,
                            owner: walletAddress,
                            schedule: distribution.schedule,
                            totalAmount: config.totalAmount,
                            plannedSchedule: {
                                cliffSeconds: config.cliffSeconds,
                                vestingSeconds: config.vestingSeconds,
                                periodSeconds: config.periodSeconds,
                            },
                        }),
                    );
                } catch (e) {
                    warn('Optimistic cache update failed', e);
                }
            }
        } catch (e: unknown) {
            err('Deploy failed:', e);
            error = toMessage(e, 'Deployment failed');
            currentStep = 'error';
        } finally {
            isDeploying = false;
        }
    }

    function confirmMainnetDeploy() {
        mainnetConfirmed = true;
        showMainnetGate = false;
        void handleDeploy();
    }

    function cancelMainnetDeploy() {
        showMainnetGate = false;
    }

    function goToDashboard() {
        goto('/distributions');
    }

    // Copy to clipboard
    let copied = $state(false);
    function copyAddress() {
        if (contractAddress) {
            navigator.clipboard.writeText(contractAddress);
            copied = true;
            setTimeout(() => (copied = false), 2000);
        }
    }

    // Count unique recipients (group claims by email/identity)
    const uniqueRecipients = $derived(() => {
        if (!merkleResult?.claims) return [];
        // eslint-disable-next-line svelte/prefer-svelte-reactivity -- derived-local accumulator, re-runs when claims change
        const grouped = new Map<string, { email: string; amount: number }>();
        for (const c of merkleResult.claims) {
            // Use email or identityCommitment as unique key
            const key = c.email || c.identityCommitment || String(c.leafIndex);
            const displayName = c.email || `Recipient ${c.identityCommitment?.slice(0, 8)}...`;
            const amount =
                Number(c.amount) / Math.pow(10, wizardStore.tokenDetails.tokenDecimals || 7);
            if (grouped.has(key)) {
                grouped.get(key)!.amount += amount;
            } else {
                grouped.set(key, { email: displayName, amount });
            }
        }
        return Array.from(grouped.values());
    });

    const recipientCount = $derived(uniqueRecipients().length);
    const batchCount = $derived(merkleResult?.claims.length || 0);

    // Get visible recipients (first 4 unique)
    const visibleRecipients = $derived(uniqueRecipients().slice(0, 4));
    const remainingCount = $derived(recipientCount - 4);

    function retry() {
        error = null;
        currentStep = 'idle';
        handleDeploy();
    }
</script>

<div class="p-4 w-full max-w-6xl">
    <div class="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
        <!-- Left Column: Actions & Status -->
        <div class="lg:col-span-2 space-y-6">
            <!-- Header -->
            <div class="text-left">
                {#if isDeployed}
                    <div class="mb-4 flex items-center gap-3">
                        <div
                            class="w-10 h-10 rounded-full bg-zen-fg flex items-center justify-center"
                        >
                            <Check class="w-5 h-5 text-zen-bg" />
                        </div>
                        <div>
                            <h2 class="text-xl font-bold text-zen-fg">Deployment Complete</h2>
                            <p class="text-sm text-zen-fg-muted">
                                Contract deployed and funded successfully
                            </p>
                        </div>
                    </div>

                    <!-- What happened section -->
                    <div class="space-y-3 text-sm text-zen-fg-muted mb-4">
                        <div class="flex items-start gap-2">
                            <Check class="w-4 h-4 text-zen-fg shrink-0 mt-0.5" />
                            <span>Tokens approved and transferred to contract</span>
                        </div>
                        <div class="flex items-start gap-2">
                            <Check class="w-4 h-4 text-zen-fg shrink-0 mt-0.5" />
                            <span>Vesting schedule configured with cliff and duration</span>
                        </div>
                        <div class="flex items-start gap-2">
                            <Check class="w-4 h-4 text-zen-fg shrink-0 mt-0.5" />
                            <span>Recipients can now claim tokens via email verification</span>
                        </div>
                    </div>
                {:else}
                    <h2 class="text-3xl font-bold mb-2">Deploy Distribution</h2>
                    <p class="text-zen-fg-muted">
                        Review the details below and execute the transactions to deploy.
                    </p>
                    <div
                        class="inline-flex items-center gap-2 mt-3 px-3 py-1.5 bg-zen-bg-elevated text-zen-fg-muted text-xs font-medium rounded-full border-[0.5px] border-zen-border-subtle"
                    >
                        <Check class="w-3 h-3" />
                        Factory Pattern · 2 transactions
                    </div>
                {/if}
            </div>

            <!-- Factory Not Available Warning -->
            {#if showFactoryWarning}
                <ZenAlert variant="warning" class="mb-6">
                    {#snippet title()}Factory Not Available{/snippet}
                    Factory contract is not deployed on this network yet.
                </ZenAlert>
            {/if}

            <DeploymentPipeline
                {currentStep}
                {currentMessage}
                {approveTxHash}
                {createTxHash}
                {error}
                {isDeployed}
                onRetry={retry}
            />

            <!-- Actions -->
            <div class="flex flex-col items-center gap-4">
                {#if showNotDeployedIdle}
                    {#if showMainnetGate}
                        <!-- Mainnet real-funds confirmation gate -->
                        <ZenAlert variant="error" class="w-full max-w-md">
                            {#snippet title()}Deploying on Stellar Mainnet{/snippet}
                            This creates a real contract and transfers real funds on Stellar mainnet.
                            It cannot be undone — confirm the network shown in your wallet before continuing.
                        </ZenAlert>
                        <div class="flex items-center gap-3">
                            <ZenButton variant="ghost" size="lg" onclick={cancelMainnetDeploy}>
                                Cancel
                            </ZenButton>
                            <ZenButton variant="danger" size="lg" onclick={confirmMainnetDeploy}>
                                <Rocket class="w-5 h-5 mr-2" />
                                Deploy on mainnet
                            </ZenButton>
                        </div>
                    {:else}
                        <!-- Big Launch Button -->
                        <ZenButton
                            variant="primary"
                            size="lg"
                            class="px-12 text-lg shadow-md hover:shadow-lg transition-all duration-300"
                            onclick={handleDeploy}
                            disabled={isDeploying ||
                                !walletAddress ||
                                isWrongNetwork ||
                                !factoryAvailable}
                            loading={isDeploying}
                        >
                            {#if isDeploying}
                                Preparing...
                            {:else if !walletAddress}
                                Connect Wallet First
                            {:else if isWrongNetwork}
                                Wrong Network
                            {:else if !factoryAvailable}
                                Factory Not Available
                            {:else}
                                <Rocket class="w-5 h-5 mr-2" />
                                Launch Deployment
                            {/if}
                        </ZenButton>

                        <p class="text-xs text-zen-fg-subtle text-center max-w-md">
                            This will require only 2 wallet confirmations. Much faster than before!
                        </p>
                    {/if}
                {:else if isDeployed && contractAddress && distribution}
                    <!-- Success State - Action Buttons (Card is on right) -->
                    <div class="flex gap-3 mt-4">
                        <ZenButton variant="primary" class="flex-1" onclick={goToDashboard}>
                            View Dashboard
                        </ZenButton>

                        <DeploymentReport
                            {contractAddress}
                            {distribution}
                            tokenDetails={wizardStore.tokenDetails}
                            claimCount={merkleResult?.claims.length ?? 0}
                            {networkName}
                            {approveTxHash}
                            {createTxHash}
                        />
                    </div>
                {:else if currentStep !== 'idle' && currentStep !== 'error'}
                    <!-- In Progress -->
                    <div class="flex flex-col items-center gap-4 text-center">
                        <ZenSpinner size="md" />
                        <div class="space-y-1">
                            <p class="text-zen-fg-muted">Deployment in progress...</p>
                            <p class="text-xs text-zen-fg-subtle">
                                Please confirm transactions in your wallet.
                            </p>
                        </div>

                        {#if currentMessage}
                            <p class="text-sm text-zen-fg">
                                {currentMessage}
                            </p>
                        {/if}

                        <!-- Show contract address if already known -->
                        {#if contractAddress}
                            <div
                                class="mt-2 p-3 bg-zen-bg-elevated border-[0.5px] border-zen-border-subtle rounded-lg"
                            >
                                <p class="text-xs text-zen-fg-subtle font-medium mb-1">
                                    Contract Address
                                </p>
                                <div class="flex items-center gap-2">
                                    <code class="text-xs font-mono text-zen-fg flex-1 truncate">
                                        {contractAddress}
                                    </code>
                                    <button
                                        onclick={copyAddress}
                                        class="p-1 text-zen-fg-subtle hover:text-zen-fg transition-colors"
                                        title={copied ? 'Copied!' : 'Copy'}
                                    >
                                        {#if copied}
                                            <Check class="w-3 h-3" />
                                        {:else}
                                            <Copy class="w-3 h-3" />
                                        {/if}
                                    </button>
                                </div>
                            </div>
                        {/if}

                        <!-- Reset button for stuck states -->
                        <ZenButton
                            variant="ghost"
                            size="xs"
                            class="text-zen-fg-subtle hover:text-zen-fg mt-4"
                            onclick={resetDeployState}
                        >
                            Reset Stuck State
                        </ZenButton>
                    </div>
                {/if}
            </div>
        </div>

        <!-- Right Column: Summary Card -->
        <div class="lg:col-span-1 order-first lg:order-last">
            {#if isDeployed && contractAddress && distribution}
                <DeploymentSuccessCard
                    {contractAddress}
                    {distribution}
                    tokenDetails={wizardStore.tokenDetails}
                    {recipientCount}
                    {batchCount}
                    {visibleRecipients}
                    {remainingCount}
                />
            {:else if !isDeployed && distribution && merkleResult}
                <DeploymentSummary
                    {distribution}
                    tokenDetails={wizardStore.tokenDetails}
                    {recipientCount}
                    {batchCount}
                />
            {/if}
        </div>
    </div>
</div>
