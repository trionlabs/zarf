import { describe, expect, it } from 'vitest';
import { isValidEmail } from './email';
import { isValidAddress } from './address';

describe('isValidEmail', () => {
    it('accepts well-formed emails', () => {
        expect(isValidEmail('alice@example.com')).toBe(true);
        expect(isValidEmail('bob+tag@gmail.com')).toBe(true);
        expect(isValidEmail('user.name@sub.domain.co')).toBe(true);
        expect(isValidEmail('a@b.c')).toBe(true);
    });

    it('rejects malformed emails', () => {
        expect(isValidEmail('')).toBe(false);
        expect(isValidEmail('plain-string')).toBe(false);
        expect(isValidEmail('no-at-sign')).toBe(false);
        expect(isValidEmail('a@b')).toBe(false);            // no dot in domain
        expect(isValidEmail('@example.com')).toBe(false);   // empty local
        expect(isValidEmail('alice@')).toBe(false);          // empty domain
        expect(isValidEmail('alice@.com')).toBe(false);      // empty domain label
        expect(isValidEmail('a b@c.d')).toBe(false);         // whitespace
        expect(isValidEmail('two@@signs.com')).toBe(false);  // double @
    });

    it('rejects non-strings safely', () => {
        expect(isValidEmail(null as unknown as string)).toBe(false);
        expect(isValidEmail(undefined as unknown as string)).toBe(false);
        expect(isValidEmail(42 as unknown as string)).toBe(false);
        expect(isValidEmail({} as unknown as string)).toBe(false);
    });

    it('is stricter than the previous csvProcessor version (regression guard)', () => {
        // The old csvProcessor copy accepted `email.includes('@') && email.length > 3`,
        // which let `aa@b` pass. The canonical version requires a TLD.
        expect(isValidEmail('aa@b')).toBe(false);
    });
});

describe('isValidAddress', () => {
    it('accepts well-formed 0x + 40-hex addresses', () => {
        expect(isValidAddress('0x0000000000000000000000000000000000000000')).toBe(true);
        expect(isValidAddress('0x742d35cc6634c0532925a3b844bc9e7595f0bcb1')).toBe(true);
        expect(isValidAddress('0x742D35CC6634C0532925A3B844BC9E7595F0BCB1')).toBe(true); // upper-case
    });

    it('rejects malformed addresses', () => {
        expect(isValidAddress('')).toBe(false);
        expect(isValidAddress('0x')).toBe(false);
        expect(isValidAddress('0x12345')).toBe(false);              // too short
        expect(isValidAddress('742d35cc6634c0532925a3b844bc9e7595f0bcb1')).toBe(false); // missing 0x
        expect(isValidAddress('0x742d35cc6634c0532925a3b844bc9e7595f0bcb12')).toBe(false); // too long
        expect(isValidAddress('0x742d35cc6634c0532925a3b844bc9e7595f0bcbg')).toBe(false); // non-hex char
    });

    it('rejects non-strings safely', () => {
        expect(isValidAddress(null as unknown as string)).toBe(false);
        expect(isValidAddress(undefined as unknown as string)).toBe(false);
    });
});
