<script lang="ts">
    import { deployStore } from "$lib/stores/deployStore.svelte";
    import { fly } from "svelte/transition";

    // Direct derived state
    let distribution = $derived(deployStore.distribution);
    let merkleResult = $derived(deployStore.merkleResult);
    let isBackupDownloaded = $derived(deployStore.isBackupDownloaded);
    let isBackupConfirmed = $derived(deployStore.isBackupConfirmed);

    // Helpers to convert duration unit to seconds
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

    // 1. Generate Public Distribution JSON (Safe to upload)
    function downloadPublicData() {
        if (!distribution || !merkleResult) return;

        // Calculate schedule params
        const cliffEndUnix = Math.floor(
            new Date(distribution.schedule.cliffEndDate).getTime() / 1000,
        );
        const periodSeconds = getPeriodSeconds(
            distribution.schedule.durationUnit,
        );
        const totalPeriods = distribution.schedule.distributionDuration;

        const publicData = {
            merkleRoot: "0x" + merkleResult.root.toString(16),
            schedule: {
                vestingStart: cliffEndUnix, // Start unlocking at cliff end
                cliffDuration: 0, // Already encoded in start time
                vestingDuration: totalPeriods * periodSeconds,
                vestingPeriod: periodSeconds,
                totalPeriods: totalPeriods,
            },
            leaves: merkleResult.claims.map((c) => "0x" + c.leaf.toString(16)), // ONLY hashes
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
        };

        const jsonString = JSON.stringify(publicData, null, 2);
        downloadFile(jsonString, "distribution-data.json", "application/json");
    }

    // 2. Generate Private Secrets CSV (Admin ONLY)
    function downloadPrivateSecrets() {
        if (!merkleResult) return;

        // Extract one PIN per email
        // Logic: Claims have 'MasterSalt_Index'. We need 'MasterSalt'.
        const userMap = new Map<string, string>();

        merkleResult.claims.forEach((c) => {
            if (!userMap.has(c.email)) {
                // c.salt is "MasterSalt_Index" (e.g. X9s2K1m_0)
                const masterSalt = c.salt.split("_")[0];
                userMap.set(c.email, masterSalt);
            }
        });

        let csvContent = "email,pin\n";
        userMap.forEach((pin, email) => {
            csvContent += `${email},${pin}\n`;
        });

        downloadFile(csvContent, "secrets.csv", "text/csv");

        // Mark as done only after downloading secrets
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

<div class="p-8">
    <div class="mb-6">
        <h2 class="text-2xl font-bold mb-2">Backup Distribution Data</h2>
        <div class="alert alert-warning shadow-sm">
            <span class="text-2xl">⚠️</span>
            <div>
                <h3 class="font-bold">CRITICAL STEP: Prevent Data Loss</h3>
                <div class="text-xs">
                    You MUST save the <b>secrets.csv</b>. It contains the PIN
                    codes required for users. If lost, funds are
                    <b>permanently locked</b>.
                </div>
            </div>
        </div>
    </div>

    <div class="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-4xl mx-auto">
        <!-- Public Data Card -->
        <div class="card bg-base-100 border border-base-300 shadow-md">
            <div class="card-body items-center text-center">
                <div
                    class="w-12 h-12 bg-info/10 text-info rounded-full flex items-center justify-center mb-2"
                >
                    <span class="text-2xl">🌍</span>
                </div>
                <h3 class="font-bold">1. Public Data</h3>
                <p class="text-xs opacity-60 mb-4">
                    Upload this <b>distribution-data.json</b> to your website or
                    IPFS. It contains NO secrets, only mathematical proofs.
                </p>
                <button
                    class="btn btn-outline btn-sm"
                    onclick={downloadPublicData}
                >
                    Download JSON
                </button>
            </div>
        </div>

        <!-- Private Secrets Card -->
        <div class="card bg-base-100 border border-error/20 shadow-md">
            <div class="card-body items-center text-center">
                <div
                    class="w-12 h-12 bg-error/10 text-error rounded-full flex items-center justify-center mb-2"
                >
                    <span class="text-2xl">🗝️</span>
                </div>
                <h3 class="font-bold">2. Private Secrets</h3>
                <p class="text-xs opacity-60 mb-4">
                    Save this <b>secrets.csv</b> SECURELY. Send each user their PIN
                    code privately.
                </p>
                <button
                    class="btn btn-error btn-sm text-white"
                    onclick={downloadPrivateSecrets}
                >
                    Download Secrets
                </button>
            </div>
        </div>
    </div>

    {#if isBackupDownloaded}
        <div class="form-control mt-8 max-w-md mx-auto" in:fly={{ y: 5 }}>
            <label class="label cursor-pointer justify-start gap-4">
                <input
                    type="checkbox"
                    class="checkbox checkbox-primary"
                    checked={isBackupConfirmed}
                    onchange={handleConfirmChange}
                />
                <span class="label-text text-left">
                    I confirm that I have downloaded the secrets<br />
                    and understand that lost PINs cannot be recovered.
                </span>
            </label>
        </div>
    {/if}
</div>
