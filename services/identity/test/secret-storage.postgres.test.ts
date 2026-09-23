import { randomBytes, randomUUID } from "node:crypto";
import type { FastifyBaseLogger } from "fastify";
import { createPostgresDb, sql } from "@lattelink/persistence";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { backfillIdentitySecretStorageBatch } from "../src/backfill-secret-storage.js";
import {
  createAppleRefreshTokenCipher,
  digestSessionToken,
} from "../src/secret-storage.js";
import {
  createIdentityRepository,
  type IdentityRepository,
} from "../src/repository.js";

const configuredUrl = process.env.IDENTITY_SECRET_TEST_DATABASE_URL;
const databaseUrl =
  configuredUrl ??
  "postgres://test:test@127.0.0.1:1/identity_secret_test_skipped";
const localHosts = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);
if (configuredUrl) {
  const hostname = new URL(configuredUrl).hostname;
  if (!localHosts.has(hostname)) {
    throw new Error(
      "IDENTITY_SECRET_TEST_DATABASE_URL must target a disposable loopback PostgreSQL instance",
    );
  }
}
const describeWithLocalPostgres = configuredUrl ? describe : describe.skip;
const apiRoleNames = ["anon", "authenticated", "service_role"] as const;
const defaultAclOwnerNames = ["postgres", "supabase_admin"] as const;
const tablesRequiringRowLevelSecurity = [
  "payments_stripe_payment_intents",
  "audit_log",
  "catalog_clients",
  "discount_codes",
  "discount_code_redemptions",
  "catalog_client_locations",
  "catalog_onboarding_progress",
  "operator_owner_invites",
  "order_checkout_drafts",
  "catalog_mobile_experience_drafts",
  "catalog_mobile_experience_versions",
  "catalog_app_identity_profiles",
  "catalog_mobile_release_profiles",
  "catalog_mobile_release_build_jobs",
] as const;

describeWithLocalPostgres(
  "identity secret storage (disposable local PostgreSQL)",
  () => {
    const schema = `identity_secret_storage_${randomUUID().replaceAll("-", "")}`;
    const keyRing = {
      old: randomBytes(32).toString("base64"),
      active: randomBytes(32).toString("base64"),
    };
    const cipher = createAppleRefreshTokenCipher(
      JSON.stringify(keyRing),
      "active",
    );
    const adminDb = createPostgresDb(databaseUrl);
    const scopedUrl = new URL(databaseUrl);
    scopedUrl.searchParams.set("options", `-c search_path=${schema},public`);
    const scopedDatabaseUrl = scopedUrl.toString();
    const inspectDb = createPostgresDb(scopedDatabaseUrl);
    let repository: IdentityRepository | undefined;
    const createdRoles: string[] = [];

    beforeAll(async () => {
      vi.stubEnv("DATABASE_URL", scopedDatabaseUrl);
      vi.stubEnv("EXPECTED_SUPABASE_PROJECT_REF", "");
      vi.stubEnv("NODE_ENV", "production");
      vi.stubEnv("DEPLOY_ENV", "test");
      vi.stubEnv("POSTGRES_SHARED_POOL_ENABLED", "false");
      vi.stubEnv(
        "IDENTITY_APPLE_TOKEN_ENCRYPTION_KEYS",
        JSON.stringify(keyRing),
      );
      vi.stubEnv("IDENTITY_APPLE_TOKEN_ENCRYPTION_ACTIVE_KEY_ID", "active");
      vi.stubEnv("IDENTITY_ALLOW_LEGACY_SECRETS", "");

      vi.spyOn(console, "info").mockImplementation(() => undefined);
      await sql.raw(`CREATE SCHEMA "${schema}"`).execute(adminDb);

      for (const role of [...apiRoleNames, ...defaultAclOwnerNames]) {
        const existingRole = await sql<{ exists: boolean }>`
          SELECT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = ${role}) AS exists
        `.execute(adminDb);
        if (!existingRole.rows[0]?.exists) {
          await sql.raw(`CREATE ROLE "${role}" NOLOGIN`).execute(adminDb);
          createdRoles.push(role);
        }
      }

      await sql
        .raw(
          `GRANT USAGE, CREATE ON SCHEMA "${schema}" TO PUBLIC, anon, authenticated, service_role`,
        )
        .execute(adminDb);

      for (const owner of defaultAclOwnerNames) {
        await sql.raw(`
          ALTER DEFAULT PRIVILEGES FOR ROLE "${owner}" IN SCHEMA "${schema}"
            GRANT ALL PRIVILEGES ON TABLES TO anon, authenticated, service_role;
          ALTER DEFAULT PRIVILEGES FOR ROLE "${owner}" IN SCHEMA "${schema}"
            GRANT ALL PRIVILEGES ON SEQUENCES TO anon, authenticated, service_role;
          ALTER DEFAULT PRIVILEGES FOR ROLE "${owner}" IN SCHEMA "${schema}"
            GRANT EXECUTE ON FUNCTIONS TO PUBLIC, anon, authenticated, service_role;
        `).execute(adminDb);
      }

      repository = await createIdentityRepository({
        info: () => undefined,
        error: () => undefined,
      } as unknown as FastifyBaseLogger);
      expect(repository.backend).toBe("postgres");
    }, 60_000);

    afterAll(async () => {
      await repository?.close();
      await inspectDb.destroy();
      await sql
        .raw(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`)
        .execute(adminDb);
      for (const role of createdRoles.reverse()) {
        await sql.raw(`DROP ROLE IF EXISTS "${role}"`).execute(adminDb);
      }
      await adminDb.destroy();
      vi.restoreAllMocks();
      vi.unstubAllEnvs();
    }, 60_000);

    it("denies Supabase Data API roles on current and future objects in the migration schema", async () => {
      const protectedTables = await sql<{
        table_name: string;
        rls_enabled: boolean;
        policy_count: number;
        anon_can_select: boolean;
        authenticated_can_select: boolean;
        service_role_can_select: boolean;
        anon_has_schema_usage: boolean;
        authenticated_has_schema_usage: boolean;
        service_role_has_schema_usage: boolean;
        anon_can_truncate: boolean;
        authenticated_can_truncate: boolean;
        service_role_can_truncate: boolean;
      }>`
        SELECT
          c.relname AS table_name,
          c.relrowsecurity AS rls_enabled,
          (SELECT count(*)::integer FROM pg_policy WHERE polrelid = c.oid) AS policy_count,
          has_table_privilege('anon', c.oid, 'SELECT') AS anon_can_select,
          has_table_privilege('authenticated', c.oid, 'SELECT') AS authenticated_can_select,
          has_table_privilege('service_role', c.oid, 'SELECT') AS service_role_can_select,
          has_schema_privilege('anon', n.oid, 'USAGE') AS anon_has_schema_usage,
          has_schema_privilege('authenticated', n.oid, 'USAGE') AS authenticated_has_schema_usage,
          has_schema_privilege('service_role', n.oid, 'USAGE') AS service_role_has_schema_usage,
          has_table_privilege('anon', c.oid, 'TRUNCATE') AS anon_can_truncate,
          has_table_privilege('authenticated', c.oid, 'TRUNCATE') AS authenticated_can_truncate,
          has_table_privilege('service_role', c.oid, 'TRUNCATE') AS service_role_can_truncate
        FROM pg_class AS c
        JOIN pg_namespace AS n ON n.oid = c.relnamespace
        WHERE n.nspname = ${schema}
          AND c.relname = ANY(${[...tablesRequiringRowLevelSecurity]}::text[])
          AND c.relkind IN ('r', 'p')
        ORDER BY c.relname
      `.execute(inspectDb);

      expect(protectedTables.rows).toHaveLength(
        tablesRequiringRowLevelSecurity.length,
      );
      for (const table of protectedTables.rows) {
        expect(table).toMatchObject({
          rls_enabled: true,
          policy_count: 0,
          anon_can_select: false,
          authenticated_can_select: false,
          service_role_can_select: false,
          anon_has_schema_usage: false,
          authenticated_has_schema_usage: false,
          service_role_has_schema_usage: false,
          anon_can_truncate: false,
          authenticated_can_truncate: false,
          service_role_can_truncate: false,
        });
      }

      await sql
        .raw(`CREATE TABLE "${schema}".api_default_table_probe (id integer)`)
        .execute(adminDb);
      await sql
        .raw(`CREATE SEQUENCE "${schema}".api_default_sequence_probe`)
        .execute(adminDb);
      await sql
        .raw(
          `CREATE FUNCTION "${schema}".api_default_function_probe() RETURNS integer LANGUAGE sql AS 'SELECT 1'`,
        )
        .execute(adminDb);

      const futureObjectPrivileges = await sql<{
        anon_table: boolean;
        authenticated_table: boolean;
        service_role_table: boolean;
        anon_sequence: boolean;
        authenticated_sequence: boolean;
        service_role_sequence: boolean;
        anon_function: boolean;
        authenticated_function: boolean;
        service_role_function: boolean;
      }>`
        SELECT
          has_table_privilege('anon', ${`${schema}.api_default_table_probe`}, 'SELECT') AS anon_table,
          has_table_privilege('authenticated', ${`${schema}.api_default_table_probe`}, 'SELECT') AS authenticated_table,
          has_table_privilege('service_role', ${`${schema}.api_default_table_probe`}, 'SELECT') AS service_role_table,
          has_sequence_privilege('anon', ${`${schema}.api_default_sequence_probe`}, 'USAGE') AS anon_sequence,
          has_sequence_privilege('authenticated', ${`${schema}.api_default_sequence_probe`}, 'USAGE') AS authenticated_sequence,
          has_sequence_privilege('service_role', ${`${schema}.api_default_sequence_probe`}, 'USAGE') AS service_role_sequence,
          has_function_privilege('anon', ${`${schema}.api_default_function_probe()`}, 'EXECUTE') AS anon_function,
          has_function_privilege('authenticated', ${`${schema}.api_default_function_probe()`}, 'EXECUTE') AS authenticated_function,
          has_function_privilege('service_role', ${`${schema}.api_default_function_probe()`}, 'EXECUTE') AS service_role_function
      `.execute(inspectDb);

      expect(futureObjectPrivileges.rows[0]).toEqual({
        anon_table: false,
        authenticated_table: false,
        service_role_table: false,
        anon_sequence: false,
        authenticated_sequence: false,
        service_role_sequence: false,
        anon_function: false,
        authenticated_function: false,
        service_role_function: false,
      });

      // Supabase-managed owners may retain broad object default ACLs that the
      // application migration role cannot change. Even then, the schema fence
      // keeps those future objects unreachable through the Data API roles.
      await sql
        .raw(`GRANT USAGE, CREATE ON SCHEMA "${schema}" TO supabase_admin;
          SET ROLE supabase_admin;
          CREATE TABLE "${schema}".supabase_admin_default_table_probe (id integer);
          CREATE SEQUENCE "${schema}".supabase_admin_default_sequence_probe;
          CREATE FUNCTION "${schema}".supabase_admin_default_function_probe() RETURNS integer LANGUAGE sql AS 'SELECT 1';
          RESET ROLE;`)
        .execute(adminDb);

      const supabaseAdminObjectAccess = await sql<{
        anon_schema: boolean;
        authenticated_schema: boolean;
        service_role_schema: boolean;
        anon_table_reachable: boolean;
        authenticated_table_reachable: boolean;
        service_role_table_reachable: boolean;
        anon_sequence_reachable: boolean;
        authenticated_sequence_reachable: boolean;
        service_role_sequence_reachable: boolean;
        anon_function_reachable: boolean;
        authenticated_function_reachable: boolean;
        service_role_function_reachable: boolean;
      }>`
        SELECT
          has_schema_privilege('anon', ${schema}, 'USAGE') AS anon_schema,
          has_schema_privilege('authenticated', ${schema}, 'USAGE') AS authenticated_schema,
          has_schema_privilege('service_role', ${schema}, 'USAGE') AS service_role_schema,
          has_schema_privilege('anon', ${schema}, 'USAGE') AND has_table_privilege('anon', ${`${schema}.supabase_admin_default_table_probe`}, 'SELECT') AS anon_table_reachable,
          has_schema_privilege('authenticated', ${schema}, 'USAGE') AND has_table_privilege('authenticated', ${`${schema}.supabase_admin_default_table_probe`}, 'SELECT') AS authenticated_table_reachable,
          has_schema_privilege('service_role', ${schema}, 'USAGE') AND has_table_privilege('service_role', ${`${schema}.supabase_admin_default_table_probe`}, 'SELECT') AS service_role_table_reachable,
          has_schema_privilege('anon', ${schema}, 'USAGE') AND has_sequence_privilege('anon', ${`${schema}.supabase_admin_default_sequence_probe`}, 'USAGE') AS anon_sequence_reachable,
          has_schema_privilege('authenticated', ${schema}, 'USAGE') AND has_sequence_privilege('authenticated', ${`${schema}.supabase_admin_default_sequence_probe`}, 'USAGE') AS authenticated_sequence_reachable,
          has_schema_privilege('service_role', ${schema}, 'USAGE') AND has_sequence_privilege('service_role', ${`${schema}.supabase_admin_default_sequence_probe`}, 'USAGE') AS service_role_sequence_reachable,
          has_schema_privilege('anon', ${schema}, 'USAGE') AND has_function_privilege('anon', ${`${schema}.supabase_admin_default_function_probe()`}, 'EXECUTE') AS anon_function_reachable,
          has_schema_privilege('authenticated', ${schema}, 'USAGE') AND has_function_privilege('authenticated', ${`${schema}.supabase_admin_default_function_probe()`}, 'EXECUTE') AS authenticated_function_reachable,
          has_schema_privilege('service_role', ${schema}, 'USAGE') AND has_function_privilege('service_role', ${`${schema}.supabase_admin_default_function_probe()`}, 'EXECUTE') AS service_role_function_reachable
      `.execute(inspectDb);

      expect(supabaseAdminObjectAccess.rows[0]).toEqual({
        anon_schema: false,
        authenticated_schema: false,
        service_role_schema: false,
        anon_table_reachable: false,
        authenticated_table_reachable: false,
        service_role_table_reachable: false,
        anon_sequence_reachable: false,
        authenticated_sequence_reachable: false,
        service_role_sequence_reachable: false,
        anon_function_reachable: false,
        authenticated_function_reachable: false,
        service_role_function_reachable: false,
      });
    });

    it("persists only session digests for customers, operators, and internal admins while preserving lookup and rotation", async () => {
      const now = new Date();
      const expiresAt = new Date(now.getTime() + 60 * 60 * 1000).toISOString();
      const refreshExpiresAt = new Date(
        now.getTime() + 24 * 60 * 60 * 1000,
      ).toISOString();
      const createdAt = now.toISOString();
      const customerUserId = randomUUID();
      const operatorUserId = randomUUID();
      const internalAdminUserId = randomUUID();
      const sessions = {
        customer: {
          accessToken: `customer-access-${randomBytes(32).toString("hex")}`,
          refreshToken: `customer-refresh-${randomBytes(32).toString("hex")}`,
        },
        operator: {
          accessToken: `operator-access-${randomBytes(32).toString("hex")}`,
          refreshToken: `operator-refresh-${randomBytes(32).toString("hex")}`,
        },
        admin: {
          accessToken: `admin-access-${randomBytes(32).toString("hex")}`,
          refreshToken: `admin-refresh-${randomBytes(32).toString("hex")}`,
        },
      };

      await repository!.saveSession(
        {
          ...sessions.customer,
          userId: customerUserId,
          expiresAt,
          refreshExpiresAt,
          createdAt,
        },
        "refresh",
      );
      await repository!.saveOperatorSession(
        {
          ...sessions.operator,
          operatorUserId,
          activeLocationId: "test-location",
          expiresAt,
          refreshExpiresAt,
          createdAt,
        },
        "password",
      );
      await repository!.saveInternalAdminSession(
        {
          ...sessions.admin,
          internalAdminUserId,
          expiresAt,
          refreshExpiresAt,
          createdAt,
        },
        "password",
      );

      const persisted = await Promise.all([
        sql<{ access_token: string; refresh_token: string }>`
        SELECT access_token, refresh_token FROM identity_sessions WHERE user_id = ${customerUserId}
      `.execute(inspectDb),
        sql<{ access_token: string; refresh_token: string }>`
        SELECT access_token, refresh_token FROM operator_sessions WHERE operator_user_id = ${operatorUserId}
      `.execute(inspectDb),
        sql<{ access_token: string; refresh_token: string }>`
        SELECT access_token, refresh_token FROM internal_admin_sessions WHERE internal_admin_user_id = ${internalAdminUserId}
      `.execute(inspectDb),
      ]);

      for (const [index, tableRows] of persisted.entries()) {
        expect(tableRows.rows).toHaveLength(1);
        expect(tableRows.rows[0]).toEqual({
          access_token: digestSessionToken(
            Object.values(sessions)[index]!.accessToken,
          ),
          refresh_token: digestSessionToken(
            Object.values(sessions)[index]!.refreshToken,
          ),
        });
        expect(tableRows.rows[0]?.access_token).not.toBe(
          Object.values(sessions)[index]!.accessToken,
        );
        expect(tableRows.rows[0]?.refresh_token).not.toBe(
          Object.values(sessions)[index]!.refreshToken,
        );
      }

      expect(
        await repository!.getSessionByAccessToken(
          persisted[0]!.rows[0]!.access_token,
        ),
      ).toBeUndefined();
      expect(
        await repository!.getSessionByRefreshToken(
          persisted[0]!.rows[0]!.refresh_token,
        ),
      ).toBeUndefined();
      expect(
        await repository!.getOperatorSessionByAccessToken(
          persisted[1]!.rows[0]!.access_token,
        ),
      ).toBeUndefined();
      expect(
        await repository!.getOperatorSessionByRefreshToken(
          persisted[1]!.rows[0]!.refresh_token,
        ),
      ).toBeUndefined();
      expect(
        await repository!.getInternalAdminSessionByAccessToken(
          persisted[2]!.rows[0]!.access_token,
        ),
      ).toBeUndefined();
      expect(
        await repository!.getInternalAdminSessionByRefreshToken(
          persisted[2]!.rows[0]!.refresh_token,
        ),
      ).toBeUndefined();

      const appleToken = `runtime-apple-refresh-${randomBytes(24).toString("hex")}`;
      const appleAccount = await repository!.findOrCreateUserByAppleSub({
        appleSub: `apple-sub-${randomUUID()}`,
        clientId: "test-client",
        refreshToken: appleToken,
      });
      const appleRow = await sql<{ apple_refresh_token: string }>`
        SELECT apple_refresh_token FROM identity_users WHERE user_id = ${appleAccount.userId}
      `.execute(inspectDb);
      expect(appleRow.rows[0]?.apple_refresh_token).toMatch(
        /^aes256gcm:v1:active:/,
      );
      expect(appleRow.rows[0]?.apple_refresh_token).not.toContain(appleToken);
      expect(
        await repository!.getAppleAccountForUser(appleAccount.userId),
      ).toMatchObject({ refreshToken: appleToken });

      expect(
        await repository!.getSessionByAccessToken(
          sessions.customer.accessToken,
        ),
      ).toMatchObject({
        userId: customerUserId,
      });
      expect(
        await repository!.getOperatorSessionByAccessToken(
          sessions.operator.accessToken,
        ),
      ).toMatchObject({
        operatorUserId,
        activeLocationId: "test-location",
      });
      expect(
        await repository!.getInternalAdminSessionByAccessToken(
          sessions.admin.accessToken,
        ),
      ).toMatchObject({
        internalAdminUserId,
      });

      const rotatedCustomerTokens = {
        accessToken: `customer-rotated-access-${randomBytes(32).toString("hex")}`,
        refreshToken: `customer-rotated-refresh-${randomBytes(32).toString("hex")}`,
      };
      const rotatedCustomer = await repository!.rotateRefreshSession(
        sessions.customer.refreshToken,
        (userId) => ({
          ...rotatedCustomerTokens,
          userId,
          expiresAt,
          refreshExpiresAt,
          createdAt,
        }),
        "refresh",
      );
      expect(rotatedCustomer).toBeDefined();
      const rotatedCustomerRow = await sql<{
        access_token: string;
        refresh_token: string;
      }>`
      SELECT access_token, refresh_token FROM identity_sessions
      WHERE access_token = ${digestSessionToken(rotatedCustomerTokens.accessToken)}
    `.execute(inspectDb);
      expect(rotatedCustomerRow.rows).toEqual([
        {
          access_token: digestSessionToken(rotatedCustomerTokens.accessToken),
          refresh_token: digestSessionToken(rotatedCustomerTokens.refreshToken),
        },
      ]);
      expect(
        await repository!.rotateRefreshSession(
          sessions.customer.refreshToken,
          () => {
            throw new Error("reused refresh token must not mint a session");
          },
          "refresh",
        ),
      ).toBeUndefined();
      expect(
        await repository!.getSessionByAccessToken(
          sessions.customer.accessToken,
        ),
      ).toBeUndefined();
      await repository!.revokeByRefreshToken(rotatedCustomer!.refreshToken);
      expect(
        await repository!.getSessionByRefreshToken(
          rotatedCustomer!.refreshToken,
        ),
      ).toBeUndefined();

      const operatorRotationAttempts = await Promise.all([
        repository!.rotateOperatorRefreshSession(
          sessions.operator.refreshToken,
          (userId, locationId) => ({
            accessToken: `operator-rotated-access-${randomBytes(32).toString("hex")}`,
            refreshToken: `operator-rotated-refresh-${randomBytes(32).toString("hex")}`,
            operatorUserId: userId,
            activeLocationId: locationId,
            expiresAt,
            refreshExpiresAt,
            createdAt,
          }),
          "refresh",
        ),
        repository!.rotateOperatorRefreshSession(
          sessions.operator.refreshToken,
          (userId, locationId) => ({
            accessToken: `operator-raced-access-${randomBytes(32).toString("hex")}`,
            refreshToken: `operator-raced-refresh-${randomBytes(32).toString("hex")}`,
            operatorUserId: userId,
            activeLocationId: locationId,
            expiresAt,
            refreshExpiresAt,
            createdAt,
          }),
          "refresh",
        ),
      ]);
      expect(operatorRotationAttempts.filter(Boolean)).toHaveLength(1);
      expect(
        operatorRotationAttempts.filter((attempt) => !attempt),
      ).toHaveLength(1);
      expect(
        await repository!.getOperatorSessionByAccessToken(
          sessions.operator.accessToken,
        ),
      ).toBeUndefined();

      const rotatedAdminTokens = {
        accessToken: `admin-rotated-access-${randomBytes(32).toString("hex")}`,
        refreshToken: `admin-rotated-refresh-${randomBytes(32).toString("hex")}`,
      };
      const rotatedAdmin = await repository!.rotateInternalAdminRefreshSession(
        sessions.admin.refreshToken,
        (userId) => ({
          ...rotatedAdminTokens,
          internalAdminUserId: userId,
          expiresAt,
          refreshExpiresAt,
          createdAt,
        }),
        "refresh",
      );
      expect(rotatedAdmin).toBeDefined();
      expect(
        await repository!.getInternalAdminSessionByAccessToken(
          sessions.admin.accessToken,
        ),
      ).toBeUndefined();
      await repository!.revokeInternalAdminByRefreshToken(
        rotatedAdminTokens.refreshToken,
      );
      expect(
        await repository!.getInternalAdminSessionByRefreshToken(
          rotatedAdminTokens.refreshToken,
        ),
      ).toBeUndefined();
    });

    it("backfills bounded batches idempotently and rotates Apple ciphertext without exposing legacy values", async () => {
      const now = new Date();
      const expiresAt = new Date(now.getTime() + 60 * 60 * 1000).toISOString();
      const refreshExpiresAt = new Date(
        now.getTime() + 24 * 60 * 60 * 1000,
      ).toISOString();
      const legacySessions = {
        customer: [0, 1].map(() => ({
          userId: randomUUID(),
          accessToken: `legacy-customer-access-${randomBytes(16).toString("hex")}`,
          refreshToken: `legacy-customer-refresh-${randomBytes(16).toString("hex")}`,
        })),
        operator: [0, 1].map(() => ({
          userId: randomUUID(),
          accessToken: `legacy-operator-access-${randomBytes(16).toString("hex")}`,
          refreshToken: `legacy-operator-refresh-${randomBytes(16).toString("hex")}`,
        })),
        admin: [0, 1].map(() => ({
          userId: randomUUID(),
          accessToken: `legacy-admin-access-${randomBytes(16).toString("hex")}`,
          refreshToken: `legacy-admin-refresh-${randomBytes(16).toString("hex")}`,
        })),
      };

      for (const session of legacySessions.customer) {
        await sql`
        INSERT INTO identity_sessions
          (access_token, refresh_token, user_id, access_expires_at, expires_at, auth_method)
        VALUES (${session.accessToken}, ${session.refreshToken}, ${session.userId}, ${expiresAt}, ${refreshExpiresAt}, 'refresh')
      `.execute(inspectDb);
      }
      for (const session of legacySessions.operator) {
        await sql`
        INSERT INTO operator_sessions
          (access_token, refresh_token, operator_user_id, access_expires_at, expires_at, auth_method)
        VALUES (${session.accessToken}, ${session.refreshToken}, ${session.userId}, ${expiresAt}, ${refreshExpiresAt}, 'password')
      `.execute(inspectDb);
      }
      for (const session of legacySessions.admin) {
        await sql`
        INSERT INTO internal_admin_sessions
          (access_token, refresh_token, internal_admin_user_id, access_expires_at, expires_at, auth_method)
        VALUES (${session.accessToken}, ${session.refreshToken}, ${session.userId}, ${expiresAt}, ${refreshExpiresAt}, 'password')
      `.execute(inspectDb);
      }

      const legacyApple = [0, 1].map(() => ({
        userId: randomUUID(),
        subject: `apple-sub-${randomUUID()}`,
        refreshToken: `legacy-apple-refresh-${randomBytes(24).toString("hex")}`,
      }));
      for (const apple of legacyApple) {
        await sql`
        INSERT INTO identity_users (user_id, apple_sub, apple_client_id, apple_refresh_token)
        VALUES (${apple.userId}, ${apple.subject}, 'client-test', ${apple.refreshToken})
      `.execute(inspectDb);
      }

      const oldCipher = createAppleRefreshTokenCipher(
        JSON.stringify({ old: keyRing.old }),
        "old",
      );
      const oldCipherApple = {
        userId: randomUUID(),
        subject: `apple-sub-${randomUUID()}`,
        refreshToken: `old-encrypted-refresh-${randomBytes(24).toString("hex")}`,
      };
      await sql`
      INSERT INTO identity_users (user_id, apple_sub, apple_client_id, apple_refresh_token)
      VALUES (
        ${oldCipherApple.userId}, ${oldCipherApple.subject}, 'client-test',
        ${oldCipher.encrypt(oldCipherApple.refreshToken, oldCipherApple.userId)}
      )
    `.execute(inspectDb);

      const invalidActiveCipherRows = [
        {
          userId: randomUUID(),
          subject: `apple-sub-${randomUUID()}`,
          ciphertext: cipher.encrypt(
            `wrong-aad-${randomBytes(16).toString("hex")}`,
            "different-user-id",
          ),
        },
        {
          userId: randomUUID(),
          subject: `apple-sub-${randomUUID()}`,
          ciphertext: `aes256gcm:v1:active:${randomBytes(60).toString("base64url")}`,
        },
      ];
      for (const row of invalidActiveCipherRows) {
        await sql`
        INSERT INTO identity_users (user_id, apple_sub, apple_client_id, apple_refresh_token)
        VALUES (${row.userId}, ${row.subject}, 'client-test', ${row.ciphertext})
      `.execute(inspectDb);
      }

      vi.stubEnv("DEPLOY_ENV", "dev");
      vi.stubEnv("IDENTITY_ALLOW_LEGACY_SECRETS", "dev-cutover");
      expect(
        await repository!.getSessionByAccessToken(
          legacySessions.customer[0]!.accessToken,
        ),
      ).toMatchObject({
        userId: legacySessions.customer[0]!.userId,
      });
      expect(
        await repository!.getAppleAccountForUser(legacyApple[0]!.userId),
      ).toMatchObject({
        refreshToken: legacyApple[0]!.refreshToken,
      });

      const scanBackfillPages = async () => {
        let cursor: string | undefined;
        let pages = 0;
        const summary = {
          customerSessions: 0,
          operatorSessions: 0,
          internalAdminSessions: 0,
          appleRefreshTokens: 0,
          appleUnresolved: 0,
          appleRemaining: 0,
          appleRowsScanned: 0,
          finalRemaining: {
            customerSessions: 0,
            operatorSessions: 0,
            internalAdminSessions: 0,
            appleRefreshTokens: 0,
          },
        };

        while (true) {
          const page = await backfillIdentitySecretStorageBatch(
            inspectDb,
            cipher,
            1,
            cursor,
          );
          pages += 1;
          expect(page.scanned.appleRefreshTokens).toBeLessThanOrEqual(1);
          summary.customerSessions += page.customerSessions;
          summary.operatorSessions += page.operatorSessions;
          summary.internalAdminSessions += page.internalAdminSessions;
          summary.appleRefreshTokens += page.appleRefreshTokens;
          summary.appleUnresolved += page.unresolved.appleRefreshTokens;
          summary.appleRemaining += page.remaining.appleRefreshTokens;
          summary.appleRowsScanned += page.scanned.appleRefreshTokens;
          summary.finalRemaining = page.remaining;

          if (pages === 1 && page.nextCursor) {
            const retry = await backfillIdentitySecretStorageBatch(
              inspectDb,
              cipher,
              1,
            );
            summary.customerSessions += retry.customerSessions;
            summary.operatorSessions += retry.operatorSessions;
            summary.internalAdminSessions += retry.internalAdminSessions;
            expect(retry.appleRefreshTokens).toBe(0);
            expect(retry.nextCursor).not.toBeNull();
            expect(cipher.decodeBackfillCursor(retry.nextCursor!)).toBe(
              cipher.decodeBackfillCursor(page.nextCursor),
            );
          }

          if (!page.nextCursor) break;
          cursor = page.nextCursor;
        }

        expect(pages).toBeGreaterThan(1);
        return summary;
      };

      const migrationPass = await scanBackfillPages();
      expect(migrationPass).toMatchObject({
        customerSessions: 2,
        operatorSessions: 2,
        internalAdminSessions: 2,
        appleRefreshTokens: 3,
        appleUnresolved: 2,
        appleRemaining: 2,
        finalRemaining: {
          customerSessions: 0,
          operatorSessions: 0,
          internalAdminSessions: 0,
          appleRefreshTokens: 0,
        },
      });
      expect(migrationPass.appleRowsScanned).toBeGreaterThanOrEqual(5);

      const verificationPass = await scanBackfillPages();
      expect(verificationPass).toMatchObject({
        appleRefreshTokens: 0,
        appleUnresolved: 2,
        appleRemaining: 2,
      });
      expect(JSON.stringify(verificationPass)).not.toContain(
        invalidActiveCipherRows[0]!.ciphertext,
      );
      expect(JSON.stringify(verificationPass)).not.toContain(
        invalidActiveCipherRows[1]!.ciphertext,
      );

      for (const row of invalidActiveCipherRows) {
        await sql`
          UPDATE identity_users
          SET apple_refresh_token = ${cipher.encrypt(`repaired-${randomUUID()}`, row.userId)}
          WHERE user_id = ${row.userId}
        `.execute(inspectDb);
      }
      expect(await scanBackfillPages()).toMatchObject({
        appleRefreshTokens: 0,
        appleUnresolved: 0,
        appleRemaining: 0,
        finalRemaining: {
          customerSessions: 0,
          operatorSessions: 0,
          internalAdminSessions: 0,
          appleRefreshTokens: 0,
        },
      });

      vi.stubEnv("IDENTITY_ALLOW_LEGACY_SECRETS", "");
      for (const session of legacySessions.customer) {
        expect(
          await repository!.getSessionByAccessToken(session.accessToken),
        ).toMatchObject({ userId: session.userId });
        const row = await sql<{ access_token: string; refresh_token: string }>`
        SELECT access_token, refresh_token FROM identity_sessions WHERE user_id = ${session.userId}
      `.execute(inspectDb);
        expect(row.rows[0]).toEqual({
          access_token: digestSessionToken(session.accessToken),
          refresh_token: digestSessionToken(session.refreshToken),
        });
        expect(JSON.stringify(row.rows)).not.toContain(session.accessToken);
        expect(JSON.stringify(row.rows)).not.toContain(session.refreshToken);
      }
      for (const session of legacySessions.operator) {
        const row = await sql<{ access_token: string; refresh_token: string }>`
        SELECT access_token, refresh_token FROM operator_sessions WHERE operator_user_id = ${session.userId}
      `.execute(inspectDb);
        expect(row.rows[0]).toEqual({
          access_token: digestSessionToken(session.accessToken),
          refresh_token: digestSessionToken(session.refreshToken),
        });
      }
      for (const session of legacySessions.admin) {
        const row = await sql<{ access_token: string; refresh_token: string }>`
        SELECT access_token, refresh_token FROM internal_admin_sessions WHERE internal_admin_user_id = ${session.userId}
      `.execute(inspectDb);
        expect(row.rows[0]).toEqual({
          access_token: digestSessionToken(session.accessToken),
          refresh_token: digestSessionToken(session.refreshToken),
        });
      }
      for (const apple of [...legacyApple, oldCipherApple]) {
        const row = await sql<{ apple_refresh_token: string }>`
        SELECT apple_refresh_token FROM identity_users WHERE user_id = ${apple.userId}
      `.execute(inspectDb);
        expect(row.rows[0]?.apple_refresh_token).toMatch(
          /^aes256gcm:v1:active:/,
        );
        expect(row.rows[0]?.apple_refresh_token).not.toContain(
          apple.refreshToken,
        );
        expect(
          cipher.decrypt(row.rows[0]!.apple_refresh_token, apple.userId),
        ).toBe(apple.refreshToken);
        expect(
          await repository!.getAppleAccountForUser(apple.userId),
        ).toMatchObject({ refreshToken: apple.refreshToken });
      }
    }, 60_000);

    it("fails closed when a ciphertext is bound to another user", async () => {
      const userId = randomUUID();
      await sql`
      INSERT INTO identity_users (user_id, apple_sub, apple_client_id, apple_refresh_token)
      VALUES (${userId}, ${`apple-sub-${randomUUID()}`}, 'client-test', ${cipher.encrypt("apple-secret", userId)})
    `.execute(inspectDb);
      const row = await sql<{ apple_refresh_token: string }>`
      SELECT apple_refresh_token FROM identity_users WHERE user_id = ${userId}
    `.execute(inspectDb);
      const storedCiphertext = row.rows[0]!.apple_refresh_token;
      await sql`
      UPDATE identity_users SET user_id = ${randomUUID()}, apple_refresh_token = ${storedCiphertext}
      WHERE user_id = ${userId}
    `.execute(inspectDb);
      await expect(
        repository!.getAppleAccountForUser(userId),
      ).resolves.toBeUndefined();
      const replacementUser = await sql<{ user_id: string }>`
      SELECT user_id FROM identity_users WHERE apple_refresh_token = ${storedCiphertext}
    `.execute(inspectDb);
      await expect(
        repository!.getAppleAccountForUser(replacementUser.rows[0]!.user_id),
      ).rejects.toThrow();
    });
  },
);
