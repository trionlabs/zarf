<script lang="ts">
	import "../app.css";
	import favicon from "$lib/assets/favicon.svg";

	let { children } = $props();
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
	<title>Zarf - Private Token Distribution</title>
	<meta
		name="description"
		content="Distribute tokens privately using zero-knowledge proofs. No wallet addresses exposed."
	/>
</svelte:head>

{@render children()}
