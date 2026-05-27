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
            const tokenDecimals = wizardStore.tokenDetails.tokenDecimals ?? 7;

            // Map recipients to { email, amount } format expected by service
            // CRITICAL: Convert amount to token base units using token decimals.
            // This ensures the Merkle Root matches the on-chain values.
            const entries = distribution.recipients.map((r) => ({
                email: r.email || '',
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
                <div
                    class="w-8 h-8 border-2 border-zen-primary border-t-transparent rounded-full animate-spin"
                ></div>
                <div>
                    <h3 class="font-bold">Generating Merkle Tree...</h3>
                    <p class="text-sm text-zen-fg-subtle">
                        Computing Pedersen hashes for {distribution?.recipients?.length || 0} recipients
                    </p>
                </div>
            </div>
        {:else if merkleError}
            <div class="text-zen-error flex flex-col items-center gap-2" in:fly={{ y: 10 }}>
                <div
                    class="w-12 h-12 rounded-full bg-zen-error/10 flex items-center justify-center mb-2"
                >
                    <AlertTriangle class="w-6 h-6 text-zen-error" />
                </div>
                <h3 class="font-bold">Generation Failed</h3>
                <p class="text-sm opacity-80 max-w-md">{merkleError}</p>
                <ZenButton variant="danger" class="mt-4 border border-zen-error" onclick={retry}>
                    Retry
                </ZenButton>
            </div>
        {:else if isPinning}
            <div class="flex flex-col items-center gap-4" in:fly={{ y: 10 }}>
                <div
                    class="w-8 h-8 border-2 border-zen-primary border-t-transparent rounded-full animate-spin"
                ></div>
                <div>
                    <h3 class="font-bold">Pinning claim list to IPFS...</h3>
                    <p class="text-sm text-zen-fg-subtle">
                        Publishing the off-chain claim list so recipients can discover it.
                    </p>
                </div>
            </div>
        {:else if pinError}
            <div class="text-zen-error flex flex-col items-center gap-2" in:fly={{ y: 10 }}>
                <div
                    class="w-12 h-12 rounded-full bg-zen-error/10 flex items-center justify-center mb-2"
                >
                    <AlertTriangle class="w-6 h-6 text-zen-error" />
                </div>
                <h3 class="font-bold">Pinning Failed</h3>
                <p class="text-sm opacity-80 max-w-md">{pinError}</p>
                <ZenButton variant="danger" class="mt-4 border border-zen-error" onclick={retry}>
                    Retry
                </ZenButton>
            </div>
        {:else if merkleResult && !metadataCid && !walletAddress}
            <div class="flex flex-col items-center gap-4" in:fly={{ y: 10 }}>
                <div
                    class="w-12 h-12 rounded-full bg-zen-fg/10 flex items-center justify-center mb-2"
                >
                    <Wallet class="w-6 h-6 text-zen-fg" />
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
                <div
                    class="w-12 h-12 rounded-full bg-zen-error/10 flex items-center justify-center mb-2"
                >
                    <AlertTriangle class="w-6 h-6 text-zen-error" />
                </div>
                <h3 class="font-bold">Wrong Network</h3>
                <p class="text-sm opacity-80 max-w-md">
                    Switch Freighter to the configured Stellar network before pinning.
                </p>
            </div>
        {:else if merkleResult && metadataCid}
            <div class="text-zen-success flex flex-col items-center gap-2" in:fly={{ y: 10 }}>
                <div
                    class="w-12 h-12 rounded-full bg-zen-success/10 flex items-center justify-center mb-2"
                >
                    <CheckCircle2 class="w-6 h-6 text-zen-success" />
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
                <div
                    class="w-8 h-8 border-2 border-zen-primary border-t-transparent rounded-full animate-spin"
                ></div>
                <p class="text-sm text-zen-fg-subtle">Loading distribution data...</p>
            </div>
        {/if}
    </div>
</div>
