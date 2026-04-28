import { sql, type Kysely } from "kysely";

type MigrationDb = Kysely<Record<string, never>>;

const defaultLocationId = "rawaqcoffee01";

export async function up(db: MigrationDb): Promise<void> {
  await sql`
    ALTER TABLE loyalty_balances
    ADD COLUMN IF NOT EXISTS location_id TEXT NOT NULL DEFAULT ${defaultLocationId}
  `.execute(db);

  await sql`
    ALTER TABLE loyalty_ledger_entries
    ADD COLUMN IF NOT EXISTS location_id TEXT NOT NULL DEFAULT ${defaultLocationId}
  `.execute(db);

  await sql`
    ALTER TABLE loyalty_idempotency_keys
    ADD COLUMN IF NOT EXISTS location_id TEXT NOT NULL DEFAULT ${defaultLocationId}
  `.execute(db);

  await sql`ALTER TABLE loyalty_balances DROP CONSTRAINT IF EXISTS loyalty_balances_pkey`.execute(db);
  await sql`ALTER TABLE loyalty_idempotency_keys DROP CONSTRAINT IF EXISTS loyalty_idempotency_keys_pkey`.execute(db);

  await sql`
    ALTER TABLE loyalty_balances
    ADD CONSTRAINT loyalty_balances_pkey PRIMARY KEY (user_id, location_id)
  `.execute(db);

  await sql`
    ALTER TABLE loyalty_idempotency_keys
    ADD CONSTRAINT loyalty_idempotency_keys_pkey PRIMARY KEY (user_id, location_id, idempotency_key)
  `.execute(db);

  await sql`
    CREATE INDEX IF NOT EXISTS loyalty_balances_location_user_idx
    ON loyalty_balances (location_id, user_id)
  `.execute(db);

  await sql`
    CREATE INDEX IF NOT EXISTS loyalty_ledger_entries_location_user_created_at_idx
    ON loyalty_ledger_entries (location_id, user_id, created_at DESC)
  `.execute(db);

  await sql`
    CREATE INDEX IF NOT EXISTS loyalty_idempotency_keys_location_user_idx
    ON loyalty_idempotency_keys (location_id, user_id)
  `.execute(db);
}

export async function down(db: MigrationDb): Promise<void> {
  await sql`DROP INDEX IF EXISTS loyalty_idempotency_keys_location_user_idx`.execute(db);
  await sql`DROP INDEX IF EXISTS loyalty_ledger_entries_location_user_created_at_idx`.execute(db);
  await sql`DROP INDEX IF EXISTS loyalty_balances_location_user_idx`.execute(db);

  await sql`ALTER TABLE loyalty_idempotency_keys DROP CONSTRAINT IF EXISTS loyalty_idempotency_keys_pkey`.execute(db);
  await sql`ALTER TABLE loyalty_balances DROP CONSTRAINT IF EXISTS loyalty_balances_pkey`.execute(db);

  await sql`
    ALTER TABLE loyalty_idempotency_keys
    ADD CONSTRAINT loyalty_idempotency_keys_pkey PRIMARY KEY (user_id, idempotency_key)
  `.execute(db);

  await sql`
    ALTER TABLE loyalty_balances
    ADD CONSTRAINT loyalty_balances_pkey PRIMARY KEY (user_id)
  `.execute(db);

  await sql`ALTER TABLE loyalty_idempotency_keys DROP COLUMN IF EXISTS location_id`.execute(db);
  await sql`ALTER TABLE loyalty_ledger_entries DROP COLUMN IF EXISTS location_id`.execute(db);
  await sql`ALTER TABLE loyalty_balances DROP COLUMN IF EXISTS location_id`.execute(db);
}
