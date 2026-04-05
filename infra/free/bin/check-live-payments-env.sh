#!/usr/bin/env bash

set -euo pipefail

ENV_FILE="${1:-.env}"

if [ ! -f "${ENV_FILE}" ]; then
  echo "[check-live-payments-env] missing env file: ${ENV_FILE}" >&2
  exit 1
fi

set -a
# shellcheck disable=SC1090
source "${ENV_FILE}"
set +a

MODE="${PAYMENTS_PROVIDER_MODE:-simulated}"

if [ "${MODE}" != "live" ]; then
  echo "[check-live-payments-env] PASS: payments provider mode is ${MODE}; live Clover validation skipped."
  exit 0
fi

errors=()
warnings=()

require_value() {
  local name="$1"
  local value="${!name:-}"
  if [ -z "${value}" ]; then
    errors+=("missing required env: ${name}")
  fi
}

require_https_url() {
  local name="$1"
  local value="${!name:-}"
  if [ -z "${value}" ]; then
    errors+=("missing required env: ${name}")
    return
  fi

  case "${value}" in
    https://*) ;;
    *)
      errors+=("${name} must be an https URL; received: ${value}")
      ;;
  esac
}

require_value "CLOVER_WEBHOOK_SHARED_SECRET"

CLOVER_OAUTH_ENVIRONMENT_VALUE="${CLOVER_OAUTH_ENVIRONMENT:-sandbox}"
case "${CLOVER_OAUTH_ENVIRONMENT_VALUE}" in
  sandbox|production) ;;
  *)
    errors+=("CLOVER_OAUTH_ENVIRONMENT must be sandbox or production; received: ${CLOVER_OAUTH_ENVIRONMENT_VALUE}")
    ;;
esac

oauth_missing=()
for name in CLOVER_APP_ID CLOVER_APP_SECRET CLOVER_OAUTH_REDIRECT_URI CLOVER_OAUTH_STATE_SECRET; do
  if [ -z "${!name:-}" ]; then
    oauth_missing+=("${name}")
  fi
done

has_oauth_bootstrap=0
if [ "${#oauth_missing[@]}" -eq 0 ]; then
  has_oauth_bootstrap=1
else
  partial_oauth=0
  for name in CLOVER_APP_ID CLOVER_APP_SECRET CLOVER_OAUTH_REDIRECT_URI CLOVER_OAUTH_STATE_SECRET; do
    if [ -n "${!name:-}" ]; then
      partial_oauth=1
    fi
  done

  if [ "${partial_oauth}" -eq 1 ]; then
    errors+=("Clover OAuth is partially configured; still missing: ${oauth_missing[*]}")
  fi
fi

if [ "${has_oauth_bootstrap}" -eq 1 ]; then
  require_https_url "CLOVER_OAUTH_REDIRECT_URI"
fi

if [ "${has_oauth_bootstrap}" -eq 0 ]; then
  errors+=("live Clover mode requires a complete Clover OAuth bootstrap configuration")
fi

if [ "${#errors[@]}" -gt 0 ]; then
  echo "[check-live-payments-env] FAIL"
  for entry in "${errors[@]}"; do
    echo "- ERROR: ${entry}"
  done
  if [ "${#warnings[@]}" -gt 0 ]; then
    for entry in "${warnings[@]}"; do
      echo "- WARN: ${entry}"
    done
  fi
  exit 1
fi

echo "[check-live-payments-env] PASS: live Clover env is rollout-ready."
if [ "${#warnings[@]}" -gt 0 ]; then
  for entry in "${warnings[@]}"; do
    echo "- WARN: ${entry}"
  done
fi
