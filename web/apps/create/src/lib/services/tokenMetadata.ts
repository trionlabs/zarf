/**
 * Stellar token metadata service.
 */

import { readTokenContract } from '@zarf/core/contracts';
import type { StellarContractId } from '@zarf/core/types';
import { isValidContractAddress } from '@zarf/core/utils/address';

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
    if (!isValidContractAddress(tokenAddress)) {
        return {
            success: false,
            data: null,
            error: 'Enter a valid Stellar token contract ID.',
        };
    }

    try {
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
