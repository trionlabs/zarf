import { describe, it, expect } from 'vitest';
import { parseCSV } from './csvProcessor';
import { MAX_EMAIL_LENGTH } from '@zarf/core/constants';

describe('parseCSV — happy path', () => {
    it('parses a `email,amount` row and normalizes the email (lowercase+trim)', () => {
        const { entries, errors } = parseCSV('  Alice@Example.com , 1000 ');
        expect(errors).toEqual([]);
        // amount is the RAW string (carried unchanged to the leaf), not a Number.
        expect(entries).toEqual([{ email: 'alice@example.com', amount: '1000' }]);
    });

    it('skips a real header row (non-numeric amount column)', () => {
        const { entries, errors } = parseCSV('email,amount\nbob@example.com,5');
        expect(errors).toEqual([]);
        expect(entries).toEqual([{ email: 'bob@example.com', amount: '5' }]);
    });

    it('accepts fractional amounts', () => {
        const { entries, errors } = parseCSV('a@b.com,0.5');
        expect(errors).toEqual([]);
        expect(entries).toEqual([{ email: 'a@b.com', amount: '0.5' }]);
    });

    it('preserves a huge integer amount as an exact string (no 2^53 rounding)', () => {
        // 9007199254740993 = 2^53 + 1; Number() would round it to ...992.
        const big = '9007199254740993';
        const { entries, errors } = parseCSV(`whale@example.com,${big}`);
        expect(errors).toEqual([]);
        expect(entries[0].amount).toBe(big); // exact, not 9007199254740992
    });
});

describe('parseCSV — header heuristic does not eat real recipients (review #5)', () => {
    it('does NOT skip a first-row recipient whose address contains a header keyword', () => {
        // `team@amountpartners.com` contains "amount"; the old substring header
        // heuristic silently dropped it. The amount column is numeric, so it is
        // a data row, not a header.
        const { entries, errors } = parseCSV('team@amountpartners.com,500');
        expect(errors).toEqual([]);
        expect(entries).toEqual([{ email: 'team@amountpartners.com', amount: '500' }]);
    });

    it('also keeps numbers@/email-domain recipients on row 0', () => {
        const { entries } = parseCSV('numbers@firm.com,100\npayroll@email.io,250');
        expect(entries.map((e) => e.email)).toEqual(['numbers@firm.com', 'payroll@email.io']);
    });
});

describe('parseCSV — column-count strictness (review #1, #6)', () => {
    it('rejects a thousands-separated amount instead of silently reading "1" (1000x under-allocation)', () => {
        const { entries, errors } = parseCSV('alice@example.com,1,000');
        expect(entries).toEqual([]);
        expect(errors[0]).toMatch(/expected exactly "email,amount"/);
    });

    it('rejects a row with a trailing extra column instead of dropping it', () => {
        const { entries, errors } = parseCSV('alice@example.com,100,note');
        expect(entries).toEqual([]);
        expect(errors[0]).toMatch(/expected exactly "email,amount"/);
    });

    it('rejects a row with a trailing comma', () => {
        const { entries, errors } = parseCSV('bob@example.com,200,');
        expect(entries).toEqual([]);
        expect(errors[0]).toMatch(/expected exactly "email,amount"/);
    });
});

describe('parseCSV — strict amount grammar (review #7)', () => {
    it.each(['1e3', '100abc', 'Infinity', 'NaN', '-5', '0', '0.0', ''])(
        'rejects non-decimal / non-positive amount %j',
        (amt) => {
            const { entries, errors } = parseCSV(`a@b.com,${amt}`);
            expect(entries).toEqual([]);
            expect(errors.length).toBe(1);
        },
    );
});

describe('parseCSV — over-length email guard (review #2)', () => {
    it('rejects an email longer than MAX_EMAIL_LENGTH bytes (would truncate → unclaimable)', () => {
        const local = 'x'.repeat(MAX_EMAIL_LENGTH); // local-part alone exceeds the cap
        const longEmail = `${local}@example.com`;
        expect(new TextEncoder().encode(longEmail).length).toBeGreaterThan(MAX_EMAIL_LENGTH);
        const { entries, errors } = parseCSV(`${longEmail},100`);
        expect(entries).toEqual([]);
        expect(errors[0]).toMatch(/exceeds .* bytes/);
    });

    it('accepts an email exactly at the byte cap', () => {
        const suffix = '@b.co';
        const atCap = 'a'.repeat(MAX_EMAIL_LENGTH - suffix.length) + suffix;
        expect(new TextEncoder().encode(atCap).length).toBe(MAX_EMAIL_LENGTH);
        const { entries, errors } = parseCSV(`${atCap},100`);
        expect(errors).toEqual([]);
        expect(entries.length).toBe(1);
    });
});

describe('parseCSV — invalid email', () => {
    it('rejects a non-email identifier (email-only flow)', () => {
        const { entries, errors } = parseCSV('not-an-email,100');
        expect(entries).toEqual([]);
        expect(errors[0]).toMatch(/Invalid email format/);
    });
});

describe('parseCSV — duplicate reporting (review #4: reported, not silently merged)', () => {
    it('keeps duplicate rows but reports them as errors (which blocks deploy at step-1)', () => {
        const { entries, errors } = parseCSV('dup@x.com,1\ndup@x.com,2');
        expect(entries.length).toBe(2); // total preserved
        expect(errors.some((e) => /Duplicate email found: dup@x.com/.test(e))).toBe(true);
    });
});
