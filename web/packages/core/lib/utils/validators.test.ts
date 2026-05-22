import { describe, expect, it } from 'vitest';
import { StrKey } from '@stellar/stellar-sdk';
import { Buffer } from 'buffer';
import { isValidEmail } from './email';
import { isValidAddress } from './address';

describe('isValidEmail', () => {
    it('accepts well-formed emails', () => {
        expect(isValidEmail('alice@example.com')).toBe(true);
        expect(isValidEmail('bob+tag@gmail.com')).toBe(true);
    });

    it('rejects malformed inputs (regression guard: old csvProcessor copy accepted "aa@b")', () => {
        expect(isValidEmail('')).toBe(false);
        expect(isValidEmail('no-at-sign')).toBe(false);
        expect(isValidEmail('aa@b')).toBe(false); // no TLD
        expect(isValidEmail('a b@c.d')).toBe(false); // whitespace
        expect(isValidEmail(null as unknown as string)).toBe(false);
    });
});

describe('isValidAddress', () => {
    it('accepts Stellar account and contract IDs', () => {
        const account = StrKey.encodeEd25519PublicKey(Buffer.alloc(32, 1));
        const contract = StrKey.encodeContract(Buffer.alloc(32, 2));

        expect(isValidAddress(account)).toBe(true);
        expect(isValidAddress(contract)).toBe(true);
        expect(isValidAddress('0x742d35cc6634c0532925a3b844bc9e7595f0bcb1')).toBe(false);
        expect(isValidAddress('')).toBe(false);
    });
});
