# Airdrop Integration and Similarity Review

Date: 2026-07-05

Branch reviewed: `integration/prod-readiness`

## Summary

The airdrop feature introduces a second product path:

- Existing ZK flow: `web/apps/create` creates email-based vesting distributions; `web/apps/claim` claims with Google email identity plus a ZK proof.
- New airdrop flow: `web/apps/airdrop-create` creates wallet-address Merkle airdrops; `web/apps/airdrop-claim` claims directly with the wallet.

The product split is real: the ZK claim app needs Google auth, Noir/BB dependencies, WASM/prover CSP exceptions, and email-based discovery. The airdrop claim app avoids those and can run with a stricter CSP.

The implementation, however, is mostly a set of parallel SvelteKit app trees. That gives security isolation, but it also duplicates app shell, env parsing, CSP construction, worker config, pinning client logic, wizard/persistence patterns, and deploy workflow wiring. The largest risk is not only line count; it is drift in security headers, environment variables, and cross-app URLs.

## Findings

### P1: Airdrop claim links can be built with the wrong host

`airdrop-create` builds share links from `VITE_AIRDROP_CLAIM_URL`, falling back to `window.location.origin`:

- `web/apps/airdrop-create/src/routes/wizard/done/+page.svelte:18-23`
- `web/apps/airdrop-create/src/routes/distributions/+page.svelte:103-107`

But the deploy workflow does not pass `VITE_AIRDROP_CLAIM_URL` into the Svelte build env:

- `.github/workflows/deploy.yml:100-114`
- `web/.env.example:82-88` documents the variable, but CI deploy does not wire it.

If the var is absent during build, Vite will compile it as empty, and the generated claim URL falls back to the `airdrop-create` origin. With separate workers/domains, that produces links such as:

`https://airdrop.zarf.to/?a=<airdrop>&cid=<cid>`

instead of:

`https://claim-drop.zarf.to/?a=<airdrop>&cid=<cid>`

That is a production workflow breaker for every newly-created airdrop.

Recommendation:

- Add `VITE_AIRDROP_CLAIM_URL` to deploy job env.
- Validate it when `matrix.app == 'airdrop-create'`.
- Avoid falling back to current origin unless the claim route is intentionally hosted inside the create app.

### P1: Landing chooser cannot enable the wallet-create path from deploy env

The landing `/create` chooser reads `VITE_AIRDROP_CREATE_URL` and renders the wallet option as "Coming soon" when it is not configured:

- `web/apps/landing/src/routes/create/+page.svelte:18-20`

The deploy workflow does not pass `VITE_AIRDROP_CREATE_URL` either:

- `.github/workflows/deploy.yml:100-114`

So even after deploying `airdrop-create`, the public chooser can remain disabled unless the variable is manually injected by some path outside this workflow.

Recommendation:

- Add `VITE_AIRDROP_CREATE_URL` to deploy job env.
- Decide whether the wallet path should be hidden until custom domains are attached or enabled with the workers.dev URL.
- Add a tiny smoke/build assertion for landing chooser config.

### P1/P2: Frontend env validation still models only the original ZK factory apps

The workflow's `has_profile` helper validates `VITE_STELLAR_<NETWORK>_RPC_URL` plus `VITE_STELLAR_<NETWORK>_FACTORY_ADDRESS` for every Svelte app:

- `.github/workflows/deploy.yml:164-210`

The airdrop apps now align with that factory env:

- `airdrop-create` and `airdrop-claim` require `VITE_STELLAR_<NETWORK>_FACTORY_ADDRESS`.
- `airdrop-create` also needs `VITE_PIN_PROXY_URL` to prepare and pin the claim list.
- `airdrop-claim` only needs a factory address to satisfy the shared network-config gate; it does not call the factory during claims.

The actual airdrop requirement lives in:

- `web/apps/airdrop-create/src/lib/coreInit.ts:82-88`
- `web/apps/airdrop-claim/src/lib/coreInit.ts:86-91`

Remaining behavior can fail in one direction:

- It can ship `airdrop-create` without a pin proxy URL, which fails at runtime in `web/apps/airdrop-create/src/lib/services/pinService.ts:47-52`.

Recommendation:

- Replace the one-size `has_profile` check with app-specific requirements.
- Required for `airdrop-create`: RPC, factory, pin proxy, claim URL.
- Required for `airdrop-claim`: RPC, factory unless core config is relaxed.
- Required for `landing`: only cross-app URLs relevant to enabled chooser cards.

### P2: CSP and security headers are duplicated across four app hooks

The airdrop hooks explicitly mirror the existing app hooks:

- `web/apps/airdrop-claim/src/hooks.server.ts:1-14`
- `web/apps/airdrop-create/src/hooks.server.ts:1-13`
- `web/apps/claim/src/hooks.server.ts:56-81`
- `web/apps/create/src/hooks.server.ts:49-82`

Measured similarity:

- `airdrop-claim/src/hooks.server.ts` vs `claim/src/hooks.server.ts`: 95.5%
- `airdrop-create/src/hooks.server.ts` vs `create/src/hooks.server.ts`: 96.7%
- `airdrop-claim/svelte.config.js` vs `claim/svelte.config.js`: 92.8%
- `airdrop-create/svelte.config.js` vs `create/svelte.config.js`: 94.6%

The differences are meaningful: ZK claim needs `unsafe-eval`, `wasm-unsafe-eval`, Google APIs, and CRS fetches; airdrop apps intentionally omit them. But the implementation relies on manually keeping the header policy and `kit.csp` policy in sync across multiple files.

Recommendation:

- Keep separate origins if that is the security boundary.
- Extract a small shared CSP/header builder with explicit modes, for example `zk-claim`, `zk-create`, `airdrop-claim`, `airdrop-create`.
- Unit-test the generated policies so intentional differences are asserted instead of copied by comments.

### P2: `coreInit` is duplicated and reveals an awkward shared config model

Measured similarity:

- `airdrop-claim/src/lib/coreInit.ts` vs `claim/src/lib/coreInit.ts`: 74.7%
- `airdrop-create/src/lib/coreInit.ts` vs `create/src/lib/coreInit.ts`: 80.5%

The airdrop claim app notes that it requires a factory address only to satisfy core's configured-network gate:

- `web/apps/airdrop-claim/src/lib/coreInit.ts:5-9`

Core now treats the unified factory address as required for a configured network:

- `web/packages/core/lib/config/runtime.ts:74-82`

- `web/packages/core/lib/config/runtime.ts:74-82`

For wallet-direct claim, the URL `?a=<airdrop>` is the real instance anchor. Requiring a factory just to switch networks is a sign that `StellarRuntimeConfig` is mixing generic transport config with product capabilities.

Recommendation:

- Extract common env-to-network parsing into a shared helper.
- Split "network is usable" from "this app can deploy via factory".
- Let `airdrop-claim` configure RPC/Horizon/explorer without needing a factory address, unless it actually calls factory functions.

### P2: `pinService` is almost the same client twice

Measured similarity:

- `web/apps/airdrop-create/src/lib/services/pinService.ts` vs `web/apps/create/src/lib/services/pinService.ts`: 93.4%

The important differences are endpoint and document root field:

- Airdrop posts `/pin-airdrop` and signs `doc.root`.
- ZK create posts `/pin` and signs `doc.merkleRoot`.

Everything else is shared mechanics: proxy URL lookup, timeout, body hashing, SEP-53-style signature headers, response parsing, and retry behavior.

Recommendation:

- Move the generic pin-client mechanics into `@zarf/core` or a small `@zarf/ui` service utility.
- Pass endpoint, serializer, and root selector as parameters.
- Consider porting the airdrop version's transient-only retry semantics back to the ZK pin client.

### P2/P3: Demo script uses a third claim URL convention

The workflow/wrangler comments describe `claim-drop.zarf.to` as the airdrop claim origin:

- `.github/workflows/deploy.yml:64-67`
- `web/apps/airdrop-claim/wrangler.jsonc:15-21`

But the demo deploy script prints:

- `web/scripts/deploy_demo_airdrop.ts:256`

as:

`https://airdrop.zarf.to/claim?a=<airdrop>&cid=<cid>`

That differs from the actual airdrop-claim app shape, which serves the claim page at `/` with query params.

Recommendation:

- Make the demo script use `VITE_AIRDROP_CLAIM_URL` or a script argument.
- Keep one canonical claim-link format across demo, create UI, docs, and deploy comments.

## Similarity Inventory

Branch-wide diff:

| Area | Added | Deleted | Files |
| --- | ---: | ---: | ---: |
| `contracts/soroban/zarf/airdrop*` | 7,808 | 0 | 10 |
| `web/apps/airdrop-*` | 4,849 | 0 | 48 |
| `web/packages/core` | 1,973 | 11 | 24 |
| Other contracts | 1,873 | 153 | 21 |
| Other web apps | 1,531 | 151 | 15 |
| Other web files | 869 | 55 | 8 |
| Existing `create`/`claim` app changes | 393 | 179 | 20 |
| Other/docs/workflows | 422 | 18 | 8 |

So the branch's `+19,718/-567` is not mostly duplicated Svelte app code. The two new
airdrop apps account for 4,849 added lines. The biggest share is new Soroban airdrop
contract/factory code and tests.

Line counts, excluding dependency/build directories:

| App | Lines |
| --- | ---: |
| `web/apps/airdrop-claim` | 1,458 |
| `web/apps/claim` | 4,495 |
| `web/apps/airdrop-create` | 3,391 |
| `web/apps/create` | 9,632 |

Inside the two airdrop apps, a practical split is:

| Bucket | Lines |
| --- | ---: |
| Unique airdrop create flow | 2,263 |
| Duplicate app scaffold/config | 652 |
| Unique airdrop claim UI | 510 |
| Tests | 497 |
| Duplicate env/core init | 263 |
| Very similar service/component (`pinService`, `WizardSteps`) | 233 |
| Unique airdrop claim service | 211 |
| Duplicate layout shell | 185 |
| Other | 35 |

That gives an app-level merge/extraction upper estimate of about 1,333 lines:
scaffold/config, env init, layout shell, and the very similar pin/progress pieces.
The remaining roughly 2,984 lines are mostly real airdrop product code that would move
into `create`/`claim` if the apps merged, not disappear.

High-similarity same-path files:

| Pair | Similarity |
| --- | ---: |
| `airdrop-claim/src/hooks.server.ts` vs `claim/src/hooks.server.ts` | 95.5% |
| `airdrop-claim/svelte.config.js` vs `claim/svelte.config.js` | 92.8% |
| `airdrop-claim/wrangler.jsonc` vs `claim/wrangler.jsonc` | 90.4% |
| `airdrop-claim/src/lib/coreInit.ts` vs `claim/src/lib/coreInit.ts` | 74.7% |
| `airdrop-create/src/hooks.server.ts` vs `create/src/hooks.server.ts` | 96.7% |
| `airdrop-create/svelte.config.js` vs `create/svelte.config.js` | 94.6% |
| `airdrop-create/src/lib/services/pinService.ts` vs `create/src/lib/services/pinService.ts` | 93.4% |
| `airdrop-create/wrangler.jsonc` vs `create/wrangler.jsonc` | 90.3% |
| `airdrop-create/package.json` vs `create/package.json` | 88.6% |
| `airdrop-create/src/lib/components/wizard/WizardSteps.svelte` vs `create/src/lib/components/wizard/WizardSteps.svelte` | 85.9% |
| `airdrop-create/src/lib/coreInit.ts` vs `create/src/lib/coreInit.ts` | 80.5% |

## What Is Genuinely Different

Claim path:

- ZK claim: Google auth, email discovery, recipient-bound ZK proof, vesting timeline.
- Airdrop claim: claim-link CID, wallet address lookup, Merkle proof, direct `claim` contract call.

Create path:

- ZK create: token selection, email CSV, schedules/vesting, backup/PIN flow, deploy/fund vesting contract.
- Airdrop create: token address, wallet recipients, optional deadline/lock, Merkle claim list, approve/fund through the unified factory.

Security posture:

- ZK claim/create need heavy WASM/prover build configuration and CSP exceptions.
- Airdrop apps intentionally avoid Noir/BB and can keep stricter script policy.

## Recommended Refactor Shape

Do not immediately merge everything into one app unless the origin/CSP decision changes. The safer short-term shape is:

1. Keep separate deployed apps/origins for ZK and airdrop.
2. Extract shared SvelteKit app infrastructure:
   - CSP/header builder.
   - Wrangler/config templates or workflow generation.
   - Runtime env/network parsing.
3. Extract shared service utilities:
   - Pin proxy client.
   - Network-keyed localStorage helpers.
   - Deploy WAL helpers.
4. Keep product-specific surfaces local:
   - ZK email/proof components.
   - Airdrop wallet/Merkle components.
   - Contract-specific deployment steps.
5. Add integration tests for the cross-app front door:
   - Landing chooser URL.
   - Airdrop done-page claim URL.
   - Deploy workflow env requirements.
   - Claim link format consistency.

## Verification

Static review completed with file comparison and targeted source reads.

Attempted tests:

- `pnpm --dir web --filter @zarf/airdrop-create test`
- `pnpm --dir web --filter @zarf/airdrop-claim test`

Both failed before running because dependencies are not installed in this checkout:

`vitest: not found`
