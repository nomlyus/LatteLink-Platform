#!/usr/bin/env bash
set -euo pipefail

ENV_FILE="${1:-.env}"
PROJECT_NAME="${COMPOSE_PROJECT_NAME:-lattelink-${DEPLOY_ENV:-dev}}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if [ ! -f "${ENV_FILE}" ]; then
  echo "[deploy-compose] missing env file: ${ENV_FILE}" >&2
  exit 1
fi

compose() {
  docker compose --project-name "${PROJECT_NAME}" --env-file "${ENV_FILE}" "$@"
}

dump_failure() {
  local exit_code=$?
  trap - EXIT

  if [ "${exit_code}" -eq 0 ]; then
    return 0
  fi

  echo "[deploy-compose] deployment failed; collecting service diagnostics" >&2
  compose ps >&2 || true
  for service in identity catalog orders payments loyalty notifications gateway; do
    echo "[deploy-compose] logs: ${service}" >&2
    compose logs --no-color --tail=80 "${service}" >&2 || true
  done

  exit "${exit_code}"
}

trap dump_failure EXIT

"${SCRIPT_DIR}/check-live-payments-env.sh" "${ENV_FILE}"
"${SCRIPT_DIR}/check-postgres-pool-budget.sh" "${ENV_FILE}"

echo "[deploy-compose] pulling images"
compose pull

echo "[deploy-compose] starting shared dependencies"
compose up -d --remove-orphans valkey
"${SCRIPT_DIR}/wait-compose-health.sh" "${ENV_FILE}" "${PROJECT_NAME}" valkey

echo "[deploy-compose] starting upstream services before gateway restart"
compose up -d --remove-orphans identity catalog orders payments loyalty notifications
"${SCRIPT_DIR}/wait-compose-health.sh" "${ENV_FILE}" "${PROJECT_NAME}" identity catalog orders payments loyalty notifications

echo "[deploy-compose] starting workers after upstream services are healthy"
compose up -d --remove-orphans worker-notifications-dispatch worker-menu-sync worker-payment-reconciler

echo "[deploy-compose] restarting gateway after upstream readiness"
compose up -d --remove-orphans gateway
"${SCRIPT_DIR}/wait-compose-health.sh" "${ENV_FILE}" "${PROJECT_NAME}" gateway

echo "[deploy-compose] starting public ingress"
compose up -d --remove-orphans caddy

compose ps
