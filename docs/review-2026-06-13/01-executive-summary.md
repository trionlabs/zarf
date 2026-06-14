# Zarf independent re-audit — executive summary (2026-06-13)

Branch `hardening/web-infra`. Epoch-based independent re-audit: ~91 agents across 5 workflows + manual deep passes, every medium+ finding adversarially verified, run against the **live working tree incl. uncommitted WIP**. Full detail + per-finding evidence: [`00-findings-ledger.md`](00-findings-ledger.md).

## Bottom line

**No fund-theft or proof-forgery vector was found anywhere** — not in the Noir circuit, the vendored UltraHonk verifier, the Soroban contracts, or the web/worker layer. The soundness core (the crown jewel) is **sound**: a 25-agent ZK audit confirmed the circuit is fully constrained, Fiat-Shamir absorption is complete, sumcheck/Shplemini are correct, and the verifier validates every point and public input.

**The prior audit docs are largely STALE.** Independent re-verification found that most of the branch's documented "do-not-merge" blockers are **already resolved on the live tree**: H-1 (CI ordering), H-3 (vendored-crate CI coverage), L-1 (factory deferred-root replay), L-2 (registry constructor panic), L-3 (off-curve guard test). They were fixed after the audits were written.

**The real risk is concentrated in ONE area: the claim path doesn't work for users.** Two availability bugs — not security holes — block claimants. Plus a release-sequencing hazard and one deploy-config item.

## Severity-ranked OPEN items

| Pri | ID | Sev | What | Impact | Fix posture |
|-----|----|-----|------|--------|-------------|
| 1 | **H-2** | 🔴 CRITICAL | Shipped `zarf.json` binds `nonce==hex(recipient)` but every login uses a random UUID nonce; recipient-bound re-auth was dead code. | **100% of claims fail at witness generation — today, on this branch.** No theft; product is unusable for claimants. | ✅ **WIRED + statically re-gated** (Epoch 5): Step3→Step4 nonce-match guard → recipient-bound re-auth; callback recipient branch; ClaimStep4Proof defensive assertion. **⚠️ live OAuth round-trip MUST be validated on testnet** (I cannot run Google OAuth; cutover runbook already gates merge on exactly this). |
| 2 | **N3-1** | 🟠 HIGH (new) | Create-side commitment used `normalizeEmail()` (dot/plus/googlemail strip); circuit/claim use the literal JWT email. | Recipients with dots / plus-tags / `googlemail.com` **can never claim** (commitment ∉ tree). No theft. | ✅ **FIXED + re-gated** — create now commits `canonicalizeEmailForCommitment` (lowercase+trim only), matching the literal JWT email the circuit asserts; `normalizeEmail` restricted to the visibility/emailHashes filter. Opus-vetted (`agreesAcrossThreeSides:true`, `breaksExistingDistributions:false`). Residual: sender must enter the recipient's exact Google address. |
| 3 | **F-2** | 🟠 HIGH (systemic) | `deploy.yml` auto-ships create/claim (new-VK `zarf.json`) on merge→main; no contract deploy, no technical gate. | Merge = double-broken deploy (on-chain VK mismatch + H-2 + N3-1). Human-discipline gate only. | ✅ **GATED** — `deploy.yml` job `if` now excludes create/claim from the auto `workflow_run` path; they ship only via manual `workflow_dispatch` after the on-chain cutover. (Option c VK-hash precondition remains an optional hardening.) |
| 4 | **N2-1 / N4-1** | 🟡 MEDIUM (new) | Registry constructor enforced no minimum activation delay; deploy omitted `--activation_delay_secs` → v2 operator timelock could ship disabled. | Compromised rotation worker could activate a malicious Google key instantly → forge claims. | ✅ **FIXED + re-gated** — constructor now rejects delay `< MIN_ACTIVATION_DELAY_SECS` (6h) with typed `InvalidActivationDelay` (+2 tests; 15 cross-crate test sites bumped); e2e script passes `--activation_delay_secs`; runbook documents the floor + operator/hot-key (`REGISTRY_OWNER_SECRET`) coupling. |
| 5 | N3-2, I-2, N1-2, N1-3 | LOW/INFO | telemetry doesn't redact PIN/secret keys (not currently reached); double limb-recombine (perf); `from_str` panic on constants; unused debug-assert param. | Defense-in-depth / cosmetic. | Batch cleanup (`/simplify` + targeted edits). |

## Fixed + re-gated during this review

| ID | What | Gate |
|----|------|------|
| N1-1 | `shplemini` top pairing-point limb aliasing (`fits_bits(68)`→`52` for top limb) | vendored + wrapper tests green, real bb proof still verifies |
| I-3 | `validate_modulus` unguarded `.unwrap()` → `.ok_or(InvalidKeyLength)?` | jwk-registry fmt/clippy + 19 tests |
| AUTH-1 | plaintext email dropped from claim sessionStorage | lint/svelte-check/tests |
| F3 | `secrets.csv` CSV-formula-injection neutralized | lint/svelte-check/tests |
| H-2 | recipient-bound re-auth wired (Step3→Step4 nonce guard + callback branch + Step4 defensive assert) | claim svelte-check/lint/tests (⚠️ testnet OAuth round-trip pending) |
| N3-2 | telemetry redactor now also strips PIN/secret-keyed values | core tests/lint |
| N1-2 | `Fr::from_str` length guard (clear assert vs usize underflow) | vendored fmt/clippy + real bb fixture verifies |
| **N3-1** | create commits `canonicalizeEmailForCommitment` (lowercase+trim) not `normalizeEmail`; `normalizeEmail` restricted to visibility filter; +5 anti-regression tests | core/create/claim test + check + lint/drift (Opus-vetted) |
| **N2-1/N4-1** | registry constructor floor `MIN_ACTIVATION_DELAY_SECS=6h` (typed reject) +2 tests +15 cross-crate site bumps; e2e + runbook | jwk-registry/vesting/factory fmt/clippy/test |
| **F-2** | `deploy.yml` excludes create/claim from auto `workflow_run` (manual dispatch only, post-cutover) | yaml inspection |

Plus re-validated-as-resolved: H-1, H-3, L-1 (factory), L-2, L-3.

**Deferred (cosmetic, soundness-critical crate — rationale: zero security/correctness benefit, finders rated safe-to-defer):** I-2 (double pairing-point recombine — hot verify-path refactor for negligible gas), N1-3 (drop unused release-stripped `public_inputs_size` param). **Recommended follow-ups (not blocking):** `hashVersion`/`emailCanon` field in the distribution JSON (forward-safety for future email-canon changes; legacy distros with dotted/googlemail recipients are unfixable in place and need re-issue); a create-side UX note that the recipient email must match their exact Google address; optional F-2 option-c VK-hash precondition step.

## Accepted / out-of-scope (do not refile)
Unsalted email hashes (ADR 0001); non-ZK flavor (ADR 0002); identity-by-email; PII working-tree-only; standalone-vesting `(root,audience_hash)` replay residual (true close = next VK redeploy adds an instance-binding public input — recommended); one extra PIN re-entry per claim. External verifier audit + ZK-Honk port remain pre-mainnet follow-ups.

## Coverage
Epoch 0 baseline (22/22 gates green) · Epoch 1 circuit+verifier (25 agents) · Epoch 2 contracts (manual after session-limit) · Epoch 3 web (33 agents) · Epoch 4 CI/CD+ops (manual) · Epoch 5 synthesis.
