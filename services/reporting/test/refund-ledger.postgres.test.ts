import { randomUUID } from "node:crypto";
import { createPostgresDb, sql } from "@lattelink/persistence";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { up as addRefundProvenance } from "../../../packages/persistence/src/migrations/0048_stripe_refund_provenance.js";
import { createPostgresReportingRepository } from "../src/repository.js";

const databaseUrl = process.env.PERSISTENCE_TEST_DATABASE_URL;
const describeWithPostgres = databaseUrl ? describe : describe.skip;
const connectionString = databaseUrl ?? "postgres://localhost:1/skipped";

describeWithPostgres("cumulative refund reporting (PostgreSQL)", () => {
  const schema = `test_refund_report_${randomUUID().replaceAll("-", "")}`;
  const adminDb = createPostgresDb(connectionString);
  const schemaUrl = new URL(connectionString);
  schemaUrl.searchParams.set("options", `-c search_path=${schema},public`);
  const db = createPostgresDb(schemaUrl.toString());
  const repository = createPostgresReportingRepository(db);
  const orderId = randomUUID();
  const quoteId = randomUUID();
  const firstRefundId = randomUUID();
  const secondRefundId = randomUUID();
  const bounds = {
    previousStart: "2026-09-21T00:00:00.000Z",
    previousEnd: "2026-09-22T00:00:00.000Z",
    currentStart: "2026-09-22T00:00:00.000Z",
    currentEnd: "2026-09-24T00:00:00.000Z"
  };

  beforeAll(async () => {
    await sql.raw(`CREATE SCHEMA ${schema}`).execute(adminDb);
    await sql.raw(`
      CREATE TABLE payments_charges (
        order_id UUID NOT NULL, payment_id UUID NOT NULL, status TEXT NOT NULL,
        approved BOOLEAN NOT NULL, amount_cents INTEGER NOT NULL, occurred_at TIMESTAMPTZ NOT NULL
      );
      CREATE TABLE orders_quotes (quote_id UUID PRIMARY KEY, quote_json JSONB NOT NULL);
      CREATE TABLE orders (
        order_id UUID PRIMARY KEY, quote_id UUID NOT NULL, order_json JSONB NOT NULL,
        successful_charge_json JSONB, successful_refund_json JSONB
      );
      CREATE TABLE payments_refunds (
        refund_id UUID PRIMARY KEY, order_id UUID NOT NULL, payment_id TEXT NOT NULL,
        idempotency_key TEXT NOT NULL, provider TEXT NOT NULL, status TEXT NOT NULL,
        amount_cents INTEGER NOT NULL, currency TEXT NOT NULL, occurred_at TIMESTAMPTZ NOT NULL,
        message TEXT, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), UNIQUE (order_id, idempotency_key)
      );
    `).execute(db);
    await addRefundProvenance(db as never);
    await sql`INSERT INTO orders_quotes (quote_id, quote_json) VALUES
      (${quoteId}::uuid, ${JSON.stringify({ subtotal: { amountCents: 500 }, discount: { amountCents: 0 }, tax: { amountCents: 0 }, total: { amountCents: 500 } })}::jsonb)`.execute(db);
    await sql`INSERT INTO orders (order_id, quote_id, order_json, successful_refund_json) VALUES (
      ${orderId}::uuid, ${quoteId}::uuid, ${JSON.stringify({ locationId: "loc-refund" })}::jsonb,
      ${JSON.stringify({ refundId: secondRefundId, status: "REFUNDED", amountCents: 500,
        occurredAt: "2026-09-22T12:00:00.000Z", allocation: { merchandiseAmountCents: 400 } })}::jsonb
    )`.execute(db);
    for (const [refundId, amount, key] of [
      [firstRefundId, 200, "provider-1"], [secondRefundId, 300, "provider-2"]
    ] as const) {
      await sql`INSERT INTO payments_refunds (
        refund_id, order_id, payment_id, idempotency_key, provider, status,
        amount_cents, currency, occurred_at, message, source, stripe_account_id, provider_refund_id
      ) VALUES (
        ${refundId}::uuid, ${orderId}::uuid, 'pi_test', ${key}, 'STRIPE', 'REFUNDED',
        ${amount}, 'USD', '2026-09-22T12:00:00Z', 'Stripe refund succeeded',
        'STRIPE_VERIFIED', 'acct_test', ${key}
      )`.execute(db);
    }
  });

  afterAll(async () => {
    await repository.close();
    await sql.raw(`DROP SCHEMA IF EXISTS ${schema} CASCADE`).execute(adminDb);
    await adminDb.destroy();
  });

  it("counts two provider refunds without assigning the cumulative snapshot allocation to either row", async () => {
    const rows = await repository.aggregate({
      locationIds: ["loc-refund"], bounds, timezone: "UTC", granularity: "day"
    });
    expect(rows).toHaveLength(1);
    expect(Number(rows[0]?.refunds)).toBe(500);
    expect(Number(rows[0]?.merchandise_refunds)).toBe(0);
    expect(Number(rows[0]?.unallocatable_refunds)).toBe(2);
  });

  it("uses a snapshot allocation only when it matches the individual provider amount", async () => {
    const snapshot = JSON.stringify({ refundId: secondRefundId, status: "REFUNDED", amountCents: 300,
      occurredAt: "2026-09-22T12:00:00.000Z", allocation: { merchandiseAmountCents: 250 } });
    await sql`UPDATE orders SET successful_refund_json = ${snapshot}::jsonb WHERE order_id = ${orderId}::uuid`.execute(db);
    const rows = await repository.aggregate({
      locationIds: ["loc-refund"], bounds, timezone: "UTC", granularity: "day"
    });
    expect(Number(rows[0]?.refunds)).toBe(500);
    expect(Number(rows[0]?.merchandise_refunds)).toBe(250);
    expect(Number(rows[0]?.unallocatable_refunds)).toBe(1);
  });
});
