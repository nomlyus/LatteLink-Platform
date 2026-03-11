import { describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";

describe("payments service", () => {
  it("responds on /health and /ready", async () => {
    const app = await buildApp();
    const response = await app.inject({ method: "GET", url: "/health" });
    const ready = await app.inject({ method: "GET", url: "/ready" });

    expect(response.statusCode).toBe(200);
    expect(ready.statusCode).toBe(200);
    expect(ready.json()).toMatchObject({ service: "payments", persistence: expect.any(String) });
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
});
