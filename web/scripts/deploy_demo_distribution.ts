import { spawnSync } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, resolve } from 'node:path';

// The Merkle helper is browser-gated because production callers are browser apps.
// For this operational script, importing after defining window enables the same
// Barretenberg path without adding a second hashing implementation.
(globalThis as typeof globalThis & { window?: unknown }).window = globalThis;

type Args = Record<string, string | boolean>;

const PIN_AUTH_VERSION = 'zarf-pin-v1';
const DEFAULT_OWNER_ALIAS = 'zarf-test';
const DEFAULT_EMAIL = 'demo@example.com';
const DEFAULT_PIN = '12345678';
const DEFAULT_AMOUNT = '120';
const DEFAULT_PERIODS = 24;
const DEFAULT_PERIOD_SECONDS = 3600;
const DEFAULT_NAME = 'Stellar-Milestone 2-3 Current Registry Demo';
const DEFAULT_DESCRIPTION = 'Clean demo distribution deployed through current factory';

function parseArgs(argv: string[]): Args {
    const out: Args = {};
    for (let i = 0; i < argv.length; i++) {
        const raw = argv[i];
        if (!raw.startsWith('--')) continue;
        const key = raw.slice(2);
        const next = argv[i + 1];
        if (!next || next.startsWith('--')) {
            out[key] = true;
            continue;
        }
        out[key] = next;
        i++;
    }
    return out;
}

function argString(args: Args, key: string, fallback: string): string {
    const value = args[key];
    return typeof value === 'string' && value.length > 0 ? value : fallback;
}

function argNumber(args: Args, key: string, fallback: number): number {
    const value = args[key];
    if (typeof value !== 'string') return fallback;
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed <= 0) {
        throw new Error(`--${key} must be a positive number`);
    }
    return parsed;
}

function readDotEnv(path: string): Record<string, string> {
    const env: Record<string, string> = {};
    const body = readFileSync(path, 'utf8');
    for (const line of body.split(/\r?\n/)) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;
        const idx = trimmed.indexOf('=');
        if (idx === -1) continue;
        const key = trimmed.slice(0, idx).trim();
        let value = trimmed.slice(idx + 1).trim();
        if (
            (value.startsWith('"') && value.endsWith('"')) ||
            (value.startsWith("'") && value.endsWith("'"))
        ) {
            value = value.slice(1, -1);
        }
        env[key] = value;
    }
    return env;
}

function requireEnv(env: Record<string, string>, key: string): string {
    const value = env[key];
    if (!value) throw new Error(`Missing ${key} in web/.env`);
    return value;
}

function run(
    command: string,
    args: string[],
    opts: { input?: string; allowFailure?: boolean } = {},
): string {
    const res = spawnSync(command, args, {
        cwd: resolve(process.cwd()),
        input: opts.input,
        encoding: 'utf8',
        stdio: ['pipe', 'pipe', 'pipe'],
    });
    const stdout = res.stdout.trim();
    const stderr = res.stderr.trim();
    if (res.status !== 0 && !opts.allowFailure) {
        throw new Error(
            `${command} ${args.join(' ')} failed with ${res.status}\n${stderr || stdout}`,
        );
    }
    return [stdout, stderr].filter(Boolean).join('\n').trim();
}

function lastMatchingLine(output: string, pattern: RegExp): string {
    const lines = output
        .split(/\r?\n/)
        .map((line) => line.trim().replace(/^"|"$/g, ''))
        .filter(Boolean);
    for (let i = lines.length - 1; i >= 0; i--) {
        const match = lines[i].match(pattern);
        if (match) return match[0];
    }
    throw new Error(`Could not parse expected value from output:\n${output}`);
}

function strip0x(hex: string): string {
    return hex.startsWith('0x') ? hex.slice(2) : hex;
}

function sha256Hex(value: string): string {
    return createHash('sha256').update(value).digest('hex');
}

function parseDecimalToBaseUnits(value: string, decimals: number): bigint {
    const trimmed = value.trim();
    if (!/^\d+(\.\d+)?$/.test(trimmed)) {
        throw new Error(`Invalid decimal amount: ${value}`);
    }
    const [whole, fraction = ''] = trimmed.split('.');
    if (fraction.length > decimals) {
        throw new Error(`Amount has more than ${decimals} decimals: ${value}`);
    }
    return BigInt(whole + fraction.padEnd(decimals, '0'));
}

function previousUtcMidnight(): Date {
    const now = new Date();
    const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    start.setUTCDate(start.getUTCDate() - 1);
    return start;
}

function buildPinAuthMessage(input: {
    owner: string;
    merkleRoot: string;
    bodyHash: string;
    issuedAt: number;
}): string {
    return [
        PIN_AUTH_VERSION,
        `owner:${input.owner}`,
        `merkleRoot:${input.merkleRoot}`,
        `bodyHash:${input.bodyHash}`,
        `issuedAt:${input.issuedAt}`,
    ].join('\n');
}

async function pinClaimList(input: {
    pinProxyUrl: string;
    owner: string;
    ownerAlias: string;
    merkleRoot: string;
    body: string;
}): Promise<string> {
    const bodyHash = sha256Hex(input.body);
    const issuedAt = Date.now();
    const message = buildPinAuthMessage({
        owner: input.owner,
        merkleRoot: input.merkleRoot,
        bodyHash,
        issuedAt,
    });
    const signOutput = run('stellar', ['message', 'sign', '--sign-with-key', input.ownerAlias], {
        input: message,
    });
    const signature = lastMatchingLine(signOutput, /[A-Za-z0-9+/]{80,}={0,2}/);

    const res = await fetch(`${input.pinProxyUrl.replace(/\/+$/, '')}/pin`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'X-Zarf-Owner': input.owner,
            'X-Zarf-Issued-At': String(issuedAt),
            'X-Zarf-Body-SHA256': bodyHash,
            'X-Zarf-Signature': signature,
        },
        body: input.body,
    });
    if (!res.ok) {
        throw new Error(`pin proxy failed: HTTP ${res.status} ${await res.text()}`);
    }
    const json = (await res.json()) as { cid?: string };
    if (!json.cid) throw new Error('pin proxy response missing cid');
    return json.cid;
}

async function main() {
    const args = parseArgs(process.argv.slice(2));
    const webRoot = basename(process.cwd()) === 'web' ? process.cwd() : resolve('web');
    const env = readDotEnv(resolve(webRoot, '.env'));

    const ownerAlias = argString(args, 'source', DEFAULT_OWNER_ALIAS);
    const owner = run('stellar', ['keys', 'address', ownerAlias]).trim();
    const email = argString(args, 'email', DEFAULT_EMAIL).toLowerCase().trim();
    const pin = argString(args, 'pin', DEFAULT_PIN);
    const amountHuman = argString(args, 'amount', DEFAULT_AMOUNT);
    const periods = argNumber(args, 'periods', DEFAULT_PERIODS);
    const tokenDecimals = argNumber(args, 'decimals', 7);
    const tokenAddress = argString(
        args,
        'token',
        requireEnv(env, 'VITE_STELLAR_TESTNET_TOKEN_ADDRESS'),
    );
    const factoryAddress = argString(
        args,
        'factory',
        requireEnv(env, 'VITE_STELLAR_TESTNET_FACTORY_ADDRESS'),
    );
    const clientId = requireEnv(env, 'VITE_GOOGLE_CLIENT_ID');
    const pinProxyUrl = requireEnv(env, 'VITE_PIN_PROXY_URL');
    const name = argString(args, 'name', DEFAULT_NAME);
    const description = argString(args, 'description', DEFAULT_DESCRIPTION);
    const start = args['start'] ? new Date(argString(args, 'start', '')) : previousUtcMidnight();
    if (!Number.isFinite(start.getTime())) {
        throw new Error('--start must be a valid date string');
    }

    const amountBase = parseDecimalToBaseUnits(amountHuman, tokenDecimals);
    const schedule = {
        cliffEndDate: start.toISOString(),
        cliffTime: '00:00',
        distributionDuration: periods,
        durationUnit: 'hours' as const,
    };

    console.log('Generating Merkle claim list...');
    const [{ processWhitelist, hashAudience }, { buildClaimList, serializeClaimList }, adapter] =
        await Promise.all([
            import('@zarf/core/crypto/merkleTree'),
            import('@zarf/core/domain/claimListBuilder'),
            import('@zarf/core/domain/merkleResultAdapter'),
        ]);

    const result = await processWhitelist([{ email, amount: amountBase, pin }], schedule);
    const factoryInputs = adapter.buildFactoryDeployInputs(result.claims, result.root);
    const claimList = await buildClaimList({
        claims: result.claims,
        root: result.root,
        cliffSeconds: 0n,
        vestingSeconds: BigInt(periods * DEFAULT_PERIOD_SECONDS),
        periodSeconds: BigInt(DEFAULT_PERIOD_SECONDS),
    });
    const body = serializeClaimList(claimList);
    const audienceHash = await hashAudience(clientId);
    const salt = strip0x(argString(args, 'salt', randomBytes(32).toString('hex')));

    if (factoryInputs.totalAllocation !== amountBase) {
        throw new Error('Merkle allocation total does not match requested amount');
    }

    // The PIN is the claim credential. The well-known demo default is fine to
    // persist/print; a custom one must never land in world-readable /tmp.
    const pinForDisplay = pin === DEFAULT_PIN ? pin : '<redacted — provided via --pin>';

    const artifactDir = resolve('/tmp', `zarf-demo-${Date.now()}`);
    mkdirSync(artifactDir, { recursive: true, mode: 0o700 });
    writeFileSync(resolve(artifactDir, 'claim-list.json'), body, { mode: 0o600 });
    writeFileSync(
        resolve(artifactDir, 'demo-summary.json'),
        JSON.stringify(
            {
                ownerAlias,
                owner,
                email,
                pin: pinForDisplay,
                amountHuman,
                amountBase: amountBase.toString(),
                periods,
                tokenDecimals,
                tokenAddress,
                factoryAddress,
                merkleRoot: factoryInputs.merkleRoot,
                audienceHash,
                salt: `0x${salt}`,
                scheduleStart: start.toISOString(),
            },
            null,
            2,
        ),
        { mode: 0o600 },
    );

    if (args['dry-run']) {
        console.log('\nDry run complete');
        console.log(`factory=${factoryAddress}`);
        console.log(`token=${tokenAddress}`);
        console.log(`owner=${owner}`);
        console.log(`merkleRoot=${factoryInputs.merkleRoot}`);
        console.log(`recipientCount=${factoryInputs.recipientCount}`);
        console.log(`amountBase=${amountBase}`);
        console.log(`artifactDir=${artifactDir}`);
        return;
    }

    console.log('Pinning claim list...');
    const cid = await pinClaimList({
        pinProxyUrl,
        owner,
        ownerAlias,
        merkleRoot: factoryInputs.merkleRoot,
        body,
    });

    console.log('Predicting vesting address...');
    const predictedOutput = run('stellar', [
        'contract',
        'invoke',
        '--id',
        factoryAddress,
        '--source',
        ownerAlias,
        '--network',
        'testnet',
        '--send',
        'no',
        '--',
        'predict_vesting_address',
        '--owner',
        owner,
        '--salt',
        salt,
    ]);
    const predicted = lastMatchingLine(predictedOutput, /C[A-Z2-7]{55}/);

    console.log('Approving factory funding...');
    const latest = run('stellar', ['ledger', 'latest', '--network', 'testnet', '--output', 'json']);
    const sequence = Number(JSON.parse(lastMatchingLine(latest, /\{.*\}/)).sequence);
    const expirationLedger = sequence + 100_000;
    run('stellar', [
        'contract',
        'invoke',
        '--id',
        tokenAddress,
        '--source',
        ownerAlias,
        '--network',
        'testnet',
        '--auto-sign',
        '--',
        'approve',
        '--from',
        owner,
        '--spender',
        factoryAddress,
        '--amount',
        amountBase.toString(),
        '--expiration_ledger',
        String(expirationLedger),
    ]);

    console.log('Creating and funding vesting contract...');
    run('stellar', [
        'contract',
        'invoke',
        '--id',
        factoryAddress,
        '--source',
        ownerAlias,
        '--network',
        'testnet',
        '--auto-sign',
        '--',
        'create_campaign',
        '--owner',
        owner,
        '--token',
        tokenAddress,
        '--salt',
        salt,
        '--claim_authorization',
        '0',
        '--claim_schedule',
        '0',
        '--reclaim_policy',
        '0',
        '--name',
        JSON.stringify(name),
        '--description',
        JSON.stringify(description),
        '--merkle_root',
        strip0x(factoryInputs.merkleRoot),
        '--audience_hash',
        strip0x(audienceHash),
        '--recipient_count',
        String(factoryInputs.recipientCount),
        '--total_amount',
        amountBase.toString(),
        '--claim_deadline',
        '0',
        '--metadata_cid',
        JSON.stringify(cid),
        '--funding_mode',
        '1',
    ]);
    const deployed = predicted;

    console.log('Verifying deployed summary...');
    const summary = run('stellar', [
        'contract',
        'invoke',
        '--id',
        deployed,
        '--source',
        ownerAlias,
        '--network',
        'testnet',
        '--send',
        'no',
        '--',
        'summary',
    ]);

    writeFileSync(
        resolve(artifactDir, 'deployment.json'),
        JSON.stringify(
            {
                vestingAddress: deployed,
                predicted,
                cid,
                explorerUrl: `https://stellar.expert/explorer/testnet/contract/${deployed}`,
                artifactDir,
                summary,
            },
            null,
            2,
        ),
        { mode: 0o600 },
    );

    console.log('\nDemo distribution deployed');
    console.log(`vesting=${deployed}`);
    console.log(`predicted=${predicted}`);
    console.log(`factory=${factoryAddress}`);
    console.log(`token=${tokenAddress}`);
    console.log(`metadataCid=${cid}`);
    console.log(`merkleRoot=${factoryInputs.merkleRoot}`);
    console.log(`recipient=${email}`);
    console.log(`pin=${pinForDisplay}`);
    console.log(`periods=${periods}`);
    console.log(`amountBase=${amountBase}`);
    console.log(`artifactDir=${artifactDir}`);
    console.log('\nSummary:');
    console.log(summary);
}

main()
    .then(() => {
        process.exit(0);
    })
    .catch((error) => {
        console.error(error instanceof Error ? error.message : error);
        process.exit(1);
    });
