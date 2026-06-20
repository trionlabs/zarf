import {
    Account,
    BASE_FEE,
    Contract,
    Keypair,
    StrKey,
    TransactionBuilder,
    rpc,
    scValToNative,
    xdr,
} from '@stellar/stellar-sdk';
import { keccak_256 } from '@noble/hashes/sha3';
import { Buffer } from 'buffer';

const DEFAULT_GOOGLE_JWKS_URL = 'https://www.googleapis.com/oauth2/v3/certs';
const SIMULATION_SOURCE = StrKey.encodeEd25519PublicKey(Buffer.alloc(32));
const ZERO_HASH = `0x${'0'.repeat(64)}` as const;
const LIMB_BITS = 120n;
const LIMB_COUNT = 18;
const FIELD_BYTES = 32;

// Best-effort per-isolate rate limit for the admin-gated routes (/rotate, /state).
// This worker holds REGISTRY_OWNER_SECRET — the trust root — so it is the
// highest-value secret in the system; we throttle FAILED admin attempts per IP
// to blunt online brute-forcing of ADMIN_TOKEN. Workers run many short-lived
// isolates, so this caps a single hot isolate, not the fleet; it is a
// defence-in-depth layer behind the constant-time token compare. Fixed window,
// keyed by CF client IP.
const ADMIN_RL_MAX_FAILURES = 10; // failed admin attempts per window per IP per isolate
const ADMIN_RL_WINDOW_MS = 60_000;
const ADMIN_RL_MAX_KEYS = 5_000; // prune trigger to bound isolate memory
const adminFailureState = new Map<string, { count: number; resetAt: number }>();

interface Env {
    STELLAR_RPC_URL: string;
    STELLAR_NETWORK_PASSPHRASE: string;
    JWK_REGISTRY_ADDRESS: string;
    REGISTRY_OWNER_SECRET: string;
    ADMIN_TOKEN?: string;
    ALERT_WEBHOOK_URL?: string;
    GOOGLE_JWKS_URL?: string;
    REVOKE_REMOVED_KEYS?: string;
    TX_POLL_ATTEMPTS?: string;
}

interface GoogleJwk {
    kid: string;
    kty: string;
    n: string;
    e?: string;
    alg?: string;
    use?: string;
}

interface GoogleJwks {
    keys: GoogleJwk[];
}

interface ConvertedGoogleKey {
    kid: string;
    keyHash: HexString;
    limbs: HexString[];
    alg?: string;
    use?: string;
}

interface RegistryKey {
    keyHash: HexString;
    active: boolean;
}

interface RegistryAction {
    action: 'register' | 'revoke' | 'noop' | 'error';
    kid: string;
    keyHash: HexString;
    reason: string;
    txHash?: string;
    error?: string;
}

interface RotationReport {
    ok: boolean;
    dryRun: boolean;
    source: 'scheduled' | 'manual';
    startedAt: string;
    finishedAt: string;
    fetchedKeys: number;
    currentKeys: ConvertedGoogleKey[];
    actions: RegistryAction[];
    registered: number;
    revoked: number;
    unchanged: number;
    errors: number;
}

type HexString = `0x${string}`;

export default {
    async fetch(request: Request, env: Env): Promise<Response> {
        const url = new URL(request.url);

        if (url.pathname === '/health' && request.method === 'GET') {
            return json({
                ok: true,
                state: 'on-chain',
                hasRegistry: Boolean(env.JWK_REGISTRY_ADDRESS),
                hasRpc: Boolean(env.STELLAR_RPC_URL),
                hasOwnerSecret: Boolean(env.REGISTRY_OWNER_SECRET),
                hasAdminToken: Boolean(env.ADMIN_TOKEN),
            });
        }

        if (url.pathname === '/state' && request.method === 'GET') {
            const auth = await requireAdmin(request, env);
            if (auth) return auth;
            validateConfig(env);
            const [jwks, registryKeys] = await Promise.all([
                fetchGoogleJwks(env),
                loadRegistryKeys(env),
            ]);
            const currentKeys = convertGoogleKeys(jwks);
            return json({
                currentKeys,
                registryKeys,
                activeRegistryKeys: registryKeys.filter((key) => key.active),
            });
        }

        if (url.pathname === '/rotate' && request.method === 'POST') {
            const auth = await requireAdmin(request, env);
            if (auth) return auth;

            const dryRun = parseBoolean(url.searchParams.get('dryRun'), false);
            const report = await runRotation(env, { dryRun, source: 'manual' });
            return json(report, report.ok ? 200 : 500);
        }

        return json({ error: 'not_found' }, 404);
    },

    async scheduled(
        _controller: ScheduledController,
        env: Env,
        ctx: ExecutionContext,
    ): Promise<void> {
        ctx.waitUntil(runScheduledRotation(env));
    },
};

async function runScheduledRotation(env: Env): Promise<void> {
    const report = await runRotation(env, { dryRun: false, source: 'scheduled' });
    if (!report.ok) {
        throw new Error(`JWK rotation failed with ${report.errors} error(s)`);
    }
}

async function runRotation(
    env: Env,
    options: { dryRun: boolean; source: 'scheduled' | 'manual' },
): Promise<RotationReport> {
    const startedAt = new Date().toISOString();
    const actions: RegistryAction[] = [];
    const currentKeys: ConvertedGoogleKey[] = [];

    try {
        validateConfig(env);
        const [jwks, registryKeys] = await Promise.all([
            fetchGoogleJwks(env),
            loadRegistryKeys(env),
        ]);
        currentKeys.push(...convertGoogleKeys(jwks));
        const currentHashes = new Set(currentKeys.map((key) => key.keyHash));
        const activeRegistryHashes = new Set(
            registryKeys.filter((key) => key.active).map((key) => key.keyHash),
        );

        for (const key of currentKeys) {
            const isValid = activeRegistryHashes.has(key.keyHash);

            if (!isValid) {
                const action = await registerKey(env, key, options.dryRun);
                actions.push(action);
                if (action.action === 'error') continue;
            } else {
                actions.push({
                    action: 'noop',
                    kid: key.kid,
                    keyHash: key.keyHash,
                    reason: 'already_active_on_chain',
                });
            }
        }

        if (parseBoolean(env.REVOKE_REMOVED_KEYS, true)) {
            for (const registryKey of registryKeys) {
                if (!registryKey.active || currentHashes.has(registryKey.keyHash)) {
                    continue;
                }

                const action = await revokeKey(
                    env,
                    registryKey,
                    'removed_from_google_jwks',
                    options.dryRun,
                );
                actions.push(action);
            }
        }

        const hasErrors = actions.some((action) => action.action === 'error');
        const report = summarizeReport({
            ok: !hasErrors,
            dryRun: options.dryRun,
            source: options.source,
            startedAt,
            finishedAt: new Date().toISOString(),
            fetchedKeys: jwks.keys.length,
            currentKeys,
            actions,
        });
        console.info('[jwk-rotation] completed', report);
        await sendAlert(env, hasErrors ? 'jwk_rotation_failed' : 'jwk_rotation_completed', report);
        return report;
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error('[jwk-rotation] failed', message);

        const report = summarizeReport({
            ok: false,
            dryRun: options.dryRun,
            source: options.source,
            startedAt,
            finishedAt: new Date().toISOString(),
            fetchedKeys: currentKeys.length,
            currentKeys,
            actions: [
                ...actions,
                {
                    action: 'error',
                    kid: 'rotation',
                    keyHash: ZERO_HASH,
                    reason: 'rotation_failed',
                    error: message,
                },
            ],
        });
        await sendAlert(env, 'jwk_rotation_failed', report);
        return report;
    }
}

function summarizeReport(
    input: Omit<RotationReport, 'registered' | 'revoked' | 'unchanged' | 'errors'>,
): RotationReport {
    return {
        ...input,
        registered: input.actions.filter((a) => a.action === 'register').length,
        revoked: input.actions.filter((a) => a.action === 'revoke').length,
        unchanged: input.actions.filter((a) => a.action === 'noop').length,
        errors: input.actions.filter((a) => a.action === 'error').length,
    };
}

async function fetchGoogleJwks(env: Env): Promise<GoogleJwks> {
    const url = env.GOOGLE_JWKS_URL || DEFAULT_GOOGLE_JWKS_URL;
    const response = await fetch(url, {
        headers: { Accept: 'application/json' },
    });
    if (!response.ok) {
        throw new Error(`Google JWKS fetch failed: HTTP ${response.status}`);
    }
    const body = (await response.json()) as Partial<GoogleJwks>;
    if (!body || !Array.isArray(body.keys)) {
        throw new Error('Google JWKS response is missing keys[]');
    }
    return { keys: body.keys };
}

function convertGoogleKeys(jwks: GoogleJwks): ConvertedGoogleKey[] {
    return jwks.keys
        .filter((key) => key.kty === 'RSA' && key.n && (!key.use || key.use === 'sig'))
        .map((key) => {
            const limbs = jwkModulusToLimbs(key.n);
            return {
                kid: key.kid,
                keyHash: hashLimbs(limbs),
                limbs,
                alg: key.alg,
                use: key.use,
            };
        });
}

function jwkModulusToLimbs(modulusBase64Url: string): HexString[] {
    let value = bytesToBigInt(base64UrlToBytes(modulusBase64Url));
    const mask = (1n << LIMB_BITS) - 1n;
    const limbs: HexString[] = [];

    for (let i = 0; i < LIMB_COUNT; i++) {
        limbs.push(bigIntToFieldHex(value & mask));
        value >>= LIMB_BITS;
    }

    return limbs;
}

function hashLimbs(limbs: HexString[]): HexString {
    const packed = concatBytes(limbs.map((limb) => hexToBytes(limb, FIELD_BYTES)));
    return bytesToHex(keccak_256(packed));
}

async function registerKey(
    env: Env,
    key: ConvertedGoogleKey,
    dryRun: boolean,
): Promise<RegistryAction> {
    if (dryRun) {
        return {
            action: 'register',
            kid: key.kid,
            keyHash: key.keyHash,
            reason: 'dry_run_new_key',
        };
    }

    try {
        const txHash = await submitRegistryCall(env, 'register_key', [
            scString(key.kid),
            scVec(key.limbs.map(scBytesN32)),
        ]);
        return {
            action: 'register',
            kid: key.kid,
            keyHash: key.keyHash,
            reason: 'new_google_key',
            txHash,
        };
    } catch (error) {
        return {
            action: 'error',
            kid: key.kid,
            keyHash: key.keyHash,
            reason: 'register_failed',
            error: error instanceof Error ? error.message : String(error),
        };
    }
}

async function revokeKey(
    env: Env,
    key: RegistryKey,
    reason: string,
    dryRun: boolean,
): Promise<RegistryAction> {
    if (dryRun) {
        return {
            action: 'revoke',
            kid: 'unknown',
            keyHash: key.keyHash,
            reason: `dry_run_${reason}`,
        };
    }

    try {
        const txHash = await submitRegistryCall(env, 'revoke_key', [scBytesN32(key.keyHash)]);
        return {
            action: 'revoke',
            kid: 'unknown',
            keyHash: key.keyHash,
            reason,
            txHash,
        };
    } catch (error) {
        return {
            action: 'error',
            kid: 'unknown',
            keyHash: key.keyHash,
            reason: 'revoke_failed',
            error: error instanceof Error ? error.message : String(error),
        };
    }
}

async function loadRegistryKeys(env: Env): Promise<RegistryKey[]> {
    const count = await getRegisteredKeyCount(env);
    const keys: RegistryKey[] = [];

    for (let index = 0; index < count; index += 1) {
        try {
            const keyHash = await getRegisteredKey(env, index);
            const active = await isRegistryKeyValid(env, keyHash);
            keys.push({ keyHash, active });
        } catch (error) {
            // An archived (expired-TTL) KeyAt entry fails the read; skip it so
            // one stale index cannot wedge the whole rotation run. A key that
            // is unreachable here is also unreadable by claim's registry check
            // (archived Key entry reads invalid), so skipping is safe.
            console.error('[jwk-rotation] skipping unreadable registry index', index, error);
        }
    }

    return keys;
}

async function getRegisteredKeyCount(env: Env): Promise<number> {
    const result = await simulateRegistryCall(env, 'get_registered_key_count');
    return Number(scValToNative(result));
}

async function getRegisteredKey(env: Env, index: number): Promise<HexString> {
    const result = await simulateRegistryCall(env, 'get_registered_key', [scU32(index)]);
    return bytesToHex(scValToNative(result) as Buffer);
}

async function isRegistryKeyValid(env: Env, keyHash: HexString): Promise<boolean> {
    const result = await simulateRegistryCall(env, 'is_valid_key_hash', [scBytesN32(keyHash)]);
    return Boolean(scValToNative(result));
}

async function simulateRegistryCall(
    env: Env,
    method: string,
    args: xdr.ScVal[] = [],
): Promise<xdr.ScVal> {
    const server = new rpc.Server(env.STELLAR_RPC_URL);
    const tx = new TransactionBuilder(new Account(SIMULATION_SOURCE, '0'), {
        fee: BASE_FEE,
        networkPassphrase: env.STELLAR_NETWORK_PASSPHRASE,
    })
        .setTimeout(30)
        .addOperation(new Contract(env.JWK_REGISTRY_ADDRESS).call(method, ...args))
        .build();

    const result = await server.simulateTransaction(tx);
    if (rpc.Api.isSimulationError(result)) {
        throw new Error(`Registry simulation failed: ${result.error}`);
    }
    if (!result.result) {
        throw new Error('Registry simulation returned no result');
    }
    return result.result.retval;
}

async function submitRegistryCall(env: Env, method: string, args: xdr.ScVal[]): Promise<string> {
    const keypair = Keypair.fromSecret(env.REGISTRY_OWNER_SECRET);
    const server = new rpc.Server(env.STELLAR_RPC_URL);
    const source = await server.getAccount(keypair.publicKey());
    const tx = new TransactionBuilder(source, {
        fee: BASE_FEE,
        networkPassphrase: env.STELLAR_NETWORK_PASSPHRASE,
    })
        .setTimeout(60)
        .addOperation(new Contract(env.JWK_REGISTRY_ADDRESS).call(method, ...args))
        .build();

    const prepared = await server.prepareTransaction(tx);
    prepared.sign(keypair);

    const sent = await server.sendTransaction(prepared);
    if (sent.status === 'ERROR') {
        throw new Error(`Registry ${method} submission failed`);
    }

    const attempts = Number(env.TX_POLL_ATTEMPTS || '20');
    const receipt = await server.pollTransaction(sent.hash, { attempts });
    if (receipt.status !== rpc.Api.GetTransactionStatus.SUCCESS) {
        throw new Error(`Registry ${method} transaction ${receipt.status}`);
    }

    return sent.hash;
}

function validateConfig(env: Env): void {
    const missing = [
        ['STELLAR_RPC_URL', env.STELLAR_RPC_URL],
        ['STELLAR_NETWORK_PASSPHRASE', env.STELLAR_NETWORK_PASSPHRASE],
        ['JWK_REGISTRY_ADDRESS', env.JWK_REGISTRY_ADDRESS],
        ['REGISTRY_OWNER_SECRET', env.REGISTRY_OWNER_SECRET],
    ].filter(([, value]) => !value);

    if (missing.length > 0) {
        throw new Error(`Missing required config: ${missing.map(([name]) => name).join(', ')}`);
    }
}

async function requireAdmin(request: Request, env: Env): Promise<Response | null> {
    if (!env.ADMIN_TOKEN) {
        return json({ error: 'admin_token_not_configured' }, 503);
    }

    const ip = request.headers.get('CF-Connecting-IP') ?? 'unknown';
    if (isAdminRateLimited(ip)) {
        return json({ error: 'rate_limited' }, 429, { 'Retry-After': '60' });
    }

    const auth = request.headers.get('Authorization') || '';
    const ok = await constantTimeEqual(auth, `Bearer ${env.ADMIN_TOKEN}`);
    if (!ok) {
        recordAdminFailure(ip);
        return json({ error: 'unauthorized' }, 401);
    }

    return null;
}

// Length-independent, constant-time comparison: SHA-256 both sides (so the
// digests are fixed-length regardless of input length, leaking no length
// signal) then XOR-accumulate every byte before a single zero-check. The random
// per-process HMAC-less digest is sufficient here because both operands are
// already opaque secrets; we only need to deny a timing side-channel on the
// byte-by-byte compare that `!==` would expose.
async function constantTimeEqual(a: string, b: string): Promise<boolean> {
    const encoder = new TextEncoder();
    const [da, db] = await Promise.all([
        crypto.subtle.digest('SHA-256', encoder.encode(a)),
        crypto.subtle.digest('SHA-256', encoder.encode(b)),
    ]);
    const va = new Uint8Array(da);
    const vb = new Uint8Array(db);
    let diff = 0;
    for (let i = 0; i < va.length; i += 1) {
        diff |= va[i] ^ vb[i];
    }
    return diff === 0;
}

function isAdminRateLimited(ip: string): boolean {
    const entry = adminFailureState.get(ip);
    if (!entry || Date.now() >= entry.resetAt) return false;
    return entry.count >= ADMIN_RL_MAX_FAILURES;
}

function recordAdminFailure(ip: string): void {
    const now = Date.now();
    if (adminFailureState.size > ADMIN_RL_MAX_KEYS) {
        for (const [key, value] of adminFailureState) {
            if (now >= value.resetAt) adminFailureState.delete(key);
        }
    }
    const entry = adminFailureState.get(ip);
    if (!entry || now >= entry.resetAt) {
        adminFailureState.set(ip, { count: 1, resetAt: now + ADMIN_RL_WINDOW_MS });
        return;
    }
    entry.count += 1;
}

async function sendAlert(env: Env, event: string, report: RotationReport): Promise<void> {
    if (!env.ALERT_WEBHOOK_URL) return;

    try {
        const response = await fetch(env.ALERT_WEBHOOK_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ event, report }),
        });
        if (!response.ok) {
            console.error('[jwk-rotation] alert webhook failed', response.status);
        }
    } catch (error) {
        console.error('[jwk-rotation] alert webhook unreachable', error);
    }
}

function scString(value: string): xdr.ScVal {
    return xdr.ScVal.scvString(value);
}

function scBytesN32(value: HexString): xdr.ScVal {
    return xdr.ScVal.scvBytes(Buffer.from(hexToBytes(value, FIELD_BYTES)));
}

function scVec(values: xdr.ScVal[]): xdr.ScVal {
    return xdr.ScVal.scvVec(values);
}

function scU32(value: number): xdr.ScVal {
    return xdr.ScVal.scvU32(value);
}

function parseBoolean(value: string | undefined | null, fallback: boolean): boolean {
    if (value === undefined || value === null || value === '') return fallback;
    return ['1', 'true', 'yes', 'on'].includes(value.toLowerCase());
}

function base64UrlToBytes(base64url: string): Uint8Array {
    const base64 = base64url.replace(/-/g, '+').replace(/_/g, '/');
    const padding = '='.repeat((4 - (base64.length % 4)) % 4);
    const binary = atob(base64 + padding);
    return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

function bytesToBigInt(bytes: Uint8Array): bigint {
    let value = 0n;
    for (const byte of bytes) {
        value = (value << 8n) + BigInt(byte);
    }
    return value;
}

function bigIntToFieldHex(value: bigint): HexString {
    return `0x${value.toString(16).padStart(FIELD_BYTES * 2, '0')}`;
}

function hexToBytes(value: HexString, expectedBytes?: number): Uint8Array {
    const hex = value.slice(2);
    if (!/^[0-9a-fA-F]*$/.test(hex) || hex.length % 2 !== 0) {
        throw new Error(`Invalid hex string: ${value}`);
    }
    const bytes = new Uint8Array(hex.length / 2);
    for (let i = 0; i < bytes.length; i++) {
        bytes[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
    }
    if (expectedBytes !== undefined && bytes.length !== expectedBytes) {
        throw new Error(`Expected ${expectedBytes} bytes, got ${bytes.length}`);
    }
    return bytes;
}

function bytesToHex(bytes: Uint8Array): HexString {
    return `0x${Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')}`;
}

function concatBytes(chunks: Uint8Array[]): Uint8Array {
    const length = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
    const out = new Uint8Array(length);
    let offset = 0;
    for (const chunk of chunks) {
        out.set(chunk, offset);
        offset += chunk.length;
    }
    return out;
}

function json(body: unknown, status = 200, headers?: Record<string, string>): Response {
    return new Response(JSON.stringify(body, null, 2), {
        status,
        headers: { 'Content-Type': 'application/json', ...headers },
    });
}
