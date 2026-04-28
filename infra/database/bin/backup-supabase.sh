#!/usr/bin/env bash

set -euo pipefail

SOURCE_DATABASE_URL="${SOURCE_DATABASE_URL:-}"
SOURCE_ENVIRONMENT="${SOURCE_ENVIRONMENT:-unknown}"
BACKUP_DIR="${BACKUP_DIR:-./backups/supabase-$(date -u +%Y%m%dT%H%M%SZ)}"

if [[ -z "${SOURCE_DATABASE_URL}" ]]; then
  echo "SOURCE_DATABASE_URL is required" >&2
  exit 1
fi

if ! command -v supabase >/dev/null 2>&1; then
  echo "supabase CLI is required" >&2
  exit 1
fi

mkdir -p "${BACKUP_DIR}"

schema_path="${BACKUP_DIR}/schema.sql"
data_path="${BACKUP_DIR}/data.sql"
manifest_path="${BACKUP_DIR}/manifest.txt"

remove_unsupported_restore_settings() {
  local path="$1"
  local tmp_path="${path}.tmp"

  grep -v '^SET transaction_timeout = ' "${path}" > "${tmp_path}"
  mv "${tmp_path}" "${path}"
}

echo "Creating Supabase logical schema dump for ${SOURCE_ENVIRONMENT}"
supabase db dump \
  --db-url "${SOURCE_DATABASE_URL}" \
  --schema public \
  --file "${schema_path}"
remove_unsupported_restore_settings "${schema_path}"

echo "Creating Supabase logical data dump for ${SOURCE_ENVIRONMENT}"
supabase db dump \
  --db-url "${SOURCE_DATABASE_URL}" \
  --schema public \
  --data-only \
  --use-copy \
  --file "${data_path}"
remove_unsupported_restore_settings "${data_path}"

{
  echo "source_environment=${SOURCE_ENVIRONMENT}"
  echo "created_at_utc=$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  echo "schema_file=$(basename "${schema_path}")"
  echo "data_file=$(basename "${data_path}")"
  echo "git_sha=${GITHUB_SHA:-$(git rev-parse HEAD 2>/dev/null || echo unknown)}"
  echo "supabase_cli_version=$(supabase --version)"
} > "${manifest_path}"

echo "Backup created in ${BACKUP_DIR}"
