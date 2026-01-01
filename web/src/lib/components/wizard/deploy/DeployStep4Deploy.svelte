<script lang="ts">
    import { deployStore } from "$lib/stores/deployStore.svelte";
    import { wizardStore } from "$lib/stores/wizardStore.svelte";
    import {
        FactoryDeployService,
        getFactoryAddress,
        isFactoryAvailable,
        parseVestingAddressFromReceipt,
        type FactoryDeployConfig,
        type FactoryDeployProgress,
    } from "$lib/services/factoryDeploy";
    import {
        durationToSeconds,
        cliffDateToSeconds,
        unitToPeriodSeconds,
    } from "$lib/utils/vesting";
    import {
        addOptimisticContract,
        type OnChainVestingContract,
    } from "$lib/services/distributionDiscovery";
    import { walletStore } from "$lib/stores/walletStore.svelte";
    import { goto } from "$app/navigation";
    import {
        Check,
        Rocket,
        AlertTriangle,
        ExternalLink,
        Loader2,
        Sparkles,
        AlertCircle,
    } from "lucide-svelte";
    import type { Address, Hash } from "viem";
    import { parseUnits } from "viem";
    import { onMount } from "svelte";
    import { waitForTransactionReceipt } from "@wagmi/core";
    import { wagmiConfig } from "$lib/contracts/wallet";

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

        const config: FactoryDeployConfig = {
            factoryAddress: currentFactoryAddress,
            tokenAddress: wizardStore.tokenDetails.tokenAddress as Address,
            merkleRoot,
            commitments,
            amounts,
            cliffSeconds: cliffDateToSeconds(
                distribution.schedule.cliffEndDate,
            ),
            vestingSeconds: durationToSeconds(
                distribution.schedule.distributionDuration,
                distribution.schedule.durationUnit,
            ),
            periodSeconds: unitToPeriodSeconds(
                distribution.schedule.durationUnit,
            ),
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
                        cliffDateToSeconds(distribution.schedule.cliffEndDate),
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
            icon: "✅",
            description: "Allow factory contract to transfer your tokens",
        },
        {
            id: "create" as const,
            label: "Create Distribution",
            icon: "🚀",
            description:
                "Deploy contract, set allocations, fund & start vesting",
        },
    ];
</script>

<div class="p-8 max-w-3xl mx-auto">
    <!-- Header -->
    <div class="mb-8 text-center">
        {#if isDeployed}
            <div class="mb-4">
                <span class="text-6xl animate-bounce inline-block">🎉</span>
            </div>
            <h2 class="text-3xl font-bold text-success mb-2">
                Deployment Complete!
            </h2>
            <p class="text-base-content/70">
                Your distribution is now live and ready for claims.
            </p>
        {:else}
            <h2 class="text-3xl font-bold mb-2">Deploy Distribution</h2>
            <p class="text-base-content/70">
                Execute 2 transactions to deploy your distribution contract.
            </p>
            <div class="badge badge-success badge-outline mt-2 gap-1">
                <svg class="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                    <path
                        fill-rule="evenodd"
                        d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                        clip-rule="evenodd"
                    />
                </svg>
                Factory Pattern: 2 TX instead of 6
            </div>
        {/if}
    </div>

    <!-- Factory Not Available Warning -->
    {#if showFactoryWarning}
        <div class="alert alert-warning mb-6">
            <svg
                class="w-6 h-6"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
            >
                <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    stroke-width="2"
                    d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                />
            </svg>
            <div>
                <h3 class="font-bold">Factory Not Available</h3>
                <p class="text-sm">
                    Factory contract is not deployed on this network yet.
                </p>
            </div>
        </div>
    {/if}

    <!-- Transaction Pipeline (2 Steps) -->
    <div class="relative mb-8">
        <!-- Vertical line connector -->
        <div class="absolute left-6 top-8 bottom-8 w-0.5 bg-base-300"></div>

        <div class="space-y-4">
            {#each steps as step}
                {@const status = getStepStatus(step.id)}
                {@const txHash =
                    step.id === "approve" ? approveTxHash : createTxHash}

                <div
                    class="relative flex items-start gap-4 p-4 rounded-xl transition-all duration-300
                        {status === 'active'
                        ? 'bg-primary/5 border border-primary/20 shadow-lg shadow-primary/5'
                        : ''}
                        {status === 'done' ? 'bg-success/5' : ''}
                        {status === 'error'
                        ? 'bg-error/5 border border-error/20'
                        : ''}
                        {status === 'pending' ? 'opacity-50' : ''}"
                >
                    <!-- Step indicator -->
                    <div
                        class="relative z-10 w-12 h-12 rounded-full flex items-center justify-center text-xl
                            transition-all duration-300
                            {status === 'done'
                            ? 'bg-success text-success-content'
                            : ''}
                            {status === 'active'
                            ? 'bg-primary text-primary-content animate-pulse'
                            : ''}
                            {status === 'error'
                            ? 'bg-error text-error-content'
                            : ''}
                            {status === 'pending'
                            ? 'bg-base-300 text-base-content/50'
                            : ''}"
                    >
                        {#if status === "done"}
                            <svg
                                class="w-6 h-6"
                                fill="none"
                                stroke="currentColor"
                                viewBox="0 0 24 24"
                            >
                                <path
                                    stroke-linecap="round"
                                    stroke-linejoin="round"
                                    stroke-width="3"
                                    d="M5 13l4 4L19 7"
                                />
                            </svg>
                        {:else if status === "active"}
                            <span class="loading loading-spinner loading-sm"
                            ></span>
                        {:else if status === "error"}
                            <svg
                                class="w-6 h-6"
                                fill="none"
                                stroke="currentColor"
                                viewBox="0 0 24 24"
                            >
                                <path
                                    stroke-linecap="round"
                                    stroke-linejoin="round"
                                    stroke-width="2"
                                    d="M6 18L18 6M6 6l12 12"
                                />
                            </svg>
                        {:else}
                            {step.icon}
                        {/if}
                    </div>

                    <!-- Step content -->
                    <div class="flex-1 min-w-0">
                        <div class="flex items-center justify-between gap-2">
                            <h3
                                class="font-bold text-lg {status === 'active'
                                    ? 'text-primary'
                                    : ''}"
                            >
                                {step.label}
                            </h3>

                            <!-- TX Hash Link -->
                            {#if txHash}
                                <a
                                    href={getEtherscanUrl(txHash)}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    class="btn btn-ghost btn-xs gap-1 font-mono"
                                >
                                    <span class="hidden sm:inline"
                                        >{txHash.slice(0, 6)}...{txHash.slice(
                                            -4,
                                        )}</span
                                    >
                                    <span class="sm:hidden">TX</span>
                                    <svg
                                        class="w-3 h-3"
                                        fill="none"
                                        stroke="currentColor"
                                        viewBox="0 0 24 24"
                                    >
                                        <path
                                            stroke-linecap="round"
                                            stroke-linejoin="round"
                                            stroke-width="2"
                                            d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
                                        />
                                    </svg>
                                </a>
                            {/if}
                        </div>

                        <p class="text-sm text-base-content/60 mt-1">
                            {step.description}
                        </p>

                        <!-- Active step message -->
                        {#if status === "active" && currentMessage}
                            <div
                                class="mt-2 text-sm text-primary font-medium flex items-center gap-2"
                            >
                                <span class="loading loading-dots loading-xs"
                                ></span>
                                {currentMessage}
                            </div>
                        {/if}
                    </div>
                </div>
            {/each}
        </div>
    </div>

    <!-- Error Message -->
    {#if error}
        <div class="alert alert-error mb-6 shadow-lg">
            <svg
                class="w-6 h-6"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
            >
                <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    stroke-width="2"
                    d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                />
            </svg>
            <div class="flex-1">
                <h3 class="font-bold">Transaction Failed</h3>
                <p class="text-sm">{error}</p>
            </div>
            <button class="btn btn-sm btn-outline" onclick={retry}>
                Retry
            </button>
        </div>
    {/if}

    <!-- Actions -->
    <div class="flex flex-col items-center gap-4">
        {#if showNotDeployedIdle}
            <!-- Big Launch Button -->
            <button
                class="group relative btn btn-primary btn-lg px-12 text-lg shadow-xl
                    hover:shadow-2xl hover:shadow-primary/25 transition-all duration-300
                    disabled:opacity-50"
                onclick={handleDeploy}
                disabled={isDeploying ||
                    !walletAddress ||
                    isWrongNetwork ||
                    !factoryAvailable}
            >
                {#if isDeploying}
                    <span class="loading loading-spinner"></span>
                    Preparing...
                {:else if !walletAddress}
                    Connect Wallet First
                {:else if isWrongNetwork}
                    Wrong Network
                {:else if !factoryAvailable}
                    Factory Not Available
                {:else}
                    <span class="mr-2">🚀</span>
                    Launch Deployment
                    <span class="absolute -top-1 -right-1 flex h-3 w-3">
                        <span
                            class="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75"
                        ></span>
                        <span
                            class="relative inline-flex rounded-full h-3 w-3 bg-primary-focus"
                        ></span>
                    </span>
                {/if}
            </button>

            <p class="text-xs text-base-content/50 text-center max-w-md">
                This will require only 2 wallet confirmations. Much faster than
                before!
            </p>
        {:else if isDeployed && contractAddress}
            <!-- Success State -->
            <div
                class="card bg-success/10 border border-success/30 w-full max-w-md"
            >
                <div class="card-body items-center text-center">
                    <h3 class="card-title text-success">Contract Deployed</h3>

                    <div
                        class="flex items-center gap-2 bg-base-100 px-4 py-2 rounded-lg font-mono text-sm"
                    >
                        <span class="truncate">{contractAddress}</span>
                        <a
                            href={getContractEtherscanUrl(contractAddress)}
                            target="_blank"
                            rel="noopener noreferrer"
                            class="btn btn-ghost btn-xs btn-square"
                            aria-label="View on Etherscan"
                        >
                            <svg
                                class="w-4 h-4"
                                fill="none"
                                stroke="currentColor"
                                viewBox="0 0 24 24"
                            >
                                <path
                                    stroke-linecap="round"
                                    stroke-linejoin="round"
                                    stroke-width="2"
                                    d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
                                />
                            </svg>
                        </a>
                    </div>

                    <div class="card-actions mt-4">
                        <button
                            class="btn btn-primary btn-wide"
                            onclick={goToDashboard}
                        >
                            View Dashboard
                        </button>
                    </div>
                </div>
            </div>
        {:else if currentStep !== "idle" && currentStep !== "error"}
            <!-- In Progress -->
            <div
                class="flex flex-col items-center gap-4 text-center text-base-content/70"
            >
                <span class="loading loading-ring loading-lg"></span>
                <p>
                    Deployment in progress... Please confirm transactions in
                    your wallet.
                </p>

                {#if currentMessage}
                    <p class="text-sm text-primary">{currentMessage}</p>
                {/if}

                <!-- Show contract address if already known -->
                {#if contractAddress}
                    <div class="mt-2 p-3 bg-success/10 rounded-lg">
                        <p class="text-xs text-success font-medium mb-1">
                            Contract Address:
                        </p>
                        <code class="text-xs font-mono">{contractAddress}</code>
                    </div>
                {/if}

                <!-- Reset button for stuck states -->
                <button
                    class="btn btn-ghost btn-xs text-error opacity-50 hover:opacity-100 mt-4"
                    onclick={resetDeployState}
                >
                    Reset Stuck State
                </button>
            </div>
        {/if}
    </div>
</div>
