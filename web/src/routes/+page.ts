import type { PageLoad } from './$types';

export const load: PageLoad = () => {
    return {
        title: 'Zarf - Privacy-Preserving Token Distribution',
        description:
            'Create token distributions with built-in vesting and privacy-preserving claims using Zero-Knowledge proofs. No KYC required.',
    };
};
