<script lang="ts">
    import { deployStore } from '../../../stores/deployStore.svelte';
    import { fly } from 'svelte/transition';
    import { Key } from 'lucide-svelte';

    import ZenCard from '@zarf/ui/components/ui/ZenCard.svelte';
    import ZenButton from '@zarf/ui/components/ui/ZenButton.svelte';
    import ZenAlert from '@zarf/ui/components/ui/ZenAlert.svelte';
    import ZenCheckbox from '@zarf/ui/components/ui/ZenCheckbox.svelte';

    let merkleResult = $derived(deployStore.merkleResult);
    let isBackupDownloaded = $derived(deployStore.isBackupDownloaded);
    let isBackupConfirmed = $derived(deployStore.isBackupConfirmed);
    let backupError = $state<string | null>(null);

    function downloadPrivateSecrets() {
        if (!merkleResult) return;

        try {
            const userMap = new Map<string, string>();
            merkleResult.claims.forEach((c) => {
                if (!userMap.has(c.email)) {
                    if (!c.pin) {
                        throw new Error(`Missing PIN for ${c.email}`);
                    }
                    userMap.set(c.email, c.pin);
                }
            });

            let csvContent = 'email,pin\n';
            userMap.forEach((pin, email) => {
                csvContent += `${email},${pin}\n`;
            });

            backupError = null;
            downloadFile(csvContent, 'secrets.csv', 'text/csv');
            deployStore.setBackupDownloaded(true);
        } catch (e) {
            backupError = e instanceof Error ? e.message : 'Could not generate secrets.csv';
            deployStore.setBackupDownloaded(false);
        }
    }

    function downloadFile(content: string, filename: string, type: string) {
        const blob = new Blob([content], { type });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
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
            You MUST save the <b>secrets.csv</b>. It contains the PIN codes required for users. If
            lost, funds are
            <b>permanently locked</b>.
        </ZenAlert>
    </div>

    <div class="max-w-md mx-auto">
        {#if backupError}
            <ZenAlert variant="error" class="mb-4">
                {backupError}
            </ZenAlert>
        {/if}
        <ZenCard variant="bordered" class="overflow-hidden border-zen-error/20">
            <div class="p-6 flex flex-col items-center text-center">
                <div
                    class="w-12 h-12 bg-zen-error-muted text-zen-error rounded-full flex items-center justify-center mb-4"
                >
                    <Key class="w-6 h-6" />
                </div>
                <h3 class="font-bold text-lg mb-2">Private Secrets</h3>
                <p class="text-xs text-zen-fg-muted mb-4">
                    Save this <b>secrets.csv</b> SECURELY. Send each user their PIN code privately.
                </p>
                <ZenButton variant="danger" size="sm" onclick={downloadPrivateSecrets}>
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
