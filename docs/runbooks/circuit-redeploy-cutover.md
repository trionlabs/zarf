# Runbook: nonce-binding circuit revision + coordinated redeploy

This branch carries a **breaking circuit change** (M1: bind the recipient
into the Google id_token via the OIDC `nonce`). The circuit VK changes, so it
is a coordinated redeploy: the new circuit, verifier, registry, vesting wasm,
factory, and web artifact must cut over together. Old distributions remain
claimable only against the old verifier/circuit.

**Do not merge this branch to `main` (which auto-deploys) until the steps
below are executed on testnet and the live OAuth round-trip is validated.**

## What is already done and validated on this branch

- `circuits/src/main.nr`: reads the `nonce` claim and asserts it equals the
  lowercase 64-hex of the `recipient` field. `MAX_DATA_LENGTH` 1024 -> 1536.
  `nargo test` green. The defense-in-depth batch (Items 1-4, see
  [`circuit-defense-in-depth-batch.md`](circuit-defense-in-depth-batch.md)) is
  now folded into this same circuit/VK: Item 1 made the nonce decode injective
  (`recipient.to_be_bytes::<32>`), Item 2 pinned merkle path indices to boolean;
  `nargo test` is 15 green.
- VK + fixtures regenerated with `poc/scripts/generateZarfProofForStellar.js`
  (nonce = hex(recipient), bb.js 2.1.9); committed at
  `contracts/soroban/zarf/vesting/tests/fixtures/zarf-stellar-recipient/*`
  and `contracts/soroban/verifier/tests/zarf/*`. Current `vk_hash` =
  `0x120d37a4a2a7c13da4369006e00bc4fcd0ce82cdfcca87ce60c5fd1fb03dfefc`
  (the pre-batch M1 VK was `0x27aeb147db74e998681b88e1605c8dfcddcbd43b160574436191bd9ccb4a4640`;
  it is superseded — deploy the new hash).
- Compiled circuit copied to `web/packages/core/static/circuits/zarf.json`
  (the claim app static dir is a symlink to it).
- `web/packages/core/lib/constants.ts` `MAX_SIGNED_DATA_LENGTH` -> 1536
  (must equal the circuit's `MAX_DATA_LENGTH`).
- `googleAuth.ts` gains `redirectToGoogleWithRecipient` + `recipientNonce`;
  `OAuthState` gains `targetWallet` + `resumeStep`.
- Full Rust suite green against the new fixtures: verifier integration (9),
  adversarial harness (8, bit-flip sweeps still reject), vesting incl. the
  real-proof claim (21), factory (13), registry v2 (15).

## Remaining cutover steps (need credentials / live OAuth — NOT done here)

### 1. Wire the claim-flow re-auth (web)

The recipient field is only known after wallet selection (Step 3), so login
at Step 1 cannot carry the right nonce. Implement the re-auth at the
Step 3 -> Step 4 boundary:

- In `ClaimStep3Wallet.svelte` (or the Step 3->4 transition): after
  `setTargetWallet`, compute `recipient = await recipientId(contract, wallet)`
  and call `redirectToGoogleWithRecipient({ clientId, redirectUri,
  contractAddress, targetWallet, recipientFieldHex: recipient, resumeStep: 4 })`.
- In the OAuth callback (`landing/src/routes/+page.svelte` forwards to claim;
  `claim/src/routes/+page.svelte` handles it): when `OAuthState.resumeStep`
  is set, restore `targetWallet`, set the claim step to `resumeStep`, and
  store the fresh JWT. Use a **separate** nonce mechanism from the Step 1
  random-nonce path (the recipient nonce is deterministic, not the stored
  single-use random one — do not consume `OAUTH_NONCE_STORAGE_KEY`).
- In `validateGoogleClaims`, when validating a recipient-bound token, check
  `payload.nonce === recipientNonce(recipient)` instead of the stored random
  nonce. `ClaimStep5Submit.svelte`'s regenerate-proof path must also re-auth.
- Side benefit: the JWT is fresh right before proving, removing the current
  stale-`JwtExpired` failure mode.

**Gate:** exercise the full Google OAuth round-trip on a real account and
confirm Google echoes the 64-hex nonce verbatim and the token's signed-data
length stays < 1536 (bump again if a profile-scoped token overflows). Run the
round-trip with THREE account shapes, because the leaf commits the literal
lowercase+trim id_token email (`canonicalizeEmailForCommitment`) and the circuit
asserts `expected_email == jwt.email` byte-exact:
- a plain `@gmail.com` account;
- a **dotted / plus-tagged** Gmail (`a.b+tag@gmail.com`) — confirms the commit
  path does NOT fold dots/plus (finding N3-1); and
- a **mixed-case Workspace / hosted-domain** primary (e.g. `John.Doe@acme.com`)
  — confirms whether Google emits the `email` claim lowercased. If it does NOT,
  that recipient class cannot claim against this VK (the lowercased witness can
  never match the byte-exact JWT assertion); `ClaimStep4Proof` now fails such a
  token with an actionable error instead of an opaque prover abort, but the real
  close is a case-folding circuit revision in a future VK redeploy.

### 2. Deploy order (testnet, needs the deployer secret)

```
verifier   (new vk_bytes + vk_hash 0x120d37a4...)   # M4/M5/L6 + defense-in-depth batch ride here
*** GATE ***  verify_proof(known-good fixture) vs the fresh verifier — MUST pass
registry   (v2: owner multisig + operator timelock)  # --activation_delay_secs >= MIN (6h); then set_operator to the rotation worker key
vesting    (upload new wasm hash)
factory v2 (constructor: verifier, registry, vesting_wasm_hash)
```

**Hard gate — before constructing the factory** (the factory constructor
embeds the verifier address, so that is the real wiring point, not the UI):
verify a known-good fixture proof against the fresh verifier instance. The
`vk_hash` is bb's internal VK hash, not keccak(vk_bytes), so the constructor
cannot self-check the (vk_bytes, vk_hash) pair — a *consistent but
wrong-circuit* pair would deploy clean and silently verify a different
circuit. This gate is automated in
`contracts/soroban/zarf/scripts/run_testnet_factory_e2e.sh` (the `F-4 GATE`
block runs `verify_proof` on the committed fixture and aborts before the
factory is deployed); mirror that step in any mainnet/manual deploy and do
NOT construct the factory until it passes. See `verifier/src/lib.rs`.

### 3. Update config + rotate the registry

- GitHub vars/secrets: `VITE_STELLAR_*_FACTORY_ADDRESS`, verifier/registry
  addresses; `JWK_REGISTRY_ADDRESS` in `jwk-rotation/wrangler.jsonc`; indexer
  factory config.
- Deploy the registry with an explicit `--activation_delay_secs` >= the
  contract floor `MIN_ACTIVATION_DELAY_SECS` (6h = 21600s). A zero/omitted delay
  is now rejected by the constructor (`Error::InvalidActivationDelay`);
  previously it silently disabled the operator timelock. The e2e script defaults
  to 21600 via `ACTIVATION_DELAY_SECS`.
- Set `REGISTRY_V2=true` on the jwk-rotation worker and point its signer at the
  **operator** key; move the **owner** to a 2-of-3 Stellar multisig. NEVER leave
  owner == operator — the timelock only protects you if the key that can
  `propose_key` (hot worker) is distinct from the cold owner that can
  `register_key`/`cancel_pending`. NOTE: the `REGISTRY_OWNER_SECRET` Worker
  secret in `deploy.yml` is a hot key; when `REGISTRY_V2=true` it must hold the
  OPERATOR key, never the owner. With `REGISTRY_V2` false that same hot key acts
  as the registry owner and bypasses the timelock entirely, so v2 must be
  enabled in the same cutover.
- Run `contracts/soroban/zarf/scripts/run_testnet_e2e.sh`.

### 3a. Merkle-root reservation & replay residual (factory)

The factory reserves each campaign's merkle root (`UsedRoot`) so two factory
campaigns can never share one — a proof binds `(merkle_root, audience_hash)`
but NOT the vesting address, so identically-rooted siblings would otherwise
both accept the same proof. Both create paths reject a zero/deferred root, so
the reservation can never be skipped.

- **Residual:** a *standalone* (non-factory) vesting is outside the factory's
  view. Do NOT deploy two standalone vestings that share a `(merkle_root,
  audience_hash)` pair; full closure needs in-circuit contract-instance binding
  (a VK redeploy).
- **`UsedRoot` TTL:** the reservation TTL is extended once at creation and
  never re-extended. A multi-year campaign risks the entry being archived,
  after which a second campaign could re-reserve the same root. For long-lived
  campaigns, bump it with an `ExtendFootprintTTLOp` before the ~120-day window
  lapses.

### 4. Backward compatibility

Old distributions are pinned to the old verifier/registry and the old circuit
artifact. Keep the previous `zarf.json` published under a versioned path and
have the claim app pick the artifact by distribution, OR declare a sunset
window for v1 distributions. (Distribution *data* — commitments, merkle root —
is unchanged by M1, since nonce binding does not alter any hash derivation;
only the proof now requires a recipient-bound nonce.)

## Regenerating the fixtures (reproducible)

```sh
# 1. compile circuit
cd circuits && nargo compile
cp target/zarf.json ../poc/public/circuits/zarf.json
cp target/zarf.json ../web/packages/core/static/circuits/zarf.json

# 2. regenerate the committed fixture (recipient = recipientId(ALICE))
cd ../poc && pnpm install
node scripts/generateZarfProofForStellar.js \
  --out-dir ../contracts/soroban/zarf/vesting/tests/fixtures/zarf-stellar-recipient \
  --recipient 0x2cb7bbc00eca803faccdaf07418c9fc730ce0943828691547b8d0cb13327964f \
  --secret 1234567890123456789 --amount 1000 --unlock-time 0

# 3. mirror into the verifier fixture
cd ../contracts/soroban/zarf/vesting/tests/fixtures/zarf-stellar-recipient
cp proof public_inputs vk ../../../../verifier/tests/zarf/target/
cp vk_hash.hex ../../../../verifier/tests/zarf/vk_hash.hex
```

## Deferred to a future circuit revision (documented, not in this batch)

- L3 length-prefixed `hash_bounded_bytes` for email/audience (low: the circuit
  already pins exact bytes via `assert_claim_string` / `assert_expected_audience`).
- Merkle leaf/node domain-separation tags.
- Per-epoch secrets via `pedersen(master, i)` instead of the forward hash chain.

These change hash derivations, so they require a `hashVersion`-gated
distribution-data migration (epochDiscovery/merkleTree/claimListBuilder) and
should ride their own VK bump once that migration is built and tested.
