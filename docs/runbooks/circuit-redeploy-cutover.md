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
  `nargo test` green (12 tests incl. 3 nonce cases).
- VK + fixtures regenerated with `poc/scripts/generateZarfProofForStellar.js`
  (nonce = hex(recipient)); committed at
  `contracts/soroban/zarf/vesting/tests/fixtures/zarf-stellar-recipient/*`
  and `contracts/soroban/verifier/tests/zarf/*`. New `vk_hash` =
  `0x27aeb147db74e998681b88e1605c8dfcddcbd43b160574436191bd9ccb4a4640`.
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
length stays < 1536 (bump again if a profile-scoped token overflows).

### 2. Deploy order (testnet, needs the deployer secret)

```
verifier   (new vk_bytes + vk_hash 0x27aeb147...)   # M4/M5/L6 hardening rides here
registry   (v2: owner multisig + operator timelock)  # set_operator to the rotation worker key
vesting    (upload new wasm hash)
factory v2 (constructor: verifier, registry, vesting_wasm_hash)
```

After deploy, **before wiring the factory into the UI**, verify a known-good
fixture proof against the fresh verifier instance (the `vk_hash` is bb's
internal VK hash, not keccak(vk_bytes), so the constructor cannot self-check
it — see `verifier/src/lib.rs`).

### 3. Update config + rotate the registry

- GitHub vars/secrets: `VITE_STELLAR_*_FACTORY_ADDRESS`, verifier/registry
  addresses; `JWK_REGISTRY_ADDRESS` in `jwk-rotation/wrangler.jsonc`; indexer
  factory config.
- Set `REGISTRY_V2=true` on the jwk-rotation worker and point its signer at
  the **operator** key; move the **owner** to a 2-of-3 Stellar multisig.
- Run `contracts/soroban/zarf/scripts/run_testnet_e2e.sh`.

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
