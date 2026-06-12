# Contributing

Zarf is a showcase project; contributions and review are welcome. This repo has
four independent toolchains — see [`CLAUDE.md`](CLAUDE.md) for the full command
reference and load-bearing invariants.

## Before you push

Run the gates that CI runs:

```sh
# web
cd web && pnpm install
pnpm -r --if-present test
pnpm lint
pnpm --filter @zarf/<changed-app> check

# contracts (per changed crate)
cargo fmt   --manifest-path contracts/soroban/<crate>/Cargo.toml --check
cargo clippy --manifest-path contracts/soroban/<crate>/Cargo.toml --all-targets -- -D warnings
cargo test  --manifest-path contracts/soroban/<crate>/Cargo.toml

# circuit
cd circuits && nargo test
```

## Ground rules

- **No secrets in commits.** Worker secrets go through `wrangler secret`; never
  commit `.dev.vars`, keys, or real PII. `.gitignore` blocks `*.pem`/`*.key`/
  `*.secret`/`.dev.vars*`. Use `example.com` in sample data.
- **No raw `console.*`** in app/component code — use `@zarf/core/utils/log`.
  No stray `any`. Both are drift-gated.
- **Circuit changes are coordinated redeploys.** Changing `circuits/src/main.nr`
  regenerates the verification key and requires redeploying verifier + registry
  + vesting + factory and regenerating fixtures + the web `zarf.json` artifact.
  See [`docs/runbooks/circuit-redeploy-cutover.md`](docs/runbooks/circuit-redeploy-cutover.md).
  Do not land a circuit change to a deploying branch without the cutover.
- **Contracts**: typed `#[contracterror]` + `Result`, not `unwrap`/`panic`;
  keep `overflow-checks` on; extend TTLs on write paths.
- Match the surrounding code style (Prettier 4-space/single-quote for web;
  `cargo fmt` defaults for Rust).

## Security

Report vulnerabilities privately — see [`SECURITY.md`](SECURITY.md). Accepted
risks and design decisions are recorded as ADRs under [`docs/adr/`](docs/adr/).
