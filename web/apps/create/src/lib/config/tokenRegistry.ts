/**
 * Token registry — the source of truth for known Stellar Asset Contract (SAC)
 * tokens the create flow can pre-fill and search.
 *
 * Each entry is a well-known SAC wrapper for a popular asset on a specific
 * network, on-chain verified via Stellar Expert. To add a token, append an
 * entry — no code changes needed.
 *
 * `getTokenPresets()` is a thin back-compat wrapper used by the step-0
 * quick-launch chips; the picker uses `searchRegistry()` / `getRegistry()`.
 *
 * Zero Stellar SDK dependency — pure static data, SSR-safe. (Checksum
 * validation and CODE:ISSUER → SAC derivation, which need the SDK, live in
 * the picker's import flow and are dynamic-imported there.)
 */

import type { StellarNetworkId } from '@zarf/core/config/runtime';

export type TrustTier = 'curated' | 'imported';

export interface RegistryToken {
    symbol: string;
    name: string;
    /** Classic issuer (G…) for provenance display; absent for native (XLM). */
    issuer?: string;
    sacAddress: string;
    network: StellarNetworkId;
    /** Bundled logo served from static/ (e.g. '/tokens/usdc.svg'). */
    iconUrl?: string;
    trust: TrustTier;
}

const REGISTRY: RegistryToken[] = [
    // ── USDC (Circle) — confirmed on both networks ──────────────────────
    {
        symbol: 'USDC',
        name: 'USD Coin',
        network: 'mainnet',
        sacAddress: 'CCW67TSZV3SSS2HXMBQ5JFGCKJNXKZM7UQUWUZPUTHXSTZLEO7SJMI75',
        iconUrl: '/tokens/usdc.svg',
        trust: 'curated',
    },
    {
        symbol: 'USDC',
        name: 'USD Coin',
        network: 'testnet',
        sacAddress: 'CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA',
        iconUrl: '/tokens/usdc.svg',
        trust: 'curated',
    },
    // ── XLM (native SAC) — both networks confirmed on Stellar Expert ────
    {
        symbol: 'XLM',
        name: 'Stellar Lumens',
        network: 'testnet',
        sacAddress: 'CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC',
        iconUrl: '/tokens/xlm.svg',
        trust: 'curated',
    },
    {
        symbol: 'XLM',
        name: 'Stellar Lumens',
        network: 'mainnet',
        sacAddress: 'CAS3J7GYLGXMF6TDJBBYYSE3HQ6BBSMLNUQ34T6TZMYMW2EVH34XOWMA',
        iconUrl: '/tokens/xlm.svg',
        trust: 'curated',
    },
];

/** All curated tokens for a network. */
export function getRegistry(networkId: StellarNetworkId): RegistryToken[] {
    return REGISTRY.filter((t) => t.network === networkId);
}

/** Look up a curated token by its SAC address (exact match). */
export function getRegistryToken(
    networkId: StellarNetworkId,
    sacAddress: string,
): RegistryToken | undefined {
    return REGISTRY.find((t) => t.network === networkId && t.sacAddress === sacAddress);
}

/**
 * Filter curated tokens by symbol / name substring, or exact SAC address.
 * Empty query returns the full curated list for the network.
 */
export function searchRegistry(networkId: StellarNetworkId, query: string): RegistryToken[] {
    const tokens = getRegistry(networkId);
    const q = query.trim().toLowerCase();
    if (!q) return tokens;
    return tokens.filter(
        (t) =>
            t.symbol.toLowerCase().includes(q) ||
            t.name.toLowerCase().includes(q) ||
            t.sacAddress.toLowerCase() === q,
    );
}

// ── Back-compat: quick-launch presets (step-0 chips) ────────────────────

export interface TokenPreset {
    label: string;
    symbol: string;
    sacAddress: string;
    network: StellarNetworkId;
    iconUrl?: string;
}

/** Curated tokens shaped for the step-0 quick-launch chips. */
export function getTokenPresets(networkId: StellarNetworkId): TokenPreset[] {
    return getRegistry(networkId).map((t) => ({
        label: t.symbol,
        symbol: t.symbol,
        sacAddress: t.sacAddress,
        network: t.network,
        iconUrl: t.iconUrl,
    }));
}
