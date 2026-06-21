# Circuit defense-in-depth batch (coordinated VK regen)

**Status: APPLIED on `hardening/web-infra` (2026-06-21).** All four items are
resolved and folded into a single VK regen:
- **Item 1** — fixed in-circuit (owner chose the `< p` injective decode over the
  accepted-risk ADR). Implemented by comparing the nonce's 32 decoded bytes
  against `recipient.to_be_bytes::<32>()` (canonical, value `< p`), which admits
  the full `[0, p)` recipient range while rejecting non-canonical preimages.
  **Adversarially verified SOUND** (no funds-lock / no injectivity gap; Noir
  `to_be_bytes` confirmed canonical against stdlib docs).
- **Item 2** — fixed in-circuit (`assert(is_right * (is_right - 1) == 0)`).
- **Items 3 & 4** — reviewed, **no change needed** (offset is bound by the
  signature-verified span; `jwt_exp` is a u64 that cannot alias into Field and
  overflows in-circuit on a malformed claim). Rationale documented inline at the
  call sites in `circuits/src/main.nr`.

New `vk_hash` after the batch: `0x120d37a4a2a7c13da4369006e00bc4fcd0ce82cdfcca87ce60c5fd1fb03dfefc`
(was `0x27aeb147...` for the M1 nonce-binding VK). `nargo test` 15 green (incl.
3 new regression cases); full Rust suite green against the regenerated fixtures
(verifier 9, vesting 24, registry 28, factory 15). The on-chain cutover itself
(deploy order, OAuth round-trip) still follows
[`circuit-redeploy-cutover.md`](circuit-redeploy-cutover.md) and the PR stays
**draft / do-not-merge** until contracts redeploy first.

**Severity of every item below: Low /
defense-in-depth — none is a theft vector.** They are batched here so they ship
as ONE circuit change and ONE coordinated redeploy, never piecemeal (any circuit
edit regenerates the VK; see [`circuit-redeploy-cutover.md`](circuit-redeploy-cutover.md)).

The per-item analysis below is retained for the record.

## Why these are Low, not Critical

The recipient is bound into the Google-signed token via the OIDC `nonce`
(`assert_nonce_binds_recipient`, `circuits/src/main.nr`). In any token-theft
scenario the `nonce` is **fixed by Google's signature** — the attacker cannot
re-sign a different nonce — so the recipient is uniquely determined and cannot be
redirected. That binding is what makes the items below hardening rather than
exploitable holes. Apply them to shrink the trusted surface and remove
malleability, not because a known attack exists.

Do NOT apply any of these on their own branch-merge cadence. Each changes the
circuit → new VK → coordinated redeploy of verifier + registry + vesting +
factory + the web `zarf.json` artifact + fixture regeneration. Batch all four.

---

## Item 1 — Make the nonce→recipient decoding injective

**Where:** `assert_nonce_binds_recipient`, `circuits/src/main.nr`.

**What:** `acc` accumulates 64 hex digits = up to 256 bits, but it is a `Field`
(BN254 scalar, p ≈ 2^253.6). For decoded values in `[p, 2^256)` the accumulation
wraps mod p, so up to ~4 distinct 64-hex strings map to the same `recipient`. The
encoding is therefore not injective.

**Why it is only Low:** the prover cannot choose the nonce — the frontend always
requests `nonce = 64-hex(recipient)` with `recipient ∈ [0, p)` (it is
`keccak256(address_xdr) mod p`), so the canonical encoding has its top bits zero
and never wraps. A non-canonical preimage would have to be **signed by Google**,
which never happens. No theft path; the gap is purely a non-canonical-input
soundness nicety.

**Fix (recommended):** constrain the decoded 256-bit value to be `< p`, i.e.
reject any nonce whose integer value is not the canonical representative. Decode
the high portion explicitly and assert it cannot push the value to/above the
field modulus. This must still admit the **full** `[0, p)` range (recipients are
uniform in `[0, p)`, so a naive "top two hex digits must be 0" check is WRONG —
it would reject the majority of legitimate recipients).

**Alternative:** if a clean in-circuit `< p` check is deemed not worth the
constraint cost, record the residual explicitly as an accepted-risk ADR (sibling
to `docs/adr/0001-unsalted-email-hashes-accepted-risk.md`) and close the item.
Decision required from the owner.

**Test:** add `should_fail` cases for a non-canonical 64-hex preimage of a valid
recipient, alongside the existing `test_nonce_*` cases.

---

## Item 2 — Constrain Merkle `path_indices` to boolean

**Where:** `verify_merkle_proof`, `circuits/src/main.nr`.

**What:** `is_right = path_indices[i]` is compared only with `== 1`; any value
other than 1 silently takes the "left" branch. The index is an unconstrained
`Field`, so non-boolean path vectors are accepted.

**Why it is only Low:** the prover must still hash up to the public
`merkle_root`, so a non-boolean index cannot forge membership — it only allows
multiple witness encodings for the same proof (malleability), not a wrong root.
The JS/contract side already emits 0/1.

**Fix (exact):** inside the loop, before use:

```noir
let is_right = path_indices[i];
assert(is_right * (is_right - 1) == 0, "path index must be 0 or 1");
```

**Test:** a `should_fail_with = "path index must be 0 or 1"` case feeding a `2`.

---

## Item 3 — Confirm `base64_decode_offset` is bound

**Where:** `main(...)` passes `base64_decode_offset` into `JWT::init`,
`circuits/src/main.nr`.

**What:** verify that the vendored `jwt` library constrains the offset (that the
decoded `header.payload` window cannot be shifted by the prover to smuggle a
different claims region). This is a review-and-confirm item, not a known gap.

**Fix:** read the `jwt` crate's `init`/`verify`; if the offset is already pinned
by the signature-verified base64 region, document that and close. If not, add an
assertion binding the offset to the verified span.

**Test:** if an assertion is added, a `should_fail` case with a shifted offset.

---

## Item 4 — Range-check `jwt_exp`

**Where:** `let jwt_exp: u64 = jwt.get_claim_number("exp")`, returned as
`jwt_exp as Field`, `circuits/src/main.nr`.

**What:** confirm `get_claim_number` rejects an out-of-range / malformed `exp`
and that the `u64 -> Field` widening cannot alias. The contract consumes
`jwt_exp` for the expiry gate, so a malformed value should fail in-circuit, not
silently produce a small Field.

**Why it is only Low:** the value is downstream of a signature-verified claim;
the realistic failure is a parse edge case, not attacker control.

**Fix:** confirm the library's numeric parser bounds the digit count; add an
explicit upper-bound assert on `jwt_exp` if not already present.

**Test:** boundary case at the parser's max.

---

## Coordinated cutover (do this once, for the whole batch)

1. Apply Items 1–4 to `circuits/src/main.nr` together; `nargo test` green
   (including the new `should_fail` cases).
2. `nargo compile` → new `target/zarf.json`.
3. Regenerate the VK and **all** bb.js fixtures via
   `poc/scripts/generateZarfProofForStellar.js` (exact invocation in
   `circuit-redeploy-cutover.md`). The Rust↔JS Merkle fixture is unaffected
   (tree shape unchanged) unless Item 1/2 alters leaf/path encoding — re-run the
   differential test to confirm.
4. Verify `MAX_DATA_LENGTH` (circuit) still equals `MAX_SIGNED_DATA_LENGTH`
   (`web/packages/core/lib/constants.ts`) — load-bearing invariant.
5. Follow `circuit-redeploy-cutover.md` for the on-chain sequence: deploy new
   verifier → registry → vesting → factory FIRST, then ship the web `zarf.json`.
   This is the same ordering hazard as F-2 in the CI/CD report: web-with-new-VK
   must never lead the on-chain contracts, or live claims break.
6. Keep any PR carrying the new `zarf.json` **draft / do-not-merge** until the
   contract side is live and verified.
