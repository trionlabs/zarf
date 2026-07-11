---
title: Self-hosting
description: Run the entire Zarf stack yourself — build the circuit and contracts, deploy them to Stellar, run the apps locally, and ship via CI to Cloudflare.
sidebar:
  order: 8
---

This page describes how to build, deploy, and run the full Zarf stack from
source. Zarf currently targets **Stellar testnet**; mainnet is not deployed and
is gated on a third-party audit (see [project status](/resources/project-status/)).

## Monorepo layout

```
circuits/                     Noir circuit (email-ownership proof)
contracts/soroban/
  verifier/                   UltraHonk verifier contract (+ ultrahonk-soroban-verifier)
  zarf/jwk-registry/          Trusted Google JWK key-hash registry
  zarf/vesting/               Holds funds, schedules, and claims
  zarf/factory/               Deploys vesting contracts deterministically
web/
  apps/
    landing/                  zarf.to marketing site (@zarf/landing)
    create/                   create.zarf.to — email/ZK + wallet-airdrop creator (@zarf/create)
    claim/                    claim.zarf.to — ZK claim (@zarf/claim)
    airdrop-claim/            airdrop.zarf.to — wallet-airdrop claim
    indexer/                  indexer.zarf.to — shared read backend (@zarf/indexer)
    pin-proxy/                pin.zarf.to — IPFS pinning proxy (@zarf/pin-proxy)
    jwk-rotation/             jwt.zarf.to — scheduled JWK sync worker (@zarf/jwk-rotation)
    docs/                     docs.zarf.to — this site (@zarf/docs)
  packages/
    core/                     @zarf/core — shared domain logic, ZK, config
    ui/                       @zarf/ui — shared Svelte components
  scripts/                    demo deploy scripts (QA tooling)
```

See [architecture](/developers/architecture/) for how these pieces fit together
and why the apps are split across origins.

## Prerequisites

From the repository README:

- [Noir](https://noir-lang.org/) `v1.0.0-beta.18` (the `nargo` toolchain)
- Rust with the `wasm32v1-none` target
- [Stellar CLI](https://developers.stellar.org/docs/tools/cli/install-cli)
- Node.js 24+
- pnpm

CI and the deploy pipeline pin **Node 24** and **pnpm 10.23.0**
(`.github/workflows/*.yml`); use those versions to match production builds.

The browser ZK proving libraries are pinned in `web/packages/core/package.json`:
`@noir-lang/acvm_js`, `@noir-lang/noir_js`, and `@noir-lang/noirc_abi` at
`1.0.0-beta.18`, plus `@aztec/bb.js` `^2.1.x`.

## 1. Build the circuit

```bash
cd circuits
nargo build
```

This generates the Noir circuit artifact used by the proof generator. See the
[ZK stack](/developers/zk-stack/) for what the circuit proves.

## 2. Build and test the contracts

Build each contract to WASM and run its test suite (mirrors `.github/workflows/ci.yml`):

```bash
# Build WASM
cargo build --manifest-path contracts/soroban/verifier/Cargo.toml --target wasm32v1-none --release
cargo build --manifest-path contracts/soroban/zarf/jwk-registry/Cargo.toml --target wasm32v1-none --release
cargo build --manifest-path contracts/soroban/zarf/vesting/Cargo.toml --target wasm32v1-none --release
cargo build --manifest-path contracts/soroban/zarf/factory/Cargo.toml --target wasm32v1-none --release

# Test
cargo test --manifest-path contracts/soroban/verifier/Cargo.toml
cargo test --manifest-path contracts/soroban/zarf/jwk-registry/Cargo.toml
cargo test --manifest-path contracts/soroban/zarf/vesting/Cargo.toml
cargo test --manifest-path contracts/soroban/zarf/factory/Cargo.toml
```

## 3. Deploy the contracts

The contracts must be deployed in dependency order — the factory needs the
verifier and registry addresses plus the uploaded vesting WASM hash — because a
vesting contract's dependencies are immutable after deployment. The reference
end-to-end recipe (deploy + register a key + create + fund + claim) is
`contracts/soroban/zarf/scripts/run_testnet_factory_e2e.sh`. The deploy steps it
runs are:

```bash
# 1) Deploy the UltraHonk verifier (constructor takes the VK bytes + its hash)
stellar contract deploy --wasm <verifier.wasm> --source <SOURCE> --network testnet \
  -- --vk_bytes-file-path <vk> --vk_hash <vk_hash_hex>

# 2) Deploy the JWK registry (owner authorizes key registration/rotation;
#    activation_delay_secs is the key-activation timelock and must be 21600-604800, i.e. 6h-7d)
stellar contract deploy --wasm <zarf_jwk_registry.wasm> --source <SOURCE> --network testnet \
  -- --owner <SOURCE> --activation_delay_secs 21600

# 3) Upload the vesting and airdrop WASM and capture their hashes
VESTING_WASM_HASH=$(stellar contract upload --wasm <zarf_vesting_soroban.wasm> \
  --source <SOURCE> --network testnet)
AIRDROP_WASM_HASH=$(stellar contract upload --wasm <zarf_airdrop_soroban.wasm> \
  --source <SOURCE> --network testnet)

# 4) Deploy the factory, wiring it to the verifier, registry, and WASM hashes
stellar contract deploy --wasm <zarf_vesting_factory_soroban.wasm> \
  --source <SOURCE> --network testnet \
  -- --verifier <VERIFIER_ID> --jwk_registry <REGISTRY_ID> \
     --vesting_wasm_hash "$VESTING_WASM_HASH" \
     --airdrop_wasm_hash "$AIRDROP_WASM_HASH"
```

Release WASM artifacts are written to each contract's
`target/wasm32v1-none/release/` directory (`rs_soroban_ultrahonk.wasm`,
`zarf_jwk_registry.wasm`, `zarf_vesting_soroban.wasm`,
`zarf_airdrop_soroban.wasm`,
`zarf_vesting_factory_soroban.wasm`).

After deploying, register at least one Google signing key in the JWK registry so
claims can validate JWTs. In production this is kept fresh automatically by the
[JWK rotation worker](/developers/jwk-rotation/).

<!-- TODO(verify): there is no single canonical "deploy to a fresh network" script beyond the e2e harness (run_testnet_factory_e2e.sh) and the demo scripts under web/scripts/. Confirm whether an operator-facing deploy script/runbook exists and link it here if so. -->

## 4. Configure and run the apps locally

Install dependencies and create your environment file:

```bash
pnpm --dir web install --frozen-lockfile
cp web/.env.example web/.env
# then fill in VITE_STELLAR_TESTNET_FACTORY_ADDRESS (required for create/claim), etc.
```

The `create` and `claim` apps will not build until at least
`VITE_STELLAR_TESTNET_FACTORY_ADDRESS` is set; the `landing` app builds with the
template unmodified.

Run individual apps (from `web/`):

```bash
pnpm dev:create          # create.zarf.to
pnpm dev:claim           # claim.zarf.to
pnpm dev:landing         # zarf.to
pnpm dev:indexer         # indexer worker (wrangler dev)
pnpm dev:jwk-rotation    # JWK rotation worker (wrangler dev)
```

`web/dev-all.sh` starts the create app on port `5174` and the claim app on port
`5173` together. The `pin-proxy` and `indexer` workers allow those localhost
ports (`5173`–`5175`) as CORS origins by default.

To deploy a demo distribution end-to-end (pins a claim list, predicts the
address, creates and funds a vesting through the factory):

```bash
cd web && pnpm demo:deploy    # tsx scripts/deploy_demo_distribution.ts
```

## 5. Deploy via CI to Cloudflare

Deployment is automated. On a push to `main`, the `CI` workflow runs; when it
succeeds, the `Deploy` workflow (`.github/workflows/deploy.yml`) deploys each app
as a matrix job. It can also be triggered manually via **workflow_dispatch**.

The matrix deploys six apps:

| App | Package | Kind | Target |
|---|---|---|---|
| landing | `@zarf/landing` | Svelte | https://zarf.to |
| create | `@zarf/create` | Svelte | https://create.zarf.to |
| claim | `@zarf/claim` | Svelte | https://claim.zarf.to |
| indexer | `@zarf/indexer` | Worker | https://indexer.zarf.to |
| pin-proxy | `@zarf/pin-proxy` | Worker | pin.zarf.to |
| jwk-rotation | `@zarf/jwk-rotation` | Worker | https://jwt.zarf.to |

Each job runs `pnpm --filter <package> run deploy` (Wrangler under the hood).
Worker runtime secrets are pushed with `wrangler secret bulk` and then verified
with `wrangler secret list`; the `indexer` and `jwk-rotation` deployments also
poll their `/health` endpoints before the job is considered green.

<!-- TODO(verify): the docs app (@zarf/docs) is not in the deploy.yml matrix. Confirm how docs.zarf.to is deployed (separate workflow / Cloudflare Pages project) and note it here. -->

### Environment reference

**GitHub secrets** (Cloudflare + worker runtime):

| Secret | Used by |
|---|---|
| `CLOUDFLARE_API_TOKEN` | all deploy jobs |
| `CLOUDFLARE_ACCOUNT_ID` | all deploy jobs |
| `PINATA_JWT` | `@zarf/pin-proxy` |
| `REGISTRY_OWNER_SECRET` | `@zarf/jwk-rotation` |
| `ADMIN_TOKEN` | `@zarf/jwk-rotation` |
| `ALERT_WEBHOOK_URL` | `@zarf/jwk-rotation` (optional) |

**Frontend build variables** (GitHub repository variables; `VITE_`-prefixed and
baked into the Svelte bundles at build time):

| Variable | Notes |
|---|---|
| `VITE_STELLAR_TESTNET_RPC_URL` | required for the testnet profile |
| `VITE_STELLAR_TESTNET_FACTORY_ADDRESS` | required for testnet; the create/claim builds fail without it |
| `VITE_STELLAR_MAINNET_RPC_URL` | optional; enables the mainnet toggle |
| `VITE_STELLAR_MAINNET_FACTORY_ADDRESS` | optional; enables the mainnet toggle |
| `VITE_STELLAR_DEFAULT_NETWORK` | optional selector: `testnet` or `mainnet` |
| `VITE_GOOGLE_CLIENT_ID` | required for `@zarf/claim` (Google OIDC) |
| `VITE_PIN_PROXY_URL` | required for `@zarf/create` |
| `VITE_INDEXER_URL` | create/claim; defaults to `https://indexer.zarf.to` |

Supplying both the `TESTNET` and `MAINNET` profiles lets the UI network toggle
show both networks; if only one is configured, the UI offers only that network.
Horizon, explorer, passphrase, and network labels are built-in constants for
Stellar testnet/mainnet. The older unprefixed `VITE_STELLAR_*` keys still work as
a testnet fallback for local development.

**Indexer worker runtime** (synced as Cloudflare secrets; see
`web/apps/indexer/wrangler.jsonc`):

| Variable | Notes |
|---|---|
| `STELLAR_TESTNET_RPC_URL` | required |
| `STELLAR_TESTNET_FACTORY_ADDRESS` | required |
| `STELLAR_TESTNET_NETWORK_PASSPHRASE` | optional (defaults to the testnet passphrase) |
| `STELLAR_MAINNET_RPC_URL` / `STELLAR_MAINNET_FACTORY_ADDRESS` / `STELLAR_MAINNET_NETWORK_PASSPHRASE` | optional mainnet profile |
| `ALLOWED_ORIGINS` | comma-separated CORS allow-list (`vars` in wrangler config) |
| `MAX_CONTRACTS` | optional cap on `owners/:owner/vestings` results |

**JWK rotation worker** reads its schedule and registry target from
`vars` in `web/apps/jwk-rotation/wrangler.jsonc` (cron `0 */6 * * *`,
`GOOGLE_JWKS_URL`, `JWK_REGISTRY_ADDRESS`, `REVOKE_REMOVED_KEYS`) and takes
`REGISTRY_OWNER_SECRET` / `ADMIN_TOKEN` / `ALERT_WEBHOOK_URL` as secrets. The
worker is stateless — it reads current registry state from the Soroban contract,
so no KV namespace is required. See [JWK rotation](/developers/jwk-rotation/).

**pin-proxy worker** takes `PINATA_JWT` as a secret and `ALLOWED_ORIGINS` /
`MAX_BODY_BYTES` as `vars`.

## Notes and limitations

- **Testnet only, audit-gated.** Do not point a self-hosted deployment at
  Stellar mainnet as though it were production-ready. See
  [project status](/resources/project-status/) and
  [operational notes](/creators/operational-notes/).
- **The JWK rotation worker is security-critical.** If it stalls, retired Google
  keys can remain valid on-chain (issue 002). Monitor its liveness and keep
  `REVOKE_REMOVED_KEYS` enabled. See [JWK rotation](/developers/jwk-rotation/)
  and the [security model](/developers/security-model/).
- **Deployed WASM may lag source.** If you deploy freshly built contracts, your
  interface can differ from the current public testnet demo deployment. See
  [deployed contracts](/resources/deployed-contracts/).
