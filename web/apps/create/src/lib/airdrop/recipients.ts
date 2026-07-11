/**
 * Pure recipient-list validation helpers, kept out of the `.svelte` components
 * so the transient `Map`/`Set` used for counting aren't mistaken for reactive
 * state (they're rebuilt each derivation; reactivity is the caller's `$derived`).
 */
import { normalizeAirdropAddress } from './csv/airdropCsv';

/** Normalized addresses that appear more than once in the list. */
export function findDuplicateAddresses(rows: { address: string }[]): Set<string> {
    const counts = new Map<string, number>();
    for (const r of rows) {
        const a = normalizeAirdropAddress(r.address);
        if (a) counts.set(a, (counts.get(a) ?? 0) + 1);
    }
    const dups = new Set<string>();
    for (const [a, c] of counts) if (c > 1) dups.add(a);
    return dups;
}
