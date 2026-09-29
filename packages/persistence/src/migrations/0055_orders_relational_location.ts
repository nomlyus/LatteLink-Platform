import { sql, type Kysely } from "kysely";

type MigrationDb = Kysely<Record<string, never>>;

export async function up(db: MigrationDb): Promise<void> {
  await sql`ALTER TABLE orders ADD COLUMN IF NOT EXISTS location_id TEXT`.execute(db);

  const preflight = await sql<{ issue_count: string; examples: string[] | null }>`
    WITH order_issues AS (
      SELECT
        o.order_id::text AS order_id,
        array_remove(ARRAY[
          CASE
            WHEN jsonb_typeof(o.order_json) IS DISTINCT FROM 'object'
              THEN 'order_payload_not_object'::text
          END,
          CASE
            WHEN jsonb_typeof(o.order_json->'locationId') IS DISTINCT FROM 'string'
              THEN 'order_location_not_string'::text
          END,
          CASE
            WHEN NULLIF(BTRIM(o.order_json->>'locationId'), '') IS NULL
              THEN 'missing_or_blank_order_location'::text
          END,
          CASE
            WHEN NOT EXISTS (
              SELECT 1
              FROM catalog_client_locations locations
              WHERE locations.location_id = o.order_json->>'locationId'
            ) THEN 'location_not_in_canonical_registry'::text
          END,
          CASE
            WHEN q.quote_id IS NULL
              OR jsonb_typeof(q.quote_json->'locationId') IS DISTINCT FROM 'string'
              OR q.quote_json->>'locationId' IS DISTINCT FROM o.order_json->>'locationId'
              THEN 'quote_location_mismatch'::text
          END,
          CASE
            WHEN COALESCE(payment_locations.has_mismatch, FALSE)
              THEN 'payment_intent_location_mismatch'::text
          END,
          CASE
            WHEN EXISTS (
              SELECT 1
              FROM discount_code_redemptions redemptions
              WHERE redemptions.order_id = o.order_id
                AND redemptions.location_id IS DISTINCT FROM o.order_json->>'locationId'
            ) THEN 'discount_redemption_location_mismatch'::text
          END,
          CASE
            WHEN EXISTS (
              SELECT 1
              FROM loyalty_ledger_entries entries
              WHERE entries.order_id = o.order_id
                AND entries.location_id IS DISTINCT FROM o.order_json->>'locationId'
            ) THEN 'loyalty_ledger_location_mismatch'::text
          END
        ], NULL::text) AS reasons
      FROM orders o
      LEFT JOIN orders_quotes q ON q.quote_id = o.quote_id
      LEFT JOIN LATERAL (
        SELECT BOOL_OR(pi.location_id IS DISTINCT FROM o.order_json->>'locationId') AS has_mismatch
        FROM payments_stripe_payment_intents pi
        WHERE pi.order_id = o.order_id::text
      ) payment_locations ON TRUE
    ), invalid_orders AS (
      SELECT order_id, reasons
      FROM order_issues
      WHERE cardinality(reasons) > 0
    )
    SELECT
      COUNT(*)::text AS issue_count,
      ARRAY(
        SELECT order_id || '[' || array_to_string(reasons, ',') || ']'
        FROM invalid_orders
        ORDER BY order_id
        LIMIT 20
      ) AS examples
    FROM invalid_orders
  `.execute(db);

  const invalidCount = Number(preflight.rows[0]?.issue_count ?? 0);
  if (invalidCount > 0) {
    const examples = preflight.rows[0]?.examples?.join(", ") ?? "unavailable";
    throw new Error(
      `Cannot backfill orders.location_id: ${invalidCount} order(s) failed validation; ` +
      `order ID and reason samples: ${examples}`
    );
  }

  await sql`
    UPDATE orders
    SET location_id = order_json->>'locationId'
    WHERE location_id IS NULL
  `.execute(db);

  await sql`ALTER TABLE orders ALTER COLUMN location_id SET NOT NULL`.execute(db);
  await sql`
    ALTER TABLE orders
    ADD CONSTRAINT orders_location_id_fkey
    FOREIGN KEY (location_id) REFERENCES catalog_client_locations (location_id)
  `.execute(db);
  await sql`
    ALTER TABLE orders
    ADD CONSTRAINT orders_location_payload_consistency_check
    CHECK (
      jsonb_typeof(order_json) = 'object'
      AND jsonb_typeof(order_json->'locationId') = 'string'
      AND NULLIF(BTRIM(order_json->>'locationId'), '') IS NOT NULL
      AND location_id = order_json->>'locationId'
    )
  `.execute(db);

  await sql`
    CREATE FUNCTION prevent_order_location_change() RETURNS trigger AS $$
    BEGIN
      IF TG_OP = 'INSERT' THEN
        -- Keep older application replicas compatible during a rolling deploy;
        -- new writers supply both columns from the same validated order value.
        IF NEW.location_id IS NULL THEN
          NEW.location_id := NEW.order_json->>'locationId';
        END IF;
        RETURN NEW;
      END IF;

      IF NEW.location_id IS DISTINCT FROM OLD.location_id
        OR NEW.order_json->>'locationId' IS DISTINCT FROM OLD.order_json->>'locationId' THEN
        RAISE EXCEPTION 'Order location is immutable'
          USING ERRCODE = '23514', CONSTRAINT = 'orders_location_immutable_check';
      END IF;
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql
  `.execute(db);

  await sql`
    CREATE TRIGGER orders_location_immutable_trigger
    BEFORE INSERT OR UPDATE ON orders
    FOR EACH ROW EXECUTE FUNCTION prevent_order_location_change()
  `.execute(db);

  await sql`
    CREATE INDEX orders_location_created_at_idx
    ON orders (location_id, created_at DESC)
  `.execute(db);
}

export async function down(db: MigrationDb): Promise<void> {
  await sql`DROP INDEX IF EXISTS orders_location_created_at_idx`.execute(db);
  await sql`DROP TRIGGER IF EXISTS orders_location_immutable_trigger ON orders`.execute(db);
  await sql`DROP FUNCTION IF EXISTS prevent_order_location_change()`.execute(db);
  await sql`ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_location_payload_consistency_check`.execute(db);
  await sql`ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_location_id_fkey`.execute(db);
  await sql`ALTER TABLE orders DROP COLUMN IF EXISTS location_id`.execute(db);
}
