import { describe, expect, it } from 'vitest';

import { normalizeAirdropAddress } from './airdropAddress';

const UPPER = 'GC6TCMKAV55B5M3ESAJZLEJXSD2KF6UGWXCIFZDB7VURMTLYW724ITS4';

describe('normalizeAirdropAddress', () => {
    it('trims and uppercases a Stellar strkey idempotently', () => {
        expect(normalizeAirdropAddress(`  ${UPPER.toLowerCase()}  `)).toBe(UPPER);
        expect(normalizeAirdropAddress(UPPER)).toBe(UPPER);
    });
});
