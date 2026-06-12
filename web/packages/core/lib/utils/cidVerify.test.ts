import { describe, expect, it } from 'vitest';
import { readBodyWithLimit, verifyCidAgainstBytes } from './cidVerify';

const enc = new TextEncoder();

// Vectors generated with the kubo dag-pb/UnixFS profile and cross-checked
// against real Pinata pins (the same profile produced the live CIDs
// QmXBpchNn3W9iW1i4YzxYUbdM4FxgJkip67vxM3Leks4uh and
// QmSfeTqzaYTM3DThVmNhSjQ5YXtpFWpyBuhNQFGEMUa2Nt byte-for-byte).
const CONTENT = '{"hello":"zarf"}';
const CID_V0 = 'QmaBGpAyj17HE5dAaadjDVkXtExuW9pxqx1BQP1UbRHA9j';
const CID_V1_DAG_PB = 'bafybeifp4vbdjhnraoeykmxzb7el7u72m3csruq4nn5nbwdbvjutoitahy';
const CID_V1_RAW = 'bafkreiew25w52zabrmzmyh5qwv5oujgcou2fjuzubnlta3v5vk5vhlgvt4';

describe('verifyCidAgainstBytes', () => {
    it('verifies a CIDv0 dag-pb single-block file (Pinata pinJSONToIPFS profile)', async () => {
        await expect(verifyCidAgainstBytes(CID_V0, enc.encode(CONTENT))).resolves.toBe('verified');
    });

    it('verifies a CIDv1 dag-pb CID for the same block', async () => {
        await expect(verifyCidAgainstBytes(CID_V1_DAG_PB, enc.encode(CONTENT))).resolves.toBe(
            'verified',
        );
    });

    it('verifies a CIDv1 raw-codec CID by hashing content directly', async () => {
        await expect(verifyCidAgainstBytes(CID_V1_RAW, enc.encode(CONTENT))).resolves.toBe(
            'verified',
        );
    });

    it('flags tampered content as a mismatch', async () => {
        await expect(verifyCidAgainstBytes(CID_V0, enc.encode('{"hello":"evil"}'))).resolves.toBe(
            'mismatch',
        );
        await expect(verifyCidAgainstBytes(CID_V1_RAW, enc.encode('x'))).resolves.toBe('mismatch');
    });

    it('reports multi-block-sized dag-pb content as unverifiable', async () => {
        const big = new Uint8Array(262_145);
        await expect(verifyCidAgainstBytes(CID_V0, big)).resolves.toBe('unverifiable');
    });

    it('reports unparseable CIDs as unverifiable', async () => {
        await expect(verifyCidAgainstBytes('zarf-stellar-factory-e2e', enc.encode(CONTENT)))
            .resolves.toBe('unverifiable');
        // Right shape, but not valid base58btc payload semantics.
        await expect(
            verifyCidAgainstBytes('b'.padEnd(46, '0'), enc.encode(CONTENT)),
        ).resolves.toBe('unverifiable');
    });
});

describe('readBodyWithLimit', () => {
    it('returns the body when under the limit', async () => {
        const body = enc.encode(CONTENT);
        const result = await readBodyWithLimit(new Response(body), 1024);
        expect(new TextDecoder().decode(result)).toBe(CONTENT);
    });

    it('rejects bodies over the limit without buffering them fully', async () => {
        const big = 'x'.repeat(4096);
        await expect(readBodyWithLimit(new Response(big), 1024)).rejects.toThrow(
            /exceeds 1024 bytes/,
        );
    });

    it('rejects early on an oversized Content-Length header', async () => {
        const response = new Response('tiny', {
            headers: { 'Content-Length': '999999' },
        });
        await expect(readBodyWithLimit(response, 1024)).rejects.toThrow(/exceeds 1024 bytes/);
    });
});
