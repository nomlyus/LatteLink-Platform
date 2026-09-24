import { randomUUID } from "node:crypto";
import { createPostgresDb, sql } from "@lattelink/persistence";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { up as addRefundProvenance } from "../../../packages/persistence/src/migrations/0048_stripe_refund_provenance.js";
import { createPostgresPaymentsRepository } from "../src/routes.js";

const configuredUrl = process.env.PAYMENTS_TEST_DATABASE_URL;
if (configuredUrl && !["localhost", "127.0.0.1", "[::1]"].includes(new URL(configuredUrl).hostname)) {
  throw new Error("PAYMENTS_TEST_DATABASE_URL must target a disposable loopback PostgreSQL instance");
}
const describeWithPostgres = configuredUrl ? describe : describe.skip;
const connectionString = configuredUrl ?? "postgres://localhost:1/skipped";

describeWithPostgres("refund retry persistence (PostgreSQL)", () => {
  const schema = `test_refund_retry_${randomUUID().replaceAll("-", "")}`;
  const adminDb = createPostgresDb(connectionString);
  const schemaUrl = new URL(connectionString);
  schemaUrl.searchParams.set("options", `-c search_path=${schema},public`);
  const db = createPostgresDb(schemaUrl.toString());
  const repository = createPostgresPaymentsRepository(db);
  const orderId = randomUUID();
  const paymentId = "pi_refund_retry";
  const request = {
    orderId, paymentId, idempotencyKey: "retry-key", amountCents: 500,
    currency: "USD" as const, reason: "customer cancellation", locationId: "loc-retry"
  };
  const occurredAt = "2026-09-23T12:00:00.000Z";
  const rejected = {
    refundId: randomUUID(), provider: "STRIPE" as const, orderId, paymentId,
    status: "REJECTED" as const, amountCents: 500, currency: "USD" as const,
    occurredAt, message: "Historical refund rejected"
  };
  const verified = {
    ...rejected, refundId: randomUUID(), status: "REFUNDED" as const,
    message: "Stripe refund re_retry succeeded"
  };

  beforeAll(async () => {
    await sql.raw(`CREATE SCHEMA ${schema}`).execute(adminDb);
    await sql.raw(`CREATE TABLE payments_refunds (
      refund_id UUID PRIMARY KEY, order_id UUID NOT NULL, payment_id TEXT NOT NULL,
      idempotency_key TEXT NOT NULL, provider TEXT NOT NULL, status TEXT NOT NULL,
      amount_cents INTEGER NOT NULL, currency TEXT NOT NULL, occurred_at TIMESTAMPTZ NOT NULL,
      message TEXT, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (order_id, idempotency_key)
    )`).execute(db);
    await addRefundProvenance(db as never);
  });

  afterAll(async () => {
    await repository.close();
    await sql.raw(`DROP SCHEMA IF EXISTS ${schema} CASCADE`).execute(adminDb);
    await adminDb.destroy();
  });

  it("replaces a matching rejected row with the verified Stripe result and replays it", async () => {
    await repository.saveRefund({ request, response: rejected });
    const result = await repository.saveRefund({
      request, response: verified, providerRefundId: "re_retry", stripeAccountId: "acct_retry"
    });
    expect(result).toMatchObject({ refundId: verified.refundId, status: "REFUNDED" });
    expect(await repository.saveRefund({
      request, response: verified, providerRefundId: "re_retry", stripeAccountId: "acct_retry"
    })).toEqual(result);
    const rows = await sql<{ status: string; source: string; provider_refund_id: string }>`
      SELECT status, source, provider_refund_id FROM payments_refunds
      WHERE order_id = ${orderId}::uuid AND idempotency_key = ${request.idempotencyKey}
    `.execute(db);
    expect(rows.rows).toEqual([{ status: "REFUNDED", source: "STRIPE_VERIFIED", provider_refund_id: "re_retry" }]);
  });

  it("does not replace a rejected row belonging to a different refund request", async () => {
    const different = { ...request, idempotencyKey: "mismatched-key" };
    await repository.saveRefund({ request: different, response: rejected });
    await expect(repository.saveRefund({
      request: { ...different, amountCents: 600 },
      response: { ...verified, amountCents: 600, refundId: randomUUID() },
      providerRefundId: "re_mismatch", stripeAccountId: "acct_retry"
    })).rejects.toThrow("Rejected refund does not match provider result");
    expect((await repository.findRefundByIdempotency(orderId, different.idempotencyKey))?.status).toBe("REJECTED");
  });

  it("returns one verified result when the same refund retry runs concurrently", async () => {
    const concurrentRequest = { ...request, idempotencyKey: "concurrent-key" };
    const concurrentRefund = { ...verified, refundId: randomUUID() };
    await repository.saveRefund({
      request: concurrentRequest, response: { ...rejected, refundId: randomUUID() }
    });
    const results = await Promise.all([1, 2].map(() => repository.saveRefund({
      request: concurrentRequest, response: concurrentRefund,
      providerRefundId: "re_concurrent", stripeAccountId: "acct_retry"
    })));
    expect(results.map((result) => result.refundId)).toEqual([concurrentRefund.refundId, concurrentRefund.refundId]);
  });

  it("uses a webhook-recorded provider refund without overwriting the rejected row", async () => {
    const webhookRequest = { ...request, idempotencyKey: "webhook-first-key" };
    await repository.saveRefund({ request: webhookRequest, response: { ...rejected, refundId: randomUUID() } });
    const provider = await repository.saveVerifiedStripeRefund({
      providerRefundId: "re_webhook", stripeAccountId: "acct_retry", orderId,
      paymentId, amountCents: 500, currency: "USD", occurredAt, providerStatus: "succeeded"
    });
    const replayed = await repository.saveRefund({
      request: webhookRequest, response: { ...verified, refundId: provider.refundId },
      providerRefundId: "re_webhook", stripeAccountId: "acct_retry"
    });
    expect(replayed.refundId).toBe(provider.refundId);
    expect((await repository.findRefundByIdempotency(orderId, webhookRequest.idempotencyKey))?.status).toBe("REJECTED");
  });
});
