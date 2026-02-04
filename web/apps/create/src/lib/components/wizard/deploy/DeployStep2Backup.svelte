<script lang="ts">
    import { deployStore } from "../../../stores/deployStore.svelte";
    import { fly } from "svelte/transition";
    import { Globe, Key } from "lucide-svelte";

    import { walletStore } from "@zarf/ui/stores/walletStore.svelte";
    import { wizardStore } from "../../../stores/wizardStore.svelte";
    import { getFactoryAddress } from "../../../services/factoryDeploy";
    import { getWalletClient } from "@wagmi/core";
    import { wagmiConfig } from "@zarf/core/contracts/wallet";
    import { publicActions } from "viem";
    import { ZarfVestingFactoryABI } from "@zarf/core/contracts/abis/ZarfVestingFactory";
    import { parseUnits, type Address } from "viem";
    import {
        durationToSeconds,
        cliffDateToSeconds,
        calculateEndDate,
    } from "@zarf/core/utils/vesting";
    import { hashEmail } from "@zarf/core/utils/email";
    import type { MerkleClaim } from "@zarf/core/types";
    import ZenCard from "@zarf/ui/components/ui/ZenCard.svelte";
    import ZenButton from "@zarf/ui/components/ui/ZenButton.svelte";
    import ZenAlert from "@zarf/ui/components/ui/ZenAlert.svelte";
    import ZenCheckbox from "@zarf/ui/components/ui/ZenCheckbox.svelte";

    // Direct derived state
    let distribution = $derived(deployStore.distribution);
    let merkleResult = $derived(deployStore.merkleResult);
    let isBackupDownloaded = $derived(deployStore.isBackupDownloaded);
    let isBackupConfirmed = $derived(deployStore.isBackupConfirmed);

    let isPredicting = $state(false);

    /**
     * Generate Pedersen hashes of unique emails for distribution filtering.
     * These hashes allow the claim app to verify if a user's email
     * is included in the distribution without revealing the actual emails.
     */
    async function generateEmailHashes(claims: MerkleClaim[]): Promise<string[]> {
        // Extract unique emails (normalizeEmail is called inside hashEmail)
        const uniqueEmails = [...new Set(claims.map((c) => c.email))];

        // Compute Pedersen hash for each email using shared utility
        return Promise.all(uniqueEmails.map((email) => hashEmail(email)));
    }

    function getPeriodSeconds(unit: string): number {
        switch (unit) {
            case "minutes":
                return 60;
            case "hours":
                return 3600;
            case "weeks":
                return 7 * 24 * 3600;
            case "months":
                return 30 * 24 * 3600;
            case "quarters":
                return 90 * 24 * 3600;
            case "years":
                return 365 * 24 * 3600;
            default:
                return 30 * 24 * 3600;
        }
    }

    async function downloadPublicData() {
        if (!distribution || !merkleResult) return;

        let filename = "distribution-data.json";

        if (walletStore.address && walletStore.chainId) {
            isPredicting = true;
            try {
                const factoryAddress = getFactoryAddress(walletStore.chainId);
                if (factoryAddress) {
                    const tokenDecimals =
                        wizardStore.tokenDetails.tokenDecimals ?? 18;
                    const commitments = merkleResult.claims.map(
                        (c) =>
                            "0x" +
                            c.identityCommitment.slice(2).padStart(64, "0"),
                    );
                    const amounts = merkleResult.claims.map((c) =>
                        BigInt(c.amount),
                    );
                    const merkleRoot =
                        "0x" + merkleResult.root.toString(16).padStart(64, "0");
                    const totalAmount = parseUnits(
                        String(distribution.amount),
                        tokenDecimals,
                    );

                    let periodSeconds = BigInt(
                        getPeriodSeconds(distribution.schedule.durationUnit),
                    );
                    let cliffSeconds = BigInt(
                        cliffDateToSeconds(distribution.schedule.cliffEndDate, distribution.schedule.cliffTime || "00:00"),
                    );
                    let vestingSeconds = BigInt(
                        durationToSeconds(
                            distribution.schedule.distributionDuration,
                            distribution.schedule.durationUnit,
                        ),
                    );

                    if (distribution.schedule.cliffEndDate) {
                        const cliffDateTime = `${distribution.schedule.cliffEndDate}T${distribution.schedule.cliffTime || "00:00"}:00Z`;
                        const endDate = calculateEndDate(
                            new Date(cliffDateTime),
                            distribution.schedule.distributionDuration,
                            distribution.schedule.durationUnit,
                        );
                        if (endDate && endDate.getTime() <= Date.now()) {
                            cliffSeconds = 0n;
                            vestingSeconds = 1n;
                            periodSeconds = 1n;
                        }
                    }

                    const params = {
                        name: distribution.name,
                        description: distribution.description || "",
                        token: wizardStore.tokenDetails.tokenAddress as Address,
                        merkleRoot: merkleRoot as `0x${string}`,
                        commitments: commitments as `0x${string}`[],
                        amounts: amounts,
                        cliffDuration: cliffSeconds,
                        vestingDuration: vestingSeconds,
                        vestingPeriod: periodSeconds,
                    };

                    // MASTERCLASS: Use wallet's RPC - no CORS issues
                    const walletClient = await getWalletClient(wagmiConfig);
                    if (walletClient) {
                        const client = walletClient.extend(publicActions);
                        const predicted = await client.readContract({
                            address: factoryAddress,
                            abi: ZarfVestingFactoryABI,
                            functionName: "predictVestingAddress",
                            args: [params, walletStore.address],
                        });

                        if (predicted) {
                            filename = `${(predicted as string).toLowerCase()}.json`;
                        }
                    }
                }
            } catch (e) {
                console.warn("Failed to predict address:", e);
            } finally {
                isPredicting = false;
            }
        }

        const cliffEndUnix = Math.floor(
            new Date(distribution.schedule.cliffEndDate).getTime() / 1000,
        );
        const periodSeconds = getPeriodSeconds(
            distribution.schedule.durationUnit,
        );
        const totalPeriods = distribution.schedule.distributionDuration;

        // Generate email hashes for claim-side filtering
        let emailHashes: string[] = [];
        try {
            emailHashes = await generateEmailHashes(merkleResult.claims);
        } catch (e) {
            console.warn("Failed to generate email hashes:", e);
            // Continue without email hashes - distribution will be visible to all
        }

        const publicData = {
            merkleRoot: "0x" + merkleResult.root.toString(16),
            schedule: {
                vestingStart: cliffEndUnix,
                cliffDuration: 0,
                vestingDuration: totalPeriods * periodSeconds,
                vestingPeriod: periodSeconds,
                totalPeriods: totalPeriods,
            },
            leaves: merkleResult.claims.map((c) => "0x" + c.leaf.toString(16)),
            commitments: merkleResult.claims.reduce(
                (acc, c) => {
                    acc[c.identityCommitment] = {
                        amount: c.amount.toString(),
                        unlockTime: c.unlockTime,
                        index: c.leafIndex,
                    };
                    return acc;
                },
                {} as Record<
                    string,
                    { amount: string; unlockTime: number; index: number }
                >,
            ),
            // Email hashes for claim-side filtering (privacy-preserving)
            emailHashes,
        };

        const jsonString = JSON.stringify(publicData, null, 2);
        downloadFile(jsonString, filename, "application/json");
    }

    function downloadPrivateSecrets() {
        if (!merkleResult) return;

        const userMap = new Map<string, string>();

        merkleResult.claims.forEach((c) => {
            if (!userMap.has(c.email)) {
                const masterSalt = c.pin || "";
                userMap.set(c.email, masterSalt);
            }
        });

        let csvContent = "email,pin\n";
        userMap.forEach((pin, email) => {
            csvContent += `${email},${pin}\n`;
        });

        downloadFile(csvContent, "secrets.csv", "text/csv");
        deployStore.setBackupDownloaded(true);
    }

    function downloadFile(content: string, filename: string, type: string) {
        const blob = new Blob([content], { type });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    function handleConfirmChange(e: Event) {
        const target = e.target as HTMLInputElement;
        deployStore.setBackupConfirmed(target.checked);
    }
</script>

<div class="p-8 space-y-8">
    <div class="space-y-4">
        <h2 class="text-2xl font-bold">Backup Distribution Data</h2>
        <ZenAlert variant="warning">
            {#snippet title()}CRITICAL STEP: Prevent Data Loss{/snippet}
            You MUST save the <b>secrets.csv</b>. It contains the PIN
            codes required for users. If lost, funds are
            <b>permanently locked</b>.
        </ZenAlert>
    </div>

    <div class="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-4xl mx-auto">
        <!-- Public Data Card -->
        <ZenCard variant="bordered" class="overflow-hidden">
            <div class="p-6 flex flex-col items-center text-center">
                <div
                    class="w-12 h-12 bg-zen-info-muted text-zen-info rounded-full flex items-center justify-center mb-4"
                >
                    <Globe class="w-6 h-6" />
                </div>
                <h3 class="font-bold text-lg mb-2">1. Public Data</h3>
                <p class="text-xs text-zen-fg-muted mb-4">
                    Before deploying, download this file. If your wallet is
                    connected, it will be named with the <b
                        >future contract address</b
                    >
                    (e.g. 0x123...json).
                    <br /><br />
                    <b>Action Required:</b> Place this file in your project's
                    <code class="bg-zen-fg/5 px-1 rounded">/static/distributions/</code> folder before proceeding
                    to the Deploy step.
                </p>
                <ZenButton
                    variant="secondary"
                    size="sm"
                    onclick={downloadPublicData}
                    disabled={isPredicting}
                    loading={isPredicting}
                >
                    {isPredicting ? "Calculating Address..." : "Download JSON"}
                </ZenButton>
            </div>
        </ZenCard>

        <!-- Private Secrets Card -->
        <ZenCard variant="bordered" class="overflow-hidden border-zen-error/20">
            <div class="p-6 flex flex-col items-center text-center">
                <div
                    class="w-12 h-12 bg-zen-error-muted text-zen-error rounded-full flex items-center justify-center mb-4"
                >
                    <Key class="w-6 h-6" />
                </div>
                <h3 class="font-bold text-lg mb-2">2. Private Secrets</h3>
                <p class="text-xs text-zen-fg-muted mb-4">
                    Save this <b>secrets.csv</b> SECURELY. Send each user their PIN
                    code privately.
                </p>
                <ZenButton
                    variant="danger"
                    size="sm"
                    onclick={downloadPrivateSecrets}
                >
                    Download Secrets
                </ZenButton>
            </div>
        </ZenCard>
    </div>

    {#if isBackupDownloaded}
        <div class="mt-8 max-w-md mx-auto" in:fly={{ y: 5 }}>
            <ZenCheckbox
                checked={isBackupConfirmed}
                onchange={handleConfirmChange}
                label="I confirm that I have downloaded the secrets and understand that lost PINs cannot be recovered."
            />
        </div>
    {/if}
</div>
