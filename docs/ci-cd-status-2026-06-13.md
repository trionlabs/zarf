# CI/CD status report — `hardening/web-infra`

**Date:** 2026-06-13  **Branch:** `hardening/web-infra`  **HEAD:** `125a75f`
**Scope:** CI/CD impact of every commit on the branch ahead of `main`, verified
by running the actual CI gates locally (not inferred from the workflow files).

> Point-in-time snapshot. A second session was concurrently editing the
> contract crates while this report was produced; its work was **uncommitted**
> and therefore not part of any CI run yet (see §6).

---

## 1. Verdict

**The branch CI is green** as of `125a75f`. One real, blocking CI failure was
found and fixed in this pass (`check:any`, §3). Every other gate was run
locally and passes. The single highest-risk item is **not** a CI failure — it
is a deploy-sequencing hazard that surfaces only on merge to `main` (§5).

## 2. Commit inventory (main..HEAD)

| Commit | Summary | CI surface |
|---|---|---|
| `125a75f` | jwk-rotation: reword comment tripping `check:any` | web (fix) |
| `f826f50` | feat(create): daily vesting unit + epoch-count guard | web |
| `bf6f395` | Docs & ops layer | none (docs) |
| `d2ac36b` | Worker/auth/privacy-filter test suites | web, lockfile |
| `5aab6b7` | CI gates + toolchain config | all jobs (defines them) |
| `a6a4d71` | Circuit M1: bind recipient via OIDC nonce (**VK bump**) | circuits, soroban, **web zarf.json** |
| `4a91d35` | Verifier hardening + adversarial harness | soroban |
| `b5c028a` | JWK registry v2: owner/operator + timelock | soroban |
| `7114f3d` | CSP nonces; drop unsafe-eval/inline | web (build/smoke) |
| `86cfe96` | Per-step deploy secrets, SHA-pin actions, Dependabot | deploy |
| `c3fb486` | Rate-limit pin-proxy/indexer; no wildcard CORS | web (workers) |
| `6ce7ff3` | PIN entropy 12 chars; under-funded surfacing | web |
| `6143a06` | Stop persisting secrets/PII to browser storage | web |
| `7182d3a` | jwk-rotation safety rails, /health, const-time auth | web (workers) |
| `ad84d4d` | Phase-1 quick wins, googlemail normalization, ADRs | web |
| `5d376de` | Harden indexer edge cache | web (workers) |

## 3. Finding F-1 (FIXED) — `check:any` blocking failure

- **Severity:** blocking CI (the `check:any` step in the `web` job has no
  `continue-on-error`).
- **Root cause:** the drift gate matches `/:\s*any\b/`. Commit `b5c028a`
  introduced a code **comment** reading `Monitoring window: any on-chain key …`
  in `web/apps/jwk-rotation/src/index.ts`; the substring `window: any` matched
  the explicit-`any` pattern. It is prose, not a type annotation, but the gate
  does not strip comments.
- **Why it was missed earlier:** prior validation ran `pnpm lint` (ESLint),
  which passes; `check:any` is a separate script and was not re-run after
  `b5c028a`.
- **Fix (`125a75f`):** reworded the comment to `covers every on-chain key`.
  No behaviour change. `check:any` now passes. Committed and pushed.

## 4. Per-job results (verified locally on `125a75f`)

| CI job | Blocking | Result | Evidence |
|---|---|---|---|
| **web** (Web, Core, Workers) | yes | 🟢 PASS | Ran every step: `--frozen-lockfile` (in sync), ESLint (0 errors), `check:type-forks`, `check:any` (after F-1 fix), `check:console`, `pnpm -r test` = **279 tests pass** (core 209, ui 25, create 9, claim 9, pin-proxy 15, jwk-rotation 12), `@zarf/create check` (0 err), worker typecheck, `build:{landing,claim,create}`, `check:budget`, `smoke:routes` (all routes 200) |
| **circuits** (Noir) | yes | 🟢 PASS | `a6a4d71`; `nargo compile` + `nargo test` (12) validated |
| **soroban** (Contracts) | yes | 🟢 PASS *(at committed HEAD)* | Committed crates = previously validated state (verifier 10, jwk-registry 15, vesting 21, factory 13 = 59). **Not re-run this session**: the working tree holds a second session's uncommitted contract edits, so `cargo test` now would test their in-progress state, not HEAD. |
| **security-scan** (Dependency Audit) | no (`continue-on-error`) | 🟡 non-gating | GitHub reports 2 low-severity Dependabot advisories on the default branch |
| **CodeQL** | no (separate workflow; `main`/PR-to-`main` only) | n/a for branch status | JS/TS + actions analysis |

## 5. Finding F-2 (DESIGN GATE) — auto-deploy ships a new VK while contracts are old

This is the highest-risk item on the branch. It is not a CI failure; it is a
release-ordering hazard.

- `.github/workflows/deploy.yml` triggers on `workflow_run` of **CI completing
  successfully on `main`**, and deploys **only the web apps + Workers** — there
  is **no contract/circuit deploy step**.
- Commit `a6a4d71` regenerated and committed the web-shipped circuit artifact
  `web/packages/core/static/circuits/zarf.json` with the **new verification
  key** (recipient↔nonce binding).

**Consequence:** merging this branch to `main` will, once CI is green,
auto-deploy `create` + `claim` with the new-VK `zarf.json`, while the on-chain
verifier / registry / vesting / factory still carry the **old VK** →
**claims break.**

Note: while F-1 was unfixed, CI-on-`main` would have failed and deploy would not
have fired — an accidental safety stop. F-1's fix removes that stop, so the
deploy is now gated **only** by human release sequencing.

**Required control:** keep the PR **draft / do-not-merge** until the
coordinated contract redeploy is done first. Sequence and verification steps:
[`docs/runbooks/circuit-redeploy-cutover.md`](runbooks/circuit-redeploy-cutover.md).

## 6. Open items

1. **Concurrent contract WIP (uncommitted).** A second session is editing the
   contract crates (jwk-registry two-step ownership `propose_owner` /
   `accept_ownership` / `cancel`; factory + verifier hardening; a new `F-4 GATE`
   in `run_testnet_factory_e2e.sh` that verifies a known-good fixture proof
   against the freshly deployed verifier *before* the factory constructor wires
   it in — closing the "consistent-but-wrong-circuit VK deploys clean and
   silently verifies a different circuit" gap). This is complementary to F-2.
   When committed, it must pass the `soroban` gates (`cargo fmt --check`,
   `clippy -D warnings`, `cargo test` × 4 crates) before merge.
2. **Deploy sequencing (F-2):** contracts first, then merge to `main`.
3. **prettier `format:check`** remains non-blocking (`continue-on-error`)
   pending a one-time `prettier --write .` over the pre-existing baseline drift.
4. **2 low Dependabot advisories** on the default branch — triage.

## 7. Method

Gates were run from `web/` with Node `v22.13.0` / pnpm `10.23.0` and the same
testnet env the CI `web` job sets (`VITE_STELLAR_*` testnet defaults). Contract
and circuit jobs were validated in prior sessions; they were not re-run here to
avoid testing the second session's uncommitted working-tree edits. This report
reflects the committed state at `125a75f`.
