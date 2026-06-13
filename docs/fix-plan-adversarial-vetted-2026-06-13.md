# Zarf fix plan — adversarially vetted (hardening/web-infra, 2026-06-13)

> Produced by a 23-agent Opus workflow (`zarf-fix-adversarial-vet`): a main→current
> investigator re-established ground truth and reproduced failures from cold; a
> senior developer designed a concrete patch per finding; a Stellar-skills agent
> vetted the contract/crypto fixes; an **ultracritic + ultraskeptical + reviewer**
> gauntlet attacked each fix *and its premise*; a CTO adjudicated split panels and
> synthesized this plan. Key load-bearing claims were additionally re-verified by
> hand (cold-clippy `EXIT 101`; the `[lints.clippy] deprecated` `E0602`; the
> `VestingScheduleTable.svelte:228` prop-less render site). **No files were edited
> — this is an apply-ready plan, not applied changes.**

## 1. CTO verdict & go/no-go

**NO-GO for an immediate `main` merge today. YES, the branch is fixable** to a clean, mergeable, pre-mainnet-correct state within one focused PR cycle (PRs A/B/C below).

Every load-bearing claim was independently re-verified against the live tree rather than trusted from the prior report. The findings are real; the disagreements among the senior dev, the Stellar vet, and the three adversaries were about *fix readiness*, adjudicated below with reproduced evidence.

The branch's own objective — "correct CI/CD before mainnet" — is currently self-defeating:

- **H-1 (CI ordering):** Cold failure reproduced. Removing `target/wasm32v1-none` and running the first clippy step gives `EXIT 101 — error: couldn't read tests/../target/wasm32v1-none/release/rs_soroban_ultrahonk.wasm`. The Soroban CI job cannot self-pass from a clean checkout. Fix is a pure step reorder. **Apply now.**
- **H-3 (vendored crate uncovered):** The soundness-critical vendored `ultrahonk-soroban-verifier` (which holds the uncommitted `Fr::pow` / on-curve-guard WIP) is in the rustfmt loop but absent from clippy and has no test step; its 8 adversarial tests are dead in CI (path-dependency tests are never compiled by the wrapper — confirmed via `cargo test ... -- --list`). The ci.yml half of the fix is correct and H-1-safe. **But the Cargo.toml lint hunk is broken** — see §3. **Apply with changes.**
- **H-2 (claim flow break):** The new-VK nonce-binding circuit is shipped in the client `zarf.json`; every login path uses a random UUID nonce; the only recipient-binding helper has zero call sites. Once that artifact is the one proofs run against, witness generation fails for 100% of claims. The proposed fix has the right architecture but ships two real, build-breaking defects. **Rework.**
- **L-1:** Factory merkle-root replay residual via deferred-zero-root. Real, LOW, correct minimal fix. **Apply now** + two hardenings.
- **L-2 / L-3:** Cheap, correct, pre-mainnet. **Apply now.**
- **L-4:** Deferrable drift-gate papercut. **Defer.**

The dominant systemic risk is **release sequencing (F-2)**: `deploy.yml` triggers on push to `main` (lines 9-10) and ships web apps + Workers — including `zarf.json` — via wrangler, with **no contract or circuit deploy step**. So H-2 and the VK bump are *armed on merge*. The web client and the on-chain VK MUST move together in one coordinated cutover.

## 2. Per-finding decision table

| Finding | Severity | Panel outcome (adjudicated) | Decision | Confidence |
|---|---|---|---|---|
| H-1 — clippy before WASM build | HIGH | Unanimous fix-correct-and-ready; reproduced `EXIT 101` cold | **apply-now** | high |
| H-2 — nonce never bound to recipient | HIGH | Finding real (ultraskeptic only refined timing); ultracritic + reviewer demand rework on concrete build-breaking defects | **rework** | high |
| H-3 — vendored crate uncovered | HIGH | Finding real on every sub-claim; Stellar-vet + both adversaries: fix-needs-rework (Cargo lint namespace broken) | **apply-with-changes** | high |
| L-1 — deferred-zero-root replay | LOW | Unanimous fix-correct-and-ready + 2 non-blocking hardenings | **apply-now** | high |
| L-2 — dead `InvalidActivationDelay`, constructor panic | LOW | Real; reviewer: correct/complete/convention-compliant | **apply-now** | high |
| L-3 — off-curve pairing-point guard untested | LOW | Real; reviewer built+ran the proposed test, passes | **apply-now** | high |
| L-4 — drift gate doesn't strip comments/strings | LOW | Real but a deferrable papercut | **defer** | medium |

## 3. Final vetted fixes (apply-ready)

### H-1 — reorder WASM builds before clippy (apply now)

Root cause is purely step ordering in the `soroban` job of `.github/workflows/ci.yml`. `clippy --all-targets` (line 56, verifier first in the loop) compiles the `[[test]]` targets, which `include_bytes!`/`contractimport!` a gitignored (`.gitignore:25`), untracked WASM that the build steps (lines 59-66) only produce *afterward*.

**Edit `.github/workflows/ci.yml`:** move the two build steps ("Build verifier WASM", "Build Zarf contract WASMs", currently lines 59-66) to run *before* the "Clippy (deny warnings)" step (currently 49-57). Rustfmt stays first (it only parses). Final order: Checkout → Setup Rust → Cache → Rustfmt → Build verifier WASM → Build Zarf WASMs → Clippy (`--all-targets`) → the test steps. No step content changes; lint scope unchanged.

**Verify (cold):** in a throwaway clone with no prebuilt WASM, build all WASMs first, then run the clippy loop — expect EXIT 0 on all crates. The *failure* form is confirmed directly: `rm -rf contracts/soroban/verifier/target/wasm32v1-none && cargo clippy --manifest-path contracts/soroban/verifier/Cargo.toml --all-targets -- -D warnings` → `EXIT 101` with the missing-WASM compile error; rebuilding the WASM restores green.

### H-3 — cover the vendored crate (apply with the corrected lint table)

**3a. `.github/workflows/ci.yml` (correct as proposed):**
- Add `contracts/soroban/verifier/ultrahonk-soroban-verifier` to the clippy loop (lines 51-56).
- Add a dedicated test step after "Test verifier": `cargo test --manifest-path contracts/soroban/verifier/ultrahonk-soroban-verifier/Cargo.toml`

This is H-1-safe: the vendored tests `include_bytes!` only git-tracked DATA fixtures (`../../tests/zarf/target/{vk,proof,public_inputs}`, `vk_hash.hex`) — no WASM dependency — so `--all-targets` needs no prior WASM build, and the step can sit in the current pre-WASM clippy block.

**3b. `contracts/soroban/verifier/ultrahonk-soroban-verifier/Cargo.toml` — CHANGED from the proposed patch.** The proposed patch put all four allows under `[lints.clippy]`. That is **broken**: `deprecated` is a rustc lint, not a clippy lint. Both forms were proved empirically:

- Patch-as-written equivalent (`-A clippy::deprecated …`) → **EXIT 101**: the 4 `use of deprecated type alias soroban_sdk::crypto::bn254::Fr` errors survive **plus** `error[E0602]: unknown lint: clippy::deprecated`.
- Corrected split (`-A deprecated -A clippy::should_implement_trait -A clippy::needless_range_loop -A clippy::manual_is_multiple_of`) → **EXIT 0, clean.**

Apply this table (place between `[dev-dependencies]` and `[features]`; the proposed patch's `features = [...]` context anchor does not exist in the file, so place manually):

```toml
# Vendored verbatim from upstream (yugocabrio/rs-soroban-ultrahonk).
# These lints are upstream-parity / churn noise, not defects.
[lints.rust]
deprecated = "allow"            # soroban-sdk renamed bn254::Fr -> Bn254Fr; alias churn only

[lints.clippy]
should_implement_trait = "allow"   # Fr::from_str is a deliberately named constructor on a foreign type
needless_range_loop    = "allow"   # index-writes into fixed-size [Fr; N] in MSM/transcript hot paths
manual_is_multiple_of  = "allow"   # `len % 32 != 0` reads as a 32-byte alignment check
```

**Verify:** `cargo clippy --manifest-path contracts/soroban/verifier/ultrahonk-soroban-verifier/Cargo.toml --all-targets -- -D warnings` must be EXIT 0 from the actual table. Then `cargo test --manifest-path .../ultrahonk-soroban-verifier/Cargo.toml` must compile and run the 8 adversarial tests (incl. `g1_validation_accepts_generator_rejects_garbage`, `fr_fits_bits_boundaries`, `non_canonical_public_input_is_rejected`) — currently dead in the wrapper's `cargo test ... -- --list`.

**Sequence with H-1 in the same PR:** on a cold runner the verifier crate is first in the clippy loop and still dies on the missing WASM until H-1 lands, so H-3's value is only realized once H-1 ships.

### L-1 — force nonzero root on factory create_vesting (apply now, with hardenings)

Verified facts: `create_vesting` (factory `lib.rs:147`) calls `validate_initial_root(&merkle_root, false)` (permits zero root); `reserve_merkle_root` (`lib.rs:395-396`) early-returns `Ok(())` on a zero root, recording no `UsedRoot`; vesting `set_merkle_root` (`lib.rs:223`) has only `require_owner` and the vesting `DataKey` enum has no `Factory` variant (so it cannot call back); claim binds `(root, audience_hash, recipient)` but `current_contract_address()` appears only at vesting `lib.rs:258/377/427` (balances/TTL), never in a public-input equality check — so a proof is portable across two contracts sharing `(root, audience_hash)`.

**Edit `contracts/soroban/zarf/factory/src/lib.rs:147`:** change `Self::validate_initial_root(&merkle_root, false)?;` → `Self::validate_initial_root(&merkle_root, true)?;` (parity with `create_and_fund_vesting:190`). Removes the only precondition for the factory-path exploit while leaving the legitimate *standalone* deferred-root flow untouched.

**Hardening 1 (fold in):** make `reserve_merkle_root`'s zero-root branch fail-CLOSED — return `Err(Error::InvalidMerkleRoot)` instead of `Ok(())`. Behavior-neutral today (both entrypoints now reject zero upstream) but robust against a future entrypoint that forgets the check.

**Hardening 2:** add a `UsedRoot` TTL ops note to `docs/runbooks/circuit-redeploy-cutover.md` (the reservation TTL is extended only once at creation, `lib.rs:402-405`, never re-extended; an archived `UsedRoot` reads as absent and would let a second factory campaign re-reserve the same root). Document the residual standalone-vesting replay (true closure = in-circuit instance binding = a VK redeploy).

**Add regression test `unfunded_create_vesting_rejects_deferred_zero_root`** to `factory/tests/factory.rs`: assert `try_create_vesting(..., zero_root, ...)` returns `Err(Ok(FactoryError::InvalidMerkleRoot))` and `get_deployment_count() == 0`.

**Verify:** build vesting WASM first, then `cargo test --manifest-path contracts/soroban/zarf/factory/Cargo.toml` (new test passes; 14 existing factory tests stay green) and `cargo test --manifest-path contracts/soroban/zarf/vesting/Cargo.toml` (standalone `set_merkle_root_*` tests stay green).

### L-2 — typed constructor error in jwk-registry (apply now)

`Error::InvalidActivationDelay = 8` (jwk-registry `lib.rs:42`) is referenced only at its definition; `__constructor` (`lib.rs:160`) returns `()` and `panic!`s at `lib.rs:162`, violating the CLAUDE.md "typed errors, not panic" convention.

**Edit `contracts/soroban/zarf/jwk-registry/src/lib.rs`:** change `__constructor` to return `Result<(), Error>`, replace `panic!("activation delay exceeds maximum")` with `return Err(Error::InvalidActivationDelay);`, end with `Ok(())`. Mirrors the sibling vesting constructor (`vesting/src/lib.rs:142-157`). No `#[repr(u32)]` renumbering. Existing tests pass a valid delay and stay green. Add a test that registering with `MAX_ACTIVATION_DELAY_SECS + 1` traps so the variant gains coverage.

### L-3 — end-to-end test for the off-curve pairing-point guard (apply now)

The WIP on-curve guard at `shplemini.rs:261-262` has zero end-to-end coverage. Add one `#[test]` to `contracts/soroban/verifier/ultrahonk-soroban-verifier/tests/adversarial_test.rs` that mutates the fixture proof's pairing-point limbs to encode an off-curve `lhs = (1,1)` (zero proof bytes `[0..256]`, set byte 31 = 1 and byte 159 = 1 — each value-1 limb still passes `fits_bits(68)`) and asserts `verify()` returns `Err` (does not host-trap). The reviewer built and ran this against the live crate; it passes. No production change. Rides on the H-3 test step that finally runs the vendored suite in CI.

### H-2 — reworked claim-flow fix (rework before apply)

Architecture is correct (wire `redirectToGoogleWithRecipient` at the Step3→Step4 boundary so the id_token nonce equals `recipientNonce(recipient)`), but the proposed patch ships two **build-breaking** defects, both independently confirmed:

1. It makes `contractAddress` a **required** prop on `ClaimStep3Wallet`, yet the sole render site `VestingScheduleTable.svelte:228` is `<ClaimStep3Wallet />` with no prop → fails its own `pnpm --filter @zarf/claim check` gate and runs with `contractAddress=undefined`. **Fix:** `<ClaimStep3Wallet {contractAddress} />`.
2. It threads a `resumeStep` field through `OAuthState`/the helper that nothing consumes — `recoverSession` (`claimStore.svelte.ts:318`) unconditionally forces `currentStep=1`. **Fix:** remove `resumeStep`, or actually wire it into `recoverSession`.

Also: keep the `ClaimStep4Proof` defensive nonce assertion (load-bearing, not optional); remove the duplicate `decodeJwt` import; and **add an end-to-end witness-generation smoke test** against `web/packages/core/static/circuits/zarf.json` (success when `nonce == recipientNonce(recipient)`; failure on mismatch) as a new CI gate — this is the gate that would have caught the break. Note: one extra PIN re-entry per claim is unavoidable (COOP `same-origin` forbids a state-preserving popup; PIN/epoch material is intentionally non-persisted), accepted and documented.

## 4. Findings downgraded / refuted by the skeptic

- **H-2 was filed by the ultraskeptic as "finding-not-real."** Adjudication: the ultraskeptic did **not** refute it — they confirmed every code fact and only refined the *timing* ("client-side at witness generation, armed-on-deploy, not the current pre-cutover on-chain state"). That refinement strengthens the finding: `deploy.yml` ships the new `zarf.json` on merge, so the break is armed the moment this branch reaches main. H-2 is a real HIGH blocker; the skeptic's "ship the fix" is outvoted on *fix readiness* by the ultracritic and reviewer (the two build-breaking defects, independently confirmed). Finding real, **fix needs rework.**
- **No finding was legitimately downgraded to not-real.** Every H/L finding survived independent verification. The genuine softening is only on H-2's framing (armed-on-deploy, not live today) and on L-1/L-4 severity (LOW). The standalone-vesting residual under L-1 is explicitly accepted as a documented pre-mainnet posture.

## 5. Minor findings disposition

- **L-2** — apply now (typed-error cleanup + over-max test). Confirmed dead variant + panic.
- **L-3** — apply now (test-only, proven to pass, fills the only fail-closed coverage gap on the verify path).
- **L-4** — defer. Real drift-gate papercut (pattern test doesn't strip comments/strings); no correctness/security impact and off the critical path. Fold into a later tooling-hygiene PR.

## 6. Release sequence to main + mainnet

1. **PR A (CI):** H-1 reorder + H-3 (ci.yml clippy/test additions + the corrected `[lints.rust]`/`[lints.clippy]` split table). Verify from a cold clone: build WASMs → clippy loop EXIT 0 over all 5 crates → wrapper tests + new vendored test step (8 adversarial tests run and pass).
2. **PR B (contracts):** L-1 (nonzero root + fail-closed reserve + regression test + runbook notes), L-2 (Result constructor + over-max test), L-3 (off-curve test). Build vesting WASM first; run factory/jwk-registry/vendored test suites green; confirm PR A's active clippy/test loop stays green.
3. **PR C (claim flow, H-2 reworked):** wire `redirectToGoogleWithRecipient` at Step3→Step4; **fix `VestingScheduleTable.svelte:228` → `<ClaimStep3Wallet {contractAddress} />`**; remove or wire `resumeStep`; keep the ClaimStep4Proof defensive nonce assertion; remove the duplicate `decodeJwt` import; add the end-to-end witness-gen smoke test against the shipped `zarf.json`. Pass `pnpm --filter @zarf/claim check`, `pnpm lint`, `pnpm check:any check:console`, plus a real-browser redirect smoke.
4. **Fixtures/VK consistency:** confirm `vk_hash.hex` and the on-chain test fixtures match the shipped `zarf.json` VK. Because `vk_hash` is bb's internal hash (not `keccak(vk_bytes)`), the constructor cannot self-check the pair — the **F-4 fixture-proof gate is the only enforcement**; run it against a testnet deploy of the new-VK verifier.
5. **Merge order:** A → B → C. Do **not** let C reach `main` until the contract VK redeploy is staged, because merging C arms `deploy.yml` to ship the new `zarf.json`.
6. **Coordinated VK cutover (closes F-2 operationally):** deploy new-VK verifier → point jwk-registry/vesting/factory at it → run the F-4 gate to prove a known-good fixture proof verifies on the freshly deployed verifier → only then allow the `deploy.yml` run that publishes the new `zarf.json`. Verify a full end-to-end testnet claim (login → Step3 recipient-bound re-auth → proof → on-chain verify).
7. **Close F-2 systemically:** add an explicit ordering note to `docs/runbooks/circuit-redeploy-cutover.md` and a `deploy.yml` manual-approval/environment gate so the web `zarf.json` can never ship ahead of a matching on-chain VK.
8. **Mainnet go/no-go:** only after testnet end-to-end passes, CI is green from cold, the vendored adversarial suite runs in CI, L-1/L-2/L-3 are merged, and the F-2 sequencing guard is in place.

## 7. Residual risks accepted pre-mainnet

- **Standalone-vesting replay (L-1 residual):** two *standalone* (non-factory) vestings sharing `(merkle_root, audience_hash)` can each accept the same proof, because proofs bind `(root, audience_hash)` but not the contract address. The factory guard does not cover standalone deployments. Accepted (needs a deliberately adversarial owner); true closure = bind the proof to the contract instance in-circuit = a VK redeploy. Documented + advised against reusing a `(root, audience_hash)` pair across standalone deployments.
- **`UsedRoot` TTL upkeep:** reservation TTL is extended once at creation and never re-extended; multi-year campaigns risk archival → re-reservation. Mitigation is an operational `ExtendFootprintTTLOp` note in the runbook (fold into PR B's runbook edit).
- **`vk_hash` is bb's internal hash, not `keccak(vk_bytes)`:** the verifier constructor cannot self-check the `(vk_bytes, vk_hash)` pair; a consistent-but-wrong-circuit VK is only caught by the F-4 fixture-proof gate. Accepted, with the F-4 gate made a mandatory cutover step (§6.4/6.6).
- **One extra PIN entry per claim (H-2 fix UX cost):** COOP `same-origin` forbids a state-preserving popup, and PIN/epoch material is intentionally non-persisted, so the recipient-bound re-auth is a full-page redirect requiring one PIN re-entry. Accepted and far better than the current always-fail; documented in the runbook.
- **L-4 drift-gate papercut:** comment/string stripping not done before the pattern test. Cosmetic; deferred.
