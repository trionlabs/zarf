# Zarf Soroban Contracts

This is the first Soroban port of the Zarf application contracts. The UltraHonk
verifier lives in `../verifier`; these contracts call it instead of
reimplementing proof verification.

## Contracts

- `jwk-registry`: Soroban equivalent of `JWKRegistry.sol`.
  - Owner is an explicit `Address`.
  - Admin methods call `owner.require_auth()`.
  - Key status, kid lookup, and enumeration live in persistent storage.
  - Small bounded owner/count config lives in instance storage.
  - `register_key` accepts the original 18 RSA limbs; `register_key_hash`
    accepts a precomputed hash for deployment tooling.

- `vesting`: Soroban equivalent of the claim path in `ZarfVesting.sol`.
  - `claim(proof, public_inputs, recipient)` replaces `msg.sender` with an
    explicit `recipient: Address` and `recipient.require_auth()`.
  - `public_inputs` layout matches Zarf's current 23-field circuit:
    `[pubkey limbs x18, merkle_root, unlock_time, epoch_commitment, recipient, amount]`.
  - Recipient binding is `BN254_FR(keccak256(Address ScVal XDR))`. The prover
    must put that 32-byte field into public input index 21 for Stellar claims.
  - Claim/nullifier state uses persistent storage.
  - Token movement uses the standard Soroban token interface.

- `factory`: Soroban equivalent of `ZarfVestingFactory.sol`.
  - Stores the verifier address, JWK registry address, and vesting Wasm hash.
  - Uses `env.deployer().with_current_contract(salt).deploy_v2(...)` for
    deterministic vesting addresses.
  - Tracks global deployments, owner deployments, and metadata CIDs in
    persistent storage.
  - `create_and_fund_vesting` deploys vesting and transfers token funding from
    the owner to the new vesting contract via a factory allowance.
  - Exposes `recipient_id(recipient)` so a Stellar-bound proof can be generated
    before the vesting instance exists.

## Testnet E2E

Full Zarf claim succeeded on Stellar testnet on 2026-05-01 using:

- Native token SAC: `CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC`
- UltraHonk verifier: `CBNTE6NXJZRDAB5SIHYCRNBAN4FIZCBPGWDFMYHCNM22DUCX5MF67MFH`
- JWK registry: `CDGP44SLTRJFM7TZYU6FXB6QXSKZXHRBK5VND7JAGVNCWUMTP6U3TGVH`
- Vesting: `CALOYXIME3HF7CEAVV2SSHBCTAKIEAPVUHZRPRS3JTV6PNCKEQHE42IJ`

Direct-run key values:

- Recipient field: `0x2cb7bbc00eca803faccdaf07418c9fc730ce0943828691547b8d0cb13327964f`
- Merkle root: `0x0f7a17942b80c2315fe0a55c537e08897cea55df6e1f3d6523a4564b2abd6a64`
- JWK key hash: `0x439b29636f63b1e553390b3557e0fef4042f9a0f9ad2a8472cf5b8f8ca560e02`
- Epoch commitment: `0x2e01f191c4b5b8e44d3be83ac7c19c815758e66971251f85b742d9c6909cd703`

Transactions:

- Registry wasm upload: `3b5c25384f0a603a0ece87cd5be478f558145995926acdadb1feba72966a00ca`
- Registry deploy: `86801ce12ad2e9ac4a9f1f03991a43e1f1f4510ea7609f2f0a140fed52cb8e1e`
- Vesting wasm upload/help: `f1a1454a04a18cbd62b571b5a2daeaddcdda4c07b1220c603f526f235134af0a`
- Vesting deploy: `14904ba1d2e66a6eab0afb21181ff52754fe07b689e55680d342a74d033f15f5`
- Set Merkle root: `cf803777c8c9aa8ef6175929b9d02176a55052510f2ca46dbed105fedb460014`
- Register key hash: `0179808d9ec36d39244e98fc1e72944cec21168b8c704f09780a064a5948ed7b`
- Approve native token allowance: `8d7a1b4ae936e8f77f40069fda636a3220ac360d68bd4a22afcba5fc26212726`
- Deposit vesting funds: `4cd91a512fcea4fb5779edbeb1cb28594578c91e4fe225d0481bfeb1c6bc8684`
- Claim: `10c203ab2dbd8daeec1c5406ffa0b3a611d047d17485239cd6397995095cc15e`

Claim fee charged: `224,348` stroops. The `is_claimed` check for the epoch
commitment returns `true`.

## Factory E2E

Full factory path succeeded on Stellar testnet on 2026-05-01 using:

- Native token SAC: `CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC`
- UltraHonk verifier: `CBNTE6NXJZRDAB5SIHYCRNBAN4FIZCBPGWDFMYHCNM22DUCX5MF67MFH`
- JWK registry: `CCHROEUE37RFZJASWV43DGBYD4FU5G7H3AD6GKFJ2PEQAXMYGOAHMIDI`
- Factory: `CD45PRY7G6VRBOQDVCA7647EQWTBVF4NEWISVWOJGXSADCLIY2MT7KUM`
- Factory-created vesting: `CARR2PYVAU6CON4MDLUKC2JFFIHFIMFFQEMAUE5VRLGZHTG4XDY5OAQP`

Factory flow transactions:

- Registry deploy: `ea04dbb37e5ae9314098e091a0993cd8fa3078a6f7f8ede8a56b14ecad8eb2d6`
- Factory wasm upload: `3c8a0800bb74181ae41573982fd91b3dae1e0cb7f741981e32db9baf0d561e8d`
- Factory deploy: `2e14132ade2df85b5603ffcd7c53b9b5b0b0fad92e6ab1902d872927711b7c7c`
- Register key hash: `34b513fa6362b83191c8e027f7b65f4f4664ec7f3b5adde65e22d5561c0436fc`
- Approve factory funding: `b5ffd70a31d477712b30e37a96202e519d8a21c50865d7074d15d2a2d84ee8e8`
- Create and fund vesting: `a75b433b9d6a70d37950a36fc8b347befcbfbd0bbfbfe4815f687297765a0228`
- Claim: `025694c325ec25b176ea31e4e2ef9877c477f194d6f3000c1b4e82977bea832b`

Factory claim fee charged: `224,328` stroops. The `is_claimed` check returns
`true`.

Current generated fixture:

- `vesting/tests/fixtures/zarf-stellar-recipient/proof`
- `vesting/tests/fixtures/zarf-stellar-recipient/public_inputs`
- `vesting/tests/fixtures/zarf-stellar-recipient/vk`
- `vesting/tests/fixtures/zarf-stellar-recipient/metadata.json`

Current fixture values:

- Recipient field: `0x2cb7bbc00eca803faccdaf07418c9fc730ce0943828691547b8d0cb13327964f`
- Merkle root: `0x0f7a17942b80c2315fe0a55c537e08897cea55df6e1f3d6523a4564b2abd6a64`
- JWK key hash: `0x869e98741c04285227a8b53c31097afde9c90752f2c5b1f634bccd80601d24b3`
- Epoch commitment: `0x2e01f191c4b5b8e44d3be83ac7c19c815758e66971251f85b742d9c6909cd703`

## Verify

```sh
cargo test --manifest-path contracts/soroban/zarf/jwk-registry/Cargo.toml -- --nocapture
cargo test --manifest-path contracts/soroban/zarf/vesting/Cargo.toml -- --nocapture
cargo test --manifest-path contracts/soroban/zarf/factory/Cargo.toml -- --nocapture

cargo build --manifest-path contracts/soroban/zarf/jwk-registry/Cargo.toml --target wasm32v1-none --release
cargo build --manifest-path contracts/soroban/zarf/vesting/Cargo.toml --target wasm32v1-none --release
cargo build --manifest-path contracts/soroban/zarf/factory/Cargo.toml --target wasm32v1-none --release
```

Repeat the full testnet path:

```sh
contracts/soroban/zarf/scripts/run_testnet_e2e.sh
contracts/soroban/zarf/scripts/run_testnet_factory_e2e.sh
```

Official Soroban docs used for the port:

- https://developers.stellar.org/docs/learn/fundamentals/contract-development/authorization
- https://developers.stellar.org/docs/build/guides/storage/choosing-the-right-storage
- https://developers.stellar.org/docs/build/smart-contracts/example-contracts/tokens
