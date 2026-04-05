import { sql, type Kysely } from "kysely";

type MigrationDb = Kysely<Record<string, never>>;

export async function up(db: MigrationDb): Promise<void> {
  await sql`
    ALTER TABLE identity_users
    ADD COLUMN IF NOT EXISTS display_name TEXT
  `.execute(db);

  await sql`
    ALTER TABLE identity_users
    ALTER COLUMN birthday TYPE DATE USING birthday::date
  `.execute(db);

  await sql`
    ALTER TABLE identity_users
    ADD COLUMN IF NOT EXISTS profile_completed_at TIMESTAMPTZ
  `.execute(db);

  await sql`
    UPDATE identity_users
    SET
      name = COALESCE(name, display_name),
      display_name = COALESCE(display_name, name),
      profile_completed_at = COALESCE(
        profile_completed_at,
        CASE
          WHEN COALESCE(name, display_name) IS NOT NULL AND phone_number IS NOT NULL AND birthday IS NOT NULL THEN updated_at
          ELSE NULL
        END
      )
  `.execute(db);
}

export async function down(db: MigrationDb): Promise<void> {
  await sql`
    ALTER TABLE identity_users
    DROP COLUMN IF EXISTS profile_completed_at
  `.execute(db);

  await sql`
    ALTER TABLE identity_users
    DROP COLUMN IF EXISTS display_name
  `.execute(db);

  await sql`
    ALTER TABLE identity_users
    ALTER COLUMN birthday TYPE TEXT USING birthday::text
  `.execute(db);
}
