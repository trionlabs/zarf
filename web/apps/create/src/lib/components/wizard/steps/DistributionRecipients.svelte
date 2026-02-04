<script lang="ts">
    import {
        Check,
        Download,
        AlertTriangle,
        FileText,
        X,
        Mail,
        Users,
        ArrowRight,
    } from "lucide-svelte";
    import { readCSVFile, generateSampleCSV } from "../../../csv/csvProcessor";
    import type { WhitelistEntry } from "../../../stores/types";
    import ZenButton from "@zarf/ui/components/ui/ZenButton.svelte";

    let {
        recipients = $bindable(),
        csvFileName = $bindable(),
        csvError = $bindable(),
        isProcessingCSV = $bindable(),
        validationErrors = $bindable([]),
        totalAmount,
        poolAmount = 0, // The total available in the distribution pool
        unlockEvents = 1, // Number of unlock events in the vesting schedule
        tokenSymbol = "TOKENS",
    } = $props<{
        recipients: WhitelistEntry[];
        csvFileName: string | null;
        csvError: string | null;
        isProcessingCSV: boolean;
        validationErrors?: string[];
        totalAmount: number;
        poolAmount?: number;
        unlockEvents?: number;
        tokenSymbol?: string;
    }>();

    let showPreview = $state(true);

    // Derived stats
    let csvTotal = $derived(
        recipients.reduce(
            (sum: number, r: WhitelistEntry) => sum + r.amount,
            0,
        ),
    );

    // Budget validation (Float safe)
    let isOverBudget = $derived(
        poolAmount > 0 && csvTotal - poolAmount > 0.000001,
    );
    let isUnderBudget = $derived(
        poolAmount > 0 && poolAmount - csvTotal > 0.000001,
    );
    let isBudgetMatch = $derived(
        poolAmount > 0 && Math.abs(csvTotal - poolAmount) <= 0.000001,
    );
    let budgetDifference = $derived(Math.abs(csvTotal - poolAmount));

    // Identify duplicates for highlighting
    let duplicateEmails = $derived.by(() => {
        const counts = new Map<string, number>();
        recipients.forEach((r: WhitelistEntry) => {
            if (r.email) counts.set(r.email, (counts.get(r.email) || 0) + 1);
        });
        const dups = new Set<string>();
        counts.forEach((count, email) => {
            if (count > 1) dups.add(email);
        });
        return dups;
    });

    // Format large numbers (e.g., 125000 -> "125K")
    function formatAmount(num: number): string {
        if (num >= 1000000)
            return (num / 1000000).toFixed(1).replace(/\.0$/, "") + "M";
        if (num >= 1000)
            return (num / 1000).toFixed(1).replace(/\.0$/, "") + "K";
        return num.toLocaleString();
    }

    async function handleFileUpload(event: Event) {
        const target = event.target as HTMLInputElement;
        const file = target.files?.[0];
        if (!file) return;

        isProcessingCSV = true;
        csvError = null;
        validationErrors = [];

        try {
            const result = await readCSVFile(file);
            recipients = result.entries;
            validationErrors = result.errors;
            csvFileName = file.name;
            showPreview = true;

            // Note: validationErrors might contain duplicate warnings, but we still show the list.
            if (recipients.length === 0 && validationErrors.length > 0) {
                // Only throw if NO valid entries were found at all
                throw new Error("No valid entries found in file");
            }
        } catch (e) {
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

    function removeFile() {
        recipients = [];
        csvFileName = null;
        csvError = null;
        validationErrors = [];
        showPreview = false;
    }
</script>

<!-- Stats Summary Bar (Brutalist) -->
{#if recipients.length > 0}
    <div
        class="mb-8 p-6 bg-zen-fg/[0.02] border border-zen-border-subtle rounded-2xl"
    >
        <div class="grid grid-cols-4 gap-8 items-center">
            <!-- Recipients -->
            <div>
                <span
                    class="text-xs font-medium text-zen-fg-muted block mb-1"
                    >Recipients</span
                >
                <div class="flex items-baseline gap-1.5">
                    <span
                        class="text-2xl font-semibold tracking-tight text-zen-fg"
                        >{recipients.length}</span
                    >
                    <span
                        class="text-xs text-zen-fg-subtle font-medium"
                        >People</span
                    >
                </div>
            </div>

            <!-- CSV Total -->
            <div>
                <span
                    class="text-xs font-medium text-zen-fg-muted block mb-1"
                    >Allocated</span
                >
                <div class="flex items-baseline gap-1.5">
                    <span
                        class="text-2xl font-semibold tracking-tight {isBudgetMatch
                            ? 'text-zen-success'
                            : isOverBudget
                              ? 'text-zen-error'
                              : 'text-zen-warning'}"
                        >{formatAmount(csvTotal)}</span
                    >
                    <span
                        class="text-xs text-zen-fg-subtle font-medium"
                        >{tokenSymbol}</span
                    >
                </div>
            </div>

            <!-- Pool Target -->
            <div>
                <span
                    class="text-xs font-medium text-zen-fg-muted block mb-1"
                    >Pool Target</span
                >
                <div class="flex items-baseline gap-1.5">
                    <span
                        class="text-2xl font-semibold tracking-tight text-zen-fg"
                        >{formatAmount(poolAmount)}</span
                    >
                    <span
                        class="text-xs text-zen-fg-subtle font-medium"
                        >{tokenSymbol}</span
                    >
                </div>
            </div>

            <!-- Events -->
            <div>
                <span
                    class="text-xs font-medium text-zen-fg-muted block mb-1"
                    >Events</span
                >
                <div class="flex items-baseline gap-1.5">
                    <span
                        class="text-2xl font-semibold tracking-tight text-zen-fg"
                        >{unlockEvents}</span
                    >
                    <span
                        class="text-xs text-zen-fg-subtle font-medium"
                        >Unlocks</span
                    >
                </div>
            </div>
        </div>
    </div>
{/if}

<!-- Validation Status Messages (Brutalist) -->
{#if recipients.length > 0}
    <div class="space-y-4 mb-8">
        <!-- 1. Critical Errors (Duplicates) -->
        {#if duplicateEmails.size > 0}
            <div
                role="alert"
                class="p-4 bg-zen-error/5 text-zen-error rounded-xl flex items-start gap-4"
            >
                <AlertTriangle class="w-5 h-5 shrink-0 mt-0.5" />
                <div>
                    <h3 class="font-semibold text-sm">
                        Duplicate Recipients Found
                    </h3>
                    <p class="text-xs opacity-80 mt-1">
                        There are {duplicateEmails.size} duplicate email addresses
                        in your CSV file.
                    </p>
                </div>
            </div>
        {/if}

        <!-- 2. Budget Status -->
        {#if poolAmount > 0}
            {#if isBudgetMatch}
                <div
                    role="alert"
                    class="flex items-center gap-3 p-4 bg-zen-success/5 text-zen-success rounded-xl"
                >
                    <div
                        class="w-6 h-6 rounded-full bg-zen-success/10 flex items-center justify-center shrink-0"
                    >
                        <Check class="w-3.5 h-3.5" />
                    </div>
                    <span class="text-sm font-medium"
                        >Budget Matched. {formatAmount(poolAmount)}
                        {tokenSymbol} allocated.</span
                    >
                </div>
            {:else if isOverBudget}
                <div
                    role="alert"
                    class="flex items-center gap-3 p-4 bg-zen-error/5 text-zen-error rounded-xl"
                >
                    <AlertTriangle class="w-5 h-5 shrink-0" />
                    <div class="flex-1 text-sm">
                        <span class="font-bold">Over Budget</span>
                        <span class="opacity-80 ml-2"
                            >Reduce by {formatAmount(budgetDifference)}
                            {tokenSymbol}</span
                        >
                    </div>
                </div>
            {:else if isUnderBudget}
                <div
                    role="alert"
                    class="flex items-center gap-3 p-4 bg-zen-warning/5 text-zen-warning rounded-xl"
                >
                    <AlertTriangle class="w-5 h-5 shrink-0" />
                    <div class="flex-1 text-sm">
                        <span class="font-bold">Under Budget</span>
                        <span class="opacity-80 ml-2"
                            >{formatAmount(budgetDifference)}
                            {tokenSymbol} unallocated</span
                        >
                    </div>
                </div>
            {/if}
        {/if}
    </div>
{/if}

<div class="space-y-6">
    <!-- Top Section: Upload Area -->
    <div class="w-full">
        <!-- Upload Card -->
        <div
            class="relative border border-dashed border-zen-border rounded-2xl text-center transition-all group hover:bg-zen-fg/[0.01] hover:border-zen-fg/20 flex items-center justify-center
            {recipients.length > 0
                ? 'bg-zen-bg border-solid shadow-sm p-4'
                : 'p-8 min-h-[200px] flex-col'}"
        >
            {#if recipients.length > 0}
                <div
                    class="flex items-center gap-4 relative z-10 w-full"
                >
                    <div
                        class="w-10 h-10 bg-zen-success/10 text-zen-success rounded-full flex items-center justify-center shrink-0"
                    >
                        <Check class="w-5 h-5" />
                    </div>
                    <div class="flex-1 text-left min-w-0">
                        <h3 class="font-medium text-sm text-zen-fg truncate">
                            {csvFileName}
                        </h3>
                        <p class="text-xs text-zen-fg-muted">
                            {recipients.length} recipients · {formatAmount(csvTotal)} {tokenSymbol}
                        </p>
                    </div>
                    <ZenButton
                        variant="ghost"
                        size="sm"
                        class="shrink-0 text-zen-error hover:bg-zen-error/10"
                        onclick={removeFile}
                    >
                        <X class="w-4 h-4" />
                    </ZenButton>
                </div>
            {:else}
                <!-- Hidden Input -->
                <input
                    type="file"
                    id="csv-upload"
                    accept=".csv"
                    class="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                    onchange={handleFileUpload}
                />
                <div class="space-y-4 pointer-events-none relative z-10">
                    <Download class="w-8 h-8 mx-auto text-zen-fg/20" />
                    <div>
                        <p
                            class="text-sm font-semibold text-zen-fg/60 uppercase tracking-widest"
                        >
                            Upload CSV
                        </p>
                        <p class="text-xs mt-2 text-zen-fg-subtle">
                            format: email, amount
                        </p>
                    </div>
                </div>
            {/if}
        </div>

        <!-- Helper Actions & Errors -->
        <div class="mt-4 space-y-4">
            {#if !recipients.length}
                <ZenButton
                    variant="ghost"
                    size="sm"
                    class="w-full justify-center group"
                    onclick={handleDownloadSample}
                >
                    <FileText
                        class="w-4 h-4 text-zen-fg/30 group-hover:text-zen-fg mr-2"
                    />
                    Download Template CSV
                </ZenButton>
            {/if}

            {#if csvError}
                <div
                    class="p-4 bg-zen-error/5 text-zen-error text-sm rounded-xl flex gap-3 items-start"
                >
                    <AlertTriangle class="w-4 h-4 shrink-0 mt-0.5" />
                    <div>
                        <span class="font-bold block mb-1"
                            >Error Parsing CSV</span
                        >
                        {csvError}
                    </div>
                </div>
            {/if}

            {#if validationErrors.length > 0}
                <div
                    class="bg-zen-warning/5 text-zen-warning p-4 rounded-xl border border-zen-warning/10"
                >
                    <div
                        class="text-xs font-bold uppercase mb-2 flex items-center gap-2 tracking-wide"
                    >
                        <AlertTriangle class="w-4 h-4" />
                        {validationErrors.length} Warnings
                    </div>
                    <div class="max-h-32 overflow-y-auto space-y-2 pr-2">
                        {#each validationErrors as err}
                            <div
                                class="text-xs opacity-90 pl-2 border-l-2 border-zen-warning/30"
                            >
                                {err}
                            </div>
                        {/each}
                    </div>
                </div>
            {/if}
        </div>
    </div>

    <!-- Bottom Section: Recipient List -->
    {#if recipients.length > 0}
        <div
            class="bg-zen-bg border border-zen-border shadow-sm rounded-2xl h-[500px] flex flex-col overflow-hidden"
        >
            <!-- Header -->
            <div
                class="px-5 py-3 border-b border-zen-border-subtle flex justify-between items-center bg-zen-bg/50 backdrop-blur-sm"
            >
                <span
                    class="text-xs font-semibold text-zen-fg-subtle uppercase tracking-wider w-12"
                    >#</span
                >
                <span
                    class="text-xs font-semibold text-zen-fg-subtle uppercase tracking-wider w-1/3"
                    >Recipient</span
                >
                <span
                    class="text-xs font-semibold text-zen-fg-subtle uppercase tracking-wider text-right"
                    >Allocation</span
                >
            </div>

            <!-- Scrollable List -->
            <div
                class="flex-1 overflow-y-auto scrollbar-hide bg-zen-bg"
            >
                <div class="divide-y divide-zen-border">
                    {#each recipients as row, i}
                        <div
                            class="flex items-center justify-between px-5 py-3 hover:bg-zen-fg/[0.02] transition-colors border-b border-zen-fg/[0.02] last:border-0
                            {duplicateEmails.has(row.email || '')
                                ? 'bg-zen-error/5 hover:bg-zen-error/10'
                                : ''}"
                        >
                            <!-- Index -->
                            <span
                                class="text-xs font-medium text-zen-fg/30 w-12 tabular-nums"
                                >{i + 1}</span
                            >

                            <!-- Email -->
                            <div class="flex-1 flex items-center gap-2 min-w-0">
                                <span
                                    class="text-sm font-medium text-zen-fg truncate"
                                >
                                    {row.email}
                                </span>
                                {#if duplicateEmails.has(row.email || "")}
                                    <span
                                        class="px-1.5 py-0.5 rounded text-[10px] font-bold bg-zen-error/10 text-zen-error uppercase tracking-wider"
                                        >DUP</span
                                    >
                                {/if}
                            </div>

                            <!-- Amount -->
                            <span
                                class="text-sm font-medium text-zen-fg tabular-nums"
                            >
                                {row.amount.toLocaleString()}
                            </span>
                        </div>
                    {/each}
                </div>
            </div>

            <!-- Footer Stats -->
            <div
                class="px-5 py-3 border-t border-zen-border-subtle bg-zen-bg flex justify-between items-center"
            >
                <span class="text-xs font-medium text-zen-fg-subtle"
                    >Total Rows: {recipients.length}</span
                >
                <span class="text-xs font-medium text-zen-fg/70"
                    >Sum: {csvTotal.toLocaleString()} {tokenSymbol}</span
                >
            </div>
        </div>
    {/if}
</div>
