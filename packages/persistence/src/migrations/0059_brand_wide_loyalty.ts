import { sql, type Kysely } from "kysely";

type MigrationDb = Kysely<Record<string, never>>;

/**
 * Consolidate location-partitioned points into one brand/customer balance.
 * Location remains on immutable ledger/idempotency records as transaction
 * attribution. No location is guessed: inconsistent legacy data aborts up.
 */
export async function up(db: MigrationDb): Promise<void> {
  const preflight = await sql<{ issue_count: string; examples: string[] | null }>`
    WITH ledger_totals AS (
      SELECT brand_id, location_id, user_id,
        SUM(points)::BIGINT AS available_points,
        SUM(CASE WHEN type = 'EARN' THEN points ELSE 0 END)::BIGINT AS lifetime_earned
      FROM loyalty_ledger_entries
      GROUP BY brand_id, location_id, user_id
    ),
    issues AS (
      SELECT 'balance_invalid_or_unowned' AS reason,
        balances.brand_id || ':' || balances.user_id::text || ':' || balances.location_id AS record_id
      FROM loyalty_balances AS balances
      WHERE NULLIF(BTRIM(balances.brand_id), '') IS NULL
        OR NULLIF(BTRIM(balances.location_id), '') IS NULL
        OR NOT EXISTS (
          SELECT 1 FROM catalog_client_locations locations
          INNER JOIN catalog_clients clients
            ON clients.tenant_id = locations.tenant_id AND clients.brand_id = locations.brand_id
          WHERE locations.brand_id = balances.brand_id AND locations.location_id = balances.location_id
        )
        OR balances.available_points < 0 OR balances.pending_points < 0 OR balances.lifetime_earned < 0
        OR COALESCE((SELECT totals.available_points FROM ledger_totals totals
          WHERE totals.brand_id = balances.brand_id AND totals.location_id = balances.location_id
            AND totals.user_id = balances.user_id), 0) <> balances.available_points
        OR COALESCE((SELECT totals.lifetime_earned FROM ledger_totals totals
          WHERE totals.brand_id = balances.brand_id AND totals.location_id = balances.location_id
            AND totals.user_id = balances.user_id), 0) <> balances.lifetime_earned
      UNION ALL
      SELECT 'ledger_invalid_or_unowned', entries.id::text
      FROM loyalty_ledger_entries AS entries
      LEFT JOIN loyalty_balances AS balances
        ON balances.brand_id = entries.brand_id AND balances.location_id = entries.location_id
          AND balances.user_id = entries.user_id
      WHERE NULLIF(BTRIM(entries.brand_id), '') IS NULL
        OR NULLIF(BTRIM(entries.location_id), '') IS NULL
        OR NOT EXISTS (
          SELECT 1 FROM catalog_client_locations locations
          INNER JOIN catalog_clients clients
            ON clients.tenant_id = locations.tenant_id AND clients.brand_id = locations.brand_id
          WHERE locations.brand_id = entries.brand_id AND locations.location_id = entries.location_id
        )
        OR balances.user_id IS NULL
        OR entries.type NOT IN ('EARN', 'REDEEM', 'REFUND', 'ADJUSTMENT')
      UNION ALL
      SELECT 'idempotency_invalid_or_unowned', keys.brand_id || ':' || keys.user_id::text || ':' || keys.idempotency_key
      FROM loyalty_idempotency_keys AS keys
      WHERE NULLIF(BTRIM(keys.brand_id), '') IS NULL
        OR NULLIF(BTRIM(keys.location_id), '') IS NULL
        OR NOT EXISTS (
          SELECT 1 FROM catalog_client_locations locations
          INNER JOIN catalog_clients clients
            ON clients.tenant_id = locations.tenant_id AND clients.brand_id = locations.brand_id
          WHERE locations.brand_id = keys.brand_id AND locations.location_id = keys.location_id
        )
        OR jsonb_typeof(keys.response_json) IS DISTINCT FROM 'object'
        OR jsonb_typeof(keys.response_json->'entry') IS DISTINCT FROM 'object'
        OR jsonb_typeof(keys.response_json->'balance') IS DISTINCT FROM 'object'
        OR keys.response_json->'entry'->>'locationId' IS DISTINCT FROM keys.location_id
        OR keys.response_json->'balance'->>'locationId' IS DISTINCT FROM keys.location_id
      UNION ALL
      SELECT 'idempotency_key_collides_across_locations',
        keys.brand_id || ':' || keys.user_id::text || ':' || keys.idempotency_key
      FROM loyalty_idempotency_keys AS keys
      GROUP BY keys.brand_id, keys.user_id, keys.idempotency_key
      HAVING COUNT(*) > 1
      UNION ALL
      SELECT 'merged_balance_exceeds_integer_range', totals.brand_id || ':' || totals.user_id::text
      FROM (
        SELECT brand_id, user_id,
          SUM(available_points)::BIGINT AS available_points,
          SUM(pending_points)::BIGINT AS pending_points,
          SUM(lifetime_earned)::BIGINT AS lifetime_earned
        FROM loyalty_balances GROUP BY brand_id, user_id
      ) AS totals
      WHERE totals.available_points > 2147483647
        OR totals.pending_points > 2147483647
        OR totals.lifetime_earned > 2147483647
    )
    SELECT COUNT(*)::text AS issue_count,
      ARRAY(SELECT reason || '[' || record_id || ']' FROM issues ORDER BY reason, record_id LIMIT 20) AS examples
    FROM issues
  `.execute(db);

  const issueCount = Number(preflight.rows[0]?.issue_count ?? 0);
  if (issueCount > 0) {
    throw new Error(
      `Cannot migrate brand-wide loyalty: ${issueCount} legacy record(s) failed reconciliation; ` +
      `reason and record samples: ${preflight.rows[0]?.examples?.join(", ") ?? "unavailable"}`
    );
  }

  // Earlier migrations supplied Rawaq defaults for these required dimensions.
  // Keep historical migrations reproducible, but remove those defaults from
  // the current schema so new records can only use explicit brand/location.
  await sql`ALTER TABLE loyalty_ledger_entries ALTER COLUMN brand_id DROP DEFAULT`.execute(db);
  await sql`ALTER TABLE loyalty_ledger_entries ALTER COLUMN location_id DROP DEFAULT`.execute(db);
  await sql`ALTER TABLE loyalty_idempotency_keys ALTER COLUMN brand_id DROP DEFAULT`.execute(db);
  await sql`ALTER TABLE loyalty_idempotency_keys ALTER COLUMN location_id DROP DEFAULT`.execute(db);

  await sql`
    CREATE TEMP TABLE loyalty_legacy_program_brands ON COMMIT DROP AS
    SELECT DISTINCT brand_id FROM loyalty_balances
    UNION SELECT DISTINCT brand_id FROM loyalty_ledger_entries
    UNION SELECT DISTINCT brand_id FROM loyalty_idempotency_keys
  `.execute(db);
  await sql`
    CREATE TEMP TABLE loyalty_legacy_program_locations ON COMMIT DROP AS
    SELECT DISTINCT brand_id, location_id FROM loyalty_balances
    UNION SELECT DISTINCT brand_id, location_id FROM loyalty_ledger_entries
    UNION SELECT DISTINCT brand_id, location_id FROM loyalty_idempotency_keys
  `.execute(db);

  await sql`
    ALTER TABLE catalog_client_locations
      ADD CONSTRAINT catalog_client_locations_brand_location_unique UNIQUE (brand_id, location_id)
  `.execute(db);

  await sql`
    CREATE TABLE loyalty_balances_brand_wide (
      brand_id TEXT NOT NULL REFERENCES catalog_clients (brand_id) ON DELETE RESTRICT,
      user_id UUID NOT NULL,
      available_points INTEGER NOT NULL CHECK (available_points >= 0),
      pending_points INTEGER NOT NULL CHECK (pending_points >= 0),
      lifetime_earned INTEGER NOT NULL CHECK (lifetime_earned >= 0),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (brand_id, user_id)
    )
  `.execute(db);

  await sql`
    INSERT INTO loyalty_balances_brand_wide (
      brand_id, user_id, available_points, pending_points, lifetime_earned, updated_at
    )
    SELECT brand_id, user_id, SUM(available_points)::INTEGER, SUM(pending_points)::INTEGER,
      SUM(lifetime_earned)::INTEGER, MAX(updated_at)
    FROM loyalty_balances
    GROUP BY brand_id, user_id
  `.execute(db);

  await sql`DROP TABLE loyalty_balances`.execute(db);
  await sql`ALTER TABLE loyalty_balances_brand_wide RENAME TO loyalty_balances`.execute(db);
  await sql`
    ALTER TABLE loyalty_balances
      RENAME CONSTRAINT loyalty_balances_brand_wide_pkey TO loyalty_balances_pkey
  `.execute(db);
  await sql`
    ALTER TABLE loyalty_balances
      RENAME CONSTRAINT loyalty_balances_brand_wide_brand_id_fkey TO loyalty_balances_brand_id_fkey
  `.execute(db);

  await sql`
    ALTER TABLE loyalty_idempotency_keys DROP CONSTRAINT loyalty_idempotency_keys_pkey
  `.execute(db);
  await sql`
    ALTER TABLE loyalty_idempotency_keys
      ADD CONSTRAINT loyalty_idempotency_keys_pkey PRIMARY KEY (brand_id, user_id, idempotency_key)
  `.execute(db);

  await sql`
    UPDATE loyalty_idempotency_keys
    SET response_json = jsonb_set(
      jsonb_set(
        response_json,
        '{entry}',
        ((response_json->'entry') - 'brandId'::text - 'userId'::text) ||
          jsonb_build_object('brandId', brand_id, 'userId', user_id::text)
      ),
      '{balance}',
        ((response_json->'balance') - 'locationId'::text - 'brandId'::text) || jsonb_build_object('brandId', brand_id)
    )
  `.execute(db);

  await sql`DROP INDEX IF EXISTS loyalty_balances_location_user_idx`.execute(db);
  await sql`DROP INDEX IF EXISTS loyalty_balances_brand_user_idx`.execute(db);
  await sql`CREATE INDEX IF NOT EXISTS loyalty_ledger_entries_brand_user_created_idx
    ON loyalty_ledger_entries (brand_id, user_id, created_at DESC)`.execute(db);
  await sql`CREATE INDEX IF NOT EXISTS loyalty_idempotency_keys_brand_user_idx
    ON loyalty_idempotency_keys (brand_id, user_id)`.execute(db);

  await sql`
    CREATE TABLE loyalty_programs (
      brand_id TEXT PRIMARY KEY REFERENCES catalog_clients (brand_id) ON DELETE RESTRICT,
      enabled BOOLEAN NOT NULL DEFAULT FALSE,
      points_per_dollar INTEGER NOT NULL DEFAULT 1 CHECK (points_per_dollar >= 0),
      redemption_cents_per_point INTEGER NOT NULL DEFAULT 1 CHECK (redemption_cents_per_point > 0),
      minimum_redemption_points INTEGER NOT NULL DEFAULT 1 CHECK (minimum_redemption_points > 0),
      maximum_redemption_percent INTEGER NOT NULL DEFAULT 100 CHECK (maximum_redemption_percent BETWEEN 1 AND 100),
      excluded_item_ids TEXT[] NOT NULL DEFAULT '{}',
      version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `.execute(db);

  await sql`
    CREATE TABLE loyalty_program_locations (
      brand_id TEXT NOT NULL,
      location_id TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (brand_id, location_id),
      FOREIGN KEY (brand_id) REFERENCES loyalty_programs (brand_id) ON DELETE CASCADE,
      FOREIGN KEY (brand_id, location_id)
        REFERENCES catalog_client_locations (brand_id, location_id) ON DELETE CASCADE
    )
  `.execute(db);

  // Preserve the legacy one-point-per-whole-dollar behavior only for brands
  // that already had loyalty data. Brands with no loyalty history remain off
  // until explicitly configured; no merchant is chosen as a default.
  await sql`
    INSERT INTO loyalty_programs (brand_id, enabled)
    SELECT historical.brand_id, TRUE
    FROM loyalty_legacy_program_brands AS historical
    ON CONFLICT (brand_id) DO NOTHING
  `.execute(db);

  await sql`
    INSERT INTO loyalty_program_locations (brand_id, location_id)
    SELECT historical.brand_id, historical.location_id
    FROM loyalty_legacy_program_locations AS historical
    ON CONFLICT (brand_id, location_id) DO NOTHING
  `.execute(db);
}

/**
 * Once points have been merged, assigning that total back to the old store
 * buckets would invent history. Rollback is therefore permitted only while
 * all loyalty data/config remains empty.
 */
export async function down(db: MigrationDb): Promise<void> {
  const data = await sql<{ row_count: string }>`
    SELECT (
      (SELECT COUNT(*) FROM loyalty_balances) +
      (SELECT COUNT(*) FROM loyalty_ledger_entries) +
      (SELECT COUNT(*) FROM loyalty_idempotency_keys) +
      (SELECT COUNT(*) FROM loyalty_programs) +
      (SELECT COUNT(*) FROM loyalty_program_locations)
    )::text AS row_count
  `.execute(db);
  if (Number(data.rows[0]?.row_count ?? 0) > 0) {
    throw new Error("Cannot roll back brand-wide loyalty while loyalty balances, ledger, idempotency, or program data exists");
  }

  await sql`DROP TABLE loyalty_program_locations`.execute(db);
  await sql`DROP TABLE loyalty_programs`.execute(db);
  await sql`DROP INDEX IF EXISTS loyalty_ledger_entries_brand_user_created_idx`.execute(db);
  await sql`DROP INDEX IF EXISTS loyalty_idempotency_keys_brand_user_idx`.execute(db);

  await sql`
    ALTER TABLE loyalty_idempotency_keys DROP CONSTRAINT loyalty_idempotency_keys_pkey
  `.execute(db);
  await sql`
    ALTER TABLE loyalty_idempotency_keys
      ADD CONSTRAINT loyalty_idempotency_keys_pkey PRIMARY KEY (user_id, location_id, idempotency_key)
  `.execute(db);

  // The down migration is allowed only when balances are empty, so the old
  // column can be restored as required without reintroducing a merchant
  // default that would silently assign a location to future rows.
  await sql`ALTER TABLE loyalty_balances ADD COLUMN location_id TEXT NOT NULL`.execute(db);
  await sql`ALTER TABLE loyalty_balances DROP CONSTRAINT loyalty_balances_pkey`.execute(db);
  await sql`ALTER TABLE loyalty_balances DROP CONSTRAINT loyalty_balances_brand_id_fkey`.execute(db);
  await sql`ALTER TABLE loyalty_balances ADD CONSTRAINT loyalty_balances_pkey PRIMARY KEY (user_id, location_id)`.execute(db);
  await sql`
    ALTER TABLE catalog_client_locations DROP CONSTRAINT catalog_client_locations_brand_location_unique
  `.execute(db);
  await sql`CREATE INDEX loyalty_balances_location_user_idx ON loyalty_balances (location_id, user_id)`.execute(db);
  await sql`CREATE INDEX IF NOT EXISTS loyalty_balances_brand_user_idx ON loyalty_balances (brand_id, user_id)`.execute(db);
}
