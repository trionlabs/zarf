<script lang="ts">
    import { wizardStore } from "$lib/stores/wizardStore.svelte";
    import { goto } from "$app/navigation";
    import { onMount } from "svelte";
    import { readCSVFile, generateSampleCSV } from "$lib/csv/csvProcessor";
    import type { WhitelistEntry } from "$lib/types";

    onMount(() => {
        wizardStore.goToStep(2);
    });

    let fileInput: HTMLInputElement;
    let isProcessing = $state(false);
    let error = $state<string | null>(null);
    let recipients = $state<WhitelistEntry[]>(wizardStore.recipients);
    let fileName = $state(wizardStore.csvFilename);

    const canProceed = $derived(recipients.length > 0 && !isProcessing);
    const totalAmount = $derived(
        recipients.reduce((sum, r) => sum + r.amount, 0),
    );

    async function handleFileUpload(event: Event) {
        const target = event.target as HTMLInputElement;
        const file = target.files?.[0];
        if (!file) return;

        processFile(file);
    }

    async function processFile(file: File) {
        isProcessing = true;
        error = null;
        recipients = [];

        try {
            if (!file.name.endsWith(".csv")) {
                throw new Error("Please upload a CSV file");
            }

            recipients = await readCSVFile(file);
            fileName = file.name;
        } catch (e: unknown) {
            if (e instanceof Error) {
                error = e.message;
            } else {
                error = "Failed to parse CSV file";
            }
            fileName = null;
        } finally {
            isProcessing = false;
        }
    }

    function handleDownloadSample() {
        const content = generateSampleCSV();
        const blob = new Blob([content], { type: "text/csv" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = "zarf_sample_whitelist.csv";
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    function handleNext() {
        if (recipients.length > 0 && fileName) {
            wizardStore.setRecipients(recipients, fileName);
            wizardStore.nextStep();
            goto("/wizard/step-3");
        }
    }

    function handleBack() {
        wizardStore.previousStep();
        goto("/wizard/step-1");
    }
</script>

<div class="space-y-6">
    <div class="text-center">
        <h2 class="text-2xl font-bold">Upload Whitelist</h2>
        <p class="text-base-content/70">
            Import your distribution list via CSV.
        </p>
    </div>

    <!-- File Upload -->
    <div class="form-control w-full">
        <label class="label" for="csv-upload">
            <span class="label-text">Select CSV File</span>
        </label>
        <input
            id="csv-upload"
            type="file"
            accept=".csv"
            class="file-input file-input-bordered w-full"
            onchange={handleFileUpload}
            disabled={isProcessing}
            bind:this={fileInput}
        />
        <label class="label">
            <button
                class="label-text-alt link link-primary no-underline"
                onclick={handleDownloadSample}
            >
                Download Sample CSV Layout
            </button>
        </label>
    </div>

    {#if isProcessing}
        <div class="flex items-center gap-2 justify-center py-4">
            <span class="loading loading-spinner"></span>
            <span>Processing CSV...</span>
        </div>
    {/if}

    {#if error}
        <div role="alert" class="alert alert-error">
            <svg
                xmlns="http://www.w3.org/2000/svg"
                class="stroke-current shrink-0 h-6 w-6"
                fill="none"
                viewBox="0 0 24 24"
                ><path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    stroke-width="2"
                    d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z"
                /></svg
            >
            <span>{error}</span>
        </div>
    {/if}

    <!-- Preview Table -->
    {#if recipients.length > 0}
        <div class="space-y-4">
            <div class="flex justify-between items-center px-1">
                <h3 class="font-bold">{fileName}</h3>
                <div class="text-sm">
                    Total: <span class="font-mono font-bold"
                        >{totalAmount.toLocaleString()}</span
                    >
                </div>
            </div>

            <div class="overflow-x-auto">
                <table class="table table-zebra w-full border border-base-200">
                    <thead>
                        <tr>
                            <th>#</th>
                            <th>Email / Address</th>
                            <th class="text-right">Allocation</th>
                        </tr>
                    </thead>
                    <tbody>
                        {#each recipients.slice(0, 5) as recipient, i}
                            <tr>
                                <th>{i + 1}</th>
                                <td class="font-mono text-xs"
                                    >{recipient.email}</td
                                >
                                <td class="text-right font-mono"
                                    >{recipient.amount}</td
                                >
                            </tr>
                        {/each}
                        {#if recipients.length > 5}
                            <tr>
                                <td
                                    colspan="3"
                                    class="text-center text-xs opacity-50"
                                >
                                    ...and {recipients.length - 5} more
                                </td>
                            </tr>
                        {/if}
                    </tbody>
                </table>
            </div>
        </div>
    {/if}

    <!-- Navigation -->
    <div class="card-actions justify-between mt-8">
        <button class="btn btn-ghost" onclick={handleBack}>← Back</button>
        <button
            class="btn btn-primary min-w-[120px]"
            disabled={!canProceed}
            onclick={handleNext}
        >
            Next
        </button>
    </div>
</div>
