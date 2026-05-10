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
} from "@stellar/stellar-sdk";
import { Buffer } from "buffer";

interface Env {
    INDEXER_CACHE?: KVNamespace;
    ALLOWED_ORIGINS?: string;
    CACHE_NAMESPACE?: string;
    DEPLOYMENTS_TTL_SECONDS?: string;
    OWNER_TTL_SECONDS?: string;
    VESTING_TTL_SECONDS?: string;
    IPFS_TTL_SECONDS?: string;
    READ_TTL_SECONDS?: string;
    LEDGER_TTL_SECONDS?: string;
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

interface CacheEntry {
    value: string;
    expiresAt: number;
}

interface DeploymentIndexState {
    count: number;
    addresses: string[];
    updatedAt: number;
}

interface CachedValue<T> {
    value: T;
    status: "HIT" | "MISS" | "BYPASS";
}

class HttpError extends Error {
    constructor(
        public readonly status: number,
        public readonly code: string,
        message: string,
    ) {
        super(message);
        this.name = "HttpError";
    }
}

const SIMULATION_SOURCE = StrKey.encodeEd25519PublicKey(Buffer.alloc(32));
const TESTNET_PASSPHRASE = "Test SDF Network ; September 2015";
const MAINNET_PASSPHRASE = "Public Global Stellar Network ; September 2015";
const IPFS_READ_GATEWAYS = [
    "https://gateway.pinata.cloud/ipfs",
    "https://ipfs.io/ipfs",
    "https://dweb.link/ipfs",
    "https://w3s.link/ipfs",
];
const GATEWAY_TIMEOUT_MS = 5_000;
const INDEX_STATE_MEMORY_TTL_MS = 30_000;

const memoryCache = new Map<string, CacheEntry>();

export default {
    async fetch(request: Request, env: Env): Promise<Response> {
        const url = new URL(request.url);
        const origin = request.headers.get("Origin");
        const corsHeaders = buildCorsHeaders(origin, env);

        if (request.method === "OPTIONS") {
            return new Response(null, { status: 204, headers: corsHeaders });
        }

        if (request.method !== "GET") {
            return json({ error: "method_not_allowed" }, 405, corsHeaders);
        }

        try {
            if (url.pathname === "/health") {
                return json({
                    ok: true,
                    cache: env.INDEXER_CACHE ? "kv" : "memory",
                    hasKv: Boolean(env.INDEXER_CACHE),
                }, 200, corsHeaders);
            }

            const parts = url.pathname.split("/").filter(Boolean);
            if (parts[0] !== "v1") {
                return json({ error: "not_found" }, 404, corsHeaders);
            }

            if (parts[1] === "ipfs" && parts.length === 3) {
                return handleIpfsRead(parts[2], url, env, corsHeaders);
            }

            if (parts.length === 4 && parts[2] === "ledger" && parts[3] === "latest") {
                const network = decodeSegment(parts[1]);
                const cfg = getNetworkConfig(env, network);
                return handleLatestLedger(url, env, cfg, corsHeaders);
            }

            if (parts.length === 5 && parts[2] === "factory" && parts[3] === "predict") {
                const network = decodeSegment(parts[1]);
                const cfg = getNetworkConfig(env, network);
                const salt = decodeSegment(parts[4]);
                return handlePredictVestingAddress(salt, url, env, cfg, corsHeaders);
            }

            if (parts.length >= 3 && parts[2] === "vestings") {
                const network = decodeSegment(parts[1]);
                const cfg = getNetworkConfig(env, network);
                if (parts.length === 3) {
                    return handleAllVestings(url, env, cfg, corsHeaders);
                }
                if (parts.length === 4) {
                    const address = decodeSegment(parts[3]);
                    return handleVesting(address, url, env, cfg, corsHeaders);
                }
                if (parts.length === 6 && parts[4] === "claimed") {
                    const address = decodeSegment(parts[3]);
                    const commitment = decodeSegment(parts[5]);
                    return handleEpochClaimed(address, commitment, url, env, cfg, corsHeaders);
                }
                if (parts.length === 6 && parts[4] === "recipient-id") {
                    const address = decodeSegment(parts[3]);
                    const recipient = decodeSegment(parts[5]);
                    return handleRecipientId(address, recipient, url, env, cfg, corsHeaders);
                }
            }

            if (parts.length >= 4 && parts[2] === "tokens") {
                const network = decodeSegment(parts[1]);
                const cfg = getNetworkConfig(env, network);
                const token = decodeSegment(parts[3]);
                if (parts.length === 4) {
                    return handleTokenMetadata(token, url, env, cfg, corsHeaders);
                }
                if (parts.length === 6 && parts[4] === "balances") {
                    const owner = decodeSegment(parts[5]);
                    return handleTokenBalance(token, owner, url, env, cfg, corsHeaders);
                }
                if (parts.length === 7 && parts[4] === "allowances") {
                    const owner = decodeSegment(parts[5]);
                    const spender = decodeSegment(parts[6]);
                    return handleTokenAllowance(token, owner, spender, url, env, cfg, corsHeaders);
                }
            }

            if (
                parts.length === 5 &&
                parts[2] === "owners" &&
                parts[4] === "vestings"
            ) {
                const network = decodeSegment(parts[1]);
                const owner = decodeSegment(parts[3]);
                const cfg = getNetworkConfig(env, network);
                return handleOwnerVestings(owner, url, env, cfg, corsHeaders);
            }

            return json({ error: "not_found" }, 404, corsHeaders);
        } catch (error) {
            if (error instanceof HttpError) {
                return json(
                    { error: error.code, message: error.message },
                    error.status,
                    corsHeaders,
                );
            }

            console.error("[Indexer] Unhandled error:", error);
            return json({ error: "indexer_error" }, 500, corsHeaders);
        }
    },
};

async function handleAllVestings(
    url: URL,
    env: Env,
    cfg: NetworkConfig,
    corsHeaders: Record<string, string>,
): Promise<Response> {
    const ttl = ttlSeconds(env.DEPLOYMENTS_TTL_SECONDS, 60);
    const cacheKey = `${cachePrefix(env, cfg)}:vestings:all`;
    const result = await cachedJson(
        env,
        cacheKey,
        ttl,
        wantsRefresh(url),
        async () => {
            const addresses = await fetchDeploymentAddresses(env, cfg);
            return {
                vestings: addresses.map((address) => ({ address })),
                total: addresses.length,
                fetchedAt: Date.now(),
            };
        },
    );

    return cachedResponse(result, ttl, corsHeaders);
}

async function handleOwnerVestings(
    owner: string,
    url: URL,
    env: Env,
    cfg: NetworkConfig,
    corsHeaders: Record<string, string>,
): Promise<Response> {
    assertAddress(owner, "owner");

    const maxContracts = readMaxContracts(url, env);
    const ttl = ttlSeconds(env.OWNER_TTL_SECONDS, 60);
    const cacheKey = `${cachePrefix(env, cfg)}:owner:${owner}:vestings:${maxContracts}`;
    const result = await cachedJson(
        env,
        cacheKey,
        ttl,
        wantsRefresh(url),
        async () => {
            const addresses = await fetchOwnerDeploymentAddresses(env, cfg, owner);
            const contracts = await Promise.all(
                addresses.slice(0, maxContracts).map(async (address) => {
                    try {
                        return await getVestingContract(env, cfg, address, wantsRefresh(url));
                    } catch (error) {
                        console.warn(`[Indexer] Failed to read vesting ${address}:`, error);
                        return null;
                    }
                }),
            );

            return {
                contracts: contracts.filter((contract): contract is VestingContract => contract !== null),
                total: addresses.length,
                fetchedAt: Date.now(),
            };
        },
    );

    return cachedResponse(result, ttl, corsHeaders);
}

async function handleVesting(
    address: string,
    url: URL,
    env: Env,
    cfg: NetworkConfig,
    corsHeaders: Record<string, string>,
): Promise<Response> {
    assertAddress(address, "vesting address");

    const ttl = ttlSeconds(env.VESTING_TTL_SECONDS, 120);
    const result = await getVestingContractCached(env, cfg, address, ttl, wantsRefresh(url));
    return cachedResponse(result, ttl, corsHeaders);
}

async function handleIpfsRead(
    rawCid: string,
    url: URL,
    env: Env,
    corsHeaders: Record<string, string>,
): Promise<Response> {
    const cid = validateCid(decodeSegment(rawCid));
    const ttl = ttlSeconds(env.IPFS_TTL_SECONDS, 86_400);
    const result = await cachedJson(
        env,
        `${cacheNamespace(env)}:ipfs:${cid}`,
        ttl,
        wantsRefresh(url),
        () => fetchIpfsJson(cid),
    );

    return cachedResponse(result, ttl, corsHeaders);
}

async function handleLatestLedger(
    url: URL,
    env: Env,
    cfg: NetworkConfig,
    corsHeaders: Record<string, string>,
): Promise<Response> {
    const ttl = ttlSeconds(env.LEDGER_TTL_SECONDS, 5);
    const result = await cachedJson(
        env,
        `${cachePrefix(env, cfg)}:ledger:latest`,
        ttl,
        wantsRefresh(url),
        async () => ({ sequence: await getLatestLedgerSequence(cfg), fetchedAt: Date.now() }),
    );

    return cachedResponse(result, ttl, corsHeaders);
}

async function handlePredictVestingAddress(
    salt: string,
    url: URL,
    env: Env,
    cfg: NetworkConfig,
    corsHeaders: Record<string, string>,
): Promise<Response> {
    validateHex32(salt, "salt");

    const ttl = ttlSeconds(env.READ_TTL_SECONDS, 60);
    const result = await cachedJson(
        env,
        `${cachePrefix(env, cfg)}:factory:predict:${normalizeHex(salt)}`,
        ttl,
        wantsRefresh(url),
        async () => ({
            address: await predictVestingAddress(cfg, salt),
            fetchedAt: Date.now(),
        }),
    );

    return cachedResponse(result, ttl, corsHeaders);
}

async function handleEpochClaimed(
    address: string,
    commitment: string,
    url: URL,
    env: Env,
    cfg: NetworkConfig,
    corsHeaders: Record<string, string>,
): Promise<Response> {
    assertAddress(address, "vesting address");
    validateHex32(commitment, "epoch commitment");

    const ttl = ttlSeconds(env.READ_TTL_SECONDS, 30);
    const result = await cachedJson(
        env,
        `${cachePrefix(env, cfg)}:vesting:${address}:claimed:${normalizeHex(commitment)}`,
        ttl,
        wantsRefresh(url),
        async () => ({
            claimed: await isEpochClaimed(cfg, address, commitment),
            fetchedAt: Date.now(),
        }),
    );

    return cachedResponse(result, ttl, corsHeaders);
}

async function handleRecipientId(
    address: string,
    recipient: string,
    url: URL,
    env: Env,
    cfg: NetworkConfig,
    corsHeaders: Record<string, string>,
): Promise<Response> {
    assertAddress(address, "vesting address");
    assertAddress(recipient, "recipient");

    const ttl = ttlSeconds(env.READ_TTL_SECONDS, 60);
    const result = await cachedJson(
        env,
        `${cachePrefix(env, cfg)}:vesting:${address}:recipient-id:${recipient}`,
        ttl,
        wantsRefresh(url),
        async () => ({
            recipientId: await recipientId(cfg, address, recipient),
            fetchedAt: Date.now(),
        }),
    );

    return cachedResponse(result, ttl, corsHeaders);
}

async function handleTokenMetadata(
    token: string,
    url: URL,
    env: Env,
    cfg: NetworkConfig,
    corsHeaders: Record<string, string>,
): Promise<Response> {
    assertAddress(token, "token address");

    const ttl = ttlSeconds(env.READ_TTL_SECONDS, 300);
    const result = await cachedJson(
        env,
        `${cachePrefix(env, cfg)}:token:${token}:metadata`,
        ttl,
        wantsRefresh(url),
        () => readTokenContract(cfg, token),
    );

    return cachedResponse(result, ttl, corsHeaders);
}

async function handleTokenBalance(
    token: string,
    owner: string,
    url: URL,
    env: Env,
    cfg: NetworkConfig,
    corsHeaders: Record<string, string>,
): Promise<Response> {
    assertAddress(token, "token address");
    assertAddress(owner, "owner");

    const ttl = ttlSeconds(env.READ_TTL_SECONDS, 30);
    const result = await cachedJson(
        env,
        `${cachePrefix(env, cfg)}:token:${token}:balance:${owner}`,
        ttl,
        wantsRefresh(url),
        async () => ({
            balance: (await getTokenBalance(cfg, token, owner)).toString(),
            fetchedAt: Date.now(),
        }),
    );

    return cachedResponse(result, ttl, corsHeaders);
}

async function handleTokenAllowance(
    token: string,
    owner: string,
    spender: string,
    url: URL,
    env: Env,
    cfg: NetworkConfig,
    corsHeaders: Record<string, string>,
): Promise<Response> {
    assertAddress(token, "token address");
    assertAddress(owner, "owner");
    assertAddress(spender, "spender");

    const ttl = ttlSeconds(env.READ_TTL_SECONDS, 20);
    const result = await cachedJson(
        env,
        `${cachePrefix(env, cfg)}:token:${token}:allowance:${owner}:${spender}`,
        ttl,
        wantsRefresh(url),
        async () => ({
            allowance: (await getTokenAllowance(cfg, token, owner, spender)).toString(),
            fetchedAt: Date.now(),
        }),
    );

    return cachedResponse(result, ttl, corsHeaders);
}

async function getVestingContract(
    env: Env,
    cfg: NetworkConfig,
    address: string,
    refresh: boolean,
): Promise<VestingContract> {
    const ttl = ttlSeconds(env.VESTING_TTL_SECONDS, 120);
    return (await getVestingContractCached(env, cfg, address, ttl, refresh)).value;
}

async function getVestingContractCached(
    env: Env,
    cfg: NetworkConfig,
    address: string,
    ttl: number,
    refresh: boolean,
): Promise<CachedValue<VestingContract>> {
    return cachedJson(env, `${cachePrefix(env, cfg)}:vesting:${address}`, ttl, refresh, async () => {
        const metadata = await readVestingContract(cfg, address);
        const [metadataCid, tokenBalance] = await Promise.all([
            getCidForVesting(cfg, address),
            getTokenBalance(cfg, metadata.token, address).catch((error) => {
                console.warn(`[Indexer] Failed to fetch token balance for ${address}:`, error);
                return 0n;
            }),
        ]);

        return {
            address,
            name: sanitizeString(metadata.name || "Unknown Distribution", 50),
            description: sanitizeString(metadata.description || "", 200),
            token: metadata.token,
            merkleRoot: metadata.merkleRoot,
            tokenSymbol: sanitizeString(metadata.tokenSymbol || "XLM", 10),
            tokenDecimals: metadata.tokenDecimals,
            owner: metadata.owner,
            vestingStart: "0",
            cliffDuration: "0",
            vestingDuration: "0",
            vestingPeriod: "0",
            tokenBalance: tokenBalance.toString(),
            metadataCid,
        };
    });
}

async function fetchDeploymentAddresses(
    env: Env,
    cfg: NetworkConfig,
): Promise<string[]> {
    return fetchAppendOnlyIndex({
        env,
        key: `${cachePrefix(env, cfg)}:vestings:index-state`,
        readCount: () => getDeploymentCount(cfg),
        readAddress: (index) => getDeployment(cfg, index),
    });
}

async function fetchOwnerDeploymentAddresses(
    env: Env,
    cfg: NetworkConfig,
    owner: string,
): Promise<string[]> {
    return fetchAppendOnlyIndex({
        env,
        key: `${cachePrefix(env, cfg)}:owner:${owner}:vestings:index-state`,
        readCount: () => getOwnerDeploymentCount(cfg, owner),
        readAddress: (index) => getOwnerDeployment(cfg, owner, index),
    });
}

async function fetchAppendOnlyIndex(params: {
    env: Env;
    key: string;
    readCount: () => Promise<number>;
    readAddress: (index: number) => Promise<string>;
}): Promise<string[]> {
    const { env, key, readCount, readAddress } = params;
    const currentCount = await readCount();
    if (currentCount === 0) {
        await writeIndexState(env, key, {
            count: 0,
            addresses: [],
            updatedAt: Date.now(),
        });
        return [];
    }

    const cached = await readIndexState(env, key);
    const cachedAddresses = cached && cached.count <= currentCount
        ? cached.addresses.slice(0, Math.min(cached.count, cached.addresses.length))
        : [];

    if (cachedAddresses.length >= currentCount) {
        return cachedAddresses.slice(0, currentCount);
    }

    const nextAddresses = await Promise.all(
        Array.from(
            { length: currentCount - cachedAddresses.length },
            (_, offset) => readAddress(cachedAddresses.length + offset),
        ),
    );
    const addresses = [...cachedAddresses, ...nextAddresses];

    await writeIndexState(env, key, {
        count: currentCount,
        addresses,
        updatedAt: Date.now(),
    });

    return addresses;
}

async function readVestingContract(
    cfg: NetworkConfig,
    address: string,
): Promise<{
    name: string;
    description: string;
    owner: string;
    token: string;
    merkleRoot: string;
    tokenSymbol: string;
    tokenDecimals: number;
}> {
    const [name, description, owner, token, merkleRoot] = await Promise.all([
        simulate(cfg, address, "name"),
        simulate(cfg, address, "description"),
        simulate(cfg, address, "owner"),
        simulate(cfg, address, "token"),
        simulate(cfg, address, "merkle_root"),
    ]);

    const tokenAddress = StellarSdkAddress.fromScVal(token).toString();
    let tokenSymbol = "XLM";
    let tokenDecimals = 7;
    try {
        const [symbol, decimals] = await Promise.all([
            simulate(cfg, tokenAddress, "symbol"),
            simulate(cfg, tokenAddress, "decimals"),
        ]);
        tokenSymbol = String(scValToNative(symbol));
        tokenDecimals = Number(scValToNative(decimals));
    } catch {
        // Token display metadata is optional. The vesting metadata remains valid.
    }

    return {
        name: String(scValToNative(name)),
        description: String(scValToNative(description)),
        owner: StellarSdkAddress.fromScVal(owner).toString(),
        token: tokenAddress,
        merkleRoot: bytesToHex(scValToNative(merkleRoot)),
        tokenSymbol,
        tokenDecimals,
    };
}

async function getTokenBalance(
    cfg: NetworkConfig,
    tokenAddress: string,
    owner: string,
): Promise<bigint> {
    return scValToBigInt(await simulate(cfg, tokenAddress, "balance", [scAddress(owner)]));
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
        simulate(cfg, tokenAddress, "name").catch(() => null),
        simulate(cfg, tokenAddress, "symbol").catch(() => null),
        simulate(cfg, tokenAddress, "decimals").catch(() => null),
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
    return scValToBigInt(await simulate(cfg, tokenAddress, "allowance", [
        scAddress(owner),
        scAddress(spender),
    ]));
}

async function recipientId(
    cfg: NetworkConfig,
    contractAddress: string,
    recipient: string,
): Promise<`0x${string}`> {
    const result = await simulate(cfg, contractAddress, "recipient_id", [scAddress(recipient)]);
    return bytesToHex(scValToNative(result));
}

async function isEpochClaimed(
    cfg: NetworkConfig,
    contractAddress: string,
    epochCommitment: string,
): Promise<boolean> {
    const result = await simulate(cfg, contractAddress, "is_claimed", [
        scBytesN32(epochCommitment),
    ]);
    return Boolean(scValToNative(result));
}

async function predictVestingAddress(cfg: NetworkConfig, salt: string): Promise<string> {
    const result = await simulate(cfg, cfg.factoryAddress, "predict_vesting_address", [
        scBytesN32(salt),
    ]);
    return StellarSdkAddress.fromScVal(result).toString();
}

async function getLatestLedgerSequence(cfg: NetworkConfig): Promise<number> {
    const latest = await new rpc.Server(cfg.rpcUrl).getLatestLedger();
    return latest.sequence;
}

async function getDeploymentCount(cfg: NetworkConfig): Promise<number> {
    const result = await simulate(cfg, cfg.factoryAddress, "get_deployment_count");
    return Number(scValToNative(result));
}

async function getDeployment(cfg: NetworkConfig, index: number): Promise<string> {
    const result = await simulate(cfg, cfg.factoryAddress, "get_deployment", [scU32(index)]);
    return StellarSdkAddress.fromScVal(result).toString();
}

async function getOwnerDeploymentCount(cfg: NetworkConfig, owner: string): Promise<number> {
    const result = await simulate(cfg, cfg.factoryAddress, "get_owner_deployment_count", [
        scAddress(owner),
    ]);
    return Number(scValToNative(result));
}

async function getOwnerDeployment(
    cfg: NetworkConfig,
    owner: string,
    index: number,
): Promise<string> {
    const result = await simulate(cfg, cfg.factoryAddress, "get_owner_deployment", [
        scAddress(owner),
        scU32(index),
    ]);
    return StellarSdkAddress.fromScVal(result).toString();
}

async function getCidForVesting(
    cfg: NetworkConfig,
    vestingAddress: string,
): Promise<string | null> {
    try {
        const result = await simulate(cfg, cfg.factoryAddress, "vesting_metadata_cid", [
            scAddress(vestingAddress),
        ]);
        const cid = String(scValToNative(result));
        return cid.length > 0 ? cid : null;
    } catch {
        return null;
    }
}

async function simulate(
    cfg: NetworkConfig,
    contractId: string,
    method: string,
    args: xdr.ScVal[] = [],
): Promise<xdr.ScVal> {
    const tx = new TransactionBuilder(new Account(SIMULATION_SOURCE, "0"), {
        fee: BASE_FEE,
        networkPassphrase: cfg.networkPassphrase,
    })
        .setTimeout(30)
        .addOperation(new Contract(contractId).call(method, ...args))
        .build();

    const result = await new rpc.Server(cfg.rpcUrl).simulateTransaction(tx);
    if (rpc.Api.isSimulationError(result)) {
        throw new HttpError(502, "rpc_simulation_error", result.error);
    }
    if (!result.result) {
        throw new HttpError(502, "rpc_empty_result", `No simulation result for ${method}`);
    }
    return result.result.retval;
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
        "ipfs_gateway_error",
        `All IPFS gateways failed for ${cid}: ${errors.join("; ")}`,
    );
}

async function fetchJsonFromGateway(gateway: string, cid: string): Promise<unknown> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), GATEWAY_TIMEOUT_MS);

    try {
        const response = await fetch(`${gateway}/${cid}`, {
            headers: { Accept: "application/json" },
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

async function cachedJson<T>(
    env: Env,
    key: string,
    ttl: number,
    refresh: boolean,
    loader: () => Promise<T>,
): Promise<CachedValue<T>> {
    if (!refresh) {
        const cached = await readCache<T>(env, key);
        if (cached !== null) {
            return { value: cached, status: "HIT" };
        }
    }

    const value = await loader();
    await writeCache(env, key, value, ttl);
    return { value, status: refresh ? "BYPASS" : "MISS" };
}

async function readCache<T>(env: Env, key: string): Promise<T | null> {
    const now = Date.now();
    const memory = memoryCache.get(key);
    if (memory && memory.expiresAt > now) {
        return JSON.parse(memory.value) as T;
    }
    if (memory) memoryCache.delete(key);

    if (!env.INDEXER_CACHE) return null;

    try {
        const result = await env.INDEXER_CACHE.get(key);
        if (!result) return null;
        memoryCache.set(key, {
            value: result,
            expiresAt: now + 10_000,
        });
        return JSON.parse(result) as T;
    } catch (error) {
        console.warn("[Indexer] KV read failed:", error);
        return null;
    }
}

async function readIndexState(env: Env, key: string): Promise<DeploymentIndexState | null> {
    const now = Date.now();
    const memory = memoryCache.get(key);
    if (memory && memory.expiresAt > now) {
        return parseIndexState(memory.value);
    }
    if (memory) memoryCache.delete(key);

    if (!env.INDEXER_CACHE) return null;

    try {
        const result = await env.INDEXER_CACHE.get(key);
        if (!result) return null;

        memoryCache.set(key, {
            value: result,
            expiresAt: now + INDEX_STATE_MEMORY_TTL_MS,
        });

        return parseIndexState(result);
    } catch (error) {
        console.warn("[Indexer] KV index-state read failed:", error);
        return null;
    }
}

async function writeIndexState(
    env: Env,
    key: string,
    value: DeploymentIndexState,
): Promise<void> {
    const serialized = JSON.stringify(value);
    memoryCache.set(key, {
        value: serialized,
        expiresAt: Date.now() + INDEX_STATE_MEMORY_TTL_MS,
    });

    if (!env.INDEXER_CACHE) return;

    try {
        await env.INDEXER_CACHE.put(key, serialized);
    } catch (error) {
        console.warn("[Indexer] KV index-state write failed:", error);
    }
}

function parseIndexState(raw: string): DeploymentIndexState | null {
    try {
        const value = JSON.parse(raw) as Partial<DeploymentIndexState>;
        if (
            typeof value.count !== "number" ||
            !Number.isInteger(value.count) ||
            value.count < 0 ||
            !Array.isArray(value.addresses)
        ) {
            return null;
        }

        return {
            count: value.count,
            addresses: value.addresses.filter((address): address is string => typeof address === "string"),
            updatedAt: typeof value.updatedAt === "number" ? value.updatedAt : 0,
        };
    } catch {
        return null;
    }
}

async function writeCache(env: Env, key: string, value: unknown, ttl: number): Promise<void> {
    const serialized = JSON.stringify(value);
    memoryCache.set(key, {
        value: serialized,
        expiresAt: Date.now() + ttl * 1_000,
    });

    if (!env.INDEXER_CACHE) return;

    try {
        await env.INDEXER_CACHE.put(key, serialized, {
            expirationTtl: ttl,
        });
    } catch (error) {
        console.warn("[Indexer] KV write failed:", error);
    }
}

function getNetworkConfig(env: Env, network: string): NetworkConfig {
    const envMap = env as Record<string, string | undefined>;
    const id = network.toLowerCase();
    const prefix = `STELLAR_${id.toUpperCase().replace(/[^A-Z0-9]/g, "_")}_`;
    const rpcUrl = envMap[`${prefix}RPC_URL`] ?? (id === "testnet" ? env.STELLAR_RPC_URL : undefined);
    const factoryAddress =
        envMap[`${prefix}FACTORY_ADDRESS`] ??
        (id === "testnet" ? env.STELLAR_FACTORY_ADDRESS : undefined);
    const networkPassphrase =
        envMap[`${prefix}NETWORK_PASSPHRASE`] ??
        (id === "testnet" ? env.STELLAR_NETWORK_PASSPHRASE : undefined) ??
        defaultPassphrase(id);

    if (!rpcUrl || !factoryAddress || !networkPassphrase) {
        throw new HttpError(500, "network_not_configured", `Network is not configured: ${network}`);
    }

    return {
        id,
        rpcUrl,
        networkPassphrase,
        factoryAddress,
    };
}

function defaultPassphrase(network: string): string | undefined {
    if (network === "testnet") return TESTNET_PASSPHRASE;
    if (network === "mainnet") return MAINNET_PASSPHRASE;
    return undefined;
}

function assertAddress(value: string, label: string): void {
    try {
        StellarSdkAddress.fromString(value);
    } catch {
        throw new HttpError(400, "invalid_address", `Invalid ${label}`);
    }
}

function scAddress(address: string): xdr.ScVal {
    return StellarSdkAddress.fromString(address).toScVal();
}

function scU32(value: number): xdr.ScVal {
    return nativeToScVal(value, { type: "u32" });
}

function scBytesN32(hex: string): xdr.ScVal {
    return xdr.ScVal.scvBytes(hexToBuffer(hex, 32));
}

function scValToBigInt(value: xdr.ScVal): bigint {
    const native = scValToNative(value);
    return BigInt(native.toString());
}

function bytesToHex(bytes: Buffer | Uint8Array): `0x${string}` {
    return `0x${Buffer.from(bytes).toString("hex")}`;
}

function normalizeHex(value: string): string {
    return value.startsWith("0x") ? value.slice(2) : value;
}

function hexToBuffer(value: string, expectedBytes?: number): Buffer {
    const hex = normalizeHex(value);
    if (!/^[0-9a-fA-F]*$/.test(hex) || hex.length % 2 !== 0) {
        throw new HttpError(400, "invalid_hex", "Invalid hex string");
    }
    const out = Buffer.from(hex, "hex");
    if (expectedBytes !== undefined && out.length !== expectedBytes) {
        throw new HttpError(400, "invalid_hex", `Expected ${expectedBytes} bytes`);
    }
    return out;
}

function validateHex32(value: string, label: string): void {
    try {
        hexToBuffer(value, 32);
    } catch {
        throw new HttpError(400, "invalid_hex", `Invalid ${label}`);
    }
}

function sanitizeString(str: string, maxLength: number): string {
    if (!str) return "";
    const clean = str.replace(/[\x00-\x1F\x7F-\x9F]/g, "");
    return clean.length > maxLength ? clean.substring(0, maxLength) : clean;
}

function validateCid(raw: string): string {
    const cid = raw.startsWith("ipfs://") ? raw.slice("ipfs://".length) : raw;
    const cidV0 = /^Qm[1-9A-HJ-NP-Za-km-z]{44}$/;
    const cidV1Base32 = /^b[a-z2-7]{40,}$/i;
    if (
        cid.length === 0 ||
        cid.includes("/") ||
        cid.includes("?") ||
        cid.includes("#") ||
        (!cidV0.test(cid) && !cidV1Base32.test(cid))
    ) {
        throw new HttpError(400, "invalid_cid", "Invalid IPFS CID");
    }
    return cid;
}

function decodeSegment(raw: string): string {
    try {
        return decodeURIComponent(raw).trim();
    } catch {
        throw new HttpError(400, "invalid_path", "Invalid URL path segment");
    }
}

function readMaxContracts(url: URL, env: Env): number {
    const configuredMax = Number(env.MAX_CONTRACTS) || 100;
    const requested = Number(url.searchParams.get("maxContracts") || "50");
    if (!Number.isFinite(requested) || requested <= 0) return 50;
    return Math.min(Math.floor(requested), configuredMax);
}

function wantsRefresh(url: URL): boolean {
    const value = url.searchParams.get("refresh");
    return value === "1" || value === "true";
}

function ttlSeconds(raw: string | undefined, fallback: number): number {
    const value = Number(raw);
    if (!Number.isFinite(value) || value <= 0) return fallback;
    return Math.floor(value);
}

function cacheNamespace(env: Env): string {
    return env.CACHE_NAMESPACE || "zarf-indexer:v1";
}

function cachePrefix(env: Env, cfg: NetworkConfig): string {
    return `${cacheNamespace(env)}:${cfg.id}:${cfg.factoryAddress}`;
}

function cachedResponse<T>(
    result: CachedValue<T>,
    ttl: number,
    corsHeaders: Record<string, string>,
): Response {
    return json(result.value, 200, {
        ...corsHeaders,
        "Cache-Control": `public, max-age=${Math.min(ttl, 60)}`,
        "X-Zarf-Cache": result.status,
    });
}

function buildCorsHeaders(origin: string | null, env: Env): Record<string, string> {
    const allowed = (env.ALLOWED_ORIGINS || "")
        .split(",")
        .map((o) => o.trim())
        .filter(Boolean);

    const allowOrigin = origin && allowed.includes(origin) ? origin : allowed[0] || "*";

    return {
        "Access-Control-Allow-Origin": allowOrigin,
        "Access-Control-Allow-Methods": "GET, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization",
        "Access-Control-Max-Age": "86400",
        Vary: "Origin",
    };
}

function json(
    body: unknown,
    status: number,
    extraHeaders: Record<string, string> = {},
): Response {
    return new Response(JSON.stringify(body), {
        status,
        headers: {
            "Content-Type": "application/json",
            ...extraHeaders,
        },
    });
}
