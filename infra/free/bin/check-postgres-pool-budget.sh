#!/usr/bin/env bash
set -euo pipefail

ENV_FILE="${1:-.env}"

if [ ! -f "${ENV_FILE}" ]; then
  echo "[check-postgres-pool-budget] missing env file: ${ENV_FILE}" >&2
  exit 1
fi

while IFS= read -r line || [ -n "${line}" ]; do
  case "${line}" in
    "" | \#*) continue ;;
  esac

  key="${line%%=*}"
  if [ "${key}" = "${line}" ]; then
    continue
  fi

  value="${line#*=}"
  export "${key}=${value}"
done < "${ENV_FILE}"

to_positive_int() {
  local name="$1"
  local fallback="$2"
  local value="${!name:-}"

  if [ -z "${value}" ]; then
    printf '%s' "${fallback}"
    return
  fi

  if ! printf '%s' "${value}" | grep -Eq '^[0-9]+$' || [ "${value}" -le 0 ]; then
    echo "[check-postgres-pool-budget] ${name} must be a positive integer; received: ${value}" >&2
    exit 1
  fi

  printf '%s' "${value}"
}

DEPLOY_ENV_VALUE="${DEPLOY_ENV:-unknown}"
if [ "${DEPLOY_ENV_VALUE}" = "production" ]; then
  DEFAULT_LIMIT=60
  DEFAULT_HEADROOM=20
else
  DEFAULT_LIMIT=30
  DEFAULT_HEADROOM=10
fi

POOL_BUDGET_LIMIT="$(to_positive_int POSTGRES_POOL_BUDGET_LIMIT "${DEFAULT_LIMIT}")"
POOL_HEADROOM_MIN="$(to_positive_int POSTGRES_POOL_HEADROOM_MIN "${DEFAULT_HEADROOM}")"

declare -a SERVICE_NAMES=(
  "identity"
  "orders"
  "catalog"
  "payments"
  "loyalty"
  "notifications"
  "worker-payment-reconciler"
)

declare -a SERVICE_ENV_KEYS=(
  "IDENTITY_POSTGRES_POOL_MAX"
  "ORDERS_POSTGRES_POOL_MAX"
  "CATALOG_POSTGRES_POOL_MAX"
  "PAYMENTS_POSTGRES_POOL_MAX"
  "LOYALTY_POSTGRES_POOL_MAX"
  "NOTIFICATIONS_POSTGRES_POOL_MAX"
  "PAYMENT_RECONCILER_POSTGRES_POOL_MAX"
)

declare -a SERVICE_DEFAULTS=(
  2
  2
  2
  2
  2
  2
  1
)

total=0
echo "[check-postgres-pool-budget] environment=${DEPLOY_ENV_VALUE}"
echo "[check-postgres-pool-budget] configured database provider limit=${POOL_BUDGET_LIMIT}, required headroom=${POOL_HEADROOM_MIN}"

for index in "${!SERVICE_NAMES[@]}"; do
  service="${SERVICE_NAMES[$index]}"
  key="${SERVICE_ENV_KEYS[$index]}"
  fallback="${SERVICE_DEFAULTS[$index]}"
  value="$(to_positive_int "${key}" "${fallback}")"
  total=$((total + value))
  printf '[check-postgres-pool-budget] %-28s %s=%s\n' "${service}" "${key}" "${value}"
done

available_headroom=$((POOL_BUDGET_LIMIT - total))
echo "[check-postgres-pool-budget] total app-side pool capacity=${total}"
echo "[check-postgres-pool-budget] remaining provider headroom=${available_headroom}"

if [ "${available_headroom}" -lt "${POOL_HEADROOM_MIN}" ]; then
  echo "[check-postgres-pool-budget] FAIL: total ${total} plus required headroom ${POOL_HEADROOM_MIN} exceeds provider limit ${POOL_BUDGET_LIMIT}" >&2
  exit 1
fi

echo "[check-postgres-pool-budget] PASS"
