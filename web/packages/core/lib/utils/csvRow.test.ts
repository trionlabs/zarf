import { describe, it, expect } from 'vitest';
import { classifyCsvRow } from './csvRow';

const isEmail = (s: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);

describe('classifyCsvRow — shared identifier,amount grammar', () => {
    it('skips blank lines', () => {
        expect(classifyCsvRow('   ', 3, isEmail)).toEqual({ kind: 'skip' });
    });

    it('skips a header row (neither column is data-shaped)', () => {
        expect(classifyCsvRow('email,amount', 0, isEmail)).toEqual({ kind: 'skip' });
        expect(classifyCsvRow('address,amount', 0, () => false)).toEqual({ kind: 'skip' });
    });

    it('does NOT treat a valid first data row as a header', () => {
        expect(classifyCsvRow('a@b.com,100', 0, isEmail)).toEqual({
            kind: 'row',
            identifier: 'a@b.com',
            amountStr: '100',
        });
    });

    it('does NOT skip a first row whose identifier spells a header keyword but has a numeric amount', () => {
        // The substring-matching bug this grammar replaces dropped exactly this.
        expect(classifyCsvRow('team@amountpartners.com,5', 0, isEmail)).toEqual({
            kind: 'row',
            identifier: 'team@amountpartners.com',
            amountStr: '5',
        });
    });

    it('rejects != 2 columns — thousands separator, trailing column, single column', () => {
        expect(classifyCsvRow('a@b.com,1,000', 1, isEmail)).toEqual({ kind: 'badColumns' });
        expect(classifyCsvRow('a@b.com,100,note', 1, isEmail)).toEqual({ kind: 'badColumns' });
        expect(classifyCsvRow('a@b.com', 1, isEmail)).toEqual({ kind: 'badColumns' });
    });

    it('a malformed FIRST data row (valid id, 3 columns) surfaces an error, not a silent header-skip', () => {
        expect(classifyCsvRow('a@b.com,1,000', 0, isEmail)).toEqual({ kind: 'badColumns' });
    });

    it('rejects non-positive / non-decimal amounts with the offending token', () => {
        for (const amt of ['0', '0.0', '-5', '1e3', 'abc', '']) {
            expect(classifyCsvRow(`a@b.com,${amt}`, 1, isEmail)).toEqual({
                kind: 'badAmount',
                amountStr: amt,
            });
        }
    });

    it('returns the RAW amount string (no Number coercion / no 2^53 rounding)', () => {
        expect(classifyCsvRow('a@b.com,9007199254740993', 1, isEmail)).toEqual({
            kind: 'row',
            identifier: 'a@b.com',
            amountStr: '9007199254740993',
        });
    });

    it('trims surrounding whitespace on both columns', () => {
        expect(classifyCsvRow('  a@b.com ,  100  ', 1, isEmail)).toEqual({
            kind: 'row',
            identifier: 'a@b.com',
            amountStr: '100',
        });
    });
});
