<script lang="ts">
	import "../app.css";
	import favicon from "$lib/assets/favicon.svg";
	import { walletStore } from "$lib/stores/walletStore.svelte";
	import { authStore } from "$lib/stores/authStore.svelte";
	import { onMount } from "svelte";
	import { browser } from "$app/environment";
	import WalletSelectionModal from "$lib/components/wallet/WalletSelectionModal.svelte";

	let { children } = $props();

	// Initialize wallet once at app root (SSR-safe)
	onMount(() => {
		if (browser) {
			walletStore.init();
			authStore.restoreGmailSession();
		}
		return () => walletStore.destroy();
	});
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
	<title>Zarf - Private Token Distribution</title>
	<meta
		name="description"
		content="Distribute tokens privately using zero-knowledge proofs. No wallet addresses exposed."
	/>
</svelte:head>

<!-- Global Error Toast for Wallet -->
{#if walletStore.error}
	<div class="toast toast-end toast-top z-[100]">
		<div class="alert alert-error">
			<span class="text-sm">{walletStore.error}</span>
			<button
				class="btn btn-ghost btn-xs"
				onclick={() => walletStore.clearError()}
			>
				✕
			</button>
		</div>
	</div>
{/if}

<WalletSelectionModal />

{@render children()}
