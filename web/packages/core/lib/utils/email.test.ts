import { describe, expect, it } from 'vitest';
import { isValidEmail, normalizeEmail } from './email';

describe('normalizeEmail', () => {
    it('lowercases and trims', () => {
        expect(normalizeEmail('  Alice@Example.COM ')).toBe('alice@example.com');
    });

    it('strips dots in gmail local parts (Gmail ignores dots)', () => {
        expect(normalizeEmail('Alice.Smith@gmail.com')).toBe('alicesmith@gmail.com');
    });

    it('keeps dots in non-gmail local parts', () => {
        expect(normalizeEmail('alice.smith@example.com')).toBe('alice.smith@example.com');
    });

    it('canonicalizes googlemail.com to gmail.com (same Google account namespace)', () => {
        expect(normalizeEmail('alice@googlemail.com')).toBe('alice@gmail.com');
    });

    it('applies gmail dot-stripping to googlemail addresses too', () => {
        expect(normalizeEmail('Alice.Smith@googlemail.com')).toBe('alicesmith@gmail.com');
    });

    it('produces identical identities for the gmail/googlemail pair a sender might mix up', () => {
        expect(normalizeEmail('a.lice@googlemail.com')).toBe(normalizeEmail('Alice@gmail.com'));
    });

    it('does not rewrite domains that merely contain googlemail.com', () => {
        expect(normalizeEmail('bob@notgooglemail.com.example.org')).toBe(
            'bob@notgooglemail.com.example.org',
        );
    });

    it('strips plus addressing on any domain', () => {
        expect(normalizeEmail('bob+work@example.com')).toBe('bob@example.com');
        expect(normalizeEmail('bob+a+b@gmail.com')).toBe('bob@gmail.com');
    });

    it('handles plus addressing combined with gmail dots', () => {
        expect(normalizeEmail('Bob.Jones+payroll@gmail.com')).toBe('bobjones@gmail.com');
    });
});

describe('isValidEmail', () => {
    it('accepts local@domain.tld', () => {
        expect(isValidEmail('alice@example.com')).toBe(true);
    });

    it('rejects missing tld (a@b)', () => {
        expect(isValidEmail('a@b')).toBe(false);
    });

    it('rejects whitespace and empty values', () => {
        expect(isValidEmail('')).toBe(false);
        expect(isValidEmail('a b@example.com')).toBe(false);
    });
});
