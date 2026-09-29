import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import {
  loyaltyBalanceSchema,
  loyaltyLedgerEntrySchema,
  loyaltyProgramSchema
} from "@lattelink/contracts-loyalty";
import { z } from "zod";
import { createPostgresDb, sql, type PersistenceDb } from "@lattelink/persistence";
import { buildApp } from "../src/app.js";

const adminDatabaseUrl = process.env.PERSISTENCE_TEST_DATABASE_URL;
const describeWithPostgres = adminDatabaseUrl ? describe : describe.skip;
const gatewayToken = "loyalty-postgres-gateway-token";
const internalToken = "loyalty-postgres-internal-token";
const brandA = "loyalty-postgres-brand-a";
const brandB = "loyalty-postgres-brand-b";
const locationA1 = "loyalty-postgres-a1";
const locationA2 = "loyalty-postgres-a2";
const locationB1 = "loyalty-postgres-b1";
const userId = "10000000-0000-4000-8000-000000000001";
const orderId = "20000000-0000-4000-8000-000000000001";
const refundOrderId = "20000000-0000-4000-8000-000000000002";

describeWithPostgres("brand-wide loyalty persistence (PostgreSQL)", () => {
  const databaseName = `test_loyalty_${randomUUID().replaceAll("-", "")}`;
  const testDatabaseUrl = new URL(adminDatabaseUrl!);
  testDatabaseUrl.pathname = `/${databaseName}`;
  let adminDb: PersistenceDb;
  let testDb: PersistenceDb;
  let app: Awaited<ReturnType<typeof buildApp>>;
  let originalDatabaseUrl: string | undefined;

  beforeAll(async () => {
    adminDb = createPostgresDb(adminDatabaseUrl!);
    testDb = createPostgresDb(testDatabaseUrl.toString());
    await sql.raw(`CREATE DATABASE "${databaseName}"`).execute(adminDb);
    originalDatabaseUrl = process.env.DATABASE_URL;
    vi.stubEnv("DATABASE_URL", testDatabaseUrl.toString());
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("GATEWAY_INTERNAL_API_TOKEN", gatewayToken);
    vi.stubEnv("LOYALTY_INTERNAL_API_TOKEN", internalToken);
    vi.stubEnv("POSTGRES_SHARED_POOL_ENABLED", "false");
    app = await buildApp();
    const readiness = await app.inject({ method: "GET", url: "/ready" });
    expect(readiness.statusCode).toBe(200);
    expect(readiness.json()).toMatchObject({ persistence: "postgres" });
    await sql`
      INSERT INTO catalog_clients (tenant_id, brand_id, client_name, status)
      VALUES ('tenant-loyalty-a', ${brandA}, 'Brand A', 'live'), ('tenant-loyalty-b', ${brandB}, 'Brand B', 'live')
    `.execute(testDb);
    await sql`
      INSERT INTO catalog_client_locations
        (tenant_id, location_id, brand_id, location_name, market_label, primary_location)
      VALUES
        ('tenant-loyalty-a', ${locationA1}, ${brandA}, 'A1', 'Market A', TRUE),
        ('tenant-loyalty-a', ${locationA2}, ${brandA}, 'A2', 'Market A', FALSE),
        ('tenant-loyalty-b', ${locationB1}, ${brandB}, 'B1', 'Market B', TRUE)
    `.execute(testDb);
  }, 120_000);

  afterAll(async () => {
    if (app) await app.close();
    await testDb.destroy();
    await sql.raw(`DROP DATABASE IF EXISTS "${databaseName}" WITH (FORCE)`).execute(adminDb);
    await adminDb.destroy();
    if (originalDatabaseUrl === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = originalDatabaseUrl;
    vi.unstubAllEnvs();
  }, 120_000);

  function internalHeaders() { return { "x-internal-token": internalToken }; }
  function gatewayHeaders() { return { "x-gateway-token": gatewayToken, "x-user-id": userId }; }

  async function configureProgram(programBrandId: string, participatingLocationIds: string[]) {
    const response = await app.inject({
      method: "PUT",
      url: `/v1/loyalty/internal/programs/${programBrandId}`,
      headers: internalHeaders(),
      payload: {
        brandId: programBrandId,
        enabled: true,
        participatingLocationIds,
        pointsPerDollar: 1,
        redemptionCentsPerPoint: 1,
        minimumRedemptionPoints: 1,
        maximumRedemptionPercent: 100,
        excludedItemIds: []
      }
    });
    expect(response.statusCode).toBe(200);
    return loyaltyProgramSchema.parse(response.json());
  }

  async function mutate(payload: Record<string, unknown>) {
    return app.inject({
      method: "POST",
      url: "/v1/loyalty/internal/ledger/apply",
      headers: internalHeaders(),
      payload
    });
  }

  async function getBalance(locationId: string) {
    const response = await app.inject({
      method: "GET",
      url: `/v1/loyalty/balance?brandId=${brandA}&locationId=${locationId}`,
      headers: gatewayHeaders()
    });
    expect(response.statusCode).toBe(200);
    return loyaltyBalanceSchema.parse(response.json());
  }

  it("earns at A1 and redeems at A2 from one balance, isolates Brand B, and reverses an earn idempotently", async () => {
    const unconfiguredContext = await app.inject({
      method: "GET",
      url: `/v1/loyalty/internal/program-context?brandId=${brandA}&locationId=${locationA1}`,
      headers: internalHeaders()
    });
    expect(unconfiguredContext.statusCode).toBe(200);
    expect(unconfiguredContext.json()).toMatchObject({
      brandId: brandA,
      locationId: locationA1,
      enabled: false,
      participating: false
    });
    expect(await getBalance(locationA1)).toMatchObject({ brandId: brandA, availablePoints: 0 });

    await configureProgram(brandA, [locationA1, locationA2]);
    await configureProgram(brandB, [locationB1]);

    const earnA1 = await mutate({
      brandId: brandA, userId, locationId: locationA1, type: "EARN", amountCents: 50_000,
      orderId, idempotencyKey: "a1-earned-order"
    });
    expect(earnA1.statusCode).toBe(200);
    const earnA2 = await mutate({
      brandId: brandA, userId, locationId: locationA2, type: "EARN", amountCents: 30_000,
      idempotencyKey: "a2-earned-order"
    });
    expect(earnA2.statusCode).toBe(200);

    expect(await getBalance(locationA1)).toMatchObject({ brandId: brandA, userId, availablePoints: 800 });
    expect(await getBalance(locationA2)).toMatchObject({ brandId: brandA, userId, availablePoints: 800 });

    const redeem = {
      brandId: brandA, userId, locationId: locationA2, type: "REDEEM", amountCents: 100,
      points: 100, idempotencyKey: "redeem-at-a2"
    };
    const firstRedeem = await mutate(redeem);
    expect(firstRedeem.statusCode).toBe(200);
    const replayedRedeem = await mutate(redeem);
    expect(replayedRedeem.statusCode).toBe(200);
    expect(replayedRedeem.json()).toEqual(firstRedeem.json());
    expect(await getBalance(locationA1)).toMatchObject({ availablePoints: 700 });

    const earnRefundOrder = await mutate({
      brandId: brandA, userId, locationId: locationA1, type: "EARN", amountCents: 6_000,
      orderId: refundOrderId, idempotencyKey: "earned-order-to-refund"
    });
    expect(earnRefundOrder.statusCode).toBe(200);
    const originalEarn = await app.inject({
      method: "GET",
      url: `/v1/loyalty/internal/order-earn?brandId=${brandA}&locationId=${locationA1}&userId=${userId}&orderId=${refundOrderId}`,
      headers: internalHeaders()
    });
    expect(originalEarn.statusCode).toBe(200);
    expect(loyaltyLedgerEntrySchema.parse(originalEarn.json().entry)).toMatchObject({ locationId: locationA1, points: 60 });

    const reversal = {
      brandId: brandA, userId, locationId: locationA1, type: "ADJUSTMENT", points: -60,
      orderId: refundOrderId, idempotencyKey: "refund-earned-order"
    };
    const firstReversal = await mutate(reversal);
    expect(firstReversal.statusCode).toBe(200);
    const replayedReversal = await mutate(reversal);
    expect(replayedReversal.statusCode).toBe(200);
    expect(replayedReversal.json()).toEqual(firstReversal.json());
    expect(await getBalance(locationA2)).toMatchObject({ availablePoints: 700 });

    const brandBEarn = await mutate({
      brandId: brandB, userId, locationId: locationB1, type: "EARN", amountCents: 1_000,
      idempotencyKey: "brand-b-order"
    });
    expect(brandBEarn.statusCode).toBe(200);
    const brandBBalance = await app.inject({
      method: "GET",
      url: `/v1/loyalty/balance?brandId=${brandB}&locationId=${locationB1}`,
      headers: gatewayHeaders()
    });
    expect(brandBBalance.statusCode).toBe(200);
    expect(loyaltyBalanceSchema.parse(brandBBalance.json())).toMatchObject({ brandId: brandB, availablePoints: 10 });

    const ledger = await app.inject({
      method: "GET",
      url: `/v1/loyalty/ledger?brandId=${brandA}&locationId=${locationA2}`,
      headers: gatewayHeaders()
    });
    expect(ledger.statusCode).toBe(200);
    const entries = z.array(loyaltyLedgerEntrySchema).parse(ledger.json());
    expect(entries.filter((entry) => entry.orderId === refundOrderId && entry.type === "ADJUSTMENT")).toHaveLength(1);
    expect(entries.map((entry) => entry.locationId)).toContain(locationA1);

    const crossBrand = await mutate({
      brandId: brandA, userId, locationId: locationB1, type: "EARN", amountCents: 10_000,
      idempotencyKey: "must-not-cross-brands"
    });
    expect(crossBrand.statusCode).toBe(404);
    expect(crossBrand.json()).not.toHaveProperty("tenantId");
  });
});
