#!/usr/bin/env bash
# contracts/soroban/zarf/scripts/run_testnet_airdrop_factory_e2e.sh
#
# Airdrop M7 T5 — testnet end-to-end for the standalone wallet-address +
# keccak-Merkle airdrop: build instance + factory wasms, upload the instance
# wasm, deploy the factory, then exercise the full two-instance lock matrix:
#
#   INSTANCE A  locked=true,  future deadline, >=81 recipients
#       approve(owner -> FACTORY) -> create_airdrop -> config() read-back asserts
#       -> claim a leaf with proofLen>=2 AND index>=80 (so the read-back needs a
#          2nd claimed_statuses page, start>=80; bit 80 sits in word 0) -> is_claimed==true
#       -> double-claim  => Error(Contract,#1)  AlreadyClaimed     (negative)
#       -> withdraw      => Error(Contract,#4)  NotYetWithdrawable (negative)
#
#   INSTANCE B  locked=false, separate SALT, future deadline
#       approve -> create_airdrop -> withdraw_unclaimed => Withdrawn (positive;
#       no deadline wait — locked=false clears the withdraw gate immediately)
#
# Pattern/preamble distilled from run_testnet_e2e.sh + run_testnet_factory_e2e.sh
# (no shared lib exists upstream — the `last_nonempty_line` helper is copied
# verbatim; there is intentionally NO trap / color / leveled logging, matching
# the house style of plain `echo` phase banners).
#
# SECURITY / HYGIENE:
#   - The signing key is an operator-local `stellar keys` identity referenced by
#     NAME only ($SOURCE, default `alice`). No secret seed is ever embedded or
#     generated here. RPC URL + network passphrase come from the CLI's own
#     `stellar network` named config — nothing is hardcoded.
#   - approve(owner -> factory) STRICTLY precedes every create_airdrop (the
#     factory funds via transfer_from; without a prior allowance it traps).
#   - config() is read back and asserted (token==SAC, root==locally computed,
#     total, balance==total, deadline>now) before any claim is trusted.
#
# IDEMPOTENCY: AIRDROP_WASM_HASH / FACTORY_ID / AIRDROP_A_ID / AIRDROP_B_ID and
# the pinned SALT_A / SALT_B are all env-overridable; re-running with them set
# reuses the existing deployment. Pin SALT_A/SALT_B (or the instance ids) to get
# a deterministic, repeatable run — the defaults are fresh-random each invocation
# so an unpinned re-run deploys NEW instances.
set -euo pipefail

# --- 1. preamble: path anchoring (relative to this script's location) ---
ROOT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")/../../../.." && pwd)
SOROBAN_DIR="$ROOT_DIR/contracts/soroban"
ZARF_DIR="$SOROBAN_DIR/zarf"
AIRDROP_DIR="$ZARF_DIR/airdrop"
FACTORY_DIR="$ZARF_DIR/airdrop-factory"
WEB_DIR="$ROOT_DIR/web"

# --- 3 & 4. operator-local signer (NAME only) + network NAME only ---
SOURCE=${SOURCE:-alice}     # stellar keys identity; RPC+passphrase resolved by CLI from $NETWORK
NETWORK=${NETWORK:-testnet}

# --- 5. e2e knobs (env-overridable) ---
RECIPIENT_COUNT=${RECIPIENT_COUNT:-81} # >=81 so the claimant index can be >=80
CLAIM_INDEX=${CLAIM_INDEX:-80}         # index>=80 -> read-back uses a 2nd claimed_statuses page (start>=80)
AMOUNT_EACH=${AMOUNT_EACH:-1000}       # per-recipient i128 allocation (decimal string)
SEED=${SEED:-zarf-airdrop-factory-e2e} # deterministic filler-address seed (repeatable list)

# Pinned-SALT idempotency knobs (owner-bound deterministic deploy address).
# Default: fresh random per run -> NOT idempotent unless you pin these.
SALT_A=${SALT_A:-$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")}
SALT_B=${SALT_B:-$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")}
METADATA_CID=${METADATA_CID:-ipfs://zarf-airdrop-factory-e2e}

# --- wasm path + filename constants (lib names: zarf-airdrop-soroban ->
# zarf_airdrop_soroban; zarf-airdrop-factory-soroban -> zarf_airdrop_factory_soroban) ---
AIRDROP_WASM="$AIRDROP_DIR/target/wasm32v1-none/release/zarf_airdrop_soroban.wasm"
FACTORY_WASM="$FACTORY_DIR/target/wasm32v1-none/release/zarf_airdrop_factory_soroban.wasm"

# --- proof-gen tooling: reuses @zarf/core/lib/merkle via web's own tsx ---
TSX="$WEB_DIR/node_modules/.bin/tsx"
PROOF_GEN="$ZARF_DIR/scripts/lib/merkle-proof-gen.mjs"
# Scratch dir for the generated claim list + proof bundle (gitignored target tree).
OUT_DIR=${OUT_DIR:-$AIRDROP_DIR/target/e2e}

# --- reusable helper (copied verbatim; there is no shared lib to source) ---
last_nonempty_line() {
  awk 'NF { line = $0 } END { print line }'
}

# Run the merkle proof-gen through web's tsx with cwd=web (the only context in
# which the audited @zarf/core source + its @stellar/stellar-sdk dep resolve).
proof_gen() {
  ( cd "$WEB_DIR" && "$TSX" "$PROOF_GEN" "$@" )
}

# Assert that a captured value is a bare 64-char lowercase hex string (BytesN<32>).
assert_hex32() {
  local label="$1" val="$2"
  [[ "$val" =~ ^[0-9a-f]{64}$ ]] || { echo "FAIL: $label is not 64-hex: '$val'" >&2; exit 1; }
}

# Assert string equality (fail-fast with a labelled diff).
assert_eq() {
  local label="$1" got="$2" want="$3"
  [[ "$got" == "$want" ]] || {
    echo "FAIL: $label mismatch" >&2
    echo "  got:  $got" >&2
    echo "  want: $want" >&2
    exit 1
  }
}

# Run an invoke that is EXPECTED to trap, and assert it surfaced Error(Contract,#N).
# Errors go to stderr and the process exits non-zero, so capture 2>&1 and guard
# with `|| true` before grepping (else set -e aborts on the expected failure).
assert_contract_error() {
  local want_code="$1"; shift
  local label="$1"; shift
  local out
  out=$("$@" 2>&1) || true
  if grep -qE "Error\(Contract, #${want_code}\)" <<<"$out"; then
    echo "  OK: $label trapped Error(Contract, #${want_code}) as expected"
  else
    echo "FAIL: $label expected Error(Contract, #${want_code}); got:" >&2
    echo "$out" >&2
    exit 1
  fi
}

# ============================================================================
# 0. Preflight: fail fast on a missing toolchain BEFORE the long cargo build
#    (none of the upstream scripts do this; surfaces "stellar not on PATH" /
#    "run `pnpm install` in web" immediately instead of mid-deploy). cargo is
#    implied by the build step under `set -e`; we check the rest explicitly.
# ============================================================================
command -v stellar >/dev/null 2>&1 || { echo "FAIL: stellar CLI not on PATH (install stellar-cli, run 'stellar network add $NETWORK ...' + 'stellar keys ...')" >&2; exit 1; }
command -v node    >/dev/null 2>&1 || { echo "FAIL: node not on PATH (Node 22+ required for the proof-gen)" >&2; exit 1; }
command -v cargo   >/dev/null 2>&1 || { echo "FAIL: cargo not on PATH (Rust toolchain with the wasm32v1-none target required)" >&2; exit 1; }
[[ -x "$TSX" ]] || { echo "FAIL: web tsx binary missing: $TSX (run 'pnpm install' in $WEB_DIR)" >&2; exit 1; }
[[ -f "$PROOF_GEN" ]] || { echo "FAIL: proof-gen script missing: $PROOF_GEN" >&2; exit 1; }

# ============================================================================
# 2. BUILD wasms (instance THEN factory) + fail-fast existence/non-empty asserts
#    (the upstream scripts rely solely on `set -e` + cargo; the explicit `-s`
#    guard here is an added defense so a silent stale/empty artifact can't ship).
# ============================================================================
echo "Building airdrop instance + factory wasms (release, wasm32v1-none)..."
cargo build --manifest-path "$AIRDROP_DIR/Cargo.toml" --target wasm32v1-none --release
cargo build --manifest-path "$FACTORY_DIR/Cargo.toml" --target wasm32v1-none --release
[[ -s "$AIRDROP_WASM" ]] || { echo "missing or empty release wasm: $AIRDROP_WASM" >&2; exit 1; }
[[ -s "$FACTORY_WASM" ]] || { echo "missing or empty release wasm: $FACTORY_WASM" >&2; exit 1; }
echo "  instance: $AIRDROP_WASM ($(wc -c <"$AIRDROP_WASM" | tr -d ' ') bytes)"
echo "  factory:  $FACTORY_WASM ($(wc -c <"$FACTORY_WASM" | tr -d ' ') bytes)"

# Sanity: the proof-gen reproduces the committed Rust fixture byte-for-byte
# (guards against a @zarf/core / soroban-sdk XDR drift before we trust any root).
echo "Verifying merkle proof-gen parity vs committed fixture..."
proof_gen --self-test

# ============================================================================
# 4. Native XLM SAC id (read-only; resolved from the CLI's $NETWORK config)
# ============================================================================
TOKEN_ID=$(stellar contract id asset --asset native --network "$NETWORK")
echo "Native SAC token id: $TOKEN_ID"

# Resolve the operator identity NAME -> its G-address. The merkle leaf binds the
# claimant's resolved Address XDR, so the tree MUST be built over this G-address
# (not the alias literal). The claimant signs its own claim (claimant==source).
OWNER_ADDR=$(stellar keys public-key "$SOURCE")
assert_eq "owner address prefix" "${OWNER_ADDR:0:1}" "G"
echo "Owner / claimant ($SOURCE): $OWNER_ADDR"

# ============================================================================
# Build the >=81-recipient claim list: deterministic filler G-addresses with the
# REAL owner pinned at $CLAIM_INDEX so it can actually claim that leaf.
# ============================================================================
mkdir -p "$OUT_DIR"
CLAIMS_JSON="$OUT_DIR/claims.json"
# TOTAL = AMOUNT_EACH * RECIPIENT_COUNT, computed with BigInt so a large i128
# AMOUNT_EACH cannot silently wrap 64-bit bash arithmetic (which would send a
# wrong/negative --total + approve --amount while the per-leaf claim uses the
# un-wrapped value). The default 1000*81 is tiny; this just keeps the full i128
# range correct for any operator amount.
TOTAL=$(node -e 'process.stdout.write((BigInt(process.argv[1]) * BigInt(process.argv[2])).toString())' "$AMOUNT_EACH" "$RECIPIENT_COUNT")
[[ "$TOTAL" =~ ^[0-9]+$ ]] || { echo "FAIL: computed TOTAL is not a positive integer: '$TOTAL'" >&2; exit 1; }

echo "Generating $RECIPIENT_COUNT-recipient claim list (owner pinned at index $CLAIM_INDEX)..."
# --gen-list emits the FINAL list directly: deterministic filler G-strkeys at a
# uniform $AMOUNT_EACH (so config.total == AMOUNT_EACH * RECIPIENT_COUNT is exact)
# with the REAL owner slotted at --claimant-index so that leaf is actually
# claimable (claimant == source). Pinned by $SEED for repeatable re-runs.
proof_gen \
  --gen-list \
  --count "$RECIPIENT_COUNT" \
  --amount "$AMOUNT_EACH" \
  --seed "$SEED" \
  --claimant "$OWNER_ADDR" \
  --claimant-index "$CLAIM_INDEX" >"$CLAIMS_JSON"

# Compute the root over the FINAL list (the value create_airdrop is fed + asserts).
ROOT_BARE=$(proof_gen --claims "$CLAIMS_JSON" --root-only | node -e 'process.stdout.write(JSON.parse(require("fs").readFileSync(0)).rootBare)')
assert_hex32 "merkle_root" "$ROOT_BARE"
echo "Local merkle root: $ROOT_BARE"

# Proof bundle for the claimant leaf. The proof-gen self-verifies it reproduces
# the root; we additionally assert proofLen>=2 AND index>=80 (the M7 T5 contract).
PROOF_BUNDLE=$(proof_gen --claims "$CLAIMS_JSON" --index "$CLAIM_INDEX")
CLAIM_PROOF_JSON=$(node -e 'process.stdout.write(JSON.parse(require("fs").readFileSync(0)).proofBareJson)' <<<"$PROOF_BUNDLE")
CLAIM_PROOF_LEN=$(node -e 'process.stdout.write(String(JSON.parse(require("fs").readFileSync(0)).proofLen))' <<<"$PROOF_BUNDLE")
CLAIM_LEAF_ADDR=$(node -e 'process.stdout.write(JSON.parse(require("fs").readFileSync(0)).address)' <<<"$PROOF_BUNDLE")
assert_eq "claim leaf address == owner" "$CLAIM_LEAF_ADDR" "$OWNER_ADDR"
[[ "$CLAIM_PROOF_LEN" -ge 2 ]] || { echo "FAIL: proofLen ($CLAIM_PROOF_LEN) must be >=2 for index $CLAIM_INDEX" >&2; exit 1; }
[[ "$CLAIM_INDEX" -ge 80 ]]    || { echo "FAIL: CLAIM_INDEX ($CLAIM_INDEX) must be >=80" >&2; exit 1; }
echo "Claim proof for index $CLAIM_INDEX: proofLen=$CLAIM_PROOF_LEN proof=$CLAIM_PROOF_JSON"

# ============================================================================
# 6. Upload instance wasm -> AIRDROP_WASM_HASH (idempotent; re-upload is a no-op
#    on-chain and returns the same hash). Guarded so a pre-set env var short-circuits.
# ============================================================================
echo "Uploading airdrop instance wasm..."
AIRDROP_WASM_HASH=${AIRDROP_WASM_HASH:-$(
  stellar contract upload \
    --wasm "$AIRDROP_WASM" \
    --source "$SOURCE" \
    --network "$NETWORK" | last_nonempty_line
)}
assert_hex32 "AIRDROP_WASM_HASH" "$AIRDROP_WASM_HASH"
echo "Airdrop wasm hash: $AIRDROP_WASM_HASH"

# ============================================================================
# 3. Deploy the factory with the instance wasm hash (constructor arg). Guarded.
# ============================================================================
if [[ -z "${FACTORY_ID:-}" ]]; then
  echo "Deploying airdrop factory..."
  FACTORY_ID=$(
    stellar contract deploy \
      --wasm "$FACTORY_WASM" \
      --source "$SOURCE" \
      --network "$NETWORK" \
      -- \
      --airdrop_wasm_hash "$AIRDROP_WASM_HASH" | last_nonempty_line
  )
fi
echo "Factory id: $FACTORY_ID"

# Live ledger seq -> approval expiration window (a LEDGER NUMBER, NOT a timestamp).
LATEST_LEDGER=$(stellar ledger latest --network "$NETWORK" | awk '/Sequence:/ { print $2 }')
EXPIRATION_LEDGER=$((LATEST_LEDGER + 5000)) # ~7h at 5s/ledger
# Future deadline (unix seconds, u64; host clock tracks testnet ledger time).
DEADLINE=$(( $(date +%s) + 86400 )) # 1 day out -> claim never Expired; withdraw gate on `locked`
echo "Latest ledger: $LATEST_LEDGER  expiration_ledger: $EXPIRATION_LEDGER  deadline: $DEADLINE"

# ============================================================================
# INSTANCE A — locked=true, future deadline: supports claim, BLOCKS withdraw.
# ============================================================================
echo
echo "=== INSTANCE A (locked=true, future deadline) ==="

# approve STRICTLY before create_airdrop (factory funds via transfer_from).
echo "[A] approve(owner -> factory) for total=$TOTAL..."
stellar contract invoke \
  --id "$TOKEN_ID" --source "$SOURCE" --network "$NETWORK" \
  -- approve \
  --from "$SOURCE" \
  --spender "$FACTORY_ID" \
  --amount "$TOTAL" \
  --expiration_ledger "$EXPIRATION_LEDGER"

if [[ -z "${AIRDROP_A_ID:-}" ]]; then
  echo "[A] create_airdrop (locked=true)..."
  AIRDROP_A_ID=$(
    stellar contract invoke \
      --id "$FACTORY_ID" --source "$SOURCE" --network "$NETWORK" \
      -- create_airdrop \
      --owner "$SOURCE" \
      --token "$TOKEN_ID" \
      --merkle_root "$ROOT_BARE" \
      --total "$TOTAL" \
      --deadline "$DEADLINE" \
      --locked true \
      --recipient_count "$RECIPIENT_COUNT" \
      --salt "$SALT_A" \
      --metadata_cid "\"$METADATA_CID\"" | last_nonempty_line | tr -d '"'
  )
fi
echo "[A] instance id: $AIRDROP_A_ID"

# --- config() read-back asserts (token==SAC, root==local, total, balance==total, deadline>now) ---
echo "[A] config() read-back asserts..."
CONFIG_A=$(
  stellar contract invoke \
    --id "$AIRDROP_A_ID" --source "$SOURCE" --network "$NETWORK" --send no \
    -- config
)
# Config{admin,token,merkle_root,total,deadline,locked}; merkle_root is bare hex
# in the JSON. Parse with node for robust field extraction.
A_TOKEN=$(node -e 'const c=JSON.parse(require("fs").readFileSync(0));process.stdout.write(String(c.token))' <<<"$CONFIG_A")
A_ROOT=$(node -e 'const c=JSON.parse(require("fs").readFileSync(0));process.stdout.write(String(c.merkle_root))' <<<"$CONFIG_A")
A_TOTAL=$(node -e 'const c=JSON.parse(require("fs").readFileSync(0));process.stdout.write(String(c.total))' <<<"$CONFIG_A")
A_DEADLINE=$(node -e 'const c=JSON.parse(require("fs").readFileSync(0));process.stdout.write(String(c.deadline))' <<<"$CONFIG_A")
A_LOCKED=$(node -e 'const c=JSON.parse(require("fs").readFileSync(0));process.stdout.write(String(c.locked))' <<<"$CONFIG_A")
assert_eq "[A] config.token == native SAC" "$A_TOKEN" "$TOKEN_ID"
assert_eq "[A] config.merkle_root == local root" "${A_ROOT#0x}" "$ROOT_BARE"
assert_eq "[A] config.total" "$A_TOTAL" "$TOTAL"
assert_eq "[A] config.locked" "$A_LOCKED" "true"
[[ "$A_DEADLINE" -gt "$(date +%s)" ]] || { echo "FAIL: [A] config.deadline ($A_DEADLINE) not in the future" >&2; exit 1; }
# balance == total: the SAC balance of the instance after funding.
A_BALANCE=$(
  stellar contract invoke \
    --id "$TOKEN_ID" --source "$SOURCE" --network "$NETWORK" --send no \
    -- balance --id "$AIRDROP_A_ID" | tr -d '"'
)
assert_eq "[A] token balance == total" "$A_BALANCE" "$TOTAL"
echo "  OK: [A] token=$A_TOKEN root=${A_ROOT#0x} total=$A_TOTAL balance=$A_BALANCE deadline=$A_DEADLINE locked=$A_LOCKED"

# --- claim the claimant leaf (proofLen>=2, index>=80); claimant signs (==source) ---
# Pass the RESOLVED G-address (not the alias) as --claimant so the on-chain
# ScAddress is byte-identical to the leaf the tree was built over; --source is the
# same identity, so claimant.require_auth() is satisfied by the tx signer.
echo "[A] claim index $CLAIM_INDEX (amount $AMOUNT_EACH, proofLen $CLAIM_PROOF_LEN)..."
stellar contract invoke \
  --id "$AIRDROP_A_ID" --source "$SOURCE" --network "$NETWORK" --cost \
  -- claim \
  --index "$CLAIM_INDEX" \
  --claimant "$OWNER_ADDR" \
  --amount "$AMOUNT_EACH" \
  --proof "$CLAIM_PROOF_JSON"

# is_claimed == true
A_IS_CLAIMED=$(
  stellar contract invoke \
    --id "$AIRDROP_A_ID" --source "$SOURCE" --network "$NETWORK" --send no \
    -- is_claimed --index "$CLAIM_INDEX" | tr -d '"'
)
assert_eq "[A] is_claimed($CLAIM_INDEX)" "$A_IS_CLAIMED" "true"
echo "  OK: [A] is_claimed($CLAIM_INDEX) == true"

# claimed_statuses page past the first 80 (limit<=80) -> proves the 2nd page reads
# the just-set bit for index 80 (start=80 -> the window [80, 80+limit)).
echo "[A] claimed_statuses --start 80 --limit 1 (2nd-page read-back)..."
A_PAGE2=$(
  stellar contract invoke \
    --id "$AIRDROP_A_ID" --source "$SOURCE" --network "$NETWORK" --send no \
    -- claimed_statuses --start "$CLAIM_INDEX" --limit 1
)
node -e 'const a=JSON.parse(require("fs").readFileSync(0));if(a[0]!==true){console.error("FAIL: claimed_statuses[80] !=",JSON.stringify(a));process.exit(1)}' <<<"$A_PAGE2"
echo "  OK: [A] claimed_statuses[$CLAIM_INDEX] == true"

# --- negative: double-claim => AlreadyClaimed (#1) ---
echo "[A] double-claim must trap AlreadyClaimed (#1)..."
assert_contract_error 1 "[A] double-claim" \
  stellar contract invoke \
    --id "$AIRDROP_A_ID" --source "$SOURCE" --network "$NETWORK" \
    -- claim \
    --index "$CLAIM_INDEX" \
    --claimant "$OWNER_ADDR" \
    --amount "$AMOUNT_EACH" \
    --proof "$CLAIM_PROOF_JSON"

# --- negative: withdraw on a locked+future-deadline instance => NotYetWithdrawable (#4) ---
echo "[A] withdraw_unclaimed must trap NotYetWithdrawable (#4)..."
assert_contract_error 4 "[A] withdraw (locked, deadline future)" \
  stellar contract invoke \
    --id "$AIRDROP_A_ID" --source "$SOURCE" --network "$NETWORK" \
    -- withdraw_unclaimed --to "$SOURCE"

# ============================================================================
# INSTANCE B — locked=false, separate SALT: withdraw succeeds (no deadline wait).
# ============================================================================
echo
echo "=== INSTANCE B (locked=false, separate salt) ==="

echo "[B] approve(owner -> factory) for total=$TOTAL..."
stellar contract invoke \
  --id "$TOKEN_ID" --source "$SOURCE" --network "$NETWORK" \
  -- approve \
  --from "$SOURCE" \
  --spender "$FACTORY_ID" \
  --amount "$TOTAL" \
  --expiration_ledger "$EXPIRATION_LEDGER"

if [[ -z "${AIRDROP_B_ID:-}" ]]; then
  echo "[B] create_airdrop (locked=false)..."
  AIRDROP_B_ID=$(
    stellar contract invoke \
      --id "$FACTORY_ID" --source "$SOURCE" --network "$NETWORK" \
      -- create_airdrop \
      --owner "$SOURCE" \
      --token "$TOKEN_ID" \
      --merkle_root "$ROOT_BARE" \
      --total "$TOTAL" \
      --deadline "$DEADLINE" \
      --locked false \
      --recipient_count "$RECIPIENT_COUNT" \
      --salt "$SALT_B" \
      --metadata_cid "\"$METADATA_CID\"" | last_nonempty_line | tr -d '"'
  )
fi
echo "[B] instance id: $AIRDROP_B_ID"

# Confirm B is unlocked + funded before the withdraw (read-back).
CONFIG_B=$(
  stellar contract invoke \
    --id "$AIRDROP_B_ID" --source "$SOURCE" --network "$NETWORK" --send no \
    -- config
)
B_LOCKED=$(node -e 'process.stdout.write(String(JSON.parse(require("fs").readFileSync(0)).locked))' <<<"$CONFIG_B")
assert_eq "[B] config.locked" "$B_LOCKED" "false"
B_BALANCE=$(
  stellar contract invoke \
    --id "$TOKEN_ID" --source "$SOURCE" --network "$NETWORK" --send no \
    -- balance --id "$AIRDROP_B_ID" | tr -d '"'
)
assert_eq "[B] token balance == total" "$B_BALANCE" "$TOTAL"
echo "  OK: [B] locked=false balance=$B_BALANCE"

# --- positive: withdraw_unclaimed sweeps the full balance => Withdrawn ---
echo "[B] withdraw_unclaimed (locked=false) must SUCCEED..."
stellar contract invoke \
  --id "$AIRDROP_B_ID" --source "$SOURCE" --network "$NETWORK" --cost \
  -- withdraw_unclaimed --to "$SOURCE"
# Balance swept to zero confirms the Withdrawn path executed.
B_BALANCE_AFTER=$(
  stellar contract invoke \
    --id "$TOKEN_ID" --source "$SOURCE" --network "$NETWORK" --send no \
    -- balance --id "$AIRDROP_B_ID" | tr -d '"'
)
assert_eq "[B] balance after withdraw == 0" "$B_BALANCE_AFTER" "0"
echo "  OK: [B] withdraw_unclaimed swept balance to 0 (Withdrawn)"

# ============================================================================
# 7. Record every id/hash for the operator (stdout only; no file written).
# ============================================================================
echo
echo "================= AIRDROP FACTORY E2E SUMMARY ================="
echo "Token (native SAC): $TOKEN_ID"
echo "Airdrop wasm hash:  $AIRDROP_WASM_HASH"
echo "Factory:            $FACTORY_ID"
echo "Instance A (locked):   $AIRDROP_A_ID   salt=$SALT_A"
echo "Instance B (unlocked): $AIRDROP_B_ID   salt=$SALT_B"
echo "Owner / claimant:   $OWNER_ADDR ($SOURCE)"
echo "Recipients:         $RECIPIENT_COUNT   claim index: $CLAIM_INDEX (proofLen $CLAIM_PROOF_LEN)"
echo "Merkle root:        $ROOT_BARE"
echo "Per-recipient:      $AMOUNT_EACH   total per instance: $TOTAL"
echo "=============================================================="
echo "PASS: airdrop factory e2e (A claim+blocked-withdraw, B withdraw) complete."
