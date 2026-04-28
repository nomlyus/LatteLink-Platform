# Deprecated: Container Postgres Restore Drill

Last reviewed: `2026-04-28`

This runbook only applies when the bundled Docker Compose Postgres container is the active database.

Deployed `dev` and `production` now use Supabase Postgres via `DATABASE_URL`. Use [`database-backup-restore.md`](/Users/yazan/Documents/Gazelle/Dev/GazelleMobilePlatform/docs/runbooks/database-backup-restore.md) for pilot backup and restore operations.

## Goal

Rehearse backup and restore for the free-first Postgres container without overwriting the live pilot database.

## Scope

This drill is for the free-first DigitalOcean/Docker Compose deployment in `infra/free`.

It validates:

- a backup can be created from `gazelle-postgres`
- the backup can be restored into a scratch database
- pilot-critical tables can be queried successfully after restore

## Location

After `deploy-free`, these scripts are present on the host in the deployment directory:

- `bin/backup-postgres.sh`
- `bin/restore-postgres-scratch.sh`
- `bin/verify-postgres-restore.sh`
- `bin/rehearse-postgres-restore.sh`

## Preconditions

- the free-first stack is deployed
- `docker compose ps` shows `postgres` healthy
- you are in the deployment directory, typically `/opt/gazelle-free`

## One-Command Rehearsal

Run:

```bash
./bin/rehearse-postgres-restore.sh
```

This will:

1. create a timestamped custom-format backup under `./backups/`
2. restore it into scratch database `gazelle_restore_verify`
3. verify:
   - migrations table exists and is populated
   - row counts are queryable for:
     - `identity_users`
     - `operator_users`
     - `orders`
     - `catalog_menu_categories`
     - `catalog_menu_items`
     - `catalog_store_configs`

## Manual Step-by-Step Flow

Create a backup:

```bash
./bin/backup-postgres.sh ./backups/gazelle-manual.dump
```

Restore into a scratch database:

```bash
./bin/restore-postgres-scratch.sh ./backups/gazelle-manual.dump gazelle_restore_verify
```

Verify the restored data:

```bash
./bin/verify-postgres-restore.sh gazelle_restore_verify
```

## What Counts As Success

- backup file is created successfully
- scratch restore completes without `pg_restore` failure
- verification reports at least one applied migration
- verification can query all pilot-critical tables without schema errors

## Notes

- This drill intentionally restores into a scratch database instead of replacing the live `gazelle` database.
- If you need a true production restore, stop services first and take a fresh backup before replacing the live DB.
- Record the rehearsal timestamp, backup filename, and verification output in release notes or operations notes.
