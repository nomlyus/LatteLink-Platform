import { randomUUID } from "node:crypto";
import { Kysely, PostgresDialect } from "kysely";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { down, up } from "../src/migrations/0058_drop_catalog_store_name_default.js";

const databaseUrl = process.env.PERSISTENCE_TEST_DATABASE_URL;
const describeWithPostgres = databaseUrl ? describe : describe.skip;

describeWithPostgres("catalog store-name default hardening (PostgreSQL)", () => {
  const schema = `test_catalog_store_name_${randomUUID().replaceAll("-", "")}`;
  const adminPool = new Pool({ connectionString: databaseUrl });
  const migrationPool = new Pool({ connectionString: databaseUrl, options: `-c search_path=${schema},public` });
  const db = new Kysely<Record<string, never>>({ dialect: new PostgresDialect({ pool: migrationPool }) });

  beforeAll(async () => {
    await adminPool.query(`CREATE SCHEMA ${schema}`);
    await migrationPool.query(`
      CREATE TABLE catalog_store_configs (
        location_id TEXT PRIMARY KEY,
        store_name TEXT NOT NULL DEFAULT 'Rawaq Coffee Flagship'
      );
      INSERT INTO catalog_store_configs (location_id) VALUES ('existing-location');
    `);
  });

  afterAll(async () => {
    await db.destroy();
    await adminPool.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
    await adminPool.end();
  });

  it("preserves existing store names and prevents new rows from inheriting the legacy name", async () => {
    await up(db);
    const existing = await migrationPool.query<{ store_name: string }>(
      `SELECT store_name FROM catalog_store_configs WHERE location_id = 'existing-location'`
    );
    expect(existing.rows).toEqual([{ store_name: "Rawaq Coffee Flagship" }]);

    const defaultValue = await migrationPool.query<{ column_default: string | null }>(`
      SELECT column_default FROM information_schema.columns
      WHERE table_schema = $1 AND table_name = 'catalog_store_configs' AND column_name = 'store_name'
    `, [schema]);
    expect(defaultValue.rows[0]?.column_default).toBeNull();
    await expect(migrationPool.query(
      `INSERT INTO catalog_store_configs (location_id) VALUES ('new-location')`
    )).rejects.toMatchObject({ code: "23502" });

    await down(db);
    const afterRollback = await migrationPool.query<{ column_default: string | null }>(`
      SELECT column_default FROM information_schema.columns
      WHERE table_schema = $1 AND table_name = 'catalog_store_configs' AND column_name = 'store_name'
    `, [schema]);
    expect(afterRollback.rows[0]?.column_default).toBeNull();
  });
});
