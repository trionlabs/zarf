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
AUDIENCE=${AUDIENCE:-test-client-id}

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

audience_hash() {
  (cd "$ROOT_DIR/poc" && node --input-type=module -e "import { Barretenberg, Fr } from '@aztec/bb.js'; const bb = await Barretenberg.new(); const bytes = new TextEncoder().encode(process.argv[1]); const padded = new Uint8Array(128); padded.set(bytes.slice(0, 128)); const hash = await bb.pedersenHash(Array.from(padded).map((b) => new Fr(BigInt(b))), 0); console.log(BigInt(hash.toString()).toString(16).padStart(64, '0'));" "$AUDIENCE")
}

echo "Building Soroban contracts..."
cargo build --manifest-path "$ZARF_DIR/jwk-registry/Cargo.toml" --target wasm32v1-none --release
cargo build --manifest-path "$ZARF_DIR/vesting/Cargo.toml" --target wasm32v1-none --release

TOKEN_ID=$(stellar contract id asset --asset native --network "$NETWORK")
AUDIENCE_HASH=${AUDIENCE_HASH:-$(audience_hash)}

# The constructor now requires activation_delay_secs in
# [MIN_ACTIVATION_DELAY_SECS(6h)=21600 .. MAX(7d)]; a zero/omitted delay traps
# (Error::InvalidActivationDelay) so the operator timelock can never ship
# disabled. Pass it explicitly (mirrors run_testnet_factory_e2e.sh).
ACTIVATION_DELAY_SECS=${ACTIVATION_DELAY_SECS:-21600}
if [[ -z "${REGISTRY_ID:-}" ]]; then
  echo "Deploying JWK registry (activation_delay_secs=$ACTIVATION_DELAY_SECS)..."
  REGISTRY_ID=$(
    stellar contract deploy \
      --wasm "$REGISTRY_WASM" \
      --source "$SOURCE" \
      --network "$NETWORK" \
      -- \
      --owner "$SOURCE" \
      --activation_delay_secs "$ACTIVATION_DELAY_SECS" | last_nonempty_line
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
      --merkle_root "$ZERO_ROOT" \
      --audience_hash "$AUDIENCE_HASH" \
      --metadata_cid '"ipfs://zarf-testnet-e2e"' | last_nonempty_line
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
  --audience "$AUDIENCE" \
  --secret "$SECRET"

ROOT=$(json_field merkle_root)
EPOCH=$(json_field epoch_commitment)
ROOT_BYTES=${ROOT#0x}
EPOCH_BYTES=${EPOCH#0x}
PUBKEY_LIMBS=$(
  node -e "const fs=require('fs'); const b=fs.readFileSync(process.argv[1]); const limbs=[]; for (let i=0;i<18;i++) limbs.push(b.subarray(i*32,(i+1)*32).toString('hex')); console.log(JSON.stringify(limbs));" \
    "$OUT_DIR/public_inputs"
)

echo "Setting Merkle root..."
stellar contract invoke \
  --id "$VESTING_ID" \
  --source "$SOURCE" \
  --network "$NETWORK" \
  -- set_merkle_root \
  --merkle_root "$ROOT_BYTES"

echo "Registering proof JWK public key..."
stellar contract invoke \
  --id "$REGISTRY_ID" \
  --source "$SOURCE" \
  --network "$NETWORK" \
  -- register_key \
  --kid '"test-key-id"' \
  --pubkey_limbs "$PUBKEY_LIMBS"

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
