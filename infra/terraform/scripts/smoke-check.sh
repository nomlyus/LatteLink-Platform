#!/usr/bin/env bash
set -euo pipefail

ENVIRONMENT="${1:-dev}"
API_URL_VAR="API_BASE_URL_${ENVIRONMENT^^}"
API_URL="${!API_URL_VAR:-}"

if [[ -z "$API_URL" ]]; then
  echo "[smoke-check] missing $API_URL_VAR"
  exit 1
fi

API_BASE="${API_URL%/}"
if [[ "$API_BASE" == */v1 ]]; then
  API_ROOT="${API_BASE%/v1}"
else
  API_ROOT="$API_BASE"
fi

echo "[smoke-check] checking gateway health endpoints via ${API_ROOT}"
curl --fail --silent --show-error "${API_ROOT}/health" > /dev/null
curl --fail --silent --show-error "${API_ROOT}/ready" > /dev/null
curl --fail --silent --show-error "${API_ROOT}/metrics" > /dev/null

echo "[smoke-check] checking API contract endpoint via ${API_BASE}"
curl --fail --silent --show-error "${API_BASE}/meta/contracts" > /dev/null

echo "[smoke-check] ok for ${ENVIRONMENT}"
