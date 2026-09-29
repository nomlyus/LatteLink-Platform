import { randomUUID } from "node:crypto";
import { Kysely, PostgresDialect } from "kysely";
import { Pool } from "pg";
import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import { down, up } from "../src/migrations/0059_brand_wide_loyalty.js";

const databaseUrl = process.env.PERSISTENCE_TEST_DATABASE_URL;
const describeWithPostgres = databaseUrl ? describe : describe.skip;

describeWithPostgres("brand-wide loyalty migration (PostgreSQL)", () => {
  const schema = `test_loyalty_brand_wide_${randomUUID().replaceAll("-", "")}`;
  const adminPool = new Pool({ connectionString: databaseUrl });
  const pool = new Pool({ connectionString: databaseUrl, options: `-c search_path=${schema},public` });
  const db = new Kysely<Record<string, never>>({ dialect: new PostgresDialect({ pool }) });
  const userId = "10000000-0000-4000-8000-000000000001";

  beforeEach(async () => {
    await adminPool.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
    await adminPool.query(`CREATE SCHEMA ${schema}`);
    await pool.query(`
      CREATE TABLE catalog_clients (
        tenant_id TEXT PRIMARY KEY,
        brand_id TEXT NOT NULL UNIQUE
      );
      CREATE TABLE catalog_client_locations (
        tenant_id TEXT NOT NULL REFERENCES catalog_clients (tenant_id),
        brand_id TEXT NOT NULL,
        location_id TEXT NOT NULL,
        PRIMARY KEY (tenant_id, location_id)
      );
      INSERT INTO catalog_clients VALUES ('tenant-a', 'brand-a'), ('tenant-b', 'brand-b');
      INSERT INTO catalog_client_locations VALUES
        ('tenant-a', 'brand-a', 'a1'), ('tenant-a', 'brand-a', 'a2'),
        ('tenant-b', 'brand-b', 'b1');

      CREATE TABLE loyalty_balances (
        brand_id TEXT NOT NULL,
        location_id TEXT NOT NULL,
        user_id UUID NOT NULL,
        available_points INTEGER NOT NULL,
        pending_points INTEGER NOT NULL,
        lifetime_earned INTEGER NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        PRIMARY KEY (user_id, location_id)
      );
      CREATE INDEX loyalty_balances_location_user_idx ON loyalty_balances (location_id, user_id);
      CREATE INDEX loyalty_balances_brand_user_idx ON loyalty_balances (brand_id, user_id);

      CREATE TABLE loyalty_ledger_entries (
        id UUID PRIMARY KEY,
        brand_id TEXT NOT NULL,
        location_id TEXT NOT NULL,
        user_id UUID NOT NULL,
        type TEXT NOT NULL,
        points INTEGER NOT NULL,
        order_id UUID,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE TABLE loyalty_idempotency_keys (
        brand_id TEXT NOT NULL,
        location_id TEXT NOT NULL,
        user_id UUID NOT NULL,
        idempotency_key TEXT NOT NULL,
        request_fingerprint TEXT NOT NULL,
        response_json JSONB NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        PRIMARY KEY (user_id, location_id, idempotency_key)
      );
      CREATE INDEX loyalty_idempotency_keys_brand_user_idx ON loyalty_idempotency_keys (brand_id, user_id);
    `);
  });

  afterEach(async () => {
    await adminPool.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
  });

  afterAll(async () => {
    await db.destroy();
    await adminPool.end();
  });

  async function addLegacyLocationBalance(input: {
    brandId: string;
    locationId: string;
    points: number;
    pending?: number;
  }) {
    const orderId = randomUUID();
    const ledgerId = randomUUID();
    const idempotencyKey = `earn:${input.locationId}`;
    await pool.query(`
      INSERT INTO loyalty_balances
        (brand_id, location_id, user_id, available_points, pending_points, lifetime_earned)
      VALUES ($1, $2, $3, $4, $5, $4)
    `, [input.brandId, input.locationId, userId, input.points, input.pending ?? 0]);
    await pool.query(`
      INSERT INTO loyalty_ledger_entries (id, brand_id, location_id, user_id, type, points, order_id)
      VALUES ($1, $2, $3, $4, 'EARN', $5, $6)
    `, [ledgerId, input.brandId, input.locationId, userId, input.points, orderId]);
    await pool.query(`
      INSERT INTO loyalty_idempotency_keys
        (brand_id, location_id, user_id, idempotency_key, request_fingerprint, response_json)
      VALUES ($1, $2, $3, $4, 'fingerprint', $5::jsonb)
    `, [input.brandId, input.locationId, userId, idempotencyKey, JSON.stringify({
        entry: { id: ledgerId, brandId: input.brandId, userId, type: "EARN", points: input.points, orderId, locationId: input.locationId, createdAt: new Date().toISOString() },
        balance: { brandId: input.brandId, userId, locationId: input.locationId, availablePoints: input.points, pendingPoints: input.pending ?? 0, lifetimeEarned: input.points }
      })]);
  }

  async function migrateUp() {
    await db.transaction().execute((transaction) => up(transaction));
  }

  async function migrateDown() {
    await db.transaction().execute((transaction) => down(transaction));
  }

  it("merges balances by brand/customer while preserving ledger locations and idempotency history", async () => {
    await addLegacyLocationBalance({ brandId: "brand-a", locationId: "a1", points: 80, pending: 2 });
    await addLegacyLocationBalance({ brandId: "brand-a", locationId: "a2", points: 30, pending: 3 });
    await addLegacyLocationBalance({ brandId: "brand-b", locationId: "b1", points: 7 });

    await migrateUp();

    const balances = await pool.query<{
      brand_id: string; user_id: string; available_points: number; pending_points: number; lifetime_earned: number;
    }>(`SELECT brand_id, user_id, available_points, pending_points, lifetime_earned FROM loyalty_balances ORDER BY brand_id`);
    expect(balances.rows).toEqual([
      { brand_id: "brand-a", user_id: userId, available_points: 110, pending_points: 5, lifetime_earned: 110 },
      { brand_id: "brand-b", user_id: userId, available_points: 7, pending_points: 0, lifetime_earned: 7 }
    ]);

    const balanceColumns = await pool.query<{ column_name: string }>(`
      SELECT column_name FROM information_schema.columns
      WHERE table_schema = $1 AND table_name = 'loyalty_balances'
    `, [schema]);
    expect(balanceColumns.rows.map((row) => row.column_name)).not.toContain("location_id");

    const ledgerLocations = await pool.query<{ brand_id: string; location_id: string; points: number }>(`
      SELECT brand_id, location_id, points FROM loyalty_ledger_entries ORDER BY brand_id, location_id
    `);
    expect(ledgerLocations.rows).toEqual([
      { brand_id: "brand-a", location_id: "a1", points: 80 },
      { brand_id: "brand-a", location_id: "a2", points: 30 },
      { brand_id: "brand-b", location_id: "b1", points: 7 }
    ]);

    const replay = await pool.query<{ response_json: { balance: Record<string, unknown>; entry: Record<string, unknown> } }>(`
      SELECT response_json FROM loyalty_idempotency_keys WHERE brand_id = 'brand-a' AND location_id = 'a1'
    `);
    expect(replay.rows[0]?.response_json.balance).toMatchObject({ brandId: "brand-a", userId, availablePoints: 80 });
    expect(replay.rows[0]?.response_json.balance).not.toHaveProperty("locationId");
    expect(replay.rows[0]?.response_json.entry).toMatchObject({ brandId: "brand-a", userId, locationId: "a1" });

    await expect(pool.query(`
      INSERT INTO loyalty_balances (brand_id, user_id, available_points, pending_points, lifetime_earned)
      VALUES ('brand-a', $1, 0, 0, 0)
    `, [userId])).rejects.toMatchObject({ code: "23505" });
    const programLocations = await pool.query<{ brand_id: string; location_id: string }>(`
      SELECT brand_id, location_id FROM loyalty_program_locations ORDER BY brand_id, location_id
    `);
    expect(programLocations.rows).toEqual([
      { brand_id: "brand-a", location_id: "a1" },
      { brand_id: "brand-a", location_id: "a2" },
      { brand_id: "brand-b", location_id: "b1" }
    ]);
    await expect(pool.query(`INSERT INTO loyalty_program_locations (brand_id, location_id) VALUES ('brand-a', 'b1')`))
      .rejects.toMatchObject({ code: "23503" });
  });

  it("migrates an empty database and supports up/down/up without adding a default location", async () => {
    await migrateUp();
    const legacyDimensionDefaults = await pool.query<{
      table_name: string; column_name: string; column_default: string | null;
    }>(`
      SELECT table_name, column_name, column_default FROM information_schema.columns
      WHERE table_schema = $1
        AND table_name IN ('loyalty_ledger_entries', 'loyalty_idempotency_keys')
        AND column_name IN ('brand_id', 'location_id')
      ORDER BY table_name, column_name
    `, [schema]);
    expect(legacyDimensionDefaults.rows).toHaveLength(4);
    expect(legacyDimensionDefaults.rows.every((row) => row.column_default === null)).toBe(true);

    await migrateDown();

    const defaults = await pool.query<{ column_default: string | null }>(`
      SELECT column_default FROM information_schema.columns
      WHERE table_schema = $1 AND table_name = 'loyalty_balances' AND column_name = 'location_id'
    `, [schema]);
    expect(defaults.rows[0]?.column_default).toBeNull();
    await migrateUp();
  });

  it("fails closed rather than guessing when the old balance cannot reconcile with its ledger", async () => {
    await addLegacyLocationBalance({ brandId: "brand-a", locationId: "a1", points: 80 });
    await pool.query(`UPDATE loyalty_ledger_entries SET points = 79`);

    await expect(migrateUp()).rejects.toThrow(/Cannot migrate brand-wide loyalty: 1 legacy record.*balance_invalid_or_unowned/);
    const columns = await pool.query<{ column_name: string }>(`
      SELECT column_name FROM information_schema.columns
      WHERE table_schema = $1 AND table_name = 'loyalty_balances'
    `, [schema]);
    expect(columns.rows.map((row) => row.column_name)).toContain("location_id");
  });

  it("refuses an ambiguous idempotency key collision across two locations", async () => {
    await addLegacyLocationBalance({ brandId: "brand-a", locationId: "a1", points: 80 });
    await addLegacyLocationBalance({ brandId: "brand-a", locationId: "a2", points: 30 });
    await pool.query(`UPDATE loyalty_idempotency_keys SET idempotency_key = 'same-key'`);

    await expect(migrateUp()).rejects.toThrow(/idempotency_key_collides_across_locations/);
  });

  it("refuses rollback once brand-wide points or program configuration exists", async () => {
    await addLegacyLocationBalance({ brandId: "brand-a", locationId: "a1", points: 80 });
    await migrateUp();

    await expect(migrateDown()).rejects.toThrow(/Cannot roll back brand-wide loyalty while loyalty balances/);
  });
});
