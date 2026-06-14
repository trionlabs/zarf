import { describe, expect, it } from 'vitest';
import { Keypair } from '@stellar/stellar-sdk';
import {
    validateClaimList,
    validateCid,
    decodeSignature,
    buildPinAuthMessage,
    sha256Hex,
    buildCorsHeaders,
} from './index';

const HEX64 = '0x' + 'a'.repeat(64);

describe('validateClaimList', () => {
    const valid = { merkleRoot: HEX64, leaves: [HEX64], schedule: {} };

    it('accepts a well-formed claim list', () => {
        expect(validateClaimList(valid)).toBeNull();
    });

    it('rejects a bad merkle root', () => {
        expect(validateClaimList({ ...valid, merkleRoot: '0xbad' })).toBe(
            'missing_or_invalid_merkleRoot',
        );
    });

    it('rejects empty or non-hex leaves', () => {
        expect(validateClaimList({ ...valid, leaves: [] })).toBe('missing_or_empty_leaves');
        expect(validateClaimList({ ...valid, leaves: ['nothex'] })).toBe('invalid_leaf');
    });

    it('rejects a missing schedule and non-objects', () => {
        expect(validateClaimList({ ...valid, schedule: undefined })).toBe('missing_schedule');
        expect(validateClaimList(null)).toBe('not_an_object');
    });
});

describe('validateCid', () => {
    it('accepts CIDv0', () => {
        const cid = 'QmYwAPJzv5CZsnA625s3Xf2nemtYgPpHdWEz79ojWnPbdG';
        expect(validateCid(cid)).toBe(cid);
    });

    it('accepts CIDv1 base32 and strips ipfs://', () => {
        const cid = 'bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi';
        expect(validateCid(`ipfs://${cid}`)).toBe(cid);
    });

    it('rejects path traversal and query/fragment', () => {
        expect(validateCid('QmYwAPJzv5CZsnA625s3Xf2nemtYgPpHdWEz79ojWnPbdG/../secret')).toBeNull();
        expect(validateCid('QmYwAPJzv5CZsnA625s3Xf2nemtYgPpHdWEz79ojWnPbdG?x=1')).toBeNull();
        expect(validateCid('not-a-cid')).toBeNull();
    });
});

describe('decodeSignature', () => {
    it('accepts 64-byte hex (with and without 0x)', () => {
        const hex = 'ab'.repeat(64);
        expect(decodeSignature(hex)?.length).toBe(64);
        expect(decodeSignature('0x' + hex)?.length).toBe(64);
    });

    it('accepts 64-byte base64url', () => {
        const b64 = Buffer.alloc(64, 7).toString('base64url');
        expect(decodeSignature(b64)?.length).toBe(64);
    });

    it('rejects wrong-length and oversized input', () => {
        expect(decodeSignature('ab'.repeat(32))).toBeNull();
        expect(decodeSignature('z'.repeat(600))).toBeNull();
    });
});

describe('SEP-53 pin auth message + signature verification', () => {
    it('a real ed25519 signature over the canonical message verifies, a tampered body does not', async () => {
        const kp = Keypair.random();
        const owner = kp.publicKey();
        const merkleRoot = HEX64;
        const bodyHash = await sha256Hex('{"merkleRoot":"...","leaves":[]}');
        const issuedAt = 1_700_000_000_000;

        const message = buildPinAuthMessage({ owner, merkleRoot, bodyHash, issuedAt });
        const prefixed = new TextEncoder().encode(`Stellar Signed Message:\n${message}`);
        const digest = Buffer.from(await crypto.subtle.digest('SHA-256', prefixed));
        const sig = kp.sign(digest);

        expect(kp.verify(digest, sig)).toBe(true);

        // Tampering the body hash changes the message, so the old signature fails.
        const tampered = buildPinAuthMessage({
            owner,
            merkleRoot,
            bodyHash: await sha256Hex('different body'),
            issuedAt,
        });
        const tamperedDigest = Buffer.from(
            await crypto.subtle.digest(
                'SHA-256',
                new TextEncoder().encode(`Stellar Signed Message:\n${tampered}`),
            ),
        );
        expect(kp.verify(tamperedDigest, sig)).toBe(false);
    });

    it('binds the owner: a different keypair cannot produce a passing signature', async () => {
        const a = Keypair.random();
        const b = Keypair.random();
        const message = buildPinAuthMessage({
            owner: a.publicKey(),
            merkleRoot: HEX64,
            bodyHash: await sha256Hex('x'),
            issuedAt: 1,
        });
        const digest = Buffer.from(
            await crypto.subtle.digest(
                'SHA-256',
                new TextEncoder().encode(`Stellar Signed Message:\n${message}`),
            ),
        );
        const sigByB = b.sign(digest);
        expect(a.verify(digest, sigByB)).toBe(false);
    });
});

describe('buildCorsHeaders', () => {
    const env = {
        ALLOWED_ORIGINS: 'https://create.zarf.to,https://claim.zarf.to',
    } as never;

    it('echoes an allow-listed origin', () => {
        expect(buildCorsHeaders('https://claim.zarf.to', env)['Access-Control-Allow-Origin']).toBe(
            'https://claim.zarf.to',
        );
    });

    it('denies an unknown origin (never wildcard) and sets Vary', () => {
        const headers = buildCorsHeaders('https://evil.example', env);
        expect(headers['Access-Control-Allow-Origin']).toBe('https://create.zarf.to');
        expect(headers['Access-Control-Allow-Origin']).not.toBe('*');
        expect(headers['Vary']).toBe('Origin');
    });

    it('never returns wildcard even when the allow-list is empty', () => {
        const headers = buildCorsHeaders('https://x', { ALLOWED_ORIGINS: '' } as never);
        expect(headers['Access-Control-Allow-Origin']).not.toBe('*');
    });
});
