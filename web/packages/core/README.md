# @zarf/core

Framework-agnostic logic for the Zarf web apps: crypto (Merkle tree, Pedersen,
email normalization), domain flows (claim, epoch discovery, deploy planning),
contract/indexer clients, IPFS fetch with CID verification, and shared
config/constants. No Svelte, no DOM — this is where the testable logic lives.

```sh
pnpm --filter @zarf/core test
```

Key modules:

- `crypto/merkleTree.ts` — distribution Merkle tree, identity commitments, PIN
  generation. **Mirrors the Noir circuit's hashing** — changes here must match
  `circuits/src/main.nr`.
- `domain/` — `claimFlow`, `epochDiscovery`, `deployPlanner`, `claimListBuilder`.
- `contracts/` — vesting/factory/token clients (via the indexer).
- `utils/` — `email` (normalization incl. gmail/googlemail), `ipfsFetch`
  (gateway fallback + `cidVerify`), `telemetry` (PII-redacting beacon reporter),
  `log`.

Dependency direction: `core` depends on nothing in this repo; `ui` and the apps
depend on `core`. Never import `ui` or app code from here.
