import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildApp } from "../src/app.js";

describe("gateway", () => {
  const fetchMock = vi.fn<typeof fetch>();
  const authHeader = { authorization: "Bearer access-token" } as const;
  const staffHeaders = {
    authorization: "Bearer staff-token",
    "x-staff-token": "staff-token"
  } as const;
  let previousIdentityBaseUrl: string | undefined;
  let previousOrdersBaseUrl: string | undefined;
  let previousCatalogBaseUrl: string | undefined;
  let previousLoyaltyBaseUrl: string | undefined;
  let previousNotificationsBaseUrl: string | undefined;
  let previousGatewayInternalToken: string | undefined;
  let previousGatewayStaffToken: string | undefined;
  let previousOrdersInternalToken: string | undefined;
  let previousGatewayOrderStreamPollMs: string | undefined;
  let queuedOrderStatuses: Map<string, Array<"PENDING_PAYMENT" | "PAID" | "IN_PREP" | "READY" | "COMPLETED" | "CANCELED">>;

  function buildOrderPayload(
    orderId: string,
    status: "PENDING_PAYMENT" | "PAID" | "IN_PREP" | "READY" | "COMPLETED" | "CANCELED"
  ) {
    const now = Date.now();
    const timeline = [
      {
        status: "PENDING_PAYMENT" as const,
        occurredAt: new Date(now - 180000).toISOString()
      }
    ];

    if (status !== "PENDING_PAYMENT") {
      timeline.push({
        status: "PAID",
        occurredAt: new Date(now - 120000).toISOString(),
        note: "Payment accepted"
      });
    }

    if (status === "IN_PREP" || status === "READY" || status === "COMPLETED") {
      timeline.push({
        status: "IN_PREP",
        occurredAt: new Date(now - 60000).toISOString()
      });
    }

    if (status === "READY" || status === "COMPLETED") {
      timeline.push({
        status: "READY",
        occurredAt: new Date(now - 30000).toISOString()
      });
    }

    if (status === "COMPLETED" || status === "CANCELED") {
      timeline.push({
        status,
        occurredAt: new Date(now).toISOString()
      });
    }

    return {
      id: orderId,
      locationId: "flagship-01",
      status,
      items: [],
      total: { currency: "USD", amountCents: 530 },
      pickupCode: status === "COMPLETED" ? "DONE01" : status === "CANCELED" ? "CANCEL" : "PREP01",
      timeline
    };
  }

  beforeEach(() => {
    fetchMock.mockReset();
    previousIdentityBaseUrl = process.env.IDENTITY_SERVICE_BASE_URL;
    previousOrdersBaseUrl = process.env.ORDERS_SERVICE_BASE_URL;
    previousCatalogBaseUrl = process.env.CATALOG_SERVICE_BASE_URL;
    previousLoyaltyBaseUrl = process.env.LOYALTY_SERVICE_BASE_URL;
    previousNotificationsBaseUrl = process.env.NOTIFICATIONS_SERVICE_BASE_URL;
    previousGatewayInternalToken = process.env.GATEWAY_INTERNAL_API_TOKEN;
    previousGatewayStaffToken = process.env.GATEWAY_STAFF_API_TOKEN;
    previousOrdersInternalToken = process.env.ORDERS_INTERNAL_API_TOKEN;
    previousGatewayOrderStreamPollMs = process.env.GATEWAY_ORDER_STREAM_POLL_MS;
    queuedOrderStatuses = new Map();
    process.env.IDENTITY_SERVICE_BASE_URL = "http://identity.internal";
    process.env.ORDERS_SERVICE_BASE_URL = "http://orders.internal";
    process.env.CATALOG_SERVICE_BASE_URL = "http://catalog.internal";
    process.env.LOYALTY_SERVICE_BASE_URL = "http://loyalty.internal";
    process.env.NOTIFICATIONS_SERVICE_BASE_URL = "http://notifications.internal";
    process.env.GATEWAY_INTERNAL_API_TOKEN = "gateway-test-token";
    process.env.GATEWAY_STAFF_API_TOKEN = "staff-token";
    process.env.ORDERS_INTERNAL_API_TOKEN = "orders-internal-token";
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

      if (url.endsWith("/v1/operator/auth/dev-access") && method === "POST") {
        const body = JSON.parse(String(init?.body ?? "{}")) as { email?: string };
        return new Response(
          JSON.stringify({
            accessToken: "operator-access-token",
            refreshToken: "operator-refresh-token",
            expiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
            operator: {
              operatorUserId: "123e4567-e89b-12d3-a456-426614174999",
              displayName: "Store Owner",
              email: body.email ?? "owner@gazellecoffee.com",
              role: "owner",
              locationId: "flagship-01",
              active: true,
              capabilities: [
                "orders:read",
                "orders:write",
                "menu:read",
                "menu:write",
                "menu:visibility",
                "store:read",
                "store:write",
                "staff:read",
                "staff:write"
              ],
              createdAt: "2026-03-20T00:00:00.000Z",
              updatedAt: "2026-03-20T00:00:00.000Z"
            }
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        );
      }

      if (url.endsWith("/v1/operator/auth/sign-in") && method === "POST") {
        const body = JSON.parse(String(init?.body ?? "{}")) as { email?: string };
        return new Response(
          JSON.stringify({
            accessToken: "operator-access-token",
            refreshToken: "operator-refresh-token",
            expiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
            operator: {
              operatorUserId: "123e4567-e89b-12d3-a456-426614174999",
              displayName: "Store Owner",
              email: body.email ?? "owner@gazellecoffee.com",
              role: "owner",
              locationId: "flagship-01",
              active: true,
              capabilities: [
                "orders:read",
                "orders:write",
                "menu:read",
                "menu:write",
                "menu:visibility",
                "store:read",
                "store:write",
                "staff:read",
                "staff:write"
              ],
              createdAt: "2026-03-20T00:00:00.000Z",
              updatedAt: "2026-03-20T00:00:00.000Z"
            }
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        );
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

      if (url.endsWith("/v1/app-config") && method === "GET") {
        return new Response(
          JSON.stringify({
            brand: {
              brandId: "gazelle-default",
              brandName: "Gazelle Coffee",
              locationId: "flagship-01",
              locationName: "Gazelle Coffee Flagship",
              marketLabel: "Ann Arbor, MI"
            },
            theme: {
              background: "#F7F4ED",
              backgroundAlt: "#F0ECE4",
              surface: "#FFFDF8",
              surfaceMuted: "#F3EFE7",
              foreground: "#171513",
              foregroundMuted: "#605B55",
              muted: "#9B9389",
              border: "rgba(23, 21, 19, 0.08)",
              primary: "#1E1B18",
              accent: "#2D2823",
              fontFamily: "System",
              displayFontFamily: "Fraunces"
            },
            enabledTabs: ["home", "menu", "orders", "account"],
            featureFlags: {
              loyalty: true,
              pushNotifications: true,
              refunds: true,
              orderTracking: true,
              staffDashboard: true,
              menuEditing: true
            },
            loyaltyEnabled: true,
            paymentCapabilities: {
              applePay: true,
              card: true,
              cash: false,
              refunds: true,
              clover: {
                enabled: true,
                merchantRef: "flagship-01"
              }
            },
            fulfillment: {
              mode: "time_based",
              timeBasedScheduleMinutes: {
                inPrep: 5,
                ready: 10,
                completed: 15
              }
            }
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
        return new Response(
          JSON.stringify([
            {
              id: "123e4567-e89b-12d3-a456-426614174113",
              locationId: "flagship-01",
              status: "PAID",
              items: [],
              total: { currency: "USD", amountCents: 530 },
              pickupCode: "PAID01",
              timeline: [
                {
                  status: "PENDING_PAYMENT",
                  occurredAt: new Date(Date.now() - 120000).toISOString()
                },
                {
                  status: "PAID",
                  occurredAt: new Date(Date.now() - 60000).toISOString(),
                  note: "Payment accepted"
                }
              ]
            }
          ]),
          {
            status: 200,
            headers: { "content-type": "application/json" }
          }
        );
      }

      const getOrderMatch = url.match(/\/v1\/orders\/([0-9a-f-]{36})$/);
      if (getOrderMatch && method === "GET") {
        const orderId = getOrderMatch[1];
        const queuedStatusesForOrder = queuedOrderStatuses.get(orderId);
        const nextStatus = queuedStatusesForOrder?.shift() ?? "IN_PREP";
        if (queuedStatusesForOrder && queuedStatusesForOrder.length === 0) {
          queuedOrderStatuses.delete(orderId);
        }
        return new Response(
          JSON.stringify(buildOrderPayload(orderId, nextStatus)),
          { status: 200, headers: { "content-type": "application/json" } }
        );
      }

      const updateOrderStatusMatch = url.match(/\/v1\/orders\/([0-9a-f-]{36})\/status$/);
      if (updateOrderStatusMatch && method === "POST") {
        const orderId = updateOrderStatusMatch[1];
        const body = JSON.parse(String(init?.body ?? "{}")) as { status?: string; note?: string };
        return new Response(
          JSON.stringify({
            id: orderId,
            locationId: "flagship-01",
            status: body.status ?? "IN_PREP",
            items: [],
            total: { currency: "USD", amountCents: 530 },
            pickupCode: "ADMIN1",
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
                status: body.status ?? "IN_PREP",
                occurredAt: new Date().toISOString(),
                note: body.note,
                source: "staff"
              }
            ]
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        );
      }

      const cancelOrderMatch = url.match(/\/v1\/orders\/([0-9a-f-]{36})\/cancel$/);
      if (cancelOrderMatch && method === "POST") {
        const orderId = cancelOrderMatch[1];
        const headers = new Headers((init?.headers ?? {}) as HeadersInit);
        const body = JSON.parse(String(init?.body ?? "{}")) as { reason?: string };
        const cancelSource = headers.get("x-order-cancel-source") === "staff" ? "staff" : "customer";
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
                note: `Canceled by ${cancelSource}: ${body.reason ?? "Canceled"}.`,
                source: cancelSource
              }
            ]
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        );
      }

      if (url.endsWith("/v1/catalog/admin/menu") && method === "GET") {
        return new Response(
          JSON.stringify({
            locationId: "flagship-01",
            categories: [
              {
                categoryId: "espresso",
                title: "Espresso Bar",
                items: [
                  {
                    itemId: "latte",
                    categoryId: "espresso",
                    categoryTitle: "Espresso Bar",
                    name: "Honey Oat Latte",
                    description: "Espresso with steamed oat milk and honey.",
                    priceCents: 675,
                    visible: true,
                    sortOrder: 0
                  }
                ]
              }
            ]
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        );
      }

      const adminMenuItemMatch = url.match(/\/v1\/catalog\/admin\/menu\/([^/]+)$/);
      if (adminMenuItemMatch && method === "PUT") {
        const itemId = adminMenuItemMatch[1];
        const body = JSON.parse(String(init?.body ?? "{}")) as {
          name?: string;
          priceCents?: number;
          visible?: boolean;
        };
        return new Response(
          JSON.stringify({
            itemId,
            categoryId: "espresso",
            categoryTitle: "Espresso Bar",
            name: body.name ?? "Updated item",
            description: "Updated through operator web app.",
            priceCents: body.priceCents ?? 675,
            visible: body.visible ?? true,
            sortOrder: 0
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        );
      }

      if (url.endsWith("/v1/catalog/admin/store/config") && method === "GET") {
        return new Response(
          JSON.stringify({
            locationId: "flagship-01",
            storeName: "Gazelle Coffee Flagship",
            hours: "Daily · 7:00 AM - 6:00 PM",
            pickupInstructions: "Pickup at the flagship order counter."
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        );
      }

      if (url.endsWith("/v1/catalog/admin/store/config") && method === "PUT") {
        const body = JSON.parse(String(init?.body ?? "{}")) as {
          storeName?: string;
          hours?: string;
          pickupInstructions?: string;
        };
        return new Response(
          JSON.stringify({
            locationId: "flagship-01",
            storeName: body.storeName ?? "Gazelle Coffee Flagship",
            hours: body.hours ?? "Daily · 7:00 AM - 6:00 PM",
            pickupInstructions: body.pickupInstructions ?? "Pickup at the flagship order counter."
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

    if (previousGatewayInternalToken === undefined) {
      delete process.env.GATEWAY_INTERNAL_API_TOKEN;
    } else {
      process.env.GATEWAY_INTERNAL_API_TOKEN = previousGatewayInternalToken;
    }

    if (previousGatewayStaffToken === undefined) {
      delete process.env.GATEWAY_STAFF_API_TOKEN;
    } else {
      process.env.GATEWAY_STAFF_API_TOKEN = previousGatewayStaffToken;
    }

    if (previousOrdersInternalToken === undefined) {
      delete process.env.ORDERS_INTERNAL_API_TOKEN;
    } else {
      process.env.ORDERS_INTERNAL_API_TOKEN = previousOrdersInternalToken;
    }

    if (previousGatewayOrderStreamPollMs === undefined) {
      delete process.env.GATEWAY_ORDER_STREAM_POLL_MS;
    } else {
      process.env.GATEWAY_ORDER_STREAM_POLL_MS = previousGatewayOrderStreamPollMs;
    }
  });

  it("returns health", async () => {
    const app = await buildApp();
    const response = await app.inject({ method: "GET", url: "/health" });

    expect(response.statusCode).toBe(200);
    await app.close();
  });

  it("allows the default operator web origin through CORS", async () => {
    const app = await buildApp();
    const response = await app.inject({
      method: "GET",
      url: "/health",
      headers: {
        origin: "http://localhost:5173"
      }
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers["access-control-allow-origin"]).toBe("http://localhost:5173");
    await app.close();
  });

  it("proxies operator dev access sessions", async () => {
    const app = await buildApp();
    const response = await app.inject({
      method: "POST",
      url: "/v1/operator/auth/dev-access",
      payload: {
        email: "owner@gazellecoffee.com"
      }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      operator: {
        email: "owner@gazellecoffee.com",
        role: "owner"
      }
    });
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

  it("returns v1 app-config through the catalog proxy", async () => {
    const app = await buildApp();
    const response = await app.inject({ method: "GET", url: "/v1/app-config" });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      brand: expect.objectContaining({
        brandName: "Gazelle Coffee"
      }),
      fulfillment: expect.objectContaining({
        mode: "time_based"
      })
    });

    const requestedUrls = fetchMock.mock.calls.map(([input]) => (typeof input === "string" ? input : input.url));
    expect(requestedUrls).toContain("http://catalog.internal/v1/app-config");
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

  it("forwards operator password sign-in to identity", async () => {
    const app = await buildApp();
    const response = await app.inject({
      method: "POST",
      url: "/v1/operator/auth/sign-in",
      payload: {
        email: "owner@gazellecoffee.com",
        password: "LatteLinkOwner123!"
      }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      operator: {
        email: "owner@gazellecoffee.com",
        role: "owner"
      }
    });
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

  it("rate limits auth write endpoints when configured threshold is reached", async () => {
    const previousAuthWriteLimit = process.env.GATEWAY_RATE_LIMIT_AUTH_WRITE_MAX;
    const previousRateLimitWindow = process.env.GATEWAY_RATE_LIMIT_WINDOW_MS;
    process.env.GATEWAY_RATE_LIMIT_AUTH_WRITE_MAX = "1";
    process.env.GATEWAY_RATE_LIMIT_WINDOW_MS = "60000";

    const app = await buildApp();
    try {
      const firstResponse = await app.inject({
        method: "POST",
        url: "/v1/auth/magic-link/request",
        payload: { email: "owner@gazellecoffee.com" }
      });
      expect(firstResponse.statusCode).toBe(200);

      const secondResponse = await app.inject({
        method: "POST",
        url: "/v1/auth/magic-link/request",
        payload: { email: "owner@gazellecoffee.com" }
      });
      expect(secondResponse.statusCode).toBe(429);
      expect(secondResponse.json()).toMatchObject({ statusCode: 429 });
    } finally {
      await app.close();
      if (previousAuthWriteLimit === undefined) {
        delete process.env.GATEWAY_RATE_LIMIT_AUTH_WRITE_MAX;
      } else {
        process.env.GATEWAY_RATE_LIMIT_AUTH_WRITE_MAX = previousAuthWriteLimit;
      }
      if (previousRateLimitWindow === undefined) {
        delete process.env.GATEWAY_RATE_LIMIT_WINDOW_MS;
      } else {
        process.env.GATEWAY_RATE_LIMIT_WINDOW_MS = previousRateLimitWindow;
      }
    }
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

  it("derives authenticated user context for customer order routes and forwards x-user-id upstream", async () => {
    const app = await buildApp();

    const response = await app.inject({
      method: "GET",
      url: "/v1/orders",
      headers: authHeader
    });

    expect(response.statusCode).toBe(200);

    const meCall = fetchMock.mock.calls.find(([input, init]) => {
      const url = typeof input === "string" ? input : input.url;
      return url === "http://identity.internal/v1/auth/me" && (init?.method ?? "GET") === "GET";
    });
    expect(meCall).toBeDefined();

    const ordersCall = fetchMock.mock.calls.find(([input, init]) => {
      const url = typeof input === "string" ? input : input.url;
      return url === "http://orders.internal/v1/orders" && (init?.method ?? "GET") === "GET";
    });
    expect(ordersCall).toBeDefined();
    if (ordersCall) {
      const upstreamHeaders = new Headers((ordersCall[1]?.headers ?? {}) as HeadersInit);
      expect(upstreamHeaders.get("x-user-id")).toBe("123e4567-e89b-12d3-a456-426614174000");
      expect(upstreamHeaders.get("x-gateway-token")).toBe("gateway-test-token");
    }

    await app.close();
  });

  it("streams the initial order snapshot as text/event-stream", async () => {
    const app = await buildApp();
    const orderId = "123e4567-e89b-12d3-a456-426614174116";
    queuedOrderStatuses.set(orderId, ["COMPLETED"]);

    const response = await app.inject({
      method: "GET",
      url: `/v1/orders/${orderId}/stream`,
      headers: authHeader
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers["content-type"]).toContain("text/event-stream");
    expect(response.body).toContain(`"id":"${orderId}"`);
    expect(response.body).toContain(`"status":"COMPLETED"`);

    const streamOrderCall = fetchMock.mock.calls.find(([input, init]) => {
      const url = typeof input === "string" ? input : input.url;
      return url === `http://orders.internal/v1/orders/${orderId}` && (init?.method ?? "GET") === "GET";
    });
    expect(streamOrderCall).toBeDefined();
    if (streamOrderCall) {
      const upstreamHeaders = new Headers((streamOrderCall[1]?.headers ?? {}) as HeadersInit);
      expect(upstreamHeaders.get("x-user-id")).toBe("123e4567-e89b-12d3-a456-426614174000");
      expect(upstreamHeaders.get("x-gateway-token")).toBe("gateway-test-token");
    }

    await app.close();
  });

  it("closes the order stream after sending a terminal update", async () => {
    process.env.GATEWAY_ORDER_STREAM_POLL_MS = "5";
    const app = await buildApp();
    const orderId = "123e4567-e89b-12d3-a456-426614174117";
    queuedOrderStatuses.set(orderId, ["IN_PREP", "COMPLETED"]);

    const response = await app.inject({
      method: "GET",
      url: `/v1/orders/${orderId}/stream`,
      headers: authHeader
    });

    expect(response.statusCode).toBe(200);
    const dataEvents = response.body
      .split("\n\n")
      .filter((block) => block.startsWith("data: "))
      .map((block) => block.trim());
    expect(dataEvents).toHaveLength(2);
    expect(dataEvents[0]).toContain(`"status":"IN_PREP"`);
    expect(dataEvents[1]).toContain(`"status":"COMPLETED"`);

    const orderFetchCalls = fetchMock.mock.calls.filter(([input, init]) => {
      const url = typeof input === "string" ? input : input.url;
      return url === `http://orders.internal/v1/orders/${orderId}` && (init?.method ?? "GET") === "GET";
    });
    expect(orderFetchCalls).toHaveLength(2);

    await app.close();
  });

  it("requires a valid staff token before proxying admin routes", async () => {
    const app = await buildApp();
    const response = await app.inject({
      method: "GET",
      url: "/v1/admin/orders",
      headers: authHeader
    });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({ code: "UNAUTHORIZED_STAFF_REQUEST" });
    expect(fetchMock).not.toHaveBeenCalled();
    await app.close();
  });

  it("forwards admin reads through the gateway", async () => {
    const app = await buildApp();

    const ordersResponse = await app.inject({
      method: "GET",
      url: "/v1/admin/orders",
      headers: {
        ...staffHeaders,
        "x-user-id": "123e4567-e89b-12d3-a456-426614174099"
      }
    });
    expect(ordersResponse.statusCode).toBe(200);
    expect(ordersResponse.json()).toEqual(
      expect.arrayContaining([expect.objectContaining({ status: "PAID", pickupCode: "PAID01" })])
    );

    const menuResponse = await app.inject({
      method: "GET",
      url: "/v1/admin/menu",
      headers: staffHeaders
    });
    expect(menuResponse.statusCode).toBe(200);
    expect(menuResponse.json()).toMatchObject({
      categories: expect.arrayContaining([expect.objectContaining({ categoryId: "espresso" })])
    });

    const storeResponse = await app.inject({
      method: "GET",
      url: "/v1/admin/store/config",
      headers: staffHeaders
    });
    expect(storeResponse.statusCode).toBe(200);
    expect(storeResponse.json()).toMatchObject({
      storeName: "Gazelle Coffee Flagship"
    });

    const requestedUrls = fetchMock.mock.calls.map(([input]) => (typeof input === "string" ? input : input.url));
    expect(requestedUrls).toContain("http://orders.internal/v1/orders");
    expect(requestedUrls).toContain("http://catalog.internal/v1/catalog/admin/menu");
    expect(requestedUrls).toContain("http://catalog.internal/v1/catalog/admin/store/config");

    const adminOrdersCall = fetchMock.mock.calls.find(([input, init]) => {
      const url = typeof input === "string" ? input : input.url;
      return url === "http://orders.internal/v1/orders" && (init?.method ?? "GET") === "GET";
    });
    expect(adminOrdersCall).toBeDefined();
    if (adminOrdersCall) {
      const upstreamHeaders = new Headers((adminOrdersCall[1]?.headers ?? {}) as HeadersInit);
      expect(upstreamHeaders.get("x-user-id")).toBeNull();
    }

    await app.close();
  });

  it("forwards admin lifecycle updates with the internal orders token", async () => {
    const app = await buildApp();
    const orderId = "123e4567-e89b-12d3-a456-426614174114";
    const response = await app.inject({
      method: "POST",
      url: `/v1/admin/orders/${orderId}/status`,
      headers: staffHeaders,
      payload: {
        status: "READY",
        note: "Order is bagged and ready."
      }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ id: orderId, status: "READY" });

    const updateCall = fetchMock.mock.calls.find(([input]) =>
      (typeof input === "string" ? input : input.url).endsWith(`/v1/orders/${orderId}/status`)
    );
    expect(updateCall).toBeDefined();
    if (updateCall) {
      const upstreamHeaders = new Headers((updateCall[1]?.headers ?? {}) as HeadersInit);
      expect(upstreamHeaders.get("x-internal-token")).toBe("orders-internal-token");
      expect(upstreamHeaders.get("x-gateway-token")).toBeNull();
    }

    await app.close();
  });

  it("routes admin cancellations through the refund-aware cancel endpoint", async () => {
    const app = await buildApp();
    const orderId = "123e4567-e89b-12d3-a456-426614174115";
    const response = await app.inject({
      method: "POST",
      url: `/v1/admin/orders/${orderId}/status`,
      headers: staffHeaders,
      payload: {
        status: "CANCELED",
        note: "Espresso machine issue"
      }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ id: orderId, status: "CANCELED" });

    const cancelCall = fetchMock.mock.calls.find(([input]) =>
      (typeof input === "string" ? input : input.url).endsWith(`/v1/orders/${orderId}/cancel`)
    );
    expect(cancelCall).toBeDefined();
    if (cancelCall) {
      const upstreamHeaders = new Headers((cancelCall[1]?.headers ?? {}) as HeadersInit);
      expect(upstreamHeaders.get("x-gateway-token")).toBe("gateway-test-token");
      expect(upstreamHeaders.get("x-order-cancel-source")).toBe("staff");
      expect(JSON.parse(String(cancelCall[1]?.body ?? "{}"))).toEqual({
        reason: "Espresso machine issue"
      });
    }

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
      expect(upstreamHeaders.get("x-gateway-token")).toBe("gateway-test-token");
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

  it("returns upstream timeout when catalog response exceeds configured timeout", async () => {
    vi.stubEnv("GATEWAY_UPSTREAM_TIMEOUT_MS", "10");
    const app = await buildApp();

    fetchMock.mockImplementationOnce(async (_input, init) => {
      return await new Promise<Response>((_resolve, reject) => {
        const signal = init?.signal;

        if (!signal) {
          return;
        }

        if (signal.aborted) {
          reject(new DOMException("The operation was aborted.", "AbortError"));
          return;
        }

        signal.addEventListener("abort", () => reject(new DOMException("The operation was aborted.", "AbortError")), {
          once: true
        });
      });
    });

    try {
      const response = await app.inject({
        method: "GET",
        url: "/v1/menu"
      });

      expect(response.statusCode).toBe(504);
      expect(response.json()).toMatchObject({
        code: "UPSTREAM_TIMEOUT",
        message: "Catalog service timed out"
      });
    } finally {
      vi.unstubAllEnvs();
      await app.close();
    }
  });

  it("rate limits auth endpoints when configured threshold is reached", async () => {
    vi.stubEnv("GATEWAY_RATE_LIMIT_AUTH_WRITE_MAX", "1");
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
