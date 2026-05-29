#!/usr/bin/env bash
set -euo pipefail

ENV_FILE="${1:-.env}"
PROJECT_NAME="${2:-${COMPOSE_PROJECT_NAME:-lattelink}}"
shift 2 || true

if [ "$#" -eq 0 ]; then
  echo "usage: $0 <env-file> <compose-project-name> <service> [service...]" >&2
  exit 1
fi

TIMEOUT_SECONDS="${COMPOSE_HEALTH_TIMEOUT_SECONDS:-180}"
SLEEP_SECONDS="${COMPOSE_HEALTH_POLL_SECONDS:-5}"

compose() {
  docker compose --project-name "${PROJECT_NAME}" --env-file "${ENV_FILE}" "$@"
}

wait_for_service() {
  local service="$1"
  local started_at
  started_at="$(date +%s)"

  echo "[wait-compose-health] waiting for ${service}"
  while true; do
    local container_id
    container_id="$(compose ps -q "${service}" 2>/dev/null || true)"

    if [ -n "${container_id}" ]; then
      local health_status
      health_status="$(docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "${container_id}" 2>/dev/null || true)"

      if [ "${health_status}" = "healthy" ]; then
        echo "[wait-compose-health] ${service} is healthy"
        return 0
      fi

      if [ "${health_status}" = "exited" ] || [ "${health_status}" = "dead" ]; then
        echo "[wait-compose-health] ${service} is ${health_status}" >&2
        compose logs --tail=80 "${service}" >&2 || true
        return 1
      fi
    fi

    if [ $(( $(date +%s) - started_at )) -ge "${TIMEOUT_SECONDS}" ]; then
      echo "[wait-compose-health] timed out waiting for ${service}" >&2
      compose ps >&2 || true
      compose logs --tail=80 "${service}" >&2 || true
      return 1
    fi

    sleep "${SLEEP_SECONDS}"
  done
}

for service in "$@"; do
  wait_for_service "${service}"
done
