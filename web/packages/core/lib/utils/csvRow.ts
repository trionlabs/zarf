/**
 * Shared `identifier,amount` CSV row grammar.
 *
 * BOTH distribution CSV parsers — the ZK/email one (apps/create) and the
 * wallet/airdrop one (apps/airdrop-create) — are forks that historically drifted
 * apart (one got `parts.length !== 2` + data-shape header detection, the other
 * was left on `< 2` + substring header matching, which silently under-allocated
 * and dropped recipients). This is the single source of truth for the row
 * grammar so the two can never diverge again.
 *
 * The caller supplies `isValidIdentifier` (email shape vs Stellar strkey shape),
 * does its own identifier normalization + identifier-specific validation on the
 * returned `identifier`, and converts `amountStr` itself. Amounts are returned
 * as the RAW string and MUST be carried as strings end-to-end so a value above
 * 2^53 base units (or one that stringifies to exponential notation) is never
 * silently rounded before it reaches the merkle leaf.
 *
 * @module utils/csvRow
 */

import { isPositiveAmountString } from './amount';

export type CsvRowOutcome =
    | { kind: 'skip' } // blank line or a header row
    | { kind: 'badColumns' } // not exactly two comma-separated columns
    | { kind: 'badAmount'; amountStr: string } // amount column failed the grammar
    | { kind: 'row'; identifier: string; amountStr: string };

/**
 * Classify one raw CSV line into skip / error / row.
 *
 * @param rawLine - the raw line (will be trimmed)
 * @param index - 0-based line index (only line 0 is eligible to be a header)
 * @param isValidIdentifier - predicate for the identifier column (email/strkey)
 */
export function classifyCsvRow(
    rawLine: string,
    index: number,
    isValidIdentifier: (s: string) => boolean,
): CsvRowOutcome {
    const line = rawLine.trim();
    if (!line) return { kind: 'skip' };

    const parts = line.split(',').map((p) => p.trim());

    // Skip a header row ONLY when NEITHER column is data-shaped — the identifier
    // is not valid AND the amount is not a positive number (e.g. "email,amount"
    // or "address,amount"). Substring matching ('amount'/'address'/'email') was
    // unsafe: it silently dropped real recipients whose identifier contains a
    // keyword (e.g. team@amountpartners.com or a strkey body spelling AMOUNT).
    // Keying on "amount column is non-numeric" also lets a malformed FIRST data
    // row (valid identifier, bad amount) surface its error instead of vanishing.
    if (
        index === 0 &&
        (parts.length < 2 || (!isValidIdentifier(parts[0]) && !isPositiveAmountString(parts[1])))
    ) {
        return { kind: 'skip' };
    }

    // Require EXACTLY `identifier,amount`. A `< 2` minimum let `id,1,000` parse
    // as amount="1" (a silent 1000x under-allocation) and silently discarded any
    // trailing columns.
    if (parts.length !== 2) {
        return { kind: 'badColumns' };
    }

    const [identifier, amountStr] = parts;

    // Strict positive-decimal grammar (no exponent, no IEEE-754 rounding). The
    // caller keeps amountStr as a string; converting it to a Number here would
    // re-open the precision hole this grammar exists to close.
    if (!isPositiveAmountString(amountStr)) {
        return { kind: 'badAmount', amountStr };
    }

    return { kind: 'row', identifier, amountStr };
}
