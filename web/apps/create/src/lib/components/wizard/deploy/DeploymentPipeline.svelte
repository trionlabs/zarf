<script lang="ts">
    import type { TransactionHash } from "@zarf/core/types";
    import { getExplorerUrl } from "@zarf/core/contracts/explorer";
    import ZenAlert from "@zarf/ui/components/ui/ZenAlert.svelte";
    import ZenButton from "@zarf/ui/components/ui/ZenButton.svelte";
    import ZenSpinner from "@zarf/ui/components/ui/ZenSpinner.svelte";
    import {
        Check,
        ExternalLink,
        Loader2,
        AlertCircle,
    } from "lucide-svelte";

    interface Props {
        currentStep: "idle" | "approve" | "create" | "complete" | "error";
        currentMessage: string;
        approveTxHash: TransactionHash | null;
        createTxHash: TransactionHash | null;
        error: string | null;
        isDeployed: boolean;
        onRetry: () => void;
    }

    let {
        currentStep,
        currentMessage,
        approveTxHash,
        createTxHash,
        error,
        isDeployed,
        onRetry,
    }: Props = $props();

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

    function getStepStatus(
        stepId: "approve" | "create",
    ): "pending" | "active" | "done" | "error" {
        if (currentStep === "error") {
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

    function getTransactionUrl(hash: TransactionHash): string {
        return getExplorerUrl(hash);
    }
</script>

{#if !isDeployed}
    <div class="relative">
        <!-- Vertical line connector -->
        <div class="absolute left-6 top-8 bottom-8 w-0.5 bg-zen-border"></div>

        <div class="space-y-4">
            {#each steps as step}
                {@const status = getStepStatus(step.id)}
                {@const txHash =
                    step.id === "approve" ? approveTxHash : createTxHash}

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
                            <span class="text-sm font-medium"
                                >{step.id === "approve" ? "1" : "2"}</span
                            >
                        {/if}
                    </div>

                    <!-- Step content -->
                    <div class="flex-1 min-w-0">
                        <div class="flex items-center justify-between gap-2">
                            <h3
                                class="font-semibold {status === 'active'
                                    ? 'text-zen-fg'
                                    : 'text-zen-fg-muted'}"
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
                                        >{txHash.slice(0, 6)}...{txHash.slice(
                                            -4,
                                        )}</span
                                    >
                                    <span class="sm:hidden">TX</span>
                                    <ExternalLink class="w-3 h-3" />
                                </a>
                            {/if}
                        </div>

                        <p class="text-sm text-zen-fg-subtle mt-1">
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
                <span class="font-mono text-xs"
                    >{approveTxHash.slice(0, 8)}...</span
                >
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
                <span class="font-mono text-xs"
                    >{createTxHash.slice(0, 8)}...</span
                >
                <ExternalLink class="w-3 h-3" />
            </a>
        {/if}
    </div>
{/if}

<!-- Error Message + inline Retry -->
{#if error}
    <ZenAlert variant="error" class="mb-6 mt-4">
        {#snippet title()}Transaction Failed{/snippet}
        {error}
        {#snippet actions()}
            <ZenButton variant="secondary" size="sm" onclick={onRetry}>
                Retry
            </ZenButton>
        {/snippet}
    </ZenAlert>
{/if}
