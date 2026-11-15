#!/usr/bin/env bash
# Post-deploy smoke test. Fails (exit 1) on the first broken check.
#
#   API_URL=https://api.example.com WEB_URL=https://app.example.com \
#   EXPECT_VERSION=<git sha> HEALTH_CHECK_TOKEN=... infra/smoke.sh
#
# EXPECT_VERSION   wait until both services report this build (optional)
# HEALTH_CHECK_TOKEN  run the deep check: DB, Redis, R2 round-trip, PDF,
#                     queue and a live worker (optional, recommended)
# WAIT_SECONDS     how long to wait for the new build (default 600)
set -euo pipefail

: "${API_URL:?set API_URL}"
: "${WEB_URL:?set WEB_URL}"
API_URL="${API_URL%/}"
WEB_URL="${WEB_URL%/}"
WAIT_SECONDS="${WAIT_SECONDS:-600}"
EXPECT_VERSION="${EXPECT_VERSION:-}"

pass() { printf '  \033[32m✓\033[0m %s\n' "$1"; }
fail() { printf '  \033[31m✗\033[0m %s\n' "$1" >&2; exit 1; }
field() { sed -n "s/.*\"$1\":\"\\([^\"]*\\)\".*/\\1/p"; }

echo "Smoke test: $WEB_URL + $API_URL"

# 1. The new build is live (deploys are asynchronous after the webhook).
wait_for() { # name url
  local deadline=$((SECONDS + WAIT_SECONDS)) body version
  while :; do
    body=$(curl -fsS --max-time 10 "$2" 2>/dev/null || true)
    version=$(printf '%s' "$body" | field version)
    if [ -n "$body" ] && { [ -z "$EXPECT_VERSION" ] || [ "$version" = "$EXPECT_VERSION" ]; }; then
      pass "$1 is up (version ${version:-unknown})"
      return
    fi
    [ "$SECONDS" -ge "$deadline" ] &&
      fail "$1 not serving ${EXPECT_VERSION:-a healthy build} after ${WAIT_SECONDS}s (last: ${version:-no response})"
    sleep 10
  done
}
wait_for "API" "$API_URL/health/live"
wait_for "Web" "$WEB_URL/healthz"

# 2. Readiness: database and Redis reachable from the API.
code=$(curl -s -o /dev/null -w '%{http_code}' --max-time 10 "$API_URL/health")
[ "$code" = 200 ] && pass "API ready (database, redis)" || fail "GET /health returned $code"

# 3. The sign-in page renders.
code=$(curl -s -o /dev/null -w '%{http_code}' --max-time 15 "$WEB_URL/sign-in")
[ "$code" = 200 ] && pass "Sign-in page renders" || fail "GET $WEB_URL/sign-in returned $code"

# 4. Auth is mounted and CORS lets the web app send cookies to the API.
headers=$(curl -s -D - -o /dev/null --max-time 10 -H "Origin: $WEB_URL" "$API_URL/api/auth/get-session")
printf '%s' "$headers" | grep -qi "^access-control-allow-origin: $WEB_URL" ||
  fail "API does not allow origin $WEB_URL (check WEB_URL / TRUSTED_ORIGINS)"
printf '%s' "$headers" | grep -qi '^access-control-allow-credentials: true' ||
  fail "API does not allow credentials for $WEB_URL"
pass "Auth endpoint reachable, CORS allows $WEB_URL with cookies"

# 5. Deep check: storage, PDF, queue, worker.
if [ -n "${HEALTH_CHECK_TOKEN:-}" ]; then
  body=$(curl -s --max-time 30 -w '\n%{http_code}' -H "x-health-token: $HEALTH_CHECK_TOKEN" "$API_URL/health/deep")
  code=${body##*$'\n'}
  body=${body%$'\n'*}
  [ "$code" = 200 ] && pass "Deep check: database, redis, storage, pdf, queue, worker" ||
    fail "Deep check failed ($code): $body"
else
  echo "  - Deep check skipped (HEALTH_CHECK_TOKEN not set)"
fi

echo "All smoke checks passed."
