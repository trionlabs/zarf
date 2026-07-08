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
AUDIENCE=${AUDIENCE:-test-client-id}
METADATA_CID=${METADATA_CID:-ipfs://zarf-stellar-factory-e2e}
UPGRADE_ADMIN=${UPGRADE_ADMIN:-$SOURCE}
SALT=${SALT:-$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")}

VERIFIER_WASM="$VERIFIER_DIR/target/wasm32v1-none/release/rs_soroban_ultrahonk.wasm"
REGISTRY_WASM="$ZARF_DIR/jwk-registry/target/wasm32v1-none/release/zarf_jwk_registry.wasm"
VESTING_WASM="$ZARF_DIR/vesting/target/wasm32v1-none/release/zarf_vesting_soroban.wasm"
FACTORY_WASM="$ZARF_DIR/factory/target/wasm32v1-none/release/zarf_vesting_factory_soroban.wasm"
PROOF_SCRIPT="$ROOT_DIR/poc/scripts/generateZarfProofForStellar.js"
VK_PATH=${VK_PATH:-$VERIFIER_DIR/tests/zarf/target/vk}
VK_HASH_PATH=${VK_HASH_PATH:-$VERIFIER_DIR/tests/zarf/target/vk_hash}

last_nonempty_line() {
  awk 'NF { line = $0 } END { print line }'
}

read_vk_hash() {
  local path="$1"
  if [[ -f "$path" ]]; then
    xxd -p -c 256 "$path"
  elif [[ -f "$path.hex" ]]; then
    tr -d '\n' <"$path.hex" | sed 's/^0x//'
  elif [[ -f "$(dirname "$path")/../vk_hash.hex" ]]; then
    tr -d '\n' <"$(dirname "$path")/../vk_hash.hex" | sed 's/^0x//'
  else
    echo "Missing VK hash at $path or matching .hex sidecar" >&2
    return 1
  fi
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
  VK_HASH=$(read_vk_hash "$VK_HASH_PATH")
  VERIFIER_ID=$(
    stellar contract deploy \
      --wasm "$VERIFIER_WASM" \
      --source "$SOURCE" \
      --network "$NETWORK" \
      -- \
      --vk_bytes-file-path "$VK_PATH" \
      --vk_hash "$VK_HASH" | last_nonempty_line
  )
fi

# --- F-4 GATE: verify a KNOWN-GOOD fixture proof against the freshly deployed
# verifier BEFORE the factory is constructed (the factory constructor embeds
# the verifier address, so that is the real wiring point). `vk_hash` is bb's
# internal VK hash, not keccak(vk_bytes), so the verifier constructor cannot
# self-check the (vk_bytes, vk_hash) pair: a consistent-but-wrong-circuit VK
# would deploy clean and silently verify a DIFFERENT circuit. This step is the
# enforcement of that check (see verifier/src/lib.rs) — DO NOT remove it.
# It runs before the proof is regenerated below, so it uses the committed,
# known-good fixture in OUT_DIR.
GATE_PI="$OUT_DIR/public_inputs"
GATE_PROOF="$OUT_DIR/proof"
if [[ ! -s "$GATE_PI" || ! -s "$GATE_PROOF" ]]; then
  echo "FATAL: known-good fixture ($GATE_PROOF / $GATE_PI) missing; cannot gate the verifier." >&2
  exit 1
fi
echo "Gate: verifying known-good fixture proof against verifier $VERIFIER_ID ..."
if ! stellar contract invoke \
  --id "$VERIFIER_ID" \
  --source "$SOURCE" \
  --network "$NETWORK" \
  --send no \
  -- verify_proof \
  --public_inputs-file-path "$GATE_PI" \
  --proof_bytes-file-path "$GATE_PROOF"; then
  echo "FATAL: verifier $VERIFIER_ID rejected the known-good fixture proof." >&2
  echo "The deployed (vk_bytes, vk_hash) pair does NOT match the shipped circuit. Aborting before wiring the factory." >&2
  exit 1
fi
echo "Gate passed: verifier accepts the known-good fixture proof."

# Activation-delay floor: must be >= the contract's MIN_ACTIVATION_DELAY_SECS
# (6h = 21600s) or the constructor traps. A zero/omitted delay (the old default)
# silently disabled the operator timelock and is now rejected. In a real deploy
# also `set_operator` to the HOT rotation-worker key and keep `owner` on a cold
# multisig (see docs/runbooks/circuit-redeploy-cutover.md).
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
    --vesting_wasm_hash "$VESTING_WASM_HASH" \
    --upgrade_admin "$UPGRADE_ADMIN" | last_nonempty_line
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
  --audience "$AUDIENCE" \
  --secret "$SECRET"

ROOT=$(json_field merkle_root)
AUDIENCE_HASH=$(json_field audience_hash)
EPOCH=$(json_field epoch_commitment)
ROOT_BYTES=${ROOT#0x}
AUDIENCE_HASH_BYTES=${AUDIENCE_HASH#0x}
EPOCH_BYTES=${EPOCH#0x}
PUBKEY_LIMBS=$(
  node -e "const fs=require('fs'); const b=fs.readFileSync(process.argv[1]); const limbs=[]; for (let i=0;i<18;i++) limbs.push(b.subarray(i*32,(i+1)*32).toString('hex')); console.log(JSON.stringify(limbs));" \
    "$OUT_DIR/public_inputs"
)

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
    --audience_hash "$AUDIENCE_HASH_BYTES" \
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
