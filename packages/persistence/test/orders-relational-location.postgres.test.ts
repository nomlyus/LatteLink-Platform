import { randomUUID } from "node:crypto";
import { Kysely, PostgresDialect } from "kysely";
import { Pool } from "pg";
import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import { up } from "../src/migrations/0055_orders_relational_location.js";

const databaseUrl = process.env.PERSISTENCE_TEST_DATABASE_URL;
const describeWithPostgres = databaseUrl ? describe : describe.skip;

describeWithPostgres("orders relational location migration (PostgreSQL)", () => {
  const schema = `test_orders_location_${randomUUID().replaceAll("-", "")}`;
  const adminPool = new Pool({ connectionString: databaseUrl });
  const migrationPool = new Pool({ connectionString: databaseUrl, options: `-c search_path=${schema},public` });
  const db = new Kysely<Record<string, never>>({ dialect: new PostgresDialect({ pool: migrationPool }) });

  beforeEach(async () => {
    await adminPool.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
    await adminPool.query(`CREATE SCHEMA ${schema}`);
    await migrationPool.query(`
      CREATE TABLE catalog_client_locations (location_id TEXT PRIMARY KEY);
      INSERT INTO catalog_client_locations VALUES ('location-a'), ('location-b');
      CREATE TABLE orders_quotes (
        quote_id UUID PRIMARY KEY,
        quote_json JSONB NOT NULL
      );
      CREATE TABLE orders (
        order_id UUID PRIMARY KEY,
        quote_id UUID NOT NULL REFERENCES orders_quotes (quote_id),
        order_json JSONB NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE TABLE payments_stripe_payment_intents (
        payment_intent_id TEXT PRIMARY KEY,
        order_id TEXT NOT NULL,
        location_id TEXT NOT NULL
      );
      CREATE TABLE discount_code_redemptions (
        redemption_id UUID PRIMARY KEY,
        order_id UUID NOT NULL,
        location_id TEXT NOT NULL
      );
      CREATE TABLE loyalty_ledger_entries (
        id UUID PRIMARY KEY,
        order_id UUID,
        location_id TEXT NOT NULL
      );
    `);
  });

  afterEach(async () => {
    await adminPool.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
  });

  afterAll(async () => {
    await db.destroy();
    await adminPool.end();
  });

  async function insertOrder(input: {
    locationId?: unknown;
    quoteLocationId?: string;
    paymentLocationId?: string;
    discountLocationId?: string;
    loyaltyLocationId?: string;
    payload?: unknown;
  } = {}) {
    const orderId = randomUUID();
    const quoteId = randomUUID();
    await migrationPool.query(`INSERT INTO orders_quotes (quote_id, quote_json) VALUES ($1, $2::jsonb)`, [
      quoteId,
      JSON.stringify({ locationId: input.quoteLocationId ?? "location-a" })
    ]);
    const orderPayload = Object.hasOwn(input, "payload")
      ? input.payload
      : Object.hasOwn(input, "locationId")
        ? { locationId: input.locationId, status: "PAID" }
        : { locationId: "location-a", status: "PAID" };
    await migrationPool.query(`INSERT INTO orders (order_id, quote_id, order_json) VALUES ($1, $2, $3::jsonb)`, [
      orderId,
      quoteId,
      JSON.stringify(orderPayload)
    ]);
    if (input.paymentLocationId) {
      await migrationPool.query(
        `INSERT INTO payments_stripe_payment_intents (payment_intent_id, order_id, location_id) VALUES ($1, $2, $3)`,
        [`pi_${orderId}`, orderId, input.paymentLocationId]
      );
    }
    if (input.discountLocationId) {
      await migrationPool.query(
        `INSERT INTO discount_code_redemptions (redemption_id, order_id, location_id) VALUES ($1, $2, $3)`,
        [randomUUID(), orderId, input.discountLocationId]
      );
    }
    if (input.loyaltyLocationId) {
      await migrationPool.query(
        `INSERT INTO loyalty_ledger_entries (id, order_id, location_id) VALUES ($1, $2, $3)`,
        [randomUUID(), orderId, input.loyaltyLocationId]
      );
    }
    return orderId;
  }

  it("backfills valid orders, enforces matching required immutable locations, and adds the operational index", async () => {
    const orderId = await insertOrder({ paymentLocationId: "location-a" });

    await up(db);

    const row = await migrationPool.query<{ location_id: string; payload_location: string }>(
      `SELECT location_id, order_json->>'locationId' AS payload_location FROM orders WHERE order_id = $1`,
      [orderId]
    );
    expect(row.rows).toEqual([{ location_id: "location-a", payload_location: "location-a" }]);

    await expect(migrationPool.query(
      `UPDATE orders SET order_json = jsonb_set(order_json, '{locationId}', '"location-b"') WHERE order_id = $1`,
      [orderId]
    )).rejects.toThrow(/immutable/i);
    await expect(migrationPool.query(
      `UPDATE orders SET location_id = 'location-b', order_json = jsonb_set(order_json, '{locationId}', '"location-b"') WHERE order_id = $1`,
      [orderId]
    )).rejects.toThrow(/immutable/i);
    await expect(migrationPool.query(
      `INSERT INTO orders (order_id, quote_id, order_json) SELECT $1, quote_id, '{}'::jsonb FROM orders WHERE order_id = $2`,
      [randomUUID(), orderId]
    )).rejects.toThrow(/location_id/i);
    await expect(migrationPool.query(
      `INSERT INTO orders (order_id, quote_id, location_id, order_json) SELECT $1, quote_id, 'location-b', order_json FROM orders WHERE order_id = $2`,
      [randomUUID(), orderId]
    )).rejects.toThrow(/orders_location_payload_consistency_check/i);
    await expect(migrationPool.query(
      `INSERT INTO orders (order_id, quote_id, location_id, order_json) SELECT $1, quote_id, 'location-unknown', jsonb_set(order_json, '{locationId}', '"location-unknown"') FROM orders WHERE order_id = $2`,
      [randomUUID(), orderId]
    )).rejects.toThrow(/orders_location_id_fkey/i);

    await migrationPool.query(
      `UPDATE orders SET order_json = jsonb_set(order_json, '{status}', '"CANCELED"') WHERE order_id = $1`,
      [orderId]
    );
    const legacyWriterOrderId = randomUUID();
    await migrationPool.query(
      `INSERT INTO orders (order_id, quote_id, order_json) SELECT $1, quote_id, order_json FROM orders WHERE order_id = $2`,
      [legacyWriterOrderId, orderId]
    );
    const legacyWriterRow = await migrationPool.query<{ location_id: string }>(
      `SELECT location_id FROM orders WHERE order_id = $1`,
      [legacyWriterOrderId]
    );
    expect(legacyWriterRow.rows).toEqual([{ location_id: "location-a" }]);
    const indexes = await migrationPool.query<{ indexname: string }>(
      `SELECT indexname FROM pg_indexes WHERE schemaname = $1 AND indexname = 'orders_location_created_at_idx'`,
      [schema]
    );
    expect(indexes.rows).toHaveLength(1);
  });

  it.each([
    { label: "missing location", input: { locationId: undefined }, reason: "missing_or_blank_order_location" },
    { label: "blank location", input: { locationId: "  " }, reason: "missing_or_blank_order_location" },
    { label: "non-string location", input: { locationId: 42 }, reason: "order_location_not_string" },
    { label: "non-object order payload", input: { payload: [] }, reason: "order_payload_not_object" },
    { label: "unknown canonical location", input: { locationId: "location-unknown" }, reason: "location_not_in_canonical_registry" },
    { label: "quote disagreement", input: { quoteLocationId: "location-b" }, reason: "quote_location_mismatch" },
    { label: "payment disagreement", input: { paymentLocationId: "location-b" }, reason: "payment_intent_location_mismatch" },
    { label: "discount redemption disagreement", input: { discountLocationId: "location-b" }, reason: "discount_redemption_location_mismatch" },
    { label: "loyalty ledger disagreement", input: { loyaltyLocationId: "location-b" }, reason: "loyalty_ledger_location_mismatch" }
  ])("fails preflight with safe diagnostics for $label", async ({ input, reason }) => {
    const orderId = await insertOrder(input);
    await expect(up(db)).rejects.toThrow(new RegExp(`${orderId}.*${reason}`));
  });

  it("migrates a database with no orders", async () => {
    await expect(up(db)).resolves.toBeUndefined();
    const column = await migrationPool.query<{ is_nullable: string }>(
      `SELECT is_nullable FROM information_schema.columns WHERE table_schema = $1 AND table_name = 'orders' AND column_name = 'location_id'`,
      [schema]
    );
    expect(column.rows).toEqual([{ is_nullable: "NO" }]);
  });
});
