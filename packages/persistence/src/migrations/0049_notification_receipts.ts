import { sql, type Kysely } from "kysely";

type MigrationDb = Kysely<Record<string, never>>;

export async function up(db: MigrationDb): Promise<void> {
  await sql`ALTER TABLE notifications_outbox ADD COLUMN IF NOT EXISTS receipt_id TEXT`.execute(db);
  await sql`ALTER TABLE notifications_outbox ADD COLUMN IF NOT EXISTS receipt_due_at TIMESTAMPTZ`.execute(db);
  await sql`ALTER TABLE notifications_outbox ADD COLUMN IF NOT EXISTS receipt_expires_at TIMESTAMPTZ`.execute(db);
  await sql`ALTER TABLE notifications_outbox ADD COLUMN IF NOT EXISTS provider_accepted_at TIMESTAMPTZ`.execute(db);
  await sql`ALTER TABLE notifications_outbox ADD COLUMN IF NOT EXISTS failure_code TEXT`.execute(db);
  await sql`ALTER TABLE notifications_outbox ADD COLUMN IF NOT EXISTS environment TEXT NOT NULL DEFAULT 'unknown'`.execute(db);
  await sql`ALTER TABLE notifications_outbox ADD COLUMN IF NOT EXISTS dispatch_claim_token TEXT`.execute(db);
  await sql`ALTER TABLE notifications_outbox ADD COLUMN IF NOT EXISTS dispatch_lease_expires_at TIMESTAMPTZ`.execute(db);
  await sql`CREATE INDEX IF NOT EXISTS notifications_outbox_receipt_due_idx ON notifications_outbox (receipt_due_at, created_at) WHERE status = 'SUBMITTED'`.execute(db);
  await sql`CREATE INDEX IF NOT EXISTS notifications_outbox_health_idx ON notifications_outbox (environment, created_at, status)`.execute(db);
  await sql`CREATE INDEX IF NOT EXISTS notifications_outbox_dispatch_lease_idx ON notifications_outbox (dispatch_lease_expires_at, created_at) WHERE status = 'PROCESSING'`.execute(db);
}

export async function down(db: MigrationDb): Promise<void> {
  await sql`DROP INDEX IF EXISTS notifications_outbox_health_idx`.execute(db);
  await sql`DROP INDEX IF EXISTS notifications_outbox_receipt_due_idx`.execute(db);
  await sql`DROP INDEX IF EXISTS notifications_outbox_dispatch_lease_idx`.execute(db);
  await sql`ALTER TABLE notifications_outbox DROP COLUMN IF EXISTS dispatch_lease_expires_at, DROP COLUMN IF EXISTS dispatch_claim_token, DROP COLUMN IF EXISTS environment, DROP COLUMN IF EXISTS failure_code, DROP COLUMN IF EXISTS provider_accepted_at, DROP COLUMN IF EXISTS receipt_expires_at, DROP COLUMN IF EXISTS receipt_due_at, DROP COLUMN IF EXISTS receipt_id`.execute(db);
}
