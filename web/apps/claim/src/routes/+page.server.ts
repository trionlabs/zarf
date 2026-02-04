import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async () => {
    // Vite's import.meta.glob works at build time, replacing fs.readdirSync
    // This is compatible with Cloudflare Workers/Pages
    const distributionFiles = import.meta.glob('/static/distributions/*.json');

    try {
        const addresses = Object.keys(distributionFiles)
            .map(filePath => {
                // filePath will be something like "/static/distributions/0x123...abc.json"
                const fileName = filePath.split('/').pop();
                return fileName;
            })
            .filter((file): file is string => file !== undefined && file.endsWith('.json') && file.startsWith('0x'))
            .map(file => file.replace('.json', '').toLowerCase());

        return {
            vaultAddresses: addresses
        };
    } catch (e) {
        console.error('[ClaimServer] Failed to list distribution files:', e);
        return {
            vaultAddresses: []
        };
    }
};
