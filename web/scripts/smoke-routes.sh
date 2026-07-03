#!/bin/bash
# Boots `vite dev` for each app in parallel, waits for the server to be
# listening, then curls a small route manifest. Exits non-zero on any
# non-200. Catches SSR module-evaluation regressions that pure
# typecheck + build don't see (e.g. a util importing stellar-sdk at
# top level that crashes Vite's SSR module runner).
#
# Usage: web/scripts/smoke-routes.sh
# Required cwd: web/ root.
set -u

LANDING_PORT=4173
CREATE_PORT=4174
CLAIM_PORT=4175
AIRDROP_CREATE_PORT=4176
AIRDROP_CLAIM_PORT=4177

LANDING_ROUTES=("/" "/thumbnail")
CREATE_ROUTES=("/" "/wizard/step-0" "/wizard/step-1" "/wizard/step-2" "/wizard/done" "/distributions")
CLAIM_ROUTES=("/")
AIRDROP_CREATE_ROUTES=("/" "/distributions")
# claim page renders its no-link state at 200 without ?a= (the link context).
AIRDROP_CLAIM_ROUTES=("/")

ROUTE_TIMEOUT=45 # seconds — first hit on a route triggers Vite lazy compile

# Launch dev servers in the main script scope. Command-substitution
# subshells get reaped when they exit, which sends SIGHUP to backgrounded
# children — a pattern that silently kills the vite process before the
# poll loop runs. Stay in the parent shell and keep PIDs in variables.
: > /tmp/smoke-landing.log
: > /tmp/smoke-create.log
: > /tmp/smoke-claim.log
: > /tmp/smoke-airdrop-create.log
: > /tmp/smoke-airdrop-claim.log

pnpm --filter "@zarf/landing" dev --port "$LANDING_PORT" > /tmp/smoke-landing.log 2>&1 < /dev/null &
LANDING_PID=$!
pnpm --filter "@zarf/create"  dev --port "$CREATE_PORT"  > /tmp/smoke-create.log  2>&1 < /dev/null &
CREATE_PID=$!
pnpm --filter "@zarf/claim"   dev --port "$CLAIM_PORT"   > /tmp/smoke-claim.log   2>&1 < /dev/null &
CLAIM_PID=$!
pnpm --filter "@zarf/airdrop-create" dev --port "$AIRDROP_CREATE_PORT" > /tmp/smoke-airdrop-create.log 2>&1 < /dev/null &
AIRDROP_CREATE_PID=$!
pnpm --filter "@zarf/airdrop-claim"  dev --port "$AIRDROP_CLAIM_PORT"  > /tmp/smoke-airdrop-claim.log  2>&1 < /dev/null &
AIRDROP_CLAIM_PID=$!

cleanup() {
    # SIGTERM the pnpm wrappers + the vite children. `wait` is not used
    # because vite dev never exits on its own and a bare wait blocks
    # forever after a successful smoke run.
    pkill -P "$LANDING_PID" 2>/dev/null || true
    pkill -P "$CREATE_PID" 2>/dev/null || true
    pkill -P "$CLAIM_PID" 2>/dev/null || true
    pkill -P "$AIRDROP_CREATE_PID" 2>/dev/null || true
    pkill -P "$AIRDROP_CLAIM_PID" 2>/dev/null || true
    kill "$LANDING_PID" "$CREATE_PID" "$CLAIM_PID" "$AIRDROP_CREATE_PID" "$AIRDROP_CLAIM_PID" 2>/dev/null || true
}
trap cleanup EXIT

wait_listening() {
    local app=$1
    local port=$2
    for i in $(seq 1 60); do
        local code
        code=$(curl -s -o /dev/null -w "%{http_code}" --max-time 3 "http://localhost:$port/" 2>/dev/null)
        if [ -n "$code" ] && [ "$code" != "000" ]; then
            echo "[smoke] $app listening on :$port (first response: $code)"
            return 0
        fi
        sleep 1
    done
    echo "[smoke] $app failed to start on :$port"
    return 1
}

check_routes() {
    local app=$1
    local port=$2
    shift 2
    local routes=("$@")
    local failed=0
    for route in "${routes[@]}"; do
        local code
        code=$(curl -s -o /dev/null -w "%{http_code}" --max-time "$ROUTE_TIMEOUT" "http://localhost:$port$route" 2>/dev/null)
        if [ "$code" != "200" ]; then
            echo "[smoke] FAIL ${code:-no-response} $app$route"
            failed=1
        else
            echo "[smoke]   ok 200 $app$route"
        fi
    done
    return $failed
}

FAILED=0
wait_listening landing $LANDING_PORT || FAILED=1
wait_listening create $CREATE_PORT || FAILED=1
wait_listening claim $CLAIM_PORT || FAILED=1
wait_listening airdrop-create $AIRDROP_CREATE_PORT || FAILED=1
wait_listening airdrop-claim $AIRDROP_CLAIM_PORT || FAILED=1

if [ "$FAILED" = "0" ]; then
    check_routes landing $LANDING_PORT "${LANDING_ROUTES[@]}" || FAILED=1
    check_routes create $CREATE_PORT "${CREATE_ROUTES[@]}" || FAILED=1
    check_routes claim $CLAIM_PORT "${CLAIM_ROUTES[@]}" || FAILED=1
    check_routes airdrop-create $AIRDROP_CREATE_PORT "${AIRDROP_CREATE_ROUTES[@]}" || FAILED=1
    check_routes airdrop-claim $AIRDROP_CLAIM_PORT "${AIRDROP_CLAIM_ROUTES[@]}" || FAILED=1
fi

if [ "$FAILED" != "0" ]; then
    echo
    echo "=== landing dev log (tail) ==="
    tail -40 /tmp/smoke-landing.log
    echo
    echo "=== create dev log (tail) ==="
    tail -40 /tmp/smoke-create.log
    echo
    echo "=== claim dev log (tail) ==="
    tail -40 /tmp/smoke-claim.log
    echo
    echo "=== airdrop-create dev log (tail) ==="
    tail -40 /tmp/smoke-airdrop-create.log
    echo
    echo "=== airdrop-claim dev log (tail) ==="
    tail -40 /tmp/smoke-airdrop-claim.log
fi

exit $FAILED
