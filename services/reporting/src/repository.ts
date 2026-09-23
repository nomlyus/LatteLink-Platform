import { createPostgresDb, runMigrations, sql, type PersistenceDb } from "@lattelink/persistence";

export type ReportingLocation = { locationId: string; locationName: string; timezone: string };
export type ReportingBounds = { currentStart: string; currentEnd: string; previousStart: string; previousEnd: string };
export type ReportingAggregateRow = {
  location_id: string;
  period: "current" | "previous";
  bucket_start: Date | string;
  gross_sales: string | number;
  discounts: string | number;
  tax: string | number;
  collected: string | number;
  refunds: string | number;
  merchandise_refunds: string | number;
  paid_orders: string | number;
  missing_quote_paid_orders: string | number;
  unallocatable_refunds: string | number;
};

export type ReportingBucket = { start: string; end: string };

export type ReportingRepository = {
  close: () => Promise<void>;
  pingDb: () => Promise<void>;
  getLocations: (locationIds: string[]) => Promise<ReportingLocation[]>;
  resolveBounds: (input: { start: string; end: string; timezone: string }) => Promise<ReportingBounds>;
  aggregate: (input: {
    locationIds: string[];
    bounds: ReportingBounds;
    timezone: string;
    granularity: "hour" | "day";
  }) => Promise<ReportingAggregateRow[]>;
  listCurrentBuckets: (input: {
    start: string;
    end: string;
    currentStart: string;
    currentEnd: string;
    timezone: string;
    granularity: "hour" | "day";
  }) => Promise<ReportingBucket[]>;
};

function iso(value: unknown): string {
  return new Date(value as string | Date).toISOString();
}

/** The reporting read model is raw Postgres today; callers never see this implementation detail. */
export async function createReportingRepository(connectionString = process.env.DATABASE_URL): Promise<ReportingRepository> {
  if (!connectionString) {
    throw new Error("DATABASE_URL is required for reporting");
  }
  const db = createPostgresDb(connectionString);
  await runMigrations(db);
  return createPostgresReportingRepository(db);
}

export function createPostgresReportingRepository(db: PersistenceDb): ReportingRepository {
  return {
    async close() { await db.destroy(); },
    async pingDb() { await sql`SELECT 1`.execute(db); },
    async getLocations(locationIds) {
      const rows = await db
        .selectFrom("catalog_client_locations")
        .select(["location_id", "location_name", "timezone"])
        .where("location_id", "in", locationIds)
        .execute();
      return rows.map((row) => ({ locationId: row.location_id, locationName: row.location_name, timezone: row.timezone }));
    },
    async resolveBounds(input) {
      const row = await sql<{ current_start: Date | string; current_end: Date | string; previous_start: Date | string; previous_end: Date | string }>`
        SELECT
          (${input.start}::timestamp AT TIME ZONE ${input.timezone}) AS current_start,
          (${input.end}::timestamp AT TIME ZONE ${input.timezone}) AS current_end,
          ((${input.start}::timestamp - (${input.end}::timestamp - ${input.start}::timestamp)) AT TIME ZONE ${input.timezone}) AS previous_start,
          (${input.start}::timestamp AT TIME ZONE ${input.timezone}) AS previous_end
      `.execute(db);
      const value = row.rows[0];
      if (!value) throw new Error("Could not resolve reporting period");
      return { currentStart: iso(value.current_start), currentEnd: iso(value.current_end), previousStart: iso(value.previous_start), previousEnd: iso(value.previous_end) };
    },
    async aggregate(input) {
      const bucket = input.granularity === "hour"
        ? sql`date_trunc('hour', events.occurred_at)`
        : sql`date_trunc('day', events.occurred_at AT TIME ZONE ${input.timezone}) AT TIME ZONE ${input.timezone}`;
      const rows = await sql<ReportingAggregateRow>`
        WITH charge_candidates AS (
          SELECT order_id, amount_cents, occurred_at, payment_id::text AS payment_key, 0 AS source_rank
          FROM payments_charges
          WHERE status = 'SUCCEEDED'
            AND approved = TRUE
            AND occurred_at >= ${input.bounds.previousStart}::timestamptz
            AND occurred_at < ${input.bounds.currentEnd}::timestamptz
          UNION ALL
          -- Successful payment reconciliation is persisted on the order for
          -- both current checkout channels. Keep it as a fallback until all
          -- payment paths write the attempts table.
          SELECT
            order_id,
            (successful_charge_json ->> 'amountCents')::integer AS amount_cents,
            (successful_charge_json ->> 'occurredAt')::timestamptz AS occurred_at,
            successful_charge_json ->> 'paymentId' AS payment_key,
            1 AS source_rank
          FROM orders
          WHERE successful_charge_json ->> 'status' = 'SUCCEEDED'
            AND COALESCE((successful_charge_json ->> 'approved')::boolean, FALSE) = TRUE
            AND (order_json ->> 'locationId') IN (${sql.join(input.locationIds)})
            AND (successful_charge_json ->> 'occurredAt')::timestamptz >= ${input.bounds.previousStart}::timestamptz
            AND (successful_charge_json ->> 'occurredAt')::timestamptz < ${input.bounds.currentEnd}::timestamptz
        ), canonical_charges AS (
          SELECT DISTINCT ON (order_id) order_id, amount_cents, occurred_at
          FROM charge_candidates
          ORDER BY order_id, source_rank ASC, occurred_at ASC, payment_key ASC
        ), events AS (
          SELECT
            o.order_json ->> 'locationId' AS location_id,
            c.occurred_at,
            CASE WHEN q.quote_id IS NULL THEN NULL ELSE (q.quote_json -> 'subtotal' ->> 'amountCents')::bigint END AS gross_sales,
            CASE WHEN q.quote_id IS NULL THEN NULL ELSE (q.quote_json -> 'discount' ->> 'amountCents')::bigint END AS discounts,
            CASE WHEN q.quote_id IS NULL THEN NULL ELSE (q.quote_json -> 'tax' ->> 'amountCents')::bigint END AS tax,
            c.amount_cents::bigint AS collected,
            0::bigint AS refunds,
            0::bigint AS merchandise_refunds,
            1::bigint AS paid_orders,
            CASE WHEN q.quote_id IS NULL THEN 1::bigint ELSE 0::bigint END AS missing_quote_paid_orders,
            0::bigint AS unallocatable_refunds
          FROM canonical_charges c
          JOIN orders o ON o.order_id = c.order_id
          LEFT JOIN orders_quotes q ON q.quote_id = o.quote_id
          WHERE (o.order_json ->> 'locationId') IN (${sql.join(input.locationIds)})
          UNION ALL
          SELECT
            o.order_json ->> 'locationId' AS location_id,
            r.occurred_at,
            0::bigint, 0::bigint, 0::bigint, 0::bigint,
            r.amount_cents::bigint AS refunds,
            CASE
              WHEN (r.allocation_json ->> 'merchandiseAmountCents') ~ '^[0-9]+$'
              THEN (r.allocation_json ->> 'merchandiseAmountCents')::bigint
              WHEN o.successful_refund_json ->> 'refundId' = r.refund_id::text
                AND (o.successful_refund_json -> 'allocation' ->> 'merchandiseAmountCents') ~ '^[0-9]+$'
              THEN (o.successful_refund_json -> 'allocation' ->> 'merchandiseAmountCents')::bigint
              WHEN q.quote_id IS NOT NULL
                AND r.amount_cents = (q.quote_json -> 'total' ->> 'amountCents')::integer
              THEN ((q.quote_json -> 'subtotal' ->> 'amountCents')::bigint - (q.quote_json -> 'discount' ->> 'amountCents')::bigint)
              ELSE 0::bigint
            END AS merchandise_refunds,
            0::bigint, 0::bigint,
            CASE
              WHEN (r.allocation_json ->> 'merchandiseAmountCents') ~ '^[0-9]+$'
              THEN 0::bigint
              WHEN o.successful_refund_json ->> 'refundId' = r.refund_id::text
                AND (o.successful_refund_json -> 'allocation' ->> 'merchandiseAmountCents') ~ '^[0-9]+$'
              THEN 0::bigint
              WHEN q.quote_id IS NULL
                OR r.amount_cents <> (q.quote_json -> 'total' ->> 'amountCents')::integer
              THEN 1::bigint ELSE 0::bigint
            END AS unallocatable_refunds
          FROM payments_refunds r
          JOIN orders o ON o.order_id = r.order_id
          LEFT JOIN orders_quotes q ON q.quote_id = o.quote_id
          WHERE r.status = 'REFUNDED'
            AND r.source <> 'LEGACY_SIMULATED'
            AND r.occurred_at >= ${input.bounds.previousStart}::timestamptz
            AND r.occurred_at < ${input.bounds.currentEnd}::timestamptz
            AND (o.order_json ->> 'locationId') IN (${sql.join(input.locationIds)})
          UNION ALL
          -- Webhook reconciliation also stores a successful-refund snapshot on
          -- an order. Use it only when the normalized refund table has no row
          -- for that order, so real multiple/partial refund rows remain intact.
          SELECT
            o.order_json ->> 'locationId' AS location_id,
            (o.successful_refund_json ->> 'occurredAt')::timestamptz AS occurred_at,
            0::bigint, 0::bigint, 0::bigint, 0::bigint,
            (o.successful_refund_json ->> 'amountCents')::bigint AS refunds,
            CASE
              WHEN (o.successful_refund_json -> 'allocation' ->> 'merchandiseAmountCents') ~ '^[0-9]+$'
              THEN (o.successful_refund_json -> 'allocation' ->> 'merchandiseAmountCents')::bigint
              WHEN q.quote_id IS NOT NULL
                AND (o.successful_refund_json ->> 'amountCents')::integer = (q.quote_json -> 'total' ->> 'amountCents')::integer
              THEN ((q.quote_json -> 'subtotal' ->> 'amountCents')::bigint - (q.quote_json -> 'discount' ->> 'amountCents')::bigint)
              ELSE 0::bigint
            END AS merchandise_refunds,
            0::bigint, 0::bigint,
            CASE
              WHEN (o.successful_refund_json -> 'allocation' ->> 'merchandiseAmountCents') ~ '^[0-9]+$'
              THEN 0::bigint
              WHEN q.quote_id IS NULL
                OR (o.successful_refund_json ->> 'amountCents')::integer <> (q.quote_json -> 'total' ->> 'amountCents')::integer
              THEN 1::bigint ELSE 0::bigint
            END AS unallocatable_refunds
          FROM orders o
          LEFT JOIN orders_quotes q ON q.quote_id = o.quote_id
          WHERE o.successful_refund_json ->> 'status' = 'REFUNDED'
            AND (o.successful_refund_json ->> 'occurredAt')::timestamptz >= ${input.bounds.previousStart}::timestamptz
            AND (o.successful_refund_json ->> 'occurredAt')::timestamptz < ${input.bounds.currentEnd}::timestamptz
            AND (o.order_json ->> 'locationId') IN (${sql.join(input.locationIds)})
            AND NOT EXISTS (
              SELECT 1 FROM payments_refunds r
              WHERE r.order_id = o.order_id AND r.status = 'REFUNDED'
            )
        )
        SELECT
          location_id,
          CASE WHEN occurred_at >= ${input.bounds.currentStart}::timestamptz THEN 'current' ELSE 'previous' END AS period,
          ${bucket} AS bucket_start,
          SUM(COALESCE(gross_sales, 0))::bigint AS gross_sales,
          SUM(COALESCE(discounts, 0))::bigint AS discounts,
          SUM(COALESCE(tax, 0))::bigint AS tax,
          SUM(collected)::bigint AS collected,
          SUM(refunds)::bigint AS refunds,
          SUM(merchandise_refunds)::bigint AS merchandise_refunds,
          SUM(paid_orders)::bigint AS paid_orders,
          SUM(missing_quote_paid_orders)::bigint AS missing_quote_paid_orders,
          SUM(unallocatable_refunds)::bigint AS unallocatable_refunds
        FROM events
        GROUP BY location_id, period, ${bucket}
        ORDER BY bucket_start ASC, location_id ASC
      `.execute(db);
      return rows.rows;
    },
    async listCurrentBuckets(input) {
      if (input.granularity === "hour") {
        const result = await sql<{ start: Date | string; end: Date | string }>`
          SELECT value AS start, value + interval '1 hour' AS end
          FROM generate_series(
            ${input.currentStart}::timestamptz,
            ${input.currentEnd}::timestamptz - interval '1 hour',
            interval '1 hour'
          ) AS value
        `.execute(db);
        return result.rows.map((row) => ({ start: iso(row.start), end: iso(row.end) }));
      }
      const result = await sql<{ start: Date | string; end: Date | string }>`
        SELECT
          (value AT TIME ZONE ${input.timezone}) AS start,
          ((value + interval '1 day') AT TIME ZONE ${input.timezone}) AS end
        FROM generate_series(
          ${input.start}::timestamp,
          ${input.end}::timestamp - interval '1 day',
          interval '1 day'
        ) AS value
      `.execute(db);
      return result.rows.map((row) => ({ start: iso(row.start), end: iso(row.end) }));
    }
  };
}
