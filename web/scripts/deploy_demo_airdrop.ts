/**
 * Deploy a UI-claimable wallet airdrop on testnet for QA.
 *
 * Sibling of deploy_demo_distribution.ts (ZK vesting). Builds the keccak Merkle
 * claim-list via @zarf/core/merkle, pins it to the pin-proxy /pin-airdrop route,
 * deploys + funds the instance through the unified factory, and prints the
 * airdrop-claim link (?a=<airdrop>&cid=<cid>).
 *
 *   cd web && ./node_modules/.bin/tsx scripts/deploy_demo_airdrop.ts \
 *     --source zarf-creator --token <USDC_SAC> [--deadline 0] [--locked false] [--dry-run]
 */
import { spawnSync } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, resolve } from 'node:path';

// merkle/tree is keccak-only (no Barretenberg) but the package is browser-gated
// in places; defining window keeps the import path identical to the app's.
(globalThis as typeof globalThis & { window?: unknown }).window = globalThis;

const PIN_AUTH_VERSION = 'zarf-pin-v1';

// The QA recipient set (human amounts; base units derived from --decimals).
const RECIPIENTS: Array<{ address: string; human: string }> = [
    { address: 'GBJ6JPQWEZJYYDBBYWRHPI3CQGRQSQ7K62ZKOATIXCAKU62FJUNHH3N3', human: '10' }, // recipient-1
    { address: 'GB3VIHJ5G64DC2R5MFPJAS65KUSZAGKTIBNWMMQLFPUT4HI5WU6LBT32', human: '20' }, // recipient-2
    { address: 'GCUOTFD5XKP4BJCF2TOHYFR3PLFXTL5XHPEXHLTF72JRXYUR42KNGEUX', human: '30' }, // recipient-3
];

type Args = Record<string, string | boolean>;

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
    const v = args[key];
    return typeof v === 'string' && v.length > 0 ? v : fallback;
}

function readDotEnv(path: string): Record<string, string> {
    const env: Record<string, string> = {};
    const body = readFileSync(path, 'utf8');
    for (const line of body.split(/\r?\n/)) {
        const t = line.trim();
        if (!t || t.startsWith('#')) continue;
        const idx = t.indexOf('=');
        if (idx === -1) continue;
        const key = t.slice(0, idx).trim();
        let value = t.slice(idx + 1).trim();
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
    const v = env[key];
    if (!v) throw new Error(`Missing ${key} in web/.env`);
    return v;
}

function run(command: string, args: string[], opts: { input?: string } = {}): string {
    const res = spawnSync(command, args, {
        cwd: resolve(process.cwd()),
        input: opts.input,
        encoding: 'utf8',
        stdio: ['pipe', 'pipe', 'pipe'],
    });
    const stdout = (res.stdout || '').trim();
    const stderr = (res.stderr || '').trim();
    if (res.status !== 0) {
        throw new Error(`${command} ${args.join(' ')} failed with ${res.status}\n${stderr || stdout}`);
    }
    return [stdout, stderr].filter(Boolean).join('\n').trim();
}

function lastMatchingLine(output: string, pattern: RegExp): string {
    const lines = output
        .split(/\r?\n/)
        .map((l) => l.trim().replace(/^"|"$/g, ''))
        .filter(Boolean);
    for (let i = lines.length - 1; i >= 0; i--) {
        const m = lines[i].match(pattern);
        if (m) return m[0];
    }
    throw new Error(`Could not parse expected value from output:\n${output}`);
}

function strip0x(hex: string): string {
    return hex.startsWith('0x') ? hex.slice(2) : hex;
}

function sha256Hex(value: string): string {
    return createHash('sha256').update(value).digest('hex');
}

function toBaseUnits(human: string, decimals: number): bigint {
    const t = human.trim();
    if (!/^\d+(\.\d+)?$/.test(t)) throw new Error(`Invalid amount: ${human}`);
    const [whole, fraction = ''] = t.split('.');
    if (fraction.length > decimals) throw new Error(`Amount has > ${decimals} decimals: ${human}`);
    return BigInt(whole + fraction.padEnd(decimals, '0'));
}

function buildPinAuthMessage(i: { owner: string; merkleRoot: string; bodyHash: string; issuedAt: number }): string {
    return [
        PIN_AUTH_VERSION,
        `owner:${i.owner}`,
        `merkleRoot:${i.merkleRoot}`,
        `bodyHash:${i.bodyHash}`,
        `issuedAt:${i.issuedAt}`,
    ].join('\n');
}

async function pinAirdropList(i: {
    pinProxyUrl: string;
    owner: string;
    ownerAlias: string;
    root: string; // 0x-prefixed
    body: string;
}): Promise<string> {
    const bodyHash = sha256Hex(i.body);
    const issuedAt = Date.now();
    const message = buildPinAuthMessage({ owner: i.owner, merkleRoot: i.root, bodyHash, issuedAt });
    const signOutput = run('stellar', ['message', 'sign', '--sign-with-key', i.ownerAlias], { input: message });
    const signature = lastMatchingLine(signOutput, /[A-Za-z0-9+/]{80,}={0,2}/);
    const res = await fetch(`${i.pinProxyUrl.replace(/\/+$/, '')}/pin-airdrop`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'X-Zarf-Owner': i.owner,
            'X-Zarf-Issued-At': String(issuedAt),
            'X-Zarf-Body-SHA256': bodyHash,
            'X-Zarf-Signature': signature,
        },
        body: i.body,
    });
    if (!res.ok) throw new Error(`pin proxy /pin-airdrop failed: HTTP ${res.status} ${await res.text()}`);
    const json = (await res.json()) as { cid?: string };
    if (!json.cid) throw new Error('pin proxy response missing cid');
    return json.cid;
}

async function main() {
    const args = parseArgs(process.argv.slice(2));
    const webRoot = basename(process.cwd()) === 'web' ? process.cwd() : resolve('web');
    const env = readDotEnv(resolve(webRoot, '.env'));

    const ownerAlias = argString(args, 'source', 'zarf-creator');
    const owner = run('stellar', ['keys', 'address', ownerAlias]).trim();
    const token = argString(args, 'token', requireEnv(env, 'VITE_STELLAR_TESTNET_TOKEN_ADDRESS'));
    const factory = argString(
        args,
        'factory',
        requireEnv(env, 'VITE_STELLAR_TESTNET_FACTORY_ADDRESS'),
    );
    // Prod pin.zarf.to is pre-integration and lacks /pin-airdrop; override with a
    // local pin-proxy (wrangler dev + PINATA_JWT) until integration is deployed:
    //   --pin-proxy http://127.0.0.1:8787
    const pinProxyUrl = argString(args, 'pin-proxy', requireEnv(env, 'VITE_PIN_PROXY_URL'));
    const network = 'testnet';
    const decimals = Number(argString(args, 'decimals', '7'));
    const deadline = Number(argString(args, 'deadline', '0')); // 0 = no deadline
    const locked = args['locked'] === true || args['locked'] === 'true';
    const salt = strip0x(argString(args, 'salt', randomBytes(32).toString('hex')));

    const rows = RECIPIENTS.map((r) => ({ address: r.address, amount: toBaseUnits(r.human, decimals).toString() }));
    const total = rows.reduce((acc, r) => acc + BigInt(r.amount), 0n);

    console.log('Predicting airdrop address...');
    const predictedOutput = run('stellar', [
        'contract', 'invoke', '--id', factory, '--source', ownerAlias,
        '--network', network, '--send', 'no', '--',
        'predict_airdrop_address', '--owner', owner, '--salt', salt,
    ]);
    const predicted = lastMatchingLine(predictedOutput, /C[A-Z2-7]{55}/);
    console.log(`predicted=${predicted}`);

    console.log('Building claim-list...');
    const { buildClaimList, serializeClaimList } = await import('@zarf/core/merkle');
    const doc = buildClaimList({ network, airdrop: predicted, token }, rows);
    const body = serializeClaimList(doc);

    const artifactDir = resolve('/tmp', `zarf-airdrop-${Date.now()}`);
    mkdirSync(artifactDir, { recursive: true, mode: 0o700 });
    writeFileSync(resolve(artifactDir, 'claim-list.json'), body, { mode: 0o600 });

    if (args['dry-run']) {
        console.log('\nDry run complete');
        console.log(`factory=${factory}`);
        console.log(`token=${token}`);
        console.log(`owner=${owner}`);
        console.log(`predicted=${predicted}`);
        console.log(`root=${doc.root}`);
        console.log(`recipientCount=${rows.length}`);
        console.log(`total=${total}`);
        console.log(`artifactDir=${artifactDir}`);
        return;
    }

    console.log('Pinning claim-list to /pin-airdrop...');
    const cid = await pinAirdropList({ pinProxyUrl, owner, ownerAlias, root: doc.root, body });
    console.log(`cid=${cid}`);

    console.log('Approving factory funding...');
    const latest = run('stellar', ['ledger', 'latest', '--network', network, '--output', 'json']);
    const sequence = Number(JSON.parse(lastMatchingLine(latest, /\{.*\}/)).sequence);
    run('stellar', [
        'contract', 'invoke', '--id', token, '--source', ownerAlias,
        '--network', network, '--auto-sign', '--',
        'approve', '--from', owner, '--spender', factory,
        '--amount', total.toString(), '--expiration_ledger', String(sequence + 100_000),
    ]);

    console.log('Creating + funding airdrop...');
    run('stellar', [
        'contract', 'invoke', '--id', factory, '--source', ownerAlias,
        '--network', network, '--auto-sign', '--',
        'create_airdrop',
        '--owner', owner,
        '--token', token,
        '--merkle_root', strip0x(doc.root),
        '--total', total.toString(),
        '--deadline', String(deadline),
        '--locked', String(locked),
        '--recipient_count', String(rows.length),
        '--salt', salt,
        '--metadata_cid', JSON.stringify(cid),
    ]);

    console.log('Verifying config...');
    const config = run('stellar', [
        'contract', 'invoke', '--id', predicted, '--source', ownerAlias,
        '--network', network, '--send', 'no', '--', 'config',
    ]);

    const claimUrl = `https://airdrop.zarf.to/claim?a=${predicted}&cid=${cid}`;
    writeFileSync(
        resolve(artifactDir, 'deployment.json'),
        JSON.stringify({ airdrop: predicted, cid, token, total: total.toString(), recipients: rows, claimUrl, config }, null, 2),
        { mode: 0o600 },
    );

    console.log('\nAirdrop deployed');
    console.log(`airdrop=${predicted}`);
    console.log(`cid=${cid}`);
    console.log(`token=${token}`);
    console.log(`total=${total} (base units)`);
    console.log(`recipientCount=${rows.length}`);
    console.log(`claimUrl=${claimUrl}`);
    console.log(`artifactDir=${artifactDir}`);
    console.log('\nConfig:');
    console.log(config);
}

main();
