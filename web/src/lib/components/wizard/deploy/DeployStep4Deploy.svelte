<script lang="ts">
    import { deployStore } from "$lib/stores/deployStore.svelte";
    import { wizardStore } from "$lib/stores/wizardStore.svelte";
    import {
        DeployService,
        type DeployConfig,
        type DeployProgress,
    } from "$lib/services/deploy";
    import { durationToSeconds, cliffDateToSeconds } from "$lib/utils/vesting";
    import { walletStore } from "$lib/stores/walletStore.svelte";
    import { goto } from "$app/navigation";
    import type { Address, Hash } from "viem";

    // Local state from stores
    let distribution = $derived(deployStore.distribution);
    let merkleResult = $derived(deployStore.merkleResult);
    let deployProgress = $derived(deployStore.deployProgress);
    let error = $derived(deployStore.error);
    let isDeployed = $derived(deployStore.isDeployed);
    let contractAddress = $derived(deployStore.contractAddress);

    // Wallet state from store (reactive)
    let walletAddress = $derived(walletStore.address);
    let isWrongNetwork = $derived(walletStore.isWrongNetwork);
    let isStarting = $state(false);

    // Track tx hashes for each step
    let stepTxHashes = $state<Record<string, Hash>>({});

    async function handleDeploy() {
        if (!distribution || !merkleResult || !walletAddress) return;

        // Critical Edge Case: Prevent execution on wrong network
        if (isWrongNetwork) {
            deployStore.setDeployError(
                "Wrong Network. Please switch to Ethereum Mainnet or Sepolia.",
            );
            return;
        }

        isStarting = true;
        stepTxHashes = {};

        const config: DeployConfig = {
            tokenAddress: (distribution as any).tokenDetails
                ?.tokenAddress as Address,
            verifierAddress: (import.meta.env.VITE_VERIFIER_ADDRESS ||
                "0x0000000000000000000000000000000000000000") as Address,
            jwkRegistryAddress: (import.meta.env.VITE_JWK_REGISTRY_ADDRESS ||
                "0x0000000000000000000000000000000000000000") as Address,
            merkleRoot: ("0x" +
                merkleResult.root.toString(16)) as `0x${string}`,
            allocations: merkleResult.claims.map((c: any) => ({
                emailHash: ("0x" +
                    (c.emailHash?.toString(16) || "0")) as `0x${string}`,
                amount: BigInt(c.amount),
            })),
            cliffSeconds: cliffDateToSeconds(
                distribution.schedule.cliffEndDate,
            ),
            vestingSeconds: durationToSeconds(
                distribution.schedule.distributionDuration,
                distribution.schedule.durationUnit,
            ),
            totalAmount: BigInt(distribution.amount),
            owner: walletAddress,
        };

        // Verify Integrity
        const allocationsSum = config.allocations.reduce(
            (sum, a) => sum + a.amount,
            0n,
        );
        if (allocationsSum !== config.totalAmount) {
            const msg = `Integrity Error: Allocations sum (${allocationsSum}) does not match distribution total (${config.totalAmount}). Please recreate the distribution.`;
            console.error(msg);
            deployStore.setDeployError(msg);
            isStarting = false;
            return;
        }

        const service = new DeployService(config, (progress) => {
            deployStore.updateDeployProgress(progress);

            // Track tx hash for current step
            if (
                progress.txHash &&
                progress.step !== "error" &&
                progress.step !== "complete"
            ) {
                stepTxHashes[progress.step] = progress.txHash;
                stepTxHashes = { ...stepTxHashes }; // trigger reactivity
            }
        });

        try {
            const contractAddr = await service.executeFullDeploy();
            if (contractAddr) {
                deployStore.setDeployed(contractAddr);

                // Persist to Global Store
                const lastTxHash = deployProgress?.txHash || "0x";
                wizardStore.moveDistributionToLaunched(
                    distribution.id,
                    lastTxHash,
                );
            }
        } catch (e: any) {
            console.error("Deploy failed:", e);
            deployStore.setDeployError(e.message || "Deployment failed");
        } finally {
            isStarting = false;
        }
    }

    function goToDashboard() {
        goto("/distributions");
    }

    // Etherscan URL helper
    function getEtherscanUrl(hash: Hash): string {
        // Default to Sepolia, could be dynamic based on chainId
        const baseUrl =
            walletStore.chainId === 1
                ? "https://etherscan.io"
                : "https://sepolia.etherscan.io";
        return `${baseUrl}/tx/${hash}`;
    }

    function getContractEtherscanUrl(address: Address): string {
        const baseUrl =
            walletStore.chainId === 1
                ? "https://etherscan.io"
                : "https://sepolia.etherscan.io";
        return `${baseUrl}/address/${address}`;
    }

    // Progress Helper
    function getStepStatus(
        stepId: string,
        currentStep: DeployProgress["step"] | undefined,
    ): "pending" | "active" | "done" | "error" {
        if (!currentStep) return "pending";

        const steps = [
            "deploy",
            "merkle",
            "allocations",
            "approve",
            "deposit",
            "start",
            "complete",
        ];

        if (currentStep === "error") return "error";

        const currentIndex = steps.indexOf(currentStep);
        const stepIndex = steps.indexOf(stepId);

        if (stepIndex < currentIndex) return "done";
        if (stepIndex === currentIndex) return "active";
        return "pending";
    }

    const steps = [
        {
            id: "deploy",
            label: "Deploy Contract",
            icon: "🚀",
            description: "Creating vesting contract on-chain",
        },
        {
            id: "merkle",
            label: "Set Whitelist",
            icon: "🌳",
            description: "Setting Merkle root for verification",
        },
        {
            id: "allocations",
            label: "Set Allocations",
            icon: "📝",
            description: "Registering recipient allocations",
        },
        {
            id: "approve",
            label: "Approve Tokens",
            icon: "✅",
            description: "Approving token transfer",
        },
        {
            id: "deposit",
            label: "Deposit Tokens",
            icon: "💰",
            description: "Depositing tokens to contract",
        },
        {
            id: "start",
            label: "Start Vesting",
            icon: "⏱️",
            description: "Activating vesting schedule",
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
                Execute 6 transactions to deploy your distribution contract.
            </p>
        {/if}
    </div>

    <!-- Transaction Pipeline -->
    <div class="relative mb-8">
        <!-- Vertical line connector -->
        <div class="absolute left-6 top-8 bottom-8 w-0.5 bg-base-300"></div>

        <div class="space-y-4">
            {#each steps as step, index}
                {@const status = getStepStatus(step.id, deployProgress?.step)}
                {@const txHash = stepTxHashes[step.id]}

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

                        <!-- Allocations batch progress -->
                        {#if step.id === "allocations" && status === "active" && deployProgress?.allocationsBatch}
                            <div class="mt-2">
                                <div class="flex justify-between text-xs mb-1">
                                    <span
                                        >Batch {deployProgress.allocationsBatch
                                            .current} of {deployProgress
                                            .allocationsBatch.total}</span
                                    >
                                    <span
                                        >{Math.round(
                                            (deployProgress.allocationsBatch
                                                .current /
                                                deployProgress.allocationsBatch
                                                    .total) *
                                                100,
                                        )}%</span
                                    >
                                </div>
                                <progress
                                    class="progress progress-primary w-full h-2"
                                    value={deployProgress.allocationsBatch
                                        .current}
                                    max={deployProgress.allocationsBatch.total}
                                ></progress>
                            </div>
                        {/if}

                        <!-- Active step message -->
                        {#if status === "active" && deployProgress?.message}
                            <div
                                class="mt-2 text-sm text-primary font-medium flex items-center gap-2"
                            >
                                <span class="loading loading-dots loading-xs"
                                ></span>
                                {deployProgress.message}
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
            <button class="btn btn-sm btn-outline" onclick={handleDeploy}>
                Retry
            </button>
        </div>
    {/if}

    <!-- Actions -->
    <div class="flex flex-col items-center gap-4">
        {#if !isDeployed && !deployProgress}
            <!-- Big Launch Button -->
            <button
                class="group relative btn btn-primary btn-lg px-12 text-lg shadow-xl
                    hover:shadow-2xl hover:shadow-primary/25 transition-all duration-300
                    disabled:opacity-50"
                onclick={handleDeploy}
                disabled={isStarting || !walletAddress || isWrongNetwork}
            >
                {#if isStarting}
                    <span class="loading loading-spinner"></span>
                    Preparing...
                {:else if !walletAddress}
                    Connect Wallet First
                {:else if isWrongNetwork}
                    Wrong Network
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
                This will require 6 wallet confirmations. Keep this tab open
                until complete.
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
        {:else if deployProgress}
            <!-- In Progress - Show current status -->
            <div class="text-center text-base-content/70">
                <span class="loading loading-ring loading-lg"></span>
                <p class="mt-2">
                    Deployment in progress... Please confirm transactions in
                    your wallet.
                </p>
            </div>
        {/if}
    </div>
</div>
