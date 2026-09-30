import { sql, type Kysely } from "kysely";

type MigrationDb = Kysely<Record<string, never>>;

export async function up(db: MigrationDb): Promise<void> {
  // Existing rows are untouched. New catalog rows must supply their own
  // merchant/location display name instead of inheriting Rawaq's old value.
  await sql`ALTER TABLE catalog_store_configs ALTER COLUMN store_name DROP DEFAULT`.execute(db);
}

export async function down(db: MigrationDb): Promise<void> {
  // Keep the safety property on rollback; the prior Rawaq default is not restored.
  await sql`ALTER TABLE catalog_store_configs ALTER COLUMN store_name DROP DEFAULT`.execute(db);
}
