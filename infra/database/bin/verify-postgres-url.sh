#!/usr/bin/env bash

set -euo pipefail

TARGET_DATABASE_URL="${TARGET_DATABASE_URL:-}"
BACKUP_DIR="${BACKUP_DIR:-${1:-}}"

if [[ -z "${TARGET_DATABASE_URL}" ]]; then
  echo "TARGET_DATABASE_URL is required" >&2
  exit 1
fi

if ! command -v psql >/dev/null 2>&1; then
  echo "psql is required" >&2
  exit 1
fi

critical_tables=(
  kysely_migration
  identity_users
  identity_sessions
  operator_users
  operator_location_access
  catalog_menu_categories
  catalog_menu_items
  catalog_store_configs
  orders
  payments_charges
  payments_refunds
  payments_stripe_payment_intents
  loyalty_balances
  notifications_push_tokens
)

missing_tables=()
for table_name in "${critical_tables[@]}"; do
  exists="$(
    psql "${TARGET_DATABASE_URL}" -v ON_ERROR_STOP=1 -tA \
      -c "SELECT to_regclass('public.${table_name}') IS NOT NULL;"
  )"
  if [[ "${exists}" != "t" ]]; then
    missing_tables+=("${table_name}")
  fi
done

if [[ "${#missing_tables[@]}" -gt 0 ]]; then
  echo "Missing restored critical tables: ${missing_tables[*]}" >&2
  exit 1
fi

migration_count="$(
  psql "${TARGET_DATABASE_URL}" -v ON_ERROR_STOP=1 -tA \
    -c "SELECT COUNT(*)::bigint FROM public.kysely_migration;"
)"

if [[ "${migration_count}" -le 0 ]]; then
  echo "No applied migrations found after restore" >&2
  exit 1
fi

verification_path="${BACKUP_DIR:-.}/restore-verification.tsv"
mkdir -p "$(dirname "${verification_path}")"

{
  echo -e "entity\trow_count"
  for table_name in "${critical_tables[@]}"; do
    row_count="$(
      psql "${TARGET_DATABASE_URL}" -v ON_ERROR_STOP=1 -tA \
        -c "SELECT COUNT(*)::bigint FROM public.${table_name};"
    )"
    echo -e "${table_name}\t${row_count}"
  done
} | tee "${verification_path}"

echo "Restore verification completed; applied migrations: ${migration_count}"
