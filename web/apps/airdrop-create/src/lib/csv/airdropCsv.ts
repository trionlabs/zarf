/**
 * Airdrop CSV ingestion — a fork of the vesting `csvProcessor` address path.
 *
 * LOAD-BEARING DIFFERENCE (07 §3.2): addresses are normalized to **UPPERCASE**,
 * never lowercase. Stellar strkeys are case-sensitive uppercase base32. The
 * vesting `csvProcessor.normalizeAddress()` lowercases — harmless for its
 * email-based leaves — but the airdrop leaf hashes
 * `Address.fromString(addr).toScVal().toXDR()`, and a lowercased strkey THROWS
 * inside `Address.fromString`, silently breaking that recipient's claim. The
 * Rust<->JS differential vectors do NOT catch this (they are generated from
 * uppercase fixtures), so the shared normalizer is pinned in `@zarf/core`
 * (`utils/airdropAddress`) and consumed identically by the airdrop-claim app.
 */
import { isValidAddressShape } from '@zarf/core/utils/addressShape';
import { normalizeAirdropAddress } from '@zarf/core/utils/airdropAddress';
import { classifyCsvRow } from '@zarf/core/utils/csvRow';

export interface AirdropRecipient {
    /** Canonical UPPERCASE Stellar address. */
    address: string;
    /** Raw decimal-string amount (converted to i128 base units at merkle time;
     *  kept as a string so values above 2^53 base units are not rounded). */
    amount: string;
}

export interface AirdropParseResult {
    entries: AirdropRecipient[];
    errors: string[];
}

// Re-exported so this producer and the airdrop-claim consumer share ONE
// normalization (the load-bearing UPPERCASE rule lives in @zarf/core).
export { normalizeAirdropAddress };

/** Parse `address,amount` rows. Airdrop is address-only (no email path). */
export function parseAirdropCSV(content: string): AirdropParseResult {
    const lines = content.trim().split('\n');
    const entries: AirdropRecipient[] = [];
    const errors: string[] = [];

    for (let i = 0; i < lines.length; i++) {
        // Shared row grammar (blank-skip, data-shape header detection, exact-2
        // columns, positive-decimal amount) — identical to the ZK/email parser so
        // the two can never drift. The old `parts.length < 2` silently truncated
        // `addr,1,000` to amount="1", and substring header matching dropped a
        // first-row strkey whose base32 body spelled ADDRESS/AMOUNT. See
        // @zarf/core/utils/csvRow.
        const outcome = classifyCsvRow(lines[i], i, (s) =>
            isValidAddressShape(normalizeAirdropAddress(s)),
        );
        if (outcome.kind === 'skip') continue;
        if (outcome.kind === 'badColumns') {
            errors.push(`Line ${i + 1}: expected "address,amount" — "${lines[i].trim()}"`);
            continue;
        }
        if (outcome.kind === 'badAmount') {
            errors.push(
                `Line ${i + 1}: amount must be a positive decimal — "${outcome.amountStr}"`,
            );
            continue;
        }

        const address = normalizeAirdropAddress(outcome.identifier);

        // Shape-only (regex) check; the exact StrKey checksum is enforced when
        // the merkle leaf calls Address.fromString at tree-build time.
        if (!isValidAddressShape(address)) {
            errors.push(`Line ${i + 1}: invalid Stellar address — "${outcome.identifier}"`);
            continue;
        }

        // Store the ORIGINAL amount string (i128-range enforced at tree-build).
        entries.push({ address, amount: outcome.amountStr });
    }

    // Duplicate detection by address (airdrop is address-keyed, not email).
    const counts = new Map<string, number>();
    for (const e of entries) {
        counts.set(e.address, (counts.get(e.address) ?? 0) + 1);
    }
    for (const [address, count] of counts) {
        if (count > 1) {
            errors.push(`Duplicate address: ${address} (${count} occurrences)`);
        }
    }

    return { entries, errors };
}
