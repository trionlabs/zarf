# Soroban Upgradeability Plan

Status: draft plan  
Scope: `contracts/soroban/verifier`, `contracts/soroban/zarf/{jwk-registry,vesting,factory}`  
Reviewed sources: local contract code/tests, Stellar upgrade/TTL/metadata docs, and independent security, auditability, and Soroban-practices subagent reviews.

## Executive Decision

Do not add a raw `upgrade(new_wasm_hash)` function to these contracts.

Zarf's contracts move or authorize movement of real funds, and the verifier plus JWK registry are claim-minting trust roots. Upgradeability must be introduced as an explicit governance protocol with proposal, delay, cancellation, execution, migration, versioning, observability, and test gates. Anything weaker turns the upgrade key into the system's highest-risk private key.

Important constraint: any already-deployed contract that does not contain an upgrade entrypoint cannot be upgraded in place. Soroban upgrades require the deployed instance's current Wasm to expose a function that calls `env.deployer().update_current_contract_wasm(new_wasm_hash)`. The new Wasm must already be uploaded. Therefore, this plan applies to future deployments or to currently deployed instances only if they already include such an entrypoint.

## Current Contract Posture

- `jwk-registry`: has owner/operator split, timelocked key activation, persistent key state, and two-step ownership transfer. It has no code-upgrade primitive or stored schema version.
- `vesting`: stores campaign owner, token, verifier, registry, Merkle root, audience hash, metadata CID, and persistent `Claimed` guards. It has one-step ownership transfer and no upgrade admin separation.
- `factory`: stores verifier address, JWK registry address, and `VestingWasmHash` only at construction. It has no owner/admin, pause, deprecate, config rotation, or upgrade primitive.
- `verifier`: stores `vk` and `vk_hash` at construction. It is otherwise stateless and has no upgrade primitive, version API, migration API, or initialization event.

## Non-Negotiable Security Invariants

1. Campaign `Owner` must not be upgrade admin for `vesting`. The campaign owner currently deposits and manages a campaign, but the contract holds recipient funds. If that owner can upgrade claim logic, they can rug recipients.
2. The verifier is equivalent to the proof system. Any verifier upgrade can make arbitrary proofs pass unless the upgrade is treated as a circuit release with fixture validation.
3. Registry owner/operator boundaries must not be weakened. The hot operator may propose and revoke keys, but must never upgrade code, shorten delays, or bypass pending activation.
4. Storage layout is append-only. Do not rename `DataKey` variants or change the value type stored under an existing key.
5. Constructors do not rerun after Wasm upgrades. Every new storage field needs an explicit migration or a safe default.
6. Upgrade observability is part of correctness. Indexers and users must be able to see proposed, cancelled, executed, and migrated upgrades.

## Architecture

### Shared Upgrade Module Pattern

Implement the same governance primitive in each upgradeable contract, either as copy-local code or a small internal pattern kept mechanically identical across crates.

New instance keys:

```rust
DataKey::UpgradeAdmin
DataKey::PendingUpgrade
DataKey::SchemaVersion
DataKey::Paused // factory and optionally vesting
```

Core types:

```rust
pub struct PendingUpgrade {
    pub wasm_hash: BytesN<32>,
    pub manifest_hash: BytesN<32>,
    pub proposed_at: u64,
    pub execute_after: u64,
    pub from_version: u32,
    pub to_version: u32,
}
```

Core methods:

- `version() -> u32`: compile-time code version.
- `schema_version(env) -> u32`: stored migration version.
- `upgrade_admin(env) -> Result<Address, Error>`.
- `propose_upgrade(env, wasm_hash, manifest_hash, to_version) -> Result<(), Error>`.
- `cancel_upgrade(env) -> Result<(), Error>`.
- `execute_upgrade(env) -> Result<(), Error>`.
- `migrate(env, target_version) -> Result<(), Error>` or contract-specific `handle_upgrade`.

`execute_upgrade` must:

1. Require `UpgradeAdmin` auth.
2. Load `PendingUpgrade`.
3. Enforce `ledger.timestamp() >= execute_after`.
4. Emit an `UpgradeExecuting` event with old version, target version, manifest hash, and Wasm hash.
5. Call `env.deployer().update_current_contract_wasm(wasm_hash)`.

Because the call swaps the executable, any new schema initialization must happen through a callable migration handler in the new code. The release process should invoke `migrate(target_version)` immediately after execution and fail the release if it does not emit `MigrationCompleted`.

### Governance

Use a cold Stellar multisig or contract account as `UpgradeAdmin`. Do not reuse:

- the JWK rotation worker operator,
- per-campaign vesting owners,
- deployer hot keys,
- CI/CD service credentials.

Minimum proposal delay:

- Registry: at least `MIN_ACTIVATION_DELAY_SECS` and preferably longer than the JWK key activation delay.
- Vesting: at least 48 hours because recipient funds are at risk.
- Factory: at least 7 days because factory Wasm can change future verifier wiring and must not bypass the verifier-rotation delay.
- Verifier: at least 7 days unless an emergency response policy is separately approved, because this changes proof acceptance.

Add two-step `UpgradeAdmin` rotation:

- `propose_upgrade_admin(new_admin)`.
- `accept_upgrade_admin()`.
- `cancel_upgrade_admin_transfer()`.

Do not support single-step upgrade-admin replacement.

## Contract-Specific Plan

### JWK Registry

Add upgrade governance only under the cold owner/admin path. The hot `Operator` must not be allowed to propose or execute upgrades.

Implementation requirements:

- Add `UpgradeAdmin` separately from `Owner`, or explicitly set it to the same cold owner multisig during construction/migration.
- Add `SchemaVersion`.
- Convert `owner_unchecked(...).expect(...)` into typed `Result` flow with `Error::NotInitialized`.
- Ensure `set_operator` extends contract TTL.
- Ensure `remove_pending` re-extends TTL for moved `PendingAt` and `PendingIndex` entries.
- Add richer events for `operator_set` with previous operator, ownership transfer cancellation, pending-key cancellation with `kid`, and upgrade lifecycle.

Migration requirements:

- Preserve `Owner`, `PendingOwner`, `Operator`, `ActivationDelay`.
- Preserve active/revoked `Key`, `Kid`, `KeyAt`, and `KeyIndex` entries.
- Preserve `Pending`, `PendingAt`, `PendingIndex`, and `PendingCount`.
- Do not alter key-hash computation or RSA limb validation.

### Vesting

Vesting is the most dangerous place to add upgradeability because it holds funds owed to recipients.

Recommended model:

- New vesting deployments are upgradeable only by protocol governance, not campaign owner.
- Existing deployed vestings should remain immutable unless they already contain a valid upgrade entrypoint and governance was disclosed before funds were deposited.
- Do not add setters for `Verifier`, `JwkRegistry`, `Token`, `MerkleRoot`, `AudienceHash`, or `Claimed` state as part of upgradeability.

Implementation requirements:

- Add `UpgradeAdmin` and `SchemaVersion`.
- Replace one-step `transfer_ownership` with `propose_owner`, `accept_ownership`, and `cancel_ownership_transfer` in the next major vesting version.
- Add `Paused` only if there is a precise emergency need. If added, it may block new `deposit` and `claim` only under a documented incident policy; pausing claims is user-hostile and must be a last resort.
- Keep `Claimed(epoch_commitment)` key and bool value unchanged forever.
- Emit `UpgradeProposed`, `UpgradeCancelled`, `UpgradeExecuted`, `MigrationCompleted`, and `OwnershipTransferCancelled`.

Migration requirements:

- Prove every previously claimed epoch remains rejected.
- Prove token balances are unchanged across upgrade plus migration.
- Prove proof validation still binds root, recipient, amount, audience, JWT expiration, and registered key.
- Do not mutate campaign owner, token, verifier, registry, root, audience, or metadata unless a specific audited migration requires it.

### Factory

Factory now has an explicit `UpgradeAdmin`, pause/deprecate controls, governed
Wasm upgrades, and governed verifier rotation for future vesting deployments.
Verifier rotation uses the same seven-day minimum as factory Wasm upgrades: the
new immutable verifier must expose the proposed `vk_hash`, proposals include
`circuit_hash` and `manifest_hash`, and executed metadata remains readable from
factory state. Existing vesting verifier addresses are not mutated by verifier
rotation; separate vesting Wasm upgrades remain a distinct governed change to
claim behavior.

Implementation requirements:

- Keep `UpgradeAdmin` separate from campaign owners and hot operator keys.
- Keep `pause`, `unpause`, and `deprecate` limited to new factory deployments; recipient claims in existing vestings must not depend on factory pause state.
- Use factory `propose_verifier_update` / `execute_verifier_update` only for future deployments. Do not mutate existing vesting verifier addresses in routine circuit releases.
- If future `VestingWasmHash` or registry config rotation is added, give it the same proposal/cancel/execute shape and manifest discipline.
- Expand `VestingCreated` or add a second event containing verifier, registry, vesting Wasm hash, Merkle root, audience hash, and release manifest hash/CID.
- Keep deterministic address derivation unchanged unless a versioned factory explicitly documents a new salt scheme.

Migration requirements:

- Preserve `DeploymentCount`, `DeploymentAt`, owner deployment indexes, `MetadataCid`, and `UsedRoot`.
- Handle the known historical layout hazard: earlier builds stored a bare `Address` under deployment keys; current code expects `DeploymentInfo`. Any in-place upgrade from that layout needs an explicit migration that rewrites old entries or keeps backward-compatible readers until migration completes.
- Prove duplicate-root prevention still holds after migration.

### Verifier

Verifier upgrades are circuit releases. Treat them more strictly than normal code upgrades.

Preferred model:

- Keep verifier immutable and deploy a new verifier for circuit changes.
- Point only new factories/campaigns at the new verifier.
- Existing vestings should continue to use the verifier they were created with.

If in-place verifier upgrades are still required:

- Add `UpgradeAdmin`, `SchemaVersion`, `version()`, and `VerifierInitialized`/`VerifierManifest` events.
- Expose `manifest()` fields: `vk_hash`, `vk_bytes_hash`, expected proof bytes, public input count, circuit artifact hash, Noir version, bb.js version, and manifest hash/CID.
- Require release tooling to verify a known-good Zarf proof against the upgraded verifier before any factory or vesting points at it.
- Keep old `symbol_short!("vk")` and `symbol_short!("vk_hash")` storage readable or migrate them explicitly.

## Release Manifest

Every upgrade or redeploy must publish a machine-readable manifest, committed to the repo and optionally pinned to IPFS.

Required fields:

- git commit SHA,
- network,
- contract name and address,
- old Wasm hash and new Wasm hash,
- constructor args for fresh deployments,
- `from_version`, `to_version`, and `schema_version`,
- `vk_hash`, VK bytes hash, proof fixture hash, public input count for verifier/circuit releases,
- factory `VestingWasmHash`,
- registry owner, operator, and activation delay,
- upgrade admin and timelock,
- migration method and target version,
- validation commands and transaction hashes.

The `manifest_hash` stored in `PendingUpgrade` should be a hash of the canonical serialized manifest.

## Testing Plan

Add test-only v1/v2 Wasm fixtures for each upgradeable contract.

Required tests:

- unauthorized propose/cancel/execute fails,
- hot operator cannot upgrade registry,
- campaign owner cannot upgrade vesting,
- proposal cannot execute before timelock,
- cancellation prevents execution,
- uploaded Wasm hash upgrades code and preserves contract address,
- constructor does not rerun,
- migration sets `SchemaVersion`,
- migration is idempotent or returns typed `AlreadyMigrated`,
- old storage remains readable after upgrade,
- persistent entries survive: registry active/revoked/pending keys, vesting `Claimed`, factory deployments and `UsedRoot`,
- token balances are unchanged by vesting upgrades,
- duplicate claims still fail after upgrade,
- duplicate Merkle roots still fail after factory upgrade,
- factory uses the rotated vesting Wasm only after governed config execution,
- verifier still rejects wrong VK hash, truncated proofs, mutated proofs, malformed public inputs, and unknown circuits,
- TTL tests assert instance, code, and persistent-entry TTL behavior.

## Operational Runbook

1. Build all old and new Wasm artifacts.
2. Run `cargo test` for verifier, registry, vesting, factory, and verifier library.
3. Run `nargo test` and regenerate fixtures for circuit changes.
4. Upload new Wasm with `stellar contract upload`.
5. Generate release manifest and compute `manifest_hash`.
6. Call `propose_upgrade(wasm_hash, manifest_hash, to_version)`.
7. Publish the manifest, PR, and proposed transaction hash.
8. Wait through the timelock while monitoring events and community/auditor review.
9. If challenged, call `cancel_upgrade`.
10. If accepted, call `execute_upgrade`.
11. Call `migrate(target_version)` using the new client bindings.
12. Run post-upgrade simulations and live checks: version, schema version, critical getters, known-good proof, known-bad proof, factory listing, duplicate-root rejection, duplicate-claim rejection.
13. Commit final transaction hashes and observed event IDs to the manifest.

## Required Documentation Fixes Before Implementation

- Update `contracts/soroban/zarf/README.md`: it refers to `register_key_hash`, but current registry code exposes `register_key`; it also describes a 23-field public input layout while `vesting` currently requires 25 fields.
- Update verifier docs/examples to include required `vk_hash`.
- Reconcile canonical deployed testnet addresses in docs/config before publishing any manifest.
- Add an ADR that chooses either immutable redeploys for existing deployments or governed in-place upgrades for future deployments.

## External References

- Stellar upgrade guide: `https://developers.stellar.org/docs/build/guides/conventions/upgrading-contracts`
- Stellar TTL guide: `https://developers.stellar.org/docs/build/guides/conventions/extending-wasm-ttl`
- Stellar Wasm metadata guide: `https://developers.stellar.org/docs/build/guides/conventions/wasm-metadata`
- Existing circuit redeploy runbook: `docs/runbooks/circuit-redeploy-cutover.md`
