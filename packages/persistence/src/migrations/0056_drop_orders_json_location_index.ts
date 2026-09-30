import { sql, type Kysely } from "kysely";

type MigrationDb = Kysely<Record<string, never>>;

/** Reporting now filters orders by the immutable relational location_id. */
export async function up(db: MigrationDb): Promise<void> {
  await sql`DROP INDEX IF EXISTS orders_reporting_location_idx`.execute(db);
}

/** Restore the prior reporting index if this migration is rolled back. */
export async function down(db: MigrationDb): Promise<void> {
  await sql`
    CREATE INDEX IF NOT EXISTS orders_reporting_location_idx
    ON orders ((order_json ->> 'locationId'))
  `.execute(db);
}
