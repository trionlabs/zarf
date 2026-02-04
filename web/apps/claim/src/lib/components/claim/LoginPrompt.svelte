<script lang="ts">
    import { Mail, Shield, ArrowRight } from "lucide-svelte";
    import { redirectToGoogle } from "@zarf/ui/utils/googleAuth";
    import ZenCard from "@zarf/ui/components/ui/ZenCard.svelte";
    import ZenButton from "@zarf/ui/components/ui/ZenButton.svelte";

    function handleLogin() {
        redirectToGoogle();
    }
</script>

<div class="max-w-lg mx-auto">
    <ZenCard variant="elevated" class="overflow-hidden">
        <!-- Header with icon -->
        <div class="p-8 text-center space-y-6">
            <div
                class="w-16 h-16 mx-auto rounded-full bg-zen-primary/10 flex items-center justify-center"
            >
                <Mail class="w-8 h-8 text-zen-primary" />
            </div>

            <div class="space-y-2">
                <h2 class="text-xl font-bold text-zen-fg">
                    Sign in to View Distributions
                </h2>
                <p class="text-sm text-zen-fg-muted leading-relaxed">
                    We'll show you only the distributions where you have an
                    allocation. Your email is verified privately using
                    cryptographic proofs.
                </p>
            </div>

            <!-- Privacy note -->
            <div
                class="flex items-start gap-3 p-4 rounded-xl bg-zen-fg/5 text-left"
            >
                <Shield class="w-5 h-5 text-zen-success flex-shrink-0 mt-0.5" />
                <div class="text-xs text-zen-fg-subtle leading-relaxed">
                    <span class="font-medium text-zen-fg"
                        >Privacy Protected:</span
                    >
                    Your email is only used to filter distributions locally. We never
                    store or transmit your email to any server.
                </div>
            </div>

            <!-- Login button -->
            <ZenButton variant="primary" size="lg" onclick={handleLogin} class="w-full">
                <span>Continue with Google</span>
                <ArrowRight class="w-4 h-4 ml-2" />
            </ZenButton>
        </div>
    </ZenCard>
</div>
