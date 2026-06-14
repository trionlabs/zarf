# Zarf JWK Rotation Service

Cloudflare Worker that keeps the Soroban JWK Registry synchronized with
Google's OAuth JWKS endpoint.

## What It Does

- Polls `https://www.googleapis.com/oauth2/v3/certs` on a configurable cron.
- Converts RSA moduli to the 18 x 120-bit limb layout expected by the Noir JWT circuit.
- Registers new Google keys on the Soroban `JwkRegistry`.
- Revokes registry keys after Google removes them, bounded by safety rails:
  - a Google response with fewer than 2 valid keys revokes nothing
    (an empty/malformed JWKS can never wipe the registry);
  - at most `MAX_REVOCATIONS_PER_RUN` keys are revoked per run;
  - revocations never drop the active key count below `MIN_ACTIVE_KEYS`;
  - with the optional `ROTATION_STATE` KV binding, a key must be missing for
    `REVOKE_GRACE_HOURS` before it is revoked (markers clear on reappearance).
- The source of truth for registered keys is the **on-chain registry itself**
  (enumerated via simulation); KV stores only grace-period timestamps.
- Logs every rotation and optionally posts alerts to `ALERT_WEBHOOK_URL`.

## Setup

```sh
cd web/apps/jwk-rotation

# optional but recommended: enables the revocation grace period
wrangler kv namespace create ROTATION_STATE
# put the generated id into wrangler.jsonc (kv_namespaces block)

wrangler secret put REGISTRY_OWNER_SECRET
wrangler secret put ADMIN_TOKEN
wrangler secret put ALERT_WEBHOOK_URL # optional
```

`REGISTRY_OWNER_SECRET` must belong to the account authorized as the registry
owner, or to an account signer that satisfies the registry owner's Soroban auth.

## Manual Runs

```sh
curl -X POST "https://<worker>/rotate?dryRun=true" \
  -H "Authorization: Bearer $ADMIN_TOKEN"

curl -X POST "https://<worker>/rotate" \
  -H "Authorization: Bearer $ADMIN_TOKEN"
```

State inspection (includes configuration presence flags):

```sh
curl "https://<worker>/state" \
  -H "Authorization: Bearer $ADMIN_TOKEN"
```

`/health` is anonymous and returns only `{ "ok": true }`.

## Required Vars

- `STELLAR_RPC_URL`
- `STELLAR_NETWORK_PASSPHRASE`
- `JWK_REGISTRY_ADDRESS`
- `GOOGLE_JWKS_URL`

## Optional Vars

- `REVOKE_REMOVED_KEYS`: defaults to `true`
- `MIN_ACTIVE_KEYS`: defaults to `2`
- `MAX_REVOCATIONS_PER_RUN`: defaults to `1`
- `REVOKE_GRACE_HOURS`: defaults to `48` (needs the `ROTATION_STATE` KV binding)
- `TX_POLL_ATTEMPTS`: defaults to `20`
- `ALERT_WEBHOOK_URL`: generic JSON webhook for rotation/failure alerts
