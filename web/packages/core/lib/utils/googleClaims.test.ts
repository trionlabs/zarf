import { describe, expect, it } from 'vitest';
import type { JWTPayload } from '../types';
import { GOOGLE_ISSUERS, validateGoogleClaims } from './googleClaims';

const basePayload: JWTPayload = {
    email: 'alice@example.com',
    iss: 'https://accounts.google.com',
    aud: 'test-client-id.apps.googleusercontent.com',
    exp: 9999999999,
    iat: 1700000000,
    sub: '1234567890',
    nonce: 'nonce-abc',
};

const clientId = 'test-client-id.apps.googleusercontent.com';

describe('validateGoogleClaims — callback mode', () => {
    it('accepts a payload with matching nonce', () => {
        expect(() =>
            validateGoogleClaims(basePayload, {
                clientId,
                mode: 'callback',
                expectedNonce: 'nonce-abc',
            }),
        ).not.toThrow();
    });

    it('rejects a payload with mismatched nonce', () => {
        expect(() =>
            validateGoogleClaims(basePayload, {
                clientId,
                mode: 'callback',
                expectedNonce: 'different-nonce',
            }),
        ).toThrow(/nonce does not match/);
    });

    it('rejects a payload whose nonce claim is missing entirely', () => {
        const noNonce = { ...basePayload, nonce: undefined };
        expect(() =>
            validateGoogleClaims(noNonce, {
                clientId,
                mode: 'callback',
                expectedNonce: 'nonce-abc',
            }),
        ).toThrow(/nonce does not match/);
    });
});

describe('validateGoogleClaims — restore mode', () => {
    it('accepts a payload without checking nonce', () => {
        const noNonce = { ...basePayload, nonce: undefined };
        expect(() => validateGoogleClaims(noNonce, { clientId, mode: 'restore' })).not.toThrow();
    });

    it('still validates iss + aud', () => {
        const wrongAud = { ...basePayload, aud: 'someone-else' };
        expect(() => validateGoogleClaims(wrongAud, { clientId, mode: 'restore' })).toThrow(
            /audience does not match/,
        );
    });

    it('rejects when clientId is empty (regression: empty aud is not a wildcard)', () => {
        expect(() => validateGoogleClaims(basePayload, { clientId: '', mode: 'restore' })).toThrow(
            /audience does not match/,
        );
    });
});

describe('validateGoogleClaims — issuer + audience (both modes)', () => {
    it('rejects an unknown issuer in callback mode', () => {
        const badIss = { ...basePayload, iss: 'https://evil.example' };
        expect(() =>
            validateGoogleClaims(badIss, {
                clientId,
                mode: 'callback',
                expectedNonce: 'nonce-abc',
            }),
        ).toThrow(/Invalid JWT issuer/);
    });

    it('accepts the bare accounts.google.com issuer (Firebase/newer flows)', () => {
        const bareIss = { ...basePayload, iss: 'accounts.google.com' };
        expect(() =>
            validateGoogleClaims(bareIss, {
                clientId,
                mode: 'callback',
                expectedNonce: 'nonce-abc',
            }),
        ).not.toThrow();
    });

    it('rejects when audience does not match the configured client', () => {
        const wrongAud = { ...basePayload, aud: 'different-client.apps.googleusercontent.com' };
        expect(() =>
            validateGoogleClaims(wrongAud, {
                clientId,
                mode: 'callback',
                expectedNonce: 'nonce-abc',
            }),
        ).toThrow(/audience does not match/);
    });
});

describe('GOOGLE_ISSUERS', () => {
    it('exposes both bare and full-URL forms', () => {
        expect(GOOGLE_ISSUERS.has('https://accounts.google.com')).toBe(true);
        expect(GOOGLE_ISSUERS.has('accounts.google.com')).toBe(true);
    });
});
