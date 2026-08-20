import { sql, type Kysely } from "kysely";

type MigrationDb = Kysely<Record<string, never>>;

export async function up(db: MigrationDb): Promise<void> {
  await sql`
    CREATE TABLE IF NOT EXISTS catalog_mobile_release_build_jobs (
      job_id UUID PRIMARY KEY,
      location_id TEXT NOT NULL REFERENCES catalog_client_locations (location_id) ON DELETE CASCADE,
      tenant_id TEXT NOT NULL REFERENCES catalog_clients (tenant_id) ON DELETE CASCADE,
      status TEXT NOT NULL DEFAULT 'queued'
        CHECK (status IN ('queued', 'running', 'succeeded', 'failed', 'canceled')),
      profile TEXT NOT NULL DEFAULT 'beta'
        CHECK (profile IN ('beta', 'production')),
      build_profile TEXT NOT NULL,
      source_commit_sha TEXT NOT NULL CHECK (source_commit_sha ~* '^[a-f0-9]{40}$'),
      config_hash TEXT NOT NULL,
      app_store_review_notes TEXT,
      requested_by TEXT,
      eas_build_id TEXT,
      eas_submission_id TEXT,
      error_message TEXT,
      request_json JSONB NOT NULL DEFAULT '{}'::jsonb,
      started_at TIMESTAMPTZ,
      finished_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `.execute(db);

  await sql`
    CREATE INDEX IF NOT EXISTS catalog_mobile_release_build_jobs_location_idx
    ON catalog_mobile_release_build_jobs (location_id, created_at DESC)
  `.execute(db);

  await sql`
    CREATE INDEX IF NOT EXISTS catalog_mobile_release_build_jobs_status_idx
    ON catalog_mobile_release_build_jobs (status, created_at ASC)
    WHERE status IN ('queued', 'running')
  `.execute(db);
}

export async function down(db: MigrationDb): Promise<void> {
  await sql`DROP INDEX IF EXISTS catalog_mobile_release_build_jobs_status_idx`.execute(db);
  await sql`DROP INDEX IF EXISTS catalog_mobile_release_build_jobs_location_idx`.execute(db);
  await sql`DROP TABLE IF EXISTS catalog_mobile_release_build_jobs`.execute(db);
}
