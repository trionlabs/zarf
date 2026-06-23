/**
 * CSV Processing Utilities for Whitelist Management
 *
 * Handles parsing, validation, and normalization of whitelist CSV files.
 * Supported format (create.zarf.to is email-only):
 * - email,amount
 *
 * @module csv/csvProcessor
 */

// CSV produces UI-draft entries (amount is the RAW decimal STRING from the file,
// carried unchanged to the merkle boundary), which is the `Recipient` shape, not
// the post-merkle on-chain `MerkleClaim` (amount: bigint).
import type { Recipient } from '../stores/types';
import { normalizeEmail, isValidEmail } from '@zarf/core/utils/email';
import { classifyCsvRow } from '@zarf/core/utils/csvRow';
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
        // Shared row grammar (blank-skip, data-shape header detection, exact-2
        // columns, positive-decimal amount) — identical to the airdrop parser so
        // the two can never drift. See @zarf/core/utils/csvRow.
        const outcome = classifyCsvRow(lines[i], i, isValidEmail);
        if (outcome.kind === 'skip') continue;
        if (outcome.kind === 'badColumns') {
            errors.push(
                `Line ${i + 1}: Invalid format (expected exactly "email,amount") - "${lines[i].trim()}"`,
            );
            continue;
        }
        if (outcome.kind === 'badAmount') {
            errors.push(
                `Line ${i + 1}: Invalid amount (must be a positive decimal) - "${outcome.amountStr}"`,
            );
            continue;
        }

        const { identifier, amountStr } = outcome;

        // Email ONLY (create.zarf.to is email-only). classifyCsvRow only used the
        // predicate for header detection (row 0), so re-validate every row here.
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

        // Carry the RAW amount string end-to-end (no Number() round-trip) so a
        // value above 2^53 base units, or one that would stringify to exponential
        // notation, is never silently rounded before it reaches the merkle leaf.
        // Duplicates are allowed in the list (reported below; they block deploy
        // at step-1).
        entries.push({ email, amount: amountStr });
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
