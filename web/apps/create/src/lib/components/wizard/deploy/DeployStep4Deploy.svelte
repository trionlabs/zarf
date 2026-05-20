<script lang="ts">
    import { deployStore } from "../../../stores/deployStore.svelte";
    import { wizardStore } from "../../../stores/wizardStore.svelte";
    import {
        FactoryDeployService,
        getFactoryAddress,
        isFactoryAvailable,
        type FactoryDeployProgress,
    } from "../../../services/factoryDeploy";
    import { addOptimisticContract } from "@zarf/core/services/distributionDiscovery";
    import { buildFactoryDeployInputs } from "@zarf/core/domain/merkleResultAdapter";
    import { planDeploy, buildOptimisticContract } from "@zarf/core/domain/deployPlanner";
    import { getContractExplorerUrl, getExplorerUrl } from "@zarf/core/contracts/explorer";
    import { parseTokenAmount } from "@zarf/core/utils/amount";
    import { walletStore } from "@zarf/ui/stores/walletStore.svelte";
    import { goto } from "$app/navigation";
    import {
        Check,
        Rocket,
        ExternalLink,
        Loader2,
        AlertCircle,
        Copy,
        Download,
        Calendar,
    } from "lucide-svelte";
    import type { TransactionHash } from "@zarf/core/types";
    import ZenButton from "@zarf/ui/components/ui/ZenButton.svelte";
    import ZenAlert from "@zarf/ui/components/ui/ZenAlert.svelte";
    import ZenSpinner from "@zarf/ui/components/ui/ZenSpinner.svelte";
    import DeploymentSummary from "./DeploymentSummary.svelte";

    // Local state from stores
    let distribution = $derived(deployStore.distribution);
    let merkleResult = $derived(deployStore.merkleResult);
    let isDeployed = $derived(deployStore.isDeployed);
    let contractAddress = $derived(deployStore.contractAddress);

    // Wallet state
    let walletAddress = $derived(walletStore.address);
    let isWrongNetwork = $derived(walletStore.isWrongNetwork);
    let networkName = $derived(walletStore.networkName);

    // Local deployment state
    let isDeploying = $state(false);
    let currentStep = $state<
        "idle" | "approve" | "create" | "complete" | "error"
    >("idle");
    let currentMessage = $state("");
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
    const showNotDeployedIdle = $derived(!isDeployed && currentStep === "idle");

    function resetDeployState() {
        if (confirm("Are you sure you want to reset the deployment state?")) {
            deployStore.reset(true);
            isDeploying = false;
            currentStep = "idle";
            error = null;
            currentMessage = "";
        }
    }

    async function handleDeploy() {
        if (!distribution || !merkleResult || !walletAddress)
            return;

        if (isWrongNetwork) {
            error = "Switch Freighter to the configured Stellar network before deploying.";
            return;
        }

        const currentFactoryAddress = getFactoryAddress();
        if (!currentFactoryAddress) {
            error = "Stellar factory contract is not configured.";
            return;
        }

        isDeploying = true;
        currentStep = "idle";
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
            const factoryInputs = buildFactoryDeployInputs(
                merkleResult.claims,
                merkleResult.root,
            );

            // Pinning is done in Step 1 (Prepare). If the CID is missing
            // here, the user shouldn't have been allowed past that step.
            const metadataCid = deployStore.metadataCid;
            if (!metadataCid) {
                throw new Error(
                    "Claim list CID missing — go back to Step 1 to re-pin",
                );
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
                    description: distribution.description || "",
                    schedule: distribution.schedule,
                    totalAmount: parseTokenAmount(String(distribution.amount), tokenDecimals),
                    merkleRoot: factoryInputs.merkleRoot,
                    recipientCount: factoryInputs.recipientCount,
                    allocationsTotal: factoryInputs.totalAllocation,
                    metadataCid,
                },
                plannedAt,
            );
        } catch (e) {
            error = `Pre-deploy step failed: ${(e as Error).message}`;
            isDeploying = false;
            currentStep = "error";
            return;
        }
        if (config.immediateUnlock) {
            console.log("Past date detected: configured for immediate unlock");
        }

        const service = new FactoryDeployService(
            config,
            (progress: FactoryDeployProgress) => {
                currentStep = progress.step;
                currentMessage = progress.message;

                if (progress.txHash) {
                    if (progress.step === "approve") {
                        deployStore.setApproveTx(progress.txHash);
                    } else if (progress.step === "create") {
                        submittedCreateTxHash = progress.txHash;
                        deployStore.setCreateTx(progress.txHash);
                    }
                }

                if (progress.step === "error") {
                    error = progress.message;
                }
            },
        );

        try {
            const vestingAddress = await service.deploy();

            if (vestingAddress) {
                currentStep = "complete";
                deployStore.setDeployed(vestingAddress);

                // Persist to Global Store
                wizardStore.moveDistributionToLaunched(
                    distribution.id,
                    submittedCreateTxHash || createTxHash || "",
                );

                // Optimistic UI Update — show in dashboard before next RPC fetch
                try {
                    addOptimisticContract(
                        walletAddress,
                        buildOptimisticContract({
                            address: vestingAddress,
                            name: distribution.name,
                            description: distribution.description || "",
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
                } catch (err) {
                    console.warn("Optimistic cache update failed", err);
                }
            }
        } catch (e: any) {
            console.error("Deploy failed:", e);
            error = e.message || "Deployment failed";
            currentStep = "error";
        } finally {
            isDeploying = false;
        }
    }

    function goToDashboard() {
        goto("/distributions");
    }

    // Copy to clipboard
    let copied = $state(false);
    function copyAddress() {
        if (contractAddress) {
            navigator.clipboard.writeText(contractAddress);
            copied = true;
            setTimeout(() => copied = false, 2000);
        }
    }

    // Download deployment report
    function downloadReport() {
        if (!contractAddress || !distribution) return;

        const timestamp = new Date().toISOString();

        const report = `ZARF VESTING CONTRACT DEPLOYMENT REPORT
========================================

Contract Address: ${contractAddress}
Network: ${networkName}

Distribution Details
--------------------
Name: ${distribution.name}
Description: ${distribution.description || "N/A"}
Total Amount: ${distribution.amount} ${wizardStore.tokenDetails.tokenSymbol || "tokens"}
Recipients: ${merkleResult?.claims.length || 0}

Token Details
-------------
Symbol: ${wizardStore.tokenDetails.tokenSymbol || "N/A"}
Address: ${wizardStore.tokenDetails.tokenAddress || "N/A"}
Decimals: ${wizardStore.tokenDetails.tokenDecimals || 7}

Vesting Schedule
----------------
Cliff Date: ${distribution.schedule.cliffEndDate || "None"}
Duration: ${distribution.schedule.distributionDuration} ${distribution.schedule.durationUnit}s
Unlock Frequency: Every 1 ${distribution.schedule.durationUnit}

Transaction Hashes
------------------
Approval TX: ${approveTxHash || "N/A"}
Create TX: ${createTxHash || "N/A"}

Links
-----
Contract: ${getContractExplorerUrl(contractAddress)}

Generated: ${timestamp}
`;

        const blob = new Blob([report], { type: "text/plain" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `zarf_${contractAddress.slice(0, 8)}_report.txt`;
        a.click();
        URL.revokeObjectURL(url);
    }

    // Generate identicon colors from address
    function getIdenticonColors(address: string): string[] {
        const colors = [];
        for (let i = 0; i < 8; i++) {
            const value = address.charCodeAt(i % address.length) + i * 17;
            const lightness = 20 + (value % 60); // 20-80% lightness
            const hue = (value * 2.8) % 360; // Spread across hue
            colors.push(`oklch(${lightness}% 0.08 ${hue})`);
        }
        return colors;
    }

    // Count unique recipients (group claims by email/identity)
    const uniqueRecipients = $derived(() => {
        if (!merkleResult?.claims) return [];
        const grouped = new Map<string, { email: string; amount: number }>();
        for (const c of merkleResult.claims) {
            // Use email or identityCommitment as unique key
            const key = c.email || c.identityCommitment || String(c.leafIndex);
            const displayName = c.email || `Recipient ${c.identityCommitment?.slice(0, 8)}...`;
            const amount = Number(c.amount) / Math.pow(10, wizardStore.tokenDetails.tokenDecimals || 7);
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
        currentStep = "idle";
        handleDeploy();
    }

    function getTransactionUrl(hash: TransactionHash): string {
        return getExplorerUrl(hash);
    }

    function getContractUrl(address: string): string {
        return getContractExplorerUrl(address);
    }

    // Step status helper
    function getStepStatus(
        stepId: "approve" | "create",
    ): "pending" | "active" | "done" | "error" {
        if (currentStep === "error") {
            // Only the current/failed step shows error
            if (stepId === "approve" && !approveTxHash) return "error";
            if (stepId === "create" && approveTxHash && !createTxHash)
                return "error";
            if (stepId === "approve" && approveTxHash) return "done";
            return "pending";
        }

        if (currentStep === "complete" || isDeployed) {
            return "done";
        }

        if (currentStep === "approve") {
            return stepId === "approve" ? "active" : "pending";
        }

        if (currentStep === "create") {
            return stepId === "approve" ? "done" : "active";
        }

        return "pending";
    }

    const steps = [
        {
            id: "approve" as const,
            label: "Approve Tokens",
            description: "Allow factory contract to transfer your tokens",
        },
        {
            id: "create" as const,
            label: "Create Distribution",
            description:
                "Deploy contract, set allocations, fund & start vesting",
        },
    ];
</script>

<div class="p-4 w-full max-w-6xl">
    <div class="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
        <!-- Left Column: Actions & Status -->
        <div class="lg:col-span-2 space-y-6">
            <!-- Header -->
            <div class="text-left">
                {#if isDeployed}
                    <div class="mb-4 flex items-center gap-3">
                        <div class="w-10 h-10 rounded-full bg-zen-fg flex items-center justify-center">
                            <Check class="w-5 h-5 text-zen-bg" />
                        </div>
                        <div>
                            <h2 class="text-xl font-bold text-zen-fg">
                                Deployment Complete
                            </h2>
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
                        Review the details below and execute the transactions to
                        deploy.
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

            <!-- Transaction Pipeline (2 Steps) - Show full when not deployed -->
            {#if !isDeployed}
                <div class="relative">
                    <!-- Vertical line connector -->
                    <div
                        class="absolute left-6 top-8 bottom-8 w-0.5 bg-zen-border"
                    ></div>

                    <div class="space-y-4">
                        {#each steps as step}
                            {@const status = getStepStatus(step.id)}
                            {@const txHash =
                                step.id === "approve"
                                    ? approveTxHash
                                    : createTxHash}

                            <div
                                class="relative flex items-start gap-4 p-4 rounded-xl transition-all duration-200
                                    {status === 'active'
                                    ? 'bg-zen-bg-elevated border-[0.5px] border-zen-border'
                                    : ''}
                                    {status === 'done'
                                    ? 'bg-zen-bg-elevated border-[0.5px] border-zen-border-subtle'
                                    : ''}
                                    {status === 'error'
                                    ? 'bg-zen-bg-elevated border-[0.5px] border-zen-error/30'
                                    : ''}
                                    {status === 'pending' ? 'opacity-40' : ''}"
                            >
                                <!-- Step indicator -->
                                <div
                                    class="relative z-10 w-10 h-10 rounded-full flex items-center justify-center
                                        transition-all duration-200 border-[0.5px]
                                        {status === 'done'
                                        ? 'bg-zen-fg text-zen-bg border-zen-fg'
                                        : ''}
                                        {status === 'active'
                                        ? 'bg-zen-bg-elevated text-zen-fg border-zen-border'
                                        : ''}
                                        {status === 'error'
                                        ? 'bg-zen-bg-elevated text-zen-error border-zen-error/30'
                                        : ''}
                                        {status === 'pending'
                                        ? 'bg-zen-bg text-zen-fg-subtle border-zen-border-subtle'
                                        : ''}"
                                >
                                    {#if status === "done"}
                                        <Check class="w-4 h-4" />
                                    {:else if status === "active"}
                                        <Loader2 class="w-4 h-4 animate-spin" />
                                    {:else if status === "error"}
                                        <AlertCircle class="w-4 h-4" />
                                    {:else}
                                        <span class="text-sm font-medium">{step.id === "approve" ? "1" : "2"}</span>
                                    {/if}
                                </div>

                                <!-- Step content -->
                                <div class="flex-1 min-w-0">
                                    <div
                                        class="flex items-center justify-between gap-2"
                                    >
                                        <h3
                                            class="font-semibold {status === 'active' ? 'text-zen-fg' : 'text-zen-fg-muted'}"
                                        >
                                            {step.label}
                                        </h3>

                                        <!-- TX Hash Link -->
                                        {#if txHash}
                                            <a
                                                href={getTransactionUrl(txHash)}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                class="inline-flex items-center gap-1 px-2 py-1 text-xs font-mono text-zen-fg-muted hover:text-zen-fg transition-colors"
                                            >
                                                <span class="hidden sm:inline"
                                                    >{txHash.slice(
                                                        0,
                                                        6,
                                                    )}...{txHash.slice(-4)}</span
                                                >
                                                <span class="sm:hidden">TX</span>
                                                <ExternalLink class="w-3 h-3" />
                                            </a>
                                        {/if}
                                    </div>

                                    <p
                                        class="text-sm text-zen-fg-subtle mt-1"
                                    >
                                        {step.description}
                                    </p>

                                    <!-- Active step message -->
                                    {#if status === "active" && currentMessage}
                                        <div
                                            class="mt-2 text-sm text-zen-fg font-medium flex items-center gap-2"
                                        >
                                            <ZenSpinner size="xs" />
                                            {currentMessage}
                                        </div>
                                    {/if}
                                </div>
                            </div>
                        {/each}
                    </div>
                </div>
            {:else}
                <!-- Compact transaction summary when deployed -->
                <div class="flex items-center gap-4 text-sm text-zen-fg-muted">
                    {#if approveTxHash}
                        <a
                            href={getTransactionUrl(approveTxHash)}
                            target="_blank"
                            rel="noopener noreferrer"
                            class="inline-flex items-center gap-1.5 hover:text-zen-fg transition-colors"
                        >
                            <Check class="w-3.5 h-3.5" />
                            <span class="font-mono text-xs">{approveTxHash.slice(0, 8)}...</span>
                            <ExternalLink class="w-3 h-3" />
                        </a>
                    {/if}
                    {#if createTxHash}
                        <a
                            href={getTransactionUrl(createTxHash)}
                            target="_blank"
                            rel="noopener noreferrer"
                            class="inline-flex items-center gap-1.5 hover:text-zen-fg transition-colors"
                        >
                            <Check class="w-3.5 h-3.5" />
                            <span class="font-mono text-xs">{createTxHash.slice(0, 8)}...</span>
                            <ExternalLink class="w-3 h-3" />
                        </a>
                    {/if}
                </div>
            {/if}

            <!-- Error Message -->
            {#if error}
                <ZenAlert variant="error" class="mb-6">
                    {#snippet title()}Transaction Failed{/snippet}
                    {error}
                    {#snippet actions()}
                        <ZenButton
                            variant="secondary"
                            size="sm"
                            onclick={retry}
                        >
                            Retry
                        </ZenButton>
                    {/snippet}
                </ZenAlert>
            {/if}

            <!-- Actions -->
            <div class="flex flex-col items-center gap-4">
                {#if showNotDeployedIdle}
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

                    <p
                        class="text-xs text-zen-fg-subtle text-center max-w-md"
                    >
                        This will require only 2 wallet confirmations. Much
                        faster than before!
                    </p>
                {:else if isDeployed && contractAddress}
                    <!-- Success State - Action Buttons (Card is on right) -->
                    <div class="flex gap-3 mt-4">
                        <ZenButton
                            variant="primary"
                            class="flex-1"
                            onclick={goToDashboard}
                        >
                            View Dashboard
                        </ZenButton>

                        <ZenButton
                            variant="secondary"
                            onclick={downloadReport}
                            title="Download Report"
                        >
                            {#snippet iconLeft()}<Download class="w-4 h-4" />{/snippet}
                        </ZenButton>
                    </div>
                {:else if currentStep !== "idle" && currentStep !== "error"}
                    <!-- In Progress -->
                    <div class="flex flex-col items-center gap-4 text-center">
                        <ZenSpinner size="md" />
                        <div class="space-y-1">
                            <p class="text-zen-fg-muted">
                                Deployment in progress...
                            </p>
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
                            <div class="mt-2 p-3 bg-zen-bg-elevated border-[0.5px] border-zen-border-subtle rounded-lg">
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
                                        title={copied ? "Copied!" : "Copy"}
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
                <!-- Deployed: Contract Summary Card -->
                <div class="bg-zen-bg-elevated border-[0.5px] border-zen-border-subtle rounded-2xl overflow-hidden sticky top-8">
                    <!-- Header: Identicon + Name + Address -->
                    <div class="p-5 border-b border-zen-border-subtle">
                        <div class="flex items-start gap-4">
                            <!-- Identicon Grid -->
                            <div class="w-14 h-14 rounded-xl overflow-hidden grid grid-cols-4 grid-rows-4 shrink-0">
                                {#each getIdenticonColors(contractAddress) as color, i}
                                    <div style="background-color: {color}"></div>
                                {/each}
                            </div>

                            <div class="flex-1 min-w-0">
                                <h3 class="font-bold text-lg text-zen-fg truncate">
                                    {distribution.name}
                                </h3>
                                <div class="flex items-center gap-2 mt-1">
                                    <code class="text-xs font-mono text-zen-fg-muted truncate">
                                        {contractAddress.slice(0, 10)}...{contractAddress.slice(-8)}
                                    </code>
                                    <button
                                        onclick={copyAddress}
                                        class="p-1 text-zen-fg-subtle hover:text-zen-fg transition-colors"
                                        title={copied ? "Copied!" : "Copy"}
                                    >
                                        {#if copied}
                                            <Check class="w-3 h-3" />
                                        {:else}
                                            <Copy class="w-3 h-3" />
                                        {/if}
                                    </button>
                                    <a
                                        href={getContractUrl(contractAddress)}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        class="p-1 text-zen-fg-subtle hover:text-zen-fg transition-colors"
                                    >
                                        <ExternalLink class="w-3 h-3" />
                                    </a>
                                </div>
                            </div>
                        </div>
                    </div>

                    <!-- Stats Row -->
                    <div class="grid grid-cols-3 divide-x divide-zen-border-subtle border-b border-zen-border-subtle">
                        <div class="p-4 text-center">
                            <div class="text-lg font-bold text-zen-fg">
                                {Number(distribution.amount).toLocaleString()}
                            </div>
                            <div class="text-[10px] uppercase tracking-wider text-zen-fg-subtle mt-0.5">
                                {wizardStore.tokenDetails.tokenSymbol || "Tokens"}
                            </div>
                        </div>
                        <div class="p-4 text-center">
                            <div class="text-lg font-bold text-zen-fg">
                                {recipientCount}
                            </div>
                            <div class="text-[10px] uppercase tracking-wider text-zen-fg-subtle mt-0.5">
                                {recipientCount === 1 ? "Recipient" : "Recipients"}
                            </div>
                            {#if batchCount !== recipientCount}
                                <div class="text-[9px] text-zen-fg-subtle mt-0.5">
                                    {batchCount} batches
                                </div>
                            {/if}
                        </div>
                        <div class="p-4 text-center">
                            <div class="text-lg font-bold text-zen-fg">
                                {distribution.schedule.distributionDuration}
                            </div>
                            <div class="text-[10px] uppercase tracking-wider text-zen-fg-subtle mt-0.5">
                                {distribution.schedule.durationUnit}s
                            </div>
                        </div>
                    </div>

                    <!-- Recipient Preview -->
                    <div class="p-4 border-b border-zen-border-subtle">
                        <div class="text-[10px] uppercase tracking-wider text-zen-fg-subtle mb-3">
                            Recipients
                        </div>
                        <div class="space-y-2">
                            {#each visibleRecipients as recipient}
                                <div class="flex items-center justify-between text-sm">
                                    <span class="text-zen-fg-muted truncate max-w-[140px]">
                                        {recipient.email}
                                    </span>
                                    <span class="font-mono text-zen-fg text-xs">
                                        {recipient.amount.toLocaleString()} {wizardStore.tokenDetails.tokenSymbol || ""}
                                    </span>
                                </div>
                            {/each}
                            {#if remainingCount > 0}
                                <div class="text-xs text-zen-fg-subtle pt-1">
                                    +{remainingCount} more
                                </div>
                            {/if}
                        </div>
                    </div>

                    <!-- Schedule Info -->
                    <div class="p-4 bg-zen-bg/50">
                        <div class="flex items-center justify-between text-sm">
                            <div class="flex items-center gap-2 text-zen-fg-muted">
                                <Calendar class="w-4 h-4" />
                                <span>Cliff</span>
                            </div>
                            <span class="font-medium text-zen-fg">
                                {distribution.schedule.cliffEndDate
                                    ? new Date(distribution.schedule.cliffEndDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
                                    : "No cliff"}
                            </span>
                        </div>
                    </div>
                </div>
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
