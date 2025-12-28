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
    import { readCSVFile, generateSampleCSV } from "$lib/csv/csvProcessor";
    import type { WhitelistEntry } from "$lib/stores/types";

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

    // Budget validation (1:1 match)
    let isOverBudget = $derived(poolAmount > 0 && csvTotal > poolAmount);
    let isUnderBudget = $derived(poolAmount > 0 && csvTotal < poolAmount);
    let isBudgetMatch = $derived(poolAmount > 0 && csvTotal === poolAmount);
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

<!-- Stats Summary Bar (Only when data is loaded) -->
{#if recipients.length > 0}
    <div
        class="mb-6 p-5 bg-base-200/30 rounded-2xl border animation-fade-in
        {isBudgetMatch
            ? 'border-success/20'
            : isOverBudget || isUnderBudget
              ? 'border-warning/30'
              : 'border-base-content/5'}"
    >
        <div class="flex items-center justify-between gap-6">
            <!-- Recipients -->
            <div class="flex-1">
                <span
                    class="text-[10px] uppercase tracking-widest text-base-content/40 font-bold block mb-1"
                    >Recipients</span
                >
                <div class="flex items-baseline gap-1">
                    <span
                        class="text-2xl font-black tracking-tight text-base-content"
                        >{recipients.length}</span
                    >
                    <span class="text-xs text-base-content/40 font-medium"
                        >People</span
                    >
                </div>
            </div>

            <!-- Arrow -->
            <ArrowRight class="w-4 h-4 text-base-content/15 shrink-0" />

            <!-- CSV Total -->
            <div class="flex-1">
                <span
                    class="text-[10px] uppercase tracking-widest text-base-content/40 font-bold block mb-1"
                    >Allocated</span
                >
                <div class="flex items-baseline gap-1">
                    <span
                        class="text-2xl font-black tracking-tight {isBudgetMatch
                            ? 'text-success'
                            : isOverBudget
                              ? 'text-error'
                              : 'text-warning'}">{formatAmount(csvTotal)}</span
                    >
                    <span class="text-xs text-base-content/50 font-medium"
                        >{tokenSymbol}</span
                    >
                </div>
            </div>

            <!-- Arrow -->
            <ArrowRight class="w-4 h-4 text-base-content/15 shrink-0" />

            <!-- Pool Target -->
            <div class="flex-1">
                <span
                    class="text-[10px] uppercase tracking-widest text-base-content/40 font-bold block mb-1"
                    >Pool Target</span
                >
                <div class="flex items-baseline gap-1">
                    <span
                        class="text-2xl font-black tracking-tight text-base-content"
                        >{formatAmount(poolAmount)}</span
                    >
                    <span class="text-xs text-base-content/50 font-medium"
                        >{tokenSymbol}</span
                    >
                </div>
            </div>

            <!-- Arrow -->
            <ArrowRight class="w-4 h-4 text-base-content/15 shrink-0" />

            <!-- Events -->
            <div class="flex-1 text-right">
                <span
                    class="text-[10px] uppercase tracking-widest text-base-content/40 font-bold block mb-1"
                    >Events</span
                >
                <div class="flex items-baseline gap-1 justify-end">
                    <span
                        class="text-2xl font-black tracking-tight text-base-content"
                        >{unlockEvents}</span
                    >
                    <span class="text-xs text-base-content/50 font-medium"
                        >×</span
                    >
                </div>
            </div>
        </div>
    </div>
{/if}

<!-- Validation Status Messages -->
{#if recipients.length > 0}
    <div class="space-y-4 mb-6 animation-fade-in">
        <!-- 1. Critical Errors (Duplicates) -->
        {#if duplicateEmails.size > 0}
            <div
                role="alert"
                class="p-4 border border-error/20 bg-error/5 text-error rounded-xl flex items-start gap-3"
            >
                <AlertTriangle class="w-5 h-5 shrink-0 mt-0.5" />
                <div>
                    <h3 class="font-bold text-sm">
                        Duplicate Recipients Detected
                    </h3>
                    <p class="text-xs opacity-90 mt-1">
                        Found <span class="font-bold"
                            >{duplicateEmails.size}</span
                        > email addresses that appear more than once. Please remove
                        duplicates from your CSV to proceed.
                    </p>
                </div>
            </div>
        {/if}

        <!-- 2. Budget Status (Only if Pool Amount is set) -->
        {#if poolAmount > 0}
            {#if isBudgetMatch}
                <div
                    role="alert"
                    class="flex items-center gap-3 p-4 border border-success/20 bg-success/5 text-success rounded-xl"
                >
                    <Check class="w-5 h-5 shrink-0" />
                    <span class="text-sm font-medium"
                        >Budget perfectly matched! All {formatAmount(
                            poolAmount,
                        )}
                        {tokenSymbol} allocated.</span
                    >
                </div>
            {:else if isOverBudget}
                <div
                    role="alert"
                    class="flex items-center gap-3 p-4 border border-error/20 bg-error/5 text-error rounded-xl"
                >
                    <AlertTriangle class="w-5 h-5 shrink-0" />
                    <div class="flex-1">
                        <span class="text-sm font-bold">Over Budget!</span>
                        <span class="text-sm ml-1 opacity-80"
                            >Reduce by <span class="font-bold"
                                >{formatAmount(budgetDifference)}
                                {tokenSymbol}</span
                            ></span
                        >
                    </div>
                </div>
            {:else if isUnderBudget}
                <div
                    role="alert"
                    class="flex items-center gap-3 p-4 border border-warning/20 bg-warning/5 text-warning-content rounded-xl"
                >
                    <AlertTriangle class="w-5 h-5 shrink-0 text-warning" />
                    <div class="flex-1">
                        <span class="text-sm font-bold">Under Budget!</span>
                        <span class="text-sm ml-1 opacity-80"
                            ><span class="font-bold"
                                >{formatAmount(budgetDifference)}
                                {tokenSymbol}</span
                            > remaining unallocated</span
                        >
                    </div>
                </div>
            {/if}
        {/if}
    </div>
{/if}

<div
    class="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start animation-fade-in"
>
    <!-- Left Column: Upload & Actions (5 cols) -->
    <div class="lg:col-span-5 space-y-6">
        <!-- Upload Area -->
        <div
            class="relative border border-dashed rounded-3xl p-8 text-center transition-all duration-300 group overflow-hidden
            {recipients.length > 0
                ? 'border-success/30 bg-success/[0.02]'
                : 'border-base-content/10 hover:border-primary/40 hover:bg-base-200/40'}"
        >
            {#if recipients.length > 0}
                <div class="space-y-4 relative z-10">
                    <div
                        class="w-16 h-16 mx-auto rounded-2xl bg-success/10 text-success flex items-center justify-center mb-4 ring-1 ring-success/20"
                    >
                        <Check class="w-8 h-8" />
                    </div>
                    <div>
                        <h3
                            class="font-bold text-lg tracking-tight text-base-content"
                        >
                            {csvFileName}
                        </h3>
                        <p class="text-sm text-base-content/50 mt-1">
                            Successfully parsed
                        </p>
                    </div>

                    <div class="flex items-center justify-center gap-2 pt-6">
                        <button
                            class="btn btn-sm btn-ghost hover:bg-error/10 text-error hover:text-error-content w-full gap-2 transition-all border border-transparent hover:border-error/20"
                            onclick={removeFile}
                        >
                            <X class="w-4 h-4" />
                            Remove File
                        </button>
                    </div>
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
                <div class="space-y-5 py-8 pointer-events-none relative z-10">
                    <div
                        class="w-20 h-20 mx-auto rounded-3xl bg-base-100 border border-base-content/10 flex items-center justify-center shadow-sm group-hover:scale-105 group-hover:shadow-md transition-all duration-500 ease-out"
                    >
                        <Download
                            class="w-8 h-8 text-base-content/40 group-hover:text-primary transition-colors"
                        />
                    </div>
                    <div>
                        <p
                            class="text-xl font-bold tracking-tight text-base-content/90"
                        >
                            Click to upload or drag & drop
                        </p>
                        <p
                            class="text-sm text-base-content/50 mt-2 font-mono text-xs opacity-70"
                        >
                            Required Format: <span
                                class="bg-base-200 px-2 py-1 rounded-md text-base-content/80 font-bold border border-base-content/5"
                                >email,amount</span
                            >
                        </p>
                    </div>
                </div>
            {/if}
        </div>

        <!-- Helper Actions -->
        {#if !recipients.length}
            <button
                class="btn btn-sm btn-ghost w-full gap-2 text-base-content/50 hover:text-primary font-normal group transition-all"
                onclick={handleDownloadSample}
            >
                <FileText
                    class="w-4 h-4 group-hover:scale-110 transition-transform"
                />
                Download Template CSV
            </button>
        {/if}

        <!-- Error Messages -->
        {#if csvError}
            <div
                role="alert"
                class="alert alert-error text-sm shadow-none border border-error/20 bg-error/5 rounded-2xl"
            >
                <AlertTriangle class="w-5 h-5 text-error" />
                <span class="text-error-content">{csvError}</span>
            </div>
        {/if}

        {#if validationErrors.length > 0}
            <div
                class="collapse collapse-arrow bg-warning/5 border border-warning/20 rounded-2xl transition-all"
            >
                <input type="checkbox" />
                <div
                    class="collapse-title text-sm font-medium flex items-center gap-2 text-warning-content"
                >
                    <AlertTriangle class="w-4 h-4" />
                    Found {validationErrors.length} issues
                </div>
                <div class="collapse-content">
                    <div
                        class="text-xs space-y-2 max-h-40 overflow-y-auto pt-2 font-mono opacity-80"
                    >
                        {#each validationErrors as err}
                            <div
                                class="p-2 bg-white/50 rounded border border-warning/10 text-warning-content/80"
                            >
                                {err}
                            </div>
                        {/each}
                    </div>
                </div>
            </div>
        {/if}
    </div>

    <!-- Right Column: Simulation / List Preview (7 cols) -->
    <div class="lg:col-span-7 h-full">
        {#if recipients.length > 0}
            <div
                class="card bg-base-100 border border-base-content/10 shadow-none overflow-hidden flex flex-col animation-slide-up rounded-3xl h-[500px]"
            >
                <!-- Header -->
                <div
                    class="px-5 py-3 border-b border-base-content/5 flex justify-between items-center shrink-0"
                >
                    <div class="flex items-center gap-3">
                        <div
                            class="w-8 h-8 rounded-lg bg-base-200/50 flex items-center justify-center text-base-content/50"
                        >
                            <Users class="w-4 h-4" />
                        </div>
                        <span class="text-sm font-bold text-base-content/70"
                            >{recipients.length} Recipients</span
                        >
                    </div>
                </div>

                <!-- Scrollable List -->
                <div class="flex-1 overflow-y-auto scrollbar-hide">
                    <div class="divide-y divide-base-content/5">
                        {#each recipients as row, i}
                            <div
                                class="group flex items-center gap-3 px-5 py-3 hover:bg-base-200/30 transition-all duration-200
                                {duplicateEmails.has(row.email || '')
                                    ? 'bg-error/5 border-l-2 border-error hover:bg-error/10'
                                    : ''}"
                            >
                                <!-- Row Number -->
                                <span
                                    class="w-6 text-center text-[10px] font-mono text-base-content/20 group-hover:text-base-content/40 font-medium"
                                    >{i + 1}</span
                                >

                                <!-- Icon -->
                                <div
                                    class="w-8 h-8 rounded-full bg-base-200/50 flex items-center justify-center shrink-0 text-base-content/30 group-hover:text-primary group-hover:bg-primary/10 transition-colors"
                                >
                                    <Mail class="w-3.5 h-3.5" />
                                </div>

                                <!-- Email -->
                                <div class="flex-1 min-w-0">
                                    <div
                                        class="text-sm font-medium truncate text-base-content/70 group-hover:text-base-content transition-colors"
                                    >
                                        {row.email}
                                        {#if duplicateEmails.has(row.email || "")}
                                            <span
                                                class="ml-2 inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-error/10 text-error uppercase tracking-wider"
                                            >
                                                Duplicate
                                            </span>
                                        {/if}
                                    </div>
                                </div>

                                <!-- Amount -->
                                <div
                                    class="font-mono text-xs font-bold text-base-content/50 group-hover:text-primary transition-colors bg-base-200/30 px-2 py-1 rounded"
                                >
                                    {row.amount.toLocaleString()}
                                </div>
                            </div>
                        {/each}
                    </div>
                </div>

                <!-- Footer Stats -->
                <div
                    class="px-5 py-3 border-t border-base-content/5 bg-base-200/20 shrink-0"
                >
                    <div
                        class="flex justify-between items-center text-xs text-base-content/40"
                    >
                        <span>{recipients.length} rows</span>
                        <span class="font-mono font-medium"
                            >{csvTotal.toLocaleString()}
                            {tokenSymbol} total</span
                        >
                    </div>
                </div>
            </div>
        {:else}
            <!-- Empty State for Simulator -->
            <div
                class="h-[500px] border-2 border-dashed border-base-content/5 rounded-3xl flex flex-col items-center justify-center text-center p-12 text-base-content/20"
            >
                <div class="mb-6 opacity-30">
                    <Users class="w-16 h-16" />
                </div>
                <p class="text-lg font-bold text-base-content/30">
                    Distribution Simulator
                </p>
                <p
                    class="text-sm mt-2 max-w-[240px] leading-relaxed opacity-60"
                >
                    Upload your csv file to see a live preview of the
                    distribution list.
                </p>
            </div>
        {/if}
    </div>
</div>

<style>
    .animation-slide-up {
        animation: slideUp 0.4s cubic-bezier(0.16, 1, 0.3, 1) forwards;
    }
    .animation-fade-in {
        animation: fadeIn 0.5s ease-out forwards;
    }

    @keyframes slideUp {
        from {
            opacity: 0;
            transform: translateY(20px);
            scale: 0.98;
        }
        to {
            opacity: 1;
            transform: translateY(0);
            scale: 1;
        }
    }
    @keyframes fadeIn {
        from {
            opacity: 0;
        }
        to {
            opacity: 1;
        }
    }

    /* Hide scrollbar for Chrome, Safari and Opera */
    .scrollbar-hide::-webkit-scrollbar {
        display: none;
    }

    /* Hide scrollbar for IE, Edge and Firefox */
    .scrollbar-hide {
        -ms-overflow-style: none; /* IE and Edge */
        scrollbar-width: none; /* Firefox */
    }
</style>
