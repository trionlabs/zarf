<script lang="ts">
    import { Shield } from 'lucide-svelte';
    import ZenInput from '@zarf/ui/components/ui/ZenInput.svelte';
    import ZenCheckbox from '@zarf/ui/components/ui/ZenCheckbox.svelte';

    let {
        name = $bindable(),
        description = $bindable(),
        usRestricted = $bindable(),
        euRestricted = $bindable(),
    } = $props<{
        name: string;
        description: string;
        usRestricted: boolean;
        euRestricted: boolean;
    }>();
</script>

<div class="max-w-md space-y-6">
    <ZenInput
        id="dist-name"
        label="Distribution Name"
        placeholder="e.g. Series A Investors, Core Team"
        bind:value={name}
        class="bg-zen-bg rounded-xl"
    />

    <ZenInput
        tag="textarea"
        id="dist-desc"
        label="Description"
        placeholder="What this distribution is for…"
        hint="Public — stored on-chain with your distribution."
        bind:value={description}
        class="bg-zen-bg h-24 rounded-xl text-sm"
    />

    <!-- Compliance: Integrated, Not Afterthought -->
    <div class="pt-4 border-t border-zen-border-subtle">
        <div class="flex items-center gap-2 mb-1">
            <Shield class="w-3.5 h-3.5 text-zen-fg-subtle" />
            <span class="text-xs font-bold uppercase tracking-widest text-zen-fg-subtle"
                >Regional Restrictions</span
            >
        </div>
        <p class="text-xs text-zen-fg-subtle mb-3">
            Wallets in these regions can't claim from this distribution.
        </p>
        <div class="flex flex-wrap gap-4">
            <ZenCheckbox label="Block United States" bind:checked={usRestricted} />
            <ZenCheckbox label="Block European Union" bind:checked={euRestricted} />
        </div>
    </div>
</div>
