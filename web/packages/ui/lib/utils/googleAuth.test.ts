import { describe, expect, it } from 'vitest';
import {
    recipientNonce,
    encodeOAuthState,
    decodeOAuthState,
    extractTokenFromUrl,
} from './googleAuth';

describe('recipientNonce', () => {
    it('left-pads a short recipient field to 64 lowercase hex chars', () => {
        const nonce = recipientNonce('0xa11ce');
        expect(nonce).toHaveLength(64);
        expect(nonce).toBe('00000000000000000000000000000000000000000000000000000000000a11ce');
    });

    it('lowercases and strips the 0x prefix', () => {
        const nonce = recipientNonce(
            '0x2CB7BBC00ECA803FACCDAF07418C9FC730CE0943828691547B8D0CB13327964F',
        );
        expect(nonce).toBe('2cb7bbc00eca803faccdaf07418c9fc730ce0943828691547b8d0cb13327964f');
    });

    it('accepts a full 64-char field unchanged (already canonical)', () => {
        const hex = '2cb7bbc00eca803faccdaf07418c9fc730ce0943828691547b8d0cb13327964f';
        expect(recipientNonce(hex)).toBe(hex);
    });

    it('matches the circuit decode: nonce decodes back to the recipient', () => {
        // hex(recipient) -> BigInt round-trips, which is exactly what the
        // circuit asserts (acc == recipient).
        const recipient = 0xa11cen;
        const nonce = recipientNonce('0x' + recipient.toString(16));
        expect(BigInt('0x' + nonce)).toBe(recipient);
    });

    it('rejects a value wider than 32 bytes', () => {
        expect(() => recipientNonce('0x' + 'f'.repeat(65))).toThrow();
    });

    it('rejects non-hex input', () => {
        expect(() => recipientNonce('0xnothex')).toThrow();
    });
});

describe('OAuthState round-trip', () => {
    it('encodes and decodes address + targetWallet + resumeStep', () => {
        const address = 'CCTN3XSQM2P7CSXY4UOBGE67DA2Q7IZSRICP3ELKGUQDL5666VDCLXXW';
        const encoded = encodeOAuthState({
            address: address as never,
            targetWallet: 'GWALLET',
            resumeStep: 4,
        });
        expect(encoded).not.toBeNull();
        const decoded = decodeOAuthState(encoded);
        expect(decoded).toMatchObject({
            address,
            targetWallet: 'GWALLET',
            resumeStep: 4,
        });
    });

    it('returns null for malformed state', () => {
        expect(decodeOAuthState('not-base64-$$$')).toBeNull();
        expect(decodeOAuthState(null)).toBeNull();
    });
});

describe('extractTokenFromUrl', () => {
    it('reads id_token from the URL fragment', () => {
        window.location.hash = '#id_token=abc.def.ghi&state=xyz';
        expect(extractTokenFromUrl()).toBe('abc.def.ghi');
        window.location.hash = '';
    });

    it('returns null when no id_token present', () => {
        window.location.hash = '#state=xyz';
        expect(extractTokenFromUrl()).toBeNull();
        window.location.hash = '';
    });
});
