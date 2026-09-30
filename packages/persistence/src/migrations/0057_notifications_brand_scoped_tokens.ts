import { sql, type Kysely } from "kysely";

type MigrationDb = Kysely<Record<string, never>>;

export async function up(db: MigrationDb): Promise<void> {
  // Legacy registrations cannot be assigned to a branded app deterministically.
  // NULL marks them as inert; dispatch only joins a non-null matching brand.
  await sql`ALTER TABLE notifications_push_tokens ADD COLUMN IF NOT EXISTS brand_id TEXT`.execute(db);
  await sql`ALTER TABLE notifications_outbox ADD COLUMN IF NOT EXISTS brand_id TEXT`.execute(db);
  await sql`ALTER TABLE notifications_push_tokens DROP CONSTRAINT IF EXISTS notifications_push_tokens_pkey`.execute(db);
  await sql`CREATE UNIQUE INDEX IF NOT EXISTS notifications_push_tokens_brand_device_uidx
    ON notifications_push_tokens (user_id, brand_id, device_id) WHERE brand_id IS NOT NULL`.execute(db);
  await sql`CREATE UNIQUE INDEX IF NOT EXISTS notifications_push_tokens_legacy_device_uidx
    ON notifications_push_tokens (user_id, device_id) WHERE brand_id IS NULL`.execute(db);
  await sql`CREATE INDEX IF NOT EXISTS notifications_push_tokens_user_brand_idx
    ON notifications_push_tokens (user_id, brand_id) WHERE brand_id IS NOT NULL`.execute(db);

  // A queued recipient from the old user/device-only model is ambiguous.
  // Do not send it after the new brand-scoped dispatch rules are installed.
  await sql`UPDATE notifications_outbox
    SET status = 'FAILED',
        failure_code = 'BRAND_SCOPE_REQUIRED',
        last_error = 'Legacy notification recipient has no brand scope; the app must register again.',
        dispatch_claim_token = NULL,
        dispatch_lease_expires_at = NULL,
        updated_at = NOW()
    WHERE status IN ('PENDING', 'PROCESSING') AND brand_id IS NULL`.execute(db);
}

export async function down(db: MigrationDb): Promise<void> {
  const duplicates = await sql<{ duplicate_count: string }>`
    SELECT COUNT(*)::text AS duplicate_count
    FROM (
      SELECT user_id, device_id
      FROM notifications_push_tokens
      GROUP BY user_id, device_id
      HAVING COUNT(*) > 1
    ) duplicate_devices
  `.execute(db);
  if (Number(duplicates.rows[0]?.duplicate_count ?? 0) > 0) {
    throw new Error("Cannot remove notification brand scope while a user/device has registrations for multiple brands.");
  }

  await sql`DROP INDEX IF EXISTS notifications_push_tokens_user_brand_idx`.execute(db);
  await sql`DROP INDEX IF EXISTS notifications_push_tokens_legacy_device_uidx`.execute(db);
  await sql`DROP INDEX IF EXISTS notifications_push_tokens_brand_device_uidx`.execute(db);
  await sql`ALTER TABLE notifications_push_tokens ADD CONSTRAINT notifications_push_tokens_pkey PRIMARY KEY (user_id, device_id)`.execute(db);
  await sql`ALTER TABLE notifications_outbox DROP COLUMN IF EXISTS brand_id`.execute(db);
  await sql`ALTER TABLE notifications_push_tokens DROP COLUMN IF EXISTS brand_id`.execute(db);
}
