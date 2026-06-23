import { describe, it, expect } from 'vitest';
import { leafHash } from '@zarf/core/merkle';
import { parseAirdropCSV, normalizeAirdropAddress } from './airdropCsv';

const UPPER = 'GC6TCMKAV55B5M3ESAJZLEJXSD2KF6UGWXCIFZDB7VURMTLYW724ITS4';

describe('airdrop CSV address normalization (load-bearing — 07 §3.2)', () => {
    it('normalizes to UPPERCASE (never lowercase) and trims', () => {
        expect(normalizeAirdropAddress(`  ${UPPER.toLowerCase()}  `)).toBe(UPPER);
        expect(normalizeAirdropAddress(UPPER)).toBe(UPPER);
    });

    it('a lowercased strkey computes a valid leaf AFTER normalization', () => {
        // The exact bug the fork prevents: the airdrop leaf calls
        // Address.fromString(addr); a lowercased strkey throws there.
        const normalized = normalizeAirdropAddress(UPPER.toLowerCase());
        expect(normalized).toBe(UPPER);
        expect(() => leafHash(0, normalized, '1')).not.toThrow();
        // ...and it equals the canonical uppercase leaf byte-for-byte.
        expect(leafHash(0, normalized, '1')).toBe(leafHash(0, UPPER, '1'));
    });

    it('regression: lowercasing (the vesting behavior) breaks the leaf', () => {
        // Guards against a refactor reintroducing toLowerCase — a lowercased
        // strkey must throw in leafHash, proving why the fork is necessary.
        expect(() => leafHash(0, UPPER.toLowerCase(), '1')).toThrow();
    });
});

describe('parseAirdropCSV', () => {
    it('parses address,amount rows, normalizes case, flags duplicates', () => {
        const csv = `${UPPER},100\n${UPPER.toLowerCase()},50`;
        const { entries, errors } = parseAirdropCSV(csv);
        expect(entries).toHaveLength(2);
        expect(entries[0].address).toBe(UPPER);
        expect(entries[1].address).toBe(UPPER); // lowercased input -> canonical
        expect(errors.some((e) => e.includes('Duplicate'))).toBe(true);
    });

    it('rejects malformed rows and non-positive amounts', () => {
        const { entries, errors } = parseAirdropCSV(`${UPPER},0\nnotanaddress,10\n${UPPER}`);
        expect(entries).toHaveLength(0);
        expect(errors.length).toBeGreaterThanOrEqual(3);
    });

    it('skips a header row', () => {
        const { entries } = parseAirdropCSV(`address,amount\n${UPPER},100`);
        expect(entries).toHaveLength(1);
        expect(entries[0].amount).toBe('100');
    });

    it('preserves large integer amounts exactly as strings (no 2^53 rounding)', () => {
        const big = '123456789012345678'; // > Number.MAX_SAFE_INTEGER
        const { entries, errors } = parseAirdropCSV(`${UPPER},${big}`);
        expect(errors).toHaveLength(0);
        expect(entries[0].amount).toBe(big); // exact; Number(big) would round
    });

    it('rejects exponent-notation amounts', () => {
        const { entries, errors } = parseAirdropCSV(`${UPPER},1e21`);
        expect(entries).toHaveLength(0);
        expect(errors.some((e) => e.includes('positive decimal'))).toBe(true);
    });
});

describe('parseAirdropCSV — column-count strictness (eval finding #1 parity with ZK parser)', () => {
    it('rejects a thousands-separated amount instead of silently reading "1" (1000x under-allocation)', () => {
        // The pre-fix `parts.length < 2` split `addr,1,000` into 3 columns and
        // read amount="1" — a silent 1000x under-allocation baked into an
        // immutable on-chain leaf. Now rejected.
        const { entries, errors } = parseAirdropCSV(`${UPPER},1,000`);
        expect(entries).toHaveLength(0);
        expect(errors[0]).toMatch(/expected "address,amount"/);
    });

    it('rejects a row with a trailing extra column instead of dropping it', () => {
        const { entries, errors } = parseAirdropCSV(`${UPPER},100,note`);
        expect(entries).toHaveLength(0);
        expect(errors[0]).toMatch(/expected "address,amount"/);
    });

    it('keeps a first-row recipient — data-shape header detection, not substring matching', () => {
        // The old `lower.includes('address'|'amount')` heuristic could drop a
        // real first-row strkey whose base32 body spelled those letters; the
        // shared grammar keys on a numeric amount column instead.
        const { entries, errors } = parseAirdropCSV(`${UPPER},100`);
        expect(errors).toHaveLength(0);
        expect(entries).toHaveLength(1);
        expect(entries[0].address).toBe(UPPER);
    });
});
