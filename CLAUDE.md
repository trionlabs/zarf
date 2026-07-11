# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Zarf Protocol — confidential token distributions & payroll on Stellar/Soroban. Send tokens to an **email** instead of a wallet. A Noir ZK circuit proves Google OAuth email ownership; the recipient claims with a standard Google login, no wallet exposure or identity leak on-chain. Public showcase project by Trion Labs.

Three layers that must agree on the same proof format:
1. **`circuits/`** — Noir circuit (`src/main.nr`) proving JWT/email ownership.
2. **`contracts/soroban/`** — Rust contracts that verify the proof and hold/release funds.
3. **`web/`** — pnpm monorepo of Svelte apps + Cloudflare Workers that generate proofs and drive claims.

## Toolchain (pinned — mismatches break proof verification)

- **Noir** `1.0.0-beta.18` (`noirup -v 1.0.0-beta.18`). Note `poc/` pins `noir_js`/`bb.js` separately (`@aztec/bb.js` 2.1.9, noir-lang beta.17) for browser proof gen.
- **Rust** stable + `wasm32v1-none` target (`rust-toolchain.toml`).
- **Stellar CLI** (`stellar`) for deploy/E2E.
- **Node 24+**, **pnpm 10.23** (`packageManager` field).

## Common commands

Run from repo root unless noted. There is no root build — each layer builds separately.

### Circuit (`circuits/`)
```bash
cd circuits
nargo compile          # build artifact consumed by proof generators
nargo test
```

### Soroban contracts (`contracts/soroban/`)
Four crates: `verifier`, `zarf/jwk-registry`, `zarf/vesting`, `zarf/factory`.
```bash
cargo test --manifest-path contracts/soroban/verifier/Cargo.toml
cargo test --manifest-path contracts/soroban/zarf/jwk-registry/Cargo.toml
cargo test --manifest-path contracts/soroban/zarf/vesting/Cargo.toml
cargo test --manifest-path contracts/soroban/zarf/factory/Cargo.toml
# single test: append a name filter, e.g. `... -- claim_happy_path`
```
**Build release WASM before running clippy or contract integration tests.** The integration tests `include_bytes!`/`contractimport!` the release WASMs (gitignored, absent on a cold checkout), so `clippy --all-targets` or `cargo test` die with a missing-file error otherwise:
```bash
cargo build --manifest-path contracts/soroban/verifier/Cargo.toml --target wasm32v1-none --release
cargo build --manifest-path contracts/soroban/zarf/jwk-registry/Cargo.toml --target wasm32v1-none --release
cargo build --manifest-path contracts/soroban/zarf/vesting/Cargo.toml --target wasm32v1-none --release
cargo build --manifest-path contracts/soroban/zarf/factory/Cargo.toml --target wasm32v1-none --release
```
The `verifier` wrapper's `cargo test` does **not** run the `ultrahonk-soroban-verifier` sub-crate tests — run that crate explicitly.

### Web (`web/` — pnpm workspace)
```bash
pnpm --dir web install
pnpm --dir web lint                 # eslint
pnpm --dir web format:check         # prettier
pnpm --dir web -r --if-present test # vitest across packages
pnpm --dir web --filter @zarf/claim check   # svelte-check a single app
pnpm --dir web check:type-forks     # shared-type drift guard (also check:any, check:console, check:budget)
```
Run all dev servers at once: `bash web/dev-all.sh`. Single app: `pnpm --dir web dev:create` (also `dev:claim`, `dev:landing`, `dev:indexer`, `dev:jwk-rotation`).

### Proof tooling (`poc/`)
`zarf-stellar-proof-tools` — standalone scripts to generate Stellar-bound proofs and convert JWKs to circuit limbs:
```bash
pnpm --dir poc install        # postinstall copies bb.js wasm
pnpm --dir poc generate-proof:stellar
pnpm --dir poc jwk:limbs
```

## Web monorepo layout (`web/`)

Apps (`apps/*`) and shared packages (`packages/*`):
- **`@zarf/landing`** — marketing site → `zarf.to`
- **`@zarf/create`** — sender UI (build distributions, pin metadata) → `create.zarf.to`
- **`@zarf/claim`** — recipient UI (Google login → proof → claim) → `claim.zarf.to`
- **`@zarf/pin-proxy`** — Cloudflare Worker, Pinata/IPFS pinning passthrough
- **`@zarf/jwk-rotation`** — scheduled Worker syncing Google OAuth JWKs into the Soroban JWK registry (stateless, reads registry from chain)
- **`@zarf/indexer`** — Worker indexing on-chain events
- **`@zarf/core`** — shared lib (contracts client, crypto, ZK, domain, services). Imported via subpath exports (`@zarf/core/crypto`, `@zarf/core/contracts`, …)
- **`@zarf/ui`** — shared Svelte components

Svelte apps deploy to Cloudflare via `wrangler` (`pnpm --filter X deploy`). CD runs after CI passes on `main`; see README for required Cloudflare/Vite secrets and vars.

## Proof ↔ contract contract (keep in sync across all three layers)

- The circuit binds the OIDC **nonce** to the recipient: nonce is the lowercase 64-hex encoding of the `recipient` field. Changing this breaks claims.
- `vesting::claim(proof, public_inputs, recipient)` expects a **23-field** `public_inputs` layout: `[pubkey limbs ×18, merkle_root, unlock_time, epoch_commitment, recipient, amount]`.
- **Recipient binding** = `BN254_FR(keccak256(Address ScVal XDR))` placed at `public_inputs` index 21. The prover (`poc/`, `@zarf/core`) must compute the same value the contract checks.
- `factory.recipient_id(recipient)` lets a Stellar-bound proof be generated *before* the vesting instance exists.
- Verifier targets the bb.js v2.1.9 **UltraKeccakHonk** (non-ZK flavor — see `docs/adr/0002`) proof/VK layout; the VK is stored at deploy time.

If you change the circuit's public inputs, update: `circuits/src/main.nr`, the `vesting` contract's input parsing, the verifier VK/fixtures, and the `@zarf/core` + `poc/` prover. A VK bump must propagate to deployed contracts — see `docs/runbooks/circuit-redeploy-cutover.md`.

## Docs worth reading first

- `docs/adr/` — accepted-risk decisions (unsalted email hashes `0001`, non-ZK UltraHonk flavor `0002`).
- `docs/runbooks/` — circuit redeploy cutover, incident response, Pinata recovery.
- `contracts/soroban/zarf/README.md` — contract-by-contract semantics and the testnet E2E recipe.
- `contracts/soroban/zarf/scripts/` and `contracts/soroban/verifier/scripts/` — localnet/testnet E2E shell scripts.

## CI gate (`.github/workflows/ci.yml`)

PRs must pass: rustfmt + clippy + tests for all contracts (WASM built first), `nargo compile`/`nargo test`, web prettier/eslint/vitest/svelte-check + worker typechecks + the `check:*` allow-list guards, and a cargo-audit/pnpm-audit dependency job. Match these locally before pushing.
