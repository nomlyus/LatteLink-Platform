# Database Backup and Restore Runbook

Last verified: `2026-04-28`

## Scope

LatteLink currently runs two deployed environments:

- `dev`: `api-dev.nomly.us`, connected to the dev Supabase project
- `production`: `api.nomly.us`, connected to the production Supabase project

Both environments use Supabase Postgres through `DATABASE_URL`. The bundled Docker Compose Postgres service is local-only and must not be used by deployed dev or production.

## Recovery Policy

For the pilot, the recovery model has two layers:

- Supabase platform backups: Supabase creates daily backups for projects. Restore availability depends on the active Supabase plan.
- LatteLink logical backups: use Supabase CLI `db dump` to export public schema and data so recovery does not depend only on dashboard restore features.

Current pilot target:

- RPO: at most 24 hours for platform backups; lower only when a fresh logical backup was taken before a risky operation.
- RTO: 60-120 minutes for a small pilot database, including restore, environment validation, and smoke checks.
- Owner: founder/operator until a named on-call rotation exists.

Reference: Supabase recommends regular `supabase db dump` exports for Free tier projects and documents `supabase db dump --db-url` for logical backups.

## What Is Backed Up

The logical backup scripts export the `public` schema from Supabase:

- all LatteLink service tables
- Kysely migration history
- catalog/menu/store configuration
- identity/operator/session tables
- orders/payments/loyalty/notifications tables

Not included:

- Supabase-managed internal schemas such as `auth`, `storage`, `realtime`, and `extensions`
- Cloudflare R2 object bytes
- GitHub/Vercel/EAS/Stripe/Apple secrets

Catalog media recovery depends on R2 object persistence plus database `imageUrl` references. Deleted R2 objects are not restored by a database restore; enable R2 lifecycle/backups separately before merchants rely heavily on media uploads.

## Tooling

Repository scripts:

- `infra/database/bin/backup-supabase.sh`
- `infra/database/bin/restore-postgres-url.sh`
- `infra/database/bin/verify-postgres-url.sh`
- `infra/database/bin/rehearse-supabase-restore.sh`

Manual GitHub workflow:

- `.github/workflows/database-restore-drill.yml`

The workflow reads `BACKUP_DATABASE_URL` from the selected GitHub Environment when present, otherwise it falls back to `DATABASE_URL`. Prefer a direct Supabase connection URL for backups because some pooler modes are not suitable for `pg_dump`.

It creates a logical backup, restores it into a disposable Postgres service inside GitHub Actions, verifies critical tables, deletes raw SQL files, and uploads only non-sensitive evidence files.

## Run A Restore Drill

Use `dev` for routine drills.

```bash
gh workflow run database-restore-drill.yml \
  --repo nomlyus/LatteLink-Platform \
  --ref main \
  -f source_environment=dev
```

Watch it:

```bash
run_id="$(gh run list --repo nomlyus/LatteLink-Platform --workflow database-restore-drill.yml --limit 1 --json databaseId --jq '.[0].databaseId')"
gh run watch "$run_id" --repo nomlyus/LatteLink-Platform --exit-status
```

Success means:

- Supabase CLI can dump the selected environment
- schema restore into disposable Postgres succeeds
- data restore succeeds
- `kysely_migration` contains at least one applied migration
- all pilot-critical tables exist and row counts are emitted

## Local / Host Drill

Install prerequisites:

```bash
supabase --version
psql --version
```

Run against a source database and a disposable target database:

```bash
export SOURCE_ENVIRONMENT=dev
export SOURCE_DATABASE_URL='postgresql://...'
export TARGET_DATABASE_URL='postgresql://postgres:restore_drill@localhost:5432/postgres'
export BACKUP_DIR="./backups/dev-$(date -u +%Y%m%dT%H%M%SZ)"

./infra/database/bin/rehearse-supabase-restore.sh
```

The restore script refuses to write into Supabase URLs unless `ALLOW_REMOTE_RESTORE=true` is set. Do not set that during a drill.

## Production Incident Restore

Use this only when production data is damaged or production Supabase is being replaced.

1. Freeze writes by putting the backend behind maintenance mode or stopping the production compose stack.
2. Take a final logical backup from the current production database if it is reachable.
3. Restore through the Supabase dashboard if the target restore point is covered by platform backups.
4. If dashboard restore is not available, create or choose the replacement database and restore the latest logical backup.
5. Update the production GitHub Environment `DATABASE_URL` only after the replacement database passes verification.
6. Run `deploy-prod` with the last known good image SHA.
7. Verify `https://api.nomly.us/ready`.
8. Run a real pilot smoke check: Apple Sign-In, menu load, quote, payment path, dashboard order visibility, status transition.
9. Record incident timestamp, restore source, RPO, RTO, and validation result.

## Backup Storage

Until dedicated encrypted object storage is configured, raw logical backup SQL files are intentionally not uploaded by the GitHub drill workflow.

Operational rule:

- before any risky migration or production release, run the restore drill and retain the local encrypted backup in the operator-controlled password manager or encrypted storage location
- never commit backup SQL files
- never upload raw customer/order data to GitHub artifacts

Recommended next hardening step:

- add encrypted off-site backup storage, such as DigitalOcean Spaces or S3, with a dedicated `BACKUP_ENCRYPTION_PASSPHRASE` secret and 30-day retention

## Verification Queries

The verifier checks these tables:

- `kysely_migration`
- `identity_users`
- `identity_sessions`
- `operator_users`
- `operator_location_access`
- `catalog_menu_categories`
- `catalog_menu_items`
- `catalog_store_configs`
- `orders`
- `payments_charges`
- `payments_refunds`
- `payments_stripe_payment_intents`
- `loyalty_balances`
- `notifications_push_tokens`

If a new pilot-critical table is added, update `infra/database/bin/verify-postgres-url.sh` in the same PR.

## Drill Log

Latest code-side drill tooling validation:

- Date: `2026-04-28`
- Environment: repository scripts and GitHub workflow
- Result: workflow and scripts added; local syntax validation required before close
- Follow-up: run `database-restore-drill.yml` against `dev` after this workflow exists on `main`
