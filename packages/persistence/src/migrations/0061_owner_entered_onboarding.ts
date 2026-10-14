import { sql, type Kysely } from "kysely";
type MigrationDb = Kysely<Record<string, never>>;

export async function up(db: MigrationDb): Promise<void> {
  await sql`ALTER TABLE catalog_clients ADD COLUMN owner_profile_json JSONB`.execute(db);
  await sql`ALTER TABLE catalog_client_locations ADD COLUMN owner_address_text TEXT, ADD COLUMN owner_details_confirmed_at TIMESTAMPTZ`.execute(db);
  // Do not convert provisioned placeholders into owner confirmations. Existing
  // completed brands keep 0060's completion marker and are not re-onboarded.
}

export async function down(db: MigrationDb): Promise<void> {
  await sql`ALTER TABLE catalog_client_locations DROP COLUMN owner_address_text, DROP COLUMN owner_details_confirmed_at`.execute(db);
  await sql`ALTER TABLE catalog_clients DROP COLUMN owner_profile_json`.execute(db);
}
