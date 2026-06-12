<script lang="ts">
    import { deployStore } from '../../../stores/deployStore.svelte';

    import { fly } from 'svelte/transition';
    import { AlertTriangle, CheckCircle2, Wallet } from 'lucide-svelte';

    import { wizardStore } from '../../../stores/wizardStore.svelte';
    import { parseTokenAmount } from '@zarf/core/utils/amount';
    import { buildClaimList } from '@zarf/core/domain/claimListBuilder';
    import { planScheduleSeconds } from '@zarf/core/domain/deployPlanner';
    import { pinClaimList } from '../../../services/pinService';
    import { walletStore } from '@zarf/ui/stores/walletStore.svelte';
    import ZenButton from '@zarf/ui/components/ui/ZenButton.svelte';
    import { toMessage } from '@zarf/core/utils/error';
    import { err } from '@zarf/core/utils/log';

    // Direct state access from Runes Class
    let distribution = $derived(deployStore.distribution);
    let isGeneratingMerkle = $derived(deployStore.isGeneratingMerkle);
    let merkleResult = $derived(deployStore.merkleResult);
    let merkleError = $derived(deployStore.merkleError);
    let isPinning = $derived(deployStore.isPinning);
    let pinError = $derived(deployStore.pinError);
    let metadataCid = $derived(deployStore.metadataCid);
    let walletAddress = $derived(walletStore.address);
    let isWrongNetwork = $derived(walletStore.isWrongNetwork);
    let walletError = $derived(walletStore.error);

    async function pinList(result: typeof merkleResult) {
        if (!distribution || !result) return;
        if (!walletAddress) return;
        if (isWrongNetwork) return;

        deployStore.startPinning();
        try {
            const planAt = new Date();
            deployStore.setSchedulePlanAt(planAt);
            const seconds = planScheduleSeconds(distribution.schedule, planAt);
            const claimList = await buildClaimList({
                claims: result.claims,
                root: result.root,
                cliffSeconds: seconds.cliffSeconds,
                vestingSeconds: seconds.vestingSeconds,
                periodSeconds: seconds.periodSeconds,
            });
            const pinned = await pinClaimList(claimList, { owner: walletAddress });
            deployStore.setMetadataCid(pinned.cid);
        } catch (e: unknown) {
            err('Pin error:', e);
            deployStore.setPinError(toMessage(e, 'Failed to pin claim list to IPFS'));
        }
    }

    async function generateTree() {
        if (!distribution) return;

        deployStore.startMerkleGeneration();

        try {
            // Recipient emails are redacted before the wizard state touches
            // localStorage, so a restored session cannot rebuild the tree —
            // generating with blank emails would silently produce a tree no
            // recipient could ever claim from.
            if (
                distribution.recipients.length === 0 ||
                distribution.recipients.some((r) => !r.email)
            ) {
                deployStore.setMerkleError(
                    'Recipient emails are not kept on disk for privacy. Re-import the recipient CSV for this distribution, then return here to deploy.',
                );
                return;
            }

            const tokenDecimals = wizardStore.tokenDetails.tokenDecimals ?? 7;

            // Map recipients to { email, amount } format expected by service
            // CRITICAL: Convert amount to token base units using token decimals.
            // This ensures the Merkle Root matches the on-chain values.
            const entries = distribution.recipients.map((r) => ({
                // Guard above guarantees non-empty; `?? ''` only narrows the type.
                email: r.email ?? '',
                // We pass BigInt directly to avoid precision loss
                amount: parseTokenAmount(String(r.amount), tokenDecimals),
            }));

            // ADR-023: Discrete Vesting - Generator needs Schedule
            const { processWhitelist } = await import('@zarf/core/crypto/merkleTree');
            const result = await processWhitelist(entries, distribution.schedule);
            deployStore.setMerkleResult(result);
            if (walletAddress && !isWrongNetwork) {
                await pinList(result);
            }
        } catch (e: unknown) {
            err('Merkle generation error:', e);
            deployStore.setMerkleError(toMessage(e, 'Failed to generate Merkle Tree'));
        }
    }

    $effect(() => {
        // If everything is ready, don't regenerate
        if (merkleResult && metadataCid) return;

        // Pin already-generated merkle if pinning failed earlier or never ran
        if (
            merkleResult &&
            !metadataCid &&
            !isPinning &&
            !pinError &&
            walletAddress &&
            !isWrongNetwork
        ) {
            pinList(merkleResult);
            return;
        }

        // If data is ready and not already generating or error, start
        // This fixes the race condition where distribution loads after mount
        if (distribution && !merkleResult && !isGeneratingMerkle && !merkleError) {
            generateTree();
        }
    });

    function retry() {
        if (merkleResult) {
            pinList(merkleResult);
        } else {
            generateTree();
        }
    }

    async function connectWallet() {
        try {
            await walletStore.requestConnection();
        } catch {
            // walletStore owns the displayed error state
        }
    }
</script>

<div class="p-8">
    <div class="mb-6">
        <h2 class="text-2xl font-bold mb-2">Preparing Distribution</h2>
        <p class="text-zen-fg-muted">
            We are generating the cryptographic proofs required for your recipients to claim their
            tokens.
        </p>
    </div>

    {#if deployStore.priorCreateTxHash || deployStore.priorApproveTxHash}
        <!-- An earlier attempt submitted on-chain transactions before the
             session was interrupted. The cryptographic tree is not kept on
             disk, so the flow restarts — but the user must check whether the
             previous attempt already completed before deploying again. -->
        <div
            class="rounded-lg p-4 mb-8 border border-amber-500/40 bg-amber-500/10 flex gap-3"
            transition:fly={{ y: 8, duration: 200 }}
        >
            <AlertTriangle class="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
            <div class="text-sm">
                <p class="font-bold mb-1">A previous deployment attempt was interrupted</p>
                <p class="text-zen-fg-muted mb-2">
                    On-chain transactions were submitted before the page was reloaded. Check your
                    dashboard — if this distribution already launched, do not deploy it again.
                </p>
                {#if deployStore.priorCreateTxHash}
                    <p class="font-mono text-xs break-all text-zen-fg-muted">
                        create tx: {deployStore.priorCreateTxHash}
                    </p>
                {/if}
                {#if deployStore.priorApproveTxHash}
                    <p class="font-mono text-xs break-all text-zen-fg-muted">
                        approve tx: {deployStore.priorApproveTxHash}
                    </p>
                {/if}
            </div>
        </div>
    {/if}

    {#if distribution}
        <!-- Summary Card -->
        <div class="bg-zen-fg/5 rounded-lg p-4 mb-8 border border-zen-border">
            <h3 class="font-bold text-sm uppercase tracking-wider text-zen-fg-muted mb-3">
                Distribution Summary
            </h3>
            <div class="grid grid-cols-2 gap-4">
                <div>
                    <span class="text-xs text-zen-fg-subtle block">Token Amount</span>
                    <span class="font-mono font-bold text-lg"
                        >{Number(distribution.amount).toLocaleString('en-US')}</span
                    >
                </div>
                <div>
                    <span class="text-xs text-zen-fg-subtle block">Recipients</span>
                    <span class="font-mono font-bold text-lg">{distribution.recipients.length}</span
                    >
                </div>
                <div>
                    <span class="text-xs text-zen-fg-subtle block">Vesting Duration</span>
                    <span class="font-mono font-bold"
                        >{distribution.schedule?.distributionDuration}
                        {distribution.schedule?.durationUnit}</span
                    >
                </div>
                <div>
                    <span class="text-xs text-zen-fg-subtle block">Cliff Date</span>
                    <span class="font-mono font-bold">{distribution.schedule?.cliffEndDate}</span>
                </div>
            </div>
        </div>
    {/if}

    <!-- Status Area -->
    <div
        class="min-h-[120px] flex flex-col justify-center items-center text-center p-6 border border-dashed border-zen-border rounded-xl bg-zen-bg"
    >
        {#if isGeneratingMerkle}
            <div class="flex flex-col items-center gap-4" in:fly={{ y: 10 }}>
                <div class="relative flex items-center justify-center">
                    <div class="absolute w-16 h-16 rounded-full bg-zen-primary/5 blur-md animate-pulse-glow"></div>
                    <div class="w-12 h-12 rounded-full border border-zen-border flex items-center justify-center">
                        <div class="w-5 h-5 border-2 border-zen-primary border-t-transparent rounded-full animate-spin"></div>
                    </div>
                </div>
                <div>
                    <h3 class="font-bold text-zen-fg">Generating Merkle Tree...</h3>
                    <p class="text-sm text-zen-fg-subtle">
                        Computing Pedersen hashes for {distribution?.recipients?.length || 0} recipients
                    </p>
                </div>
            </div>
        {:else if merkleError}
            <div class="text-zen-error flex flex-col items-center gap-2" in:fly={{ y: 10 }}>
                <div class="relative flex items-center justify-center mb-2">
                    <div class="absolute w-16 h-16 rounded-full bg-zen-error/10 blur-xl animate-pulse-glow"></div>
                    <div class="w-12 h-12 rounded-full border border-zen-error/20 bg-zen-bg-elevated backdrop-blur-sm flex items-center justify-center relative animate-float">
                        <AlertTriangle class="w-5 h-5 text-zen-error" />
                        <span class="absolute top-0.5 right-0.5 w-1.5 h-1.5 rounded-full bg-zen-error animate-pulse"></span>
                    </div>
                </div>
                <h3 class="font-bold">Generation Failed</h3>
                <p class="text-sm opacity-80 max-w-md">{merkleError}</p>
                <ZenButton variant="danger" class="mt-4 border border-zen-error" onclick={retry}>
                    Retry
                </ZenButton>
            </div>
        {:else if isPinning}
            <div class="flex flex-col items-center gap-4" in:fly={{ y: 10 }}>
                <div class="relative flex items-center justify-center">
                    <div class="absolute w-16 h-16 rounded-full bg-zen-primary/5 blur-md animate-pulse-glow"></div>
                    <div class="w-12 h-12 rounded-full border border-zen-border flex items-center justify-center">
                        <div class="w-5 h-5 border-2 border-zen-primary border-t-transparent rounded-full animate-spin"></div>
                    </div>
                </div>
                <div>
                    <h3 class="font-bold text-zen-fg">Pinning claim list to IPFS...</h3>
                    <p class="text-sm text-zen-fg-subtle">
                        Publishing the off-chain claim list so recipients can discover it.
                    </p>
                </div>
            </div>
        {:else if pinError}
            <div class="text-zen-error flex flex-col items-center gap-2" in:fly={{ y: 10 }}>
                <div class="relative flex items-center justify-center mb-2">
                    <div class="absolute w-16 h-16 rounded-full bg-zen-error/10 blur-xl animate-pulse-glow"></div>
                    <div class="w-12 h-12 rounded-full border border-zen-error/20 bg-zen-bg-elevated backdrop-blur-sm flex items-center justify-center relative animate-float">
                        <AlertTriangle class="w-5 h-5 text-zen-error" />
                        <span class="absolute top-0.5 right-0.5 w-1.5 h-1.5 rounded-full bg-zen-error animate-pulse"></span>
                    </div>
                </div>
                <h3 class="font-bold">Pinning Failed</h3>
                <p class="text-sm opacity-80 max-w-md">{pinError}</p>
                <ZenButton variant="danger" class="mt-4 border border-zen-error" onclick={retry}>
                    Retry
                </ZenButton>
            </div>
        {:else if merkleResult && !metadataCid && !walletAddress}
            <div class="flex flex-col items-center gap-4" in:fly={{ y: 10 }}>
                <div class="relative flex items-center justify-center mb-2">
                    <div class="absolute w-16 h-16 rounded-full bg-zen-primary/10 blur-xl animate-pulse-glow"></div>
                    <div class="w-12 h-12 rounded-full border border-zen-border bg-zen-bg-elevated backdrop-blur-sm flex items-center justify-center relative animate-float">
                        <Wallet class="w-5 h-5 text-zen-primary" />
                        <span class="absolute top-0.5 right-0.5 w-1.5 h-1.5 rounded-full bg-zen-primary animate-pulse"></span>
                    </div>
                </div>
                <div>
                    <h3 class="font-bold">Authorize Pinning</h3>
                    <p class="text-sm text-zen-fg-subtle max-w-md">
                        Connect Freighter to sign the IPFS pin request for this distribution.
                    </p>
                    {#if walletError}
                        <p class="text-sm text-zen-error mt-2">{walletError}</p>
                    {/if}
                </div>
                <ZenButton
                    variant="primary"
                    class="mt-2"
                    loading={walletStore.isConnecting}
                    onclick={connectWallet}
                >
                    Connect Wallet
                </ZenButton>
            </div>
        {:else if merkleResult && !metadataCid && isWrongNetwork}
            <div class="text-zen-error flex flex-col items-center gap-2" in:fly={{ y: 10 }}>
                <div class="relative flex items-center justify-center mb-2">
                    <div class="absolute w-16 h-16 rounded-full bg-zen-error/10 blur-xl animate-pulse-glow"></div>
                    <div class="w-12 h-12 rounded-full border border-zen-error/20 bg-zen-bg-elevated backdrop-blur-sm flex items-center justify-center relative animate-float">
                        <AlertTriangle class="w-5 h-5 text-zen-error" />
                        <span class="absolute top-0.5 right-0.5 w-1.5 h-1.5 rounded-full bg-zen-error animate-pulse"></span>
                    </div>
                </div>
                <h3 class="font-bold">Wrong Network</h3>
                <p class="text-sm opacity-80 max-w-md">
                    Switch Freighter to the configured Stellar network before pinning.
                </p>
            </div>
        {:else if merkleResult && metadataCid}
            <div class="text-zen-success flex flex-col items-center gap-2" in:fly={{ y: 10 }}>
                <div class="relative flex items-center justify-center mb-2">
                    <div class="absolute w-16 h-16 rounded-full bg-zen-success/15 blur-xl animate-pulse-glow"></div>
                    <div class="w-12 h-12 rounded-full border border-zen-success/20 bg-zen-bg-elevated backdrop-blur-sm flex items-center justify-center relative animate-float">
                        <CheckCircle2 class="w-5 h-5 text-zen-success" />
                        <span class="absolute top-0.5 right-0.5 w-1.5 h-1.5 rounded-full bg-zen-success animate-pulse"></span>
                    </div>
                </div>
                <h3 class="font-bold">Ready for Deployment</h3>
                <p class="text-sm text-zen-fg-subtle font-mono text-center">
                    Merkle Root:<br />
                    <span class="bg-zen-fg/10 px-2 py-1 rounded text-xs select-all"
                        >0x{merkleResult.root.toString(16)}</span
                    >
                </p>
                <p class="text-sm text-zen-fg-subtle font-mono text-center mt-2">
                    Claim list CID:<br />
                    <span class="bg-zen-fg/10 px-2 py-1 rounded text-xs select-all"
                        >{metadataCid}</span
                    >
                </p>
            </div>
        {:else}
            <div class="flex flex-col items-center gap-4">
                <div class="relative flex items-center justify-center">
                    <div class="absolute w-12 h-12 rounded-full bg-zen-primary/5 blur-sm animate-pulse-glow"></div>
                    <div class="w-8 h-8 border-2 border-zen-primary border-t-transparent rounded-full animate-spin"></div>
                </div>
                <p class="text-sm text-zen-fg-subtle">Loading distribution data...</p>
            </div>
        {/if}
    </div>
</div>

<style>
    @keyframes float {
        0%, 100% {
            transform: translateY(0px);
        }
        50% {
            transform: translateY(-4px);
        }
    }
    
    @keyframes pulse-glow {
        0%, 100% {
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
