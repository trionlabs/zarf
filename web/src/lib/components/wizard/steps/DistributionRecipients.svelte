<script lang="ts">
    import { Check, Download } from "lucide-svelte";
    import { readCSVFile, generateSampleCSV } from "$lib/csv/csvProcessor";
    import type { WhitelistEntry } from "$lib/stores/types";

    let {
        recipients = $bindable(),
        csvFileName = $bindable(),
        csvError = $bindable(),
        isProcessingCSV = $bindable(),
        totalAmount,
    } = $props<{
        recipients: WhitelistEntry[];
        csvFileName: string | null;
        csvError: string | null;
        isProcessingCSV: boolean;
        totalAmount: number;
    }>();

    async function handleFileUpload(event: Event) {
        const target = event.target as HTMLInputElement;
        const file = target.files?.[0];
        if (!file) return;

        isProcessingCSV = true;
        csvError = null;
        try {
            if (!file.name.endsWith(".csv"))
                throw new Error("Must be a CSV file");
            recipients = await readCSVFile(file);
            csvFileName = file.name;
        } catch (e) {
            // Safe Error Handling
            csvError = e instanceof Error ? e.message : "Failed to parse CSV";
            recipients = [];
            csvFileName = null;
        } finally {
            isProcessingCSV = false;
        }
    }

    function handleDownloadSample() {
        const content = generateSampleCSV();
        const blob = new Blob([content], { type: "text/csv" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = "zarf_whitelist_template.csv";
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
    }
</script>

<div class="max-w-md space-y-6">
    <div
        class="relative border-2 border-dashed rounded-xl p-8 text-center transition-all {recipients.length >
        0
            ? 'border-success/30 bg-success/[0.02]'
            : 'border-base-content/10 hover:border-primary/30 hover:bg-primary/[0.01]'}"
    >
        {#if recipients.length > 0}
            <div class="space-y-3">
                <div
                    class="w-10 h-10 mx-auto rounded-full bg-success/10 flex items-center justify-center"
                >
                    <Check class="w-5 h-5 text-success" />
                </div>
                <div>
                    <p class="font-medium text-sm">{csvFileName}</p>
                    <p class="text-xs text-base-content/50 mt-0.5">
                        <span class="font-semibold text-base-content"
                            >{recipients.length}</span
                        >
                        recipients •
                        <span class="font-mono"
                            >{totalAmount.toLocaleString()}</span
                        > tokens
                    </p>
                </div>
                <!-- Clean Reset Handler -->
                <button
                    class="text-xs text-error/60 hover:text-error transition-colors"
                    onclick={() => {
                        recipients = [];
                        csvFileName = null;
                    }}
                >
                    Remove file
                </button>
            </div>
        {:else}
            <!-- Hidden Input -->
            <input
                type="file"
                id="csv-upload"
                accept=".csv"
                class="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                onchange={handleFileUpload}
            />
            <div class="space-y-2">
                <Download class="w-6 h-6 mx-auto text-base-content/30" />
                <p class="text-sm text-base-content/50">
                    Drop CSV or <span class="text-primary font-medium"
                        >browse</span
                    >
                </p>
                <p class="text-xs text-base-content/30">
                    Format: address, amount
                </p>
            </div>
        {/if}
    </div>

    {#if !recipients.length}
        <button
            class="text-xs text-base-content/40 hover:text-primary transition-colors"
            onclick={handleDownloadSample}
        >
            Download template CSV →
        </button>
    {/if}

    {#if csvError}
        <p class="text-xs text-error animate-pulse">{csvError}</p>
    {/if}
</div>
