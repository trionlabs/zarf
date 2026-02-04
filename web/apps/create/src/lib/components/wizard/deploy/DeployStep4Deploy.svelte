<script lang="ts">
    import { deployStore } from "../../../stores/deployStore.svelte";
    import { wizardStore } from "../../../stores/wizardStore.svelte";
    import {
        FactoryDeployService,
        getFactoryAddress,
        isFactoryAvailable,
        parseVestingAddressFromReceipt,
        type FactoryDeployConfig,
        type FactoryDeployProgress,
    } from "../../../services/factoryDeploy";
    import {
        durationToSeconds,
        cliffDateToSeconds,
        unitToPeriodSeconds,
        calculateEndDate,
    } from "@zarf/core/utils/vesting";
    import {
        addOptimisticContract,
        type OnChainVestingContract,
    } from "../../../services/distributionDiscovery";
    import { walletStore } from "@zarf/ui/stores/walletStore.svelte";
    import { goto } from "$app/navigation";
    import {
        Check,
        Rocket,
        AlertTriangle,
        ExternalLink,
        Loader2,
        AlertCircle,
        Copy,
        Download,
        FileText,
        Users,
        Calendar,
        Coins,
    } from "lucide-svelte";
    import type { Address, Hash } from "viem";
    import { parseUnits } from "viem";
    import { onMount } from "svelte";
    import { waitForTransactionReceipt } from "@wagmi/core";
    import { wagmiConfig } from "@zarf/core/contracts/wallet";
    import ZenButton from "@zarf/ui/components/ui/ZenButton.svelte";
    import ZenCard from "@zarf/ui/components/ui/ZenCard.svelte";
    import ZenAlert from "@zarf/ui/components/ui/ZenAlert.svelte";
    import ZenBadge from "@zarf/ui/components/ui/ZenBadge.svelte";
    import ZenSpinner from "@zarf/ui/components/ui/ZenSpinner.svelte";

    // Local state from stores
    let distribution = $derived(deployStore.distribution);
    let merkleResult = $derived(deployStore.merkleResult);
    let isDeployed = $derived(deployStore.isDeployed);
    let contractAddress = $derived(deployStore.contractAddress);

    // Wallet state
    let walletAddress = $derived(walletStore.address);
    let chainId = $derived(walletStore.chainId);
    let isWrongNetwork = $derived(walletStore.isWrongNetwork);

    // Local deployment state
    let isDeploying = $state(false);
    let currentStep = $state<
        "idle" | "approve" | "create" | "complete" | "error"
    >("idle");
    let currentMessage = $state("");
    let error = $state<string | null>(null);

    // Use persisted state from store
    // This enables recovery after refresh
    let approveTxHash = $derived(deployStore.approveTxHash as Hash | null);
    let createTxHash = $derived(deployStore.createTxHash as Hash | null);

    // Factory availability check
    let factoryAddress = $derived(chainId ? getFactoryAddress(chainId) : null);
    let factoryAvailable = $derived(
        chainId ? isFactoryAvailable(chainId) : false,
    );

    // Clean Markup: Extract template logic to $derived
    const showFactoryWarning = $derived(!factoryAvailable && Boolean(chainId));
    const showNotDeployedIdle = $derived(!isDeployed && currentStep === "idle");

    // Recovery Logic: Resume pending transactions after page refresh
    onMount(async () => {
        if (deployStore.createTxHash) {
            if (import.meta.env.DEV)
                console.log("Recovering pending create TX...");
            currentStep = "create";
            isDeploying = true;
            currentMessage = "Checking deployment status...";

            try {
                const receipt = await waitForTransactionReceipt(wagmiConfig, {
                    hash: deployStore.createTxHash as Hash,
                });

                if (receipt.status === "success") {
                    let recoveredAddress: Address | null = null;
                    try {
                        recoveredAddress =
                            parseVestingAddressFromReceipt(receipt);
                    } catch (err) {
                        if (import.meta.env.DEV)
                            console.warn("Failed to parse logs", err);
                    }

                    if (recoveredAddress && distribution) {
                        deployStore.setDeployed(recoveredAddress);
                        wizardStore.moveDistributionToLaunched(
                            distribution.id,
                            receipt.transactionHash,
                        );
                    }

                    currentStep = "complete";
                    isDeploying = false;
                    currentMessage = "Deployment confirmed.";
                } else {
                    error = "Transaction failed on-chain.";
                    isDeploying = false;
                    currentStep = "error";
                }
            } catch (e: unknown) {
                if (import.meta.env.DEV)
                    console.error("Failed to check create tx", e);
                currentMessage = "Waiting for confirmation...";
            }
        } else if (deployStore.approveTxHash) {
            if (import.meta.env.DEV)
                console.log("Recovering pending approval TX...");
            currentStep = "approve";
            isDeploying = true;
            currentMessage = "Checking approval status...";

            try {
                const receipt = await waitForTransactionReceipt(wagmiConfig, {
                    hash: deployStore.approveTxHash as Hash,
                });

                if (receipt.status === "success") {
                    currentStep = "idle";
                    isDeploying = false;
                } else {
                    error = "Approval transaction failed.";
                    isDeploying = false;
                    currentStep = "error";
                }
            } catch (e: unknown) {
                if (import.meta.env.DEV)
                    console.error("Failed to check approve tx", e);
                currentMessage = "Waiting for approval confirmation...";
            }
        }
    });

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
        if (!distribution || !merkleResult || !walletAddress || !chainId)
            return;

        // Auto-switch network if wrong
        if (isWrongNetwork) {
            try {
                currentMessage = "Switching to Sepolia network...";
                await walletStore.switchChain(11155111); // Sepolia
                // Wait for network switch to propagate
                await new Promise((resolve) => setTimeout(resolve, 1000));
            } catch (e: unknown) {
                error =
                    "Failed to switch network. Please switch manually in MetaMask.";
                return;
            }
        }

        // Re-check factory after potential network switch
        const currentFactoryAddress = getFactoryAddress(chainId);
        if (!currentFactoryAddress) {
            error = "Factory contract not available on this network.";
            return;
        }

        isDeploying = true;
        currentStep = "idle";
        error = null;
        // Do not reset hashes here, they are managed by store persistence
        // approveTxHash = null;
        // createTxHash = null;

        // Get token decimals (default to 18 if not set)
        const tokenDecimals = wizardStore.tokenDetails.tokenDecimals ?? 18;

        // Prepare identity commitments and amounts from merkle result
        // amounts are ALREADY in wei (from DeployStep1), so we just BigInt them
        const commitments: Hash[] = merkleResult.claims.map((c: any) => {
            // Use identityCommitment if available, fallback to deprecated emailHash for older cached data
            const commitment =
                c.identityCommitment || c.emailHash?.toString(16);

            // Format to 32-byte hex
            let hex = commitment;
            if (typeof hex === "string" && hex.startsWith("0x")) {
                hex = hex.slice(2);
            }
            if (!hex) hex = "0";

            return `0x${hex.padStart(64, "0")}` as Hash;
        });

        const amounts: bigint[] = merkleResult.claims.map((c: any) =>
            BigInt(c.amount),
        );

        // Prepare merkle root
        const merkleRootHex = merkleResult.root.toString(16);
        const merkleRoot = `0x${merkleRootHex.padStart(64, "0")}` as Hash;

        // Convert total amount to wei using token decimals
        const totalAmountWei = parseUnits(
            String(distribution.amount),
            tokenDecimals,
        );

        // Calculate standard parameters first
        const periodSecondsStandard = unitToPeriodSeconds(
            distribution.schedule.durationUnit,
        );
        let cliffSeconds = cliffDateToSeconds(
            distribution.schedule.cliffEndDate,
            distribution.schedule.cliffTime || "00:00",
        );
        let vestingSeconds = durationToSeconds(
            distribution.schedule.distributionDuration,
            distribution.schedule.durationUnit,
        );
        let periodSeconds = periodSecondsStandard;

        // Check for Past Dates / Full Unlock Scenario
        // If the intended schedule (Cliff + Duration) has already finished, we must
        // configured the contract to unlock immediately, because existing contracts
        // use block.timestamp as start time.
        if (distribution.schedule.cliffEndDate) {
            const cliffDateTime = `${distribution.schedule.cliffEndDate}T${distribution.schedule.cliffTime || "00:00"}:00Z`;
            const cliffDate = new Date(cliffDateTime);
            const endDate = calculateEndDate(
                cliffDate,
                distribution.schedule.distributionDuration,
                distribution.schedule.durationUnit,
            );

            if (endDate && endDate.getTime() <= Date.now()) {
                // Force immediate unlock
                cliffSeconds = 0n;
                vestingSeconds = 1n;
                periodSeconds = 1n;
                console.log(
                    "Past date detected: configured for immediate unlock",
                );
            }
        }

        const config: FactoryDeployConfig = {
            factoryAddress: currentFactoryAddress,
            tokenAddress: wizardStore.tokenDetails.tokenAddress as Address,
            merkleRoot,
            commitments,
            amounts,
            cliffSeconds,
            vestingSeconds,
            periodSeconds,
            totalAmount: totalAmountWei,
            owner: walletAddress!, // Checked at function start
            name: distribution.name,
            description: distribution.description || "",
        };

        // Verify integrity
        const allocationsSum = amounts.reduce((sum, a) => sum + a, 0n);
        if (allocationsSum !== config.totalAmount) {
            error = `Integrity Error: Allocations sum does not match distribution total. Please recreate the distribution.`;
            isDeploying = false;
            return;
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
                    createTxHash || "0x",
                );

                // Optimistic UI Update (Ruthless Review Item #5)
                // Add to discovery cache immediately so it shows up in dashboard
                const optimisticContract: OnChainVestingContract = {
                    address: vestingAddress,
                    name: distribution.name,
                    description: distribution.description || "",
                    token: wizardStore.tokenDetails.tokenAddress as Address,
                    tokenSymbol:
                        wizardStore.tokenDetails.tokenSymbol || "TOKEN",
                    tokenDecimals: wizardStore.tokenDetails.tokenDecimals || 18,
                    owner: walletAddress,
                    vestingStart: BigInt(Math.floor(Date.now() / 1000)), // Approx
                    cliffDuration: BigInt(
                        cliffDateToSeconds(distribution.schedule.cliffEndDate, distribution.schedule.cliffTime || "00:00"),
                    ),
                    vestingDuration: BigInt(
                        durationToSeconds(
                            distribution.schedule.distributionDuration,
                            distribution.schedule.durationUnit,
                        ),
                    ),
                    vestingPeriod: BigInt(
                        unitToPeriodSeconds(distribution.schedule.durationUnit),
                    ),
                    tokenBalance: totalAmountWei,
                };

                try {
                    addOptimisticContract(walletAddress, optimisticContract);
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

        const network = chainId === 1 ? "mainnet" : "sepolia";
        const timestamp = new Date().toISOString();

        const report = `ZARF VESTING CONTRACT DEPLOYMENT REPORT
========================================

Contract Address: ${contractAddress}
Network: ${network}
Chain ID: ${chainId}

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
Decimals: ${wizardStore.tokenDetails.tokenDecimals || 18}

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
Contract: https://${network === "mainnet" ? "" : "sepolia."}etherscan.io/address/${contractAddress}

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
        const hex = address.slice(2, 18); // Take 16 hex chars
        for (let i = 0; i < 16; i += 2) {
            const value = parseInt(hex.slice(i, i + 2), 16);
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
            const amount = Number(c.amount) / Math.pow(10, wizardStore.tokenDetails.tokenDecimals || 18);
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

    // Etherscan URL helpers
    function getEtherscanUrl(hash: Hash): string {
        const baseUrl =
            chainId === 1
                ? "https://etherscan.io"
                : "https://sepolia.etherscan.io";
        return `${baseUrl}/tx/${hash}`;
    }

    function getContractEtherscanUrl(address: Address): string {
        const baseUrl =
            chainId === 1
                ? "https://etherscan.io"
                : "https://sepolia.etherscan.io";
        return `${baseUrl}/address/${address}`;
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
                                                href={getEtherscanUrl(txHash)}
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
                            href={getEtherscanUrl(approveTxHash)}
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
                            href={getEtherscanUrl(createTxHash)}
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
                                        href={getContractEtherscanUrl(contractAddress)}
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
                <ZenCard
                    variant="elevated"
                    class="overflow-hidden sticky top-8"
                >
                    <div>
                        <div
                            class="p-4 bg-zen-bg-elevated border-b border-zen-border-subtle flex justify-between items-center"
                        >
                            <h3
                                class="font-bold text-sm uppercase tracking-wider text-zen-fg-subtle"
                            >
                                Deployment Summary
                            </h3>
                            <ZenBadge variant="default" size="sm">
                                ID: {distribution.id.slice(0, 8)}
                            </ZenBadge>
                        </div>
                        <div class="p-6 grid grid-cols-1 gap-6">
                            <!-- Token Info -->
                            <div>
                                <div
                                    class="text-xs font-semibold uppercase text-zen-fg-subtle mb-1"
                                >
                                    Asset
                                </div>
                                <div class="flex items-center gap-2">
                                    <div
                                        class="w-8 h-8 rounded-full bg-zen-primary-muted flex items-center justify-center text-zen-primary font-bold text-xs"
                                    >
                                        {wizardStore.tokenDetails.tokenSymbol?.charAt(
                                            0,
                                        ) ?? "?"}
                                    </div>
                                    <div>
                                        <div class="font-bold text-lg">
                                            {wizardStore.tokenDetails
                                                .tokenSymbol}
                                        </div>
                                        <div
                                            class="text-xs font-mono text-zen-fg-subtle truncate w-32"
                                        >
                                            {wizardStore.tokenDetails
                                                .tokenAddress}
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <!-- Total Amount -->
                            <div>
                                <div
                                    class="text-xs font-semibold uppercase text-zen-fg-subtle mb-1"
                                >
                                    Total Allocation
                                </div>
                                <div class="font-mono text-xl font-bold">
                                    {Number(
                                        distribution.amount,
                                    ).toLocaleString()}
                                    <span
                                        class="text-sm font-normal text-zen-fg-subtle"
                                        >{wizardStore.tokenDetails
                                            .tokenSymbol}</span
                                    >
                                </div>
                                <div
                                    class="text-xs text-zen-fg-subtle"
                                >
                                    {recipientCount} {recipientCount === 1 ? "Recipient" : "Recipients"}
                                    {#if batchCount !== recipientCount}
                                        ({batchCount} batches)
                                    {/if}
                                </div>
                            </div>

                            <!-- Schedule -->
                            <div
                                class="border-t border-zen-border-subtle pt-4 mt-2"
                            >
                                <div
                                    class="text-xs font-semibold uppercase text-zen-fg-subtle mb-3"
                                >
                                    Vesting Schedule ({distribution.schedule
                                        .durationUnit})
                                </div>
                                <div class="grid grid-cols-1 gap-4">
                                    <div class="flex justify-between">
                                        <div
                                            class="text-[10px] text-zen-fg-subtle uppercase"
                                        >
                                            Cliff Date
                                        </div>
                                        <div class="font-medium text-sm">
                                            {distribution.schedule.cliffEndDate
                                                ? new Date(
                                                      distribution.schedule.cliffEndDate,
                                                  ).toLocaleDateString()
                                                : "None"}
                                        </div>
                                    </div>
                                    <div class="flex justify-between">
                                        <div
                                            class="text-[10px] text-zen-fg-subtle uppercase"
                                        >
                                            Duration
                                        </div>
                                        <div class="font-medium text-sm">
                                            {distribution.schedule
                                                .distributionDuration}
                                            {distribution.schedule
                                                .durationUnit}s
                                        </div>
                                    </div>
                                    <div class="flex justify-between">
                                        <div
                                            class="text-[10px] text-zen-fg-subtle uppercase"
                                        >
                                            Unlock Frequency
                                        </div>
                                        <div class="font-medium text-sm">
                                            Every 1 {distribution.schedule
                                                .durationUnit}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </ZenCard>
            {/if}
        </div>
    </div>
</div>
