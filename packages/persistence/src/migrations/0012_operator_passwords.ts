import { sql, type Kysely } from "kysely";

type MigrationDb = Kysely<Record<string, never>>;

export async function up(db: MigrationDb): Promise<void> {
  await sql`
    ALTER TABLE operator_users
    ADD COLUMN IF NOT EXISTS password_hash TEXT
  `.execute(db);
}

export async function down(db: MigrationDb): Promise<void> {
  await sql`
    ALTER TABLE operator_users
    DROP COLUMN IF EXISTS password_hash
  `.execute(db);
}
