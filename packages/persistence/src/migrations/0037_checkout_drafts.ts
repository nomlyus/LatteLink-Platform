import { sql, type Kysely } from "kysely";

type MigrationDb = Kysely<Record<string, never>>;

export async function up(db: MigrationDb): Promise<void> {
  await sql`
    CREATE TABLE IF NOT EXISTS order_checkout_drafts (
      checkout_id UUID PRIMARY KEY,
      user_id UUID NOT NULL,
      quote_id UUID NOT NULL REFERENCES orders_quotes (quote_id),
      quote_hash TEXT NOT NULL,
      status TEXT NOT NULL CHECK (status IN ('OPEN', 'CONVERTED', 'EXPIRED')),
      order_id UUID,
      expires_at TIMESTAMPTZ NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `.execute(db);

  await sql`
    CREATE INDEX IF NOT EXISTS order_checkout_drafts_user_status_idx
    ON order_checkout_drafts (user_id, status, created_at DESC)
  `.execute(db);

  await sql`
    CREATE INDEX IF NOT EXISTS order_checkout_drafts_expiry_idx
    ON order_checkout_drafts (status, expires_at)
  `.execute(db);

  await sql`
    CREATE UNIQUE INDEX IF NOT EXISTS order_checkout_drafts_open_quote_idx
    ON order_checkout_drafts (quote_id, quote_hash, user_id)
    WHERE status = 'OPEN'
  `.execute(db);
}

export async function down(db: MigrationDb): Promise<void> {
  await sql`DROP TABLE IF EXISTS order_checkout_drafts`.execute(db);
}
