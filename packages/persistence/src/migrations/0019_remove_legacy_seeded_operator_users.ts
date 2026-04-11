import { sql, type Kysely } from "kysely";

type MigrationDb = Kysely<Record<string, never>>;

const legacyOperatorPredicate = sql`
  (
    email = 'owner@gazellecoffee.com'
    AND display_name = 'Store Owner'
    AND role = 'owner'
  )
  OR (
    email = 'manager@gazellecoffee.com'
    AND display_name = 'Store Manager'
    AND role = 'manager'
  )
  OR (
    email = 'staff@gazellecoffee.com'
    AND display_name = 'Lead Barista'
    AND role = 'staff'
  )
`;

export async function up(db: MigrationDb): Promise<void> {
  await sql`
    DELETE FROM operator_sessions
    WHERE operator_user_id IN (
      SELECT operator_user_id
      FROM operator_users
      WHERE ${legacyOperatorPredicate}
    )
  `.execute(db);

  await sql`
    DELETE FROM operator_magic_links
    WHERE operator_user_id IN (
      SELECT operator_user_id
      FROM operator_users
      WHERE ${legacyOperatorPredicate}
    )
    OR email IN (
      SELECT email
      FROM operator_users
      WHERE ${legacyOperatorPredicate}
    )
  `.execute(db);

  await sql`
    DELETE FROM operator_users
    WHERE ${legacyOperatorPredicate}
  `.execute(db);
}

export async function down(_: MigrationDb): Promise<void> {
  // Irreversible data cleanup.
}
