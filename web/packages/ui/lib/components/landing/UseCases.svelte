<script lang="ts">
    import { Gift, Check, EyeOff, Globe } from "lucide-svelte";

    const cases = [
        {
            label: "Syndicates",
            icon: EyeOff,
            title: "Private Cap Tables",
            desc: "Raise from high-profile angels without leaking names on-chain.",
            points: [
                "Hidden Investor Identities",
                "Programmable Vesting",
                "ZK-Proof Verification",
            ],
            delay: 0,
        },
        {
            label: "Payroll",
            icon: Globe,
            title: "Global Payroll",
            desc: "Pay distributed teams in stablecoins with full compliance.",
            points: [
                "Stablecoin Payments",
                "No Wallet Mapping",
                "Scheduled Distributions",
            ],
            delay: 100,
        },
        {
            label: "Airdrops",
            icon: Gift,
            title: "Stealth Rewards",
            desc: "Reward community members without alerting potential snipers.",
            points: ["Email Whitelists", "Unlinkable Claims", "Merkle Proof Verification"],
            delay: 200,
        },
    ];
</script>

<section
    class="py-20 mt-16 md:mt-24 relative border-t border-base-content/5"
>
    <div class="container mx-auto px-6 max-w-7xl">
        <div class="mb-20 text-center max-w-2xl mx-auto">
            <h2 class="text-3xl font-bold tracking-tight mb-4">
                Built For Corporate Privacy
            </h2>
            <p class="text-lg text-base-content/60 font-light">
                Privacy infrastructure for Syndicates, Founders, and DAOs. Your
                distributions without compromising your data.
            </p>
        </div>

        <div class="grid md:grid-cols-3 gap-8">
            {#each cases as item}
                <div
                    class="group relative p-8 rounded-[2rem] border border-base-content/10 bg-base-100/50 hover:bg-base-100 hover:border-primary/20 transition-all duration-500 hover:-translate-y-1 flex flex-col"
                >
                    <!-- Icon -->
                    <div
                        class="w-14 h-14 rounded-2xl border border-base-content/10 flex items-center justify-center mb-8 group-hover:scale-110 group-hover:border-primary/20 group-hover:text-primary transition-all duration-500 bg-base-100"
                    >
                        <svelte:component
                            this={item.icon}
                            class="w-6 h-6"
                            strokeWidth={1.5}
                        />
                    </div>

                    <!-- Content -->
                    <div class="mb-8">
                        <div
                            class="text-xs font-mono uppercase tracking-widest opacity-50 mb-2"
                        >
                            {item.label}
                        </div>
                        <h3 class="text-2xl font-bold mb-3">{item.title}</h3>
                        <p
                            class="text-base-content/60 leading-relaxed font-light"
                        >
                            {item.desc}
                        </p>
                    </div>

                    <!-- Points -->
                    <div class="space-y-4 mb-8 flex-1">
                        {#each item.points as point}
                            <div class="flex items-start gap-3 opacity-80">
                                <Check
                                    class="w-4 h-4 text-primary mt-1 shrink-0"
                                />
                                <span class="text-sm">{point}</span>
                            </div>
                        {/each}
                    </div>

                </div>
            {/each}
        </div>
    </div>
</section>
