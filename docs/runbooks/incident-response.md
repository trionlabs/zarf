# Runbook: incident response

Quick reference for the highest-severity operational incidents. Testnet today;
treat these as the mainnet playbook.

## A. Malicious or unexpected JWK in the registry

**Symptom:** `jwk-rotation` fires `registry_keys_not_in_google_jwks`, or a key
hash appears on-chain that is not in Google's live JWKS.

**Why it's critical:** any RSA key the registry marks valid can mint claims
against every campaign.

**Response:**
1. If the key is **pending** (registry v2): the activation delay is your
   window — `cancel_pending(key_hash)` with the owner key immediately.
2. If the key is **active**: `revoke_key(key_hash)` (owner) or
   `operator_revoke_key` (operator). Revocation is immediate.
3. Rotate the operator key (`set_operator`) if the worker is suspected
   compromised; audit `REGISTRY_OWNER_SECRET` access.
4. Confirm Google's real keys are (still) registered so legitimate claims
   keep working; do not drop below 2 active keys.

## B. Mass claim failures ("InvalidPubkey" / all claims rejected)

**Likely cause:** the registry lost Google's current key (over-revocation, or a
rotation bug), or the verifier/registry instance archived (TTL).

**Response:**
1. Check active registry keys vs Google JWKS (`/state` on the rotation worker,
   admin-auth). Re-register any missing live key (owner).
2. If a contract instance archived: submit an `ExtendFootprintTTLOp` /
   restore for the verifier or registry instance.
3. The revocation safety rails (min-2-active, max-1-per-run, grace period)
   should prevent over-revocation; if they were bypassed, set
   `REVOKE_REMOVED_KEYS=false` until the cause is found.

## C. Pin/IPFS outage

See [`pinata-recovery.md`](pinata-recovery.md). Funds are safe; the claim app
view degrades. Re-pin from a surviving copy or rebuild from the creator backup.

## D. Indexer abuse / RPC bill spike

**Symptom:** RPC quota burn, indexer latency.

**Response:** the `REQUEST_LIMITER` rate-limit binding caps per-IP load; tighten
its limit (`wrangler.jsonc`) or add a Cloudflare WAF rule on `indexer.zarf.to`.
The claim path has a direct-RPC fallback for discovery, so throttling the
indexer does not break claims.

## E. Suspected verifier soundness issue

**Symptom:** a proof verifies that should not, or audit finding.

**Response:** this is the highest-severity class. There is no on-chain
upgrade path; mitigation is to deploy a fixed verifier + factory and migrate.
Pause new campaign creation (factory is immutable — coordinate a UI-level halt
and communicate). Pull in the audit partner. Pre-mainnet this must be closed by
a third-party audit (see SECURITY.md).

## Key rotation reference

- Registry **owner** (cold/multisig): `transfer_ownership`, `register_key`,
  `cancel_pending`, `set_operator`, `revoke_key`.
- Registry **operator** (hot worker): `propose_key`, `operator_revoke_key`.
- Worker secrets: `wrangler secret put REGISTRY_OWNER_SECRET|ADMIN_TOKEN` per
  app; rotate by re-putting and redeploying.
