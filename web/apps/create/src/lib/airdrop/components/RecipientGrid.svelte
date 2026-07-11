<script lang="ts">
    import { Plus, Trash2, Upload, ClipboardPaste, AlertTriangle, X } from 'lucide-svelte';
    import ZenButton from '@zarf/ui/components/ui/ZenButton.svelte';
    import { isValidAddressShape } from '@zarf/core/utils/addressShape';
    import { isPositiveAmountString } from '@zarf/core/utils/amount';
    import { formatAmount } from '@zarf/core/utils/format';
    import { parseAirdropCSV, normalizeAirdropAddress } from '$lib/airdrop/csv/airdropCsv';
    import { findDuplicateAddresses } from '$lib/airdrop/recipients';
    import type { RecipientRow } from '$lib/airdrop/stores/types';

    let {
        recipients = $bindable<RecipientRow[]>([]),
        tokenSymbol = 'tokens',
    }: { recipients: RecipientRow[]; tokenSymbol?: string } = $props();

    let importOpen = $state(false);
    let importText = $state('');
    let importErrors = $state<string[]>([]);
    let fileInput = $state<HTMLInputElement | undefined>(undefined);

    // ---- Validation (drives inline aria-invalid + the footer summary) --------
    const duplicateAddrs = $derived(findDuplicateAddresses(recipients));

    function addrOk(r: RecipientRow): boolean {
        return isValidAddressShape(normalizeAirdropAddress(r.address));
    }
    function amtOk(r: RecipientRow): boolean {
        return isPositiveAmountString(r.amount);
    }
    function isDup(r: RecipientRow): boolean {
        return duplicateAddrs.has(normalizeAirdropAddress(r.address));
    }

    // Display-only running total (the load-bearing base-unit total is computed
    // via parseTokenAmount/sumBaseUnits at prepare; Number() here is for the UI).
    const total = $derived(recipients.reduce((s, r) => s + (amtOk(r) ? Number(r.amount) : 0), 0));
    const invalidCount = $derived(
        recipients.filter((r) => !addrOk(r) || !amtOk(r) || isDup(r)).length,
    );

    // ---- Row mutation --------------------------------------------------------
    function addRow() {
        recipients = [...recipients, { address: '', amount: '' }];
    }
    function deleteRow(i: number) {
        recipients = recipients.filter((_, k) => k !== i);
    }
    function onAddressInput(i: number, value: string) {
        // Uppercase on input — strkeys are uppercase base32, so this is harmless
        // for typing yet guarantees the load-bearing canonical form.
        recipients[i].address = value.toUpperCase();
    }

    // ---- Bulk import (paste / CSV) -------------------------------------------
    function applyParsed(content: string) {
        const res = parseAirdropCSV(content);
        importErrors = res.errors;
        if (res.entries.length > 0) {
            recipients = res.entries.map((e) => ({ address: e.address, amount: e.amount }));
            importOpen = false;
            importText = '';
        }
    }
    function importFromTextarea() {
        applyParsed(importText);
    }
    async function onFileChange(event: Event) {
        const input = event.target as HTMLInputElement;
        const file = input.files?.[0];
        if (!file) return;
        const text = await file.text();
        applyParsed(text);
        input.value = '';
    }
</script>

<div class="space-y-4">
    <!-- Toolbar -->
    <div class="flex flex-wrap items-center gap-2">
        <ZenButton variant="ghost" size="sm" onclick={addRow}>
            <Plus class="w-4 h-4 mr-1" /> Add row
        </ZenButton>
        <ZenButton variant="ghost" size="sm" onclick={() => (importOpen = !importOpen)}>
            <ClipboardPaste class="w-4 h-4 mr-1" /> Paste list
        </ZenButton>
        <ZenButton variant="ghost" size="sm" onclick={() => fileInput?.click()}>
            <Upload class="w-4 h-4 mr-1" /> Import CSV
        </ZenButton>
        <input
            bind:this={fileInput}
            type="file"
            accept=".csv,text/csv,text/plain"
            class="hidden"
            onchange={onFileChange}
        />
        {#if recipients.length > 0}
            <ZenButton variant="ghost" size="sm" onclick={() => (recipients = [])}>
                <X class="w-4 h-4 mr-1" /> Clear
            </ZenButton>
        {/if}
    </div>

    <!-- Bulk import panel -->
    {#if importOpen}
        <div class="rounded-xl border border-zen-border-subtle bg-zen-fg/[0.02] p-4 space-y-3">
            <label for="bulk-import" class="text-xs font-medium text-zen-fg-muted">
                One <code>address,amount</code> per line. Addresses are normalized to uppercase.
            </label>
            <textarea
                id="bulk-import"
                bind:value={importText}
                rows="5"
                spellcheck="false"
                placeholder="GAB...XYZ,100&#10;CDLZ...SC,250"
                class="w-full rounded-lg border border-zen-border-subtle bg-zen-bg p-3 font-mono text-xs text-zen-fg focus:outline-none focus:ring-1 focus:ring-zen-fg/30"
            ></textarea>
            <div class="flex items-center gap-2">
                <ZenButton variant="primary" size="sm" onclick={importFromTextarea}>
                    Replace list
                </ZenButton>
                <ZenButton variant="ghost" size="sm" onclick={() => (importOpen = false)}>
                    Cancel
                </ZenButton>
            </div>
        </div>
    {/if}

    {#if importErrors.length > 0}
        <div role="alert" class="rounded-xl bg-zen-warning/5 p-3 text-xs text-zen-warning">
            <div class="flex items-center gap-2 font-semibold">
                <AlertTriangle class="w-4 h-4" />
                {importErrors.length} import issue(s)
            </div>
            <ul class="mt-1 list-disc pl-6 space-y-0.5">
                {#each importErrors.slice(0, 8) as e (e)}
                    <li>{e}</li>
                {/each}
                {#if importErrors.length > 8}
                    <li>…and {importErrors.length - 8} more</li>
                {/if}
            </ul>
        </div>
    {/if}

    <!-- Grid -->
    {#if recipients.length === 0}
        <div
            class="rounded-2xl border border-dashed border-zen-border-subtle p-10 text-center text-sm text-zen-fg-subtle"
        >
            No recipients yet. Add a row, paste a list, or import a CSV.
        </div>
    {:else}
        <div class="overflow-hidden rounded-2xl border border-zen-border-subtle">
            <div
                class="grid grid-cols-[2.5rem_1fr_8rem_2.5rem] items-center gap-2 border-b border-zen-border-subtle bg-zen-fg/[0.02] px-3 py-2 text-[10px] font-semibold uppercase tracking-wider text-zen-fg-subtle"
            >
                <span>#</span>
                <span>Address</span>
                <span class="text-right">Amount</span>
                <span></span>
            </div>
            {#each recipients as row, i (i)}
                {@const badAddr = !addrOk(row) && row.address.trim().length > 0}
                {@const dup = isDup(row)}
                {@const badAmt = !amtOk(row)}
                <div
                    class="grid grid-cols-[2.5rem_1fr_8rem_2.5rem] items-center gap-2 px-3 py-1.5 hover:bg-zen-fg/[0.02] {dup
                        ? 'bg-zen-error/5'
                        : ''}"
                >
                    <span class="text-xs tabular-nums text-zen-fg-faint">{i + 1}</span>
                    <input
                        type="text"
                        value={row.address}
                        oninput={(e) => onAddressInput(i, e.currentTarget.value)}
                        spellcheck="false"
                        autocomplete="off"
                        autocapitalize="characters"
                        aria-label={`Recipient ${i + 1} address`}
                        aria-invalid={badAddr || dup}
                        aria-describedby={dup ? `dup-${i}` : undefined}
                        placeholder="G… or C… address"
                        class="w-full bg-transparent font-mono text-xs text-zen-fg focus:outline-none {badAddr ||
                        dup
                            ? 'text-zen-error'
                            : ''}"
                    />
                    <input
                        type="text"
                        inputmode="decimal"
                        bind:value={row.amount}
                        aria-label={`Recipient ${i + 1} amount`}
                        aria-invalid={badAmt}
                        class="w-full bg-transparent text-right font-mono text-xs tabular-nums text-zen-fg focus:outline-none {badAmt
                            ? 'text-zen-error'
                            : ''}"
                    />
                    <button
                        type="button"
                        onclick={() => deleteRow(i)}
                        aria-label={`Remove recipient ${i + 1}`}
                        class="flex h-6 w-6 items-center justify-center rounded text-zen-fg-faint transition-colors hover:bg-zen-error/10 hover:text-zen-error"
                    >
                        <Trash2 class="w-3.5 h-3.5" />
                    </button>
                    {#if dup}
                        <span id={`dup-${i}`} class="sr-only">Duplicate address</span>
                    {/if}
                </div>
            {/each}
        </div>
    {/if}

    <!-- Footer stats -->
    <div class="flex flex-wrap items-center justify-between gap-4 px-1">
        <div class="flex items-center gap-6">
            <div>
                <span class="block text-[10px] uppercase tracking-wider text-zen-fg-muted"
                    >Recipients</span
                >
                <span class="text-lg font-semibold tabular-nums text-zen-fg"
                    >{recipients.length}</span
                >
            </div>
            <div>
                <span class="block text-[10px] uppercase tracking-wider text-zen-fg-muted"
                    >Total</span
                >
                <span class="text-lg font-semibold tabular-nums text-zen-fg">
                    {formatAmount(total)}
                    <span class="text-xs font-normal text-zen-fg-subtle">{tokenSymbol}</span>
                </span>
            </div>
        </div>
        {#if invalidCount > 0}
            <div class="flex items-center gap-2 text-xs font-medium text-zen-error">
                <AlertTriangle class="w-4 h-4" />
                {invalidCount} row(s) need fixing (invalid address, amount ≤ 0, or duplicate)
            </div>
        {/if}
    </div>
</div>
