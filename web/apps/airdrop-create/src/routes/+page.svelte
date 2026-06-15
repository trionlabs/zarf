<script lang="ts">
    // Scaffold placeholder. Proves the M2/M3 core surface integrates (typecheck):
    // the airdrop factory contract params, the merkle row type, the config getter.
    // The real wizard (Token -> Recipients -> Review & Deploy) is M4 T4-T8.
    import type { CreateAirdropParams } from '@zarf/core/contracts';
    import type { Row } from '@zarf/core/merkle';
    import { getAirdropFactoryAddress } from '@zarf/core/config/runtime';

    let factory: string | undefined;
    try {
        factory = getAirdropFactoryAddress();
    } catch {
        factory = undefined;
    }

    // Reference the imported types so they're part of the typecheck graph.
    const _params: CreateAirdropParams | undefined = undefined;
    const _row: Row | undefined = undefined;
    void _params;
    void _row;
</script>

<main class="mx-auto max-w-2xl p-8">
    <h1 class="text-2xl font-semibold">Airdrop — Create</h1>
    <p class="mt-2 text-sm opacity-70">
        Scaffold. Airdrop factory: {factory ?? 'not configured'}.
    </p>
</main>
