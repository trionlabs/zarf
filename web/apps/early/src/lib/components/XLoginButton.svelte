<script lang="ts">
    import { brand } from '$lib/brand';
    import ZenButton from '@zarf/ui/components/ui/ZenButton.svelte';

    interface Props {
        label?: string;
    }

    // Real GET navigation to the OAuth start endpoint — NOT a fetch. The anchor
    // wraps a ZenButton (matching the landing's `<a><ZenButton/></a>` pattern);
    // `data-sveltekit-reload` forces a full document navigation so the server
    // route runs the OAuth redirect instead of SvelteKit client routing.
    let { label = brand.hero.ctaLabel }: Props = $props();
</script>

<a href="/api/auth/twitter" data-sveltekit-reload class="block w-full">
    <ZenButton variant="primary" size="lg" class="w-full">
        {label}
        {#snippet iconRight()}
            <svg class="h-4 w-4" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <path
                    d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"
                ></path>
            </svg>
        {/snippet}
    </ZenButton>
</a>
