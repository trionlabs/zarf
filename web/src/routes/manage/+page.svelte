<script lang="ts">
    import {
        LayoutGrid,
        Search,
        Filter,
        ArrowUpRight,
        Copy,
        ExternalLink,
        ShieldCheck,
        UserCheck,
    } from "lucide-svelte";
    import { fade, slide } from "svelte/transition";

    // Placeholder data for "Manage" view
    const stats = [
        { label: "Active Distributions", value: "3" },
        { label: "Total Recipients", value: "248" },
        { label: "Pending Claims", value: "12" },
        { label: "Total Value Locked", value: "450k TKN" },
    ];

    const records = [
        {
            id: "1",
            name: "Team V1",
            status: "Active",
            amount: "150,000",
            participants: 24,
            lastAction: "2h ago",
        },
        {
            id: "2",
            name: "Seed Round",
            status: "Draft",
            amount: "300,000",
            participants: 180,
            lastAction: "1d ago",
        },
        {
            id: "3",
            name: "Community Airdrop",
            status: "Active",
            amount: "100,000",
            participants: 1205,
            lastAction: "Just now",
        },
    ];
</script>

<div class="space-y-10" in:fade={{ duration: 300 }}>
    <!-- Header -->
    <header
        class="flex flex-col md:flex-row md:items-end justify-between gap-4"
    >
        <div>
            <h1 class="text-3xl font-light tracking-tight">
                Management Console
            </h1>
            <p class="text-sm text-base-content/50 mt-1">
                Monitor and control your active distribution contracts.
            </p>
        </div>

        <div class="flex items-center gap-2">
            <div class="join border border-base-content/10 bg-base-100/50">
                <button
                    class="btn btn-sm join-item bg-base-100 border-0 shadow-none text-primary font-medium"
                    >All</button
                >
                <button
                    class="btn btn-sm join-item bg-transparent border-0 opacity-40 hover:opacity-100"
                    >Live</button
                >
                <button
                    class="btn btn-sm join-item bg-transparent border-0 opacity-40 hover:opacity-100"
                    >Draft</button
                >
            </div>
        </div>
    </header>

    <!-- Global Stats -->
    <div class="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {#each stats as stat}
            <div
                class="bg-base-200/30 border border-base-content/5 p-4 rounded-xl"
            >
                <span
                    class="text-[10px] uppercase tracking-wider font-bold opacity-30 block mb-1"
                    >{stat.label}</span
                >
                <span class="text-xl font-mono font-medium">{stat.value}</span>
            </div>
        {/each}
    </div>

    <!-- Main Content Table/List -->
    <div class="card bg-base-100/30 border border-base-content/5">
        <div class="card-body p-0">
            <!-- Search & Actions -->
            <div
                class="p-4 border-b border-base-content/5 flex items-center justify-between bg-base-200/10"
            >
                <div class="relative w-72">
                    <Search
                        class="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 opacity-30"
                    />
                    <input
                        type="text"
                        placeholder="Search distributions..."
                        class="input input-sm input-bordered w-full pl-9 bg-base-100/50 border-base-content/5"
                    />
                </div>

                <button
                    class="btn btn-sm btn-ghost gap-2 opacity-50 hover:opacity-100"
                >
                    <Filter class="w-3.5 h-3.5" />
                    Advanced Filters
                </button>
            </div>

            <!-- Empty State / Table -->
            <div class="overflow-x-auto">
                <table class="table table-md">
                    <thead class="bg-base-200/30">
                        <tr class="border-base-content/5">
                            <th
                                class="text-[10px] font-bold uppercase opacity-30"
                                >Distribution</th
                            >
                            <th
                                class="text-[10px] font-bold uppercase opacity-30"
                                >Status</th
                            >
                            <th
                                class="text-[10px] font-bold uppercase opacity-30"
                                >Amount</th
                            >
                            <th
                                class="text-[10px] font-bold uppercase opacity-30"
                                >Recipients</th
                            >
                            <th
                                class="text-[10px] font-bold uppercase opacity-30 text-right"
                                >Actions</th
                            >
                        </tr>
                    </thead>
                    <tbody>
                        {#each records as record}
                            <tr
                                class="hover:bg-base-200/20 transition-colors border-base-content/5 group"
                            >
                                <td class="font-medium text-sm">
                                    <div class="flex flex-col">
                                        <span>{record.name}</span>
                                        <span
                                            class="text-[10px] font-mono opacity-30"
                                            >0x...{record.id}</span
                                        >
                                    </div>
                                </td>
                                <td>
                                    <span
                                        class="badge badge-sm font-medium {record.status ===
                                        'Active'
                                            ? 'badge-success/10 text-success'
                                            : 'badge-ghost opacity-40'}"
                                    >
                                        {record.status}
                                    </span>
                                </td>
                                <td class="font-mono text-xs"
                                    >{record.amount}</td
                                >
                                <td class="text-xs opacity-60 px-6"
                                    >{record.participants}</td
                                >
                                <td class="text-right">
                                    <div
                                        class="flex items-center justify-end gap-1"
                                    >
                                        <button
                                            class="btn btn-square btn-ghost btn-xs opacity-0 group-hover:opacity-100 transition-opacity"
                                        >
                                            <ExternalLink class="w-3 h-3" />
                                        </button>
                                        <button
                                            class="btn btn-square btn-ghost btn-xs opacity-0 group-hover:opacity-100 transition-opacity"
                                        >
                                            <ArrowUpRight class="w-3 h-3" />
                                        </button>
                                    </div>
                                </td>
                            </tr>
                        {/each}
                    </tbody>
                </table>
            </div>

            <!-- Pagination Placeholder -->
            <div
                class="p-4 flex items-center justify-between text-[10px] uppercase tracking-widest font-bold opacity-30"
            >
                <span>Showing 3 of 3 results</span>
                <div class="join">
                    <button
                        class="btn btn-xs join-item bg-transparent border-base-content/5 opacity-50"
                        disabled>Previous</button
                    >
                    <button
                        class="btn btn-xs join-item bg-transparent border-base-content/5 opacity-50"
                        disabled>Next</button
                    >
                </div>
            </div>
        </div>
    </div>

    <!-- Secondary Info Sections -->
    <div class="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div class="space-y-4">
            <h4
                class="text-xs font-bold uppercase tracking-[0.2em] opacity-30 flex items-center gap-2"
            >
                <ShieldCheck class="w-4 h-4" /> Compliance Logs
            </h4>
            <div
                class="bg-base-200/20 rounded-xl p-6 border border-base-content/5"
            >
                <p class="text-xs text-base-content/40 leading-relaxed italic">
                    "All active distributions are currently compliant with
                    selected US/EU restriction policies. Next regulatory sweep
                    scheduled in 14 days."
                </p>
            </div>
        </div>

        <div class="space-y-4">
            <h4
                class="text-xs font-bold uppercase tracking-[0.2em] opacity-30 flex items-center gap-2"
            >
                <UserCheck class="w-4 h-4" /> Recent Verifications
            </h4>
            <div
                class="bg-base-200/20 rounded-xl border border-base-content/5 divide-y divide-base-content/5"
            >
                <div class="p-3 flex items-center justify-between text-xs">
                    <span class="font-mono opacity-50">0x71...4a2</span>
                    <span class="text-success font-medium">Verified (ZK)</span>
                </div>
                <div class="p-3 flex items-center justify-between text-xs">
                    <span class="font-mono opacity-50">0x12...99b</span>
                    <span class="text-success font-medium">Verified (ZK)</span>
                </div>
            </div>
        </div>
    </div>
</div>
