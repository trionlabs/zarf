---
title: Indexer API
description: HTTP reference for the Zarf indexer — a shared read backend for Soroban factory/vesting discovery, claim status, token metadata, and IPFS reads.
sidebar:
  order: 4
---

The Zarf indexer is a Cloudflare Worker that acts as a shared read backend for
Stellar/Soroban and IPFS. Browsers call it instead of each repeating the same
RPC simulations and gateway fetches. It is **read-only** (GET only), requires no
authentication, and every response is cached at the Cloudflare edge with a TTL
matched to that endpoint's volatility.

- **Base URL:** `https://indexer.zarf.to` (custom domain, from `wrangler.jsonc`).
- **Source:** `web/apps/indexer/src/index.ts`.
- **Network segment:** most routes are namespaced by network, e.g.
  `/v1/testnet/...`. The network name is resolved to an RPC URL + factory
  address from worker config; an unconfigured network returns
  `network_not_configured`.

:::note
The indexer is a convenience/cache layer. It is not a stability-guaranteed
public API — treat paths and response shapes as versioned by `/v1` but subject
to change, and see the [integration guide](/developers/integration-guide/) for
what is safe to depend on.
:::

## Conventions

- **Method:** `GET` only. Anything else returns `405 method_not_allowed`.
  `OPTIONS` returns `204` for CORS preflight.
- **Errors:** JSON `{ "error": "<code>", "message"?: "<detail>" }` with an HTTP
  status. Errors are never cached.
- **`fetchedAt`:** most responses include a `fetchedAt` millisecond timestamp.
- **CORS:** `Access-Control-Allow-Origin` is set per request from the worker's
  `ALLOWED_ORIGINS` allowlist (falls back to the first configured origin, or
  `*`). `Vary: Origin`.
- **Cache bypass:** append `?refresh=1` (any value) to skip the edge-cache read.
  The fresh result is still stored, so a forced refresh warms the shared entry
  while the browser is told `Cache-Control: no-store` for that one response.

## Caching semantics

Read responses are stored in the Cloudflare Cache API (`caches.default`,
per-colo) keyed by URL. TTLs (seconds) from source:

| Response class | TTL const | Value |
|---|---|---|
| Content-addressed / deterministic (IPFS, predicted address) | `CACHE_TTL_IMMUTABLE` | 31,536,000 (1y, `immutable`) |
| Unverifiable IPFS bytes (TTL cap) | `CACHE_TTL_UNVERIFIED` | 300 |
| Factory listings | `CACHE_TTL_LIST` | 60 |
| Vesting summary (embeds a volatile balance) | `CACHE_TTL_SUMMARY` | 60 |
| Token name/symbol/decimals | `CACHE_TTL_TOKEN_METADATA` | 3,600 |
| `recipient_id` | `CACHE_TTL_RECIPIENT_ID` | 3,600 |
| Latest ledger | `CACHE_TTL_LEDGER_LATEST` | 5 |
| Single claim status, `claimed: true` | `CACHE_TTL_CLAIMED_TRUE` | 3,600 |
| Single claim status, `claimed: false` | `CACHE_TTL_CLAIMED_FALSE` | 10 |

The single claim-status endpoint keys its TTL on the result: **a committed
claim never reverts**, so `claimed: true` is monotonic and cached for an hour,
while `claimed: false` is cached for only 10 seconds so it flips quickly after a
claim lands. Balances, allowances, and the batched claim-status endpoint are
**never cached** (they gate approvals / are per-user). IPFS reads are normally
immutable (1y), but when the gateway bytes cannot be authenticated against the
CID (`unverifiable` — e.g. a multi-block DAG over 256 KiB), the response is
marked `X-Zarf-Cid-Unverified: 1` and its TTL is capped at `CACHE_TTL_UNVERIFIED`
(300s).

## Endpoints

### `GET /health`

```json
{ "ok": true, "cache": "edge" }
```

### `GET /v1/:network/vestings`

All deployments from the factory registry.

```json
{
  "vestings": [{ "address": "C...", "metadataCid": "Qm..." | null }],
  "total": 12,
  "fetchedAt": 1720000000000
}
```

### `GET /v1/:network/vestings/:address`

Full metadata for one vesting contract (from its `summary`, plus token display
metadata and live balance).

```json
{
  "address": "C...", "name": "…", "description": "…",
  "token": "C...", "merkleRoot": "0x…",
  "tokenSymbol": "XLM", "tokenDecimals": 7, "owner": "G...",
  "vestingStart": "0", "cliffDuration": "0",
  "vestingDuration": "0", "vestingPeriod": "0",
  "tokenBalance": "…", "metadataCid": "Qm..." | null
}
```

:::note[Schedule fields are placeholders]
`vestingStart`, `cliffDuration`, `vestingDuration`, and `vestingPeriod` are
returned as `"0"` — the on-chain vesting contract does **not** store the
schedule. The real schedule lives in the pinned claim-list JSON; fetch it via
the IPFS endpoints below or read `metadataCid`. See
[IPFS & metadata](/developers/ipfs-and-metadata/).
:::

### `GET /v1/:network/vestings/:address/claimed?commitments=<hex32>[,<hex32>...]`

Batched claim status. Reads the persistent `Claimed(commitment)` ledger entries
in a single `getLedgerEntries` RPC call rather than one simulation per
commitment. Up to `CLAIMED_BATCH_LIMIT = 100` commitments per request
(`too_many_commitments` beyond that; `invalid_commitments` if none). **Not
cached** — commitment sets are per user.

```json
{ "claimed": { "0x…": true, "0x…": false }, "fetchedAt": 1720000000000 }
```

An absent ledger entry means never claimed; a committed `Claimed` entry is
always `true` (the contract's `false` writes only happen on error paths whose
transactions revert), and the value is decoded from the entry rather than
inferred from presence.

### `GET /v1/:network/vestings/:address/claimed/:commitment`

Single claim status. TTL depends on the result (see caching above).

```json
{ "claimed": true, "fetchedAt": 1720000000000 }
```

### `GET /v1/:network/vestings/:address/recipient-id/:recipient`

The contract's `recipient_id` for a Stellar address (deterministic per
contract+recipient).

```json
{ "recipientId": "0x…", "fetchedAt": 1720000000000 }
```

### `GET /v1/:network/owners/:owner/vestings`

Vesting contracts created by one owner, with full metadata. Optional
`?maxContracts=<n>` (default 50, capped by the worker's `MAX_CONTRACTS`, default
100). `total` is the owner's full deployment count even when the returned
`contracts` array is truncated.

```json
{ "contracts": [ /* same shape as GET .../vestings/:address */ ], "total": 3, "fetchedAt": … }
```

### `GET /v1/:network/ledger/latest`

```json
{ "sequence": 1234567, "fetchedAt": 1720000000000 }
```

### `GET /v1/:network/factory/predict/:owner/:salt`

Deterministic vesting address for `(owner, salt)` via the factory's
`predict_vesting_address`. `salt` is a 32-byte hex value.

```json
{ "address": "C...", "fetchedAt": 1720000000000 }
```

### `GET /v1/:network/tokens/:token`

Token display metadata. Missing fields are `null` (they are optional).

```json
{ "name": "…" | null, "symbol": "…" | null, "decimals": 7 | null, "totalSupply": null, "logoUrl": null }
```

### `GET /v1/:network/tokens/:token/balances/:owner`

Never cached — must reflect just-submitted transactions.

```json
{ "balance": "…", "fetchedAt": 1720000000000 }
```

### `GET /v1/:network/tokens/:token/allowances/:owner/:spender`

Never cached.

```json
{ "allowance": "…", "fetchedAt": 1720000000000 }
```

### `GET /v1/ipfs/:cid`

Fetches the pinned JSON for a CID through the worker's gateway pool, **after
re-hashing the bytes against the CID**. Not network-namespaced. Returns the raw
pinned document. See [IPFS & metadata](/developers/ipfs-and-metadata/) for the
verification model.

### `GET /v1/ipfs/:cid/email-hashes`

Extracts only the `emailHashes` array from a distribution document (avoids
downloading the full, potentially multi-MB JSON just to filter eligibility).

```json
{ "emailHashes": ["0x…"] | null, "fetchedAt": 1720000000000 }
```

`null` means the distribution has no email gating (visible to everyone).

## Error codes

| Status | `error` | When |
|---|---|---|
| 400 | `invalid_address` | Malformed Stellar address |
| 400 | `invalid_hex` | Malformed hex / wrong byte length (salt, commitment) |
| 400 | `invalid_cid` | Malformed IPFS CID |
| 400 | `invalid_commitments` | `?commitments=` empty/missing |
| 400 | `too_many_commitments` | More than 100 commitments in a batch |
| 400 | `invalid_path` | Undecodable URL segment |
| 404 | `not_found` | Unknown route |
| 405 | `method_not_allowed` | Non-GET method |
| 429 | `rate_limited` | Per-IP request rate limit exceeded |
| 500 | `network_not_configured` | Network segment not configured on the worker |
| 500 | `indexer_error` | Unhandled server error |
| 502 | `rpc_simulation_error` / `rpc_empty_result` | Soroban simulation failed |
| 502 | `rpc_ledger_entries_error` | `getLedgerEntries` RPC failed |
| 502 | `ipfs_gateway_error` | All IPFS gateways failed |
| 502 | `invalid_contract_response` | Unexpected contract return shape |

## Batching and limits

- Factory range reads are chunked at `FACTORY_RANGE_LIMIT = 40` deployments per
  call and fetched in parallel. This margin exists because each
  `DeploymentInfo` on the **currently deployed** factory costs two ledger-entry
  reads (`DeploymentAt` + `MetadataCid`), while the factory built from current
  source packs both into one entry and caps pages at 80. 40 is valid for both
  layouts, so it holds until every deployed factory is on the new WASM (see the
  WASM-lag note under [deployed contracts](/resources/deployed-contracts/)).
- Batched claim status is capped at 100 commitments per request.
- IPFS gateway responses are read with an 8 MiB ceiling and a 5s per-gateway
  timeout; the worker tries Pinata, ipfs.io, dweb.link, and w3s.link in order.
- A per-IP rate limiter (keyed on `CF-Connecting-IP`) guards the worker, since a
  single uncached read can fan out to many upstream RPC simulations. Exceeding it
  returns `429 rate_limited`; the deployed config allows 60 requests per 60s per
  IP. When the binding is absent, no limiting is applied.

## Monitoring use

For creators tracking claim progress, the practical endpoints are
`GET /v1/:network/vestings/:address` (pool balance) and the claim-status
endpoints. See [monitoring](/creators/monitoring/) for a task-oriented walkthrough.
