import { describe, expect, it } from 'vitest';
import { StrKey } from '@stellar/stellar-sdk';
import { Buffer } from 'buffer';
import {
    isValidContractAddressShape,
    isValidAccountAddressShape,
    isValidAddressShape,
} from './addressShape';

const validContract = StrKey.encodeContract(Buffer.alloc(32, 2));
const validAccount = StrKey.encodeEd25519PublicKey(Buffer.alloc(32, 1));

describe('isValidContractAddressShape', () => {
    it('accepts a valid contract ID', () => {
        expect(isValidContractAddressShape(validContract)).toBe(true);
    });

    it('rejects an account ID (G... prefix)', () => {
        expect(isValidContractAddressShape(validAccount)).toBe(false);
    });

    it('rejects the empty string', () => {
        expect(isValidContractAddressShape('')).toBe(false);
    });

    it('rejects lengths other than 56 (1 version char + 55 base32 chars)', () => {
        expect(isValidContractAddressShape('C' + 'A'.repeat(54))).toBe(false); // 55 total
        expect(isValidContractAddressShape('C' + 'A'.repeat(56))).toBe(false); // 57 total
    });

    it('accepts exactly 56 characters with C prefix and uppercase base32 body', () => {
        expect(isValidContractAddressShape('C' + 'A'.repeat(55))).toBe(true);
    });

    it('rejects lowercase (regex is uppercase-only, no i flag)', () => {
        expect(isValidContractAddressShape(validContract.toLowerCase())).toBe(false);
        expect(isValidContractAddressShape('c' + 'A'.repeat(55))).toBe(false);
    });

    it('rejects base32-excluded characters 0, 1, 8, 9', () => {
        expect(isValidContractAddressShape('C' + 'A'.repeat(54) + '0')).toBe(false);
        expect(isValidContractAddressShape('C' + 'A'.repeat(54) + '1')).toBe(false);
        expect(isValidContractAddressShape('C' + 'A'.repeat(54) + '8')).toBe(false);
        expect(isValidContractAddressShape('C' + 'A'.repeat(54) + '9')).toBe(false);
    });

    it('rejects whitespace (callers must trim before validating)', () => {
        expect(isValidContractAddressShape(' ' + validContract)).toBe(false);
        expect(isValidContractAddressShape(validContract + ' ')).toBe(false);
        expect(isValidContractAddressShape('  ' + validContract + '  ')).toBe(false);
    });

    // The typeof guard is the only thing standing between the JSON-derived
    // `decoded.address` inputs at googleAuth.ts:90 / oauth.ts:21 and a class
    // of implicit-coercion acceptance. Removing it would let crafted state
    // like `{ address: ["CAAA..."] }` pass via Array.prototype.toString.
    it('rejects non-string inputs without implicit coercion', () => {
        expect(isValidContractAddressShape(null as unknown as string)).toBe(false);
        expect(isValidContractAddressShape(undefined as unknown as string)).toBe(false);
        expect(isValidContractAddressShape(123 as unknown as string)).toBe(false);
        expect(isValidContractAddressShape(true as unknown as string)).toBe(false);
        expect(isValidContractAddressShape([validContract] as unknown as string)).toBe(false);
        expect(
            isValidContractAddressShape({
                toString: () => validContract,
            } as unknown as string),
        ).toBe(false);
    });
});

describe('isValidAccountAddressShape', () => {
    it('accepts a valid account ID', () => {
        expect(isValidAccountAddressShape(validAccount)).toBe(true);
    });

    it('rejects a contract ID (C... prefix)', () => {
        expect(isValidAccountAddressShape(validContract)).toBe(false);
    });

    it('rejects non-string inputs', () => {
        expect(isValidAccountAddressShape(null as unknown as string)).toBe(false);
        expect(isValidAccountAddressShape([validAccount] as unknown as string)).toBe(false);
    });
});

describe('isValidAddressShape', () => {
    it('accepts both contract and account IDs', () => {
        expect(isValidAddressShape(validContract)).toBe(true);
        expect(isValidAddressShape(validAccount)).toBe(true);
    });

    it('rejects unknown prefixes', () => {
        expect(isValidAddressShape('X' + 'A'.repeat(55))).toBe(false);
        expect(isValidAddressShape('M' + 'A'.repeat(55))).toBe(false); // muxed not supported by shape
    });

    it('rejects empty and non-string inputs', () => {
        expect(isValidAddressShape('')).toBe(false);
        expect(isValidAddressShape(null as unknown as string)).toBe(false);
    });
});
