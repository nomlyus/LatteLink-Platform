import { sql, type Kysely } from "kysely";

type MigrationDb = Kysely<Record<string, never>>;

export async function up(db: MigrationDb): Promise<void> {
  await sql`
    CREATE TABLE IF NOT EXISTS catalog_mobile_experience_drafts (
      location_id TEXT PRIMARY KEY,
      experience_json JSONB NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `.execute(db);

  await sql`
    CREATE TABLE IF NOT EXISTS catalog_mobile_experience_versions (
      version_id TEXT PRIMARY KEY,
      location_id TEXT NOT NULL,
      experience_json JSONB NOT NULL,
      published_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `.execute(db);

  await sql`
    CREATE INDEX IF NOT EXISTS catalog_mobile_experience_versions_location_published_idx
    ON catalog_mobile_experience_versions (location_id, published_at DESC)
  `.execute(db);
}

export async function down(db: MigrationDb): Promise<void> {
  await sql`DROP INDEX IF EXISTS catalog_mobile_experience_versions_location_published_idx`.execute(db);
  await sql`DROP TABLE IF EXISTS catalog_mobile_experience_versions`.execute(db);
  await sql`DROP TABLE IF EXISTS catalog_mobile_experience_drafts`.execute(db);
}
