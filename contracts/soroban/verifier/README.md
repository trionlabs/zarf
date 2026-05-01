# rs-soroban-ultrahonk

Soroban contract wrapper around the Noir UltraHonk verifier. This Zarf copy targets the bb.js v2.1.9 UltraKeccakHonk proof/VK layout and stores the VK at deploy time.

Zarf's current fixture is checked in under `tests/zarf/target`:
- `vk`
- `proof`
- `public_inputs`

## Quickstart (localnet)

Prereqs:
- `stellar` CLI (stellar-cli)
- Rust + `wasm32v1-none` target
- Docker (for localnet)

```bash
# 1) Start localnet
stellar container start -t future --name local --limits unlimited

# 2) Configure network + identity
stellar network add local \
  --rpc-url http://localhost:8000/soroban/rpc \
  --network-passphrase "Standalone Network ; February 2017"
stellar network use local
stellar network health --output json
stellar keys generate --global alice
stellar keys fund alice --network local
stellar keys address alice

# 3) Build + deploy with Zarf's VK
rustup target add wasm32v1-none
stellar contract build
stellar contract deploy \
  --wasm target/wasm32v1-none/release/rs_soroban_ultrahonk.wasm \
  --source alice \
  -- \
  --vk_bytes-file-path tests/zarf/target/vk
```

## Invoke verify_proof

### Build ZK artifacts (vk/proof/public_inputs)

From the Zarf repo root, `poc/scripts/generateZarfProofForStellar.js` generated the checked-in `tests/zarf/target` fixture. The old `tests/build_circuits.sh` fixtures are bb v0.87 legacy examples and are ignored by default.

### Use the helper script

Expects a dataset folder with `public_inputs`, `proof` (the VK is already on-chain from deploy):

```bash
cd scripts/invoke_ultrahonk
npm install
npx ts-node invoke_ultrahonk.ts invoke \
  --dataset ../../tests/zarf/target \
  --contract-id <CONTRACT_ID> \
  --network local \
  --source-account alice \
  --send yes
```

### Direct CLI invoke

```bash
stellar contract invoke \
  --id <CONTRACT_ID> \
  --source alice \
  --network local \
  --send yes \
  --cost \
  -- \
  verify_proof \
  --public_inputs-file-path tests/zarf/target/public_inputs \
  --proof_bytes-file-path tests/zarf/target/proof
```

Testnet deploy/invoke:

```bash
stellar contract deploy \
  --wasm target/wasm32v1-none/release/rs_soroban_ultrahonk.wasm \
  --source alice \
  --network testnet \
  --cost \
  -- \
  --vk_bytes-file-path tests/zarf/target/vk

stellar contract invoke \
  --id <CONTRACT_ID> \
  --source alice \
  --network testnet \
  --send yes \
  --cost \
  -- \
  verify_proof \
  --public_inputs-file-path tests/zarf/target/public_inputs \
  --proof_bytes-file-path tests/zarf/target/proof
```

Latest testnet verification from this port:
- Contract: `CBNTE6NXJZRDAB5SIHYCRNBAN4FIZCBPGWDFMYHCNM22DUCX5MF67MFH`
- Deploy tx: `649d6fd5de8cb9b297676b48b829aca34843301c839e9a5fc7fb3c44eb2b71a5`
- Verify tx: `dceec4cb61851f3e29ccf626001ca16cca69a461c33e584cd2a0aae973f58a4a`

## VK policy (important)

This contract does not enforce access control:
- `__constructor` stores the VK once at deploy time (immutable after first set).
- `verify_proof` always uses the stored VK set at deploy.

## Tests

```bash
cargo build --target wasm32v1-none --release
cargo test -- --nocapture
cargo test --manifest-path ultrahonk-soroban-verifier/Cargo.toml -- --nocapture
```

## References

- Noir language: https://noir-lang.org/
- Barretenberg (bb): https://github.com/AztecProtocol/aztec-packages
- rs-soroban-ultrahonk: https://github.com/yugocabrio/rs-soroban-ultrahonk
- Soroban documentation: https://developers.stellar.org/docs/build/smart-contracts
- Soroban SDK (Rust): https://github.com/stellar/rs-soroban-sdk

## Audit status

This project has not been audited.

## License

MIT
