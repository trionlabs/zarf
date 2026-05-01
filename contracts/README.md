# Contracts

Zarf keeps chain-specific contract projects side by side:

- `solidity`: EVM contracts, Foundry scripts, tests, and Forge dependencies.
- `soroban`: Stellar/Soroban verifier and Zarf app contracts.

Common commands:

```sh
forge test --root contracts/solidity
cargo test --manifest-path contracts/soroban/zarf/vesting/Cargo.toml
```
