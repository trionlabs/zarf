/**
 * CSV Processing Utilities for Whitelist Management
 * 
 * Handles parsing, validation, and normalization of whitelist CSV files.
 * Supported formats:
 * - address,amount
 * - email,amount
 * 
 * @module csv/csvProcessor
 */

import type { WhitelistEntry } from '../stores/types';
import { isAddress } from 'viem';

// ============================================================================
// Validators & Normalizers
// ============================================================================

/**
 * Basic address format validation
 */
function isValidAddress(address: string): boolean {
    return isAddress(address, { strict: false });
}

/**
 * Basic email format validation
 */
function isValidEmail(email: string): boolean {
    return email.includes('@') && email.length > 3;
}

/**
 * Normalizes address for consistent hashing and comparison.
 */
export function normalizeAddress(address: string): string {
    return address.toLowerCase().trim();
}

/**
 * Normalize email for consistent hashing (Mirrors POC logic)
 * - Lowercase
 * - Trim whitespace
 * - Remove dots from Gmail local part
 * - Remove plus addressing
 */
export function normalizeEmail(email: string): string {
    let e = email.toLowerCase().trim();

    // Gmail: dots in local part are ignored
    if (e.endsWith('@gmail.com')) {
        const [local, domain] = e.split('@');
        e = local.replace(/\./g, '') + '@' + domain;
    }

    // Strip plus addressing: alice+tag@co.com → alice@co.com
    const plusIdx = e.indexOf('+');
    if (plusIdx > 0) {
        const atIdx = e.indexOf('@');
        e = e.slice(0, plusIdx) + e.slice(atIdx);
    }

    return e;
}

// ============================================================================
// CSV Parsing
// ============================================================================

export interface ParseResult {
    entries: WhitelistEntry[];
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
    const entries: WhitelistEntry[] = [];
    const errors: string[] = [];


    for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();

        // Skip empty lines
        if (!line) continue;

        // Skip header row if present (case-insensitive)
        const lineLower = line.toLowerCase();
        if (i === 0 && (
            lineLower.includes('email') ||
            lineLower.includes('amount') ||
            lineLower.includes('number')
        )) {
            continue;
        }

        const parts = line.split(',').map((p) => p.trim());

        if (parts.length < 2) {
            errors.push(`Line ${i + 1}: Invalid format (expected email, amount) - "${line}"`);
            continue;
        }

        const [identifier, amountStr] = parts;

        // Parse and validate amount
        const amount = parseFloat(amountStr);
        if (isNaN(amount) || amount <= 0) {
            errors.push(`Line ${i + 1}: Invalid amount (must be positive number) - "${amountStr}"`);
            continue;
        }

        // Identifier Logic: Check for email OR address
        if (isValidEmail(identifier)) {
            const email = normalizeEmail(identifier);
            // Allow duplicates in the list so the total amount matches the CSV file.
            entries.push({ address: "", email, amount });
        } else if (isValidAddress(identifier)) {
            entries.push({ address: normalizeAddress(identifier), amount });
        } else {
            errors.push(`Line ${i + 1}: Invalid format (expected email or address) - "${identifier}"`);
            continue;
        }
    }

    // Post-processing: Detect duplicates for error reporting
    const emailCounts = new Map<string, number>();
    entries.forEach(e => {
        if (e.email) {
            emailCounts.set(e.email, (emailCounts.get(e.email) || 0) + 1);
        }
    });

    emailCounts.forEach((count, email) => {
        if (count > 1) {
            errors.push(`Duplicate email found: ${email} (${count} occurrences)`);
        }
    });

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

                const result = parseCSV(content);
                resolve(result);
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
