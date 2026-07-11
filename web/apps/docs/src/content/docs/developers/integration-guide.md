---
title: Integration guide
description: Build on Zarf without forking it — derive distribution addresses, read claim status, embed claim links, and listen to on-chain events.
sidebar:
  order: 7
---

This guide shows how to build on top of Zarf's deployed contracts and services
without forking the codebase. It assumes you have read the
[architecture overview](/developers/architecture/) and have the
[Stellar CLI](https://developers.stellar.org/docs/tools/cli/install-cli)
installed.

Everything here targets **Stellar testnet**. Mainnet is not deployed — launch is
gated on a third-party security audit. See
[project status](/resources/project-status/).

## Stability contract

Read this before you build:

- **The on-chain contract interfaces are the source of truth.** Pull them live
  with `stellar contract info interface` (see below) rather than copying
  signatures from prose. The [contracts reference](/developers/contracts/)
  documents them from source.
- **The indexer HTTP API is versioned under `/v1/`.** Treat `/v1/` paths as the
  stable read surface. See the [indexer API](/developers/indexer-api/) reference
  for the full endpoint list, response shapes, and caching behavior.
- **Deployed WASM can lag the source tree.** Some functions exist in the Rust
  source but are not in the currently deployed testnet WASM (for example the
  vesting batch view `claimed_statuses`). Confirm a function is present in the
  live interface before depending on it. See
  [deployed contracts](/resources/deployed-contracts/).
- **Do not depend on internal/off-chain write APIs.** The `pin-proxy` write
  routes are signature-gated for Zarf's own create flow, and the `web/scripts/*`
  demo scripts are QA tooling, not a public API.

## Get the contract interfaces and a typed client

Pull the live interface for any deployed contract:

```bash
stellar contract info interface --network testnet \
  --id <FACTORY_CONTRACT_ID>
```

Generate a typed TypeScript client from the same source:

```bash
stellar contract bindings typescript --network testnet \
  --id <FACTORY_CONTRACT_ID> \
  --output-dir ./zarf-factory --overwrite
```

```ts
import { Client } from 'zarf-factory';

const factory = new Client({
  contractId: '<FACTORY_CONTRACT_ID>',
  networkPassphrase: 'Test SDF Network ; September 2015',
  rpcUrl: 'https://soroban-testnet.stellar.org',
});

const { result } = await factory.get_deployment_count(); // number (u32)
```

For the current testnet contract IDs, see
[deployed contracts](/resources/deployed-contracts/).

## Derive a distribution's address deterministically

The factory deploys each vesting contract at a **deterministic address** derived
from the owner and a 32-byte salt. Two important properties:

- The salt is **owner-bound**: the factory hashes the owner into the deployment
  salt (`keccak256(owner_xdr || salt)`), so a distribution address cannot be
  squatted by another account.
- You can compute the address **before** the distribution is created, which lets
  you pre-build claim links and UIs.

Ask the factory rather than reimplementing the derivation:

```bash
stellar contract invoke --network testnet --source <YOU> \
  --id <FACTORY_CONTRACT_ID> \
  -- predict_vesting_address --owner <OWNER_G...> --salt <32-byte-hex>
```

`predict_vesting_address(owner: Address, salt: BytesN<32>) -> Address` is defined
in `contracts/soroban/zarf/factory/src/lib.rs`.

The indexer exposes the same prediction over HTTP:

```
GET https://indexer.zarf.to/v1/testnet/factory/predict/:owner/:salt
```

## Enumerate deployed distributions

The factory tracks every deployment and every owner's deployments. The read
functions are paginated (max page size `80` entries per call, enforced by the
contract):

- `get_deployment_count() -> u32`
- `get_deployment_infos(start: u32, limit: u32) -> Vec<DeploymentInfo>`
- `get_owner_deployment_count(owner: Address) -> u32`
- `get_owner_deployment_infos(owner: Address, start: u32, limit: u32) -> Vec<DeploymentInfo>`

`DeploymentInfo` is `{ address: Address, metadata_cid: String }`. Prefer the
indexer, which paginates and caches these for you:

```
GET https://indexer.zarf.to/v1/testnet/vestings
GET https://indexer.zarf.to/v1/testnet/owners/:owner/vestings
```

## Read a distribution's metadata

Every vesting contract exposes a single `summary()` call and the individual
accessors it aggregates:

```bash
stellar contract invoke --network testnet --source <YOU> \
  --id <VESTING_CONTRACT_ID> -- summary
```

`summary() -> VestingSummary` returns `owner`, `token`, `verifier`,
`jwk_registry`, `name`, `description`, `merkle_root`, `audience_hash`, and
`metadata_cid` (from `contracts/soroban/zarf/vesting/src/lib.rs`). The indexer's
`GET /v1/testnet/vestings/:address` wraps this and adds token symbol, decimals,
and the current token balance.

## Read claim status

A claim is recorded on-chain under a per-recipient, per-epoch
**epoch commitment** (a 32-byte value). The reliable read on deployed contracts
is:

```bash
stellar contract invoke --network testnet --source <YOU> \
  --id <VESTING_CONTRACT_ID> \
  -- is_claimed --epoch_commitment <32-byte-hex>
```

`is_claimed(epoch_commitment: BytesN<32>) -> bool` returns `true` once a claim
has committed. This flag is **monotonic** — a committed claim never reverts to
`false` — which is what makes it safe to cache.

<!-- TODO(verify): the vesting source also defines `claimed_statuses(Vec<BytesN<32>>) -> Vec<bool>` (batch, max 64), but it is NOT present in the live testnet vesting interface dump (presentation/integration/interfaces/vesting.rs, verified 2026-06-30). Confirm whether the deployed WASM exposes it before documenting it as callable. -->

For batch reads, use the indexer instead of one simulation per commitment. It
reads the claim guards with a single `getLedgerEntries` RPC call:

```
# One commitment (cached: 1h when true, 10s when false)
GET https://indexer.zarf.to/v1/testnet/vestings/:address/claimed/:commitment

# Batch, up to 100 commitments per request (uncached — per-user sets never hit cache)
GET https://indexer.zarf.to/v1/testnet/vestings/:address/claimed?commitments=<hex32>,<hex32>,...
```

See [indexer API](/developers/indexer-api/) for the exact response shapes and
TTLs.

## Recipient binding is a hash, not an address

Zarf binds a claim to a recipient by a hash, never to the recipient's identity.
Both the factory and each vesting contract expose:

```bash
stellar contract invoke --network testnet --source <YOU> \
  --id <VESTING_CONTRACT_ID> -- recipient_id --recipient <RECIPIENT_G...>
```

`recipient_id(recipient: Address) -> BytesN<32>` returns
`BN254_Fr(keccak256(recipient_xdr))` — the field element the circuit and
contract compare against. Nothing on-chain links this back to an email. See the
[privacy model](/learn/privacy-model/) for the full picture. The indexer mirrors
it at `GET /v1/testnet/vestings/:address/recipient-id/:recipient`.

## Embed claim links

Zarf's own claim apps are driven entirely by URL parameters, so you can generate
claim links yourself once you know a distribution's address.

- **Email / ZK distributions** are claimed at `claim.zarf.to` and carry the
  target vesting contract address in an `address` query parameter. The recipient
  signs in with Google and enters their PIN; their browser generates the proof.

  <!-- TODO(verify): confirm the exact public claim URL shape. The claim app reads `?address=<vesting C...>` (web/apps/claim/src/routes/+page.svelte) and an in-app link uses `/claim?address=...` (DistributionCard.svelte). Verify whether the canonical link is `https://claim.zarf.to/?address=<C...>` or `https://claim.zarf.to/claim?address=<C...>`. -->

- **Wallet airdrops** are claimed at `airdrop.zarf.to` with the airdrop contract
  address and its metadata CID:

  ```
  https://airdrop.zarf.to/claim?a=<AIRDROP_CONTRACT_ID>&cid=<METADATA_CID>
  ```

  (format from `web/scripts/deploy_demo_airdrop.ts`).

See [claim your tokens](/recipients/claim-your-tokens/) and
[claim with a wallet](/recipients/claim-with-wallet/) for the recipient-facing
flows these links open.

## Listen to on-chain events

Both contracts publish events you can subscribe to over Soroban RPC / Horizon.

**Factory — `campaign_created`** (emitted on `create_campaign`):

- Topics: `["campaign_created", campaign: Address, owner: Address, token: Address]`
- Data: `{ claim_authorization, claim_schedule, reclaim_policy, claim_deadline, total_amount, recipient_count, merkle_root, metadata_cid }`

**Vesting — `claimed`** (emitted on a successful `claim`):

- Topics: `["claimed", epoch_commitment: BytesN<32>, recipient: Address]`
- Data: `amount: i128`

The vesting contract also emits `deposited` (data `amount: i128`),
`merkle_root_set`, and `owner_set` (`previous_owner`, `new_owner`). Event
definitions are in the `#[contractevent]` structs in each contract's `lib.rs`.

## Indexer vs. direct RPC

The indexer (`indexer.zarf.to`) is an optional, edge-cached read backend. It
does not hold keys and cannot move funds — it only wraps expensive Soroban RPC
simulations and IPFS reads. You can always fall back to direct public RPC and a
public IPFS gateway; `@zarf/core`'s indexer client is built to do exactly that
when no indexer URL is configured. For metadata integrity, the indexer re-hashes
gateway bytes against the CID before returning them — see
[IPFS and metadata](/developers/ipfs-and-metadata/).

## Where to go next

- [Contracts reference](/developers/contracts/) — every function, event, and
  storage key.
- [Indexer API](/developers/indexer-api/) — full endpoint reference and caching.
- [Self-hosting](/developers/self-hosting/) — run the whole stack yourself.
- [Security model](/developers/security-model/) — trust boundaries and known
  issues.
