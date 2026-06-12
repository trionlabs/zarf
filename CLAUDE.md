# CLAUDE.md

Guidance for working in this repository.

## Layout (four independent toolchains)

- `circuits/` — Noir ZK circuit (proves Google-JWT email ownership). Toolchain: `nargo` (Noir **v1.0.0-beta.18**).
- `contracts/soroban/` — Rust Soroban contracts: `verifier/` (UltraHonk + vendored `ultrahonk-soroban-verifier`), `zarf/jwk-registry`, `zarf/vesting`, `zarf/factory`. Four independent crates (no workspace). Target `wasm32v1-none`.
- `web/` — pnpm monorepo (Node 24+, pnpm 10). Apps: `create`, `claim`, `landing` (SvelteKit) and Workers `indexer`, `pin-proxy`, `jwk-rotation`. Packages: `@zarf/core` (logic), `@zarf/ui` (components/stores).
- `poc/` — standalone proof-generation tooling (bb.js); used to regenerate test fixtures.

## Common commands

### Circuit
```sh
cd circuits
nargo test        # unit tests (incl. nonce-binding cases)
nargo compile     # -> target/zarf.json (the compiled circuit the web prover ships)
```

### Contracts
```sh
# from repo root, per crate:
cargo test  --manifest-path contracts/soroban/<crate>/Cargo.toml
cargo build --manifest-path contracts/soroban/<crate>/Cargo.toml --target wasm32v1-none --release
cargo fmt   --manifest-path contracts/soroban/<crate>/Cargo.toml --check
cargo clippy --manifest-path contracts/soroban/<crate>/Cargo.toml --all-targets -- -D warnings
```
Note: the factory test needs the vesting wasm built first
(`cargo build ... vesting ... --release`), and the verifier tests need the
verifier wasm built first.

### Web
```sh
cd web
pnpm install
pnpm -r --if-present test    # all unit suites (core, ui, create, claim, pin-proxy, jwk-rotation)
pnpm lint                    # ESLint (blocking; error-clean)
pnpm format:check            # Prettier (baseline has known drift; see CI note)
pnpm --filter @zarf/<app> check       # svelte-check (apps) / typecheck (workers)
pnpm --filter @zarf/<app> build       # vite build
pnpm check:budget check:any check:console check:type-forks   # drift gates
```

## Conventions

- Prettier: 4-space, single quotes, trailing commas (`web/.prettierrc`).
- No raw `console.*` in app/component code — use `@zarf/core/utils/log` (`dev`/`warn`/`err`); drift-gated.
- No stray `any` — gated; boundary exceptions live in `web/scripts/check-any-allow-list.mjs`.
- Contracts use typed `#[contracterror]` enums and `Result`, not `unwrap`/`panic`.
- Secrets are never committed; Worker secrets go through `wrangler secret`.

## Load-bearing invariants

- **The circuit's `MAX_DATA_LENGTH` must equal `MAX_SIGNED_DATA_LENGTH`** in `web/packages/core/lib/constants.ts`.
- **Any circuit change regenerates the VK** → it is a coordinated redeploy of
  verifier + registry + vesting + factory + the web `zarf.json` artifact. See
  [`docs/runbooks/circuit-redeploy-cutover.md`](docs/runbooks/circuit-redeploy-cutover.md).
- Test fixtures (`contracts/.../fixtures/zarf-stellar-recipient/`, `verifier/tests/zarf/`) are bb.js-generated; regenerate via `poc/scripts/generateZarfProofForStellar.js` (the runbook has the exact invocation).
