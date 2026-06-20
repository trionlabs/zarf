<script lang="ts">
    import { Shield, Lock } from 'lucide-svelte';
    import ZenInput from '@zarf/ui/components/ui/ZenInput.svelte';

    let { name = $bindable(), description = $bindable() } = $props<{
        name: string;
        description: string;
    }>();

    // Roadmap: privacy-preserving eligibility attestations, proven inside the claim circuit.
    const upcomingCompliance = [
        { label: 'Proof-of-personhood', hint: 'One verified human, one claim' },
        { label: 'Jurisdiction gating', hint: 'Restrict by nationality, proven in-circuit' },
        { label: 'Age verification', hint: 'Require 18+ without revealing date of birth' },
        { label: 'Sanctions screening', hint: 'Screen against OFAC / denylists' },
    ];
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
                >Programmable Compliance</span
            >
            <span
                class="text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-full border border-zen-border-subtle text-zen-fg-subtle"
                >Coming soon</span
            >
        </div>
        <p class="text-xs text-zen-fg-subtle mb-3">
            Enforced within the privacy circuit. Rolling out incrementally.
        </p>
        <div class="flex flex-wrap gap-2">
            {#each upcomingCompliance as item (item.label)}
                <span
                    class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border border-zen-border-subtle bg-zen-fg/[0.02] text-xs text-zen-fg-subtle"
                    title={item.hint}
                >
                    <Lock class="w-3 h-3" />
                    {item.label}
                </span>
            {/each}
        </div>
    </div>
</div>
