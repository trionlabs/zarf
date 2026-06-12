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

// Revocation safety rails. A single malformed/empty Google response, or a
// compromised JWKS URL, must never be able to revoke every registry key and
// brick all claims until the next rotation.
const MIN_FETCHED_KEYS = 2; // Google normally serves 2-3 overlapping keys
const DEFAULT_MIN_ACTIVE_KEYS = 2;
const DEFAULT_MAX_REVOCATIONS_PER_RUN = 1;
const DEFAULT_REVOKE_GRACE_HOURS = 48; // Google id_tokens live <=1h after key removal
const GRACE_MARKER_TTL_SECONDS = 90 * 24 * 3600;

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
    MIN_ACTIVE_KEYS?: string;
    MAX_REVOCATIONS_PER_RUN?: string;
    REVOKE_GRACE_HOURS?: string;
    // Registry v2 mode: keys are PROPOSED (timelocked) instead of registered
    // immediately, activated once the on-chain delay elapses, and revoked via
    // operator_revoke_key. The signer secret then holds the OPERATOR key, not
    // the owner. Flip to "true" when the v2 registry contract is deployed.
    REGISTRY_V2?: string;
    // Optional KV namespace persisting first-missing timestamps so a key is
    // only revoked after it has been absent from Google's JWKS for the full
    // grace window. Without the binding the rails above still bound damage.
    ROTATION_STATE?: KVNamespace;
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
    action: 'register' | 'propose' | 'activate' | 'revoke' | 'noop' | 'error';
    kid: string;
    keyHash: HexString;
    reason: string;
    txHash?: string;
    error?: string;
}

interface PendingEntry {
    keyHash: HexString;
    kid: string;
    activateAfter: number;
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
    proposed: number;
    activated: number;
    revoked: number;
    unchanged: number;
    errors: number;
}

type HexString = `0x${string}`;

export default {
    async fetch(request: Request, env: Env): Promise<Response> {
        const url = new URL(request.url);

        if (url.pathname === '/health' && request.method === 'GET') {
            // Configuration details are admin-only (see /state); anonymous
            // callers learn nothing beyond liveness.
            return json({ ok: true });
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
                config: {
                    hasRegistry: Boolean(env.JWK_REGISTRY_ADDRESS),
                    hasRpc: Boolean(env.STELLAR_RPC_URL),
                    hasOwnerSecret: Boolean(env.REGISTRY_OWNER_SECRET),
                    hasAdminToken: Boolean(env.ADMIN_TOKEN),
                    hasGraceState: Boolean(env.ROTATION_STATE),
                },
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
        const v2 = parseBoolean(env.REGISTRY_V2, false);
        const [jwks, registryKeys, pendingKeys] = await Promise.all([
            fetchGoogleJwks(env),
            loadRegistryKeys(env),
            v2 ? loadPendingKeys(env) : Promise.resolve([] as PendingEntry[]),
        ]);
        currentKeys.push(...convertGoogleKeys(jwks));
        const currentHashes = new Set(currentKeys.map((key) => key.keyHash));
        const activeRegistryHashes = new Set(
            registryKeys.filter((key) => key.active).map((key) => key.keyHash),
        );
        const pendingByHash = new Map(pendingKeys.map((entry) => [entry.keyHash, entry]));

        // Monitoring window: any on-chain key — active or pending — that is
        // NOT in Google's live JWKS is either stale (will age out through
        // the grace rails below) or evidence of a compromised signer key
        // staging a malicious key. Alert loudly either way; for a pending
        // key the activation delay is exactly the time to cancel it.
        const unexpected = [
            ...registryKeys
                .filter((key) => key.active && !currentHashes.has(key.keyHash))
                .map((key) => ({ keyHash: key.keyHash, state: 'active' })),
            ...pendingKeys
                .filter((entry) => !currentHashes.has(entry.keyHash))
                .map((entry) => ({ keyHash: entry.keyHash, state: 'pending' })),
        ];
        if (unexpected.length > 0) {
            await sendRawAlert(env, 'registry_keys_not_in_google_jwks', { unexpected });
        }

        for (const key of currentKeys) {
            if (activeRegistryHashes.has(key.keyHash)) {
                actions.push({
                    action: 'noop',
                    kid: key.kid,
                    keyHash: key.keyHash,
                    reason: 'already_active_on_chain',
                });
                continue;
            }

            if (!v2) {
                const action = await registerKey(env, key, options.dryRun);
                actions.push(action);
                continue;
            }

            const pending = pendingByHash.get(key.keyHash);
            if (!pending) {
                actions.push(await proposeKey(env, key, options.dryRun));
            } else if (Date.now() / 1000 >= pending.activateAfter) {
                actions.push(await activatePendingKey(env, key, options.dryRun));
            } else {
                actions.push({
                    action: 'noop',
                    kid: key.kid,
                    keyHash: key.keyHash,
                    reason: 'pending_activation_delay',
                });
            }
        }

        if (parseBoolean(env.REVOKE_REMOVED_KEYS, true)) {
            const revocations = await executeRevocations(env, {
                currentKeys,
                currentHashes,
                registryKeys,
                registeredThisRun: actions.filter((a) => a.action === 'register').length,
                dryRun: options.dryRun,
            });
            actions.push(...revocations);
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
    input: Omit<
        RotationReport,
        'registered' | 'proposed' | 'activated' | 'revoked' | 'unchanged' | 'errors'
    >,
): RotationReport {
    return {
        ...input,
        registered: input.actions.filter((a) => a.action === 'register').length,
        proposed: input.actions.filter((a) => a.action === 'propose').length,
        activated: input.actions.filter((a) => a.action === 'activate').length,
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

export function jwkModulusToLimbs(modulusBase64Url: string): HexString[] {
    let value = bytesToBigInt(base64UrlToBytes(modulusBase64Url));
    const mask = (1n << LIMB_BITS) - 1n;
    const limbs: HexString[] = [];

    for (let i = 0; i < LIMB_COUNT; i++) {
        limbs.push(bigIntToFieldHex(value & mask));
        value >>= LIMB_BITS;
    }

    return limbs;
}

export function hashLimbs(limbs: HexString[]): HexString {
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

async function proposeKey(
    env: Env,
    key: ConvertedGoogleKey,
    dryRun: boolean,
): Promise<RegistryAction> {
    if (dryRun) {
        return {
            action: 'propose',
            kid: key.kid,
            keyHash: key.keyHash,
            reason: 'dry_run_new_key',
        };
    }

    try {
        const txHash = await submitRegistryCall(env, 'propose_key', [
            scString(key.kid),
            scVec(key.limbs.map(scBytesN32)),
        ]);
        return {
            action: 'propose',
            kid: key.kid,
            keyHash: key.keyHash,
            reason: 'new_google_key_timelocked',
            txHash,
        };
    } catch (error) {
        return {
            action: 'error',
            kid: key.kid,
            keyHash: key.keyHash,
            reason: 'propose_failed',
            error: error instanceof Error ? error.message : String(error),
        };
    }
}

async function activatePendingKey(
    env: Env,
    key: ConvertedGoogleKey,
    dryRun: boolean,
): Promise<RegistryAction> {
    if (dryRun) {
        return {
            action: 'activate',
            kid: key.kid,
            keyHash: key.keyHash,
            reason: 'dry_run_delay_elapsed',
        };
    }

    try {
        const txHash = await submitRegistryCall(env, 'activate_key', [scBytesN32(key.keyHash)]);
        return {
            action: 'activate',
            kid: key.kid,
            keyHash: key.keyHash,
            reason: 'activation_delay_elapsed',
            txHash,
        };
    } catch (error) {
        return {
            action: 'error',
            kid: key.kid,
            keyHash: key.keyHash,
            reason: 'activate_failed',
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

    // v2 splits roles: the worker holds the operator key, whose revocation
    // entrypoint is operator_revoke_key (owner-only revoke_key remains).
    const method = parseBoolean(env.REGISTRY_V2, false) ? 'operator_revoke_key' : 'revoke_key';

    try {
        const txHash = await submitRegistryCall(env, method, [scBytesN32(key.keyHash)]);
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

interface RevocationContext {
    currentKeys: ConvertedGoogleKey[];
    currentHashes: Set<HexString>;
    registryKeys: RegistryKey[];
    registeredThisRun: number;
    dryRun: boolean;
}

/**
 * Revoke registry keys that disappeared from Google's JWKS, bounded by
 * safety rails so no single rotation run can take the registry down:
 *
 * 1. A Google response with fewer than MIN_FETCHED_KEYS valid keys aborts
 *    all revocations (empty/malformed responses revoke nothing).
 * 2. A key must have been missing for the full grace window before it is
 *    revoked (tracked in the optional ROTATION_STATE KV; keys that reappear
 *    have their marker cleared).
 * 3. At most MAX_REVOCATIONS_PER_RUN keys are revoked per run.
 * 4. Revocations never drop the active key count below MIN_ACTIVE_KEYS.
 */
async function executeRevocations(env: Env, ctx: RevocationContext): Promise<RegistryAction[]> {
    const actions: RegistryAction[] = [];
    const staleKeys = ctx.registryKeys.filter(
        (key) => key.active && !ctx.currentHashes.has(key.keyHash),
    );

    if (staleKeys.length === 0) return actions;

    if (ctx.currentKeys.length < MIN_FETCHED_KEYS) {
        actions.push({
            action: 'noop',
            kid: 'rotation',
            keyHash: ZERO_HASH,
            reason: `revocations_skipped_google_returned_${ctx.currentKeys.length}_keys`,
        });
        return actions;
    }

    // Clear grace markers for keys that are present again.
    if (env.ROTATION_STATE && !ctx.dryRun) {
        for (const key of ctx.registryKeys) {
            if (ctx.currentHashes.has(key.keyHash)) {
                await env.ROTATION_STATE.delete(graceMarkerKey(key.keyHash));
            }
        }
    }

    const maxRevocations = parsePositiveInt(
        env.MAX_REVOCATIONS_PER_RUN,
        DEFAULT_MAX_REVOCATIONS_PER_RUN,
    );
    const minActive = parsePositiveInt(env.MIN_ACTIVE_KEYS, DEFAULT_MIN_ACTIVE_KEYS);
    const graceMs =
        parsePositiveInt(env.REVOKE_GRACE_HOURS, DEFAULT_REVOKE_GRACE_HOURS) * 3_600_000;

    let activeCount = ctx.registryKeys.filter((key) => key.active).length + ctx.registeredThisRun;
    let revoked = 0;

    for (const key of staleKeys) {
        const grace = await checkGraceWindow(env, key.keyHash, graceMs, ctx.dryRun);
        if (grace !== 'elapsed') {
            actions.push({
                action: 'noop',
                kid: 'unknown',
                keyHash: key.keyHash,
                reason: grace === 'started' ? 'grace_period_started' : 'within_grace_period',
            });
            continue;
        }

        if (revoked >= maxRevocations) {
            actions.push({
                action: 'noop',
                kid: 'unknown',
                keyHash: key.keyHash,
                reason: 'revocation_budget_exhausted',
            });
            continue;
        }

        if (activeCount - 1 < minActive) {
            actions.push({
                action: 'noop',
                kid: 'unknown',
                keyHash: key.keyHash,
                reason: 'would_drop_below_min_active_keys',
            });
            continue;
        }

        const action = await revokeKey(env, key, 'removed_from_google_jwks', ctx.dryRun);
        actions.push(action);
        if (action.action === 'revoke') {
            revoked += 1;
            activeCount -= 1;
            if (env.ROTATION_STATE && !ctx.dryRun) {
                await env.ROTATION_STATE.delete(graceMarkerKey(key.keyHash));
            }
        }
    }

    return actions;
}

type GraceStatus = 'started' | 'pending' | 'elapsed';

async function checkGraceWindow(
    env: Env,
    keyHash: HexString,
    graceMs: number,
    dryRun: boolean,
): Promise<GraceStatus> {
    // Without the KV binding there is no persistence for first-missing
    // timestamps; the remaining rails (min fetched, max per run, min active)
    // still bound the damage of a bad JWKS response.
    if (!env.ROTATION_STATE) return 'elapsed';

    const marker = await env.ROTATION_STATE.get(graceMarkerKey(keyHash));
    if (marker === null) {
        if (!dryRun) {
            await env.ROTATION_STATE.put(graceMarkerKey(keyHash), String(Date.now()), {
                expirationTtl: GRACE_MARKER_TTL_SECONDS,
            });
        }
        return 'started';
    }

    const firstMissingAt = Number(marker);
    if (!Number.isFinite(firstMissingAt)) return 'started';
    return Date.now() - firstMissingAt >= graceMs ? 'elapsed' : 'pending';
}

function graceMarkerKey(keyHash: HexString): string {
    return `firstMissingAt:${keyHash}`;
}

export function parsePositiveInt(value: string | undefined, fallback: number): number {
    const parsed = Number(value);
    return Number.isInteger(parsed) && parsed >= 0 ? parsed : fallback;
}

async function loadRegistryKeys(env: Env): Promise<RegistryKey[]> {
    const count = await getRegisteredKeyCount(env);
    const keys: RegistryKey[] = [];
    let unreadable = 0;

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
            unreadable += 1;
            console.error('[jwk-rotation] skipping unreadable registry index', index, error);
        }
    }

    // Every index failing is not archival — it is a systemic RPC/registry
    // outage. Abort instead of proceeding with an empty view of the registry
    // (which would make every Google key look unregistered).
    if (count > 0 && unreadable === count) {
        throw new Error(`All ${count} registry indices failed to read; aborting rotation`);
    }

    return keys;
}

async function loadPendingKeys(env: Env): Promise<PendingEntry[]> {
    const count = Number(scValToNative(await simulateRegistryCall(env, 'get_pending_count')));
    const pendings: PendingEntry[] = [];

    for (let index = 0; index < count; index += 1) {
        try {
            const hashResult = await simulateRegistryCall(env, 'get_pending_at', [scU32(index)]);
            const keyHash = bytesToHex(scValToNative(hashResult) as Buffer);
            const pendingResult = await simulateRegistryCall(env, 'get_pending', [
                scBytesN32(keyHash),
            ]);
            const native = scValToNative(pendingResult) as {
                kid?: unknown;
                activate_after?: unknown;
            } | null;
            if (!native) continue;
            pendings.push({
                keyHash,
                kid: typeof native.kid === 'string' ? native.kid : 'unknown',
                activateAfter: Number(native.activate_after ?? 0),
            });
        } catch (error) {
            console.error('[jwk-rotation] skipping unreadable pending index', index, error);
        }
    }

    return pendings;
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

    const auth = request.headers.get('Authorization') || '';
    const equal = await constantTimeStringEqual(auth, `Bearer ${env.ADMIN_TOKEN}`);
    if (!equal) {
        return json({ error: 'unauthorized' }, 401);
    }

    return null;
}

/**
 * Compare secrets without leaking timing. Hashing both sides first
 * normalizes lengths, so the byte comparison runs over fixed-size digests.
 */
async function constantTimeStringEqual(a: string, b: string): Promise<boolean> {
    const encoder = new TextEncoder();
    const [digestA, digestB] = await Promise.all([
        crypto.subtle.digest('SHA-256', encoder.encode(a)),
        crypto.subtle.digest('SHA-256', encoder.encode(b)),
    ]);
    const bytesA = new Uint8Array(digestA);
    const bytesB = new Uint8Array(digestB);
    let diff = 0;
    for (let i = 0; i < bytesA.length; i += 1) {
        diff |= bytesA[i] ^ bytesB[i];
    }
    return diff === 0;
}

async function sendAlert(env: Env, event: string, report: RotationReport): Promise<void> {
    await sendRawAlert(env, event, { report });
}

async function sendRawAlert(env: Env, event: string, payload: object): Promise<void> {
    if (!env.ALERT_WEBHOOK_URL) return;

    try {
        const response = await fetch(env.ALERT_WEBHOOK_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ event, ...payload }),
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

export function parseBoolean(value: string | undefined | null, fallback: boolean): boolean {
    if (value === undefined || value === null || value === '') return fallback;
    return ['1', 'true', 'yes', 'on'].includes(value.toLowerCase());
}

export function base64UrlToBytes(base64url: string): Uint8Array {
    const base64 = base64url.replace(/-/g, '+').replace(/_/g, '/');
    const padding = '='.repeat((4 - (base64.length % 4)) % 4);
    const binary = atob(base64 + padding);
    return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

export function bytesToBigInt(bytes: Uint8Array): bigint {
    let value = 0n;
    for (const byte of bytes) {
        value = (value << 8n) + BigInt(byte);
    }
    return value;
}

export function bigIntToFieldHex(value: bigint): HexString {
    return `0x${value.toString(16).padStart(FIELD_BYTES * 2, '0')}`;
}

export function hexToBytes(value: HexString, expectedBytes?: number): Uint8Array {
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

export function bytesToHex(bytes: Uint8Array): HexString {
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

function json(body: unknown, status = 200): Response {
    return new Response(JSON.stringify(body, null, 2), {
        status,
        headers: { 'Content-Type': 'application/json' },
    });
}
