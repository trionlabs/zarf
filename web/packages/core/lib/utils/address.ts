/**
 * Address validation utilities.
 *
 * Single source of truth — replaces three drifted copies that previously
 * lived in csvProcessor.ts and tokenMetadata.ts.
 */

import { isAddress } from 'viem';

/**
 * Lexical address validation: 0x + 40 hex characters, no checksum check.
 *
 * Use this for "is the user input shaped like an address?" gating —
 * paste detection, form validation, CSV parsing. Don't use it as the
 * sole gate before sending value; checksum-validate or trust the
 * downstream contract.
 */
export function isValidAddress(address: string): boolean {
    return isAddress(address, { strict: false });
}
