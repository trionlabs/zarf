import { describe, expect, it } from 'vitest';
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
        expect(isValidEmail('aa@b')).toBe(false);          // no TLD
        expect(isValidEmail('a b@c.d')).toBe(false);       // whitespace
        expect(isValidEmail(null as unknown as string)).toBe(false);
    });
});

describe('isValidAddress', () => {
    it('accepts and rejects 0x+40-hex strings', () => {
        expect(isValidAddress('0x742d35cc6634c0532925a3b844bc9e7595f0bcb1')).toBe(true);
        expect(isValidAddress('0x742D35CC6634C0532925A3B844BC9E7595F0BCB1')).toBe(true);
        expect(isValidAddress('0x12345')).toBe(false);
        expect(isValidAddress('742d35cc6634c0532925a3b844bc9e7595f0bcb1')).toBe(false);  // no 0x
        expect(isValidAddress('')).toBe(false);
    });
});
