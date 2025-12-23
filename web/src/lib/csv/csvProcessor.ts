/**
 * CSV Processing Utilities for Whitelist Management
 * 
 * Handles parsing, validation, and normalization of whitelist CSV files.
 * Expected format: email,amount
 * 
 * @module csv/csvProcessor
 */

import type { WhitelistEntry } from '../types';

// ============================================================================
// Email Validation
// ============================================================================

/**
 * Basic email format validation using regex
 * 
 * @param email - Email string to validate
 * @returns True if email appears valid
 * 
 * @example
 * ```typescript
 * isValidEmail('user@example.com'); // true
 * isValidEmail('invalid');          // false
 * ```
 */
function isValidEmail(email: string): boolean {
    // Basic RFC 5322-like validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
}

/**
 * Normalizes email for consistent hashing and comparison.
 * Applies Gmail-specific rules and removes plus-addressing.
 * 
 * Rules applied:
 * 1. Lowercase the entire email
 * 2. Trim whitespace
 * 3. For Gmail: Remove dots from local part (before @)
 * 4. Remove plus-addressing (everything after + until @)
 * 
 * @param email - Raw email address
 * @returns Normalized email address
 * 
 * @example
 * ```typescript
 * normalizeEmail('Alice@Example.com');         // 'alice@example.com'
 * normalizeEmail('ali.ce@gmail.com');          // 'alice@gmail.com'
 * normalizeEmail('alice+tag@gmail.com');       // 'alice@gmail.com'
 * normalizeEmail('ali.ce+tag@gmail.com');      // 'alice@gmail.com'
 * normalizeEmail('alice+newsletters@other.com'); // 'alice@other.com'
 * ```
 */
export function normalizeEmail(email: string): string {
    let normalized = email.toLowerCase().trim();

    // Gmail-specific: dots in local part are ignored
    if (normalized.endsWith('@gmail.com')) {
        const [local, domain] = normalized.split('@');
        normalized = local.replace(/\./g, '') + '@' + domain;
    }

    // Strip plus-addressing: alice+tag@example.com → alice@example.com
    const plusIdx = normalized.indexOf('+');
    const atIdx = normalized.indexOf('@');

    if (plusIdx > 0 && atIdx > plusIdx) {
        normalized = normalized.slice(0, plusIdx) + normalized.slice(atIdx);
    }

    return normalized;
}

// ============================================================================
// CSV Parsing
// ============================================================================

/**
 * Parse CSV content into whitelist entries.
 * Automatically handles:
 * - Header row detection (skips if present)
 * - Empty lines
 * - Invalid formats (warns in console, skips entry)
 * - Email normalization
 * 
 * @param content - Raw CSV file content as string
 * @returns Array of valid whitelist entries
 * 
 * @throws {Error} If content is empty after parsing
 * 
 * @example
 * ```typescript
 * const csv = `email,amount
 * alice@example.com,1000
 * bob@example.com,2000`;
 * 
 * const entries = parseCSV(csv);
 * // [{ email: 'alice@example.com', amount: 1000 }, ...]
 * ```
 */
export function parseCSV(content: string): WhitelistEntry[] {
    const lines = content.trim().split('\n');
    const entries: WhitelistEntry[] = [];
    const errors: string[] = [];

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();

        // Skip empty lines
        if (!line) continue;

        // Skip header row if present (case-insensitive)
        if (i === 0 && line.toLowerCase().includes('email')) {
            continue;
        }

        const parts = line.split(',').map((p) => p.trim());

        if (parts.length < 2) {
            const warning = `Line ${i + 1}: Invalid format (expected email,amount) - "${line}"`;
            console.warn(warning);
            errors.push(warning);
            continue;
        }

        const [rawEmail, amountStr] = parts;

        // Validate email format
        if (!isValidEmail(rawEmail)) {
            const warning = `Line ${i + 1}: Invalid email format - "${rawEmail}"`;
            console.warn(warning);
            errors.push(warning);
            continue;
        }

        // Parse and validate amount
        const amount = parseInt(amountStr, 10);
        if (isNaN(amount) || amount <= 0) {
            const warning = `Line ${i + 1}: Invalid amount (must be positive integer) - "${amountStr}"`;
            console.warn(warning);
            errors.push(warning);
            continue;
        }

        // Normalize email for consistent comparison
        const email = normalizeEmail(rawEmail);

        entries.push({ email, amount });
    }

    if (entries.length === 0) {
        throw new Error(
            `No valid entries found in CSV. Errors encountered:\n${errors.join('\n')}`
        );
    }

    return entries;
}

/**
 * Read a CSV file from File API and parse into whitelist entries.
 * 
 * @param file - File object from input[type="file"]
 * @returns Promise resolving to array of whitelist entries
 * 
 * @throws {Error} If file cannot be read or parsed
 * 
 * @example
 * ```typescript
 * // In Svelte component
 * async function handleFileUpload(event: Event) {
 *   const input = event.target as HTMLInputElement;
 *   const file = input.files?.[0];
 *   
 *   if (!file) return;
 *   
 *   try {
 *     const entries = await readCSVFile(file);
 *     console.log(`Loaded ${entries.length} entries`);
 *   } catch (error) {
 *     alert(`Failed to read CSV: ${error.message}`);
 *   }
 * }
 * ```
 */
export async function readCSVFile(file: File): Promise<WhitelistEntry[]> {
    // Validate file type
    if (!file.name.endsWith('.csv')) {
        throw new Error(`Invalid file type: ${file.name}. Expected .csv file.`);
    }

    // Validate file size (5MB limit)
    const MAX_SIZE = 5 * 1024 * 1024; // 5MB
    if (file.size > MAX_SIZE) {
        throw new Error(
            `File too large: ${(file.size / 1024 / 1024).toFixed(2)}MB. Maximum size is 5MB.`
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

                const entries = parseCSV(content);
                resolve(entries);
            } catch (error) {
                reject(
                    error instanceof Error
                        ? error
                        : new Error('Failed to parse CSV: unknown error')
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
 * Useful for development and demos.
 * 
 * @returns CSV string with sample data
 * 
 * @example
 * ```typescript
 * const sampleCSV = generateSampleCSV();
 * const blob = new Blob([sampleCSV], { type: 'text/csv' });
 * const file = new File([blob], 'sample.csv');
 * 
 * const entries = await readCSVFile(file);
 * ```
 */
export function generateSampleCSV(): string {
    return `email,amount
alice@example.com,1000
bob@example.com,2000
charlie@example.com,5000
dave+test@example.com,3000
eve.smith@gmail.com,4000
yamancandev@gmail.com,10000`;
}

/**
 * Creates a File object from sample CSV for testing.
 * 
 * @returns File object containing sample CSV data
 * 
 * @example
 * ```typescript
 * const sampleFile = createSampleFile();
 * const entries = await readCSVFile(sampleFile);
 * // entries.length === 6
 * ```
 */
export function createSampleFile(): File {
    const content = generateSampleCSV();
    const blob = new Blob([content], { type: 'text/csv' });
    return new File([blob], 'sample.csv', { type: 'text/csv' });
}
