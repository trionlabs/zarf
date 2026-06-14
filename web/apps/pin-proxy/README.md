# @zarf/pin-proxy

Stateless Cloudflare Worker that pins distribution claim-list JSON to IPFS via
Pinata, keeping the Pinata JWT server-side. Also proxies authenticated IPFS
reads with CID verification.

## Routes

- `POST /pin` — pin a claim list, returns `{ cid }`. Auth: SEP-53 signature
  (`X-Zarf-Owner` / `-Issued-At` / `-Body-SHA256` / `-Signature`) over a
  canonical message, with a 5-minute replay window and a body-hash binding.
  **Rate-limited** per IP and per owner (`PIN_IP_LIMITER` / `PIN_OWNER_LIMITER`).
- `GET /ipfs/:cid` — proxied read; bytes are verified against the CID and
  served as `application/json` with `nosniff` (no gateway Content-Type
  reflection).
- `GET /health` — `{ ok: true }`.

## Caveat

Pin auth proves possession of *some* Ed25519 keypair, not authorization. The
rate limits bound abuse; for mainnet, bind pinning to an on-chain action or an
owner allowlist (see the pin-proxy section of the remediation plan).

## Config

- Secret: `wrangler secret put PINATA_JWT`.
- Vars: `ALLOWED_ORIGINS` (CORS, never falls back to `*`), `MAX_BODY_BYTES`.
- `unsafe.bindings`: the two rate-limit namespaces.

```sh
pnpm --filter @zarf/pin-proxy test       # SEP-53 verify, CID validation, CORS
pnpm --filter @zarf/pin-proxy typecheck
```
