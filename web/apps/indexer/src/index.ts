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
 *   GET /v1/:network/owners/:owner/vestings
 *   GET /v1/ipfs/:cid
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
const FACTORY_RANGE_LIMIT = 100;

export default {
    async fetch(request: Request, env: Env): Promise<Response> {
        const url = new URL(request.url);
        const origin = request.headers.get('Origin');
        const corsHeaders = buildCorsHeaders(origin, env);

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
                        cache: 'none',
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
                return handleIpfsRead(parts[2], corsHeaders);
            }

            if (parts.length === 4 && parts[2] === 'ledger' && parts[3] === 'latest') {
                const network = decodeSegment(parts[1]);
                const cfg = getNetworkConfig(env, network);
                return handleLatestLedger(cfg, corsHeaders);
            }

            if (parts.length === 6 && parts[2] === 'factory' && parts[3] === 'predict') {
                const network = decodeSegment(parts[1]);
                const cfg = getNetworkConfig(env, network);
                const owner = decodeSegment(parts[4]);
                const salt = decodeSegment(parts[5]);
                return handlePredictVestingAddress(owner, salt, cfg, corsHeaders);
            }

            if (parts.length >= 3 && parts[2] === 'vestings') {
                const network = decodeSegment(parts[1]);
                const cfg = getNetworkConfig(env, network);
                if (parts.length === 3) {
                    return handleAllVestings(cfg, corsHeaders);
                }
                if (parts.length === 4) {
                    const address = decodeSegment(parts[3]);
                    return handleVesting(address, cfg, corsHeaders);
                }
                if (parts.length === 6 && parts[4] === 'claimed') {
                    const address = decodeSegment(parts[3]);
                    const commitment = decodeSegment(parts[5]);
                    return handleEpochClaimed(address, commitment, cfg, corsHeaders);
                }
                if (parts.length === 6 && parts[4] === 'recipient-id') {
                    const address = decodeSegment(parts[3]);
                    const recipient = decodeSegment(parts[5]);
                    return handleRecipientId(address, recipient, cfg, corsHeaders);
                }
            }

            if (parts.length >= 4 && parts[2] === 'tokens') {
                const network = decodeSegment(parts[1]);
                const cfg = getNetworkConfig(env, network);
                const token = decodeSegment(parts[3]);
                if (parts.length === 4) {
                    return handleTokenMetadata(token, cfg, corsHeaders);
                }
                if (parts.length === 6 && parts[4] === 'balances') {
                    const owner = decodeSegment(parts[5]);
                    return handleTokenBalance(token, owner, cfg, corsHeaders);
                }
                if (parts.length === 7 && parts[4] === 'allowances') {
                    const owner = decodeSegment(parts[5]);
                    const spender = decodeSegment(parts[6]);
                    return handleTokenAllowance(token, owner, spender, cfg, corsHeaders);
                }
            }

            if (parts.length === 5 && parts[2] === 'owners' && parts[4] === 'vestings') {
                const network = decodeSegment(parts[1]);
                const owner = decodeSegment(parts[3]);
                const cfg = getNetworkConfig(env, network);
                return handleOwnerVestings(owner, url, env, cfg, corsHeaders);
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
    return json(await fetchIpfsJson(cid), 200, corsHeaders);
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

async function predictVestingAddress(cfg: NetworkConfig, owner: string, salt: string): Promise<string> {
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

async function fetchIpfsJson(cid: string): Promise<unknown> {
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

async function fetchJsonFromGateway(gateway: string, cid: string): Promise<unknown> {
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
        return await response.json();
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
