import { sql, type Kysely } from "kysely";

type MigrationDb = Kysely<Record<string, never>>;

export async function up(db: MigrationDb): Promise<void> {
  await sql`
    CREATE TABLE IF NOT EXISTS catalog_app_identity_profiles (
      location_id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL REFERENCES catalog_clients (tenant_id) ON DELETE CASCADE,
      app_name TEXT,
      display_name TEXT,
      bundle_identifier TEXT,
      sku TEXT,
      primary_category TEXT NOT NULL DEFAULT 'Food & Drink',
      subtitle TEXT,
      description TEXT,
      keywords TEXT[] NOT NULL DEFAULT '{}',
      support_url TEXT,
      privacy_policy_url TEXT,
      marketing_url TEXT,
      icon_asset_url TEXT,
      splash_asset_url TEXT,
      screenshot_asset_urls TEXT[] NOT NULL DEFAULT '{}',
      target_location_ids TEXT[] NOT NULL DEFAULT '{}',
      asset_mode TEXT NOT NULL DEFAULT 'placeholder'
        CHECK (asset_mode IN ('placeholder', 'provided')),
      admin_override_ready BOOLEAN NOT NULL DEFAULT FALSE,
      admin_override_reason TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `.execute(db);

  await sql`
    CREATE INDEX IF NOT EXISTS catalog_app_identity_profiles_tenant_idx
    ON catalog_app_identity_profiles (tenant_id, updated_at DESC)
  `.execute(db);
}

export async function down(db: MigrationDb): Promise<void> {
  await sql`DROP INDEX IF EXISTS catalog_app_identity_profiles_tenant_idx`.execute(db);
  await sql`DROP TABLE IF EXISTS catalog_app_identity_profiles`.execute(db);
}
