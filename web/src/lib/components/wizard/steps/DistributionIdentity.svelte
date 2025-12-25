<script lang="ts">
    import { Shield } from "lucide-svelte";

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
        <p class="text-xs text-base-content/30 mt-1.5">
            A descriptive name to identify this distribution
        </p>
    </div>

    <div>
        <label
            for="dist-desc"
            class="block text-xs font-medium text-base-content/60 mb-2"
        >
            Description <span class="text-base-content/30 font-normal"
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
            <Shield class="w-3.5 h-3.5 text-warning/70" />
            <span class="text-xs font-medium text-base-content/60"
                >Compliance Restrictions</span
            >
        </div>
        <div class="flex flex-wrap gap-4">
            <label class="flex items-center gap-2 cursor-pointer group">
                <input
                    type="checkbox"
                    class="checkbox checkbox-xs checkbox-warning"
                    bind:checked={usRestricted}
                />
                <span
                    class="text-xs text-base-content/50 group-hover:text-base-content/70 transition-colors"
                >
                    Block US
                </span>
            </label>
            <label class="flex items-center gap-2 cursor-pointer group">
                <input
                    type="checkbox"
                    class="checkbox checkbox-xs checkbox-warning"
                    bind:checked={euRestricted}
                />
                <span
                    class="text-xs text-base-content/50 group-hover:text-base-content/70 transition-colors"
                >
                    Block EU
                </span>
            </label>
        </div>
    </div>
</div>
