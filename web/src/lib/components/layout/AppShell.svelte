<script lang="ts">
    import Navbar from "$lib/components/layout/Navbar.svelte";
    import Sidebar from "$lib/components/layout/Sidebar.svelte";

    let { children } = $props();
</script>

<div
    class="min-h-screen bg-base-200/30 font-sans selection:bg-primary selection:text-primary-content"
>
    <!-- Common Shared Navbar -->
    <Navbar />

    <!-- Main Shell -->
    <div class="flex min-h-[calc(100vh-3rem)]">
        <Sidebar />

        <!-- Main Content Area -->
        <main class="flex-1 overflow-x-hidden">
            <!-- Inner Container with subtle inset feel (Zen Pro) -->
            <div class="h-full bg-base-100/50 lg:rounded-tl-2xl">
                <div class="w-full p-8 lg:p-12">
                    {@render children()}
                </div>
            </div>
        </main>
    </div>
</div>
