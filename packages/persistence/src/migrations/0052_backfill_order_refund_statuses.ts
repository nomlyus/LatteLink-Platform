import { sql, type Kysely } from "kysely";

type MigrationDb = Kysely<Record<string, never>>;

/** Backfills the persisted order lifecycle without touching payment/refund ledgers. */
export async function up(db: MigrationDb): Promise<void> {
  await sql`
    WITH normalized AS (
      SELECT order_id, SUM(amount_cents)::integer AS refunded_cents
      FROM payments_refunds
      WHERE status = 'REFUNDED'
      GROUP BY order_id
    ), candidates AS (
      SELECT
        o.order_id,
        (o.order_json -> 'total' ->> 'amountCents')::integer AS total_cents,
        COALESCE(n.refunded_cents, CASE
          WHEN n.order_id IS NULL AND o.successful_refund_json ->> 'status' = 'REFUNDED'
            THEN (o.successful_refund_json ->> 'amountCents')::integer
          ELSE 0
        END) AS refunded_cents
      FROM orders o
      LEFT JOIN normalized n ON n.order_id = o.order_id
      WHERE o.order_json ->> 'status' = 'COMPLETED'
    )
    UPDATE orders o
    SET order_json = jsonb_set(
      o.order_json,
      '{status}',
      to_jsonb(CASE
        WHEN c.refunded_cents >= c.total_cents THEN 'REFUNDED'
        WHEN c.refunded_cents > 0 THEN 'PARTIALLY_REFUNDED'
        ELSE o.order_json ->> 'status'
      END),
      true
    ),
    updated_at = NOW()
    FROM candidates c
    WHERE o.order_id = c.order_id
      AND c.refunded_cents > 0
  `.execute(db);
}

export async function down(db: MigrationDb): Promise<void> {
  void db;
}
