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
  echo "[dev-mobile:lan] unable to detect LAN IP automatically"
  echo "[dev-mobile:lan] run: DEV_MACHINE_IP=<your-mac-ip> pnpm dev:mobile:lan"
  exit 1
fi

API_URL="http://${DEV_MACHINE_IP}:8080/v1"
echo "[dev-mobile:lan] EXPO_PUBLIC_API_BASE_URL=${API_URL}"

EXPO_PUBLIC_API_BASE_URL="${API_URL}" pnpm -C "${ROOT_DIR}" --filter @gazelle/mobile dev
