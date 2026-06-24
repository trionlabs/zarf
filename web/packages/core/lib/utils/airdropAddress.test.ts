import { describe, it, expect } from 'vitest';
import { normalizeAirdropAddress } from './airdropAddress';

// A real testnet G-address (canonical uppercase strkey).
const UPPER = 'GC6TCMKAV55B5M3ESAJZLEJXSD2KF6UGWXCIFZDB7VURMTLYW724ITS4';

describe('normalizeAirdropAddress', () => {
    it('trims and UPPERCASEs to the canonical strkey form', () => {
        expect(normalizeAirdropAddress(`  ${UPPER.toLowerCase()}  `)).toBe(UPPER);
        expect(normalizeAirdropAddress(UPPER)).toBe(UPPER); // idempotent
    });

    it('never lowercases (a lowercased strkey throws in Address.fromString)', () => {
        expect(normalizeAirdropAddress(UPPER)).not.toBe(UPPER.toLowerCase());
    });
});
