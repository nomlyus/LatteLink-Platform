#!/usr/bin/env bash

set -euo pipefail

TARGET_DATABASE_URL="${TARGET_DATABASE_URL:-}"
BACKUP_DIR="${BACKUP_DIR:-${1:-}}"
ALLOW_REMOTE_RESTORE="${ALLOW_REMOTE_RESTORE:-false}"

if [[ -z "${TARGET_DATABASE_URL}" ]]; then
  echo "TARGET_DATABASE_URL is required" >&2
  exit 1
fi

if [[ -z "${BACKUP_DIR}" ]]; then
  echo "BACKUP_DIR or first positional argument is required" >&2
  exit 1
fi

if [[ ! -f "${BACKUP_DIR}/schema.sql" || ! -f "${BACKUP_DIR}/data.sql" ]]; then
  echo "Expected ${BACKUP_DIR}/schema.sql and ${BACKUP_DIR}/data.sql" >&2
  exit 1
fi

if ! command -v psql >/dev/null 2>&1; then
  echo "psql is required" >&2
  exit 1
fi

if [[ "${TARGET_DATABASE_URL}" =~ (supabase\.co|pooler\.supabase\.com) && "${ALLOW_REMOTE_RESTORE}" != "true" ]]; then
  echo "Refusing to restore into a remote Supabase URL without ALLOW_REMOTE_RESTORE=true" >&2
  exit 1
fi

echo "Resetting target public schema"
psql "${TARGET_DATABASE_URL}" -v ON_ERROR_STOP=1 <<'SQL'
DROP SCHEMA IF EXISTS public CASCADE;
CREATE SCHEMA public;
GRANT ALL ON SCHEMA public TO public;
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA public;
SQL

echo "Restoring schema"
psql "${TARGET_DATABASE_URL}" -v ON_ERROR_STOP=1 -f "${BACKUP_DIR}/schema.sql"

echo "Restoring data"
psql "${TARGET_DATABASE_URL}" -v ON_ERROR_STOP=1 -f "${BACKUP_DIR}/data.sql"

echo "Restore completed from ${BACKUP_DIR}"
