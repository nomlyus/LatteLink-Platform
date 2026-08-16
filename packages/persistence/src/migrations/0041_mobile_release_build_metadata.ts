import { sql, type Kysely } from "kysely";

type MigrationDb = Kysely<Record<string, never>>;

export async function up(db: MigrationDb): Promise<void> {
  await sql`
    ALTER TABLE catalog_mobile_release_profiles
      ADD COLUMN IF NOT EXISTS build_profile TEXT,
      ADD COLUMN IF NOT EXISTS source_commit_sha TEXT,
      ADD COLUMN IF NOT EXISTS config_hash TEXT,
      ADD COLUMN IF NOT EXISTS app_store_review_notes TEXT
  `.execute(db);

  await sql`
    CREATE INDEX IF NOT EXISTS catalog_mobile_release_profiles_source_commit_idx
    ON catalog_mobile_release_profiles (source_commit_sha)
    WHERE source_commit_sha IS NOT NULL
  `.execute(db);
}

export async function down(db: MigrationDb): Promise<void> {
  await sql`DROP INDEX IF EXISTS catalog_mobile_release_profiles_source_commit_idx`.execute(db);
  await sql`
    ALTER TABLE catalog_mobile_release_profiles
      DROP COLUMN IF EXISTS app_store_review_notes,
      DROP COLUMN IF EXISTS config_hash,
      DROP COLUMN IF EXISTS source_commit_sha,
      DROP COLUMN IF EXISTS build_profile
  `.execute(db);
}
