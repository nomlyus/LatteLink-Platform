import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildApp } from "../src/app.js";
import { summarizeCloverResponseForLogs } from "../src/routes.js";

const internalPaymentsToken = "orders-internal-token";
const cloverWebhookSecret = "secret-1";

function internalHeaders(extraHeaders?: Record<string, string>) {
  return {
    "x-internal-token": internalPaymentsToken,
    ...extraHeaders
  };
}

function webhookHeaders(extraHeaders?: Record<string, string>) {
  return {
    "x-clover-webhook-secret": cloverWebhookSecret,
    ...extraHeaders
  };
}

describe("payments service", () => {
  beforeEach(() => {
    vi.stubEnv("ORDERS_INTERNAL_API_TOKEN", internalPaymentsToken);
    vi.stubEnv("CLOVER_WEBHOOK_SHARED_SECRET", cloverWebhookSecret);
  });

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
      status: "ready",
      service: "payments",
      persistence: expect.any(String),
      providerMode: "simulated",
      providerConfigured: true
    });
    await app.close();
  });

  it("returns degraded readiness when live Clover mode is misconfigured", async () => {
    vi.stubEnv("CLOVER_PROVIDER_MODE", "live");
    vi.stubEnv("CLOVER_BEARER_TOKEN", "");
    vi.stubEnv("CLOVER_MERCHANT_ID", "");
    vi.stubEnv("CLOVER_CHARGE_ENDPOINT", "");
    vi.stubEnv("CLOVER_REFUND_ENDPOINT", "");

    const app = await buildApp();
    const ready = await app.inject({ method: "GET", url: "/ready" });

    expect(ready.statusCode).toBe(503);
    expect(ready.json()).toMatchObject({
      status: "degraded",
      service: "payments",
      providerMode: "live",
      providerConfigured: false
    });
    await app.close();
  });

  it("reports ready when live Clover mode is fully configured", async () => {
    vi.stubEnv("CLOVER_PROVIDER_MODE", "live");
    vi.stubEnv("CLOVER_BEARER_TOKEN", "test-bearer-token");
    vi.stubEnv("CLOVER_MERCHANT_ID", "merchant-123");
    vi.stubEnv("CLOVER_CHARGE_ENDPOINT", "https://sandbox.clover.example/merchants/{merchantId}/charges");
    vi.stubEnv("CLOVER_REFUND_ENDPOINT", "https://sandbox.clover.example/merchants/{merchantId}/payments/{paymentId}/refunds");

    const app = await buildApp();
    const ready = await app.inject({ method: "GET", url: "/ready" });

    expect(ready.statusCode).toBe(200);
    expect(ready.json()).toMatchObject({
      status: "ready",
      service: "payments",
      providerMode: "live",
      providerConfigured: true
    });
    await app.close();
  });

  it("still accepts legacy CLOVER_API_KEY for live Clover charge/refund auth", async () => {
    vi.stubEnv("CLOVER_PROVIDER_MODE", "live");
    vi.stubEnv("CLOVER_API_KEY", "legacy-bearer-token");
    vi.stubEnv("CLOVER_MERCHANT_ID", "merchant-123");
    vi.stubEnv("CLOVER_CHARGE_ENDPOINT", "https://sandbox.clover.example/merchants/{merchantId}/charges");
    vi.stubEnv("CLOVER_REFUND_ENDPOINT", "https://sandbox.clover.example/merchants/{merchantId}/payments/{paymentId}/refunds");

    const app = await buildApp();
    const ready = await app.inject({ method: "GET", url: "/ready" });

    expect(ready.statusCode).toBe(200);
    expect(ready.json()).toMatchObject({
      status: "ready",
      service: "payments",
      providerMode: "live",
      providerConfigured: true
    });
    await app.close();
  });

  it("generates a Clover OAuth authorize URL when app credentials are configured", async () => {
    vi.stubEnv("CLOVER_APP_ID", "clover-app-id");
    vi.stubEnv("CLOVER_APP_SECRET", "clover-app-secret");
    vi.stubEnv("CLOVER_OAUTH_REDIRECT_URI", "https://example.test/v1/payments/clover/oauth/callback");

    const app = await buildApp();
    const response = await app.inject({
      method: "GET",
      url: "/v1/payments/clover/oauth/connect"
    });

    expect(response.statusCode).toBe(200);
    const body = response.json() as {
      authorizeUrl: string;
      redirectUri: string;
      stateExpiresAt: string;
    };
    const authorizeUrl = new URL(body.authorizeUrl);
    expect(authorizeUrl.origin).toBe("https://sandbox.dev.clover.com");
    expect(authorizeUrl.pathname).toBe("/oauth/v2/authorize");
    expect(authorizeUrl.searchParams.get("client_id")).toBe("clover-app-id");
    expect(authorizeUrl.searchParams.get("response_type")).toBe("code");
    expect(authorizeUrl.searchParams.get("redirect_uri")).toBe("https://example.test/v1/payments/clover/oauth/callback");
    expect(authorizeUrl.searchParams.get("state")).toEqual(expect.any(String));
    expect(body.redirectUri).toBe("https://example.test/v1/payments/clover/oauth/callback");
    expect(new Date(body.stateExpiresAt).toISOString()).toBe(body.stateExpiresAt);
    await app.close();
  });

  it("redirects Clover app launches into the OAuth authorize flow when callback is hit without code", async () => {
    vi.stubEnv("CLOVER_PROVIDER_MODE", "live");
    vi.stubEnv("CLOVER_APP_ID", "clover-app-id");
    vi.stubEnv("CLOVER_APP_SECRET", "clover-app-secret");
    vi.stubEnv("CLOVER_OAUTH_REDIRECT_URI", "https://example.test/v1/payments/clover/oauth/callback");

    const app = await buildApp();

    const response = await app.inject({
      method: "GET",
      url: "/v1/payments/clover/oauth/callback?merchant_id=merchant-oauth-launch-1"
    });

    expect(response.statusCode).toBe(302);
    const location = response.headers.location;
    expect(location).toEqual(expect.any(String));

    const authorizeUrl = new URL(String(location));
    expect(authorizeUrl.origin).toBe("https://sandbox.dev.clover.com");
    expect(authorizeUrl.pathname).toBe("/oauth/v2/authorize");
    expect(authorizeUrl.searchParams.get("client_id")).toBe("clover-app-id");
    expect(authorizeUrl.searchParams.get("response_type")).toBe("code");
    expect(authorizeUrl.searchParams.get("redirect_uri")).toBe(
      "https://example.test/v1/payments/clover/oauth/callback"
    );
    expect(authorizeUrl.searchParams.get("state")).toEqual(expect.any(String));

    await app.close();
  });

  it("summarizes Clover tokenization responses without leaking sensitive tokens", () => {
    expect(
      summarizeCloverResponseForLogs({
        status: "AUTHORIZED",
        id: "secret-token-value",
        token: "another-secret-token",
        errorCode: "CARD_DECLINED",
        message: "Card was declined",
        data: {
          token: "nested-secret-token"
        }
      })
    ).toEqual({
      status: "AUTHORIZED",
      code: "CARD_DECLINED",
      message: "Card was declined"
    });
  });

  it("rejects charge requests when the internal token is missing", async () => {
    const app = await buildApp();
    const response = await app.inject({
      method: "POST",
      url: "/v1/payments/charges",
      payload: {
        orderId: "123e4567-e89b-12d3-a456-426614174019",
        amountCents: 825,
        currency: "USD",
        applePayToken: "apple-pay-success-token",
        idempotencyKey: "missing-internal-token"
      }
    });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({ code: "UNAUTHORIZED_INTERNAL_REQUEST" });
    await app.close();
  });

  it("fails closed when internal payment auth is not configured", async () => {
    vi.stubEnv("ORDERS_INTERNAL_API_TOKEN", "");
    const app = await buildApp();
    const response = await app.inject({
      method: "POST",
      url: "/v1/payments/charges",
      headers: internalHeaders(),
      payload: {
        orderId: "123e4567-e89b-12d3-a456-426614174018",
        amountCents: 825,
        currency: "USD",
        applePayToken: "apple-pay-success-token",
        idempotencyKey: "missing-internal-config"
      }
    });

    expect(response.statusCode).toBe(503);
    expect(response.json()).toMatchObject({ code: "INTERNAL_ACCESS_NOT_CONFIGURED" });
    await app.close();
  });

  it("supports Clover charge success, decline, and timeout outcomes", async () => {
    const app = await buildApp();
    const orderId = "123e4567-e89b-12d3-a456-426614174020";

    const successCharge = await app.inject({
      method: "POST",
      url: "/v1/payments/charges",
      headers: internalHeaders(),
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
      headers: internalHeaders(),
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
      headers: internalHeaders(),
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
      headers: internalHeaders(),
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
      headers: internalHeaders(),
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
      headers: internalHeaders(),
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
      headers: internalHeaders(),
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
      headers: internalHeaders(),
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
      headers: internalHeaders(),
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
      headers: internalHeaders(),
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

  it("rejects charge idempotency key reuse when the payload changes", async () => {
    const app = await buildApp();
    const orderId = "123e4567-e89b-12d3-a456-426614174099";

    const firstCharge = await app.inject({
      method: "POST",
      url: "/v1/payments/charges",
      headers: internalHeaders(),
      payload: {
        orderId,
        amountCents: 800,
        currency: "USD",
        applePayToken: "apple-pay-success-token",
        idempotencyKey: "charge-key-reuse"
      }
    });
    expect(firstCharge.statusCode).toBe(200);

    const conflictingCharge = await app.inject({
      method: "POST",
      url: "/v1/payments/charges",
      headers: internalHeaders(),
      payload: {
        orderId,
        amountCents: 825,
        currency: "USD",
        applePayToken: "apple-pay-success-token",
        idempotencyKey: "charge-key-reuse"
      }
    });

    expect(conflictingCharge.statusCode).toBe(409);
    expect(conflictingCharge.json()).toMatchObject({
      code: "IDEMPOTENCY_KEY_REUSE"
    });
    await app.close();
  });

  it("propagates x-request-id and exposes metrics counters", async () => {
    const app = await buildApp();
    const requestId = "payments-trace-1";

    const invalidRefund = await app.inject({
      method: "POST",
      url: "/v1/payments/refunds",
      headers: internalHeaders({
        "x-request-id": requestId
      }),
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
    vi.stubEnv("CLOVER_BEARER_TOKEN", "");
    vi.stubEnv("CLOVER_MERCHANT_ID", "");
    vi.stubEnv("CLOVER_CHARGE_ENDPOINT", "");
    vi.stubEnv("CLOVER_REFUND_ENDPOINT", "");

    const app = await buildApp();
    const response = await app.inject({
      method: "POST",
      url: "/v1/payments/charges",
      headers: internalHeaders(),
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
        headers: internalHeaders(),
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
        headers: internalHeaders(),
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
    vi.stubEnv("CLOVER_BEARER_TOKEN", "test-bearer-token");
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
      headers: internalHeaders(),
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
      headers: internalHeaders(),
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

  it("uses apiAccessKey tokenization auth for live Apple Pay wallet charges", async () => {
    vi.stubEnv("CLOVER_PROVIDER_MODE", "live");
    vi.stubEnv("CLOVER_BEARER_TOKEN", "test-bearer-token");
    vi.stubEnv("CLOVER_API_ACCESS_KEY", "test-public-api-access-key");
    vi.stubEnv("CLOVER_MERCHANT_ID", "merchant-sbx");
    vi.stubEnv("CLOVER_CHARGE_ENDPOINT", "https://scl-sandbox.dev.clover.com/v1/charges");
    vi.stubEnv("CLOVER_REFUND_ENDPOINT", "https://scl-sandbox.dev.clover.com/v1/refunds");
    vi.stubEnv("CLOVER_APPLE_PAY_TOKENIZE_ENDPOINT", "https://token-sandbox.dev.clover.com/v1/tokens");

    const fetchMock = vi.fn<typeof fetch>();
    vi.stubGlobal("fetch", fetchMock);
    fetchMock.mockImplementation(async (input, init) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url === "https://token-sandbox.dev.clover.com/v1/tokens") {
        const headers = new Headers(init?.headers);
        expect(headers.get("apikey")).toBe("test-public-api-access-key");
        expect(headers.get("authorization")).toBeNull();
        expect(headers.get("content-type")).toBe("application/json");
        expect(JSON.parse(String(init?.body ?? "{}"))).toMatchObject({
          encryptedWallet: {
            applePayPaymentData: {
              version: "EC_v1",
              data: "wallet-payment-data"
            }
          }
        });

        return new Response(
          JSON.stringify({
            id: "clv_source_token_1"
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        );
      }

      if (url === "https://scl-sandbox.dev.clover.com/v1/charges") {
        const headers = new Headers(init?.headers);
        expect(headers.get("authorization")).toBe("Bearer test-bearer-token");
        expect(headers.get("apikey")).toBeNull();

        return new Response(
          JSON.stringify({
            id: "clv-charge-wallet-1",
            status: "APPROVED",
            approved: true,
            message: "Charge accepted"
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
      headers: internalHeaders(),
      payload: {
        orderId: "123e4567-e89b-12d3-a456-426614174088",
        amountCents: 1200,
        currency: "USD",
        applePayWallet: {
          version: "EC_v1",
          data: "wallet-payment-data",
          signature: "wallet-signature",
          header: {
            ephemeralPublicKey: "ephemeral-key",
            publicKeyHash: "public-key-hash",
            transactionId: "transaction-id"
          }
        },
        idempotencyKey: "live-wallet-charge-1"
      }
    });

    expect(chargeResponse.statusCode).toBe(200);
    expect(chargeResponse.json()).toMatchObject({
      provider: "CLOVER",
      status: "SUCCEEDED",
      approved: true
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    await app.close();
  });

  it("stores Clover OAuth credentials from callback and uses them for live wallet charges", async () => {
    vi.stubEnv("CLOVER_PROVIDER_MODE", "live");
    vi.stubEnv("CLOVER_APP_ID", "clover-app-id");
    vi.stubEnv("CLOVER_APP_SECRET", "clover-app-secret");
    vi.stubEnv("CLOVER_OAUTH_REDIRECT_URI", "https://example.test/v1/payments/clover/oauth/callback");
    vi.stubEnv("CLOVER_MERCHANT_ID", "merchant-oauth-1");
    vi.stubEnv("CLOVER_CHARGE_ENDPOINT", "https://scl-sandbox.dev.clover.com/v1/charges");
    vi.stubEnv("CLOVER_REFUND_ENDPOINT", "https://scl-sandbox.dev.clover.com/v1/refunds");
    vi.stubEnv("CLOVER_APPLE_PAY_TOKENIZE_ENDPOINT", "https://token-sandbox.dev.clover.com/v1/tokens");

    const fetchMock = vi.fn<typeof fetch>();
    vi.stubGlobal("fetch", fetchMock);
    fetchMock.mockImplementation(async (input, init) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url === "https://apisandbox.dev.clover.com/oauth/v2/token") {
        const headers = new Headers(init?.headers);
        expect(headers.get("content-type")).toBe("application/json");
        expect(JSON.parse(String(init?.body ?? "{}"))).toMatchObject({
          client_id: "clover-app-id",
          client_secret: "clover-app-secret",
          code: "oauth-code-1"
        });

        return new Response(
          JSON.stringify({
            access_token: "oauth-access-token-1",
            refresh_token: "oauth-refresh-token-1",
            token_type: "Bearer",
            access_token_expiration: Math.floor(Date.now() / 1000) + 3600,
            refresh_token_expiration: Math.floor(Date.now() / 1000) + 7200
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        );
      }

      if (url === "https://scl-sandbox.dev.clover.com/pakms/apikey") {
        const headers = new Headers(init?.headers);
        expect(headers.get("authorization")).toBe("Bearer oauth-access-token-1");

        return new Response(
          JSON.stringify({
            apiAccessKey: "oauth-api-access-key-1"
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        );
      }

      if (url === "https://token-sandbox.dev.clover.com/v1/tokens") {
        const headers = new Headers(init?.headers);
        expect(headers.get("apikey")).toBe("oauth-api-access-key-1");
        expect(headers.get("authorization")).toBeNull();

        return new Response(
          JSON.stringify({
            id: "oauth-wallet-source-token"
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        );
      }

      if (url === "https://scl-sandbox.dev.clover.com/v1/charges") {
        const headers = new Headers(init?.headers);
        expect(headers.get("authorization")).toBe("Bearer oauth-access-token-1");

        return new Response(
          JSON.stringify({
            id: "oauth-charge-1",
            status: "APPROVED",
            approved: true,
            message: "Charge accepted"
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        );
      }

      throw new Error(`unexpected live Clover URL: ${url}`);
    });

    const app = await buildApp();
    const connectResponse = await app.inject({
      method: "GET",
      url: "/v1/payments/clover/oauth/connect"
    });
    expect(connectResponse.statusCode).toBe(200);

    const authorizeUrl = new URL((connectResponse.json() as { authorizeUrl: string }).authorizeUrl);
    const state = authorizeUrl.searchParams.get("state");
    expect(state).toEqual(expect.any(String));

    const callbackResponse = await app.inject({
      method: "GET",
      url: `/v1/payments/clover/oauth/callback?code=oauth-code-1&state=${encodeURIComponent(String(state))}&merchant_id=merchant-oauth-1`
    });
    expect(callbackResponse.statusCode).toBe(200);
    expect(callbackResponse.json()).toMatchObject({
      providerMode: "live",
      oauthConfigured: true,
      connected: true,
      credentialSource: "oauth",
      merchantId: "merchant-oauth-1",
      connectedMerchantId: "merchant-oauth-1",
      apiAccessKeyConfigured: true
    });

    const readyResponse = await app.inject({ method: "GET", url: "/ready" });
    expect(readyResponse.statusCode).toBe(200);
    expect(readyResponse.json()).toMatchObject({
      status: "ready",
      providerMode: "live",
      providerConfigured: true
    });

    const chargeResponse = await app.inject({
      method: "POST",
      url: "/v1/payments/charges",
      headers: internalHeaders(),
      payload: {
        orderId: "123e4567-e89b-12d3-a456-426614174089",
        amountCents: 1200,
        currency: "USD",
        applePayWallet: {
          version: "EC_v1",
          data: "wallet-payment-data",
          signature: "wallet-signature",
          header: {
            ephemeralPublicKey: "ephemeral-key",
            publicKeyHash: "public-key-hash",
            transactionId: "transaction-id"
          }
        },
        idempotencyKey: "oauth-wallet-charge-1"
      }
    });

    expect(chargeResponse.statusCode).toBe(200);
    expect(chargeResponse.json()).toMatchObject({
      provider: "CLOVER",
      status: "SUCCEEDED",
      approved: true
    });
    expect(fetchMock).toHaveBeenCalledTimes(4);
    await app.close();
  });

  it("reconciles charge webhooks and dispatches order updates", async () => {
    const fetchMock = vi.fn<typeof fetch>();
    vi.stubGlobal("fetch", fetchMock);
    fetchMock.mockImplementation(async (input, init) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url === "http://127.0.0.1:3001/v1/orders/internal/payments/reconcile") {
        const headers = new Headers(init?.headers);
        expect(headers.get("x-internal-token")).toBe(internalPaymentsToken);
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
      headers: internalHeaders(),
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
      headers: webhookHeaders(),
      payload: {
        type: "payment.updated",
        paymentId: chargeResponse.json().paymentId,
        orderId,
        status: "APPROVED",
        message: "Settled asynchronously",
        occurredAt: "2026-03-11T00:00:00.000Z"
      }
    });
    const duplicateWebhookResponse = await app.inject({
      method: "POST",
      url: "/v1/payments/webhooks/clover",
      headers: webhookHeaders(),
      payload: {
        type: "payment.updated",
        paymentId: chargeResponse.json().paymentId,
        orderId,
        status: "APPROVED",
        message: "Settled asynchronously",
        occurredAt: "2026-03-11T00:00:00.000Z"
      }
    });

    expect(webhookResponse.statusCode).toBe(200);
    expect(duplicateWebhookResponse.statusCode).toBe(200);
    expect(duplicateWebhookResponse.json()).toMatchObject(webhookResponse.json());
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
        const headers = new Headers(init?.headers);
        expect(headers.get("x-internal-token")).toBe(internalPaymentsToken);
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
      headers: internalHeaders(),
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
      headers: internalHeaders(),
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
      headers: webhookHeaders(),
      payload: {
        type: "refund.updated",
        paymentId: chargeResponse.json().paymentId,
        orderId,
        status: "REFUNDED",
        message: "Refund finalized",
        occurredAt: "2026-03-11T01:00:00.000Z"
      }
    });
    const duplicateWebhookResponse = await app.inject({
      method: "POST",
      url: "/v1/payments/webhooks/clover",
      headers: webhookHeaders(),
      payload: {
        type: "refund.updated",
        paymentId: chargeResponse.json().paymentId,
        orderId,
        status: "REFUNDED",
        message: "Refund finalized",
        occurredAt: "2026-03-11T01:00:00.000Z"
      }
    });

    expect(webhookResponse.statusCode).toBe(200);
    expect(duplicateWebhookResponse.statusCode).toBe(200);
    expect(duplicateWebhookResponse.json()).toMatchObject(webhookResponse.json());
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

  it("retries webhook reconciliation after a transient downstream failure", async () => {
    const fetchMock = vi.fn<typeof fetch>();
    vi.stubGlobal("fetch", fetchMock);
    let reconcileAttempts = 0;
    fetchMock.mockImplementation(async (input, init) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url === "http://127.0.0.1:3001/v1/orders/internal/payments/reconcile") {
        reconcileAttempts += 1;
        if (reconcileAttempts === 1) {
          return new Response(
            JSON.stringify({
              code: "ORDERS_RECONCILIATION_FAILED",
              message: "Orders reconciliation call failed",
              requestId: "payments-test"
            }),
            { status: 502, headers: { "content-type": "application/json" } }
          );
        }

        const headers = new Headers(init?.headers);
        expect(headers.get("x-internal-token")).toBe(internalPaymentsToken);
        const body = JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>;
        expect(body.kind).toBe("CHARGE");
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
    const orderId = "123e4567-e89b-12d3-a456-426614174039";
    const chargeResponse = await app.inject({
      method: "POST",
      url: "/v1/payments/charges",
      headers: internalHeaders(),
      payload: {
        orderId,
        amountCents: 1045,
        currency: "USD",
        applePayToken: "apple-pay-success-token",
        idempotencyKey: "webhook-retry-charge"
      }
    });
    expect(chargeResponse.statusCode).toBe(200);

    const webhookPayload = {
      type: "payment.updated",
      paymentId: chargeResponse.json().paymentId,
      orderId,
      status: "APPROVED",
      message: "Settled asynchronously",
      occurredAt: "2026-03-11T02:00:00.000Z"
    };

    const firstWebhook = await app.inject({
      method: "POST",
      url: "/v1/payments/webhooks/clover",
      headers: webhookHeaders(),
      payload: webhookPayload
    });
    const secondWebhook = await app.inject({
      method: "POST",
      url: "/v1/payments/webhooks/clover",
      headers: webhookHeaders(),
      payload: webhookPayload
    });

    expect(firstWebhook.statusCode).toBe(502);
    expect(firstWebhook.json()).toMatchObject({ code: "ORDERS_RECONCILIATION_FAILED" });
    expect(secondWebhook.statusCode).toBe(200);
    expect(secondWebhook.json()).toMatchObject({
      accepted: true,
      kind: "CHARGE",
      orderId,
      status: "SUCCEEDED",
      orderApplied: true
    });
    expect(reconcileAttempts).toBe(2);
    await app.close();
  });

  it("accepts Clover webhook verification payloads before webhook auth is configured", async () => {
    vi.stubEnv("CLOVER_WEBHOOK_SHARED_SECRET", "");
    const app = await buildApp();
    const response = await app.inject({
      method: "POST",
      url: "/v1/payments/webhooks/clover",
      payload: {
        verificationCode: "verify-me-123"
      }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      accepted: true,
      verificationCode: "verify-me-123"
    });
    await app.close();
  });

  it("exposes the latest Clover webhook verification code through a short-lived status endpoint", async () => {
    vi.stubEnv("CLOVER_WEBHOOK_SHARED_SECRET", "");
    const app = await buildApp();

    const missingResponse = await app.inject({
      method: "GET",
      url: "/v1/payments/clover/webhooks/verification-code"
    });
    expect(missingResponse.statusCode).toBe(404);
    expect(missingResponse.json()).toMatchObject({
      code: "CLOVER_WEBHOOK_VERIFICATION_CODE_NOT_FOUND"
    });

    const webhookResponse = await app.inject({
      method: "POST",
      url: "/v1/payments/webhooks/clover",
      payload: {
        verificationCode: "verify-me-123"
      }
    });
    expect(webhookResponse.statusCode).toBe(200);

    const latestResponse = await app.inject({
      method: "GET",
      url: "/v1/payments/clover/webhooks/verification-code"
    });
    expect(latestResponse.statusCode).toBe(200);
    expect(latestResponse.json()).toMatchObject({
      available: true,
      verificationCode: "verify-me-123"
    });

    await app.close();
  });

  it("accepts Clover webhook deliveries authenticated via x-clover-auth", async () => {
    const fetchMock = vi.fn<typeof fetch>();
    vi.stubGlobal("fetch", fetchMock);
    fetchMock.mockImplementation(async (input, init) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url === "http://127.0.0.1:3001/v1/orders/internal/payments/reconcile") {
        const headers = new Headers(init?.headers);
        expect(headers.get("x-internal-token")).toBe(internalPaymentsToken);
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
    const orderId = "123e4567-e89b-12d3-a456-426614174041";
    const chargeResponse = await app.inject({
      method: "POST",
      url: "/v1/payments/charges",
      headers: internalHeaders(),
      payload: {
        orderId,
        amountCents: 1145,
        currency: "USD",
        applePayToken: "apple-pay-success-token",
        idempotencyKey: "webhook-clover-auth-charge"
      }
    });
    expect(chargeResponse.statusCode).toBe(200);

    const webhookResponse = await app.inject({
      method: "POST",
      url: "/v1/payments/webhooks/clover",
      headers: {
        "x-clover-auth": cloverWebhookSecret
      },
      payload: {
        type: "payment.updated",
        paymentId: chargeResponse.json().paymentId,
        orderId,
        status: "APPROVED",
        message: "Settled asynchronously",
        occurredAt: "2026-03-11T03:00:00.000Z"
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

  it("rejects webhook requests when shared secret is configured and missing", async () => {
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

  it("fails closed when Clover webhook auth is not configured", async () => {
    vi.stubEnv("CLOVER_WEBHOOK_SHARED_SECRET", "");
    const app = await buildApp();
    const response = await app.inject({
      method: "POST",
      url: "/v1/payments/webhooks/clover",
      headers: webhookHeaders(),
      payload: {
        type: "payment.updated",
        paymentId: "clv-charge-unknown",
        orderId: "123e4567-e89b-12d3-a456-426614174035",
        status: "APPROVED"
      }
    });

    expect(response.statusCode).toBe(503);
    expect(response.json()).toMatchObject({ code: "WEBHOOK_AUTH_NOT_CONFIGURED" });
    await app.close();
  });
});
