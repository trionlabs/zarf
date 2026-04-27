import { describe, expect, it } from 'vitest';
import { sanitizeString } from './distributionDiscovery';

// `sanitizeString` runs on every name/description/symbol read from on-chain
// untrusted input. Locking down the strip-then-truncate semantics matters:
// the name field is what the user sees in their wallet's confirm dialog.

describe('sanitizeString', () => {
    it('strips ASCII control bands (0x00–0x1F and 0x7F–0x9F), then truncates', () => {
        expect(sanitizeString('a\x00b\x07c\x1Fd\x7Fe\x9Ff', 100)).toBe('abcdef');
        // strip-then-truncate: control chars don't count toward maxLength
        expect(sanitizeString('a\x00b\x00c\x00d', 4)).toBe('abcd');
    });

    it('caps at maxLength and handles empty/falsy input', () => {
        expect(sanitizeString('abcdefghij', 5)).toBe('abcde');
        expect(sanitizeString('', 50)).toBe('');
        expect(sanitizeString(null as unknown as string, 50)).toBe('');
    });

    it('locks-in: passes Unicode through and does NOT escape HTML (callers must escape on render)', () => {
        expect(sanitizeString('café 🎁', 50)).toBe('café 🎁');
        expect(sanitizeString('<b>x</b>', 50)).toBe('<b>x</b>');
    });
});
