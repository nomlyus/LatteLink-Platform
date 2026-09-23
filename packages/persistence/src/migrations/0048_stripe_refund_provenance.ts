import { sql, type Kysely } from "kysely";

type MigrationDb = Kysely<Record<string, never>>;

export async function up(db: MigrationDb): Promise<void> {
  await sql`ALTER TABLE payments_refunds ADD COLUMN IF NOT EXISTS stripe_account_id TEXT`.execute(db);
  await sql`ALTER TABLE payments_refunds ADD COLUMN IF NOT EXISTS provider_refund_id TEXT`.execute(db);
  await sql`ALTER TABLE payments_refunds ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'LEGACY_UNVERIFIED'`.execute(db);
  await sql`ALTER TABLE payments_refunds ADD COLUMN IF NOT EXISTS provider_status TEXT`.execute(db);
  await sql`ALTER TABLE payments_refunds ADD COLUMN IF NOT EXISTS allocation_json JSONB`.execute(db);
  await sql`
    UPDATE payments_refunds SET source = 'LEGACY_SIMULATED'
    WHERE message LIKE 'Simulated Stripe refund%' AND source = 'LEGACY_UNVERIFIED'
  `.execute(db);
  await sql`
    CREATE UNIQUE INDEX IF NOT EXISTS payments_refunds_stripe_provider_id_unique
    ON payments_refunds (stripe_account_id, provider_refund_id)
    WHERE stripe_account_id IS NOT NULL AND provider_refund_id IS NOT NULL
  `.execute(db);
  await sql`
    CREATE INDEX IF NOT EXISTS payments_refunds_payment_provider_idx
    ON payments_refunds (payment_id, source, status)
  `.execute(db);
}

export async function down(db: MigrationDb): Promise<void> {
  await sql`DROP INDEX IF EXISTS payments_refunds_payment_provider_idx`.execute(db);
  await sql`DROP INDEX IF EXISTS payments_refunds_stripe_provider_id_unique`.execute(db);
  await sql`ALTER TABLE payments_refunds DROP COLUMN IF EXISTS allocation_json`.execute(db);
  await sql`ALTER TABLE payments_refunds DROP COLUMN IF EXISTS provider_status`.execute(db);
  await sql`ALTER TABLE payments_refunds DROP COLUMN IF EXISTS source`.execute(db);
  await sql`ALTER TABLE payments_refunds DROP COLUMN IF EXISTS provider_refund_id`.execute(db);
  await sql`ALTER TABLE payments_refunds DROP COLUMN IF EXISTS stripe_account_id`.execute(db);
}
