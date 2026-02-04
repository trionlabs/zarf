<script lang="ts">
    import { Shield } from "lucide-svelte";
    import ZenInput from "@zarf/ui/components/ui/ZenInput.svelte";
    import ZenCheckbox from "@zarf/ui/components/ui/ZenCheckbox.svelte";

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
    <div class="pl-1">
        <p class="text-xs text-zen-fg-muted mt-[-10px]">
            A descriptive name to identify this distribution
        </p>
    </div>

    <ZenInput
        tag="textarea"
        id="dist-desc"
        label="Description (Optional)"
        placeholder="Add internal notes or context..."
        bind:value={description}
        class="bg-zen-bg h-24 rounded-xl text-sm"
    />

    <!-- Compliance: Integrated, Not Afterthought -->
    <div class="pt-4 border-t border-zen-border-subtle">
        <div class="flex items-center gap-2 mb-3">
            <Shield class="w-3.5 h-3.5 text-zen-warning/70" />
            <span class="text-xs font-medium text-zen-fg-subtle"
                >Compliance Restrictions</span
            >
        </div>
        <div class="flex flex-wrap gap-4">
            <ZenCheckbox label="Block US" bind:checked={usRestricted} />
            <ZenCheckbox label="Block EU" bind:checked={euRestricted} />
        </div>
    </div>
</div>
