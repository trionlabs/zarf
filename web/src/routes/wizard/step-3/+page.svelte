<script lang="ts">
    import { wizardStore } from "$lib/stores/wizardStore.svelte";
    import { goto } from "$app/navigation";
    import { onMount } from "svelte";
    import {
        Check,
        Copy,
        ExternalLink,
        ArrowRight,
        Server,
        FileJson,
        CloudUpload,
    } from "lucide-svelte";
    import { fly } from "svelte/transition";

    onMount(() => {
        wizardStore.goToStep(2);
    });

    // Mock contract address for demo
    let contractAddress =
        wizardStore.deployedContractAddress ||
        "0x742d35Cc6634C0532925a3b844Bc454e4438f44e";
    let copied = $state(false);

    let activeTab = $state("dev"); // 'dev' | 'prod'

    function copyToClipboard() {
        navigator.clipboard.writeText(contractAddress);
        copied = true;
        setTimeout(() => (copied = false), 2000);
    }

    function handleFinish() {
        wizardStore.reset();
        goto("/");
    }
</script>

<div
    class="h-full flex flex-col justify-center items-center max-w-3xl mx-auto py-12 text-center"
>
    <div
        class="w-20 h-20 bg-success/10 text-success rounded-full flex items-center justify-center mb-6"
        in:fly={{ y: 20, duration: 600 }}
    >
        <Check class="w-10 h-10" />
    </div>

    <h2
        class="text-3xl font-light tracking-tight text-base-content mb-2"
        in:fly={{ y: 20, duration: 600, delay: 100 }}
    >
        Deployment Complete
    </h2>
    <p
        class="text-base text-base-content/50 font-light tracking-wide mb-8"
        in:fly={{ y: 20, duration: 600, delay: 200 }}
    >
        Your vesting contract is live. Now, <b>host the data</b> to make it accessible.
    </p>

    <!-- Contract Address Box -->
    <div
        class="w-full bg-base-100/40 border border-base-content/10 rounded-2xl p-6 mb-8 relative group overflow-hidden"
        in:fly={{ y: 20, duration: 600, delay: 300 }}
    >
        <div class="flex flex-col gap-2">
            <span
                class="text-xs font-bold uppercase tracking-[0.2em] opacity-40"
                >Contract Address</span
            >
            <div class="flex items-center justify-center gap-3">
                <span class="font-mono text-lg">{contractAddress}</span>
                <button
                    class="btn btn-circle btn-ghost btn-sm"
                    onclick={copyToClipboard}
                >
                    {#if copied}
                        <Check class="w-4 h-4 text-success" />
                    {:else}
                        <Copy class="w-4 h-4 opacity-50" />
                    {/if}
                </button>
            </div>
        </div>
    </div>

    <!-- HOSTING INSTRUCTIONS -->
    <div
        class="w-full card bg-base-100 border border-base-300 shadow-sm text-left mb-8"
        in:fly={{ y: 20, duration: 600, delay: 400 }}
    >
        <div class="p-4 border-b border-base-200 bg-base-200/30 flex gap-4">
            <button
                class="btn btn-sm {activeTab === 'dev'
                    ? 'btn-primary'
                    : 'btn-ghost'}"
                onclick={() => (activeTab = "dev")}
            >
                Development (Local)
            </button>
            <button
                class="btn btn-sm {activeTab === 'prod'
                    ? 'btn-primary'
                    : 'btn-ghost'}"
                onclick={() => (activeTab = "prod")}
            >
                Production (Live)
            </button>
        </div>

        <div class="p-6 text-sm">
            {#if activeTab === "dev"}
                <div class="flex gap-4">
                    <div class="mt-1">
                        <Server class="w-5 h-5 text-warning" />
                    </div>
                    <div>
                        <h4 class="font-bold mb-2">Local Hosting</h4>
                        <ol
                            class="list-decimal list-inside space-y-2 opacity-80"
                        >
                            <li>
                                Rename your <code>distribution-data.json</code>
                                to
                                <code>{contractAddress.slice(0, 6)}...json</code
                                > (Full Address).
                            </li>
                            <li>
                                Move it to: <code
                                    >/web/static/distributions/</code
                                > folder in your project.
                            </li>
                            <li>
                                The app will find it at <code
                                    >localhost:5173/distributions/...</code
                                >
                            </li>
                        </ol>
                    </div>
                </div>
            {:else}
                <div class="flex gap-4">
                    <div class="mt-1">
                        <CloudUpload class="w-5 h-5 text-success" />
                    </div>
                    <div>
                        <h4 class="font-bold mb-2">
                            Production Hosting (Decoupled Storage)
                        </h4>
                        <p class="mb-3 opacity-70">
                            For production, store the public JSON separately
                            from the code for instant updates.
                        </p>
                        <div class="space-y-4">
                            <div class="p-3 bg-base-200 rounded-lg">
                                <span
                                    class="font-bold block mb-1 text-xs uppercase opacity-50"
                                    >Option A: GitOps (Slower)</span
                                >
                                Commit the file to
                                <code>/static/distributions/</code> and push. Requires
                                re-deploy.
                            </div>
                            <div
                                class="p-3 bg-primary/5 border border-primary/20 rounded-lg"
                            >
                                <span
                                    class="font-bold block mb-1 text-xs uppercase text-primary"
                                    >Option B: S3 / CDN (Recommended)</span
                                >
                                Upload to an S3 bucket or IPFS. Update
                                <code>VITE_DISTRIBUTION_CDN_URL</code> env variable
                                to point to your bucket.
                            </div>
                        </div>
                    </div>
                </div>
            {/if}
        </div>
    </div>

    <!-- Actions -->
    <div class="flex gap-4" in:fly={{ y: 20, duration: 600, delay: 500 }}>
        <a href="/dashboard" class="btn btn-outline h-12 px-8 rounded-full">
            View Dashboard
            <ExternalLink class="w-4 h-4 ml-2 opacity-60" />
        </a>
        <button
            class="btn btn-primary h-12 px-10 rounded-full shadow-lg shadow-primary/20 hover:shadow-xl hover:shadow-primary/30 transition-all duration-300 text-base font-medium tracking-wide"
            onclick={handleFinish}
        >
            All Done
            <ArrowRight class="w-4 h-4 ml-2" />
        </button>
    </div>
</div>
