#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")/../../../.." && pwd)
SOROBAN_DIR="$ROOT_DIR/contracts/soroban"
VERIFIER_DIR="$SOROBAN_DIR/verifier"
ZARF_DIR="$SOROBAN_DIR/zarf"

SOURCE=${SOURCE:-alice}
NETWORK=${NETWORK:-testnet}
OUT_DIR=${OUT_DIR:-$ZARF_DIR/vesting/tests/fixtures/zarf-stellar-recipient}
AMOUNT=${AMOUNT:-1000}
RECIPIENT_COUNT=${RECIPIENT_COUNT:-1}
UNLOCK_TIME=${UNLOCK_TIME:-0}
SECRET=${SECRET:-0x586b396d5032714c}
METADATA_CID=${METADATA_CID:-ipfs://zarf-stellar-factory-e2e}
SALT=${SALT:-$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")}

VERIFIER_WASM="$VERIFIER_DIR/target/wasm32v1-none/release/rs_soroban_ultrahonk.wasm"
REGISTRY_WASM="$ZARF_DIR/jwk-registry/target/wasm32v1-none/release/zarf_jwk_registry.wasm"
VESTING_WASM="$ZARF_DIR/vesting/target/wasm32v1-none/release/zarf_vesting_soroban.wasm"
FACTORY_WASM="$ZARF_DIR/factory/target/wasm32v1-none/release/zarf_vesting_factory_soroban.wasm"
PROOF_SCRIPT="$ROOT_DIR/poc/scripts/generateZarfProofForStellar.js"
VK_PATH=${VK_PATH:-$VERIFIER_DIR/tests/zarf/target/vk}

last_nonempty_line() {
  awk 'NF { line = $0 } END { print line }'
}

json_field() {
  node -e "const m=require('fs').readFileSync(process.argv[1], 'utf8'); console.log(JSON.parse(m)[process.argv[2]])" "$OUT_DIR/metadata.json" "$1"
}

echo "Building Soroban contracts..."
cargo build --manifest-path "$VERIFIER_DIR/Cargo.toml" --target wasm32v1-none --release
cargo build --manifest-path "$ZARF_DIR/jwk-registry/Cargo.toml" --target wasm32v1-none --release
cargo build --manifest-path "$ZARF_DIR/vesting/Cargo.toml" --target wasm32v1-none --release
cargo build --manifest-path "$ZARF_DIR/factory/Cargo.toml" --target wasm32v1-none --release

TOKEN_ID=$(stellar contract id asset --asset native --network "$NETWORK")

if [[ -z "${VERIFIER_ID:-}" ]]; then
  echo "Deploying UltraHonk verifier..."
  VERIFIER_ID=$(
    stellar contract deploy \
      --wasm "$VERIFIER_WASM" \
      --source "$SOURCE" \
      --network "$NETWORK" \
      -- \
      --vk_bytes-file-path "$VK_PATH" | last_nonempty_line
  )
fi

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

echo "Uploading vesting Wasm..."
VESTING_WASM_HASH=$(
  stellar contract upload \
    --wasm "$VESTING_WASM" \
    --source "$SOURCE" \
    --network "$NETWORK" | last_nonempty_line
)

echo "Deploying vesting factory..."
FACTORY_ID=$(
  stellar contract deploy \
    --wasm "$FACTORY_WASM" \
    --source "$SOURCE" \
    --network "$NETWORK" \
    -- \
    --verifier "$VERIFIER_ID" \
    --jwk_registry "$REGISTRY_ID" \
    --vesting_wasm_hash "$VESTING_WASM_HASH" | last_nonempty_line
)

echo "Computing Soroban recipient field..."
RECIPIENT_FIELD=$(
  stellar contract invoke \
    --id "$FACTORY_ID" \
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

echo "Approving factory funding..."
stellar contract invoke \
  --id "$TOKEN_ID" \
  --source "$SOURCE" \
  --network "$NETWORK" \
  -- approve \
  --from "$SOURCE" \
  --spender "$FACTORY_ID" \
  --amount "$AMOUNT" \
  --expiration_ledger "$EXPIRATION_LEDGER"

echo "Creating and funding vesting through factory..."
VESTING_ID=$(
  stellar contract invoke \
    --id "$FACTORY_ID" \
    --source "$SOURCE" \
    --network "$NETWORK" \
    -- create_and_fund_vesting \
    --owner "$SOURCE" \
    --token "$TOKEN_ID" \
    --salt "$SALT" \
    --name '"Zarf"' \
    --description '"Zarf Stellar factory e2e"' \
    --merkle_root "$ROOT_BYTES" \
    --recipient_count "$RECIPIENT_COUNT" \
    --total_amount "$AMOUNT" \
    --metadata_cid "\"$METADATA_CID\"" | last_nonempty_line | tr -d '"'
)

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

echo "Verifier: $VERIFIER_ID"
echo "Registry: $REGISTRY_ID"
echo "Factory:  $FACTORY_ID"
echo "Vesting:  $VESTING_ID"
echo "Token:    $TOKEN_ID"
