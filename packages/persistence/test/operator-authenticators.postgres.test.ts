import { randomUUID } from "node:crypto";
import { Kysely, PostgresDialect, sql } from "kysely";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { down, up } from "../src/migrations/0045_operator_authenticators.js";

const databaseUrl = process.env.PERSISTENCE_TEST_DATABASE_URL;
const describeWithPostgres = databaseUrl ? describe : describe.skip;

describeWithPostgres("operator authenticator migration (PostgreSQL)", () => {
  const schema = `test_operator_auth_${randomUUID().replaceAll("-", "")}`;
  const adminPool = new Pool({ connectionString: databaseUrl });
  const migrationPool = new Pool({
    connectionString: databaseUrl,
    options: `-c search_path=${schema},public`
  });
  const db = new Kysely<Record<string, never>>({ dialect: new PostgresDialect({ pool: migrationPool }) });

  beforeAll(async () => {
    await adminPool.query(`CREATE SCHEMA ${schema}`);
    await migrationPool.query(`
      CREATE TABLE operator_users (
        operator_user_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        email TEXT NOT NULL UNIQUE,
        google_sub TEXT,
        display_name TEXT NOT NULL,
        password_hash TEXT,
        role TEXT NOT NULL,
        location_id TEXT NOT NULL,
        active BOOLEAN NOT NULL DEFAULT TRUE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
  });

  afterAll(async () => {
    await db.destroy();
    await adminPool.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
    await adminPool.end();
  });

  it("backfills canonical operators, enforces provider uniqueness, and rolls back", async () => {
    const firstOperatorId = randomUUID();
    const secondOperatorId = randomUUID();
    await migrationPool.query(
      `INSERT INTO operator_users
        (operator_user_id, email, google_sub, display_name, password_hash, role, location_id)
       VALUES ($1, $2, $3, $4, $5, 'owner', 'location-a'),
              ($6, $7, NULL, $8, $9, 'manager', 'location-b')`,
      [
        firstOperatorId,
        "owner@example.com",
        "google-owner",
        "Owner",
        "password-hash-owner",
        secondOperatorId,
        "manager@example.com",
        "Manager",
        "password-hash-manager"
      ]
    );

    await up(db);

    const backfilled = await migrationPool.query<{
      operator_user_id: string;
      provider: string;
    }>(`SELECT operator_user_id, provider FROM operator_authenticators ORDER BY provider, operator_user_id`);
    expect(backfilled.rows).toEqual(
      expect.arrayContaining([
        { operator_user_id: firstOperatorId, provider: "google" },
        { operator_user_id: firstOperatorId, provider: "legacy_password" },
        { operator_user_id: secondOperatorId, provider: "legacy_password" }
      ])
    );

    await expect(
      migrationPool.query(
        `INSERT INTO operator_authenticators
          (operator_user_id, kind, provider, issuer, subject, display_name)
         VALUES ($1, 'oauth', 'google', 'https://accounts.google.com', 'google-owner', 'Google')`,
        [secondOperatorId]
      )
    ).rejects.toMatchObject({ code: "23505" });

    const memberships = await migrationPool.query<{ operator_user_id: string; location_id: string; role: string }>(
      `SELECT operator_user_id, location_id, role FROM operator_users ORDER BY operator_user_id`
    );
    expect(memberships.rows).toEqual(
      expect.arrayContaining([
        { operator_user_id: firstOperatorId, location_id: "location-a", role: "owner" },
        { operator_user_id: secondOperatorId, location_id: "location-b", role: "manager" }
      ])
    );

    await down(db);
    const table = await sql<{ table_name: string }>`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = ${schema}
        AND table_name = 'operator_authenticators'
    `.execute(db);
    expect(table.rows).toHaveLength(0);
  });
});
