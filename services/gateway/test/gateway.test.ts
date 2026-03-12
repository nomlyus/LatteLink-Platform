import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildApp } from "../src/app.js";

describe("gateway", () => {
  const fetchMock = vi.fn<typeof fetch>();
  const authHeader = { authorization: "Bearer access-token" } as const;
  let previousIdentityBaseUrl: string | undefined;
  let previousOrdersBaseUrl: string | undefined;
  let previousCatalogBaseUrl: string | undefined;
  let previousLoyaltyBaseUrl: string | undefined;
  let previousNotificationsBaseUrl: string | undefined;

  beforeEach(() => {
    fetchMock.mockReset();
    previousIdentityBaseUrl = process.env.IDENTITY_SERVICE_BASE_URL;
    previousOrdersBaseUrl = process.env.ORDERS_SERVICE_BASE_URL;
    previousCatalogBaseUrl = process.env.CATALOG_SERVICE_BASE_URL;
    previousLoyaltyBaseUrl = process.env.LOYALTY_SERVICE_BASE_URL;
    previousNotificationsBaseUrl = process.env.NOTIFICATIONS_SERVICE_BASE_URL;
    process.env.IDENTITY_SERVICE_BASE_URL = "http://identity.internal";
    process.env.ORDERS_SERVICE_BASE_URL = "http://orders.internal";
    process.env.CATALOG_SERVICE_BASE_URL = "http://catalog.internal";
    process.env.LOYALTY_SERVICE_BASE_URL = "http://loyalty.internal";
    process.env.NOTIFICATIONS_SERVICE_BASE_URL = "http://notifications.internal";
    vi.stubGlobal("fetch", fetchMock);

    fetchMock.mockImplementation(async (input, init) => {
      const url = typeof input === "string" ? input : input.url;
      const method = init?.method ?? "GET";
      const authHeader = init?.headers ? new Headers(init.headers as HeadersInit).get("authorization") : null;

      if (url.endsWith("/v1/auth/apple/exchange") && method === "POST") {
        const body = JSON.parse(String(init?.body ?? "{}")) as { nonce?: string };
        return new Response(
          JSON.stringify({
            accessToken: `access-${body.nonce ?? "unknown"}`,
            refreshToken: "refresh-token",
            expiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
            userId: "123e4567-e89b-12d3-a456-426614174000"
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        );
      }

      if (url.endsWith("/v1/auth/magic-link/request") && method === "POST") {
        return new Response(JSON.stringify({ success: true }), {
          status: 200,
          headers: { "content-type": "application/json" }
        });
      }

      if (url.endsWith("/v1/auth/me") && method === "GET") {
        if (!authHeader) {
          return new Response(
            JSON.stringify({
              code: "UNAUTHORIZED",
              message: "Missing or invalid auth token",
              requestId: "identity-stub"
            }),
            { status: 401, headers: { "content-type": "application/json" } }
          );
        }

        return new Response(
          JSON.stringify({
            userId: "123e4567-e89b-12d3-a456-426614174000",
            email: "owner@gazellecoffee.com",
            methods: ["apple", "passkey", "magic-link"]
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        );
      }

      if (url.endsWith("/v1/menu") && method === "GET") {
        return new Response(
          JSON.stringify({
            locationId: "flagship-01",
            currency: "USD",
            categories: [
              {
                id: "espresso",
                title: "Espresso Bar",
                items: [
                  {
                    id: "cortado",
                    name: "Cortado",
                    description: "Double espresso cut with steamed milk.",
                    priceCents: 475,
                    badgeCodes: ["new"],
                    visible: true
                  }
                ]
              }
            ]
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        );
      }

      if (url.endsWith("/v1/store/config") && method === "GET") {
        return new Response(
          JSON.stringify({
            locationId: "flagship-01",
            prepEtaMinutes: 12,
            taxRateBasisPoints: 600,
            pickupInstructions: "Pickup at the flagship order counter."
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        );
      }

      if (url.endsWith("/v1/orders/quote") && method === "POST") {
        const body = JSON.parse(String(init?.body ?? "{}")) as {
          locationId: string;
          items: Array<{ itemId: string; quantity: number }>;
          pointsToRedeem?: number;
        };
        const quotedItems = (body.items ?? []).map((item) => ({
          itemId: item.itemId,
          quantity: item.quantity,
          unitPriceCents: 500
        }));
        const subtotalCents = quotedItems.reduce((sum, item) => sum + item.unitPriceCents * item.quantity, 0);
        const pointsToRedeem = body.pointsToRedeem ?? 0;
        const taxCents = Math.round((Math.max(subtotalCents - pointsToRedeem, 0) * 600) / 10000);
        const totalCents = Math.max(subtotalCents - pointsToRedeem, 0) + taxCents;

        return new Response(
          JSON.stringify({
            quoteId: "123e4567-e89b-12d3-a456-426614174111",
            locationId: body.locationId ?? "flagship-01",
            items: quotedItems,
            subtotal: { currency: "USD", amountCents: subtotalCents },
            discount: { currency: "USD", amountCents: pointsToRedeem },
            tax: { currency: "USD", amountCents: taxCents },
            total: { currency: "USD", amountCents: totalCents },
            pointsToRedeem,
            quoteHash: "gateway-quote-hash"
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        );
      }

      if (url.endsWith("/v1/orders") && method === "POST") {
        const body = JSON.parse(String(init?.body ?? "{}")) as { quoteHash: string };
        return new Response(
          JSON.stringify({
            id: "123e4567-e89b-12d3-a456-426614174112",
            locationId: "flagship-01",
            status: "PENDING_PAYMENT",
            items: [],
            total: { currency: "USD", amountCents: 530 },
            pickupCode: body.quoteHash.slice(0, 6).toUpperCase(),
            timeline: [
              {
                status: "PENDING_PAYMENT",
                occurredAt: new Date().toISOString()
              }
            ]
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        );
      }

      const payOrderMatch = url.match(/\/v1\/orders\/([0-9a-f-]{36})\/pay$/);
      if (payOrderMatch && method === "POST") {
        const orderId = payOrderMatch[1];
        return new Response(
          JSON.stringify({
            id: orderId,
            locationId: "flagship-01",
            status: "PAID",
            items: [],
            total: { currency: "USD", amountCents: 530 },
            pickupCode: "PAID01",
            timeline: [
              {
                status: "PENDING_PAYMENT",
                occurredAt: new Date(Date.now() - 60000).toISOString()
              },
              {
                status: "PAID",
                occurredAt: new Date().toISOString(),
                note: "Payment accepted"
              }
            ]
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        );
      }

      if (url.endsWith("/v1/orders") && method === "GET") {
        return new Response(JSON.stringify([]), {
          status: 200,
          headers: { "content-type": "application/json" }
        });
      }

      const getOrderMatch = url.match(/\/v1\/orders\/([0-9a-f-]{36})$/);
      if (getOrderMatch && method === "GET") {
        const orderId = getOrderMatch[1];
        return new Response(
          JSON.stringify({
            id: orderId,
            locationId: "flagship-01",
            status: "IN_PREP",
            items: [],
            total: { currency: "USD", amountCents: 530 },
            pickupCode: "PREP01",
            timeline: [
              {
                status: "PENDING_PAYMENT",
                occurredAt: new Date(Date.now() - 120000).toISOString()
              },
              {
                status: "PAID",
                occurredAt: new Date(Date.now() - 60000).toISOString(),
                note: "Payment accepted"
              },
              {
                status: "IN_PREP",
                occurredAt: new Date().toISOString()
              }
            ]
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        );
      }

      const cancelOrderMatch = url.match(/\/v1\/orders\/([0-9a-f-]{36})\/cancel$/);
      if (cancelOrderMatch && method === "POST") {
        const orderId = cancelOrderMatch[1];
        return new Response(
          JSON.stringify({
            id: orderId,
            locationId: "flagship-01",
            status: "CANCELED",
            items: [],
            total: { currency: "USD", amountCents: 530 },
            pickupCode: "CANCEL",
            timeline: [
              {
                status: "PENDING_PAYMENT",
                occurredAt: new Date(Date.now() - 120000).toISOString()
              },
              {
                status: "CANCELED",
                occurredAt: new Date().toISOString(),
                note: "Canceled by customer"
              }
            ]
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        );
      }

      if (url.endsWith("/v1/loyalty/balance") && method === "GET") {
        return new Response(
          JSON.stringify({
            userId: "123e4567-e89b-12d3-a456-426614174000",
            availablePoints: 240,
            pendingPoints: 0,
            lifetimeEarned: 600
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        );
      }

      if (url.endsWith("/v1/loyalty/ledger") && method === "GET") {
        return new Response(
          JSON.stringify([
            {
              id: "123e4567-e89b-12d3-a456-426614174210",
              type: "EARN",
              points: 240,
              orderId: "123e4567-e89b-12d3-a456-426614174211",
              createdAt: "2026-03-10T15:00:00.000Z"
            },
            {
              id: "123e4567-e89b-12d3-a456-426614174212",
              type: "REDEEM",
              points: -120,
              orderId: "123e4567-e89b-12d3-a456-426614174213",
              createdAt: "2026-03-10T14:00:00.000Z"
            }
          ]),
          { status: 200, headers: { "content-type": "application/json" } }
        );
      }

      if (url.endsWith("/v1/devices/push-token") && method === "PUT") {
        return new Response(JSON.stringify({ success: true }), {
          status: 200,
          headers: { "content-type": "application/json" }
        });
      }

      return new Response(JSON.stringify({ code: "NOT_IMPLEMENTED" }), { status: 500 });
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    if (previousIdentityBaseUrl === undefined) {
      delete process.env.IDENTITY_SERVICE_BASE_URL;
    } else {
      process.env.IDENTITY_SERVICE_BASE_URL = previousIdentityBaseUrl;
    }

    if (previousOrdersBaseUrl === undefined) {
      delete process.env.ORDERS_SERVICE_BASE_URL;
    } else {
      process.env.ORDERS_SERVICE_BASE_URL = previousOrdersBaseUrl;
    }

    if (previousCatalogBaseUrl === undefined) {
      delete process.env.CATALOG_SERVICE_BASE_URL;
    } else {
      process.env.CATALOG_SERVICE_BASE_URL = previousCatalogBaseUrl;
    }

    if (previousLoyaltyBaseUrl === undefined) {
      delete process.env.LOYALTY_SERVICE_BASE_URL;
    } else {
      process.env.LOYALTY_SERVICE_BASE_URL = previousLoyaltyBaseUrl;
    }

    if (previousNotificationsBaseUrl === undefined) {
      delete process.env.NOTIFICATIONS_SERVICE_BASE_URL;
    } else {
      process.env.NOTIFICATIONS_SERVICE_BASE_URL = previousNotificationsBaseUrl;
    }
  });

  it("returns health", async () => {
    const app = await buildApp();
    const response = await app.inject({ method: "GET", url: "/health" });

    expect(response.statusCode).toBe(200);
    await app.close();
  });

  it("returns v1 menu", async () => {
    const app = await buildApp();
    const response = await app.inject({ method: "GET", url: "/v1/menu" });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      locationId: "flagship-01",
      categories: expect.arrayContaining([expect.objectContaining({ id: "espresso" })])
    });
    const requestedUrls = fetchMock.mock.calls.map(([input]) => (typeof input === "string" ? input : input.url));
    expect(requestedUrls).toContain("http://catalog.internal/v1/menu");
    await app.close();
  });

  it("returns unauthorized on /v1/auth/me without bearer token", async () => {
    const app = await buildApp();
    const response = await app.inject({ method: "GET", url: "/v1/auth/me" });

    expect(response.statusCode).toBe(401);
    expect(fetchMock).not.toHaveBeenCalled();
    await app.close();
  });

  it("forwards apple exchange to identity", async () => {
    const app = await buildApp();
    const response = await app.inject({
      method: "POST",
      url: "/v1/auth/apple/exchange",
      payload: {
        identityToken: "identity-token",
        authorizationCode: "auth-code",
        nonce: "gateway-proxy"
      }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().accessToken).toContain("gateway-proxy");
    await app.close();
  });

  it("requests magic link", async () => {
    const app = await buildApp();
    const response = await app.inject({
      method: "POST",
      url: "/v1/auth/magic-link/request",
      payload: { email: "owner@gazellecoffee.com" }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ success: true });
    await app.close();
  });

  it("forwards /v1/auth/me with bearer token", async () => {
    const app = await buildApp();
    const response = await app.inject({
      method: "GET",
      url: "/v1/auth/me",
      headers: {
        authorization: "Bearer access-token"
      }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      email: "owner@gazellecoffee.com"
    });
    await app.close();
  });

  it("forwards orders quote to orders service", async () => {
    const app = await buildApp();
    const response = await app.inject({
      method: "POST",
      url: "/v1/orders/quote",
      headers: authHeader,
      payload: {
        locationId: "flagship-01",
        items: [{ itemId: "latte", quantity: 1 }],
        pointsToRedeem: 0
      }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      quoteId: "123e4567-e89b-12d3-a456-426614174111"
    });
    await app.close();
  });

  it("forwards orders lifecycle routes", async () => {
    const app = await buildApp();
    const orderId = "123e4567-e89b-12d3-a456-426614174113";

    const payResponse = await app.inject({
      method: "POST",
      url: `/v1/orders/${orderId}/pay`,
      headers: authHeader,
      payload: {
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
        idempotencyKey: "pay-1"
      }
    });
    expect(payResponse.statusCode).toBe(200);
    expect(payResponse.json()).toMatchObject({ id: orderId, status: "PAID" });

    const getResponse = await app.inject({
      method: "GET",
      url: `/v1/orders/${orderId}`,
      headers: authHeader
    });
    expect(getResponse.statusCode).toBe(200);
    expect(getResponse.json()).toMatchObject({ id: orderId, status: "IN_PREP" });

    const cancelResponse = await app.inject({
      method: "POST",
      url: `/v1/orders/${orderId}/cancel`,
      headers: authHeader,
      payload: { reason: "changed mind" }
    });
    expect(cancelResponse.statusCode).toBe(200);
    expect(cancelResponse.json()).toMatchObject({ id: orderId, status: "CANCELED" });

    await app.close();
  });

  it("forwards loyalty balance and ledger routes", async () => {
    const app = await buildApp();

    const balanceResponse = await app.inject({
      method: "GET",
      url: "/v1/loyalty/balance",
      headers: authHeader
    });
    expect(balanceResponse.statusCode).toBe(200);
    expect(balanceResponse.json()).toMatchObject({
      availablePoints: 240,
      lifetimeEarned: 600
    });

    const ledgerResponse = await app.inject({
      method: "GET",
      url: "/v1/loyalty/ledger",
      headers: authHeader
    });
    expect(ledgerResponse.statusCode).toBe(200);
    expect(ledgerResponse.json()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: "EARN", points: 240 }),
        expect.objectContaining({ type: "REDEEM", points: -120 })
      ])
    );

    const requestedUrls = fetchMock.mock.calls.map(([input]) => (typeof input === "string" ? input : input.url));
    expect(requestedUrls).toContain("http://loyalty.internal/v1/loyalty/balance");
    expect(requestedUrls).toContain("http://loyalty.internal/v1/loyalty/ledger");

    await app.close();
  });

  it("forwards push-token upsert to notifications service", async () => {
    const app = await buildApp();
    const response = await app.inject({
      method: "PUT",
      url: "/v1/devices/push-token",
      headers: {
        ...authHeader,
        "x-user-id": "123e4567-e89b-12d3-a456-426614174000"
      },
      payload: {
        deviceId: "ios-device-1",
        platform: "ios",
        expoPushToken: "ExponentPushToken[abc123]"
      }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ success: true });

    const upsertCall = fetchMock.mock.calls.find(([input]) =>
      (typeof input === "string" ? input : input.url).endsWith("/v1/devices/push-token")
    );
    expect(upsertCall).toBeDefined();
    if (upsertCall) {
      expect(typeof upsertCall[0] === "string" ? upsertCall[0] : upsertCall[0].url).toBe(
        "http://notifications.internal/v1/devices/push-token"
      );
    }

    await app.close();
  });

  it("propagates x-request-id upstream and exposes metrics counters", async () => {
    const app = await buildApp();
    const requestId = "trace-request-123";

    const quoteResponse = await app.inject({
      method: "POST",
      url: "/v1/orders/quote",
      headers: {
        ...authHeader,
        "x-request-id": requestId
      },
      payload: {
        locationId: "flagship-01",
        items: [{ itemId: "latte", quantity: 1 }],
        pointsToRedeem: 0
      }
    });
    expect(quoteResponse.statusCode).toBe(200);
    expect(quoteResponse.headers["x-request-id"]).toBe(requestId);

    const quoteCall = fetchMock.mock.calls.find(([input]) =>
      (typeof input === "string" ? input : input.url).endsWith("/v1/orders/quote")
    );
    expect(quoteCall).toBeDefined();
    if (quoteCall) {
      const upstreamHeaders = new Headers((quoteCall[1]?.headers ?? {}) as HeadersInit);
      expect(upstreamHeaders.get("x-request-id")).toBe(requestId);
    }

    const metricsResponse = await app.inject({
      method: "GET",
      url: "/metrics"
    });
    expect(metricsResponse.statusCode).toBe(200);
    expect(metricsResponse.json()).toMatchObject({
      service: "gateway",
      requests: expect.objectContaining({
        total: expect.any(Number),
        status2xx: expect.any(Number),
        status4xx: expect.any(Number),
        status5xx: expect.any(Number)
      })
    });
    expect(metricsResponse.json().requests.total).toBeGreaterThanOrEqual(1);

    await app.close();
  });

  it("returns unauthorized on protected orders route without bearer token", async () => {
    const app = await buildApp();
    const response = await app.inject({
      method: "POST",
      url: "/v1/orders/quote",
      payload: {
        locationId: "flagship-01",
        items: [{ itemId: "latte", quantity: 1 }],
        pointsToRedeem: 0
      }
    });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({ code: "UNAUTHORIZED" });
    await app.close();
  });

  it("rate limits auth endpoints when configured threshold is reached", async () => {
    vi.stubEnv("GATEWAY_RATE_LIMIT_AUTH_MAX", "1");
    vi.stubEnv("GATEWAY_RATE_LIMIT_WINDOW_MS", "60000");
    const app = await buildApp();

    try {
      const firstRequest = await app.inject({
        method: "POST",
        url: "/v1/auth/magic-link/request",
        payload: { email: "owner@gazellecoffee.com" }
      });
      expect(firstRequest.statusCode).toBe(200);

      const secondRequest = await app.inject({
        method: "POST",
        url: "/v1/auth/magic-link/request",
        payload: { email: "owner@gazellecoffee.com" }
      });
      expect(secondRequest.statusCode).toBe(429);
    } finally {
      vi.unstubAllEnvs();
      await app.close();
    }
  });

  it("rate limits order write endpoints when configured threshold is reached", async () => {
    vi.stubEnv("GATEWAY_RATE_LIMIT_ORDERS_WRITE_MAX", "1");
    vi.stubEnv("GATEWAY_RATE_LIMIT_WINDOW_MS", "60000");
    const app = await buildApp();

    try {
      const firstRequest = await app.inject({
        method: "POST",
        url: "/v1/orders/quote",
        headers: authHeader,
        payload: {
          locationId: "flagship-01",
          items: [{ itemId: "latte", quantity: 1 }],
          pointsToRedeem: 0
        }
      });
      expect(firstRequest.statusCode).toBe(200);

      const secondRequest = await app.inject({
        method: "POST",
        url: "/v1/orders/quote",
        headers: authHeader,
        payload: {
          locationId: "flagship-01",
          items: [{ itemId: "latte", quantity: 1 }],
          pointsToRedeem: 0
        }
      });
      expect(secondRequest.statusCode).toBe(429);
    } finally {
      vi.unstubAllEnvs();
      await app.close();
    }
  });
});
