#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PIDS=()
CLEANED_UP=0
BIND_HOST="${BIND_HOST:-127.0.0.1}"
GATEWAY_PUBLIC_HOST="${GATEWAY_PUBLIC_HOST:-127.0.0.1}"
IDENTITY_UPSTREAM_HOST="${IDENTITY_UPSTREAM_HOST:-127.0.0.1}"
ORDERS_UPSTREAM_HOST="${ORDERS_UPSTREAM_HOST:-127.0.0.1}"

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

start_service "identity:3000" env PORT=3000 HOST="${BIND_HOST}" pnpm -C "${ROOT_DIR}" --filter @gazelle/identity dev
start_service "orders:3001" env PORT=3001 HOST="${BIND_HOST}" pnpm -C "${ROOT_DIR}" --filter @gazelle/orders dev
start_service "catalog:3002" env PORT=3002 HOST="${BIND_HOST}" pnpm -C "${ROOT_DIR}" --filter @gazelle/catalog dev
start_service "payments:3003" env PORT=3003 HOST="${BIND_HOST}" pnpm -C "${ROOT_DIR}" --filter @gazelle/payments dev
start_service "loyalty:3004" env PORT=3004 HOST="${BIND_HOST}" pnpm -C "${ROOT_DIR}" --filter @gazelle/loyalty dev
start_service "notifications:3005" env PORT=3005 HOST="${BIND_HOST}" pnpm -C "${ROOT_DIR}" --filter @gazelle/notifications dev

start_service \
  "gateway:8080" \
  env \
  PORT=8080 \
  HOST="${BIND_HOST}" \
  IDENTITY_SERVICE_BASE_URL="http://${IDENTITY_UPSTREAM_HOST}:3000" \
  ORDERS_SERVICE_BASE_URL="http://${ORDERS_UPSTREAM_HOST}:3001" \
  pnpm -C "${ROOT_DIR}" --filter @gazelle/gateway dev

if [[ "${START_MENU_SYNC_WORKER:-0}" == "1" ]]; then
  start_service "menu-sync-worker" env MENU_SYNC_INTERVAL_MS=60000 pnpm -C "${ROOT_DIR}" --filter @gazelle/menu-sync-worker dev
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
