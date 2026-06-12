/**
 * Zarf Indexer Worker
 *
 * Shared read backend for Stellar/Soroban factory discovery and IPFS metadata.
 * Browsers call this worker instead of each repeating the same RPC simulations.
 *
 * Routes:
 *   GET /health
 *   GET /v1/:network/vestings
 *   GET /v1/:network/vestings/:address
 *   GET /v1/:network/vestings/:address/claimed?commitments=<hex32>,...
 *   GET /v1/:network/vestings/:address/claimed/:commitment
 *   GET /v1/:network/owners/:owner/vestings
 *   GET /v1/ipfs/:cid
 *   GET /v1/ipfs/:cid/email-hashes
 *
 * Read responses are cached at the Cloudflare edge (per-colo) with TTLs
 * matched to each endpoint's volatility; `?refresh=1` skips the cache read
 * but still stores the fresh result. Error responses are never cached.
 */

import {
    Account,
    Address as StellarSdkAddress,
    BASE_FEE,
    Contract,
    StrKey,
    TransactionBuilder,
    nativeToScVal,
    rpc,
    scValToNative,
    xdr,
} from '@stellar/stellar-sdk';
import { readBodyWithLimit, verifyCidAgainstBytes } from '@zarf/core/utils/cidVerify';
import { Buffer } from 'buffer';

interface Env {
    ALLOWED_ORIGINS?: string;
    MAX_CONTRACTS?: string;

    STELLAR_RPC_URL?: string;
    STELLAR_NETWORK_PASSPHRASE?: string;
    STELLAR_FACTORY_ADDRESS?: string;

    STELLAR_TESTNET_RPC_URL?: string;
    STELLAR_TESTNET_NETWORK_PASSPHRASE?: string;
    STELLAR_TESTNET_FACTORY_ADDRESS?: string;

    STELLAR_MAINNET_RPC_URL?: string;
    STELLAR_MAINNET_NETWORK_PASSPHRASE?: string;
    STELLAR_MAINNET_FACTORY_ADDRESS?: string;
}

interface NetworkConfig {
    id: string;
    rpcUrl: string;
    networkPassphrase: string;
    factoryAddress: string;
}

interface VestingContract {
    address: string;
    name: string;
    description: string;
    token: string;
    merkleRoot: string;
    tokenSymbol: string;
    tokenDecimals: number;
    owner: string;
    vestingStart: string;
    cliffDuration: string;
    vestingDuration: string;
    vestingPeriod: string;
    tokenBalance: string;
    metadataCid: string | null;
}

interface VestingSummary {
    name: string;
    description: string;
    token: string;
    merkleRoot: string;
    owner: string;
    metadataCid: string | null;
}

interface DeploymentInfo {
    address: string;
    metadataCid: string | null;
}

class HttpError extends Error {
    constructor(
        public readonly status: number,
        public readonly code: string,
        message: string,
    ) {
        super(message);
        this.name = 'HttpError';
    }
}

const SIMULATION_SOURCE = StrKey.encodeEd25519PublicKey(Buffer.alloc(32));
const TESTNET_PASSPHRASE = 'Test SDF Network ; September 2015';
const MAINNET_PASSPHRASE = 'Public Global Stellar Network ; September 2015';
const IPFS_READ_GATEWAYS = [
    'https://gateway.pinata.cloud/ipfs',
    'https://ipfs.io/ipfs',
    'https://dweb.link/ipfs',
    'https://w3s.link/ipfs',
];
const GATEWAY_TIMEOUT_MS = 5_000;
const MAX_GATEWAY_RESPONSE_BYTES = 8 * 1024 * 1024;
// Each deployment info costs TWO ledger-entry reads (DeploymentAt + MetadataCid)
// on the currently deployed factory, and a simulated transaction's footprint is
// capped at ~100 entries network-wide, so a page of 100 (~202 entries) blows the
// budget once the factory fills a full page. 40 keeps a comfortable margin
// (40×2 + instance + code = 82). Factories built from the current contract
// source pack address+cid into ONE entry per item and cap pages at 80; 40 stays
// valid for both layouts, so leave it until every factory is on the new build.
const FACTORY_RANGE_LIMIT = 40;
const CLAIMED_BATCH_LIMIT = 100;

// Edge-cache TTLs (seconds), sized to each endpoint's volatility.
const CACHE_TTL_IMMUTABLE = 31_536_000; // content-addressed / deterministic responses
const CACHE_TTL_LIST = 60; // factory registry listings
const CACHE_TTL_SUMMARY = 60; // vesting summary (embeds a volatile token balance)
const CACHE_TTL_TOKEN_METADATA = 3_600; // token name/symbol/decimals
const CACHE_TTL_RECIPIENT_ID = 3_600; // deterministic per (contract, recipient)
const CACHE_TTL_LEDGER_LATEST = 5;
const CACHE_TTL_CLAIMED_TRUE = 3_600; // a committed claim never reverts
const CACHE_TTL_CLAIMED_FALSE = 10; // must flip quickly after a claim lands
const CACHE_TTL_UNVERIFIED = 300; // gateway bytes that could not be authenticated against the CID

// Internal marker header: set by IPFS handlers when the served body could not
// be cryptographically verified against its CID (multi-block dag-pb or
// non-sha2-256). withEdgeCache caps the TTL for such responses and the header
// is never forwarded to clients (cache/browser headers are rebuilt from scratch).
const UNVERIFIED_HEADER = 'X-Zarf-Cid-Unverified';

export default {
    async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
        const url = new URL(request.url);
        const origin = request.headers.get('Origin');
        const corsHeaders = buildCorsHeaders(origin, env);
        const cached = (
            ttl: number | ((bodyText: string) => number),
            produce: () => Promise<Response>,
            cacheKeyExtra?: string,
        ) => withEdgeCache(request, ctx, corsHeaders, ttl, produce, cacheKeyExtra);

        if (request.method === 'OPTIONS') {
            return new Response(null, { status: 204, headers: corsHeaders });
        }

        if (request.method !== 'GET') {
            return json({ error: 'method_not_allowed' }, 405, corsHeaders);
        }

        try {
            if (url.pathname === '/health') {
                return json(
                    {
                        ok: true,
                        cache: 'edge',
                    },
                    200,
                    corsHeaders,
                );
            }

            const parts = url.pathname.split('/').filter(Boolean);
            if (parts[0] !== 'v1') {
                return json({ error: 'not_found' }, 404, corsHeaders);
            }

            if (parts[1] === 'ipfs' && parts.length === 3) {
                return await cached(CACHE_TTL_IMMUTABLE, () =>
                    handleIpfsRead(parts[2], corsHeaders),
                );
            }

            if (parts[1] === 'ipfs' && parts.length === 4 && parts[3] === 'email-hashes') {
                return await cached(CACHE_TTL_IMMUTABLE, () =>
                    handleIpfsEmailHashes(parts[2], corsHeaders),
                );
            }

            if (parts.length === 4 && parts[2] === 'ledger' && parts[3] === 'latest') {
                const network = decodeSegment(parts[1]);
                const cfg = getNetworkConfig(env, network);
                return await cached(CACHE_TTL_LEDGER_LATEST, () =>
                    handleLatestLedger(cfg, corsHeaders),
                );
            }

            if (parts.length === 6 && parts[2] === 'factory' && parts[3] === 'predict') {
                const network = decodeSegment(parts[1]);
                const cfg = getNetworkConfig(env, network);
                const owner = decodeSegment(parts[4]);
                const salt = decodeSegment(parts[5]);
                // The prediction is deterministic per (factory, owner, salt) but the
                // active factory address lives in env, not the URL — fold it into
                // the cache key so a factory redeploy cannot serve year-stale entries.
                return await cached(
                    CACHE_TTL_IMMUTABLE,
                    () => handlePredictVestingAddress(owner, salt, cfg, corsHeaders),
                    cfg.factoryAddress,
                );
            }

            if (parts.length >= 3 && parts[2] === 'vestings') {
                const network = decodeSegment(parts[1]);
                const cfg = getNetworkConfig(env, network);
                if (parts.length === 3) {
                    return await cached(CACHE_TTL_LIST, () => handleAllVestings(cfg, corsHeaders));
                }
                if (parts.length === 4) {
                    const address = decodeSegment(parts[3]);
                    return await cached(CACHE_TTL_SUMMARY, () =>
                        handleVesting(address, cfg, corsHeaders),
                    );
                }
                if (parts.length === 5 && parts[4] === 'claimed') {
                    // Batched claim-status reads are per-user commitment sets:
                    // edge caching them would never hit, so they stay uncached.
                    const address = decodeSegment(parts[3]);
                    return await handleEpochsClaimedBatch(address, url, cfg, corsHeaders);
                }
                if (parts.length === 6 && parts[4] === 'claimed') {
                    const address = decodeSegment(parts[3]);
                    const commitment = decodeSegment(parts[5]);
                    return await cached(claimedResponseTtl, () =>
                        handleEpochClaimed(address, commitment, cfg, corsHeaders),
                    );
                }
                if (parts.length === 6 && parts[4] === 'recipient-id') {
                    const address = decodeSegment(parts[3]);
                    const recipient = decodeSegment(parts[5]);
                    return await cached(CACHE_TTL_RECIPIENT_ID, () =>
                        handleRecipientId(address, recipient, cfg, corsHeaders),
                    );
                }
            }

            if (parts.length >= 4 && parts[2] === 'tokens') {
                const network = decodeSegment(parts[1]);
                const cfg = getNetworkConfig(env, network);
                const token = decodeSegment(parts[3]);
                if (parts.length === 4) {
                    return await cached(CACHE_TTL_TOKEN_METADATA, () =>
                        handleTokenMetadata(token, cfg, corsHeaders),
                    );
                }
                if (parts.length === 6 && parts[4] === 'balances') {
                    // Balances/allowances gate create-flow approvals and must
                    // reflect just-submitted transactions; never cache them.
                    const owner = decodeSegment(parts[5]);
                    return await handleTokenBalance(token, owner, cfg, corsHeaders);
                }
                if (parts.length === 7 && parts[4] === 'allowances') {
                    const owner = decodeSegment(parts[5]);
                    const spender = decodeSegment(parts[6]);
                    return await handleTokenAllowance(token, owner, spender, cfg, corsHeaders);
                }
            }

            if (parts.length === 5 && parts[2] === 'owners' && parts[4] === 'vestings') {
                const network = decodeSegment(parts[1]);
                const owner = decodeSegment(parts[3]);
                const cfg = getNetworkConfig(env, network);
                return await cached(CACHE_TTL_LIST, () =>
                    handleOwnerVestings(owner, url, env, cfg, corsHeaders),
                );
            }

            return json({ error: 'not_found' }, 404, corsHeaders);
        } catch (error) {
            if (error instanceof HttpError) {
                return json(
                    { error: error.code, message: error.message },
                    error.status,
                    corsHeaders,
                );
            }

            console.error('[Indexer] Unhandled error:', error);
            return json({ error: 'indexer_error' }, 500, corsHeaders);
        }
    },
};

/**
 * Edge-cache wrapper around a route handler.
 *
 * Responses are stored WITHOUT CORS headers: Access-Control-Allow-Origin is
 * per-request while the cache key is URL-only (the Cache API does not honor
 * Vary), so CORS headers are re-applied on every hit. `?refresh=1` skips the
 * cache read but still stores the fresh result; it is stripped from the cache
 * key so refreshed fills warm the shared entry. Non-200 responses and thrown
 * errors are never cached.
 */
async function withEdgeCache(
    request: Request,
    ctx: ExecutionContext,
    corsHeaders: Record<string, string>,
    ttl: number | ((bodyText: string) => number),
    produce: () => Promise<Response>,
    cacheKeyExtra?: string,
): Promise<Response> {
    const url = new URL(request.url);
    const bypass = url.searchParams.get('refresh') !== null;
    url.searchParams.delete('refresh');
    if (cacheKeyExtra) url.searchParams.set('cachekey', cacheKeyExtra);
    const cacheKey = new Request(url.toString(), { method: 'GET' });
    const cache = caches.default;

    if (!bypass) {
        const hit = await cache.match(cacheKey);
        if (hit) {
            const headers = new Headers(hit.headers);
            for (const [key, value] of Object.entries(corsHeaders)) headers.set(key, value);
            return new Response(hit.body, { status: hit.status, headers });
        }
    }

    const fresh = await produce();
    if (fresh.status !== 200) return fresh;

    const bodyText = await fresh.text();
    let maxAge = typeof ttl === 'function' ? ttl(bodyText) : ttl;
    if (fresh.headers.get(UNVERIFIED_HEADER) === '1') {
        maxAge = Math.min(maxAge, CACHE_TTL_UNVERIFIED);
    }
    const baseHeaders = {
        'Content-Type': fresh.headers.get('Content-Type') ?? 'application/json',
        'Cache-Control':
            maxAge >= CACHE_TTL_IMMUTABLE
                ? `public, max-age=${maxAge}, immutable`
                : `public, max-age=${maxAge}`,
    };

    if (maxAge > 0) {
        // put() can reject (e.g. oversized bodies); never let that surface as
        // an unhandled rejection — the response has already been served.
        ctx.waitUntil(
            cache
                .put(cacheKey, new Response(bodyText, { status: 200, headers: baseHeaders }))
                .catch(() => {}),
        );
    }

    // Force-refresh responses must not land in the BROWSER's HTTP cache either,
    // or a second refresh within the TTL would be served stale without ever
    // reaching the worker. The edge entry above still gets warmed.
    const browserHeaders = bypass ? { ...baseHeaders, 'Cache-Control': 'no-store' } : baseHeaders;
    return new Response(bodyText, { status: 200, headers: { ...browserHeaders, ...corsHeaders } });
}

function claimedResponseTtl(bodyText: string): number {
    try {
        const parsed = JSON.parse(bodyText) as { claimed?: unknown };
        return parsed.claimed === true ? CACHE_TTL_CLAIMED_TRUE : CACHE_TTL_CLAIMED_FALSE;
    } catch {
        return 0;
    }
}

async function handleAllVestings(
    cfg: NetworkConfig,
    corsHeaders: Record<string, string>,
): Promise<Response> {
    const deployments = await fetchDeploymentInfos(cfg);
    return json(
        {
            vestings: deployments.map(({ address, metadataCid }) => ({
                address,
                metadataCid,
            })),
            total: deployments.length,
            fetchedAt: Date.now(),
        },
        200,
        corsHeaders,
    );
}

async function handleOwnerVestings(
    owner: string,
    url: URL,
    env: Env,
    cfg: NetworkConfig,
    corsHeaders: Record<string, string>,
): Promise<Response> {
    assertAddress(owner, 'owner');

    const maxContracts = readMaxContracts(url, env);
    const deployments = await fetchOwnerDeploymentInfos(cfg, owner);
    const contracts = await Promise.all(
        deployments.slice(0, maxContracts).map(async ({ address }) => {
            try {
                return await getVestingContract(cfg, address);
            } catch (error) {
                console.warn(`[Indexer] Failed to read vesting ${address}:`, error);
                return null;
            }
        }),
    );

    return json(
        {
            contracts: contracts.filter(
                (contract): contract is VestingContract => contract !== null,
            ),
            total: deployments.length,
            fetchedAt: Date.now(),
        },
        200,
        corsHeaders,
    );
}

async function handleVesting(
    address: string,
    cfg: NetworkConfig,
    corsHeaders: Record<string, string>,
): Promise<Response> {
    assertAddress(address, 'vesting address');

    return json(await getVestingContract(cfg, address), 200, corsHeaders);
}

async function handleIpfsRead(
    rawCid: string,
    corsHeaders: Record<string, string>,
): Promise<Response> {
    const cid = validateCid(decodeSegment(rawCid));
    const { data, verification } = await fetchIpfsJson(cid);
    return json(data, 200, withVerificationMarker(corsHeaders, verification));
}

function withVerificationMarker(
    headers: Record<string, string>,
    verification: 'verified' | 'unverifiable',
): Record<string, string> {
    return verification === 'unverifiable' ? { ...headers, [UNVERIFIED_HEADER]: '1' } : headers;
}

async function handleLatestLedger(
    cfg: NetworkConfig,
    corsHeaders: Record<string, string>,
): Promise<Response> {
    return json(
        {
            sequence: await getLatestLedgerSequence(cfg),
            fetchedAt: Date.now(),
        },
        200,
        corsHeaders,
    );
}

async function handlePredictVestingAddress(
    owner: string,
    salt: string,
    cfg: NetworkConfig,
    corsHeaders: Record<string, string>,
): Promise<Response> {
    assertAddress(owner, 'owner');
    validateHex32(salt, 'salt');

    return json(
        {
            address: await predictVestingAddress(cfg, owner, salt),
            fetchedAt: Date.now(),
        },
        200,
        corsHeaders,
    );
}

async function handleEpochClaimed(
    address: string,
    commitment: string,
    cfg: NetworkConfig,
    corsHeaders: Record<string, string>,
): Promise<Response> {
    assertAddress(address, 'vesting address');
    validateHex32(commitment, 'epoch commitment');

    return json(
        {
            claimed: await isEpochClaimed(cfg, address, commitment),
            fetchedAt: Date.now(),
        },
        200,
        corsHeaders,
    );
}

async function handleEpochsClaimedBatch(
    address: string,
    url: URL,
    cfg: NetworkConfig,
    corsHeaders: Record<string, string>,
): Promise<Response> {
    assertAddress(address, 'vesting address');

    const commitments = (url.searchParams.get('commitments') ?? '')
        .split(',')
        .map((value) => value.trim())
        .filter(Boolean);
    if (commitments.length === 0) {
        throw new HttpError(
            400,
            'invalid_commitments',
            'Provide ?commitments=<hex32>[,<hex32>...]',
        );
    }
    if (commitments.length > CLAIMED_BATCH_LIMIT) {
        throw new HttpError(
            400,
            'too_many_commitments',
            `At most ${CLAIMED_BATCH_LIMIT} commitments per request`,
        );
    }
    for (const commitment of commitments) {
        validateHex32(commitment, 'epoch commitment');
    }

    return json(
        {
            claimed: Object.fromEntries(await readClaimedFlags(cfg, address, commitments)),
            fetchedAt: Date.now(),
        },
        200,
        corsHeaders,
    );
}

async function handleIpfsEmailHashes(
    rawCid: string,
    corsHeaders: Record<string, string>,
): Promise<Response> {
    const cid = validateCid(decodeSegment(rawCid));
    const { data: doc, verification } = await fetchIpfsJson(cid);
    const candidate =
        typeof doc === 'object' && doc !== null
            ? (doc as { emailHashes?: unknown }).emailHashes
            : undefined;
    // null = the distribution has no email gating (visible to everyone).
    const emailHashes = Array.isArray(candidate)
        ? candidate.filter((hash): hash is string => typeof hash === 'string')
        : null;

    return json(
        { emailHashes, fetchedAt: Date.now() },
        200,
        withVerificationMarker(corsHeaders, verification),
    );
}

async function handleRecipientId(
    address: string,
    recipient: string,
    cfg: NetworkConfig,
    corsHeaders: Record<string, string>,
): Promise<Response> {
    assertAddress(address, 'vesting address');
    assertAddress(recipient, 'recipient');

    return json(
        {
            recipientId: await recipientId(cfg, address, recipient),
            fetchedAt: Date.now(),
        },
        200,
        corsHeaders,
    );
}

async function handleTokenMetadata(
    token: string,
    cfg: NetworkConfig,
    corsHeaders: Record<string, string>,
): Promise<Response> {
    assertAddress(token, 'token address');

    return json(await readTokenContract(cfg, token), 200, corsHeaders);
}

async function handleTokenBalance(
    token: string,
    owner: string,
    cfg: NetworkConfig,
    corsHeaders: Record<string, string>,
): Promise<Response> {
    assertAddress(token, 'token address');
    assertAddress(owner, 'owner');

    return json(
        {
            balance: (await getTokenBalance(cfg, token, owner)).toString(),
            fetchedAt: Date.now(),
        },
        200,
        corsHeaders,
    );
}

async function handleTokenAllowance(
    token: string,
    owner: string,
    spender: string,
    cfg: NetworkConfig,
    corsHeaders: Record<string, string>,
): Promise<Response> {
    assertAddress(token, 'token address');
    assertAddress(owner, 'owner');
    assertAddress(spender, 'spender');

    return json(
        {
            allowance: (await getTokenAllowance(cfg, token, owner, spender)).toString(),
            fetchedAt: Date.now(),
        },
        200,
        corsHeaders,
    );
}

async function getVestingContract(cfg: NetworkConfig, address: string): Promise<VestingContract> {
    const metadata = await readVestingContract(cfg, address);
    const tokenBalance = await getTokenBalance(cfg, metadata.token, address).catch((error) => {
        console.warn(`[Indexer] Failed to fetch token balance for ${address}:`, error);
        return 0n;
    });

    return {
        address,
        name: sanitizeString(metadata.name || 'Unknown Distribution', 50),
        description: sanitizeString(metadata.description || '', 200),
        token: metadata.token,
        merkleRoot: metadata.merkleRoot,
        tokenSymbol: sanitizeString(metadata.tokenSymbol || 'XLM', 10),
        tokenDecimals: metadata.tokenDecimals,
        owner: metadata.owner,
        vestingStart: '0',
        cliffDuration: '0',
        vestingDuration: '0',
        vestingPeriod: '0',
        tokenBalance: tokenBalance.toString(),
        metadataCid: metadata.metadataCid,
    };
}

async function fetchDeploymentInfos(cfg: NetworkConfig): Promise<DeploymentInfo[]> {
    const count = await getDeploymentCount(cfg);
    return fetchDeploymentInfoRanges(count, (start, limit) =>
        getDeploymentInfos(cfg, start, limit),
    );
}

async function fetchOwnerDeploymentInfos(
    cfg: NetworkConfig,
    owner: string,
): Promise<DeploymentInfo[]> {
    const count = await getOwnerDeploymentCount(cfg, owner);
    return fetchDeploymentInfoRanges(count, (start, limit) =>
        getOwnerDeploymentInfos(cfg, owner, start, limit),
    );
}

async function fetchDeploymentInfoRanges(
    count: number,
    readRange: (start: number, limit: number) => Promise<DeploymentInfo[]>,
): Promise<DeploymentInfo[]> {
    if (count === 0) return [];

    const chunks = Array.from({ length: Math.ceil(count / FACTORY_RANGE_LIMIT) }, (_, chunk) => {
        const start = chunk * FACTORY_RANGE_LIMIT;
        return readRange(start, Math.min(FACTORY_RANGE_LIMIT, count - start));
    });
    const results = await Promise.all(chunks);
    return results.flat();
}

async function readVestingContract(
    cfg: NetworkConfig,
    address: string,
): Promise<
    VestingSummary & {
        tokenSymbol: string;
        tokenDecimals: number;
    }
> {
    const summary = parseVestingSummary(await simulate(cfg, address, 'summary'));
    const tokenAddress = summary.token;
    let tokenSymbol = 'XLM';
    let tokenDecimals = 7;
    try {
        const [symbol, decimals] = await Promise.all([
            simulate(cfg, tokenAddress, 'symbol'),
            simulate(cfg, tokenAddress, 'decimals'),
        ]);
        tokenSymbol = String(scValToNative(symbol));
        tokenDecimals = Number(scValToNative(decimals));
    } catch {
        // Token display metadata is optional. The vesting metadata remains valid.
    }

    return {
        ...summary,
        tokenSymbol,
        tokenDecimals,
    };
}

async function getTokenBalance(
    cfg: NetworkConfig,
    tokenAddress: string,
    owner: string,
): Promise<bigint> {
    return scValToBigInt(await simulate(cfg, tokenAddress, 'balance', [scAddress(owner)]));
}

async function readTokenContract(
    cfg: NetworkConfig,
    tokenAddress: string,
): Promise<{
    name: string | null;
    symbol: string | null;
    decimals: number | null;
    totalSupply: string | null;
    logoUrl: string | null;
}> {
    const [name, symbol, decimals] = await Promise.all([
        simulate(cfg, tokenAddress, 'name').catch(() => null),
        simulate(cfg, tokenAddress, 'symbol').catch(() => null),
        simulate(cfg, tokenAddress, 'decimals').catch(() => null),
    ]);

    return {
        name: name ? String(scValToNative(name)) : null,
        symbol: symbol ? String(scValToNative(symbol)) : null,
        decimals: decimals ? Number(scValToNative(decimals)) : null,
        totalSupply: null,
        logoUrl: null,
    };
}

async function getTokenAllowance(
    cfg: NetworkConfig,
    tokenAddress: string,
    owner: string,
    spender: string,
): Promise<bigint> {
    return scValToBigInt(
        await simulate(cfg, tokenAddress, 'allowance', [scAddress(owner), scAddress(spender)]),
    );
}

async function recipientId(
    cfg: NetworkConfig,
    contractAddress: string,
    recipient: string,
): Promise<`0x${string}`> {
    const result = await simulate(cfg, contractAddress, 'recipient_id', [scAddress(recipient)]);
    return bytesToHex(scValToNative(result));
}

async function isEpochClaimed(
    cfg: NetworkConfig,
    contractAddress: string,
    epochCommitment: string,
): Promise<boolean> {
    const result = await simulate(cfg, contractAddress, 'is_claimed', [
        scBytesN32(epochCommitment),
    ]);
    return Boolean(scValToNative(result));
}

/**
 * Read the vesting contract's persistent `Claimed(commitment)` entries with a
 * single `getLedgerEntries` RPC call instead of one `is_claimed` simulation
 * per commitment. An absent entry means never claimed: a COMMITTED `Claimed`
 * entry is always `true` (the contract's `false` writes happen only on error
 * paths whose transactions revert), and the value is decoded rather than
 * inferred from presence as defense in depth.
 */
async function readClaimedFlags(
    cfg: NetworkConfig,
    contractAddress: string,
    commitments: string[],
): Promise<Map<string, boolean>> {
    const flags = new Map(commitments.map((commitment) => [commitment, false]));
    const keys = commitments.map((commitment) => claimedLedgerKey(contractAddress, commitment));
    const commitmentByKey = new Map(
        keys.map((key, index) => [key.toXDR('base64'), commitments[index]]),
    );

    let response: rpc.Api.GetLedgerEntriesResponse;
    try {
        response = await new rpc.Server(cfg.rpcUrl).getLedgerEntries(...keys);
    } catch (error) {
        throw new HttpError(502, 'rpc_ledger_entries_error', (error as Error).message);
    }

    // getLedgerEntries omits absent keys and does not preserve request order,
    // so returned entries are matched back to commitments by their key XDR.
    for (const entry of response.entries) {
        const commitment = commitmentByKey.get(entry.key.toXDR('base64'));
        if (!commitment) continue;
        flags.set(commitment, Boolean(scValToNative(entry.val.contractData().val())));
    }
    return flags;
}

function claimedLedgerKey(contractAddress: string, commitment: string): xdr.LedgerKey {
    // Mirrors the contract's `DataKey::Claimed(BytesN<32>)`: a contracttype
    // enum tuple variant is stored as ScVec([Symbol(variant), payload]).
    return xdr.LedgerKey.contractData(
        new xdr.LedgerKeyContractData({
            contract: StellarSdkAddress.fromString(contractAddress).toScAddress(),
            key: xdr.ScVal.scvVec([
                xdr.ScVal.scvSymbol('Claimed'),
                xdr.ScVal.scvBytes(hexToBuffer(commitment, 32)),
            ]),
            durability: xdr.ContractDataDurability.persistent(),
        }),
    );
}

async function predictVestingAddress(
    cfg: NetworkConfig,
    owner: string,
    salt: string,
): Promise<string> {
    const result = await simulate(cfg, cfg.factoryAddress, 'predict_vesting_address', [
        scAddress(owner),
        scBytesN32(salt),
    ]);
    return StellarSdkAddress.fromScVal(result).toString();
}

async function getLatestLedgerSequence(cfg: NetworkConfig): Promise<number> {
    const latest = await new rpc.Server(cfg.rpcUrl).getLatestLedger();
    return latest.sequence;
}

async function getDeploymentCount(cfg: NetworkConfig): Promise<number> {
    const result = await simulate(cfg, cfg.factoryAddress, 'get_deployment_count');
    return Number(scValToNative(result));
}

async function getDeploymentInfos(
    cfg: NetworkConfig,
    start: number,
    limit: number,
): Promise<DeploymentInfo[]> {
    const result = await simulate(cfg, cfg.factoryAddress, 'get_deployment_infos', [
        scU32(start),
        scU32(limit),
    ]);
    return parseDeploymentInfoVec(result);
}

async function getOwnerDeploymentCount(cfg: NetworkConfig, owner: string): Promise<number> {
    const result = await simulate(cfg, cfg.factoryAddress, 'get_owner_deployment_count', [
        scAddress(owner),
    ]);
    return Number(scValToNative(result));
}

async function getOwnerDeploymentInfos(
    cfg: NetworkConfig,
    owner: string,
    start: number,
    limit: number,
): Promise<DeploymentInfo[]> {
    const result = await simulate(cfg, cfg.factoryAddress, 'get_owner_deployment_infos', [
        scAddress(owner),
        scU32(start),
        scU32(limit),
    ]);
    return parseDeploymentInfoVec(result);
}

async function simulate(
    cfg: NetworkConfig,
    contractId: string,
    method: string,
    args: xdr.ScVal[] = [],
): Promise<xdr.ScVal> {
    const tx = new TransactionBuilder(new Account(SIMULATION_SOURCE, '0'), {
        fee: BASE_FEE,
        networkPassphrase: cfg.networkPassphrase,
    })
        .setTimeout(30)
        .addOperation(new Contract(contractId).call(method, ...args))
        .build();

    const result = await new rpc.Server(cfg.rpcUrl).simulateTransaction(tx);
    if (rpc.Api.isSimulationError(result)) {
        throw new HttpError(502, 'rpc_simulation_error', result.error);
    }
    if (!result.result) {
        throw new HttpError(502, 'rpc_empty_result', `No simulation result for ${method}`);
    }
    return result.result.retval;
}

function parseVestingSummary(value: xdr.ScVal): VestingSummary {
    const fields = scMap(value, 'vesting summary');
    const metadataCid = scString(scMapField(fields, 'metadata_cid'));
    return {
        name: scString(scMapField(fields, 'name')),
        description: scString(scMapField(fields, 'description')),
        owner: StellarSdkAddress.fromScVal(scMapField(fields, 'owner')).toString(),
        token: StellarSdkAddress.fromScVal(scMapField(fields, 'token')).toString(),
        merkleRoot: bytesToHex(scValToNative(scMapField(fields, 'merkle_root'))),
        metadataCid: metadataCid.length > 0 ? metadataCid : null,
    };
}

function parseDeploymentInfoVec(value: xdr.ScVal): DeploymentInfo[] {
    const values = value.vec();
    if (!values) return [];
    return values.map(parseDeploymentInfo);
}

function parseDeploymentInfo(value: xdr.ScVal): DeploymentInfo {
    const fields = scMap(value, 'deployment info');
    const metadataCid = scString(scMapField(fields, 'metadata_cid'));
    return {
        address: StellarSdkAddress.fromScVal(scMapField(fields, 'address')).toString(),
        metadataCid: metadataCid.length > 0 ? metadataCid : null,
    };
}

function scMap(value: xdr.ScVal, label: string): Map<string, xdr.ScVal> {
    const entries = value.map();
    if (!entries) {
        throw new HttpError(502, 'invalid_contract_response', `Invalid ${label}`);
    }

    const fields = new Map<string, xdr.ScVal>();
    for (const entry of entries) {
        const key = scString(entry.key());
        fields.set(key, entry.val());
    }
    return fields;
}

function scMapField(fields: Map<string, xdr.ScVal>, key: string): xdr.ScVal {
    const value = fields.get(key);
    if (!value) {
        throw new HttpError(502, 'invalid_contract_response', `Missing contract field: ${key}`);
    }
    return value;
}

function scString(value: xdr.ScVal): string {
    const native = scValToNative(value);
    if (typeof native === 'string') return native;
    if (Buffer.isBuffer(native)) return native.toString('utf8');
    return String(native);
}

interface IpfsJsonResult {
    data: unknown;
    verification: 'verified' | 'unverifiable';
}

async function fetchIpfsJson(cid: string): Promise<IpfsJsonResult> {
    const errors: string[] = [];
    for (const gateway of IPFS_READ_GATEWAYS) {
        try {
            return await fetchJsonFromGateway(gateway, cid);
        } catch (error) {
            errors.push(`${gateway}: ${(error as Error).message}`);
        }
    }

    throw new HttpError(
        502,
        'ipfs_gateway_error',
        `All IPFS gateways failed for ${cid}: ${errors.join('; ')}`,
    );
}

async function fetchJsonFromGateway(gateway: string, cid: string): Promise<IpfsJsonResult> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), GATEWAY_TIMEOUT_MS);

    try {
        const response = await fetch(`${gateway}/${cid}`, {
            headers: { Accept: 'application/json' },
            signal: controller.signal,
        });
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }

        // This worker is the trusted proxy for every browser client, so
        // gateway bytes must be authenticated against the CID before they
        // are served onward (see cidVerify for the trust model).
        const bytes = await readBodyWithLimit(response, MAX_GATEWAY_RESPONSE_BYTES);
        const verification = await verifyCidAgainstBytes(cid, bytes);
        if (verification === 'mismatch') {
            throw new Error('content hash does not match CID');
        }
        if (verification === 'unverifiable') {
            console.warn(`[Indexer] Unverifiable gateway response accepted for ${cid}`);
        }

        return {
            data: JSON.parse(new TextDecoder().decode(bytes)),
            verification,
        };
    } finally {
        clearTimeout(timer);
    }
}

function getNetworkConfig(env: Env, network: string): NetworkConfig {
    const envMap = env as Record<string, string | undefined>;
    const id = network.toLowerCase();
    const prefix = `STELLAR_${id.toUpperCase().replace(/[^A-Z0-9]/g, '_')}_`;
    const rpcUrl =
        envMap[`${prefix}RPC_URL`] ?? (id === 'testnet' ? env.STELLAR_RPC_URL : undefined);
    const factoryAddress =
        envMap[`${prefix}FACTORY_ADDRESS`] ??
        (id === 'testnet' ? env.STELLAR_FACTORY_ADDRESS : undefined);
    const networkPassphrase =
        envMap[`${prefix}NETWORK_PASSPHRASE`] ??
        (id === 'testnet' ? env.STELLAR_NETWORK_PASSPHRASE : undefined) ??
        defaultPassphrase(id);

    if (!rpcUrl || !factoryAddress || !networkPassphrase) {
        throw new HttpError(500, 'network_not_configured', `Network is not configured: ${network}`);
    }

    return {
        id,
        rpcUrl,
        networkPassphrase,
        factoryAddress,
    };
}

function defaultPassphrase(network: string): string | undefined {
    if (network === 'testnet') return TESTNET_PASSPHRASE;
    if (network === 'mainnet') return MAINNET_PASSPHRASE;
    return undefined;
}

function assertAddress(value: string, label: string): void {
    try {
        StellarSdkAddress.fromString(value);
    } catch {
        throw new HttpError(400, 'invalid_address', `Invalid ${label}`);
    }
}

function scAddress(address: string): xdr.ScVal {
    return StellarSdkAddress.fromString(address).toScVal();
}

function scU32(value: number): xdr.ScVal {
    return nativeToScVal(value, { type: 'u32' });
}

function scBytesN32(hex: string): xdr.ScVal {
    return xdr.ScVal.scvBytes(hexToBuffer(hex, 32));
}

function scValToBigInt(value: xdr.ScVal): bigint {
    const native = scValToNative(value);
    return BigInt(native.toString());
}

function bytesToHex(bytes: Buffer | Uint8Array): `0x${string}` {
    return `0x${Buffer.from(bytes).toString('hex')}`;
}

function normalizeHex(value: string): string {
    return value.startsWith('0x') ? value.slice(2) : value;
}

function hexToBuffer(value: string, expectedBytes?: number): Buffer {
    const hex = normalizeHex(value);
    if (!/^[0-9a-fA-F]*$/.test(hex) || hex.length % 2 !== 0) {
        throw new HttpError(400, 'invalid_hex', 'Invalid hex string');
    }
    const out = Buffer.from(hex, 'hex');
    if (expectedBytes !== undefined && out.length !== expectedBytes) {
        throw new HttpError(400, 'invalid_hex', `Expected ${expectedBytes} bytes`);
    }
    return out;
}

function validateHex32(value: string, label: string): void {
    try {
        hexToBuffer(value, 32);
    } catch {
        throw new HttpError(400, 'invalid_hex', `Invalid ${label}`);
    }
}

function sanitizeString(str: string, maxLength: number): string {
    if (!str) return '';
    const clean = str.replace(/[\x00-\x1F\x7F-\x9F]/g, '');
    return clean.length > maxLength ? clean.substring(0, maxLength) : clean;
}

function validateCid(raw: string): string {
    const cid = raw.startsWith('ipfs://') ? raw.slice('ipfs://'.length) : raw;
    const cidV0 = /^Qm[1-9A-HJ-NP-Za-km-z]{44}$/;
    const cidV1Base32 = /^b[a-z2-7]{40,}$/i;
    if (
        cid.length === 0 ||
        cid.includes('/') ||
        cid.includes('?') ||
        cid.includes('#') ||
        (!cidV0.test(cid) && !cidV1Base32.test(cid))
    ) {
        throw new HttpError(400, 'invalid_cid', 'Invalid IPFS CID');
    }
    return cid;
}

function decodeSegment(raw: string): string {
    try {
        return decodeURIComponent(raw).trim();
    } catch {
        throw new HttpError(400, 'invalid_path', 'Invalid URL path segment');
    }
}

function readMaxContracts(url: URL, env: Env): number {
    const configuredMax = Number(env.MAX_CONTRACTS) || 100;
    const requested = Number(url.searchParams.get('maxContracts') || '50');
    if (!Number.isFinite(requested) || requested <= 0) return 50;
    return Math.min(Math.floor(requested), configuredMax);
}

function buildCorsHeaders(origin: string | null, env: Env): Record<string, string> {
    const allowed = (env.ALLOWED_ORIGINS || '')
        .split(',')
        .map((o) => o.trim())
        .filter(Boolean);

    const allowOrigin = origin && allowed.includes(origin) ? origin : allowed[0] || '*';

    return {
        'Access-Control-Allow-Origin': allowOrigin,
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        'Access-Control-Max-Age': '86400',
        Vary: 'Origin',
    };
}

function json(body: unknown, status: number, extraHeaders: Record<string, string> = {}): Response {
    return new Response(JSON.stringify(body), {
        status,
        headers: {
            'Content-Type': 'application/json',
            'Cache-Control': 'no-store',
            ...extraHeaders,
        },
    });
}
