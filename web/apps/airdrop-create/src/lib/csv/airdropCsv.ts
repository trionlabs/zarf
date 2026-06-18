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
import { isPositiveAmountString } from '@zarf/core/utils/amount';

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
        const line = lines[i].trim();
        if (!line) continue;

        // Skip a header row if present (a strkey never contains these words).
        const lower = line.toLowerCase();
        if (i === 0 && (lower.includes('address') || lower.includes('amount'))) {
            continue;
        }

        const parts = line.split(',').map((p) => p.trim());
        if (parts.length < 2) {
            errors.push(`Line ${i + 1}: expected "address,amount" — "${line}"`);
            continue;
        }

        const [rawAddress, amountStr] = parts;
        const address = normalizeAirdropAddress(rawAddress);

        // Grammar-only check (positive decimal string, no exponent / float
        // rounding); the exact decimals/i128-range are enforced against the
        // token at step-1 and at tree-build time. Store the ORIGINAL string.
        if (!isPositiveAmountString(amountStr)) {
            errors.push(`Line ${i + 1}: amount must be a positive decimal — "${amountStr}"`);
            continue;
        }
        // Shape-only (regex) check; the exact StrKey checksum is enforced when
        // the merkle leaf calls Address.fromString at tree-build time.
        if (!isValidAddressShape(address)) {
            errors.push(`Line ${i + 1}: invalid Stellar address — "${rawAddress}"`);
            continue;
        }

        entries.push({ address, amount: amountStr });
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
