# @zarf/indexer

Read-only Cloudflare Worker that fronts Soroban RPC for the web apps: it
resolves vesting/factory/token state, predicts vesting addresses, batches
claim-status reads, and proxies CID-verified IPFS reads. Responses are cached
at the edge (Cloudflare Cache API) with per-endpoint TTLs.

## Notable behavior

- **Per-IP rate limiting** (`REQUEST_LIMITER`): a single uncached
  owner-vestings request fans out to many RPC simulations, so the worker is a
  potential RPC amplifier — the limiter caps that.
- **Edge cache**: `/factory/predict` folds the active factory address into the
  cache key (a redeploy must not serve stale predictions); unverifiable IPFS
  content is capped to a short TTL rather than cached immutably.
- CORS allow-list never falls back to `*`.
- No secrets, no KV — stateless except the edge cache.

## Config

- Per-network vars: `STELLAR_<NET>_RPC_URL`, `STELLAR_<NET>_FACTORY_ADDRESS`,
  optionally `..._NETWORK_PASSPHRASE`.
- `ALLOWED_ORIGINS`, `unsafe.bindings` (rate limiter).

```sh
pnpm --filter @zarf/indexer typecheck
```
