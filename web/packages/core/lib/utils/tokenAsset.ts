/**
 * Token query parsing + Stellar Asset Contract (SAC) resolution.
 *
 * Turns user input — a Soroban contract id, a classic `CODE:ISSUER` asset, or
 * native XLM — into a verified SAC contract id.
 *
 * `parseTokenQuery` is pure and SSR-safe (regex/shape only, no SDK).
 * `resolveSac` needs @stellar/stellar-sdk for the StrKey checksum and the
 * `Asset.contractId` derivation, so it dynamic-imports the SDK — keep callers
 * browser-side (the create flow's token picker), never on the SSR path.
 */

import { isValidContractAddressShape, isValidAccountAddressShape } from './addressShape';

export type ParsedTokenQuery =
    | { kind: 'contract'; address: string }
    | { kind: 'classic'; code: string; issuer: string }
    | { kind: 'native' }
    | { kind: 'invalid' };

// Stellar classic asset codes are 1–12 alphanumeric characters.
const ASSET_CODE_RE = /^[A-Za-z0-9]{1,12}$/;

/**
 * Shape-only classification of a token query. Confirms "looks like X"; the
 * real StrKey checksum / SAC derivation happens in `resolveSac`.
 */
export function parseTokenQuery(input: string): ParsedTokenQuery {
    const q = input.trim();
    if (!q) return { kind: 'invalid' };
    if (/^(xlm|native)$/i.test(q)) return { kind: 'native' };
    if (isValidContractAddressShape(q)) return { kind: 'contract', address: q };

    const colon = q.indexOf(':');
    if (colon > 0) {
        const code = q.slice(0, colon);
        const issuer = q.slice(colon + 1).toUpperCase();
        if (ASSET_CODE_RE.test(code) && isValidAccountAddressShape(issuer)) {
            return { kind: 'classic', code, issuer };
        }
    }
    return { kind: 'invalid' };
}

/** Thrown by `resolveSac` for unparseable input or a failed StrKey checksum. */
export class TokenResolveError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'TokenResolveError';
    }
}

/**
 * Resolve a query to a SAC contract id, verifying it on the way:
 * - `contract` → StrKey checksum must pass (rejects lookalike/typo'd ids)
 * - `classic`  → derive `Asset(code, issuer).contractId(passphrase)`
 * - `native`   → derive `Asset.native().contractId(passphrase)`
 *
 * @throws {TokenResolveError} on invalid input or a bad checksum.
 */
export async function resolveSac(input: string, networkPassphrase: string): Promise<string> {
    const parsed = parseTokenQuery(input);
    if (parsed.kind === 'invalid') {
        throw new TokenResolveError('Enter a contract id or CODE:ISSUER asset.');
    }

    const { Asset, StrKey } = await import('@stellar/stellar-sdk');

    if (parsed.kind === 'contract') {
        if (!StrKey.isValidContract(parsed.address)) {
            throw new TokenResolveError('That contract id fails its checksum — check for a typo.');
        }
        return parsed.address;
    }

    const asset = parsed.kind === 'native' ? Asset.native() : new Asset(parsed.code, parsed.issuer);
    return asset.contractId(networkPassphrase);
}
