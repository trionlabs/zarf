/**
 * Token preset definitions for quick-launch chips on step-0.
 *
 * Each preset is a well-known Stellar Asset Contract (SAC) wrapper
 * for a popular token on a specific network. The SAC address wraps
 * a classic Stellar asset as a SEP-41 Soroban token that Zarf can
 * interact with.
 *
 * Addresses are on-chain verified via Stellar Expert API.
 * To add a token, append an entry to PRESETS — no code changes needed.
 *
 * Zero Stellar SDK dependency — pure static data, SSR-safe.
 */

import type { StellarNetworkId } from '@zarf/core/config/runtime';

export interface TokenPreset {
    label: string;
    symbol: string;
    sacAddress: string;
    network: StellarNetworkId;
    /** Optional bundled token logo served from static/ (e.g. '/tokens/usdc.svg'). */
    iconUrl?: string;
}

/**
 * All known token presets. Entries with !verifyPending are not shown
 * until on-chain existence is confirmed.
 */
const PRESETS: TokenPreset[] = [
    // ── USDC (Circle) — confirmed on both networks ──────────────────────
    {
        label: 'USDC',
        symbol: 'USDC',
        network: 'mainnet',
        sacAddress: 'CCW67TSZV3SSS2HXMBQ5JFGCKJNXKZM7UQUWUZPUTHXSTZLEO7SJMI75',
        iconUrl: '/tokens/usdc.svg',
    },
    {
        label: 'USDC',
        symbol: 'USDC',
        network: 'testnet',
        sacAddress: 'CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA',
        iconUrl: '/tokens/usdc.svg',
    },

    // ── XLM (Native SAC) — testnet confirmed, mainnet TBD ──────────────
    {
        label: 'XLM',
        symbol: 'XLM',
        network: 'testnet',
        sacAddress: 'CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC',
        iconUrl: '/tokens/xlm.svg',
    },
    // Mainnet XLM SAC — canonical native wrapper, confirmed live on Stellar Expert.
    // Reproduce with `stellar contract id asset --asset native --network mainnet`.
    {
        label: 'XLM',
        symbol: 'XLM',
        network: 'mainnet',
        sacAddress: 'CAS3J7GYLGXMF6TDJBBYYSE3HQ6BBSMLNUQ34T6TZMYMW2EVH34XOWMA',
        iconUrl: '/tokens/xlm.svg',
    },

    // ── USDT — testnet derived but not on-chain verified, mainnet unknown ──
    // Testnet: derived as CD4HSB4S4TF25WNFTS3SD7V7OWWT73VU7LKRL4VSE4YJ3E6DO4RNRR7P
    //          but Stellar Expert returns 404 (contract not deployed).
    // Mainnet: Stellar Expert returned no `contract` field for
    //          USDT-GCQTGZQQ5G4PTM2GL7CDIFKUBIPEC52BROAQIAPW53XBRJVN6ZJVTG6V.
];

export function getTokenPresets(networkId: StellarNetworkId): TokenPreset[] {
    return PRESETS.filter((p) => p.network === networkId);
}
