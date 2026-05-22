import { describe, expect, it } from 'vitest';
import { base64UrlToBase64 } from './base64Url';

describe('base64UrlToBase64', () => {
    it('leaves a length-divisible-by-4 string unchanged in length', () => {
        // 'abcd' is length 4 → no padding needed
        expect(base64UrlToBase64('abcd')).toBe('abcd');
    });

    it("adds '==' when length % 4 === 2", () => {
        expect(base64UrlToBase64('ab')).toBe('ab==');
    });

    it("adds '=' when length % 4 === 3", () => {
        expect(base64UrlToBase64('abc')).toBe('abc=');
    });

    it("replaces '-' with '+' and '_' with '/'", () => {
        // length 4: no padding, only char substitution
        expect(base64UrlToBase64('a-b_')).toBe('a+b/');
    });

    it('round-trips a real unpadded JWT payload segment via atob', () => {
        // {"sub":"1234567890","name":"John Doe","iat":1516239022}
        const segment =
            'eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ';
        const decoded = atob(base64UrlToBase64(segment));
        expect(JSON.parse(decoded)).toMatchObject({
            sub: '1234567890',
            name: 'John Doe',
        });
    });
});
