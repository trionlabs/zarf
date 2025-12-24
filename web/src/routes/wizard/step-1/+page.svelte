<script lang="ts">
    import { wizardStore } from "$lib/stores/wizardStore.svelte";
    import { goto } from "$app/navigation";
    import { onMount } from "svelte";
    import { fade, slide } from "svelte/transition";
    import {
        Plus,
        Trash2,
        Calendar,
        Users,
        FileText,
        ArrowRight,
        X,
        Check,
        Download,
        Edit2,
        ArrowLeft,
        Shield,
        Clock,
        ChevronRight,
        Sparkles,
        TrendingUp,
    } from "lucide-svelte";
    import { readCSVFile, generateSampleCSV } from "$lib/csv/csvProcessor";
    import type { WhitelistEntry, Distribution } from "$lib/stores/types";
    import type { DurationUnit } from "$lib/utils/vesting";
    import VestingTimeline from "$lib/components/wizard/VestingTimeline.svelte";

    onMount(() => {
        if (!wizardStore.tokenDetails.tokenAddress) {
            goto("/wizard/step-0");
            return;
        }
        wizardStore.goToStep(1);
    });

    // --- View State ---
    let viewMode = $state<"list" | "create">("list");
    let creationStep = $state(0); // 0: Identity, 1: Schedule, 2: Recipients

    // --- Create Distribution Form State ---
    let name = $state("");
    let description = $state("");

    // Timeline
    let cliffDate = $state<string>("");
    let cliffTime = $state<string>("12:00");
    let duration = $state<number>(12);
    let durationUnit = $state<DurationUnit>("months");

    // Pool Size
    let poolAmount = $state<number>(0);
    let poolInputValue = $state<string>("");

    // Time editing state
    let isEditingTime = $state(false);

    // Whitelist
    let recipients = $state<WhitelistEntry[]>([]);
    let csvFileName = $state<string | null>(null);
    let isProcessingCSV = $state(false);
    let csvError = $state<string | null>(null);

    // Regulatory
    let usRestricted = $state(false);
    let euRestricted = $state(false);

    // --- Masterclass Date Logic ---
    const monthNames = [
        "January",
        "February",
        "March",
        "April",
        "May",
        "June",
        "July",
        "August",
        "September",
        "October",
        "November",
        "December",
    ];

    // Derived values for the custom inputs
    let selectedMonth = $state(new Date().getMonth());
    let selectedDay = $state(new Date().getDate());
    let selectedYear = $state(new Date().getFullYear());

    // Sync cliffDate string -> Custom Inputs (e.g. when Preset is clicked)
    $effect(() => {
        if (cliffDate) {
            const d = new Date(cliffDate);
            if (!isNaN(d.getTime())) {
                selectedMonth = d.getMonth();
                selectedDay = d.getUTCDate(); // Use UTC to avoid timezone shifts on YYYY-MM-DD strings
                selectedYear = d.getFullYear();
            }
        }
    });

    // Sync Custom Inputs -> cliffDate string
    function updateCliffDate() {
        // Pad day with 0 if needed
        const d = selectedDay.toString().padStart(2, "0");
        const m = (selectedMonth + 1).toString().padStart(2, "0");
        const y = selectedYear.toString();

        // Basic validation
        if (y.length === 4 && selectedDay > 0 && selectedDay <= 31) {
            cliffDate = `${y}-${m}-${d}`;
        }
    }

    // Get today for min date
    const today = new Date().toISOString().split("T")[0];

    // Past date detection for UI warning
    let isPastDate = $derived(cliffDate !== "" && cliffDate < today);

    // --- Derived Validation for Form ---
    const totalAmount = $derived(
        recipients.reduce((sum, r) => sum + r.amount, 0),
    );

    // Total supply from token details
    const totalSupply = $derived(
        wizardStore.tokenDetails.tokenTotalSupply
            ? Number(
                  String(wizardStore.tokenDetails.tokenTotalSupply).replace(
                      /,/g,
                      "",
                  ),
              )
            : 0,
    );

    const isStep0Valid = $derived(name.length >= 3);
    const isStep1Valid = $derived(
        cliffDate !== "" && !isPastDate && duration >= 0 && poolAmount > 0,
    );
    const isStep2Valid = $derived(recipients.length > 0);

    const isFormValid = $derived(isStep0Valid && isStep1Valid && isStep2Valid);

    // Sync poolAmount to store for StatsPanel live display
    $effect(() => {
        wizardStore.setEditingPoolAmount(poolAmount);
    });

    // --- Helpers ---
    function resetForm() {
        name = "";
        description = "";
        cliffDate = "";
        duration = 12;
        poolAmount = 0;
        poolInputValue = "";
        recipients = [];
        csvFileName = null;
        csvError = null;
        usRestricted = false;
        euRestricted = false;
        creationStep = 0;
        wizardStore.setEditingPoolAmount(0);
    }

    function startCreation() {
        resetForm();
        viewMode = "create";
    }

    function cancelCreation() {
        viewMode = "list";
        resetForm();
        wizardStore.setEditingPoolAmount(0);
    }

    function nextCreationStep() {
        if (creationStep < 2) creationStep++;
    }

    function prevCreationStep() {
        if (creationStep > 0) creationStep--;
    }

    // --- Actions ---
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
        } catch (e: any) {
            csvError = e.message || "Failed to parse CSV";
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

    function saveDistribution() {
        if (!isFormValid) return;

        const regulatoryRules: string[] = [];
        if (usRestricted) regulatoryRules.push("US_RESTRICTED");
        if (euRestricted) regulatoryRules.push("EU_RESTRICTED");

        const newDist: Distribution = {
            id: crypto.randomUUID(),
            name,
            description,
            amount: poolAmount.toString(),
            schedule: {
                cliffEndDate: cliffDate,
                distributionDurationMonths: duration,
            },
            recipients,
            csvFilename: csvFileName,
            regulatoryRules,
        };

        wizardStore.addDistribution(newDist);
        viewMode = "list";
    }

    function removeDistribution(id: string) {
        wizardStore.removeDistribution(id);
    }

    function handleNext() {
        wizardStore.nextStep();
        goto("/wizard/step-2");
    }

    const creationSteps = [
        { id: 0, label: "Identity", shortLabel: "1" },
        { id: 1, label: "Schedule", shortLabel: "2" },
        { id: 2, label: "Recipients", shortLabel: "3" },
    ];
</script>

<div class="min-h-[70vh] flex flex-col">
    <!-- Cover Header: Full Width with Negative Margins -->
    <div
        class="-mx-8 lg:-mx-12 -mt-8 lg:-mt-12 px-8 lg:px-12 py-5 mb-8 border-b border-base-content/5 flex items-center justify-between"
    >
        <div class="flex items-center gap-4">
            <!-- Back Button -->
            <button
                class="btn btn-circle btn-ghost btn-sm -ml-2 text-base-content/40 hover:text-base-content"
                onclick={() => goto("/wizard/step-0")}
                aria-label="Go back"
            >
                <ArrowLeft class="w-4 h-4" />
            </button>

            <!-- Token Info -->
            <div class="flex items-center gap-3">
                {#if wizardStore.tokenDetails.iconUrl}
                    <img
                        src={wizardStore.tokenDetails.iconUrl}
                        alt=""
                        class="w-6 h-6 rounded-full"
                    />
                {:else}
                    <div
                        class="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center text-primary text-[10px] font-bold"
                    >
                        {wizardStore.tokenDetails.tokenSymbol?.charAt(0) || "?"}
                    </div>
                {/if}
                <div class="flex items-center gap-2">
                    <span class="text-sm font-medium"
                        >{wizardStore.tokenDetails.tokenName}</span
                    >
                    <span
                        class="text-[10px] font-mono text-base-content/30 bg-base-content/5 px-1.5 py-0.5 rounded"
                    >
                        {wizardStore.tokenDetails.tokenSymbol}
                    </span>
                </div>
            </div>
        </div>

        <!-- Actions -->
        {#if viewMode === "list"}
            <button
                class="text-[11px] text-base-content/40 hover:text-primary transition-colors flex items-center gap-1 uppercase tracking-widest font-medium"
                onclick={() => goto("/wizard/step-0")}
            >
                <Edit2 class="w-3 h-3" />
                Change
            </button>
        {/if}
    </div>

    <!-- MAIN CONTENT -->
    <div class="max-w-5xl w-full">
        {#if viewMode === "list"}
            <!-- LIST VIEW -->
            <div class="flex-1 flex flex-col" in:fade={{ duration: 200 }}>
                <header class="mb-8">
                    <h1 class="text-xl font-semibold tracking-tight">
                        Distributions
                    </h1>
                    <p class="text-sm text-base-content/40 mt-1">
                        Create and manage token distribution schedules
                    </p>
                </header>

                <div class="flex-1">
                    {#if wizardStore.distributions.length === 0}
                        <!-- Empty State: Inviting -->
                        <button
                            class="w-full group border-2 border-dashed border-base-content/10 hover:border-primary/30 rounded-xl p-10 text-center transition-all duration-300 hover:bg-primary/[0.02]"
                            onclick={startCreation}
                        >
                            <div
                                class="w-12 h-12 mx-auto mb-4 rounded-full bg-primary/5 flex items-center justify-center group-hover:scale-110 transition-transform"
                            >
                                <Plus
                                    class="w-5 h-5 text-primary/60 group-hover:text-primary"
                                />
                            </div>
                            <h3
                                class="font-medium text-base-content/70 group-hover:text-base-content transition-colors"
                            >
                                Create your first distribution
                            </h3>
                            <p
                                class="text-xs text-base-content/40 mt-1 max-w-xs mx-auto"
                            >
                                Define a vesting schedule and upload recipients
                            </p>
                        </button>
                    {:else}
                        <div class="space-y-3">
                            {#each wizardStore.distributions as dist (dist.id)}
                                <div
                                    class="group flex items-center gap-4 p-4 rounded-xl border border-base-content/5 hover:border-base-content/10 bg-base-100/50 hover:bg-base-100 transition-all"
                                >
                                    <div
                                        class="w-9 h-9 rounded-lg bg-primary/5 flex items-center justify-center text-primary font-semibold text-sm shrink-0"
                                    >
                                        {dist.name.charAt(0)}
                                    </div>
                                    <div class="flex-1 min-w-0">
                                        <h3
                                            class="font-medium text-sm truncate"
                                        >
                                            {dist.name}
                                        </h3>
                                        <div
                                            class="flex items-center gap-3 mt-0.5 text-[11px] text-base-content/40"
                                        >
                                            <span
                                                class="font-mono font-medium text-base-content/60"
                                            >
                                                {Number(
                                                    dist.amount,
                                                ).toLocaleString()}
                                                {wizardStore.tokenDetails
                                                    .tokenSymbol}
                                            </span>
                                            <span>•</span>
                                            <span
                                                >{dist.schedule
                                                    .distributionDurationMonths}mo
                                                vesting</span
                                            >
                                            <span>•</span>
                                            <span
                                                >{dist.recipients.length} recipients</span
                                            >
                                        </div>
                                    </div>
                                    <button
                                        class="opacity-0 group-hover:opacity-100 text-error/60 hover:text-error p-1.5 transition-all"
                                        onclick={() =>
                                            removeDistribution(dist.id)}
                                    >
                                        <Trash2 class="w-4 h-4" />
                                    </button>
                                </div>
                            {/each}

                            <button
                                class="w-full flex items-center justify-center gap-2 p-3 rounded-lg border border-dashed border-base-content/10 text-sm text-base-content/40 hover:text-primary hover:border-primary/30 transition-all"
                                onclick={startCreation}
                            >
                                <Plus class="w-4 h-4" />
                                Add another
                            </button>
                        </div>
                    {/if}
                </div>

                <!-- Footer -->
                {#if wizardStore.distributions.length > 0}
                    <footer
                        class="mt-8 pt-6 border-t border-base-content/5 flex justify-end"
                    >
                        <button
                            class="btn btn-neutral btn-sm"
                            onclick={handleNext}
                        >
                            Continue to Review
                            <ArrowRight class="w-4 h-4 ml-2" />
                        </button>
                    </footer>
                {/if}
            </div>
        {:else}
            <!-- CREATE VIEW: Single Focus Flow -->
            <div class="flex-1 flex flex-col" in:fade={{ duration: 200 }}>
                <!-- Header with Stepper -->
                <header class="flex items-center justify-between mb-10">
                    <div class="flex items-center gap-6">
                        <h2 class="text-lg font-semibold">New Distribution</h2>

                        <!-- Minimal Stepper -->
                        <div class="flex items-center">
                            {#each creationSteps as step, idx}
                                <div class="flex items-center">
                                    <div
                                        class="flex items-center gap-1.5 px-2 py-1 rounded-md text-xs font-medium transition-all {idx ===
                                        creationStep
                                            ? 'text-primary bg-primary/5'
                                            : idx < creationStep
                                              ? 'text-success'
                                              : 'text-base-content/30'}"
                                    >
                                        {#if idx < creationStep}
                                            <Check class="w-3 h-3" />
                                        {:else}
                                            <span class="w-4 text-center"
                                                >{step.shortLabel}</span
                                            >
                                        {/if}
                                        <span class="hidden sm:inline"
                                            >{step.label}</span
                                        >
                                    </div>
                                    {#if idx < creationSteps.length - 1}
                                        <ChevronRight
                                            class="w-3.5 h-3.5 mx-1 text-base-content/15"
                                        />
                                    {/if}
                                </div>
                            {/each}
                        </div>
                    </div>

                    <button
                        class="p-1.5 rounded-lg hover:bg-base-content/5 text-base-content/30 hover:text-base-content transition-all"
                        onclick={cancelCreation}
                    >
                        <X class="w-4 h-4" />
                    </button>
                </header>

                <!-- Form Content -->
                <div class="flex-1">
                    {#if creationStep === 0}
                        <!-- STEP 1: Identity - Left Aligned, Focused -->
                        <div
                            class="max-w-md space-y-6"
                            in:slide={{ duration: 200, axis: "x" }}
                        >
                            <div>
                                <label
                                    for="dist-name"
                                    class="block text-xs font-medium text-base-content/60 mb-2"
                                >
                                    Distribution Name
                                </label>
                                <input
                                    type="text"
                                    id="dist-name"
                                    bind:value={name}
                                    class="input input-bordered w-full bg-base-100 focus:border-primary focus:ring-1 focus:ring-primary/20"
                                    placeholder="e.g. Series A Investors, Core Team"
                                />
                                <p
                                    class="text-[11px] text-base-content/30 mt-1.5"
                                >
                                    A descriptive name to identify this
                                    distribution
                                </p>
                            </div>

                            <div>
                                <label
                                    for="dist-desc"
                                    class="block text-xs font-medium text-base-content/60 mb-2"
                                >
                                    Description <span
                                        class="text-base-content/30 font-normal"
                                        >(optional)</span
                                    >
                                </label>
                                <textarea
                                    id="dist-desc"
                                    bind:value={description}
                                    class="textarea textarea-bordered w-full bg-base-100 h-20 text-sm focus:border-primary focus:ring-1 focus:ring-primary/20"
                                    placeholder="Add internal notes or context..."
                                ></textarea>
                            </div>

                            <!-- Compliance: Integrated, Not Afterthought -->
                            <div class="pt-4 border-t border-base-content/5">
                                <div class="flex items-center gap-2 mb-3">
                                    <Shield
                                        class="w-3.5 h-3.5 text-warning/70"
                                    />
                                    <span
                                        class="text-xs font-medium text-base-content/60"
                                        >Compliance Restrictions</span
                                    >
                                </div>
                                <div class="flex flex-wrap gap-4">
                                    <label
                                        class="flex items-center gap-2 cursor-pointer group"
                                    >
                                        <input
                                            type="checkbox"
                                            class="checkbox checkbox-xs checkbox-warning"
                                            bind:checked={usRestricted}
                                        />
                                        <span
                                            class="text-xs text-base-content/50 group-hover:text-base-content/70 transition-colors"
                                            >Block US</span
                                        >
                                    </label>
                                    <label
                                        class="flex items-center gap-2 cursor-pointer group"
                                    >
                                        <input
                                            type="checkbox"
                                            class="checkbox checkbox-xs checkbox-warning"
                                            bind:checked={euRestricted}
                                        />
                                        <span
                                            class="text-xs text-base-content/50 group-hover:text-base-content/70 transition-colors"
                                            >Block EU</span
                                        >
                                    </label>
                                </div>
                            </div>
                        </div>
                    {:else if creationStep === 1}
                        <!-- STEP 2: Schedule (Zen Workbench) -->
                        <div
                            class="grid grid-cols-1 lg:grid-cols-12 gap-12 lg:gap-24"
                            in:slide={{ duration: 300, axis: "x" }}
                        >
                            <!-- LEFT COLUMN: Control Deck (40%) -->
                            <div class="lg:col-span-5 space-y-10 py-4">
                                <!-- Phase 1: Distribution Pool (FIRST) -->
                                <div class="space-y-6">
                                    <h3
                                        class="text-[11px] font-semibold uppercase tracking-widest text-base-content/40 flex items-center gap-2"
                                    >
                                        <span
                                            class="w-4 h-4 rounded bg-primary/10 text-primary text-[9px] font-bold flex items-center justify-center"
                                            >1</span
                                        >
                                        Distribution Pool
                                    </h3>

                                    <!-- Amount Input -->
                                    <div class="flex items-baseline gap-3">
                                        <input
                                            type="text"
                                            bind:value={poolInputValue}
                                            oninput={(e) => {
                                                const raw =
                                                    e.currentTarget.value.replace(
                                                        /[^0-9]/g,
                                                        "",
                                                    );
                                                poolAmount = raw
                                                    ? parseInt(raw)
                                                    : 0;
                                                poolInputValue =
                                                    poolAmount > 0
                                                        ? poolAmount.toLocaleString()
                                                        : "";
                                            }}
                                            placeholder="0"
                                            aria-label="Distribution Pool Amount"
                                            class="w-80 bg-transparent text-3xl font-light font-mono border-b-2 border-base-content/10 focus:border-primary/50 outline-none transition-colors text-right placeholder:text-base-content/20"
                                        />
                                        <span
                                            class="text-base-content/50 text-lg font-medium"
                                        >
                                            {wizardStore.tokenDetails
                                                .tokenSymbol || "TOKENS"}
                                        </span>
                                    </div>

                                    <!-- Quick Presets (% Supply) -->
                                    {#if totalSupply > 0}
                                        <div class="flex items-center gap-4">
                                            <span
                                                class="text-[10px] text-base-content/30 uppercase tracking-widest w-16 shrink-0"
                                                >Quick</span
                                            >
                                            <div
                                                class="flex items-center gap-1"
                                            >
                                                {#each [1, 3, 5, 10, 20] as pct}
                                                    {@const pctAmount =
                                                        Math.floor(
                                                            (totalSupply *
                                                                pct) /
                                                                100,
                                                        )}
                                                    <button
                                                        type="button"
                                                        class="px-2 py-1 text-xs font-mono rounded transition-all {poolAmount ===
                                                        pctAmount
                                                            ? 'bg-primary/10 text-primary font-medium'
                                                            : 'text-base-content/40 hover:text-base-content/60 hover:bg-base-content/5'}"
                                                        onclick={() => {
                                                            poolAmount =
                                                                pctAmount;
                                                            poolInputValue =
                                                                pctAmount.toLocaleString();
                                                        }}
                                                    >
                                                        {pct}%
                                                    </button>
                                                {/each}

                                                <!-- Custom % Input -->
                                                <div
                                                    class="flex items-center gap-1 ml-1"
                                                >
                                                    <input
                                                        type="number"
                                                        min="0"
                                                        max="100"
                                                        placeholder="%"
                                                        aria-label="Custom Percentage"
                                                        class="w-10 px-1 py-1 text-xs font-mono text-center bg-transparent border border-base-content/10 rounded focus:border-primary outline-none transition-all hover:border-base-content/30"
                                                        onchange={(e) => {
                                                            const pct =
                                                                parseFloat(
                                                                    e
                                                                        .currentTarget
                                                                        .value,
                                                                ) || 0;
                                                            const amt =
                                                                Math.floor(
                                                                    (totalSupply *
                                                                        pct) /
                                                                        100,
                                                                );
                                                            poolAmount = amt;
                                                            poolInputValue =
                                                                amt.toLocaleString();
                                                        }}
                                                    />
                                                </div>
                                            </div>
                                        </div>
                                        <p
                                            class="text-[10px] text-base-content/30 pl-20"
                                        >
                                            Total Supply: {totalSupply.toLocaleString()}
                                            {wizardStore.tokenDetails
                                                .tokenSymbol}
                                        </p>
                                    {/if}
                                </div>

                                <!-- Phase 2: Lock Period -->
                                <div
                                    class="pt-8 border-t border-base-content/5 space-y-6"
                                >
                                    <h3
                                        class="text-[11px] font-semibold uppercase tracking-widest text-base-content/40 flex items-center gap-2"
                                    >
                                        <span
                                            class="w-4 h-4 rounded bg-primary/10 text-primary text-[9px] font-bold flex items-center justify-center"
                                            >2</span
                                        >
                                        Lock Period
                                    </h3>

                                    <!-- Date Input -->
                                    <div
                                        class="flex items-center gap-1 text-3xl font-light text-base-content font-mono"
                                    >
                                        <select
                                            bind:value={selectedMonth}
                                            onchange={updateCliffDate}
                                            aria-label="Month"
                                            class="appearance-none bg-transparent outline-none cursor-pointer hover:text-primary transition-colors font-medium {isPastDate
                                                ? 'text-error'
                                                : ''}"
                                        >
                                            {#each monthNames as m, i}
                                                <option value={i}>{m}</option>
                                            {/each}
                                        </select>
                                        <span class="text-base-content/20"
                                            >·</span
                                        >
                                        <input
                                            type="number"
                                            bind:value={selectedDay}
                                            oninput={updateCliffDate}
                                            min="1"
                                            max="31"
                                            aria-label="Day"
                                            class="w-12 bg-transparent outline-none text-center appearance-none [&::-webkit-inner-spin-button]:appearance-none {isPastDate
                                                ? 'text-error'
                                                : ''}"
                                        />
                                        <span class="text-base-content/20"
                                            >,</span
                                        >
                                        <input
                                            type="number"
                                            bind:value={selectedYear}
                                            oninput={(e) => {
                                                if (
                                                    e.currentTarget.value
                                                        .length > 4
                                                )
                                                    e.currentTarget.value =
                                                        e.currentTarget.value.slice(
                                                            0,
                                                            4,
                                                        );
                                                updateCliffDate();
                                            }}
                                            min="2024"
                                            max="2100"
                                            aria-label="Year"
                                            class="w-20 bg-transparent outline-none appearance-none [&::-webkit-inner-spin-button]:appearance-none {isPastDate
                                                ? 'text-error'
                                                : ''}"
                                        />
                                    </div>

                                    {#if isPastDate}
                                        <p
                                            class="text-xs text-error font-medium"
                                        >
                                            Past dates cannot be selected.
                                        </p>
                                    {/if}

                                    <!-- Quick Date Presets (Minimal) -->
                                    <div
                                        class="flex items-center gap-3 text-xs text-base-content/40"
                                    >
                                        {#each [{ label: "+3M", months: 3 }, { label: "+6M", months: 6 }, { label: "+1Y", months: 12 }] as preset}
                                            {@const presetDate = new Date(
                                                Date.now() +
                                                    preset.months *
                                                        30 *
                                                        24 *
                                                        60 *
                                                        60 *
                                                        1000,
                                            )
                                                .toISOString()
                                                .split("T")[0]}
                                            <button
                                                type="button"
                                                class="hover:text-primary transition-colors {cliffDate ===
                                                presetDate
                                                    ? 'text-primary font-medium'
                                                    : ''}"
                                                onclick={() =>
                                                    (cliffDate = presetDate)}
                                            >
                                                {preset.label}
                                            </button>
                                        {/each}
                                        <span class="text-base-content/20"
                                            >|</span
                                        >

                                        <!-- Time with hover-to-edit -->
                                        {#if isEditingTime}
                                            <div
                                                class="flex items-center gap-1"
                                            >
                                                {#each ["00:00", "06:00", "12:00", "18:00"] as time}
                                                    <button
                                                        type="button"
                                                        class="px-1.5 py-0.5 rounded transition-all {cliffTime ===
                                                        time
                                                            ? 'bg-primary/10 text-primary'
                                                            : 'hover:bg-base-content/5'}"
                                                        onclick={() => {
                                                            cliffTime = time;
                                                            isEditingTime = false;
                                                        }}
                                                    >
                                                        {time}
                                                    </button>
                                                {/each}
                                                <button
                                                    type="button"
                                                    class="text-base-content/20 hover:text-base-content/40"
                                                    onclick={() =>
                                                        (isEditingTime = false)}
                                                >
                                                    ✕
                                                </button>
                                            </div>
                                        {:else}
                                            <button
                                                type="button"
                                                class="group flex items-center gap-1 text-base-content/30 hover:text-primary transition-colors"
                                                onclick={() =>
                                                    (isEditingTime = true)}
                                            >
                                                <span>{cliffTime} UTC</span>
                                                <span
                                                    class="opacity-0 group-hover:opacity-100 text-[10px] text-primary"
                                                    >edit</span
                                                >
                                            </button>
                                        {/if}
                                    </div>
                                </div>

                                <!-- Phase 3: Vesting Rules -->
                                <div
                                    class="pt-8 border-t border-base-content/5 space-y-6"
                                >
                                    <h3
                                        class="text-[11px] font-semibold uppercase tracking-widest text-base-content/40 flex items-center gap-2"
                                    >
                                        <span
                                            class="w-4 h-4 rounded bg-primary/10 text-primary text-[9px] font-bold flex items-center justify-center"
                                            >3</span
                                        >
                                        Vesting Rules
                                    </h3>

                                    <div class="space-y-6">
                                        <!-- Duration Input Row -->
                                        <div class="flex items-baseline gap-3">
                                            <input
                                                type="number"
                                                bind:value={duration}
                                                min="0"
                                                placeholder="0"
                                                class="w-24 bg-transparent text-3xl font-light font-mono border-b-2 border-base-content/10 focus:border-primary/50 outline-none transition-colors text-right placeholder:text-base-content/20"
                                            />

                                            <!-- Unit Select -->
                                            <div class="relative inline-block">
                                                <select
                                                    bind:value={durationUnit}
                                                    class="appearance-none bg-transparent text-3xl font-light text-base-content/20 hover:text-primary transition-colors cursor-pointer outline-none cursor-pointer pr-6 text-left w-auto"
                                                    style="text-align-last: left;"
                                                >
                                                    <option value="weeks"
                                                        >Weeks</option
                                                    >
                                                    <option value="months"
                                                        >Months</option
                                                    >
                                                    <option value="quarters"
                                                        >Quarters</option
                                                    >
                                                    <option value="years"
                                                        >Years</option
                                                    >
                                                </select>
                                            </div>
                                        </div>

                                        <!-- Quick Unit Selectors -->
                                        <div
                                            class="flex items-center gap-3 mt-4"
                                        >
                                            {#each [{ value: "weeks", label: "Weekly" }, { value: "months", label: "Monthly" }, { value: "quarters", label: "Quarterly" }, { value: "years", label: "Yearly" }] as unit}
                                                <button
                                                    type="button"
                                                    class="px-3 py-1.5 rounded-full text-xs font-medium transition-all {durationUnit ===
                                                    unit.value
                                                        ? 'bg-primary text-primary-content shadow-lg shadow-primary/20'
                                                        : 'bg-base-content/5 text-base-content/60 hover:bg-base-content/10'}"
                                                    onclick={() =>
                                                        (durationUnit =
                                                            unit.value as DurationUnit)}
                                                >
                                                    {unit.label}
                                                </button>
                                            {/each}
                                        </div>

                                        {#if duration === 0}
                                            <p
                                                class="text-xs text-primary font-medium mt-4"
                                            >
                                                Tokens will unlock instantly
                                                after lock period
                                            </p>
                                        {/if}
                                    </div>
                                </div>
                            </div>

                            <!-- RIGHT COLUMN: Output Deck (60%) -->
                            <div
                                class="lg:col-span-7 pt-4 border-l border-base-content/5 pl-12 relative hidden lg:block"
                            >
                                <div class="sticky top-12">
                                    {#if cliffDate}
                                        <div in:fade={{ duration: 400 }}>
                                            <VestingTimeline
                                                cliffEndDate={cliffDate}
                                                {cliffTime}
                                                {duration}
                                                {durationUnit}
                                                totalTokens={poolAmount}
                                                tokenSymbol={wizardStore
                                                    .tokenDetails.tokenSymbol ||
                                                    "TOKENS"}
                                            />

                                            <!-- Footer Note -->
                                            <div
                                                class="mt-8 pt-8 border-t border-base-content/5 flex items-center justify-between text-[10px] text-base-content/30 uppercase tracking-widest"
                                            >
                                                <span>Simulated Schedule</span>
                                                <span>Zarf Protocol v1.0</span>
                                            </div>
                                        </div>
                                    {:else}
                                        <div
                                            class="h-96 flex flex-col items-center justify-center text-center opacity-30 space-y-4"
                                        >
                                            <div
                                                class="text-base-content/20 text-4xl font-light"
                                            >
                                                ?
                                            </div>
                                            <p
                                                class="text-sm font-medium tracking-widest uppercase text-base-content/40"
                                            >
                                                Select Start Date
                                            </p>
                                        </div>
                                    {/if}
                                </div>
                            </div>
                        </div>
                    {:else if creationStep === 2}
                        <!-- STEP 3: Recipients -->
                        <div
                            class="max-w-md space-y-6"
                            in:slide={{ duration: 200, axis: "x" }}
                        >
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
                                            <Check
                                                class="w-5 h-5 text-success"
                                            />
                                        </div>
                                        <div>
                                            <p class="font-medium text-sm">
                                                {csvFileName}
                                            </p>
                                            <p
                                                class="text-xs text-base-content/50 mt-0.5"
                                            >
                                                <span
                                                    class="font-semibold text-base-content"
                                                    >{recipients.length}</span
                                                >
                                                recipients •
                                                <span class="font-mono"
                                                    >{totalAmount.toLocaleString()}</span
                                                > tokens
                                            </p>
                                        </div>
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
                                    <input
                                        type="file"
                                        id="csv-upload"
                                        accept=".csv"
                                        class="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                                        onchange={handleFileUpload}
                                    />
                                    <div class="space-y-2">
                                        <Download
                                            class="w-6 h-6 mx-auto text-base-content/30"
                                        />
                                        <p class="text-sm text-base-content/50">
                                            Drop CSV or <span
                                                class="text-primary font-medium"
                                                >browse</span
                                            >
                                        </p>
                                        <p
                                            class="text-[11px] text-base-content/30"
                                        >
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
                                <p class="text-xs text-error">{csvError}</p>
                            {/if}
                        </div>
                    {/if}
                </div>

                <!-- Footer Navigation -->
                <footer
                    class="mt-10 pt-6 border-t border-base-content/5 flex items-center justify-between"
                >
                    <button
                        class="flex items-center gap-2 text-sm text-base-content/40 hover:text-base-content transition-colors disabled:opacity-30"
                        disabled={creationStep === 0}
                        onclick={prevCreationStep}
                    >
                        <ArrowLeft class="w-4 h-4" />
                        Back
                    </button>

                    {#if creationStep < 2}
                        <button
                            class="btn btn-sm btn-primary min-w-[100px]"
                            disabled={creationStep === 0
                                ? !isStep0Valid
                                : !isStep1Valid}
                            onclick={nextCreationStep}
                        >
                            Next
                            <ArrowRight class="w-4 h-4 ml-1" />
                        </button>
                    {:else}
                        <button
                            class="btn btn-sm btn-primary min-w-[140px]"
                            disabled={!isFormValid}
                            onclick={saveDistribution}
                        >
                            <Sparkles class="w-4 h-4 mr-1" />
                            Add Distribution
                        </button>
                    {/if}
                </footer>
            </div>
        {/if}
    </div>
</div>
