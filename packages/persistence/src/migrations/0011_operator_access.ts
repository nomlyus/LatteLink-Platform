import { sql, type Kysely } from "kysely";

type MigrationDb = Kysely<Record<string, never>>;

export async function up(db: MigrationDb): Promise<void> {
  await sql`
    CREATE TABLE IF NOT EXISTS operator_users (
      operator_user_id UUID PRIMARY KEY,
      email TEXT NOT NULL,
      display_name TEXT NOT NULL,
      role TEXT NOT NULL,
      location_id TEXT NOT NULL,
      active BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `.execute(db);

  await sql`
    CREATE UNIQUE INDEX IF NOT EXISTS operator_users_email_unique_idx
    ON operator_users (email)
  `.execute(db);

  await sql`
    CREATE INDEX IF NOT EXISTS operator_users_location_role_idx
    ON operator_users (location_id, role, active)
  `.execute(db);

  await sql`
    CREATE TABLE IF NOT EXISTS operator_magic_links (
      token TEXT PRIMARY KEY,
      email TEXT NOT NULL,
      operator_user_id UUID,
      expires_at TIMESTAMPTZ NOT NULL,
      consumed_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `.execute(db);

  await sql`
    CREATE INDEX IF NOT EXISTS operator_magic_links_email_idx
    ON operator_magic_links (email, created_at DESC)
  `.execute(db);

  await sql`
    CREATE TABLE IF NOT EXISTS operator_sessions (
      access_token TEXT PRIMARY KEY,
      refresh_token TEXT NOT NULL UNIQUE,
      operator_user_id UUID NOT NULL,
      access_expires_at TIMESTAMPTZ,
      expires_at TIMESTAMPTZ NOT NULL,
      revoked_at TIMESTAMPTZ,
      auth_method TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `.execute(db);

  await sql`
    CREATE INDEX IF NOT EXISTS operator_sessions_user_id_idx
    ON operator_sessions (operator_user_id, created_at DESC)
  `.execute(db);
}

export async function down(db: MigrationDb): Promise<void> {
  await sql`DROP TABLE IF EXISTS operator_sessions`.execute(db);
  await sql`DROP TABLE IF EXISTS operator_magic_links`.execute(db);
  await sql`DROP TABLE IF EXISTS operator_users`.execute(db);
}
