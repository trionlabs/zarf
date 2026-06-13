# Zarf branch correctness audit — hardening/web-infra (2026-06-13)

> Produced by a 15-agent review workflow (baseline + full-delta understanding;
> Stellar/Soroban, Rust, CI/CD, and web review lenses; real `cargo`/`nargo`/`pnpm`
> gate execution on the live working tree incl. the uncommitted contract WIP;
> adversarial confirmation of every medium+ finding). The three HIGH findings
> (H-1, H-2, H-3) were additionally re-verified by hand against the live tree.

## 1. Verdict

The contracts and circuit on `hardening/web-infra` are **correct and current** at the code level: all four independent Soroban crates (verifier, jwk-registry, vesting, factory) plus the vendored `ultrahonk-soroban-verifier` and the Noir circuit pass every gate the project actually runs, on the live working tree **including the uncommitted WIP** (71 contract tests, 12 circuit tests, 279 web tests — 0 failures). The uncommitted contract WIP is internally consistent, fails closed, and is ready to commit.

**But the branch is `do-not-merge-deploy-gated`**, for three reasons:

- **One HIGH CI-correctness bug** (clippy ordering) deterministically fails the Soroban CI job on a cold checkout — i.e., the branch whose stated objective is "correct CI/CD before mainnet" cannot itself pass CI from a clean runner.
- **One HIGH functional break** on the web side: the new VK is already live in `zarf.json`, but no app flow produces a recipient-bound-nonce token, so **every claim proof fails in-circuit**.
- **F-2 release-sequencing hazard** (documented, accepted): `deploy.yml` auto-ships the new-VK `zarf.json` on merge to main, while on-chain contracts still carry the old VK. The merge must be gated behind a coordinated contract redeploy + the F-4 fixture-proof gate regardless of how clean the code is.

The contract code itself is sound; the gating is in CI plumbing, web wiring, and release sequencing.

## 2. What changed (before → after)

| Component | main (before) | hardening/web-infra (after) |
|---|---|---|
| **Circuit** (`circuits/src/main.nr`) | `MAX_DATA_LENGTH=1024`; no nonce binding | `1536`; unconditional `assert_nonce_binds_recipient` (id_token nonce == lowercase-64-hex(recipient)); 3 new nonce tests. **VK bumped** (a6a4d71) |
| **Verifier** (`verifier` + vendored crate) | Stateless; stores `(vk_bytes, vk_hash)`; no TTL; cannot self-check VK pair | + 120-day TTL extension (committed). **WIP:** `Fr::pow` fills `bits[1]` from `exp>>64` (defensive); `verify_shplemini` on-curve-validates reconstructed pairing points before host MSM, returns clean `Err` instead of trapping |
| **jwk-registry** | Single-owner; `transfer_ownership`; errors {1,2,3} | v2 owner/operator split + timelocked `propose_key`→`activate_key` (≤7-day cap), limb validation (committed b5c028a). **WIP:** `transfer_ownership` → two-step `propose_owner`→`accept_ownership` (+`cancel_ownership_transfer`, `pending_owner` getter, `OwnerProposed` event, `PendingOwnerNotSet=9`) |
| **Vesting** | Single-owner claim; binds `(merkle_root, audience_hash, jwt_exp)`, NOT contract address | Constructor updated to pass `activation_delay_secs=0`; clippy lint exception. No address binding change (still the residual replay surface for deferred roots) |
| **Factory** | No merkle-root dedup | Clippy lint exception (committed). **WIP:** `Error::MerkleRootAlreadyUsed=8`, `DataKey::UsedRoot(BytesN<32>)`, `reserve_merkle_root()` in both create paths; zero/deferred-root path explicitly out of scope |
| **CI** (`ci.yml`) | No clippy/rustfmt/CodeQL; no circuit job | All actions SHA-pinned; rustfmt + clippy `-D warnings` (4 outer crates); circuit job; security-scan (cargo-audit, pnpm audit, advisory); CodeQL; Dependabot |
| **Deploy** (`deploy.yml`) | Web + workers only, on main CI success | Same scope; secrets per-step scoped; `/health`→`{ok:true}`. **Still no contract/circuit deploy step** (→ F-2) |
| **Web** | `PIN_LENGTH=8`; WAL persists merkle tree | `MAX_SIGNED_DATA_LENGTH=1536` (matches circuit); PIN split (8/12/64); WAL v3 purges merkle tree/PII (tx-hashes only, 7-day TTL); CSP nonces; epoch cap 200→366 dual-validated. **Recipient-bound re-auth helper present but never called** (→ HIGH break) |
| **F-4 gate** (`run_testnet_factory_e2e.sh`) | Absent | **WIP:** verify committed fixture proof against fresh verifier BEFORE factory constructor wires it in; aborts on failure |

## 3. Gate results (real runs on the live tree incl. WIP)

**Contracts (`.github/workflows/ci.yml`-defined gates) — all PASS:**

| Command | Result | Detail |
|---|---|---|
| `cargo build vesting --target wasm32v1-none --release` | pass | artifact built (factory test dep) |
| `cargo build verifier --target wasm32v1-none --release` | pass | artifact built (verifier test dep) |
| `cargo fmt --check` (verifier, jwk-registry, vesting, factory, vendored) | pass | no diffs on all 5 |
| `cargo clippy --all-targets -D warnings` (verifier) | pass | recompiled WIP field.rs+shplemini.rs clean |
| `cargo clippy --all-targets -D warnings` (jwk-registry) | pass | recompiled WIP two-step ownership clean |
| `cargo clippy --all-targets -D warnings` (vesting) | pass | clean |
| `cargo clippy --all-targets -D warnings` (factory) | pass | recompiled WIP reserve_merkle_root clean |
| `cargo test` verifier | pass | integration 9 + cost_measure 1 (3+2 ignored: legacy bb v0.87 fixtures) |
| `cargo test` jwk-registry | pass | 18/18 |
| `cargo test` vesting | pass | 21 (20 + 1 real_zarf_claim) |
| `cargo test` factory | pass | 14/14 (incl. new merkle-root reservation cases) |
| `cargo test` vendored ultrahonk crate | pass | adversarial 8 + verifier_test 1 (exercises shplemini on-curve WIP) |

**Contract totals: 71 passed, 0 failed, 9 ignored** (all 9 ignored = legacy bb v0.87 fixtures, expected).

**Circuit (Noir, nargo 1.0.0-beta.18) — all PASS:**

| Command | Result | Detail |
|---|---|---|
| `nargo test` | pass | 12/12 incl. `test_nonce_binds_matching_recipient`, `test_nonce_rejects_wrong_recipient`, `test_nonce_rejects_uppercase_hex` |
| `nargo compile` | pass | exit 0, clean; `target/zarf.json` present (incremental no-op, artifact up-to-date) |

**Web (Node 22 / pnpm 10) — all blocking gates PASS:**

| Command | Result | Detail |
|---|---|---|
| `pnpm install --frozen-lockfile` | pass | lockfile in sync |
| `pnpm lint` | pass | 0 errors, 37 warnings (all `svelte/no-navigation-without-resolve`, non-blocking) |
| `check:any` / `check:console` / `check:type-forks` / `check:budget` | pass | 0 new any, 0 new console, no forks, all bundles within budget |
| `pnpm -r --if-present test` | pass | **279 passed / 0 failed** (core 209, ui 25, pin-proxy 15, jwk-rotation 12, claim 9, create 9); landing has no test script (correctly skipped) |
| `build:landing` / `build:claim` / `build:create` | **skipped** | reason recorded: `git diff --stat -- web/` is empty → web unchanged since last green run at 125a75f |

**WIP gate status:** All uncommitted WIP (field.rs, shplemini.rs, factory lib.rs+tests, jwk-registry lib.rs+tests, e2e script, runbooks, .gitignore) is exercised and green under every CI-defined contract gate (source files were touched to force genuine recompiles, exit codes confirmed). The web tree is identical to 125a75f, so the web gates validate the committed state.

**One non-CI clippy caveat (not a gate failure):** `cargo clippy --all-targets -D warnings` run *directly* on the vendored `ultrahonk-soroban-verifier` crate yields **10 errors** (deprecated `bn254::Fr` alias, `needless_range_loop`, `manual_is_multiple_of`, `from_str` trait confusion), two on WIP-touched files (field.rs:34, shplemini.rs:161). The project CI does **not** lint this crate standalone, so no gate fails today — but it is the substance of the HIGH coverage finding below.

## 4. Confirmed findings (grouped by severity)

### Blocker
None.

### High

**H-1 — Clippy `--all-targets` runs before the WASM builds; Soroban CI job fails deterministically from a cold checkout.**
*Location:* `.github/workflows/ci.yml` clippy step (lines 49–57) precedes WASM builds (lines 59–66); `contracts/soroban/verifier/tests/integration_tests.rs:4` (`include_bytes!("../target/wasm32v1-none/release/rs_soroban_ultrahonk.wasm")`); `contracts/soroban/zarf/factory/tests/factory.rs`.
*What's wrong:* `clippy --all-targets` compiles the integration-test targets, which `include_bytes!`/`contractimport!` WASM files that are gitignored and absent on a fresh checkout. The verifier is the **first** crate in the clippy loop, so the job dies before any WASM is ever built. `Swatinem/rust-cache` (ci.yml:30) saves only on success and does not preserve the local crate's own WASM output, so a failing job never seeds a usable cache (stays red run-over-run). This gate did not exist on main; it was introduced on this branch. **Re-verified by hand against the live tree** (step ordering and `include_bytes!` paths confirmed).
*Fix:* Reorder so the WASM build steps run before clippy `--all-targets`; or split clippy into an early `--lib` pass and a post-build `--all-targets` pass. Verify on a cold runner / cleared Actions cache.

**H-2 — New-VK claim flow is broken: id_token nonce is never bound to recipient, so every proof fails in-circuit.**
*Location:* `web/apps/claim/.../ClaimStep4Proof.svelte:72-97`; `ClaimStep1Identify.svelte:44-46`; `web/packages/ui/lib/utils/googleAuth.ts:135-162` (random-UUID nonce) vs `:330-346` (`redirectToGoogleWithRecipient`, never called); `circuits/src/main.nr:174-175`.
*What's wrong:* a6a4d71 shipped a new VK (live in `web/packages/core/static/circuits/zarf.json`) whose circuit unconditionally asserts `id_token.nonce == lowercase-64-hex(recipient)`. But all live login paths set the OAuth nonce to a random UUID (`generateAndStoreNonce` → `crypto.randomUUID()`), and that token is fed unchanged into `generateClaimProof`. The recipient-bound helper `redirectToGoogleWithRecipient` **has zero app call sites** — re-confirmed by hand (`git grep` across `web/**` excluding tests returns only its own definition). So no flow can produce a satisfying token; proof generation fails for every claim.
*Fix:* Wire `redirectToGoogleWithRecipient` at the Step3→Step4 boundary with `recipientFieldHex = recipientId(contractAddress, targetWallet)`; in the callback, distinguish the recipient-bound re-auth from the initial random-nonce login. Add an end-to-end smoke test that runs a real proof against the shipped `zarf.json` so this class of break is caught in CI. Alternatively, keep the new `zarf.json` behind the same coordinated cutover as the contracts.

**H-3 — Vendored `ultrahonk-soroban-verifier` crate (which holds the uncommitted WIP) is excluded from the clippy loop and has no `cargo test` step; its adversarial regression tests never run in CI.**
*Location:* `.github/workflows/ci.yml` clippy loop (lines 51–56, 4 outer crates only — the vendored crate is in the **rustfmt** loop at line 42 but not here) and test steps (lines 68–78); `contracts/soroban/verifier/ultrahonk-soroban-verifier/tests/adversarial_test.rs`.
*What's wrong:* The uncommitted WIP (`field.rs`, `shplemini.rs`) lives in the vendored crate. Because it is a path dependency, `cargo test --manifest-path .../verifier/Cargo.toml` does **not** run the vendored crate's own integration tests. So the targeted regression tests (`g1_validation_accepts_generator_rejects_garbage`, `fr_fits_bits_boundaries`, `non_canonical_public_input_is_rejected`) are dead in CI and the WIP source is never clippy-linted. *Mitigating:* the WIP code paths are exercised transitively via the wrapper's fixture integration tests, so gross regressions are caught — but the new off-curve-reject branch and Fr-boundary edges have zero CI coverage.
*Fix:* Add the vendored crate to the clippy loop and add a dedicated `cargo test --manifest-path .../ultrahonk-soroban-verifier/Cargo.toml` step. Clear the ~10 pre-existing nits first (or scope clippy to `--lib`).

### Medium
None confirmed at medium. (The deferred-root replay item was adjudicated down to low; see L-1.)

### Low

**L-1 — Deferred (zero) merkle root + `vesting.set_merkle_root` bypasses the factory replay guard.**
*Location:* `factory/src/lib.rs` (`reserve_merkle_root` early-returns Ok on zero root; `create_vesting` permits zero root) and `vesting/src/lib.rs` (`set_merkle_root`, no factory callback).
*What's wrong:* A campaign created with a deferred (zero) root is never reserved. Its owner can later call vesting's own `set_merkle_root(R)` to a root already consumed by another funded campaign sharing the same `audience_hash`; because proofs bind only `(merkle_root, audience_hash)` and not the vesting address, one proof verifies against both contracts — re-opening the cross-campaign double-claim the reservation is meant to close. Requires deliberate adversarial owner setup; explicitly documented as out-of-scope in the factory.
*Fix (acceptable to ship pre-mainnet):* Either disallow deferred-root campaigns on mainnet (force nonzero root at creation), or have `vesting.set_merkle_root` call back into the factory to reserve. At minimum, flag in the mainnet runbook that deferred-root campaigns are outside the replay guard (the cutover runbook does not currently mention this). Full closure requires binding the proof to the contract instance in the circuit = a VK redeploy.

**L-2 — `jwk-registry` constructor panics instead of using the dedicated `InvalidActivationDelay` error variant.**
*Location:* `contracts/soroban/zarf/jwk-registry/src/lib.rs` constructor (panic) and the unused `Error::InvalidActivationDelay`. Committed code (b5c028a), not WIP.
*What's wrong:* Constructor uses `panic!("activation delay exceeds maximum")` while the typed variant is defined and never returned — violates the project's typed-error convention and leaves a dead variant. Not branch-breaking (a constructor aborts either way).
*Fix:* Keep the panic (defensible for a constructor) and drop/justify the dead variant. Do NOT renumber existing `#[repr(u32)]` discriminants.

**L-3 — No end-to-end test drives an off-curve reconstructed pairing point through `verify_shplemini`.**
*Location:* `contracts/soroban/verifier/ultrahonk-soroban-verifier/tests/adversarial_test.rs` (absent case); guard at `src/shplemini.rs`.
*What's wrong:* The new `is_valid()` guard (converts a host MSM/pairing trap into a clean Err) is tested only at the unit level (`G1Point::is_valid` in isolation); no test feeds a proof whose `pairing_point_object` recombines to an off-curve point and asserts a clean Err. Guard is correct by inspection but its specific failure path is unverified end-to-end.
*Fix:* Add one integration test mutating the fixture proof's pairing-point limbs to encode an off-curve point and assert `verify()` returns Err rather than panicking.

**L-4 — `check:any` regex matches prose/comments and string literals, not just type annotations.**
*Location:* `web/scripts/check-any-allow-list.mjs`. Already broke CI once (125a75f had to reword a `window: any` prose comment).
*Fix (optional):* Strip line comments and string-literal spans before applying `ANY_PATTERN`; keep the allow-list as escape hatch. Low priority — the gate otherwise works.

### Info
- **F-4 gate is shell-only** (`run_testnet_factory_e2e.sh`): correctly placed before factory construction and the sole enforcement of `(vk_bytes, vk_hash)` provenance, but lives only in the testnet script. Mainnet manual deploys MUST mirror it.
- **Vendored crate is rustfmt-gated but not clippy-gated** (companion to H-3): running clippy directly on it surfaces ~10 pre-existing nits — not a CI blocker as configured.
- **`convert_pairing_points_to_g1` recombines the same 16 limbs twice per verify** (`shplemini.rs`): correctness-neutral micro-inefficiency.
- **`validate_modulus` uses unguarded `Vec::get(..).unwrap()`** (`jwk-registry/src/lib.rs`): safe only by caller ordering (callers run `compute_hash` first). Optional: re-check `len() == 18` at the top.
- **Web "Run unit tests (core, ui, create)" step label understates coverage** (also runs claim/pin-proxy/jwk-rotation); `@zarf/indexer` has no `test` script, so future indexer tests would silently skip.
- **`jwk-rotation /rotate` relies solely on bearer token**: sound constant-time auth, but ADMIN_TOKEN compromise allows registry mutation within the per-run rails; on-chain rails bound blast radius.
- **jwk-rotation tests don't exercise on-chain submission/operator rails**: coverage gap for the trust-root operator's safety rails, not a current defect.

### Explicitly refuted (do NOT treat as new findings)
- **"F-2 has no branch protection / CODEOWNERS / deploy precondition"** — refuted as a *new* finding: it restates the already-documented, already-accepted F-2 hazard, and the absence of an in-tree CODEOWNERS/ruleset does not prove branch protection is unconfigured (those are GitHub repo settings, not committed files). The recommendations are reasonable hardening, but this is not a new code-path defect.

## 5. The uncommitted contract WIP — per-change assessment

All five WIP changes are **correct and CI-ready to commit** under the project's CI-defined gates (fmt/clippy/test all green on the four outer crates + the vendored crate test suite). Detail:

- **Two-step ownership (jwk-registry)** — **Correct, ready.** Right shape for a trust root: `propose_owner` (owner auth, writes `PendingOwner` only) → `accept_ownership` (requires the **nominee's own** `require_auth`, proving control, before ownership moves) → `cancel_ownership_transfer` (owner-only). A fat-fingered nominee can never take control; a stranger cannot accept. No dangling callers of the removed `transfer_ownership` (vesting keeps its own unrelated single-step method; web has none). Inserting `PendingOwner` mid-enum is storage-safe (`#[contracttype]` unit variants encode by name-Symbol). 18/18 registry tests green.

- **Merkle-root reservation (factory)** — **Correct, ready (with a documented residual).** `UsedRoot` persistent guard checked before any deploy/tracking in BOTH `create_vesting` and `create_and_fund_vesting`; runs before the token transfer so a failed transfer reverts the reservation (no orphan). Closes cross-campaign replay for all factory-created campaigns. New `duplicate_merkle_root_is_rejected_across_campaigns` test confirms rejection. Residual: deferred-zero-root path (L-1) — correctly scoped and documented. 14/14 factory tests green.

- **Shplemini on-curve guard (shplemini.rs)** — **Correct, ready.** Validates the two reconstructed pairing points (`proof_lhs`/`proof_rhs` from 68-bit limbs) against the BN254 G1 equation `y² = x³ + 3` with canonical Fq encoding, placed BEFORE the only host ops that consume them (`mul_with_separator`). Combined with `load_proof`'s existing `is_valid()` checks, every G1 point reaching a host MSM/pairing is now validated; fails closed with a clean `Err`. Belt-and-suspenders: oversized-limb aliasing is separately prevented by the `fits_bits(68)` range check earlier in the pipeline. Exercised by the 8 adversarial tests.

- **Fr::pow limb fix (field.rs)** — **Correct, ready.** ark-ff 0.5 `pow<S: AsRef<[u64]>>` is LSB-first; setting `bits[0]=exp as u64`, `bits[1]=(exp>>64) as u64`, `bits[2]=bits[3]=0` is exactly the LE encoding of a u128 — no truncation. All current callers use `exp=5`, so no behavior change today; purely defensive and complete.

- **F-4 gate (`run_testnet_factory_e2e.sh`)** — **Correct, ready.** Verifies the committed immutable fixture proof against the freshly deployed verifier BEFORE the factory constructor wires it in, aborting on failure. This is the sole enforcement of the un-self-checkable `(vk_bytes, vk_hash)` pair. Must NOT be removed; must be mirrored into the mainnet deploy procedure (info finding).

**Recommendation:** Commit the WIP — it is correct and passes every CI-defined contract gate. Address H-3 (CI coverage of the vendored crate) in the same change so the WIP's targeted regression tests actually run in CI.

## 6. Pre-mainnet release sequencing (F-2 + F-4)

The VK was bumped at a6a4d71, and `deploy.yml` auto-ships the new-VK `zarf.json` on a successful main CI run **with no contract deploy step**. Merging to main before contracts are redeployed will break claims (old on-chain VK vs new client artifact) — and per H-2, claims are already broken on the web side until the recipient-bound re-auth is wired. Required order:

1. **Land the CI fix (H-1)** so the branch can actually go green from a clean checkout, and **wire the recipient-bound re-auth (H-2)** + add the proof smoke test.
2. **Redeploy on testnet, in coordination:** verifier → jwk-registry → vesting → factory, using the new VK fixtures.
3. **Run the F-4 gate:** verify the committed known-good fixture proof against the freshly deployed verifier BEFORE constructing the factory. Abort if it fails.
4. **Validate a live OAuth round-trip** end-to-end against the redeployed contracts and the new `zarf.json` (proves H-2 is fixed and the VK matches).
5. **Only then merge `hardening/web-infra` → main** (which auto-deploys web + workers / the new `zarf.json`).
6. **Mirror the F-4 fixture-proof gate into the mainnet deploy procedure** — it currently lives only in the testnet e2e script.

**Do-not-merge gate while the VK is bumped:** the circuit-redeploy-cutover runbook already states "do not merge until testnet steps + live OAuth round-trip validated." Honor it. Optionally make `deploy.yml` for create/claim `workflow_dispatch`-only (or add a VK-hash precondition step) so a premature merge cannot auto-ship the new artifact.

## 7. Open items / recommendations (prioritized)

1. **(H-1) Fix CI ordering** — build WASM before clippy `--all-targets` in `ci.yml`. Verify on a cold runner. *Blocks the branch's own CI.*
2. **(F-2) Gate the merge** — do not merge while VK is bumped; follow the coordinated cutover in §6. *Blocks safe deploy.*
3. **(H-2) Wire recipient-bound re-auth** — call `redirectToGoogleWithRecipient` at Step3→Step4; add an end-to-end proof smoke test against the shipped `zarf.json`. *Blocks claims working.*
4. **(H-3) Bring the vendored crate into CI** — add it to the clippy loop + a dedicated `cargo test` step so the adversarial regression suite for the WIP runs; clear/scope the ~10 pre-existing nits.
5. **Commit the WIP** — it is correct and CI-green; bundle with H-3.
6. **(L-1) Deferred-root replay** — flag in the mainnet runbook; consider forcing nonzero root at creation on mainnet, or a vesting→factory reservation callback.
7. **(L-3) Add the off-curve pairing-point integration test** to pin the trap→Err conversion.
8. **(L-2, info nits)** — drop the dead `InvalidActivationDelay` variant; relabel the web test step; consider hardening the `check:any` regex; track the jwk-rotation rail tests and indexer `test` script.
