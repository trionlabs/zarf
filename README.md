# Zarf Protocol

**Confidential Token Distributions & Payroll**

[zarf.to](https://zarf.to)

> **Showcase Project** — This is a demonstration project by [Trion Labs](https://trionlabs.dev) showcasing our expertise in Zero-Knowledge systems and protocol design. For production implementations or collaborations, [contact us](mailto:contact@trionlabs.dev).

![Zarf Thumbnail](./design/thumbnail.png)

## Overview

Distribute tokens to emails with ZK proofs. No wallet exposure. No identity leaks.

Zarf Protocol is a privacy-first payment and token distribution protocol that enables users to send funds or create vestings to an email address instead of a wallet address. By utilizing zero-knowledge proofs, we decouple identity from on-chain addresses, allowing for secure, anonymous, and programmable payments.

## Features

### 🔒 Privacy Powered with ZK
Distribute tokens without exposing recipient identities on-chain. Zarf uses advanced zero-knowledge circuits (Noir) to verify email ownership without ever revealing the email address or the link to the claiming wallet.

### ⚡ E-mail First Claiming
No wallet needed to start. Recipients receive funds via an email link and can claim them using a standard Google login. This dramatically lowers the barrier to entry for non-crypto natives.

### ⏳ On-chain & Programmable
Configure cliff periods, linear release schedules, and complex vesting terms directly in smart contracts. Zarf is not just for one-time payments; it's a robust infrastructure for payroll, grants, and token streaming.

## Architecture


1. **Off-chain ZK Proof Generation**: Users generate proofs of email ownership locally in the browser or via a secure relayer.
2. **Smart Contracts (Stellar/Soroban)**:
    - **JWK Registry**: Manages trusted Google JWK key hashes for email proof validation.
    - **Vesting and Factory**: Holds funds, creates vesting contracts, and releases funds after valid claims.
    - **UltraHonk Verifier**: Stores the Noir verification key and validates ZK proofs on Soroban.
3. **Frontend**: A seamless Svelte-based interface for sending and claiming.
4. **JWK Rotation Service**: A scheduled Cloudflare Worker keeps Google OAuth
   public keys synchronized with the Soroban JWK Registry.

## Tech Stack

- **Zero-Knowledge**: [Noir](https://noir-lang.org/) (Project Aztec)
- **Contracts**: Stellar/Soroban smart contracts in Rust
- **Frontend**: [Svelte](https://svelte.dev/) + [Vite](https://vitejs.dev/)
- **Interaction**: [Stellar SDK](https://stellar.github.io/js-stellar-sdk/) / Freighter

## Development

### Prerequisites

- [Noir](https://noir-lang.org/) v1.0.0-beta.18
- Rust + `wasm32v1-none`
- [Stellar CLI](https://developers.stellar.org/docs/tools/cli/install-cli)
- Node.js 24+
- pnpm

### Quick Start

1. **Install Dependencies**
    ```bash
    pnpm install
    ```

2. **Build Circuits**
    ```bash
    cd circuits
    nargo build
    ```
    *Generates the Noir circuit artifact used by the Stellar proof generator.*

3. **Test Soroban Contracts**
    ```bash
    cargo test --manifest-path contracts/soroban/verifier/Cargo.toml
    cargo test --manifest-path contracts/soroban/zarf/jwk-registry/Cargo.toml
    cargo test --manifest-path contracts/soroban/zarf/vesting/Cargo.toml
    cargo test --manifest-path contracts/soroban/zarf/factory/Cargo.toml
    ```

4. **Run Development Server**
    ```bash
    cd web
    pnpm dev
    ```

5. **Run JWK Rotation Worker**
    ```bash
    cd web
    pnpm --filter @zarf/jwk-rotation typecheck
    pnpm dev:jwk-rotation
    ```

## Continuous Deployment

GitHub Actions deploys the web apps after `CI` succeeds on `main`.
The deploy workflow can also be started manually from Actions.

Required GitHub repository secrets:

- `CLOUDFLARE_API_TOKEN`
- `CLOUDFLARE_ACCOUNT_ID`
- `PINATA_JWT` for `@zarf/pin-proxy`
- `REGISTRY_OWNER_SECRET` for `@zarf/jwk-rotation`
- `ADMIN_TOKEN` for `@zarf/jwk-rotation`
- `ALERT_WEBHOOK_URL` optional for `@zarf/jwk-rotation`

Minimum GitHub repository variables for the Svelte apps:

- `VITE_STELLAR_TESTNET_RPC_URL`
- `VITE_STELLAR_TESTNET_FACTORY_ADDRESS`
- `VITE_STELLAR_MAINNET_RPC_URL`
- `VITE_STELLAR_MAINNET_FACTORY_ADDRESS`

Those four values are enough to show both networks in the UI toggle.
If only one network is configured, the UI only shows that network.

App-specific public variables:

- `VITE_PIN_PROXY_URL` for `@zarf/create`
- `VITE_GOOGLE_CLIENT_ID` for `@zarf/claim`

Optional selector variable:

- `VITE_STELLAR_DEFAULT_NETWORK`: `testnet` or `mainnet`

The older unprefixed `VITE_STELLAR_*` variables still work as a testnet
fallback for local development, but production should use the explicit
`TESTNET` and `MAINNET` profiles so the UI network toggle can show both.
Horizon, explorer, network passphrase, and network labels are built-in
constants for Stellar testnet/mainnet.

The workflow deploys:

- `@zarf/landing` -> `zarf-landing` / `https://zarf.to`
- `@zarf/create` -> `zarf-create` / `https://create.zarf.to`
- `@zarf/claim` -> `zarf-claim` / `https://claim.zarf.to`
- `@zarf/indexer` -> `zarf-indexer` / `https://indexer.zarf.to`
- `@zarf/docs` -> `zarf-docs` / `https://docs.zarf.to`
- `@zarf/pin-proxy` -> `zarf-pin-proxy`
- `@zarf/jwk-rotation` -> `zarf-jwk-rotation`

Worker runtime secrets are stored as GitHub secrets and synced to Cloudflare
during deployment with `wrangler secret bulk`. The JWK rotation worker is
stateless and reads the current registry state from the Soroban contract, so it
does not need a KV namespace.

## Team

Built by **Trion Labs**. We are a team of engineers and researchers specialized in Applied Cryptography, Zero-Knowledge Systems, and Protocol Design.

## Contact

- **Website**: [trionlabs.dev](https://trionlabs.dev)
- **Email**: contact@trionlabs.dev
- **X (Twitter)**: [@trionlabs](https://x.com/trionlabs)

## License

[MIT License](./LICENSE)
