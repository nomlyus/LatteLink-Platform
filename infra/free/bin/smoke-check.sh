#!/usr/bin/env bash
set -euo pipefail

API_INPUT="${1:-${API_BASE_URL:-}}"

if [[ -z "$API_INPUT" ]]; then
  echo "usage: API_BASE_URL=https://api.example.com/v1 ./bin/smoke-check.sh"
  echo "   or: ./bin/smoke-check.sh https://api.example.com/v1"
  exit 1
fi

API_BASE="${API_INPUT%/}"
if [[ "$API_BASE" != */v1 ]]; then
  API_BASE="${API_BASE}/v1"
fi
API_ROOT="${API_BASE%/v1}"
TRACE_REQUEST_ID="${SMOKE_TRACE_REQUEST_ID:-free-smoke-$(date +%Y%m%d%H%M%S)}"
WORK_DIR="$(mktemp -d)"

cleanup() {
  rm -rf "$WORK_DIR"
}

trap cleanup EXIT

normalize_headers() {
  tr -d '\r' < "$1"
}

assert_request_id_header() {
  local headers_file="$1"
  if ! normalize_headers "$headers_file" | grep -Fqi "x-request-id: ${TRACE_REQUEST_ID}"; then
    echo "[smoke-check] missing echoed x-request-id header for ${TRACE_REQUEST_ID}"
    exit 1
  fi
}

check_get() {
  local name="$1"
  local url="$2"
  local headers_file="$WORK_DIR/${name}.headers"
  local body_file="$WORK_DIR/${name}.body"

  echo "[smoke-check] GET ${url}"
  curl --fail --silent --show-error \
    -D "$headers_file" \
    -o "$body_file" \
    -H "x-request-id: ${TRACE_REQUEST_ID}" \
    "$url"

  assert_request_id_header "$headers_file"
}

check_cors() {
  local origin="$1"
  local headers_file="$WORK_DIR/cors.headers"

  echo "[smoke-check] OPTIONS ${API_BASE}/operator/auth/me for origin ${origin}"
  curl --silent --show-error \
    -D "$headers_file" \
    -o /dev/null \
    -X OPTIONS \
    -H "Origin: ${origin}" \
    -H "Access-Control-Request-Method: GET" \
    -H "Access-Control-Request-Headers: authorization,content-type" \
    "${API_BASE}/operator/auth/me"

  local allow_origin
  allow_origin="$(normalize_headers "$headers_file" | awk -F': ' 'tolower($1)=="access-control-allow-origin" {print $2; exit}')"
  if [[ "$allow_origin" != "$origin" && "$allow_origin" != "*" ]]; then
    echo "[smoke-check] CORS origin mismatch: expected ${origin}, got ${allow_origin:-<missing>}"
    exit 1
  fi
}

operator_sign_in() {
  local headers_file="$WORK_DIR/operator-sign-in.headers"
  local body_file="$WORK_DIR/operator-sign-in.body"
  local payload

  payload="$(SMOKE_OPERATOR_EMAIL="$SMOKE_OPERATOR_EMAIL" SMOKE_OPERATOR_PASSWORD="$SMOKE_OPERATOR_PASSWORD" \
    node -e 'process.stdout.write(JSON.stringify({email:process.env.SMOKE_OPERATOR_EMAIL,password:process.env.SMOKE_OPERATOR_PASSWORD}))')"

  echo "[smoke-check] POST ${API_BASE}/operator/auth/sign-in" >&2
  curl --fail --silent --show-error \
    -D "$headers_file" \
    -o "$body_file" \
    -H "content-type: application/json" \
    -H "x-request-id: ${TRACE_REQUEST_ID}" \
    -d "$payload" \
    "${API_BASE}/operator/auth/sign-in"

  assert_request_id_header "$headers_file"
  node -e 'const fs=require("node:fs");const body=JSON.parse(fs.readFileSync(process.argv[1],"utf8"));if(!body.accessToken){process.exit(1);}process.stdout.write(body.accessToken);' "$body_file"
}

check_operator_flow() {
  if [[ -z "${SMOKE_OPERATOR_EMAIL:-}" && -z "${SMOKE_OPERATOR_PASSWORD:-}" ]]; then
    return 0
  fi

  if [[ -z "${SMOKE_OPERATOR_EMAIL:-}" || -z "${SMOKE_OPERATOR_PASSWORD:-}" ]]; then
    echo "[smoke-check] set both SMOKE_OPERATOR_EMAIL and SMOKE_OPERATOR_PASSWORD to run operator flow checks"
    exit 1
  fi

  local access_token
  access_token="$(operator_sign_in)"

  check_get_with_auth "operator-me" "${API_BASE}/operator/auth/me" "$access_token"
  check_get_with_auth "admin-orders" "${API_BASE}/admin/orders" "$access_token"
}

check_get_with_auth() {
  local name="$1"
  local url="$2"
  local access_token="$3"
  local headers_file="$WORK_DIR/${name}.headers"
  local body_file="$WORK_DIR/${name}.body"

  echo "[smoke-check] GET ${url}"
  curl --fail --silent --show-error \
    -D "$headers_file" \
    -o "$body_file" \
    -H "authorization: Bearer ${access_token}" \
    -H "x-request-id: ${TRACE_REQUEST_ID}" \
    "$url"

  assert_request_id_header "$headers_file"
}

echo "[smoke-check] api root: ${API_ROOT}"
echo "[smoke-check] trace request id: ${TRACE_REQUEST_ID}"

check_get "health" "${API_ROOT}/health"
check_get "ready" "${API_ROOT}/ready"
check_get "metrics" "${API_ROOT}/metrics"
check_get "contracts" "${API_BASE}/meta/contracts"

if [[ -n "${CLIENT_DASHBOARD_ORIGIN:-}" ]]; then
  check_cors "$CLIENT_DASHBOARD_ORIGIN"
fi

check_operator_flow

echo "[smoke-check] ok"
echo "[smoke-check] trace logs with: docker compose logs gateway identity orders payments notifications | rg \"${TRACE_REQUEST_ID}\""
