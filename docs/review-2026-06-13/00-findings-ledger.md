# Zarf independent re-audit — findings ledger (epoch-based)

> Single source of truth for the multi-epoch independent re-audit started 2026-06-13 on `hardening/web-infra`.
> Consolidates the three prior artifacts so each epoch dedups against known ground and spends effort on
> (a) NEW issues prior reviews missed, and (b) independent verification of landed hardening — not rediscovery.
>
> Sources:
> - `docs/branch-correctness-audit-2026-06-13.md` (15-agent branch-delta audit)
> - `docs/fix-plan-adversarial-vetted-2026-06-13.md` (23-agent apply-ready fix plan, PRs A/B/C)
> - `plans/security-quality-remediation-plan.md` ("to 10/10" full-tree plan — **mostly LANDED on this branch**)
>
> Mode: **independent re-audit** (find fresh + validate known). Tempo: per epoch, verified findings get fixed + re-gated, then reviewed together.

## Status legend
`OPEN` not yet fixed · `LANDED?` plan claims done — re-audit must independently verify · `ACCEPTED` adjudicated risk, do-not-refile · `REFUTED` proven not-real, do-not-refile · `FIXED` resolved + re-gated this review

---

## A. Known OPEN findings (carried from branch-audit + fix-plan)

| ID | Sev | Area | Epoch | Summary | Status |
|----|-----|------|-------|---------|--------|
| H-1 | HIGH | CI | 4 | `clippy --all-targets` ran before WASM build → cold-checkout CI death. | ✅ **RESOLVED** — independently verified `ci.yml`: WASM builds (L54-61) now run BEFORE clippy (L63-72), with a comment documenting exactly this fix. Prior audit was stale. (Cold-sim optional in Epoch 4.) |
| H-2 | HIGH | web/circuit | 3 | New-VK circuit asserts `id_token.nonce == hex(recipient)`, but every login uses random-UUID nonce; `redirectToGoogleWithRecipient` has 0 call sites → 100% of claims fail once new `zarf.json` is live. Fix needs rework (2 build-breaking defects in proposed patch). | **OPEN — re-confirmed** (grep: `redirectToGoogleWithRecipient` only at its def `googleAuth.ts:330`; `ClaimStep1Identify.svelte:45` calls `redirectToGoogle(contractAddress)` → `generateAndStoreNonce()`/`crypto.randomUUID()`). The recipient-nonce helpers `recipientNonce`/`redirectToGoogleWithRecipient` exist but are dead. |
| H-3 | HIGH | CI | 4 | Vendored crate absent from clippy + no test step → adversarial suite dead in CI. | ✅ **RESOLVED** — independently verified: vendored crate IS in clippy loop (`ci.yml:67`) + dedicated test step (`ci.yml:81-82`) + corrected `[lints.rust] deprecated`/`[lints.clippy]` table in vendored `Cargo.toml:28-34`. Vendored clippy passed clean locally. Prior audit was stale. |
| L-1 | LOW | factory/vesting | 2 | Deferred (zero) root bypasses replay reservation; standalone replay residual. | ✅ **factory path RESOLVED** (Epoch 2) — `create_vesting:152` & `create_and_fund_vesting:195` both `validate_initial_root(.., true)` (force nonzero); `reserve_merkle_root:403` fails CLOSED on zero. Stale finding. **Standalone (non-factory) residual still ACCEPTED** (two standalone vestings sharing `(root, audience_hash)` replay one proof; true close = in-circuit instance binding = next VK redeploy). |
| L-2 | LOW | jwk-registry | 2 | `__constructor` `panic!`s instead of typed error. | ✅ **RESOLVED** (Epoch 2) — `__constructor` returns `Result<(), Error>` and returns `Err(Error::InvalidActivationDelay)` on over-max delay (`lib.rs:160-167`). Stale finding. |
| L-3 | LOW | verifier | 1 | Off-curve reconstructed pairing-point guard (`shplemini.rs`) tested only at unit level. | ✅ **RESOLVED** (Epoch 1) — guard at `shplemini.rs:261-263` is correct + placed before host MSM/pairing; e2e test `off_curve_reconstructed_pairing_point_is_rejected_cleanly` exists (`adversarial_test.rs:227-248`). |
| L-4 | LOW | tooling | 5 | `check:any` regex matches comments/strings, not just type annotations. Deferred papercut. | OPEN |

### Info / smaller items (carried)
| Ref | Area | Epoch | Note |
|-----|------|-------|------|
| I-1 | verifier | 4 | F-4 fixture-proof gate is shell-only (`run_testnet_factory_e2e.sh`); must be mirrored into mainnet deploy procedure. |
| I-2 | verifier | 1/5 | `convert_pairing_points_to_g1` recombines the same 16 limbs twice per verify (micro-inefficiency). |
| I-3 | jwk-registry | 2 | `validate_modulus` uses unguarded `Vec::get(..).unwrap()`; safe only by caller ordering. Re-check `len()==18` at top. |
| I-4 | CI | 4 | Web test-step label understates coverage; `@zarf/indexer` has no `test` script → future indexer tests silently skip. |
| I-5 | jwk-rotation | 3 | `/rotate` relies solely on bearer token (sound constant-time auth); ADMIN_TOKEN compromise bounded by on-chain rails. |
| I-6 | jwk-rotation | 3 | Worker tests don't exercise on-chain submission/operator rails — coverage gap, not a defect. |

## B. Release-sequencing hazard (systemic)
| ID | Area | Epoch | Note | Status |
|----|------|-------|------|--------|
| F-2 | deploy | 4 | `deploy.yml` (`workflow_run` on CI success → main) auto-ships create/claim (bundling the new-VK `zarf.json`) with NO contract/circuit deploy step. Merge = double-broken deploy (on-chain old-VK mismatch + H-2 + N3-1). | ⚠️ **CONFIRMED, documented-not-enforced** — cutover runbook has the do-not-merge gate + F-4 + L-1 note, but `deploy.yml` itself has NO technical gate (relies on human discipline). **Recommend: GitHub Environment required-reviewers on create/claim, or `workflow_dispatch`-only, or a VK-hash precondition step.** |

---

## C. Landed hardening to INDEPENDENTLY VERIFY (remediation plan Phases 0–6, largely shipped on-branch)
Re-audit must confirm each actually does what it claims — do not trust "done".

- **Web/infra (Phase 1):** googlemail↔gmail normalization (email.ts); PII cleanup (sample CSV, deleted dead scripts — confirm zero `yamancandev`/`S6LCtWMy` in tree); jwk-rotation mass-revoke guard + grace period + env split; indexer rate-limit + fan-out caps + CORS no-wildcard; JWT memory-only (authStore) + create WAL v3 redaction + telemetry redaction; pin-proxy rate-limit + scoped key; CSP nonces (no unsafe-eval/inline) on claim/create/landing; PIN 8→12 entropy; solvency surfacing.
- **CI/CD (Phase 1.8/4):** SHA-pinned actions; scoped deploy secrets; rustfmt+clippy gates; circuit job; cargo-audit/pnpm-audit; CodeQL; Dependabot.
- **Verifier (Phase 2):** adversarial harness; canonical PI enforcement; vk_hash binding/provenance; G1 validation; TTL extension. **WIP:** Fr::pow limb fix, shplemini on-curve guard.
- **Registry v2 (Phase 2.3):** owner/operator split; timelocked propose→activate (≤7d); RSA limb validation. **WIP:** two-step propose_owner→accept_ownership.
- **Circuit (Phase 3):** nonce↔recipient binding (VK bumped); MAX_DATA 1024→1536 (+ constants.ts mirror). **NOTE:** H-2 is the web side of this not being wired.
- **Factory (WIP):** merkle-root reservation (UsedRoot) in both create paths.
- **Docs/ops (Phase 6):** ADRs (0001 unsalted-email, 0002 non-zk-flavor); runbooks (circuit-redeploy-cutover, incident-response, pinata-recovery); SECURITY/CONTRIBUTING/CLAUDE/READMEs; .gitignore un-ignores docs.

---

## D. ACCEPTED risks / REFUTED non-issues — DO NOT REFILE as new findings
**Accepted (adjudicated, ADR'd):**
- Unsalted email hashes on public IPFS (membership-testable, correlatable) — KEPT AS-IS by product decision; `docs/adr/0001`. Sealed-Salt upgrade path preserved (`plans/discovery-privacy-design.md`).
- Non-ZK UltraKeccakHonk flavor (no formal ZK guarantee) — `docs/adr/0002`.
- Identity keyed on email not `sub` (sender can't know recipients' sub pre-commit); `email_verified` + PIN mitigate.
- PII: working-tree cleanup only, no git-history rewrite (data was dummy).
- Standalone-vesting `(root, audience_hash)` replay residual (L-1) — needs adversarial owner; true close = VK redeploy.
- `vk_hash` is bb's internal hash, not `keccak(vk_bytes)` → constructor can't self-check pair; F-4 fixture-proof gate is the enforcement.
- One extra PIN re-entry per claim (H-2 fix UX cost; COOP forbids state-preserving popup).
- `UsedRoot` TTL extended once at creation (multi-year campaigns risk archival → re-reservation) — ops runbook note.

**Refuted (proven not-real):**
- TTL-archival replay (liveness-only — archived entries restored, never read-absent).
- OAuth `state` parsing pollution / redirect sink.
- IPFS-gateway XSS via core fetch (JSON-only).
- Factory salt squatting; recipient hex malleability (mod-r canonical).
- "F-2 has no branch protection/CODEOWNERS" as a NEW finding (restates accepted F-2; repo-settings not committed files).

**Out of scope (ADR'd follow-ups):** ZK-Honk verifier port (XL); external audit of vendored verifier (pre-mainnet gate); auth-code+PKCE migration; Sealed-Salt Discovery (until decision changes).

---

## E. Baseline gate results (this review, live WIP tree)
_Filled by Epoch 0 background runs._

Baseline established 2026-06-13 on live WIP tree (incl. uncommitted contract changes). **All gates green (22/22).**

| Suite | Result | Detail |
|-------|--------|--------|
| contracts fmt/clippy/test ×5 (verifier, vendored, jwk-registry, vesting, factory) | ✅ PASS | 15/15. Local WASM artifacts present → clippy `--all-targets` succeeds (H-1 is cold-checkout-only). |
| circuit (nargo test) | ✅ PASS | |
| web (install/test/lint/check:any/console/type-forks/budget) | ✅ PASS | 7/7 |

**Observation (feeds Epoch 1/4):** vendored-crate `cargo clippy --all-targets -D warnings` passed clean locally, contradicting the prior audit's "~10 nits". Either the `[lints]` table already landed or the nits are gone — verify the vendored `Cargo.toml` and reconcile H-3's "apply-with-changes" scope before fixing.

---

## F. New findings (this review) — appended per epoch

### Epoch 1 — Soundness core (circuit + UltraHonk verifier) ✅ COMPLETE
Workflow: 25 agents, 7 parallel finders + per-finding adversarial verify. **Verdict: the soundness core is SOUND.** All 7 components "sound"; 18 raw findings → **0 exploitable soundness/correctness bugs**. Circuit fully-constrained (every PI asserted to a witness), nonce↔recipient binding unconditional+canonical, Fiat-Shamir absorption complete (bit-flip sweeps reject all tampering), sumcheck 28 subrelations correct vs bb reference, PI count/order pinned in `verify`, VK immutable post-construction, error propagation/TTL/auth clean.

| ID | Sev | Area | Evidence | Verify verdict | Status |
|----|-----|------|----------|----------------|--------|
| **N1-1** (E3-shplemini-1) | LOW (new) | verifier | `verifier.rs:78-82` checked all 16 pairing-point limbs to `fits_bits(68)`, but `limbs_to_be` (`shplemini.rs:43-54`) packs the top limb of each coordinate at shift 204 into a 256-bit buffer → bits 52..68 silently dropped → encoding aliasing. | confirmed, **not exploitable** (point is on-curve-validated + host re-validates; aliased encoding changes transcript → fails). Defense-in-depth. | ✅ **FIXED + re-gated** — tightened top-limb (`i%4==3`) bound to `fits_bits(52)`. Real bb proof still verifies (`zarf_bb_v2_proof_verifies`, `verify_zarf_bb_v2_proof_succeeds`), adversarial/bit-flip tests still reject, clippy clean. |
| N1-2 (V5) | INFO (new) | verifier | `field.rs:34-40` `Fr::from_str` panics on bad hex / >32 bytes (usize underflow), but only called on hardcoded constants — not attacker-reachable. | confirmed, not exploitable | OPEN (optional robustness; defer to Epoch 5) |
| N1-3 (FS-info-1) | INFO (new) | verifier | `transcript.rs:43-46` `public_inputs_size` only consumed by a release-stripped `debug_assert` in `generate_eta_challenge`; not absorbed. Count is independently pinned in `verify` so not exploitable. | confirmed, not exploitable | OPEN (cosmetic; defer to Epoch 5) |
| I-2 | INFO | verifier | `convert_pairing_points_to_g1` recombines the same 16 limbs twice per verify (`shplemini.rs:82, 256`). | confirmed correctness-neutral | OPEN (cosmetic perf; defer to Epoch 5 `/simplify`) |

**Re-validated known items:** L-3 → RESOLVED (above). L-1 → still accepted LOW (proof binds `(root, audience_hash)` not contract instance; cross-instance replay needs adversarial owner; **recommendation: fold a contract-instance public input into the NEXT VK redeploy at zero marginal cost** — note for Epoch 4/cutover). WIP `Fr::pow` limb-fill → confirmed correct. `hash_bounded_bytes` length-oblivious → refuted as a bug (equality-pinning neutralizes; info footgun only).

### Epoch 2 — Soroban contracts ✅ COMPLETE (partial-workflow + manual)
Workflow hit a session usage limit (resets 8:20pm Europe/Istanbul): only `find:factory` completed; `find:vesting`/`find:jwk-registry`/`find:cross-cutting` + all verify agents died. **Completed manually in the main loop** (read every contract + tests, self-verified). For full per-finding adversarial-refute parity with Epoch 1, the parallel pass can be re-run after the limit resets.

**Verdict: contracts SOUND.** vesting: nullifier set before external call (CEI), full rollback on verify/transfer failure, all 25 PI indices correct + range/canonical-checked, `require_auth(recipient)`, ledger-time + jwt_exp window, audience binding. jwk-registry: two-step ownership correct (`accept_ownership` needs nominee auth), operator/owner split + timelock, comprehensive events. factory (finder): L-1 closed, reservation before deploy+transfer, atomic rollback, no upgrade/setter, i128 `checked_add`, 15/15 tests.

| ID | Sev | Area | Evidence | Status |
|----|-----|------|----------|--------|
| **N2-1** | MEDIUM (new; →HIGH if operator+delay=0 in prod) | jwk-registry / deploy | Constructor enforces NO minimum activation delay (allows 0), and `run_testnet_factory_e2e.sh:104-110` deploys the registry with only `--owner` (no `--activation_delay_secs`). If the missing u64 defaults to 0 (or prod mirrors it), the operator timelock is OFF: once an `operator` is set for automated rotation, a compromised hot worker can `propose_key`(malicious) then immediately `activate_key` (delay elapsed at t=0) → forge any claim. E2e uses owner-only `register_key`, so the operator/timelock path is untested (cf. I-6). | **OPEN — report** (route to Epoch 4). Fix: (a) constructor reject delay below a sane minimum (e.g. <1h), and/or (b) deploy script + runbook MUST pass explicit `--activation_delay_secs` (plan: 6–24h); add an operator-path e2e test. Not auto-applied (trust-root deploy-contract change — your call). |
| **I-3** | LOW (known) | jwk-registry | `validate_modulus` indexed `.get(..).unwrap()` (`lib.rs:586,597`) safe only by caller ordering. | ✅ **FIXED + re-gated** — replaced both unwraps with `.ok_or(Error::InvalidKeyLength)?` (self-contained, no unwrap). fmt/clippy clean, 19 tests pass. |
| N2-2 | INFO (new) | jwk-registry | No on-chain floor on active-key count; a compromised `operator` can DoS all claims by revoking every key one-by-one. Fail-safe direction (can't enable), bounded by owner re-registration + the worker-side mass-revoke guard (Epoch 3). | OPEN (accepted-class; note) |
| N2-3 | INFO (new) | vesting/registry | Claim's `pubkey_hash = keccak256(first 18 PI limbs)` must match the registry's `compute_hash` limb encoding AND the rotation worker's registration encoding (cross-layer consistency). Mismatch = liveness (claims fail), not a security hole. | OPEN — validate worker encoding in Epoch 3 |
| N2-4 | INFO (new) | vesting | `transfer_ownership` is single-step (vs registry's two-step). Owner mishap loses owner control (deposit/set-root) but cannot lock recipient funds (claim needs no owner). | OPEN (info; lower-stakes than registry) |
| — | INFO | factory | fee-on-transfer token → before/after balance-delta guard reverts claim/deposit (liveness; standard SAC/USDC fine). UsedRoot TTL extended once at creation, never re-extended (multi-year archival → re-reservation; ops runbook note). | accepted-class |

### Epoch 3 — Web ✅ COMPLETE
Workflow: 33 agents, 5 finders + per-finding adversarial verify. 28 raw → **20 confirmed, 8 refuted**. CSP/headers/supply-chain, WAL/wizard redaction, telemetry redaction, JWT memory-only, indexer CORS/predict-cache, pin-proxy SEP-53, mass-revoke rails, N2-3 limb encoding, 1536 invariant — all independently **VERIFIED CLEAN**.

| ID | Sev | Area | Evidence | Status |
|----|-----|------|----------|--------|
| **H-2** | 🔴 **CRITICAL** (escalated from HIGH) | web/circuit | 5 finders confirmed. **Worse than "armed-on-merge": already broken on this branch.** The shipped `web/packages/core/static/circuits/zarf.json` AND `web/apps/claim/static/circuits/zarf.json` are byte-identical to `circuits/target/zarf.json` and embed the nonce-binding circuit (`main.nr:81-88,174-175`: `nonce == lowercase-64-hex(recipient)`). Every login path uses `crypto.randomUUID()` (`googleAuth.ts:147,311`); `redirectToGoogleWithRecipient`/`recipientNonce` have ZERO call sites. → **100% of claims fail at witness generation today.** The 2 prior build-breaking defects are NOT present now (greenfield fix). | **OPEN — needs decision** (multi-file re-auth feature + UX: COOP forces one extra PIN re-entry). Fix plan ready; not auto-applied (size + product/UX). |
| **N3-1** (EMAIL-NORM) | 🟠 **HIGH (new)** | web/circuit | create-side identity commitment is computed over `normalizeEmail()` (dot-strip + plus-strip + googlemail→gmail; `email.ts:39-63`, applied `csvProcessor.ts:91` → `computeIdentityCommitment`), but the circuit commits over the **raw JWT `email`** and claim/discovery only `.toLowerCase().trim()`. → any recipient with dots / plus-tags / `googlemail.com` **can never claim** (commitment ∉ tree). exploitable=True. | **OPEN — needs decision.** Fix: commit over the exact form the circuit can prove (the literal JWT email); pick ONE canonical representation + cross-side test vectors. Interacts with accepted emailHashes. Not auto-applied (design/product). |
| **AUTH-1** | LOW (new) | claim | `claimStore.saveSession()` persisted plaintext recipient email to sessionStorage (`:296-307`) — JWT/PIN were memory-only but the email (the unlinkable identifier) was not. | ✅ **FIXED + re-gated** — dropped email from the persisted projection; re-established from the OAuth id_token. lint/check/svelte-check/tests pass. |
| **F3** | LOW (new) | create | `secrets.csv` export (`DeployStep2Backup.svelte:31-34`) raw-concatenated → CSV formula injection (recipient email `=HYPERLINK(...)` executes when operator opens it; can exfil adjacent PIN cells). | ✅ **FIXED + re-gated** — added `csvCell()` quoting + `'`-prefix for `=+-@\t\r`. Tests pass. |
| N3-2 (F2-telemetry) | LOW→INFO (new) | core | telemetry redactor strips JWT+email but not PIN / hash-chain-secret keys. Verifier: not currently exploitable (no log call passes a claim object). | OPEN — recommended defensive add (Epoch 5): also redact `pin`/`secret`-keyed fields. |
| N3-3 (jwk env split) | LOW→INFO (new/validates) | jwk-rotation / deploy | prod domain `jwt.zarf.to` fronts **testnet** RPC/registry; no wrangler env split; grace-window KV (`ROTATION_STATE`) commented out so the 48h grace is inert; `REGISTRY_V2` unset → worker uses immediate owner-only `register_key` holding `REGISTRY_OWNER_SECRET` as a hot key (bypasses the v2 timelock — same root as **N2-1**). Documented as testnet-intentional. | OPEN — **mainnet-cutover blocker** (route to Epoch 4). |

**Refuted (8):** telemetry-PIN-leak (not exploitable now → kept as N3-2 defensive), indexer rate-limit IP-only (acceptable), pin-proxy error-body forward (acceptable), recipientCount=leafCount (naming), epoch-division-dust (no defect), JWK-1 (restates N2-1), JWK-2/grace (config, → N3-3). Good adversarial discipline.

### Epoch 4 — CI/CD, release sequencing, ops ✅ COMPLETE (manual)
Reviewed `ci.yml` (Epoch 0), `deploy.yml`, `codeql.yml`, `run_testnet_factory_e2e.sh`, `docs/runbooks/circuit-redeploy-cutover.md`.

**Verified clean / strong:** deploy secrets per-step scoped (credentials never reach `pnpm install` lifecycle or unrelated matrix apps) ✅; all actions SHA-pinned ✅; CodeQL js-ts + actions, weekly + PR ✅; security-scan cargo-audit/pnpm-audit (continue-on-error, triage-mode) ✅; worker health + secret-presence verify steps ✅; **F-4 fixture-proof gate** scripted + aborts (`run_testnet_factory_e2e.sh:72-96`) ✅; cutover runbook thorough (do-not-merge gate, F-4, vk_hash self-check caveat, L-1 standalone residual + instance-binding note) ✅.

| ID | Sev | Area | Evidence | Status |
|----|-----|------|----------|--------|
| **F-2** | HIGH (systemic) | deploy | `deploy.yml:4-10` `workflow_run` auto-deploys create/claim on CI success → main; no contract deploy; no technical merge/deploy gate (human-discipline only). | OPEN — see §B. Recommend Environment protection / `workflow_dispatch`-only / VK-hash precondition. |
| N4-1 | MEDIUM | deploy/registry | cutover runbook does NOT include: deploy jwk-registry with nonzero `--activation_delay_secs` + configure an **operator** key (deploy.yml syncs `REGISTRY_OWNER_SECRET` as a hot worker key → v2 timelock bypassed). Same root as N2-1/N3-3. | OPEN — add to runbook + harden constructor (min delay). |
| N4-2 | LOW | docs | cutover runbook's OAuth round-trip gate implicitly catches H-2 & N3-1, but neither is listed as an explicit **code-fix prerequisite**; a dotted-gmail test account should be mandated to catch N3-1. | OPEN — runbook edit (fold into fix phase). |
| I-1 | INFO | deploy | F-4 gate is testnet-script-only; contract deploy is entirely out-of-band (deploy.yml deploys web/workers only). Mainnet contract deploy must mirror F-4 manually. | documented in runbook ✅ (keep mandatory) |

### Epoch 5 — Synthesis, code cleaning, capstone ✅ COMPLETE
Exec summary: [`01-executive-summary.md`](01-executive-summary.md).

**Fixes applied this epoch (user-selected: H-2 + cleanup batch):**
| ID | What | Re-gate |
|----|------|---------|
| **H-2** | Recipient-bound re-auth WIRED: `ClaimStep3Wallet` nonce-match guard (proceed if token already binds wallet, else `redirectToGoogleWithRecipient`) + `contractAddress` threaded from `VestingScheduleTable`; `+page.svelte` callback recipient-bound branch (recompute `expectedNonce` from state `address`+`targetWallet`, no stored nonce); `ClaimStep4Proof` defensive nonce assertion (fail-loud). Natural re-convergence + nonce guard avoids any re-auth loop; "+1 PIN re-entry" is the accepted COOP cost. | claim svelte-check + lint + check:any/console + claim tests ✅. **⚠️ live OAuth round-trip pending testnet (cutover runbook gate).** |
| **N3-2** | telemetry redactor adds key-based redaction of PIN/`salt`/`masterSalt`/`secret`/`seed`/`mnemonic`/`privateKey` values. | core tests + lint/drift ✅ |
| **N1-2** | `Fr::from_str` length guard (clear assert vs usize underflow); constants-only. | vendored fmt/clippy + real bb fixture verifies ✅ |

**Deferred (documented):** I-2 (double pairing-point recombine — hot verify-path refactor, negligible gas, finder said safe-to-defer), N1-3 (drop unused release-stripped param) — cosmetic nits in the soundness-critical verifier; not worth churning the crown jewel for zero security/correctness benefit.

**Capstone (user-triggered, billed):** optional `/code-review ultra` on the branch + final `/security-review` for an independent confidence pass.

### Follow-up fix round — N3-1, N2-1/N4-1, F-2 (Opus-investigated + adversarially vetted, then applied + re-gated)
Investigation: 4 Opus agents (email byte-flow across create/claim/circuit; Google JWT email behavior + versioning; N2-1/F-2 patches) + 1 adversarial verifier. Vet verdict on N3-1: `agreesAcrossThreeSides:true`, `breaksExistingDistributions:false`.

| ID | Fix | Re-gate |
|----|-----|---------|
| **N3-1** | Root cause: create committed `normalizeEmail(email)` (strips Gmail dots / `+tag` / googlemail→gmail) but the circuit asserts `expected_email == jwt.email` byte-exact and hashes that literal value, and claim only `.toLowerCase().trim()` → dotted/plus/googlemail recipients' leaf ∉ tree. Fix: added `canonicalizeEmailForCommitment(email)=lowercase+trim` (the only literal-JWT-derivable form); `csvProcessor` commits it (was `normalizeEmail`), removed the dead `normalizeEmail` re-export; `merkleTree`/`ClaimStep4Proof` documented/aligned to the same rule; `normalizeEmail` kept ONLY for the emailHashes visibility filter (not a claim gate). +5 anti-regression tests (canonicalize preserves dots/plus/googlemail, diverges from normalizeEmail, matches the claim witness rule). | core/create/claim test + check + lint + check:any/console ✅ |
| **N2-1/N4-1** | Added `MIN_ACTIVATION_DELAY_SECS=6*3600` floor; constructor rejects `!(MIN..=MAX).contains(delay)` with typed `InvalidActivationDelay` (no `#[repr(u32)]` renumber). +2 tests (below-min, zero). Bumped 15 cross-crate registry registrations (14 vesting.rs + 1 real_zarf_claim.rs) `0_u64`→`MIN_ACTIVATION_DELAY_SECS`. e2e script deploys with `--activation_delay_secs` (default 21600). Runbook: floor + owner≠operator + `REGISTRY_OWNER_SECRET` hot-key/`REGISTRY_V2` coupling. | jwk-registry/vesting/factory fmt/clippy/test ✅ |
| **F-2** | `deploy.yml` job `if` now skips create/claim on the auto `workflow_run` path (they ship VK-bound `zarf.json`); deploy them only via manual `workflow_dispatch` after the on-chain cutover. landing + workers keep auto-deploying. | yaml inspection (matrix-context `if`) |

**Still deferred:** I-2, N1-3 (cosmetic verifier nits). **Recommended follow-ups (non-blocking):** `hashVersion`/`emailCanon` distribution field (forward-safety; legacy dotted/googlemail distros are unfixable in place → re-issue); create-side UX note "enter the recipient's exact Google address"; optional F-2 VK-hash precondition step. **Pending external validation:** H-2 + N3-1 both need a live testnet OAuth round-trip with a real (and a dotted-gmail) account — gated by the cutover runbook.
