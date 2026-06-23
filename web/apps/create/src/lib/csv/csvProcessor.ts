/**
 * CSV Processing Utilities for Whitelist Management
 *
 * Handles parsing, validation, and normalization of whitelist CSV files.
 * Supported format (create.zarf.to is email-only):
 * - email,amount
 *
 * @module csv/csvProcessor
 */

// CSV produces UI-draft entries (amount: number from a form field), which is the
// `Recipient` shape, not the post-merkle on-chain `Recipient` (amount: bigint).
import type { Recipient } from '../stores/types';
import { normalizeEmail, isValidEmail } from '@zarf/core/utils/email';
import { isPositiveAmountString } from '@zarf/core/utils/amount';
import { MAX_EMAIL_LENGTH } from '@zarf/core/constants';
// Re-export for backward compatibility
export { normalizeEmail };

// ============================================================================
// CSV Parsing
// ============================================================================

export interface ParseResult {
    entries: Recipient[];
    errors: string[];
}

/**
 * Parse CSV content into whitelist entries.
 * Automatically handles:
 * - Header row detection (skips if present)
 * - Empty lines
 * - Email validation (Strictly enforces email format)
 * - Email normalization
 */
export function parseCSV(content: string): ParseResult {
    const lines = content.trim().split('\n');
    const entries: Recipient[] = [];
    const errors: string[] = [];

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();

        // Skip empty lines
        if (!line) continue;

        const parts = line.split(',').map((p) => p.trim());

        // Skip a header row ONLY when NEITHER column is data-shaped — i.e. the
        // first column is not a valid email AND the second is not a positive
        // amount (e.g. "email,amount"). Substring matching
        // ('email'/'amount'/'number') was unsafe: it silently dropped real
        // recipients whose address contains a keyword, e.g.
        // `team@amountpartners.com,500`. Requiring BOTH columns to be non-data
        // also means a malformed FIRST data row (valid email, bad amount) falls
        // through and surfaces its error instead of being eaten as a header.
        if (
            i === 0 &&
            (parts.length < 2 || (!isValidEmail(parts[0]) && !isPositiveAmountString(parts[1])))
        ) {
            continue;
        }

        // Require EXACTLY `email,amount`. The old `< 2` (a minimum) let
        // `alice@example.com,1,000` through as amount="1" — a silent 1000x
        // under-allocation — and silently discarded any trailing columns.
        if (parts.length !== 2) {
            errors.push(
                `Line ${i + 1}: Invalid format (expected exactly "email,amount") - "${line}"`,
            );
            continue;
        }

        const [identifier, amountStr] = parts;

        // Amount: strict positive-decimal grammar (no exponent, no IEEE-754
        // rounding). Mirrors the sibling airdrop parser so both CSV paths
        // accept the same amount grammar; `parseFloat` accepted `1e3`/`100abc`.
        if (!isPositiveAmountString(amountStr)) {
            errors.push(
                `Line ${i + 1}: Invalid amount (must be a positive decimal) - "${amountStr}"`,
            );
            continue;
        }
        const amount = Number(amountStr);

        // Email ONLY (create.zarf.to is email-only).
        if (!isValidEmail(identifier)) {
            errors.push(`Line ${i + 1}: Invalid email format - "${identifier}"`);
            continue;
        }
        const email = normalizeEmail(identifier);

        // Bound the email to MAX_EMAIL_LENGTH bytes. The leaf hashes
        // stringToBytes(email, MAX_EMAIL_LENGTH), which SILENTLY TRUNCATES; at
        // claim time the Google JWT carries the full email and derives a
        // different email_hash, so an over-length leaf is permanently
        // unclaimable. Reject it here instead of minting a dead allocation.
        if (new TextEncoder().encode(email).length > MAX_EMAIL_LENGTH) {
            errors.push(
                `Line ${i + 1}: Email exceeds ${MAX_EMAIL_LENGTH} bytes (would be unclaimable) - "${identifier}"`,
            );
            continue;
        }

        // Allow duplicates in the list so the total matches the CSV file;
        // duplicates are reported below and block deploy at step-1.
        entries.push({ email, amount });
    }

    // Post-processing: Detect duplicates for error reporting. `email` is the
    // mandatory identifier, so every entry has a non-empty one — no guard.
    const emailCounts = new Map<string, number>();
    for (const e of entries) {
        emailCounts.set(e.email, (emailCounts.get(e.email) || 0) + 1);
    }

    for (const [email, count] of emailCounts) {
        if (count > 1) {
            errors.push(`Duplicate email found: ${email} (${count} occurrences)`);
        }
    }

    return { entries, errors };
}

/**
 * Read a CSV file from File API and parse into whitelist entries.
 *
 * @param file - File object from input[type="file"]
 * @returns Promise resolving to ParseResult
 */
export async function readCSVFile(file: File): Promise<ParseResult> {
    // Validate file type
    if (!file.name.endsWith('.csv')) {
        throw new Error(`Invalid file type: ${file.name}. Expected .csv file.`);
    }

    // Validate file size (5MB limit)
    const MAX_SIZE = 5 * 1024 * 1024; // 5MB
    if (file.size > MAX_SIZE) {
        throw new Error(
            `File too large: ${(file.size / 1024 / 1024).toFixed(2)}MB. Maximum size is 5MB.`,
        );
    }

    return new Promise((resolve, reject) => {
        const reader = new FileReader();

        reader.onload = (event: ProgressEvent<FileReader>) => {
            try {
                const content = event.target?.result as string;

                if (!content) {
                    throw new Error('File is empty');
                }

                const result = parseCSV(content);
                resolve(result);
            } catch (error) {
                reject(
                    error instanceof Error
                        ? error
                        : new Error('Failed to parse CSV: unknown error'),
                );
            }
        };

        reader.onerror = () => {
            reject(new Error('Failed to read file'));
        };

        reader.readAsText(file);
    });
}

// ============================================================================
// Test Data Generation
// ============================================================================

/**
 * Generate sample CSV content for testing.
 */
export function generateSampleCSV(): string {
    return `email,amount
alice@example.com,1000
bob@example.com,2000
charlie@example.com,5000
yamancandev@gmail.com,10000`;
}

/**
 * Creates a File object from sample CSV for testing.
 */
export function createSampleFile(): File {
    const content = generateSampleCSV();
    const blob = new Blob([content], { type: 'text/csv' });
    return new File([blob], 'sample.csv', { type: 'text/csv' });
}
