import { sql, type Kysely } from "kysely";

type MigrationDb = Kysely<Record<string, never>>;

export async function up(db: MigrationDb): Promise<void> {
  await sql`
    CREATE TABLE IF NOT EXISTS operator_location_access (
      operator_user_id UUID NOT NULL REFERENCES operator_users (operator_user_id) ON DELETE CASCADE,
      location_id TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (operator_user_id, location_id)
    )
  `.execute(db);

  await sql`
    INSERT INTO operator_location_access (operator_user_id, location_id)
    SELECT operator_user_id, location_id
    FROM operator_users
    ON CONFLICT (operator_user_id, location_id) DO NOTHING
  `.execute(db);

  await sql`
    CREATE INDEX IF NOT EXISTS operator_location_access_location_idx
    ON operator_location_access (location_id, operator_user_id)
  `.execute(db);
}

export async function down(db: MigrationDb): Promise<void> {
  await sql`DROP TABLE IF EXISTS operator_location_access`.execute(db);
}
