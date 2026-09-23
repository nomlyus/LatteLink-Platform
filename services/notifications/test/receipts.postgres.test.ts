import { randomUUID } from "node:crypto";
import { createPostgresDb, sql } from "@lattelink/persistence";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { buildApp } from "../src/app.js";

const databaseUrl = process.env.NOTIFICATIONS_TEST_DATABASE_URL;
const describeWithPostgres = databaseUrl ? describe : describe.skip;

describeWithPostgres("notification receipts and claims (PostgreSQL)", () => {
  const schema = `test_notifications_receipts_${randomUUID().replaceAll("-", "")}`;
  let scopedUrl: URL;
  let adminDb: ReturnType<typeof createPostgresDb>;
  let fixtureDb: ReturnType<typeof createPostgresDb>;
  let firstApp: Awaited<ReturnType<typeof buildApp>> | undefined;
  let secondApp: Awaited<ReturnType<typeof buildApp>> | undefined;

  beforeAll(async () => {
    scopedUrl = new URL(databaseUrl!);
    if (!["localhost", "127.0.0.1", "::1"].includes(scopedUrl.hostname)) {
      throw new Error("NOTIFICATIONS_TEST_DATABASE_URL must point to a local disposable PostgreSQL instance");
    }

    adminDb = createPostgresDb(databaseUrl!);
    await sql.raw(`CREATE SCHEMA ${schema}`).execute(adminDb);
    scopedUrl.searchParams.set("options", `-c search_path=${schema},public`);
    vi.stubEnv("DATABASE_URL", scopedUrl.toString());
    vi.stubEnv("EXPECTED_SUPABASE_PROJECT_REF", "");
    vi.stubEnv("DEPLOY_ENV", "test");
    vi.stubEnv("PERSISTENCE_SHARED_POOL_ENABLED", "false");
    vi.stubEnv("NOTIFICATIONS_PROVIDER_MODE", "expo");
    vi.stubEnv("NOTIFICATIONS_ENVIRONMENT", "test");
    vi.stubEnv("NOTIFICATIONS_INTERNAL_API_TOKEN", "test-notifications-internal-token");
    vi.stubEnv("GATEWAY_INTERNAL_API_TOKEN", "test-notifications-gateway-token");
    vi.stubEnv("SENTRY_DSN", "");

    firstApp = await buildApp();
    secondApp = await buildApp();
    fixtureDb = createPostgresDb(scopedUrl.toString());
  }, 60_000);

  afterAll(async () => {
    await firstApp?.close();
    await secondApp?.close();
    await fixtureDb?.destroy();
    if (adminDb) {
      await sql.raw(`DROP SCHEMA IF EXISTS ${schema} CASCADE`).execute(adminDb);
      await adminDb.destroy();
    }
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("migrates receipt/lease columns and atomically claims outbox rows across app instances", async () => {
    const columns = await sql<{ column_name: string }>`
      SELECT column_name FROM information_schema.columns
      WHERE table_schema = ${schema} AND table_name = 'notifications_outbox'
    `.execute(fixtureDb);
    const columnNames = new Set(columns.rows.map((row) => row.column_name));
    for (const name of ["receipt_id", "receipt_due_at", "receipt_expires_at", "provider_accepted_at",
      "dispatch_claim_token", "dispatch_lease_expires_at", "receipt_claim_token", "receipt_lease_expires_at", "environment"]) {
      expect(columnNames.has(name)).toBe(true);
    }

    const userId = "123e4567-e89b-12d3-a456-426614174981";
    const orderId = "123e4567-e89b-12d3-a456-426614174982";
    await firstApp!.inject({
      method: "PUT",
      url: "/v1/devices/push-token",
      headers: { "x-gateway-token": "test-notifications-gateway-token", "x-user-id": userId },
      payload: { deviceId: "ios-db-test", platform: "ios", expoPushToken: "ExponentPushToken[db-test]" }
    });
    await firstApp!.inject({
      method: "POST",
      url: "/v1/notifications/internal/order-state",
      headers: { "x-internal-token": "test-notifications-internal-token" },
      payload: { userId, orderId, status: "PAID", pickupCode: "DBTEST", locationId: "notification-test-location",
        occurredAt: new Date().toISOString() }
    });
    await sql`UPDATE notifications_outbox
      SET status = 'PROCESSING', dispatch_claim_token = 'abandoned-worker',
          dispatch_lease_expires_at = NOW() - INTERVAL '1 second'
      WHERE payload_json ->> 'orderId' = ${orderId}`.execute(fixtureDb);

    let releasePush: ((response: Response) => void) | undefined;
    const pendingPush = new Promise<Response>((resolve) => { releasePush = resolve; });
    let releaseReceipt: ((response: Response) => void) | undefined;
    const pendingReceipt = new Promise<Response>((resolve) => { releaseReceipt = resolve; });
    const fetchMock = vi.fn<typeof fetch>(async (input) => {
      if (String(input).includes("push/getReceipts")) {
        return pendingReceipt;
      }
      return pendingPush;
    });
    vi.stubGlobal("fetch", fetchMock);

    const processUrl = "/v1/notifications/internal/outbox/process";
    const headers = { "x-internal-token": "test-notifications-internal-token" };
    const firstRequest = firstApp!.inject({ method: "POST", url: processUrl, headers, payload: { batchSize: 10 } });
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const secondResponse = await secondApp!.inject({ method: "POST", url: processUrl, headers,
      payload: { batchSize: 10 } });
    expect(secondResponse.json()).toMatchObject({ processed: 0, dispatched: 0 });
    releasePush!(new Response(JSON.stringify({ data: [{ status: "ok", id: "db-ticket-1" }] }), { status: 200 }));
    expect((await firstRequest).json()).toMatchObject({ processed: 1, dispatched: 1 });
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const submitted = await sql<{ status: string; receipt_id: string | null; dispatch_claim_token: string | null }>`
      SELECT status, receipt_id, dispatch_claim_token FROM notifications_outbox
      WHERE payload_json ->> 'orderId' = ${orderId}
    `.execute(fixtureDb);
    expect(submitted.rows).toEqual([{ status: "SUBMITTED", receipt_id: "db-ticket-1", dispatch_claim_token: null }]);

    await sql`UPDATE notifications_outbox SET receipt_due_at = NOW() - INTERVAL '1 second',
      receipt_claim_token = 'abandoned-receipt-worker', receipt_lease_expires_at = NOW() - INTERVAL '1 second'
      WHERE payload_json ->> 'orderId' = ${orderId}`.execute(fixtureDb);
    const firstReceiptRequest = firstApp!.inject({ method: "POST",
      url: "/v1/notifications/internal/receipts/process", headers, payload: { batchSize: 10 } });
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    const competingReceiptResponse = await secondApp!.inject({ method: "POST",
      url: "/v1/notifications/internal/receipts/process", headers, payload: { batchSize: 10 } });
    expect(competingReceiptResponse.json()).toMatchObject({ processed: 0, providerAccepted: 0 });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    releaseReceipt!(new Response(JSON.stringify({ data: { "db-ticket-1": { status: "ok" } } }), { status: 200 }));
    const receiptResponse = await firstReceiptRequest;
    expect(receiptResponse.json()).toMatchObject({ providerAccepted: 1, failed: 0, expired: 0 });

    const claimedReceipt = await sql<{ status: string; receipt_claim_token: string | null; receipt_lease_expires_at: Date | null }>`
      SELECT status, receipt_claim_token, receipt_lease_expires_at FROM notifications_outbox
      WHERE payload_json ->> 'orderId' = ${orderId}
    `.execute(fixtureDb);
    expect(claimedReceipt.rows).toEqual([{ status: "DISPATCHED", receipt_claim_token: null, receipt_lease_expires_at: null }]);

    const legacyOrderId = "123e4567-e89b-12d3-a456-426614174983";
    await sql`INSERT INTO notifications_outbox (
      id, user_id, device_id, platform, expo_push_token, payload_json, status, attempts,
      available_at, dispatched_at, last_error, created_at, updated_at
    ) VALUES (
      ${randomUUID()}::uuid, ${userId}::uuid, 'ios-legacy', 'ios', 'ExponentPushToken[legacy]',
      ${JSON.stringify({ userId, orderId: legacyOrderId, status: "READY", pickupCode: "OLD", locationId: "legacy-location",
        occurredAt: new Date().toISOString() })}::jsonb,
      'DISPATCHED', 1, NOW(), NOW(), NULL, NOW(), NOW()
    )`.execute(fixtureDb);

    const health = await firstApp!.inject({ method: "GET", url: "/v1/notifications/internal/delivery-health", headers });
    expect(health.json()).toMatchObject({ processing: 0, submitted: 0, outcomes: expect.arrayContaining([
      expect.objectContaining({ notificationType: "PAID", environment: "test", providerAccepted: 1, unverified: 0 }),
      expect.objectContaining({ notificationType: "READY", environment: "unknown", providerAccepted: 0, unverified: 1 })
    ]) });
  }, 60_000);
});
