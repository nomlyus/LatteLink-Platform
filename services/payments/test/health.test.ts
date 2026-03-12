import { afterEach, describe, expect, it, vi } from "vitest";
import { buildApp } from "../src/app.js";

describe("payments service", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("responds on /health and /ready", async () => {
    const app = await buildApp();
    const response = await app.inject({ method: "GET", url: "/health" });
    const ready = await app.inject({ method: "GET", url: "/ready" });

    expect(response.statusCode).toBe(200);
    expect(ready.statusCode).toBe(200);
    expect(ready.json()).toMatchObject({
      service: "payments",
      persistence: expect.any(String),
      providerMode: expect.any(String),
      providerConfigured: expect.any(Boolean)
    });
    await app.close();
  });

  it("supports Clover charge success, decline, and timeout outcomes", async () => {
    const app = await buildApp();
    const orderId = "123e4567-e89b-12d3-a456-426614174020";

    const successCharge = await app.inject({
      method: "POST",
      url: "/v1/payments/charges",
      payload: {
        orderId,
        amountCents: 825,
        currency: "USD",
        applePayToken: "apple-pay-success-token",
        idempotencyKey: "charge-1"
      }
    });
    expect(successCharge.statusCode).toBe(200);
    expect(successCharge.json()).toMatchObject({
      orderId,
      provider: "CLOVER",
      status: "SUCCEEDED",
      approved: true
    });

    const declinedCharge = await app.inject({
      method: "POST",
      url: "/v1/payments/charges",
      payload: {
        orderId: "123e4567-e89b-12d3-a456-426614174021",
        amountCents: 825,
        currency: "USD",
        applePayToken: "apple-pay-decline-token",
        idempotencyKey: "charge-2"
      }
    });
    expect(declinedCharge.statusCode).toBe(200);
    expect(declinedCharge.json()).toMatchObject({
      provider: "CLOVER",
      status: "DECLINED",
      approved: false,
      declineCode: "CARD_DECLINED"
    });

    const timeoutCharge = await app.inject({
      method: "POST",
      url: "/v1/payments/charges",
      payload: {
        orderId: "123e4567-e89b-12d3-a456-426614174022",
        amountCents: 825,
        currency: "USD",
        applePayToken: "apple-pay-timeout-token",
        idempotencyKey: "charge-3"
      }
    });
    expect(timeoutCharge.statusCode).toBe(200);
    expect(timeoutCharge.json()).toMatchObject({
      provider: "CLOVER",
      status: "TIMEOUT",
      approved: false
    });

    const walletCharge = await app.inject({
      method: "POST",
      url: "/v1/payments/charges",
      payload: {
        orderId: "123e4567-e89b-12d3-a456-426614174027",
        amountCents: 825,
        currency: "USD",
        applePayWallet: {
          version: "EC_v1",
          data: "wallet-success-token",
          signature: "signature-value",
          header: {
            ephemeralPublicKey: "ephemeral-key",
            publicKeyHash: "public-key-hash",
            transactionId: "transaction-id"
          }
        },
        idempotencyKey: "charge-4"
      }
    });
    expect(walletCharge.statusCode).toBe(200);
    expect(walletCharge.json()).toMatchObject({
      provider: "CLOVER",
      status: "SUCCEEDED",
      approved: true
    });

    await app.close();
  });

  it("treats charge and refund requests as idempotent", async () => {
    const app = await buildApp();
    const orderId = "123e4567-e89b-12d3-a456-426614174023";

    const firstCharge = await app.inject({
      method: "POST",
      url: "/v1/payments/charges",
      payload: {
        orderId,
        amountCents: 900,
        currency: "USD",
        applePayToken: "apple-pay-success-token",
        idempotencyKey: "charge-idem"
      }
    });
    const secondCharge = await app.inject({
      method: "POST",
      url: "/v1/payments/charges",
      payload: {
        orderId,
        amountCents: 900,
        currency: "USD",
        applePayToken: "apple-pay-success-token",
        idempotencyKey: "charge-idem"
      }
    });

    expect(firstCharge.statusCode).toBe(200);
    expect(secondCharge.statusCode).toBe(200);
    expect(secondCharge.json()).toMatchObject({ paymentId: firstCharge.json().paymentId, status: "SUCCEEDED" });

    const paymentId = firstCharge.json().paymentId as string;
    const firstRefund = await app.inject({
      method: "POST",
      url: "/v1/payments/refunds",
      payload: {
        orderId,
        paymentId,
        amountCents: 900,
        currency: "USD",
        reason: "customer cancellation",
        idempotencyKey: "refund-idem"
      }
    });
    const secondRefund = await app.inject({
      method: "POST",
      url: "/v1/payments/refunds",
      payload: {
        orderId,
        paymentId,
        amountCents: 900,
        currency: "USD",
        reason: "customer cancellation",
        idempotencyKey: "refund-idem"
      }
    });

    expect(firstRefund.statusCode).toBe(200);
    expect(secondRefund.statusCode).toBe(200);
    expect(secondRefund.json()).toMatchObject({ refundId: firstRefund.json().refundId, status: "REFUNDED" });

    await app.close();
  });

  it("supports refund rejection path", async () => {
    const app = await buildApp();
    const orderId = "123e4567-e89b-12d3-a456-426614174024";

    const charge = await app.inject({
      method: "POST",
      url: "/v1/payments/charges",
      payload: {
        orderId,
        amountCents: 700,
        currency: "USD",
        applePayToken: "apple-pay-success-token",
        idempotencyKey: "charge-for-reject"
      }
    });
    expect(charge.statusCode).toBe(200);

    const refund = await app.inject({
      method: "POST",
      url: "/v1/payments/refunds",
      payload: {
        orderId,
        paymentId: charge.json().paymentId,
        amountCents: 700,
        currency: "USD",
        reason: "reject this refund",
        idempotencyKey: "refund-reject"
      }
    });

    expect(refund.statusCode).toBe(200);
    expect(refund.json()).toMatchObject({ status: "REJECTED", provider: "CLOVER" });
    await app.close();
  });

  it("propagates x-request-id and exposes metrics counters", async () => {
    const app = await buildApp();
    const requestId = "payments-trace-1";

    const invalidRefund = await app.inject({
      method: "POST",
      url: "/v1/payments/refunds",
      headers: {
        "x-request-id": requestId
      },
      payload: {
        orderId: "123e4567-e89b-12d3-a456-426614174025",
        paymentId: "123e4567-e89b-12d3-a456-426614174026",
        amountCents: 500,
        currency: "USD",
        reason: "unknown payment",
        idempotencyKey: "missing-payment"
      }
    });

    expect(invalidRefund.statusCode).toBe(404);
    expect(invalidRefund.headers["x-request-id"]).toBe(requestId);

    const metricsResponse = await app.inject({ method: "GET", url: "/metrics" });
    expect(metricsResponse.statusCode).toBe(200);
    expect(metricsResponse.json()).toMatchObject({
      service: "payments",
      requests: expect.objectContaining({
        total: expect.any(Number),
        status2xx: expect.any(Number),
        status4xx: expect.any(Number),
        status5xx: expect.any(Number)
      })
    });
    expect(metricsResponse.json().requests.total).toBeGreaterThanOrEqual(1);
    expect(metricsResponse.json().requests.status4xx).toBeGreaterThanOrEqual(1);

    await app.close();
  });

  it("returns misconfiguration errors when live Clover mode is enabled without required env", async () => {
    vi.stubEnv("CLOVER_PROVIDER_MODE", "live");
    vi.stubEnv("CLOVER_API_KEY", "");
    vi.stubEnv("CLOVER_MERCHANT_ID", "");
    vi.stubEnv("CLOVER_CHARGE_ENDPOINT", "");
    vi.stubEnv("CLOVER_REFUND_ENDPOINT", "");

    const app = await buildApp();
    const response = await app.inject({
      method: "POST",
      url: "/v1/payments/charges",
      payload: {
        orderId: "123e4567-e89b-12d3-a456-426614174030",
        amountCents: 650,
        currency: "USD",
        applePayToken: "apple-pay-success-token",
        idempotencyKey: "live-misconfigured"
      }
    });

    expect(response.statusCode).toBe(503);
    expect(response.json()).toMatchObject({ code: "PROVIDER_MISCONFIGURED" });
    await app.close();
  });

  it("rate limits write endpoints when configured threshold is reached", async () => {
    vi.stubEnv("PAYMENTS_RATE_LIMIT_WRITE_MAX", "1");
    vi.stubEnv("PAYMENTS_RATE_LIMIT_WINDOW_MS", "60000");

    const app = await buildApp();
    try {
      const firstCharge = await app.inject({
        method: "POST",
        url: "/v1/payments/charges",
        payload: {
          orderId: "123e4567-e89b-12d3-a456-426614174099",
          amountCents: 825,
          currency: "USD",
          applePayToken: "apple-pay-success-token",
          idempotencyKey: "rate-limit-charge-1"
        }
      });
      expect(firstCharge.statusCode).toBe(200);

      const secondCharge = await app.inject({
        method: "POST",
        url: "/v1/payments/charges",
        payload: {
          orderId: "123e4567-e89b-12d3-a456-426614174098",
          amountCents: 825,
          currency: "USD",
          applePayToken: "apple-pay-success-token",
          idempotencyKey: "rate-limit-charge-2"
        }
      });
      expect(secondCharge.statusCode).toBe(429);
      expect(secondCharge.json()).toMatchObject({ statusCode: 429 });
    } finally {
      await app.close();
      vi.unstubAllEnvs();
    }
  });

  it("supports live Clover charge + refund via configured endpoints", async () => {
    vi.stubEnv("CLOVER_PROVIDER_MODE", "live");
    vi.stubEnv("CLOVER_API_KEY", "test-key");
    vi.stubEnv("CLOVER_MERCHANT_ID", "merchant-sbx");
    vi.stubEnv("CLOVER_CHARGE_ENDPOINT", "https://sandbox.clover.test/v1/merchants/{merchantId}/charges");
    vi.stubEnv(
      "CLOVER_REFUND_ENDPOINT",
      "https://sandbox.clover.test/v1/merchants/{merchantId}/payments/{paymentId}/refunds"
    );

    const fetchMock = vi.fn<typeof fetch>();
    vi.stubGlobal("fetch", fetchMock);
    fetchMock.mockImplementation(async (input) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url === "https://sandbox.clover.test/v1/merchants/merchant-sbx/charges") {
        return new Response(
          JSON.stringify({
            id: "clv-charge-1",
            status: "APPROVED",
            approved: true,
            message: "Charge accepted"
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        );
      }

      if (url === "https://sandbox.clover.test/v1/merchants/merchant-sbx/payments/clv-charge-1/refunds") {
        return new Response(
          JSON.stringify({
            id: "clv-refund-1",
            status: "REFUNDED",
            message: "Refund accepted"
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        );
      }

      throw new Error(`unexpected live Clover URL: ${url}`);
    });

    const app = await buildApp();

    const chargeResponse = await app.inject({
      method: "POST",
      url: "/v1/payments/charges",
      payload: {
        orderId: "123e4567-e89b-12d3-a456-426614174031",
        amountCents: 1200,
        currency: "USD",
        applePayToken: "apple-pay-source-token",
        idempotencyKey: "live-charge-1"
      }
    });
    expect(chargeResponse.statusCode).toBe(200);
    expect(chargeResponse.json()).toMatchObject({
      provider: "CLOVER",
      status: "SUCCEEDED",
      approved: true
    });

    const internalPaymentId = chargeResponse.json().paymentId as string;
    expect(typeof internalPaymentId).toBe("string");

    const refundResponse = await app.inject({
      method: "POST",
      url: "/v1/payments/refunds",
      payload: {
        orderId: "123e4567-e89b-12d3-a456-426614174031",
        paymentId: internalPaymentId,
        amountCents: 1200,
        currency: "USD",
        reason: "customer requested cancellation",
        idempotencyKey: "live-refund-1"
      }
    });
    expect(refundResponse.statusCode).toBe(200);
    expect(refundResponse.json()).toMatchObject({
      provider: "CLOVER",
      status: "REFUNDED"
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    await app.close();
  });

  it("reconciles charge webhooks and dispatches order updates", async () => {
    const fetchMock = vi.fn<typeof fetch>();
    vi.stubGlobal("fetch", fetchMock);
    fetchMock.mockImplementation(async (input) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url === "http://127.0.0.1:3001/v1/orders/internal/payments/reconcile") {
        return new Response(
          JSON.stringify({
            accepted: true,
            applied: true,
            orderStatus: "PAID"
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        );
      }

      throw new Error(`unexpected webhook dispatch URL: ${url}`);
    });

    const app = await buildApp();
    const orderId = "123e4567-e89b-12d3-a456-426614174032";
    const chargeResponse = await app.inject({
      method: "POST",
      url: "/v1/payments/charges",
      payload: {
        orderId,
        amountCents: 975,
        currency: "USD",
        applePayToken: "apple-pay-success-token",
        idempotencyKey: "webhook-charge-source"
      }
    });
    expect(chargeResponse.statusCode).toBe(200);

    const webhookResponse = await app.inject({
      method: "POST",
      url: "/v1/payments/webhooks/clover",
      payload: {
        eventId: "evt_charge_1",
        type: "payment.updated",
        paymentId: chargeResponse.json().paymentId,
        orderId,
        status: "APPROVED",
        message: "Settled asynchronously",
        occurredAt: "2026-03-11T00:00:00.000Z"
      }
    });

    expect(webhookResponse.statusCode).toBe(200);
    expect(webhookResponse.json()).toMatchObject({
      accepted: true,
      kind: "CHARGE",
      orderId,
      status: "SUCCEEDED",
      orderApplied: true
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await app.close();
  });

  it("reconciles refund webhooks and dispatches order updates", async () => {
    const fetchMock = vi.fn<typeof fetch>();
    vi.stubGlobal("fetch", fetchMock);
    fetchMock.mockImplementation(async (input, init) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url === "http://127.0.0.1:3001/v1/orders/internal/payments/reconcile") {
        const body = JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>;
        expect(body.kind).toBe("REFUND");
        expect(body.status).toBe("REFUNDED");
        return new Response(
          JSON.stringify({
            accepted: true,
            applied: true,
            orderStatus: "CANCELED"
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        );
      }

      throw new Error(`unexpected webhook dispatch URL: ${url}`);
    });

    const app = await buildApp();
    const orderId = "123e4567-e89b-12d3-a456-426614174033";
    const chargeResponse = await app.inject({
      method: "POST",
      url: "/v1/payments/charges",
      payload: {
        orderId,
        amountCents: 1025,
        currency: "USD",
        applePayToken: "apple-pay-success-token",
        idempotencyKey: "webhook-refund-charge"
      }
    });
    expect(chargeResponse.statusCode).toBe(200);

    const refundResponse = await app.inject({
      method: "POST",
      url: "/v1/payments/refunds",
      payload: {
        orderId,
        paymentId: chargeResponse.json().paymentId,
        amountCents: 1025,
        currency: "USD",
        reason: "reject this refund",
        idempotencyKey: "webhook-refund-source"
      }
    });
    expect(refundResponse.statusCode).toBe(200);
    expect(refundResponse.json()).toMatchObject({ status: "REJECTED" });

    const webhookResponse = await app.inject({
      method: "POST",
      url: "/v1/payments/webhooks/clover",
      payload: {
        eventId: "evt_refund_1",
        type: "refund.updated",
        paymentId: chargeResponse.json().paymentId,
        orderId,
        status: "REFUNDED",
        message: "Refund finalized",
        occurredAt: "2026-03-11T01:00:00.000Z"
      }
    });

    expect(webhookResponse.statusCode).toBe(200);
    expect(webhookResponse.json()).toMatchObject({
      accepted: true,
      kind: "REFUND",
      orderId,
      status: "REFUNDED",
      orderApplied: true
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await app.close();
  });

  it("rejects webhook requests when shared secret is configured and missing", async () => {
    vi.stubEnv("CLOVER_WEBHOOK_SHARED_SECRET", "secret-1");
    const app = await buildApp();
    const response = await app.inject({
      method: "POST",
      url: "/v1/payments/webhooks/clover",
      payload: {
        type: "payment.updated",
        paymentId: "clv-charge-unknown",
        orderId: "123e4567-e89b-12d3-a456-426614174034",
        status: "APPROVED"
      }
    });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({ code: "UNAUTHORIZED_WEBHOOK" });
    await app.close();
  });
});
