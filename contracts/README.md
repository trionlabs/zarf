# Contracts

Zarf's on-chain implementation is Stellar/Soroban only.

- `soroban/verifier`: UltraHonk verifier contract and verifier library.
- `soroban/zarf/jwk-registry`: Trusted JWK key registry.
- `soroban/zarf/vesting`: Claim and vesting contract.
- `soroban/zarf/factory`: Deterministic vesting factory.

Common commands:

```sh
cargo test --manifest-path contracts/soroban/verifier/Cargo.toml
cargo test --manifest-path contracts/soroban/zarf/jwk-registry/Cargo.toml
cargo test --manifest-path contracts/soroban/zarf/vesting/Cargo.toml
cargo test --manifest-path contracts/soroban/zarf/factory/Cargo.toml
```

Build release Wasm:

```sh
cargo build --manifest-path contracts/soroban/verifier/Cargo.toml --target wasm32v1-none --release
cargo build --manifest-path contracts/soroban/zarf/jwk-registry/Cargo.toml --target wasm32v1-none --release
cargo build --manifest-path contracts/soroban/zarf/vesting/Cargo.toml --target wasm32v1-none --release
cargo build --manifest-path contracts/soroban/zarf/factory/Cargo.toml --target wasm32v1-none --release
```
