#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="${ROOT_DIR}/.env"
PIDS=()
CLEANED_UP=0

load_env_file() {
  local env_file="$1"
  local line=""
  local line_number=0
  local key=""
  local value=""

  while IFS= read -r line || [[ -n "${line}" ]]; do
    line_number=$((line_number + 1))
    line="${line%$'\r'}"

    if [[ "${line}" =~ ^[[:space:]]*$ ]] || [[ "${line}" =~ ^[[:space:]]*# ]]; then
      continue
    fi

    if [[ "${line}" =~ ^[[:space:]]*export[[:space:]]+ ]]; then
      line="${line#export }"
    fi

    if [[ ! "${line}" =~ ^[[:space:]]*([A-Za-z_][A-Za-z0-9_]*)=(.*)$ ]]; then
      echo "[dev-services] skipping invalid env line ${line_number} in ${env_file}" >&2
      continue
    fi

    key="${BASH_REMATCH[1]}"
    value="${BASH_REMATCH[2]}"

    if [[ "${value}" =~ ^\".*\"$ ]] || [[ "${value}" =~ ^\'.*\'$ ]]; then
      value="${value:1:${#value}-2}"
    elif [[ "${value}" =~ [[:space:]] ]]; then
      echo "[dev-services] skipping invalid env line ${line_number} in ${env_file}" >&2
      continue
    fi

    export "${key}=${value}"
  done < "${env_file}"
}

if [[ -f "${ENV_FILE}" ]]; then
  echo "[dev-services] loading env from ${ENV_FILE}"
  load_env_file "${ENV_FILE}"
fi

BIND_HOST="${BIND_HOST:-127.0.0.1}"
GATEWAY_PUBLIC_HOST="${GATEWAY_PUBLIC_HOST:-127.0.0.1}"
IDENTITY_UPSTREAM_HOST="${IDENTITY_UPSTREAM_HOST:-127.0.0.1}"
ORDERS_UPSTREAM_HOST="${ORDERS_UPSTREAM_HOST:-127.0.0.1}"
CATALOG_UPSTREAM_HOST="${CATALOG_UPSTREAM_HOST:-127.0.0.1}"
LOYALTY_UPSTREAM_HOST="${LOYALTY_UPSTREAM_HOST:-127.0.0.1}"
NOTIFICATIONS_UPSTREAM_HOST="${NOTIFICATIONS_UPSTREAM_HOST:-127.0.0.1}"
LOCAL_CORS_ALLOWED_ORIGINS="${CORS_ALLOWED_ORIGINS:-http://127.0.0.1:4173,http://localhost:4173,http://127.0.0.1:5173,http://localhost:5173}"

start_service() {
  local label="$1"
  shift
  echo "[dev-services] starting ${label}"
  "$@" &
  PIDS+=("$!")
}

cleanup() {
  if [[ "${CLEANED_UP}" -eq 1 ]]; then
    return
  fi
  CLEANED_UP=1

  echo
  echo "[dev-services] stopping local services"
  for pid in "${PIDS[@]:-}"; do
    kill "${pid}" 2>/dev/null || true
  done
  wait || true
}

trap cleanup EXIT INT TERM

start_service "identity:3000" env PORT=3000 HOST="${BIND_HOST}" GATEWAY_INTERNAL_API_TOKEN="${GATEWAY_INTERNAL_API_TOKEN:-}" pnpm -C "${ROOT_DIR}" --filter @lattelink/identity dev
start_service "orders:3001" env PORT=3001 HOST="${BIND_HOST}" GATEWAY_INTERNAL_API_TOKEN="${GATEWAY_INTERNAL_API_TOKEN:-}" CATALOG_SERVICE_BASE_URL="http://${CATALOG_UPSTREAM_HOST}:3002" ORDERS_INTERNAL_API_TOKEN="${ORDERS_INTERNAL_API_TOKEN:-}" LOYALTY_INTERNAL_API_TOKEN="${LOYALTY_INTERNAL_API_TOKEN:-}" NOTIFICATIONS_INTERNAL_API_TOKEN="${NOTIFICATIONS_INTERNAL_API_TOKEN:-}" pnpm -C "${ROOT_DIR}" --filter @lattelink/orders dev
start_service "catalog:3002" env PORT=3002 HOST="${BIND_HOST}" GATEWAY_INTERNAL_API_TOKEN="${GATEWAY_INTERNAL_API_TOKEN:-}" pnpm -C "${ROOT_DIR}" --filter @lattelink/catalog dev
start_service "payments:3003" env PORT=3003 HOST="${BIND_HOST}" GATEWAY_INTERNAL_API_TOKEN="${GATEWAY_INTERNAL_API_TOKEN:-}" ORDERS_INTERNAL_API_TOKEN="${ORDERS_INTERNAL_API_TOKEN:-}" pnpm -C "${ROOT_DIR}" --filter @lattelink/payments dev
start_service "loyalty:3004" env PORT=3004 HOST="${BIND_HOST}" GATEWAY_INTERNAL_API_TOKEN="${GATEWAY_INTERNAL_API_TOKEN:-}" LOYALTY_INTERNAL_API_TOKEN="${LOYALTY_INTERNAL_API_TOKEN:-}" pnpm -C "${ROOT_DIR}" --filter @lattelink/loyalty dev
start_service "notifications:3005" env PORT=3005 HOST="${BIND_HOST}" GATEWAY_INTERNAL_API_TOKEN="${GATEWAY_INTERNAL_API_TOKEN:-}" NOTIFICATIONS_INTERNAL_API_TOKEN="${NOTIFICATIONS_INTERNAL_API_TOKEN:-}" pnpm -C "${ROOT_DIR}" --filter @lattelink/notifications dev

start_service \
  "gateway:8080" \
  env \
  PORT=8080 \
  HOST="${BIND_HOST}" \
  CORS_ALLOWED_ORIGINS="${LOCAL_CORS_ALLOWED_ORIGINS}" \
  IDENTITY_SERVICE_BASE_URL="http://${IDENTITY_UPSTREAM_HOST}:3000" \
  ORDERS_SERVICE_BASE_URL="http://${ORDERS_UPSTREAM_HOST}:3001" \
  CATALOG_SERVICE_BASE_URL="http://${CATALOG_UPSTREAM_HOST}:3002" \
  LOYALTY_SERVICE_BASE_URL="http://${LOYALTY_UPSTREAM_HOST}:3004" \
  NOTIFICATIONS_SERVICE_BASE_URL="http://${NOTIFICATIONS_UPSTREAM_HOST}:3005" \
  ORDERS_INTERNAL_API_TOKEN="${ORDERS_INTERNAL_API_TOKEN:-}" \
  GATEWAY_INTERNAL_API_TOKEN="${GATEWAY_INTERNAL_API_TOKEN:-}" \
  pnpm -C "${ROOT_DIR}" --filter @lattelink/gateway dev

if [[ "${START_MENU_SYNC_WORKER:-0}" == "1" ]]; then
  start_service "menu-sync-worker" env MENU_SYNC_INTERVAL_MS=60000 pnpm -C "${ROOT_DIR}" --filter @lattelink/menu-sync-worker dev
fi

if [[ "${START_NOTIFICATIONS_DISPATCH_WORKER:-0}" == "1" ]]; then
  start_service "notifications-dispatch-worker" env NOTIFICATIONS_SERVICE_BASE_URL="http://127.0.0.1:3005" pnpm -C "${ROOT_DIR}" --filter @lattelink/notifications-dispatch-worker dev
fi

echo "[dev-services] all services started"
echo "[dev-services] bind host => ${BIND_HOST}"
echo "[dev-services] gateway => http://${GATEWAY_PUBLIC_HOST}:8080"
echo "[dev-services] press Ctrl+C to stop"

while true; do
  for pid in "${PIDS[@]}"; do
    if ! kill -0 "${pid}" 2>/dev/null; then
      echo "[dev-services] process ${pid} exited unexpectedly"
      exit 1
    fi
  done
  sleep 2
done
