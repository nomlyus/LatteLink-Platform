import { randomUUID } from "node:crypto";
import { Kysely, PostgresDialect } from "kysely";
import { Pool } from "pg";
import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import { down, up } from "../src/migrations/0056_drop_orders_json_location_index.js";

const databaseUrl = process.env.PERSISTENCE_TEST_DATABASE_URL;
const describeWithPostgres = databaseUrl ? describe : describe.skip;

describeWithPostgres("relational reporting location index migration (PostgreSQL)", () => {
  const schema = `test_reporting_rel_location_${randomUUID().replaceAll("-", "")}`;
  const adminPool = new Pool({ connectionString: databaseUrl });
  const migrationPool = new Pool({ connectionString: databaseUrl, options: `-c search_path=${schema},public` });
  const db = new Kysely<Record<string, never>>({ dialect: new PostgresDialect({ pool: migrationPool }) });

  beforeEach(async () => {
    await adminPool.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
    await adminPool.query(`CREATE SCHEMA ${schema}`);
    await migrationPool.query(`
      CREATE TABLE orders (
        order_id UUID PRIMARY KEY,
        location_id TEXT NOT NULL,
        order_json JSONB NOT NULL,
        successful_charge_json JSONB,
        created_at TIMESTAMPTZ NOT NULL
      );
      CREATE INDEX orders_reporting_location_idx ON orders ((order_json ->> 'locationId'));
      CREATE INDEX orders_location_created_at_idx ON orders (location_id, created_at DESC);
      INSERT INTO orders (order_id, location_id, order_json, successful_charge_json, created_at)
      SELECT
        gen_random_uuid(),
        CASE WHEN n % 2 = 0 THEN 'location-a' ELSE 'location-b' END,
        jsonb_build_object('locationId', CASE WHEN n % 2 = 0 THEN 'location-a' ELSE 'location-b' END),
        jsonb_build_object('status', 'SUCCEEDED', 'approved', true, 'occurredAt', '2026-09-22T12:00:00Z'),
        NOW() - make_interval(mins => n)
      FROM generate_series(1, 100) AS n;
    `);
  });

  afterEach(async () => {
    await adminPool.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
  });

  afterAll(async () => {
    await db.destroy();
    await adminPool.end();
  });

  it("drops only the obsolete JSON location index and can roll back cleanly", async () => {
    await up(db);

    const afterUp = await migrationPool.query<{ indexname: string }>(
      `SELECT indexname FROM pg_indexes WHERE schemaname = $1 AND indexname IN ('orders_reporting_location_idx', 'orders_location_created_at_idx') ORDER BY indexname`,
      [schema]
    );
    expect(afterUp.rows.map((row) => row.indexname)).toEqual(["orders_location_created_at_idx"]);

    const planConnection = await migrationPool.connect();
    try {
      await planConnection.query("BEGIN");
      await planConnection.query("SET LOCAL enable_seqscan = off");
      const operationalPlan = await planConnection.query<{ "QUERY PLAN": string }>(
        `EXPLAIN SELECT order_id FROM orders WHERE location_id = 'location-a' ORDER BY created_at DESC LIMIT 15`
      );
      expect(operationalPlan.rows.map((row) => row["QUERY PLAN"]).join("\n")).toContain(
        "orders_location_created_at_idx"
      );
      const reportingPlan = await planConnection.query<{ "QUERY PLAN": string }>(
        `EXPLAIN SELECT order_id FROM orders WHERE location_id = 'location-a' AND (successful_charge_json->>'occurredAt')::timestamptz >= '2026-09-22T00:00:00Z' AND (successful_charge_json->>'occurredAt')::timestamptz < '2026-09-23T00:00:00Z'`
      );
      expect(reportingPlan.rows.map((row) => row["QUERY PLAN"]).join("\n")).toContain(
        "orders_location_created_at_idx"
      );
    } finally {
      await planConnection.query("ROLLBACK");
      planConnection.release();
    }

    await down(db);
    const afterDown = await migrationPool.query<{ indexname: string }>(
      `SELECT indexname FROM pg_indexes WHERE schemaname = $1 AND indexname IN ('orders_reporting_location_idx', 'orders_location_created_at_idx') ORDER BY indexname`,
      [schema]
    );
    expect(afterDown.rows.map((row) => row.indexname)).toEqual([
      "orders_location_created_at_idx",
      "orders_reporting_location_idx"
    ]);

    await up(db);
    const afterUpAgain = await migrationPool.query<{ indexname: string }>(
      `SELECT indexname FROM pg_indexes WHERE schemaname = $1 AND indexname IN ('orders_reporting_location_idx', 'orders_location_created_at_idx') ORDER BY indexname`,
      [schema]
    );
    expect(afterUpAgain.rows.map((row) => row.indexname)).toEqual(["orders_location_created_at_idx"]);
  });
});
