/**
 * Token Metadata Service
 * 
 * Fetches ERC20 token metadata (name, symbol, decimals, logo) from contract address.
 * Uses Alchemy Token API for reliable metadata retrieval.
 * 
 * @module services/tokenMetadata
 */

import { createPublicClient, http, type Address, erc20Abi } from 'viem';
import { mainnet, sepolia, polygon, arbitrum } from 'viem/chains';

// ============================================================================
// Types
// ============================================================================

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

// ============================================================================
// Chain Configuration
// ============================================================================

const SUPPORTED_CHAINS = {
    mainnet: mainnet,
    sepolia: sepolia,
    polygon: polygon,
    arbitrum: arbitrum,
} as const;

type SupportedChainKey = keyof typeof SUPPORTED_CHAINS;

// ============================================================================
// RPC Client Factory
// ============================================================================

function getRpcUrl(chainKey: SupportedChainKey): string {
    // Check environment variables first (Alchemy endpoints)
    if (typeof window !== 'undefined') {
        const envUrls: Partial<Record<SupportedChainKey, string | undefined>> = {
            mainnet: import.meta.env.VITE_MAINNET_RPC_URL,
            sepolia: import.meta.env.VITE_SEPOLIA_RPC_URL,
        };

        console.log('[TokenMetadata] Env URLs:', {
            sepolia: envUrls.sepolia?.substring(0, 50) + '...',
            hasAlchemy: envUrls[chainKey]?.includes('alchemy.com')
        });

        if (envUrls[chainKey]) {
            return envUrls[chainKey]!;
        }
    }

    // Fallback to public RPC endpoints
    const publicRpcUrls: Record<SupportedChainKey, string> = {
        mainnet: 'https://eth.llamarpc.com',
        sepolia: 'https://rpc.sepolia.org',
        polygon: 'https://polygon-rpc.com',
        arbitrum: 'https://arb1.arbitrum.io/rpc',
    };

    console.log('[TokenMetadata] Using fallback public RPC for:', chainKey);
    return publicRpcUrls[chainKey];
}

function getPublicClient(chainKey: SupportedChainKey = 'sepolia') {
    const chain = SUPPORTED_CHAINS[chainKey];
    const rpcUrl = getRpcUrl(chainKey);

    return createPublicClient({
        chain,
        transport: http(rpcUrl),
    });
}

// ============================================================================
// Alchemy Native Token API (Fastest Method)
// ============================================================================

interface AlchemyTokenMetadata {
    name: string;
    symbol: string;
    decimals: number;
    logo: string | null;
}

/**
 * Fetch token metadata using Alchemy's native Token API
 * This is much faster than individual RPC calls
 */
async function fetchFromAlchemyTokenAPI(
    tokenAddress: Address,
    chainKey: SupportedChainKey
): Promise<FetchTokenMetadataResult> {
    const rpcUrl = getRpcUrl(chainKey);

    // Only works with Alchemy RPC URLs
    if (!rpcUrl.includes('alchemy.com')) {
        return { success: false, data: null, error: 'Not an Alchemy URL' };
    }

    console.log('[TokenMetadata] Using Alchemy Token API for:', tokenAddress);

    try {
        const response = await fetch(rpcUrl, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
                id: 1,
                jsonrpc: '2.0',
                method: 'alchemy_getTokenMetadata',
                params: [tokenAddress],
            }),
        });

        const json = await response.json();

        if (json.error) {
            console.log('[TokenMetadata] Alchemy API error:', json.error);
            return { success: false, data: null, error: json.error.message };
        }

        const result = json.result as AlchemyTokenMetadata;
        console.log('[TokenMetadata] Alchemy response:', result);

        if (!result || (!result.name && !result.symbol)) {
            return {
                success: false,
                data: null,
                error: 'Token not found or not a valid ERC20'
            };
        }

        // Strict ERC20 validation: decimals is REQUIRED
        if (result.decimals === null || result.decimals === undefined) {
            return {
                success: false,
                data: null,
                error: 'Contract does not have decimals() function. This is not a valid ERC20 token.'
            };
        }

        return {
            success: true,
            data: {
                name: result.name || null,
                symbol: result.symbol || null,
                decimals: result.decimals ?? null,
                totalSupply: null, // Alchemy API doesn't return totalSupply
                logoUrl: result.logo || null,
            },
            error: null,
        };
    } catch (error) {
        console.error('[TokenMetadata] Alchemy API error:', error);
        return {
            success: false,
            data: null,
            error: error instanceof Error ? error.message : 'Unknown error'
        };
    }
}

// ============================================================================
// API Functions
// ============================================================================

/**
 * Fetch token metadata directly from the blockchain (on-chain)
 * Uses parallel readContract calls for reliability
 */
export async function fetchTokenMetadataOnChain(
    tokenAddress: Address,
    chainKey: SupportedChainKey = 'mainnet'
): Promise<FetchTokenMetadataResult> {
    try {
        const client = getPublicClient(chainKey);

        console.log('[TokenMetadata] Fetching from RPC for:', tokenAddress);

        // Parallel fetch with individual readContract calls (more reliable than multicall)
        const [name, symbol, decimals, totalSupply] = await Promise.all([
            client.readContract({
                address: tokenAddress,
                abi: erc20Abi,
                functionName: 'name',
            }).catch((e) => { console.log('[TokenMetadata] name() failed:', e); return null; }),

            client.readContract({
                address: tokenAddress,
                abi: erc20Abi,
                functionName: 'symbol',
            }).catch((e) => { console.log('[TokenMetadata] symbol() failed:', e); return null; }),

            client.readContract({
                address: tokenAddress,
                abi: erc20Abi,
                functionName: 'decimals',
            }).catch((e) => { console.log('[TokenMetadata] decimals() failed:', e); return null; }),

            client.readContract({
                address: tokenAddress,
                abi: erc20Abi,
                functionName: 'totalSupply',
            }).catch((e) => { console.log('[TokenMetadata] totalSupply() failed:', e); return null; }),
        ]) as [string | null, string | null, number | null, bigint | null];

        console.log('[TokenMetadata] Results:', { name, symbol, decimals, totalSupply: totalSupply?.toString() });

        // Strict ERC20 validation: decimals is REQUIRED for a valid ERC20 token
        // This helps prevent non-ERC20 contracts (like distribution/vesting contracts)
        // that may have name() and symbol() but not decimals()
        if (decimals === null) {
            return {
                success: false,
                data: null,
                error: 'Contract does not have decimals() function. This is not a valid ERC20 token.',
            };
        }

        // Check if we got basic data
        if (!name && !symbol) {
            return {
                success: false,
                data: null,
                error: 'Could not read token data. Address may not be a valid ERC20 contract.',
            };
        }

        // Format total supply with decimals
        let formattedSupply: string | null = null;
        if (totalSupply !== null && decimals !== null) {
            formattedSupply = (Number(totalSupply) / Math.pow(10, decimals)).toLocaleString('en-US', {
                maximumFractionDigits: 2,
            });
        }

        return {
            success: true,
            data: {
                name: name ?? null,
                symbol: symbol ?? null,
                decimals: decimals ?? null,
                totalSupply: formattedSupply,
                logoUrl: null,
            },
            error: null,
        };
    } catch (error) {
        console.error('[TokenMetadata] On-chain fetch failed:', error);
        return {
            success: false,
            data: null,
            error: error instanceof Error ? error.message : 'Unknown error fetching token metadata',
        };
    }
}

/**
 * Fetch token logo from Trust Wallet's token assets repository
 * This is a free API that has logos for most popular tokens
 */
export async function fetchTokenLogo(
    tokenAddress: Address,
    chainKey: SupportedChainKey = 'mainnet'
): Promise<string | null> {
    try {
        // Trust Wallet uses checksummed addresses
        const checksumAddress = tokenAddress; // viem already returns checksummed

        // Chain mapping for Trust Wallet's asset structure
        const trustWalletChainMap: Record<SupportedChainKey, string> = {
            mainnet: 'ethereum',
            sepolia: 'ethereum', // Testnet, likely won't have logos
            polygon: 'polygon',
            arbitrum: 'arbitrum',
        };

        const chain = trustWalletChainMap[chainKey];
        const logoUrl = `https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/${chain}/assets/${checksumAddress}/logo.png`;

        // Check if the image exists
        const response = await fetch(logoUrl, { method: 'HEAD' });
        if (response.ok) {
            return logoUrl;
        }

        return null;
    } catch {
        return null;
    }
}

/**
 * Main function: Fetch complete token metadata
 * Strategy: Alchemy Token API first (fastest), then on-chain RPC fallback
 */
export async function fetchTokenMetadata(
    tokenAddress: Address,
    chainKey: SupportedChainKey = 'mainnet'
): Promise<FetchTokenMetadataResult> {

    // Try Alchemy's native Token API first (fastest)
    const alchemyResult = await fetchFromAlchemyTokenAPI(tokenAddress, chainKey);

    if (alchemyResult.success && alchemyResult.data) {
        console.log('[TokenMetadata] Got data from Alchemy API');

        // Alchemy doesn't return totalSupply, fetch it separately if needed
        if (alchemyResult.data.totalSupply === null) {
            try {
                const client = getPublicClient(chainKey);
                const totalSupply = await client.readContract({
                    address: tokenAddress,
                    abi: erc20Abi,
                    functionName: 'totalSupply',
                }).catch(() => null) as bigint | null;

                if (totalSupply !== null && alchemyResult.data.decimals !== null) {
                    alchemyResult.data.totalSupply = (Number(totalSupply) / Math.pow(10, alchemyResult.data.decimals)).toLocaleString('en-US', {
                        maximumFractionDigits: 2,
                    });
                }
            } catch {
                // Ignore totalSupply fetch error
            }
        }

        return alchemyResult;
    }

    console.log('[TokenMetadata] Alchemy API failed, falling back to on-chain RPC');

    // Fallback to on-chain RPC
    const onChainResult = await fetchTokenMetadataOnChain(tokenAddress, chainKey);

    if (!onChainResult.success || !onChainResult.data) {
        return onChainResult;
    }

    // Skip logo fetch for testnets (no logos available anyway)
    if (chainKey === 'sepolia') {
        return {
            success: true,
            data: {
                ...onChainResult.data,
                logoUrl: null,
            },
            error: null,
        };
    }

    // For mainnet, try to get the logo
    const logoUrl = await fetchTokenLogo(tokenAddress, chainKey);

    return {
        success: true,
        data: {
            ...onChainResult.data,
            logoUrl,
        },
        error: null,
    };
}

/**
 * Validate Ethereum address format
 */
export function isValidAddress(address: string): boolean {
    return /^0x[a-fA-F0-9]{40}$/.test(address);
}
