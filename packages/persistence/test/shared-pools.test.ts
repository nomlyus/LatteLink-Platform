import { afterEach, describe, expect, it, vi } from "vitest";
import { Pool } from "pg";
import {
  createPostgresDb,
  getPersistenceReadinessMetadata,
  sql
} from "../src/index.js";

const databaseUrl = "postgres://test:secret@127.0.0.1:1/nomly_pool_test";
const savedEnv = { ...process.env };

afterEach(() => {
  process.env = { ...savedEnv };
  vi.restoreAllMocks();
});

describe("dev backend shared pools", () => {
  it("shares the general pool, isolates critical and reconciler work, and ref-counts shutdown", async () => {
    Object.assign(process.env, {
      DEPLOY_ENV: "dev",
      DATABASE_URL: databaseUrl,
      POSTGRES_SHARED_POOL_ENABLED: "true",
      POSTGRES_SHARED_GENERAL_POOL_MAX: "4",
      POSTGRES_SHARED_CRITICAL_POOL_MAX: "4",
      POSTGRES_SHARED_RECONCILER_POOL_MAX: "1"
    });
    const acquiredFrom: Pool[] = [];
    vi.spyOn(Pool.prototype, "connect").mockImplementation(async function (this: Pool) {
      acquiredFrom.push(this);
      return {
        processID: 1,
        query: async () => ({ command: "SELECT", rowCount: 1, rows: [{ value: 1 }] }),
        release: () => undefined
      } as never;
    });

    const generalA = createPostgresDb(databaseUrl);
    const generalB = createPostgresDb(databaseUrl);
    const critical = createPostgresDb(databaseUrl, "critical");
    const reconciler = createPostgresDb(databaseUrl, "reconciler");
    try {
      await sql`SELECT 1`.execute(generalA);
      await sql`SELECT 1`.execute(generalB);
      await sql`SELECT 1`.execute(critical);
      await sql`SELECT 1`.execute(reconciler);

      expect(acquiredFrom[0]).toBe(acquiredFrom[1]);
      expect(acquiredFrom[2]).not.toBe(acquiredFrom[0]);
      expect(acquiredFrom[3]).not.toBe(acquiredFrom[2]);
      expect(getPersistenceReadinessMetadata(process.env).database.pool).toMatchObject({
        group: "general", shared: true, max: 4
      });
      expect(getPersistenceReadinessMetadata(process.env, "reconciler").database.pool).toMatchObject({
        group: "reconciler", shared: true, max: 1
      });

      await generalA.destroy();
      await sql`SELECT 1`.execute(generalB);
      expect(acquiredFrom[4]).toBe(acquiredFrom[0]);
    } finally {
      await Promise.all([generalA.destroy(), generalB.destroy(), critical.destroy(), reconciler.destroy()]);
    }
  });

  it("never enables pool sharing in production even if the flag is set", () => {
    Object.assign(process.env, { DEPLOY_ENV: "production", POSTGRES_SHARED_POOL_ENABLED: "true" });
    expect(getPersistenceReadinessMetadata({ ...process.env, DATABASE_URL: databaseUrl }).database.pool).not.toHaveProperty("shared");
  });
});
