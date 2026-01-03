import fs from 'fs';
import path from 'path';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async () => {
    const distributionsDir = path.resolve('static/distributions');

    try {
        const files = fs.readdirSync(distributionsDir);
        const addresses = files
            .filter(file => file.endsWith('.json') && file.startsWith('0x'))
            .map(file => file.replace('.json', '').toLowerCase());

        return {
            vaultAddresses: addresses
        };
    } catch (e) {
        console.error('[ClaimServer] Failed to read distributions directory:', e);
        return {
            vaultAddresses: []
        };
    }
};
