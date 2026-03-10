#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

resolve_machine_ip() {
  local ip=""

  if command -v ipconfig >/dev/null 2>&1; then
    ip="$(ipconfig getifaddr en0 2>/dev/null || true)"
    if [[ -z "${ip}" ]]; then
      ip="$(ipconfig getifaddr en1 2>/dev/null || true)"
    fi
  fi

  if [[ -z "${ip}" ]] && command -v hostname >/dev/null 2>&1; then
    ip="$(hostname -I 2>/dev/null | awk '{print $1}' || true)"
  fi

  printf "%s" "${ip}"
}

DEV_MACHINE_IP="${DEV_MACHINE_IP:-$(resolve_machine_ip)}"

if [[ -z "${DEV_MACHINE_IP}" ]]; then
  echo "[dev-services:lan] unable to detect LAN IP automatically"
  echo "[dev-services:lan] run: DEV_MACHINE_IP=<your-mac-ip> pnpm dev:services:lan"
  exit 1
fi

echo "[dev-services:lan] using machine IP ${DEV_MACHINE_IP}"
echo "[dev-services:lan] device health URL http://${DEV_MACHINE_IP}:8080/health"

BIND_HOST=0.0.0.0 \
GATEWAY_PUBLIC_HOST="${DEV_MACHINE_IP}" \
IDENTITY_UPSTREAM_HOST=127.0.0.1 \
ORDERS_UPSTREAM_HOST=127.0.0.1 \
"${ROOT_DIR}/scripts/dev-local-services.sh"
