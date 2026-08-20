import { sql, type Kysely } from "kysely";

type MigrationDb = Kysely<Record<string, never>>;

export async function up(db: MigrationDb): Promise<void> {
  await sql`
    ALTER TABLE catalog_mobile_release_build_jobs
      ADD COLUMN IF NOT EXISTS approval_required BOOLEAN NOT NULL DEFAULT TRUE,
      ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS approved_by TEXT
  `.execute(db);

  await sql`
    ALTER TABLE catalog_mobile_release_build_jobs
      DROP CONSTRAINT IF EXISTS catalog_mobile_release_build_jobs_status_check,
      ADD CONSTRAINT catalog_mobile_release_build_jobs_status_check
        CHECK (status IN ('queued', 'running', 'awaiting_approval', 'submitting', 'succeeded', 'failed', 'canceled'))
  `.execute(db);
}

export async function down(db: MigrationDb): Promise<void> {
  await sql`
    ALTER TABLE catalog_mobile_release_build_jobs
      DROP CONSTRAINT IF EXISTS catalog_mobile_release_build_jobs_status_check,
      ADD CONSTRAINT catalog_mobile_release_build_jobs_status_check
        CHECK (status IN ('queued', 'running', 'succeeded', 'failed', 'canceled'))
  `.execute(db);

  await sql`
    ALTER TABLE catalog_mobile_release_build_jobs
      DROP COLUMN IF EXISTS approved_by,
      DROP COLUMN IF EXISTS approved_at,
      DROP COLUMN IF EXISTS approval_required
  `.execute(db);
}
