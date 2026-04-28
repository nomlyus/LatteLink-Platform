#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKUP_DIR="${BACKUP_DIR:-./backups/supabase-$(date -u +%Y%m%dT%H%M%SZ)}"

"${SCRIPT_DIR}/backup-supabase.sh"
"${SCRIPT_DIR}/restore-postgres-url.sh" "${BACKUP_DIR}"
"${SCRIPT_DIR}/verify-postgres-url.sh" "${BACKUP_DIR}"

echo "Supabase backup and restore rehearsal completed successfully"
