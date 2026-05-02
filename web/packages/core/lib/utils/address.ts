/**
 * Address validation utilities.
 *
 * Single source of truth — replaces three drifted copies that previously
 * lived in csvProcessor.ts and tokenMetadata.ts.
 */

import { StrKey } from '@stellar/stellar-sdk';

/**
 * Stellar address validation for account IDs (G...) and contract IDs (C...).
 */
export function isValidAddress(address: string): boolean {
    return StrKey.isValidEd25519PublicKey(address) || StrKey.isValidContract(address);
}

export function isValidAccountAddress(address: string): boolean {
    return StrKey.isValidEd25519PublicKey(address);
}

export function isValidContractAddress(address: string): boolean {
    return StrKey.isValidContract(address);
}
