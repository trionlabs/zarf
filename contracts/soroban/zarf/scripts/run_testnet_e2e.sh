#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")/../../../.." && pwd)
SOROBAN_DIR="$ROOT_DIR/contracts/soroban"
ZARF_DIR="$SOROBAN_DIR/zarf"

SOURCE=${SOURCE:-alice}
NETWORK=${NETWORK:-testnet}
VERIFIER_ID=${VERIFIER_ID:-CBNTE6NXJZRDAB5SIHYCRNBAN4FIZCBPGWDFMYHCNM22DUCX5MF67MFH}
OUT_DIR=${OUT_DIR:-$ZARF_DIR/vesting/tests/fixtures/zarf-stellar-recipient}
AMOUNT=${AMOUNT:-1000}
UNLOCK_TIME=${UNLOCK_TIME:-0}
SECRET=${SECRET:-0x586b396d5032714c}

REGISTRY_WASM="$ZARF_DIR/jwk-registry/target/wasm32v1-none/release/zarf_jwk_registry.wasm"
VESTING_WASM="$ZARF_DIR/vesting/target/wasm32v1-none/release/zarf_vesting_soroban.wasm"
PROOF_SCRIPT="$ROOT_DIR/poc/scripts/generateZarfProofForStellar.js"
ZERO_ROOT=0000000000000000000000000000000000000000000000000000000000000000

last_nonempty_line() {
  awk 'NF { line = $0 } END { print line }'
}

json_field() {
  node -e "const m=require('fs').readFileSync(process.argv[1], 'utf8'); console.log(JSON.parse(m)[process.argv[2]])" "$OUT_DIR/metadata.json" "$1"
}

echo "Building Soroban contracts..."
cargo build --manifest-path "$ZARF_DIR/jwk-registry/Cargo.toml" --target wasm32v1-none --release
cargo build --manifest-path "$ZARF_DIR/vesting/Cargo.toml" --target wasm32v1-none --release

TOKEN_ID=$(stellar contract id asset --asset native --network "$NETWORK")

if [[ -z "${REGISTRY_ID:-}" ]]; then
  echo "Deploying JWK registry..."
  REGISTRY_ID=$(
    stellar contract deploy \
      --wasm "$REGISTRY_WASM" \
      --source "$SOURCE" \
      --network "$NETWORK" \
      -- \
      --owner "$SOURCE" | last_nonempty_line
  )
fi

if [[ -z "${VESTING_ID:-}" ]]; then
  echo "Deploying vesting..."
  VESTING_ID=$(
    stellar contract deploy \
      --wasm "$VESTING_WASM" \
      --source "$SOURCE" \
      --network "$NETWORK" \
      -- \
      --owner "$SOURCE" \
      --token "$TOKEN_ID" \
      --verifier "$VERIFIER_ID" \
      --jwk_registry "$REGISTRY_ID" \
      --name '"Zarf"' \
      --description '"Zarf Stellar claim e2e"' \
      --merkle_root "$ZERO_ROOT" | last_nonempty_line
  )
fi

echo "Computing Soroban recipient field..."
RECIPIENT_FIELD=$(
  stellar contract invoke \
    --id "$VESTING_ID" \
    --source "$SOURCE" \
    --network "$NETWORK" \
    --send no \
    -- recipient_id \
    --recipient "$SOURCE" | tr -d '"'
)

echo "Generating Zarf proof for recipient 0x$RECIPIENT_FIELD..."
node "$PROOF_SCRIPT" \
  --recipient "0x$RECIPIENT_FIELD" \
  --out-dir "$OUT_DIR" \
  --amount "$AMOUNT" \
  --unlock-time "$UNLOCK_TIME" \
  --secret "$SECRET"

ROOT=$(json_field merkle_root)
KEY_HASH=$(json_field key_hash)
EPOCH=$(json_field epoch_commitment)
ROOT_BYTES=${ROOT#0x}
KEY_HASH_BYTES=${KEY_HASH#0x}
EPOCH_BYTES=${EPOCH#0x}

echo "Setting Merkle root..."
stellar contract invoke \
  --id "$VESTING_ID" \
  --source "$SOURCE" \
  --network "$NETWORK" \
  -- set_merkle_root \
  --merkle_root "$ROOT_BYTES"

echo "Registering proof JWK key hash..."
stellar contract invoke \
  --id "$REGISTRY_ID" \
  --source "$SOURCE" \
  --network "$NETWORK" \
  -- register_key_hash \
  --kid '"test-key-id"' \
  --key_hash "$KEY_HASH_BYTES"

LATEST_LEDGER=$(stellar ledger latest --network "$NETWORK" | awk '/Sequence:/ { print $2 }')
EXPIRATION_LEDGER=$((LATEST_LEDGER + 5000))

echo "Approving and depositing native token funding..."
stellar contract invoke \
  --id "$TOKEN_ID" \
  --source "$SOURCE" \
  --network "$NETWORK" \
  -- approve \
  --from "$SOURCE" \
  --spender "$VESTING_ID" \
  --amount "$AMOUNT" \
  --expiration_ledger "$EXPIRATION_LEDGER"

stellar contract invoke \
  --id "$VESTING_ID" \
  --source "$SOURCE" \
  --network "$NETWORK" \
  -- deposit \
  --amount "$AMOUNT"

echo "Claiming..."
stellar contract invoke \
  --id "$VESTING_ID" \
  --source "$SOURCE" \
  --network "$NETWORK" \
  --cost \
  -- claim \
  --proof-file-path "$OUT_DIR/proof" \
  --public_inputs-file-path "$OUT_DIR/public_inputs" \
  --recipient "$SOURCE"

echo "Checking claimed state..."
stellar contract invoke \
  --id "$VESTING_ID" \
  --source "$SOURCE" \
  --network "$NETWORK" \
  --send no \
  -- is_claimed \
  --epoch_commitment "$EPOCH_BYTES"

echo "Registry: $REGISTRY_ID"
echo "Vesting:  $VESTING_ID"
echo "Verifier: $VERIFIER_ID"
echo "Token:    $TOKEN_ID"
