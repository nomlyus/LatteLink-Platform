import { sql, type Kysely } from "kysely";

type MigrationDb = Kysely<Record<string, never>>;

export async function up(db: MigrationDb): Promise<void> {
  await sql`ALTER TABLE notifications_outbox ADD COLUMN IF NOT EXISTS receipt_claim_token TEXT`.execute(db);
  await sql`ALTER TABLE notifications_outbox ADD COLUMN IF NOT EXISTS receipt_lease_expires_at TIMESTAMPTZ`.execute(db);
  await sql`CREATE INDEX IF NOT EXISTS notifications_outbox_receipt_lease_idx
    ON notifications_outbox (receipt_due_at, receipt_lease_expires_at, created_at)
    WHERE status = 'SUBMITTED'`.execute(db);
}

export async function down(db: MigrationDb): Promise<void> {
  await sql`DROP INDEX IF EXISTS notifications_outbox_receipt_lease_idx`.execute(db);
  await sql`ALTER TABLE notifications_outbox DROP COLUMN IF EXISTS receipt_lease_expires_at, DROP COLUMN IF EXISTS receipt_claim_token`.execute(db);
}
