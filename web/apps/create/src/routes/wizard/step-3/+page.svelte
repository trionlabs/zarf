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
    import ZenButton from "@zarf/ui/components/ui/ZenButton.svelte";
    import { fly } from "svelte/transition";

    // Default/demo contract address (consistent for SSR)
    const DEFAULT_CONTRACT = "0x742d35Cc6634C0532925a3b844Bc454e4438f44e";

    let contractAddress = $state(DEFAULT_CONTRACT);
    let copied = $state(false);
    let activeTab = $state("dev"); // 'dev' | 'prod'

    onMount(() => {
        wizardStore.goToStep(2);
        // Update with real address after hydration
        if (wizardStore.deployedContractAddress) {
            contractAddress = wizardStore.deployedContractAddress;
        }
    });

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
        class="w-20 h-20 bg-zen-success/10 text-zen-success rounded-full flex items-center justify-center mb-6"
        in:fly={{ y: 20, duration: 600 }}
    >
        <Check class="w-10 h-10" />
    </div>

    <h2
        class="text-3xl font-light tracking-tight text-zen-fg mb-2"
        in:fly={{ y: 20, duration: 600, delay: 100 }}
    >
        Deployment Complete
    </h2>
    <p
        class="text-base text-zen-fg/50 font-light tracking-wide mb-8"
        in:fly={{ y: 20, duration: 600, delay: 200 }}
    >
        Your vesting contract is live. Now, <b>host the data</b> to make it accessible.
    </p>

    <!-- Contract Address Box -->
    <div
        class="w-full bg-zen-bg/40 border border-zen-border rounded-2xl p-6 mb-8 relative group overflow-hidden"
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
                    class="p-2 rounded-full hover:bg-zen-fg/5 transition-colors"
                    onclick={copyToClipboard}
                >
                    {#if copied}
                        <Check class="w-4 h-4 text-zen-success" />
                    {:else}
                        <Copy class="w-4 h-4 opacity-50" />
                    {/if}
                </button>
            </div>
        </div>
    </div>

    <!-- HOSTING INSTRUCTIONS -->
    <div
        class="w-full bg-zen-bg border border-zen-border rounded-2xl shadow-sm text-left mb-8"
        in:fly={{ y: 20, duration: 600, delay: 400 }}
    >
        <div
            class="p-4 border-b border-zen-border-subtle bg-zen-fg/[0.03] flex gap-4"
        >
            <ZenButton
                variant={activeTab === "dev" ? "primary" : "ghost"}
                size="sm"
                onclick={() => (activeTab = "dev")}
            >
                Development (Local)
            </ZenButton>
            <ZenButton
                variant={activeTab === "prod" ? "primary" : "ghost"}
                size="sm"
                onclick={() => (activeTab = "prod")}
            >
                Production (Live)
            </ZenButton>
        </div>

        <div class="p-6 text-sm">
            {#if activeTab === "dev"}
                <div class="flex gap-4">
                    <div class="mt-1">
                        <Server class="w-5 h-5 text-zen-warning" />
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
                        <CloudUpload
                            class="w-5 h-5 text-zen-success"
                        />
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
                            <div class="p-3 bg-zen-fg/10 rounded-lg">
                                <span
                                    class="font-bold block mb-1 text-xs uppercase opacity-50"
                                    >Option A: GitOps (Slower)</span
                                >
                                Commit the file to
                                <code>/static/distributions/</code> and push. Requires
                                re-deploy.
                            </div>
                            <div
                                class="p-3 bg-zen-primary/5 border border-zen-primary/20 rounded-lg"
                            >
                                <span
                                    class="font-bold block mb-1 text-xs uppercase text-zen-primary"
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
        <a
            href="/dashboard"
            class="flex items-center justify-center h-12 px-8 rounded-full border border-zen-border text-zen-fg-muted hover:bg-zen-fg/5 transition-colors text-sm font-medium"
        >
            View Dashboard
            <ExternalLink class="w-4 h-4 ml-2 opacity-60" />
        </a>
        <ZenButton
            variant="primary"
            size="lg"
            class="px-10 h-12 text-base"
            onclick={handleFinish}
        >
            All Done
            <ArrowRight class="w-4 h-4 ml-2" />
        </ZenButton>
    </div>
</div>
