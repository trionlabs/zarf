# Zarf JWK Rotation Service

Cloudflare Worker that keeps the Soroban JWK Registry synchronized with
Google's OAuth JWKS endpoint.

## What It Does

- Polls `https://www.googleapis.com/oauth2/v3/certs` on a configurable cron.
- Converts RSA moduli to the 18 x 120-bit limb layout expected by the Noir JWT circuit.
- Registers new Google keys on the Soroban `JwkRegistry`.
- Revokes keys previously managed by this service after Google removes them.
- Stores managed `kid -> key_hash` state in Workers KV so removed keys can be revoked safely.
- Logs every rotation and optionally posts alerts to `ALERT_WEBHOOK_URL`.

## Setup

```sh
cd web/apps/jwk-rotation

wrangler kv namespace create JWK_ROTATION_STATE
wrangler kv namespace create JWK_ROTATION_STATE --preview
```

Put the generated namespace ids into `wrangler.jsonc`, then configure secrets:

```sh
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

State inspection:

```sh
curl "https://<worker>/state" \
  -H "Authorization: Bearer $ADMIN_TOKEN"
```

## Required Vars

- `STELLAR_RPC_URL`
- `STELLAR_NETWORK_PASSPHRASE`
- `JWK_REGISTRY_ADDRESS`
- `GOOGLE_JWKS_URL`
- `STATE_KEY`

## Optional Vars

- `REVOKE_REMOVED_KEYS`: defaults to `true`
- `TX_POLL_ATTEMPTS`: defaults to `20`
- `ALERT_WEBHOOK_URL`: generic JSON webhook for rotation/failure alerts
