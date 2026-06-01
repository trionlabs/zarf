import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

// Minimal config for the component library (consumed by app builds + vitest).
export default {
    preprocess: vitePreprocess(),
};
