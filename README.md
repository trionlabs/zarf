# Zarf

## Prerequisites

- [Noir](https://noir-lang.org/) v1.0.0-beta.17
- Node.js 18+
- pnpm

```bash
# Install Noir
noirup -v 1.0.0-beta.17
```

## Stack & Versions

- **Frontend**: [Svelte](https://svelte.dev/) v5.46.0
- **Build Tool**: [Vite](https://vitejs.dev/) v7.3.0
- **Trie Integration**: [Viem](https://viem.sh/) v2.43.3
- **ZK**: [Noir](https://noir-lang.org/) v1.0.0-beta.17

## Project Structure

```
zarf/
├── circuits/          # Noir ZK circuits
│   ├── src/main.nr    # JWT email verification circuit
│   └── Nargo.toml     # Circuit dependencies (noir-jwt)
└── poc/               # Browser-based ZK proof generation (reference implementation)
    ├── src/
    │   ├── lib/       # Google OAuth + ZK prover
    │   └── App.svelte # UI
    └── public/        # WASM + compiled circuit (auto-copied)
```

## Quick Start

### 1. Build the circuit

```bash
cd circuits
nargo build
```

### 2. Run the POC

```bash
cd poc
pnpm install
pnpm dev
```

### 3. Configure Google OAuth

1. Go to [Google Cloud Console](https://console.cloud.google.com/apis/credentials)
2. Create OAuth 2.0 Client ID (Web application)
3. Add `http://localhost:5173` to authorized JavaScript origins
4. Add `http://localhost:5173/` to authorized redirect URIs
5. Copy Client ID to `.env` in root:

```bash
cp .env.example .env
# Edit .env with your Client ID
```
