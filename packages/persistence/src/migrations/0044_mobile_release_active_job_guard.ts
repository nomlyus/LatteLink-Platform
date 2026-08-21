import { sql, type Kysely } from "kysely";

type MigrationDb = Kysely<Record<string, never>>;

export async function up(db: MigrationDb): Promise<void> {
  await sql`
    CREATE UNIQUE INDEX IF NOT EXISTS catalog_mobile_release_build_jobs_one_active_per_location_idx
    ON catalog_mobile_release_build_jobs (location_id)
    WHERE status IN ('queued', 'running', 'awaiting_approval', 'submitting')
  `.execute(db);
}

export async function down(db: MigrationDb): Promise<void> {
  await sql`
    DROP INDEX IF EXISTS catalog_mobile_release_build_jobs_one_active_per_location_idx
  `.execute(db);
}
