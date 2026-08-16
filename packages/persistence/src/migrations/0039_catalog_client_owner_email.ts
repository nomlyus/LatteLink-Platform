import { sql, type Kysely } from "kysely";

type MigrationDb = Kysely<Record<string, never>>;

export async function up(db: MigrationDb): Promise<void> {
  await sql`
    ALTER TABLE catalog_clients
    ADD COLUMN IF NOT EXISTS owner_email TEXT
  `.execute(db);

  await sql`
    CREATE UNIQUE INDEX IF NOT EXISTS catalog_clients_owner_email_unique_idx
    ON catalog_clients (lower(owner_email))
    WHERE owner_email IS NOT NULL
  `.execute(db);
}

export async function down(db: MigrationDb): Promise<void> {
  await sql`DROP INDEX IF EXISTS catalog_clients_owner_email_unique_idx`.execute(db);
  await sql`
    ALTER TABLE catalog_clients
    DROP COLUMN IF EXISTS owner_email
  `.execute(db);
}
