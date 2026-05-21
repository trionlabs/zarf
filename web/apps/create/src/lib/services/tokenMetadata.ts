/**
 * Stellar token metadata service.
 *
 * The shape-only validator from addressShape keeps SSR module
 * evaluation free of @stellar/stellar-sdk, and the contracts module
 * is dynamic-imported inside fetchTokenMetadata so the StellarSdk +
 * buffer polyfill closure only loads in the browser when the user
 * actually triggers a token lookup.
 */

import type { StellarContractId } from '@zarf/core/types';
import { isValidContractAddressShape } from '@zarf/core/utils/addressShape';

export interface TokenMetadata {
    name: string | null;
    symbol: string | null;
    decimals: number | null;
    totalSupply: string | null;
    logoUrl: string | null;
}

export interface FetchTokenMetadataResult {
    success: boolean;
    data: TokenMetadata | null;
    error: string | null;
}

export async function fetchTokenMetadata(
    tokenAddress: StellarContractId,
): Promise<FetchTokenMetadataResult> {
    if (!isValidContractAddressShape(tokenAddress)) {
        return {
            success: false,
            data: null,
            error: 'Enter a valid Stellar token contract ID.',
        };
    }

    try {
        const { readTokenContract } = await import('@zarf/core/contracts');
        const metadata = await readTokenContract(tokenAddress);
        if (metadata.decimals === null || (!metadata.name && !metadata.symbol)) {
            return {
                success: false,
                data: null,
                error: 'This contract does not expose Stellar token metadata.',
            };
        }

        return { success: true, data: metadata, error: null };
    } catch (error) {
        return {
            success: false,
            data: null,
            error:
                error instanceof Error ? error.message : 'Failed to fetch Stellar token metadata.',
        };
    }
}
