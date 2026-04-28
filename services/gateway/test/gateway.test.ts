import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const eventBusMocks = vi.hoisted(() => ({
  close: vi.fn(),
  subscribeToAllOrderEvents: vi.fn(),
  subscribeToOrderEvents: vi.fn(),
  subscribeToOrderStatus: vi.fn()
}));

vi.mock("@lattelink/event-bus", () => ({
  EventBusSubscriber: vi.fn().mockImplementation(() => ({
    close: eventBusMocks.close,
    subscribeToAllOrderEvents: eventBusMocks.subscribeToAllOrderEvents,
    subscribeToOrderEvents: eventBusMocks.subscribeToOrderEvents,
    subscribeToOrderStatus: eventBusMocks.subscribeToOrderStatus
  }))
}));

import { buildApp } from "../src/app.js";

describe("gateway", () => {
  const fetchMock = vi.fn<typeof fetch>();
  const authHeader = { authorization: "Bearer access-token" } as const;
  const ownerOperatorHeaders = { authorization: "Bearer operator-owner-access-token" } as const;
  const storeOperatorHeaders = { authorization: "Bearer operator-store-access-token" } as const;
  const multiLocationOperatorHeaders = { authorization: "Bearer operator-multi-location-access-token" } as const;
  const ownerInternalAdminHeaders = { authorization: "Bearer internal-admin-owner-access-token" } as const;
  const readonlyInternalAdminHeaders = { authorization: "Bearer internal-admin-readonly-access-token" } as const;
  let previousIdentityBaseUrl: string | undefined;
  let previousOrdersBaseUrl: string | undefined;
  let previousCatalogBaseUrl: string | undefined;
  let previousPaymentsBaseUrl: string | undefined;
  let previousLoyaltyBaseUrl: string | undefined;
  let previousNotificationsBaseUrl: string | undefined;
  let previousGatewayInternalToken: string | undefined;
  let previousOrdersInternalToken: string | undefined;
  let previousGatewayOrderStreamPollMs: string | undefined;
  let previousValkeyUrl: string | undefined;
let previousCorsAllowedOrigins: string | undefined;
let previousCorsAllowedOriginHostSuffixes: string | undefined;
let previousFreeClientDashboardDomain: string | undefined;
  let previousNodeEnv: string | undefined;
  let queuedOrderStatuses: Map<string, Array<"PENDING_PAYMENT" | "PAID" | "IN_PREP" | "READY" | "COMPLETED" | "CANCELED">>;
  let queuedOrderPayloads: Map<string, Array<ReturnType<typeof buildOrderPayload>>>;
  let queuedOrderListPayloads: Array<Array<ReturnType<typeof buildOrderPayload>>>;
  let failOrderListFetchWhenQueueEmpty: boolean;

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
    previousPaymentsBaseUrl = process.env.PAYMENTS_SERVICE_BASE_URL;
    previousLoyaltyBaseUrl = process.env.LOYALTY_SERVICE_BASE_URL;
    previousNotificationsBaseUrl = process.env.NOTIFICATIONS_SERVICE_BASE_URL;
    previousGatewayInternalToken = process.env.GATEWAY_INTERNAL_API_TOKEN;
    previousOrdersInternalToken = process.env.ORDERS_INTERNAL_API_TOKEN;
    previousGatewayOrderStreamPollMs = process.env.GATEWAY_ORDER_STREAM_POLL_MS;
    previousValkeyUrl = process.env.VALKEY_URL;
    previousCorsAllowedOrigins = process.env.CORS_ALLOWED_ORIGINS;
    previousCorsAllowedOriginHostSuffixes = process.env.CORS_ALLOWED_ORIGIN_HOST_SUFFIXES;
    previousFreeClientDashboardDomain = process.env.FREE_CLIENT_DASHBOARD_DOMAIN;
    previousNodeEnv = process.env.NODE_ENV;
    queuedOrderStatuses = new Map();
    queuedOrderPayloads = new Map();
    queuedOrderListPayloads = [];
    failOrderListFetchWhenQueueEmpty = false;
    eventBusMocks.close.mockReset();
    eventBusMocks.subscribeToAllOrderEvents.mockReset();
    eventBusMocks.subscribeToAllOrderEvents.mockResolvedValue(() => undefined);
    eventBusMocks.subscribeToOrderEvents.mockReset();
    eventBusMocks.subscribeToOrderEvents.mockResolvedValue(() => undefined);
    eventBusMocks.subscribeToOrderStatus.mockReset();
    eventBusMocks.subscribeToOrderStatus.mockResolvedValue(() => undefined);
    process.env.IDENTITY_SERVICE_BASE_URL = "http://identity.internal";
    process.env.ORDERS_SERVICE_BASE_URL = "http://orders.internal";
    process.env.CATALOG_SERVICE_BASE_URL = "http://catalog.internal";
    process.env.PAYMENTS_SERVICE_BASE_URL = "http://payments.internal";
    process.env.LOYALTY_SERVICE_BASE_URL = "http://loyalty.internal";
    process.env.NOTIFICATIONS_SERVICE_BASE_URL = "http://notifications.internal";
    process.env.GATEWAY_INTERNAL_API_TOKEN = "gateway-test-token";
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

      if (url.endsWith("/v1/auth/dev-access") && method === "POST") {
        return new Response(
          JSON.stringify({
            accessToken: "customer-access-token",
            refreshToken: "customer-refresh-token",
            expiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
            userId: "123e4567-e89b-12d3-a456-426614174000"
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        );
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
                "team:read",
                "team:write"
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
                "team:read",
                "team:write"
              ],
              createdAt: "2026-03-20T00:00:00.000Z",
              updatedAt: "2026-03-20T00:00:00.000Z"
            }
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        );
      }

      if (url.endsWith("/v1/operator/auth/providers") && method === "GET") {
        return new Response(
          JSON.stringify({
            google: {
              configured: true
            }
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        );
      }

      if (url.includes("/v1/operator/auth/google/start") && method === "GET") {
        return new Response(
          JSON.stringify({
            authorizeUrl: "https://accounts.google.com/o/oauth2/v2/auth?client_id=test",
            stateExpiresAt: new Date(Date.now() + 10 * 60 * 1000).toISOString()
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        );
      }

      if (url.endsWith("/v1/operator/auth/google/exchange") && method === "POST") {
        return new Response(
          JSON.stringify({
            accessToken: "operator-google-access-token",
            refreshToken: "operator-google-refresh-token",
            expiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
            operator: {
              operatorUserId: "123e4567-e89b-12d3-a456-426614174999",
              displayName: "Store Owner",
              email: "owner@gazellecoffee.com",
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
                "team:read",
                "team:write"
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
            displayName: "Avery Quinn",
            profileCompleted: false,
            methods: ["apple", "passkey"]
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        );
      }

      if (url.endsWith("/v1/auth/profile") && method === "POST") {
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
            name: "Avery Quinn",
            displayName: "Avery Quinn",
            phoneNumber: "+13135550123",
            birthday: "1992-04-12",
            profileCompleted: true,
            methods: ["apple", "passkey"]
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        );
      }

      if (url.endsWith("/v1/auth/account") && method === "DELETE") {
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

        return new Response(JSON.stringify({ success: true }), {
          status: 200,
          headers: { "content-type": "application/json" }
        });
      }

      if (url.endsWith("/v1/operator/auth/me") && method === "GET") {
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

        const operatorByToken: Record<string, Record<string, unknown>> = {
          "Bearer operator-owner-access-token": {
            operatorUserId: "123e4567-e89b-12d3-a456-426614174999",
            displayName: "Store Owner",
            email: "owner@gazellecoffee.com",
            role: "owner",
            locationId: "flagship-01",
            locationIds: ["flagship-01"],
            active: true,
            capabilities: [
              "orders:read",
              "orders:write",
              "menu:read",
              "menu:write",
              "menu:visibility",
              "store:read",
              "store:write",
              "team:read",
              "team:write"
            ],
            createdAt: "2026-03-20T00:00:00.000Z",
            updatedAt: "2026-03-20T00:00:00.000Z"
          },
          "Bearer operator-manager-access-token": {
            operatorUserId: "123e4567-e89b-12d3-a456-426614174998",
            displayName: "Store Manager",
            email: "manager@gazellecoffee.com",
            role: "manager",
            locationId: "flagship-01",
            locationIds: ["flagship-01"],
            active: true,
            capabilities: ["orders:read", "orders:write", "menu:read", "menu:write", "menu:visibility", "store:read", "team:read"],
            createdAt: "2026-03-20T00:00:00.000Z",
            updatedAt: "2026-03-20T00:00:00.000Z"
          },
          "Bearer operator-store-access-token": {
            operatorUserId: "123e4567-e89b-12d3-a456-426614174997",
            displayName: "Store Screen",
            email: "store@gazellecoffee.com",
            role: "store",
            locationId: "flagship-01",
            locationIds: ["flagship-01"],
            active: true,
            capabilities: ["orders:read", "orders:write"],
            createdAt: "2026-03-20T00:00:00.000Z",
            updatedAt: "2026-03-20T00:00:00.000Z"
          },
          "Bearer operator-multi-location-access-token": {
            operatorUserId: "123e4567-e89b-12d3-a456-426614174996",
            displayName: "Multi Location Owner",
            email: "multi.owner@gazellecoffee.com",
            role: "owner",
            locationId: "flagship-01",
            locationIds: ["flagship-01", "northside-01"],
            active: true,
            capabilities: [
              "orders:read",
              "orders:write",
              "menu:read",
              "menu:write",
              "menu:visibility",
              "store:read",
              "store:write",
              "team:read",
              "team:write"
            ],
            createdAt: "2026-03-20T00:00:00.000Z",
            updatedAt: "2026-03-20T00:00:00.000Z"
          }
        };

        const operator = operatorByToken[authHeader];
        if (!operator) {
          return new Response(
            JSON.stringify({
              code: "UNAUTHORIZED",
              message: "Missing or invalid auth token",
              requestId: "identity-stub"
            }),
            { status: 401, headers: { "content-type": "application/json" } }
          );
        }

        return new Response(JSON.stringify(operator), {
          status: 200,
          headers: { "content-type": "application/json" }
        });
      }

      if (url.endsWith("/v1/internal-admin/auth/sign-in") && method === "POST") {
        const body = JSON.parse(String(init?.body ?? "{}")) as { email?: string };
        return new Response(
          JSON.stringify({
            accessToken: "internal-admin-owner-access-token",
            refreshToken: "internal-admin-owner-refresh-token",
            expiresAt: new Date(Date.now() + 12 * 60 * 60 * 1000).toISOString(),
            admin: {
              internalAdminUserId: "223e4567-e89b-12d3-a456-426614174999",
              displayName: "Platform Owner",
              email: body.email ?? "admin@gazellecoffee.com",
              role: "platform_owner",
              active: true,
              capabilities: [
                "clients:read",
                "clients:write",
                "owners:read",
                "owners:write",
                "internal-admin-users:read",
                "internal-admin-users:write"
              ],
              createdAt: "2026-03-20T00:00:00.000Z",
              updatedAt: "2026-03-20T00:00:00.000Z"
            }
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        );
      }

      if (url.endsWith("/v1/internal-admin/auth/logout") && method === "POST") {
        return new Response(JSON.stringify({ success: true }), {
          status: 200,
          headers: { "content-type": "application/json" }
        });
      }

      if (url.endsWith("/v1/internal-admin/auth/me") && method === "GET") {
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

        const adminByToken: Record<string, Record<string, unknown>> = {
          "Bearer internal-admin-owner-access-token": {
            internalAdminUserId: "223e4567-e89b-12d3-a456-426614174999",
            displayName: "Platform Owner",
            email: "admin@gazellecoffee.com",
            role: "platform_owner",
            active: true,
            capabilities: [
              "clients:read",
              "clients:write",
              "owners:read",
              "owners:write",
              "internal-admin-users:read",
              "internal-admin-users:write"
            ],
            createdAt: "2026-03-20T00:00:00.000Z",
            updatedAt: "2026-03-20T00:00:00.000Z"
          },
          "Bearer internal-admin-operator-access-token": {
            internalAdminUserId: "223e4567-e89b-12d3-a456-426614174998",
            displayName: "Platform Operator",
            email: "ops@gazellecoffee.com",
            role: "platform_operator",
            active: true,
            capabilities: ["clients:read", "clients:write", "owners:read", "owners:write"],
            createdAt: "2026-03-20T00:00:00.000Z",
            updatedAt: "2026-03-20T00:00:00.000Z"
          },
          "Bearer internal-admin-readonly-access-token": {
            internalAdminUserId: "223e4567-e89b-12d3-a456-426614174997",
            displayName: "Support Read Only",
            email: "support@gazellecoffee.com",
            role: "support_readonly",
            active: true,
            capabilities: ["clients:read", "owners:read", "internal-admin-users:read"],
            createdAt: "2026-03-20T00:00:00.000Z",
            updatedAt: "2026-03-20T00:00:00.000Z"
          }
        };

        const admin = adminByToken[authHeader];
        if (!admin) {
          return new Response(
            JSON.stringify({
              code: "UNAUTHORIZED",
              message: "Missing or invalid auth token",
              requestId: "identity-stub"
            }),
            { status: 401, headers: { "content-type": "application/json" } }
          );
        }

        return new Response(JSON.stringify(admin), {
          status: 200,
          headers: { "content-type": "application/json" }
        });
      }

      if (url.endsWith("/v1/operator/users") && method === "GET") {
        return new Response(
          JSON.stringify({
            users: [
              {
                operatorUserId: "123e4567-e89b-12d3-a456-426614174999",
                displayName: "Store Owner",
                email: "owner@gazellecoffee.com",
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
                  "team:read",
                  "team:write"
                ],
                createdAt: "2026-03-20T00:00:00.000Z",
                updatedAt: "2026-03-20T00:00:00.000Z"
              },
              {
                operatorUserId: "123e4567-e89b-12d3-a456-426614174997",
                displayName: "Store Screen",
                email: "store@gazellecoffee.com",
                role: "store",
                locationId: "flagship-01",
                active: true,
                capabilities: ["orders:read", "orders:write"],
                createdAt: "2026-03-20T00:00:00.000Z",
                updatedAt: "2026-03-20T00:00:00.000Z"
              }
            ]
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        );
      }

      if (url.endsWith("/v1/operator/users") && method === "POST") {
        const body = JSON.parse(String(init?.body ?? "{}")) as {
          displayName?: string;
          email?: string;
          role?: "owner" | "manager" | "store";
        };
        if (body.email === "owner@gazellecoffee.com") {
          return new Response(
            JSON.stringify({
              requestId: "identity-request-duplicate-create",
              code: "OPERATOR_EMAIL_ALREADY_EXISTS",
              message: "An operator with that email already exists"
            }),
            { status: 409, headers: { "content-type": "application/json" } }
          );
        }

        const role = body.role ?? "store";
        const capabilitiesByRole = {
          owner: [
            "orders:read",
            "orders:write",
            "menu:read",
            "menu:write",
            "menu:visibility",
            "store:read",
            "store:write",
            "team:read",
            "team:write"
          ],
          manager: [
            "orders:read",
            "orders:write",
            "menu:read",
            "menu:write",
            "menu:visibility",
            "store:read",
            "team:read"
          ],
          store: ["orders:read", "orders:write"]
        } as const;
        return new Response(
          JSON.stringify({
            operatorUserId: "123e4567-e89b-12d3-a456-426614174996",
            displayName: body.displayName ?? "New Operator",
            email: body.email ?? "new-operator@gazellecoffee.com",
            role,
            locationId: "flagship-01",
            active: true,
            capabilities: capabilitiesByRole[role],
            createdAt: "2026-03-20T00:00:00.000Z",
            updatedAt: "2026-03-20T00:00:00.000Z"
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        );
      }

      const operatorUserMatch = url.match(/\/v1\/operator\/users\/([0-9a-f-]{36})$/);
      if (operatorUserMatch && method === "PATCH") {
        const operatorUserId = operatorUserMatch[1];
        const body = JSON.parse(String(init?.body ?? "{}")) as {
          displayName?: string;
          email?: string;
          role?: "owner" | "manager" | "store";
          active?: boolean;
        };
        if (body.email === "owner@gazellecoffee.com") {
          return new Response(
            JSON.stringify({
              requestId: "identity-request-duplicate-update",
              code: "OPERATOR_EMAIL_ALREADY_EXISTS",
              message: "An operator with that email already exists"
            }),
            { status: 409, headers: { "content-type": "application/json" } }
          );
        }

        const role = body.role ?? "store";
        const capabilitiesByRole = {
          owner: [
            "orders:read",
            "orders:write",
            "menu:read",
            "menu:write",
            "menu:visibility",
            "store:read",
            "store:write",
            "team:read",
            "team:write"
          ],
          manager: [
            "orders:read",
            "orders:write",
            "menu:read",
            "menu:write",
            "menu:visibility",
            "store:read",
            "team:read"
          ],
          store: ["orders:read", "orders:write"]
        } as const;
        return new Response(
          JSON.stringify({
            operatorUserId,
            displayName: body.displayName ?? "Store Screen",
            email: body.email ?? "store@gazellecoffee.com",
            role,
            locationId: "flagship-01",
            active: body.active ?? true,
            capabilities: capabilitiesByRole[role],
            createdAt: "2026-03-20T00:00:00.000Z",
            updatedAt: "2026-03-21T00:00:00.000Z"
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
          { status: 200, headers: { "content-type": "application/json", "cache-control": "public, max-age=60" } }
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
              stripe: {
                enabled: false,
                onboarded: false,
                dashboardEnabled: false
              },
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
            hoursText: "Daily · 7:00 AM - 6:00 PM",
            isOpen: true,
            nextOpenAt: null,
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

      if (url.endsWith("/v1/orders") && method === "GET") {
        if (queuedOrderListPayloads.length > 0) {
          return new Response(JSON.stringify(queuedOrderListPayloads.shift()), {
            status: 200,
            headers: { "content-type": "application/json" }
          });
        }
        if (failOrderListFetchWhenQueueEmpty) {
          return new Response(
            JSON.stringify({
              code: "UPSTREAM_ERROR",
              message: "forced test failure",
              requestId: "forced-order-list-failure"
            }),
            {
              status: 500,
              headers: { "content-type": "application/json" }
            }
          );
        }

        return new Response(
          JSON.stringify([
            {
              id: "123e4567-e89b-12d3-a456-426614174113",
              locationId: "flagship-01",
              status: "PAID",
              items: [],
              total: { currency: "USD", amountCents: 530 },
              pickupCode: "PAID01",
              customer: {
                name: "Avery Quinn",
                email: "avery@example.com",
                phone: "+13135550123"
              },
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
        const queuedPayloadsForOrder = queuedOrderPayloads.get(orderId);
        if (queuedPayloadsForOrder?.length) {
          const nextPayload = queuedPayloadsForOrder.shift() ?? buildOrderPayload(orderId, "IN_PREP");
          if (queuedPayloadsForOrder.length === 0) {
            queuedOrderPayloads.delete(orderId);
          }
          return new Response(JSON.stringify(nextPayload), {
            status: 200,
            headers: { "content-type": "application/json" }
          });
        }

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
                    sortOrder: 0,
                    customizationGroups: []
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
          customizationGroups?: unknown[];
        };
        return new Response(
          JSON.stringify({
            itemId,
            categoryId: "espresso",
            categoryTitle: "Espresso Bar",
            name: body.name ?? "Updated item",
            description: "Updated through client dashboard.",
            priceCents: body.priceCents ?? 675,
            visible: body.visible ?? true,
            sortOrder: 0,
            customizationGroups: body.customizationGroups ?? []
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        );
      }

      if (url.endsWith("/v1/catalog/admin/store/config") && method === "GET") {
        return new Response(
          JSON.stringify({
            locationId: "flagship-01",
            storeName: "Gazelle Coffee",
            locationName: "Ann Arbor, MI",
            hours: "Daily · 7:00 AM - 6:00 PM",
            taxRateBasisPoints: 600,
            pickupInstructions: "Pickup at the flagship order counter."
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        );
      }

      if (url.endsWith("/v1/catalog/admin/store/config") && method === "PUT") {
        const body = JSON.parse(String(init?.body ?? "{}")) as {
          storeName?: string;
          locationName?: string;
          hours?: string;
          taxRateBasisPoints?: number;
          pickupInstructions?: string;
        };
        return new Response(
          JSON.stringify({
            locationId: "flagship-01",
            storeName: body.storeName ?? "Gazelle Coffee",
            locationName: body.locationName ?? "Ann Arbor, MI",
            hours: body.hours ?? "Daily · 7:00 AM - 6:00 PM",
            taxRateBasisPoints: body.taxRateBasisPoints ?? 600,
            pickupInstructions: body.pickupInstructions ?? "Pickup at the flagship order counter."
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        );
      }

      if (url.endsWith("/v1/catalog/internal/locations/bootstrap") && method === "POST") {
        const body = JSON.parse(String(init?.body ?? "{}")) as {
          brandId?: string;
          brandName?: string;
          locationId?: string;
          locationName?: string;
          marketLabel?: string;
          storeName?: string;
          hours?: string;
          pickupInstructions?: string;
          taxRateBasisPoints?: number;
          capabilities?: unknown;
        };

        return new Response(
          JSON.stringify({
            brandId: body.brandId ?? "northside-coffee",
            brandName: body.brandName ?? "Northside Coffee",
            locationId: body.locationId ?? "northside-01",
            locationName: body.locationName ?? "Northside Flagship",
            marketLabel: body.marketLabel ?? "Detroit, MI",
            storeName: body.storeName ?? body.locationName ?? "Northside Coffee",
            hours: body.hours ?? "Daily · 7:00 AM - 6:00 PM",
            pickupInstructions: body.pickupInstructions ?? "Pickup at the espresso counter.",
            taxRateBasisPoints: body.taxRateBasisPoints ?? 600,
            capabilities:
              body.capabilities ?? {
                menu: {
                  source: "platform_managed"
                },
                operations: {
                  fulfillmentMode: "staff",
                  liveOrderTrackingEnabled: true,
                  dashboardEnabled: true
                },
                loyalty: {
                  visible: true
                }
              },
            action: "created"
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        );
      }

      if (url.endsWith("/v1/catalog/internal/locations") && method === "GET") {
        return new Response(
          JSON.stringify({
            locations: [
              {
                brandId: "northside-coffee",
                brandName: "Northside Coffee",
                locationId: "northside-01",
                locationName: "Northside Flagship",
                marketLabel: "Detroit, MI",
                storeName: "Northside Coffee",
                hours: "Daily · 7:00 AM - 6:00 PM",
                pickupInstructions: "Pickup at the espresso counter.",
                taxRateBasisPoints: 600,
                capabilities: {
                  menu: {
                    source: "platform_managed"
                  },
                  operations: {
                    fulfillmentMode: "staff",
                    liveOrderTrackingEnabled: true,
                    dashboardEnabled: true
                  },
                  loyalty: {
                    visible: true
                  }
                }
              }
            ]
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        );
      }

      const internalLocationPaymentProfileMatch = url.match(/\/v1\/catalog\/internal\/locations\/([^/]+)\/payment-profile$/);
      if (internalLocationPaymentProfileMatch && method === "GET") {
        const locationId = internalLocationPaymentProfileMatch[1];

        return new Response(
          JSON.stringify({
            locationId,
            stripeAccountId: "acct_123456789",
            stripeAccountType: "express",
            stripeOnboardingStatus: "completed",
            stripeDetailsSubmitted: true,
            stripeChargesEnabled: true,
            stripePayoutsEnabled: true,
            stripeDashboardEnabled: true,
            country: "US",
            currency: "USD",
            cardEnabled: true,
            applePayEnabled: true,
            refundsEnabled: true,
            cloverPosEnabled: true
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        );
      }

      if (internalLocationPaymentProfileMatch && method === "PUT") {
        const locationId = internalLocationPaymentProfileMatch[1];
        const body = JSON.parse(String(init?.body ?? "{}")) as {
          stripeAccountId?: string;
          stripeOnboardingStatus?: string;
          stripeDetailsSubmitted?: boolean;
          stripeChargesEnabled?: boolean;
          stripePayoutsEnabled?: boolean;
          stripeDashboardEnabled?: boolean;
          country?: string;
          currency?: string;
          cardEnabled?: boolean;
          applePayEnabled?: boolean;
          refundsEnabled?: boolean;
          cloverPosEnabled?: boolean;
        };

        return new Response(
          JSON.stringify({
            locationId,
            stripeAccountId: body.stripeAccountId ?? "acct_123456789",
            stripeAccountType: "express",
            stripeOnboardingStatus: body.stripeOnboardingStatus ?? "completed",
            stripeDetailsSubmitted: body.stripeDetailsSubmitted ?? true,
            stripeChargesEnabled: body.stripeChargesEnabled ?? true,
            stripePayoutsEnabled: body.stripePayoutsEnabled ?? true,
            stripeDashboardEnabled: body.stripeDashboardEnabled ?? true,
            country: body.country ?? "US",
            currency: body.currency ?? "USD",
            cardEnabled: body.cardEnabled ?? true,
            applePayEnabled: body.applePayEnabled ?? true,
            refundsEnabled: body.refundsEnabled ?? true,
            cloverPosEnabled: body.cloverPosEnabled ?? true
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        );
      }

      const internalLocationMatch = url.match(/\/v1\/catalog\/internal\/locations\/([^/]+)$/);
      if (internalLocationMatch && method === "GET") {
        const locationId = internalLocationMatch[1];

        return new Response(
          JSON.stringify({
            brandId: "northside-coffee",
            brandName: "Northside Coffee",
            locationId,
            locationName: "Northside Flagship",
            marketLabel: "Detroit, MI",
            storeName: "Northside Coffee",
            hours: "Daily · 7:00 AM - 6:00 PM",
            pickupInstructions: "Pickup at the espresso counter.",
            taxRateBasisPoints: 600,
            capabilities: {
              menu: {
                source: "platform_managed"
              },
              operations: {
                fulfillmentMode: "staff",
                liveOrderTrackingEnabled: true,
                dashboardEnabled: true
              },
              loyalty: {
                visible: true
              }
            }
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        );
      }

      const internalOwnerSummaryMatch = url.match(/\/v1\/identity\/internal\/locations\/([^/]+)\/owner$/);
      if (internalOwnerSummaryMatch && method === "GET") {
        const locationId = internalOwnerSummaryMatch[1];

        return new Response(
          JSON.stringify({
            locationId,
            owner: {
              operatorUserId: "123e4567-e89b-12d3-a456-426614174995",
              displayName: "Pilot Owner",
              email: "owner@northside.com",
              role: "owner",
              locationId,
              active: true,
              capabilities: [
                "orders:read",
                "orders:write",
                "menu:read",
                "menu:write",
                "menu:visibility",
                "store:read",
                "store:write",
                "team:read",
                "team:write"
              ],
              createdAt: "2026-03-20T00:00:00.000Z",
              updatedAt: "2026-03-20T00:00:00.000Z"
            }
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        );
      }

      const internalOwnerProvisionMatch = url.match(/\/v1\/identity\/internal\/locations\/([^/]+)\/owner\/provision$/);
      if (internalOwnerProvisionMatch && method === "POST") {
        const locationId = internalOwnerProvisionMatch[1];
        const body = JSON.parse(String(init?.body ?? "{}")) as { displayName?: string; email?: string };

        return new Response(
          JSON.stringify({
            operator: {
              operatorUserId: "123e4567-e89b-12d3-a456-426614174995",
              displayName: body.displayName ?? "Pilot Owner",
              email: body.email ?? "owner@northside.com",
              role: "owner",
              locationId,
              active: true,
              capabilities: [
                "orders:read",
                "orders:write",
                "menu:read",
                "menu:write",
                "menu:visibility",
                "store:read",
                "store:write",
                "team:read",
                "team:write"
              ],
              createdAt: "2026-03-20T00:00:00.000Z",
              updatedAt: "2026-03-20T00:00:00.000Z"
            },
            temporaryPassword: "Temporary123!",
            action: "created"
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        );
      }

      if (url.endsWith("/v1/payments/stripe/mobile-session") && method === "POST") {
        const headers = new Headers((init?.headers ?? {}) as HeadersInit);
        const body = JSON.parse(String(init?.body ?? "{}")) as { orderId?: string };
        expect(headers.get("x-gateway-token")).toBe("gateway-test-token");
        expect(headers.get("x-user-id")).toBe("123e4567-e89b-12d3-a456-426614174000");
        return new Response(
          JSON.stringify({
            orderId: body.orderId ?? "123e4567-e89b-12d3-a456-426614174112",
            paymentIntentId: "pi_3QxExample123",
            paymentIntentClientSecret: "pi_3QxExample123_secret_abc",
            publishableKey: "pk_test_payments",
            stripeAccountId: "acct_123456789",
            merchantDisplayName: "Northside Coffee",
            merchantCountryCode: "US",
            amountCents: 530,
            currency: "USD",
            applePayEnabled: true,
            cardEnabled: true
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        );
      }
      if (url.endsWith("/v1/payments/stripe/connect/onboarding-link") && method === "POST") {
        const headers = new Headers((init?.headers ?? {}) as HeadersInit);
        const body = JSON.parse(String(init?.body ?? "{}")) as {
          locationId?: string;
          returnUrl?: string;
          refreshUrl?: string;
        };
        expect(headers.get("x-gateway-token")).toBe("gateway-test-token");
        return new Response(
          JSON.stringify({
            locationId: body.locationId ?? "northside-01",
            stripeAccountId: "acct_1TOk7VE0L5J7W3jY",
            url: "https://connect.stripe.com/setup/s/test_123",
            expiresAt: "2026-04-22T12:00:00.000Z",
            paymentProfile: {
              locationId: body.locationId ?? "northside-01",
              stripeAccountId: "acct_1TOk7VE0L5J7W3jY",
              stripeAccountType: "express",
              stripeOnboardingStatus: "pending",
              stripeDetailsSubmitted: false,
              stripeChargesEnabled: false,
              stripePayoutsEnabled: false,
              stripeDashboardEnabled: true,
              country: "US",
              currency: "USD",
              cardEnabled: true,
              applePayEnabled: true,
              refundsEnabled: true,
              cloverPosEnabled: true
            },
            paymentReadiness: {
              ready: false,
              onboardingState: "pending",
              missingRequiredFields: ["stripeChargesEnabled", "stripePayoutsEnabled"]
            }
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        );
      }
      if (url.endsWith("/v1/payments/stripe/connect/dashboard-link") && method === "POST") {
        const headers = new Headers((init?.headers ?? {}) as HeadersInit);
        const body = JSON.parse(String(init?.body ?? "{}")) as { locationId?: string };
        expect(headers.get("x-gateway-token")).toBe("gateway-test-token");
        return new Response(
          JSON.stringify({
            locationId: body.locationId ?? "northside-01",
            stripeAccountId: "acct_1TOk7VE0L5J7W3jY",
            url: "https://connect.stripe.com/express/test_dashboard",
            paymentProfile: {
              locationId: body.locationId ?? "northside-01",
              stripeAccountId: "acct_1TOk7VE0L5J7W3jY",
              stripeAccountType: "express",
              stripeOnboardingStatus: "completed",
              stripeDetailsSubmitted: true,
              stripeChargesEnabled: true,
              stripePayoutsEnabled: true,
              stripeDashboardEnabled: true,
              country: "US",
              currency: "USD",
              cardEnabled: true,
              applePayEnabled: true,
              refundsEnabled: true,
              cloverPosEnabled: true
            },
            paymentReadiness: {
              ready: true,
              onboardingState: "completed",
              missingRequiredFields: []
            }
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        );
      }
      if (url.endsWith("/v1/payments/clover/oauth/connect") && method === "GET") {
        return new Response(
          JSON.stringify({
            authorizeUrl: "https://www.clover.com/oauth/v2/authorize?client_id=clover-app-id",
            redirectUri: "https://api.da0ud.me/v1/payments/clover/oauth/callback",
            stateExpiresAt: "2026-04-03T12:10:00.000Z"
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        );
      }

      if (url.includes("/v1/payments/clover/oauth/callback") && method === "GET") {
        const parsedUrl = new URL(url);
        if (parsedUrl.searchParams.get("merchant_id")) {
          return new Response("", {
            status: 302,
            headers: {
              location: "https://www.clover.com/oauth/v2/authorize?client_id=clover-app-id"
            }
          });
        }

        return new Response(
          JSON.stringify({
            providerMode: "live",
            oauthConfigured: true,
            connected: true,
            credentialSource: "oauth",
            merchantId: "test-merchant-123",
            connectedMerchantId: "test-merchant-123",
            accessTokenExpiresAt: "2026-04-03T12:00:00.000Z",
            apiAccessKeyConfigured: true
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        );
      }

      if (url.endsWith("/v1/payments/clover/oauth/refresh") && method === "POST") {
        return new Response(
          JSON.stringify({
            providerMode: "live",
            oauthConfigured: true,
            connected: true,
            credentialSource: "oauth",
            merchantId: "test-merchant-123",
            connectedMerchantId: "test-merchant-123",
            accessTokenExpiresAt: "2026-04-03T13:00:00.000Z",
            apiAccessKeyConfigured: true
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        );
      }

      if (url.endsWith("/v1/payments/webhooks/stripe") && method === "POST") {
        return new Response(
          JSON.stringify({
            accepted: true,
            provider: "STRIPE",
            eventId: "evt_stripe_gateway_1",
            eventType: "payment_intent.succeeded",
            duplicate: false,
            livemode: false,
            account: "acct_123456789"
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        );
      }

      if (url.includes("/v1/loyalty/balance") && method === "GET") {
        return new Response(
          JSON.stringify({
            userId: "123e4567-e89b-12d3-a456-426614174000",
            locationId: "flagship-01",
            availablePoints: 240,
            pendingPoints: 0,
            lifetimeEarned: 600
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        );
      }

      if (url.includes("/v1/loyalty/ledger") && method === "GET") {
        return new Response(
          JSON.stringify([
            {
              id: "123e4567-e89b-12d3-a456-426614174210",
              type: "EARN",
              points: 240,
              orderId: "123e4567-e89b-12d3-a456-426614174211",
              locationId: "flagship-01",
              createdAt: "2026-03-10T15:00:00.000Z"
            },
            {
              id: "123e4567-e89b-12d3-a456-426614174212",
              type: "REDEEM",
              points: -120,
              orderId: "123e4567-e89b-12d3-a456-426614174213",
              locationId: "flagship-01",
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

    if (previousPaymentsBaseUrl === undefined) {
      delete process.env.PAYMENTS_SERVICE_BASE_URL;
    } else {
      process.env.PAYMENTS_SERVICE_BASE_URL = previousPaymentsBaseUrl;
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

    if (previousValkeyUrl === undefined) {
      delete process.env.VALKEY_URL;
    } else {
      process.env.VALKEY_URL = previousValkeyUrl;
    }

    if (previousCorsAllowedOrigins === undefined) {
      delete process.env.CORS_ALLOWED_ORIGINS;
    } else {
      process.env.CORS_ALLOWED_ORIGINS = previousCorsAllowedOrigins;
    }

    if (previousCorsAllowedOriginHostSuffixes === undefined) {
      delete process.env.CORS_ALLOWED_ORIGIN_HOST_SUFFIXES;
    } else {
      process.env.CORS_ALLOWED_ORIGIN_HOST_SUFFIXES = previousCorsAllowedOriginHostSuffixes;
    }

    if (previousFreeClientDashboardDomain === undefined) {
      delete process.env.FREE_CLIENT_DASHBOARD_DOMAIN;
    } else {
      process.env.FREE_CLIENT_DASHBOARD_DOMAIN = previousFreeClientDashboardDomain;
    }

    if (previousNodeEnv === undefined) {
      delete process.env.NODE_ENV;
    } else {
      process.env.NODE_ENV = previousNodeEnv;
    }
  });

  it.each([
    ["IDENTITY_SERVICE_BASE_URL", "Identity"],
    ["ORDERS_SERVICE_BASE_URL", "Orders"],
    ["CATALOG_SERVICE_BASE_URL", "Catalog"],
    ["PAYMENTS_SERVICE_BASE_URL", "Payments"],
    ["LOYALTY_SERVICE_BASE_URL", "Loyalty"],
    ["NOTIFICATIONS_SERVICE_BASE_URL", "Notifications"]
  ])("fails fast in production when %s is missing", async (envVar, serviceLabel) => {
    process.env.NODE_ENV = "production";
    delete process.env[envVar];

    await expect(buildApp()).rejects.toThrow(`${envVar} must be configured in production for ${serviceLabel} upstream routing`);
  });

  it("returns health", async () => {
    const app = await buildApp();
    const response = await app.inject({ method: "GET", url: "/health" });

    expect(response.statusCode).toBe(200);
    await app.close();
  });

  it("allows the default client dashboard origin through CORS", async () => {
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

  it("allows common local dashboard origins through CORS", async () => {
    const app = await buildApp();
    const response = await app.inject({
      method: "GET",
      url: "/health",
      headers: {
        origin: "http://127.0.0.1:4173"
      }
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers["access-control-allow-origin"]).toBe("http://127.0.0.1:4173");
    await app.close();
  });

  it("derives the deployed dashboard origin from FREE_CLIENT_DASHBOARD_DOMAIN", async () => {
    delete process.env.CORS_ALLOWED_ORIGINS;
    process.env.FREE_CLIENT_DASHBOARD_DOMAIN = "client.example.com";
    const app = await buildApp();
    const response = await app.inject({
      method: "GET",
      url: "/health",
      headers: {
        origin: "https://client.example.com"
      }
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers["access-control-allow-origin"]).toBe("https://client.example.com");
    await app.close();
  });

  it("allows Vercel preview origins when an allowed host suffix is configured", async () => {
    delete process.env.CORS_ALLOWED_ORIGINS;
    process.env.CORS_ALLOWED_ORIGIN_HOST_SUFFIXES = "vercel.app";
    const app = await buildApp();
    const response = await app.inject({
      method: "GET",
      url: "/health",
      headers: {
        origin: "https://client-dashboard-git-develop-nomlyus-projects.vercel.app"
      }
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers["access-control-allow-origin"]).toBe(
      "https://client-dashboard-git-develop-nomlyus-projects.vercel.app"
    );
    await app.close();
  });

  it("rejects non-matching origins when an allowed host suffix is configured", async () => {
    delete process.env.CORS_ALLOWED_ORIGINS;
    process.env.CORS_ALLOWED_ORIGIN_HOST_SUFFIXES = "vercel.app";
    const app = await buildApp();
    const response = await app.inject({
      method: "GET",
      url: "/health",
      headers: {
        origin: "https://malicious-example.com"
      }
    });

    expect(response.statusCode).toBe(500);
    await app.close();
  });

  it("allows dashboard write-method preflights through CORS", async () => {
    const app = await buildApp();
    const response = await app.inject({
      method: "OPTIONS",
      url: "/v1/admin/staff/123e4567-e89b-12d3-a456-426614174999",
      headers: {
        origin: "http://localhost:5173",
        "access-control-request-method": "PATCH",
        "access-control-request-headers": "authorization,content-type"
      }
    });

    expect(response.statusCode).toBe(204);
    expect(response.headers["access-control-allow-origin"]).toBe("http://localhost:5173");
    expect(response.headers["access-control-allow-methods"]).toContain("PATCH");
    expect(response.headers["access-control-allow-methods"]).toContain("PUT");
    expect(response.headers["access-control-allow-headers"]).toContain("Authorization");
    expect(response.headers["access-control-allow-headers"]).toContain("Content-Type");
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

  it("proxies customer dev access sessions", async () => {
    const app = await buildApp();
    const response = await app.inject({
      method: "POST",
      url: "/v1/auth/dev-access",
      payload: {
        email: "dev@rawaq.local",
        name: "Rawaq Dev"
      }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      accessToken: "customer-access-token",
      refreshToken: "customer-refresh-token"
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
    expect(response.headers["cache-control"]).toBe("public, max-age=60");
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

  it("starts operator Google sign-in through identity", async () => {
    const app = await buildApp();
    const response = await app.inject({
      method: "GET",
      url: "/v1/operator/auth/google/start?redirectUri=http%3A%2F%2Flocalhost%3A5173%2F%3Fgoogle_auth_callback%3D1"
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      authorizeUrl: expect.stringContaining("accounts.google.com")
    });
    await app.close();
  });

  it("reports operator auth provider readiness through identity", async () => {
    const app = await buildApp();
    const response = await app.inject({
      method: "GET",
      url: "/v1/operator/auth/providers"
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      google: {
        configured: true
      }
    });
    await app.close();
  });

  it("exchanges operator Google auth codes through identity", async () => {
    const app = await buildApp();
    const response = await app.inject({
      method: "POST",
      url: "/v1/operator/auth/google/exchange",
      payload: {
        code: "google-auth-code",
        state: "signed-state",
        redirectUri: "http://localhost:5173/?google_auth_callback=1"
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

  it("forwards customer profile updates through /v1/auth/profile", async () => {
    const app = await buildApp();
    const response = await app.inject({
      method: "POST",
      url: "/v1/auth/profile",
      headers: {
        authorization: "Bearer access-token"
      },
      payload: {
        name: "Avery Quinn",
        displayName: "Avery Quinn",
        phoneNumber: "+13135550123",
        birthday: "1992-04-12"
      }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      name: "Avery Quinn",
      phoneNumber: "+13135550123",
      birthday: "1992-04-12",
      profileCompleted: true
    });
    await app.close();
  });

  it("forwards customer account deletion through /v1/auth/account", async () => {
    const app = await buildApp();
    const response = await app.inject({
      method: "DELETE",
      url: "/v1/auth/account",
      headers: {
        authorization: "Bearer access-token"
      }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ success: true });
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
        url: "/v1/auth/dev-access",
        payload: { email: "owner@gazellecoffee.com" }
      });
      expect(firstResponse.statusCode).toBe(200);

      const secondResponse = await app.inject({
        method: "POST",
        url: "/v1/auth/dev-access",
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
    const createResponse = await app.inject({
      method: "POST",
      url: "/v1/orders",
      headers: authHeader,
      payload: {
        quoteId: "123e4567-e89b-12d3-a456-426614174111",
        quoteHash: "gateway-quote-hash"
      }
    });
    expect(createResponse.statusCode).toBe(200);
    expect(createResponse.json()).toMatchObject({
      id: "123e4567-e89b-12d3-a456-426614174112",
      status: "PENDING_PAYMENT"
    });

    const orderId = createResponse.json().id as string;

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

  it("streams the customer order list snapshot as text/event-stream", async () => {
    process.env.GATEWAY_ORDER_STREAM_POLL_MS = "5";
    failOrderListFetchWhenQueueEmpty = true;
    const app = await buildApp();
    const initialOrders = [buildOrderPayload("123e4567-e89b-12d3-a456-426614174150", "PAID")];
    queuedOrderListPayloads = [initialOrders];

    const response = await app.inject({
      method: "GET",
      url: "/v1/orders/stream",
      headers: authHeader
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers["content-type"]).toContain("text/event-stream");
    expect(response.body).toContain('"type":"snapshot"');
    expect(response.body).toContain('"id":"123e4567-e89b-12d3-a456-426614174150"');

    await app.close();
  });

  it("streams customer order list changes without waiting for a manual refresh", async () => {
    process.env.GATEWAY_ORDER_STREAM_POLL_MS = "5";
    failOrderListFetchWhenQueueEmpty = true;
    const app = await buildApp();
    const initialOrder = buildOrderPayload("123e4567-e89b-12d3-a456-426614174151", "PAID");
    const newOrder = buildOrderPayload("123e4567-e89b-12d3-a456-426614174152", "PENDING_PAYMENT");
    queuedOrderListPayloads = [[initialOrder], [newOrder, initialOrder]];

    const response = await app.inject({
      method: "GET",
      url: "/v1/orders/stream",
      headers: authHeader
    });

    expect(response.statusCode).toBe(200);
    const dataEvents = response.body
      .split("\n\n")
      .filter((block) => block.startsWith("data: "))
      .map((block) => block.trim());
    expect(dataEvents).toHaveLength(2);
    expect(dataEvents[0]).toContain('"type":"snapshot"');
    expect(dataEvents[0]).toContain('"id":"123e4567-e89b-12d3-a456-426614174151"');
    expect(dataEvents[1]).toContain('"type":"snapshot"');
    expect(dataEvents[1]).toContain('"id":"123e4567-e89b-12d3-a456-426614174152"');

    await app.close();
  });

  it("continues polling customer order list changes when the event bus is configured", async () => {
    process.env.GATEWAY_ORDER_STREAM_POLL_MS = "5";
    process.env.VALKEY_URL = "redis://valkey.test:6379";
    failOrderListFetchWhenQueueEmpty = true;
    const app = await buildApp();
    const initialOrder = buildOrderPayload("123e4567-e89b-12d3-a456-426614174153", "PAID");
    const newOrder = buildOrderPayload("123e4567-e89b-12d3-a456-426614174154", "PENDING_PAYMENT");
    queuedOrderListPayloads = [[initialOrder], [newOrder, initialOrder]];

    const response = await app.inject({
      method: "GET",
      url: "/v1/orders/stream",
      headers: authHeader
    });

    expect(response.statusCode).toBe(200);
    expect(eventBusMocks.subscribeToAllOrderEvents).toHaveBeenCalledOnce();
    const dataEvents = response.body
      .split("\n\n")
      .filter((block) => block.startsWith("data: "))
      .map((block) => block.trim());
    expect(dataEvents).toHaveLength(2);
    expect(dataEvents[0]).toContain('"id":"123e4567-e89b-12d3-a456-426614174153"');
    expect(dataEvents[1]).toContain('"id":"123e4567-e89b-12d3-a456-426614174154"');

    await app.close();
  });

  it("keeps customer order list polling alive when event bus subscription fails", async () => {
    process.env.GATEWAY_ORDER_STREAM_POLL_MS = "5";
    process.env.VALKEY_URL = "redis://valkey.test:6379";
    eventBusMocks.subscribeToAllOrderEvents.mockRejectedValueOnce(new Error("subscription failed"));
    failOrderListFetchWhenQueueEmpty = true;
    const app = await buildApp();
    const initialOrder = buildOrderPayload("123e4567-e89b-12d3-a456-426614174155", "PAID");
    const newOrder = buildOrderPayload("123e4567-e89b-12d3-a456-426614174156", "READY");
    queuedOrderListPayloads = [[initialOrder], [newOrder, initialOrder]];

    const response = await app.inject({
      method: "GET",
      url: "/v1/orders/stream",
      headers: authHeader
    });

    expect(response.statusCode).toBe(200);
    const dataEvents = response.body
      .split("\n\n")
      .filter((block) => block.startsWith("data: "))
      .map((block) => block.trim());
    expect(dataEvents).toHaveLength(2);
    expect(dataEvents[1]).toContain('"id":"123e4567-e89b-12d3-a456-426614174156"');

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

  it("continues polling customer order status changes when the event bus is configured", async () => {
    process.env.GATEWAY_ORDER_STREAM_POLL_MS = "5";
    process.env.VALKEY_URL = "redis://valkey.test:6379";
    const app = await buildApp();
    const orderId = "123e4567-e89b-12d3-a456-426614174119";
    queuedOrderStatuses.set(orderId, ["IN_PREP", "READY", "COMPLETED"]);

    const response = await app.inject({
      method: "GET",
      url: `/v1/orders/${orderId}/stream`,
      headers: authHeader
    });

    expect(response.statusCode).toBe(200);
    expect(eventBusMocks.subscribeToOrderStatus).toHaveBeenCalledOnce();
    const dataEvents = response.body
      .split("\n\n")
      .filter((block) => block.startsWith("data: "))
      .map((block) => block.trim());
    expect(dataEvents).toHaveLength(3);
    expect(dataEvents[0]).toContain(`"status":"IN_PREP"`);
    expect(dataEvents[1]).toContain(`"status":"READY"`);
    expect(dataEvents[2]).toContain(`"status":"COMPLETED"`);

    await app.close();
  });

  it("streams order timeline revisions even when the status string does not change", async () => {
    process.env.GATEWAY_ORDER_STREAM_POLL_MS = "5";
    const app = await buildApp();
    const orderId = "123e4567-e89b-12d3-a456-426614174118";
    const initialOrder = buildOrderPayload(orderId, "IN_PREP");
    const noteUpdatedOrder = {
      ...initialOrder,
      timeline: [
        ...initialOrder.timeline,
        {
          status: "IN_PREP" as const,
          occurredAt: new Date(Date.now() + 1_000).toISOString(),
          note: "Barista marked the order as almost ready"
        }
      ]
    };
    const completedOrder = buildOrderPayload(orderId, "COMPLETED");

    queuedOrderPayloads.set(orderId, [initialOrder, noteUpdatedOrder, completedOrder]);

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
    expect(dataEvents).toHaveLength(3);
    expect(dataEvents[0]).toContain(`"status":"IN_PREP"`);
    expect(dataEvents[1]).toContain(`"status":"IN_PREP"`);
    expect(dataEvents[1]).toContain(`"Barista marked the order as almost ready"`);
    expect(dataEvents[2]).toContain(`"status":"COMPLETED"`);

    await app.close();
  });

  it("requires a valid operator session before proxying admin routes", async () => {
    const app = await buildApp();
    const response = await app.inject({
      method: "GET",
      url: "/v1/admin/orders",
      headers: {
        authorization: "Bearer operator-expired-access-token"
      }
    });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({ code: "UNAUTHORIZED" });
    const requestedUrls = fetchMock.mock.calls.map(([input]) => (typeof input === "string" ? input : input.url));
    expect(requestedUrls).toEqual(["http://identity.internal/v1/operator/auth/me"]);
    await app.close();
  });

  it("forwards admin reads through the gateway for owners", async () => {
    const app = await buildApp();

    const ordersResponse = await app.inject({
      method: "GET",
      url: "/v1/admin/orders",
      headers: {
        ...ownerOperatorHeaders,
        "x-user-id": "123e4567-e89b-12d3-a456-426614174099"
      }
    });
    expect(ordersResponse.statusCode).toBe(200);
    expect(ordersResponse.json()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          status: "PAID",
          pickupCode: "PAID01",
          customer: {
            name: "Avery Quinn",
            email: "avery@example.com",
            phone: "+13135550123"
          }
        })
      ])
    );

    const menuResponse = await app.inject({
      method: "GET",
      url: "/v1/admin/menu",
      headers: ownerOperatorHeaders
    });
    expect(menuResponse.statusCode).toBe(200);
    expect(menuResponse.json()).toMatchObject({
      categories: expect.arrayContaining([expect.objectContaining({ categoryId: "espresso" })])
    });

    const storeResponse = await app.inject({
      method: "GET",
      url: "/v1/admin/store/config",
      headers: ownerOperatorHeaders
    });
    expect(storeResponse.statusCode).toBe(200);
    expect(storeResponse.json()).toMatchObject({
      storeName: "Gazelle Coffee",
      locationName: "Ann Arbor, MI"
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

  it("forwards admin menu customization updates through the gateway", async () => {
    const app = await buildApp();

    const response = await app.inject({
      method: "PUT",
      url: "/v1/admin/menu/latte",
      headers: ownerOperatorHeaders,
      payload: {
        name: "Honey Oat Latte",
        priceCents: 675,
        visible: true,
        customizationGroups: [
          {
            id: "milk",
            label: "Milk",
            selectionType: "single",
            required: true,
            sortOrder: 0,
            options: [
              {
                id: "oat",
                label: "Oat milk",
                priceDeltaCents: 75,
                default: true,
                available: true,
                sortOrder: 0
              }
            ]
          }
        ]
      }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      itemId: "latte",
      customizationGroups: [
        {
          id: "milk",
          label: "Milk"
        }
      ]
    });

    const updateCall = fetchMock.mock.calls.find(([input, init]) => {
      const url = typeof input === "string" ? input : input.url;
      return url === "http://catalog.internal/v1/catalog/admin/menu/latte" && (init?.method ?? "GET") === "PUT";
    });
    expect(updateCall).toBeDefined();
    expect(JSON.parse(String(updateCall?.[1]?.body ?? "{}"))).toMatchObject({
      customizationGroups: [
        {
          id: "milk",
          options: [{ id: "oat" }]
        }
      ]
    });

    await app.close();
  });

  it("rejects invalid admin menu customization updates with a client error", async () => {
    const app = await buildApp();

    const response = await app.inject({
      method: "PUT",
      url: "/v1/admin/menu/latte",
      headers: ownerOperatorHeaders,
      payload: {
        name: "Honey Oat Latte",
        priceCents: 675,
        visible: true,
        customizationGroups: [
          {
            id: "milk",
            label: "Milk",
            selectionType: "single",
            required: true,
            sortOrder: 0,
            options: [
              {
                id: "oat",
                label: "Oat milk",
                priceDeltaCents: "75",
                default: true,
                available: true,
                sortOrder: 0
              }
            ]
          }
        ]
      }
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({
      code: "INVALID_REQUEST",
      message: "Admin menu update payload is invalid"
    });

    const updateCall = fetchMock.mock.calls.find(([input, init]) => {
      const url = typeof input === "string" ? input : input.url;
      return url === "http://catalog.internal/v1/catalog/admin/menu/latte" && (init?.method ?? "GET") === "PUT";
    });
    expect(updateCall).toBeUndefined();

    await app.close();
  });

  it("blocks store accounts from owner-only admin routes", async () => {
    const app = await buildApp();

    const createResponse = await app.inject({
      method: "POST",
      url: "/v1/admin/staff",
      headers: storeOperatorHeaders,
      payload: {
        displayName: "Blocked User",
        email: "blocked@gazellecoffee.com",
        role: "store",
        password: "BlockedUser123!"
      }
    });
    expect(createResponse.statusCode).toBe(403);
    expect(createResponse.json()).toMatchObject({ code: "FORBIDDEN" });

    const storeUpdateResponse = await app.inject({
      method: "PUT",
      url: "/v1/admin/store/config",
      headers: storeOperatorHeaders,
      payload: {
        storeName: "Blocked Rename",
        locationName: "Blocked Location",
        hours: "Daily · 7:00 AM - 6:00 PM",
        pickupInstructions: "Pickup at the bar."
      }
    });
    expect(storeUpdateResponse.statusCode).toBe(403);
    expect(storeUpdateResponse.json()).toMatchObject({ code: "FORBIDDEN" });

    const requestedUrls = fetchMock.mock.calls.map(([input]) => (typeof input === "string" ? input : input.url));
    expect(requestedUrls).toEqual([
      "http://identity.internal/v1/operator/auth/me",
      "http://identity.internal/v1/operator/auth/me"
    ]);

    await app.close();
  });

  it("forwards owner team and store management routes", async () => {
    const app = await buildApp();
    const operatorUserId = "123e4567-e89b-12d3-a456-426614174997";

    const listResponse = await app.inject({
      method: "GET",
      url: "/v1/admin/staff",
      headers: ownerOperatorHeaders
    });
    expect(listResponse.statusCode).toBe(200);
    expect(listResponse.json()).toMatchObject({
      users: expect.arrayContaining([expect.objectContaining({ email: "owner@gazellecoffee.com", role: "owner" })])
    });

    const createResponse = await app.inject({
      method: "POST",
      url: "/v1/admin/staff",
      headers: ownerOperatorHeaders,
      payload: {
        displayName: "Night Lead",
        email: "nightlead@gazellecoffee.com",
        role: "manager",
        password: "NightLead123!"
      }
    });
    expect(createResponse.statusCode).toBe(200);
    expect(createResponse.json()).toMatchObject({
      email: "nightlead@gazellecoffee.com",
      role: "manager",
      locationId: "flagship-01"
    });

    const patchResponse = await app.inject({
      method: "PATCH",
      url: `/v1/admin/staff/${operatorUserId}`,
      headers: ownerOperatorHeaders,
      payload: {
        active: false
      }
    });
    expect(patchResponse.statusCode).toBe(200);
    expect(patchResponse.json()).toMatchObject({
      operatorUserId,
      active: false
    });

    const storeUpdateResponse = await app.inject({
      method: "PUT",
      url: "/v1/admin/store/config",
      headers: ownerOperatorHeaders,
      payload: {
        storeName: "LatteLink Flagship",
        locationName: "Ann Arbor, MI",
        hours: "Daily · 6:00 AM - 5:00 PM",
        pickupInstructions: "Pickup at the front bar."
      }
    });
    expect(storeUpdateResponse.statusCode).toBe(200);
    expect(storeUpdateResponse.json()).toMatchObject({
      storeName: "LatteLink Flagship",
      locationName: "Ann Arbor, MI",
      pickupInstructions: "Pickup at the front bar."
    });

    const requestedUrls = fetchMock.mock.calls.map(([input]) => (typeof input === "string" ? input : input.url));
    expect(requestedUrls).toContain("http://identity.internal/v1/operator/users");
    expect(requestedUrls).toContain(`http://identity.internal/v1/operator/users/${operatorUserId}`);
    expect(requestedUrls).toContain("http://catalog.internal/v1/catalog/admin/store/config");

    const createCall = fetchMock.mock.calls.find(([input, init]) => {
      const url = typeof input === "string" ? input : input.url;
      return url === "http://identity.internal/v1/operator/users" && (init?.method ?? "GET") === "POST";
    });
    expect(createCall).toBeDefined();
    if (createCall) {
      const upstreamHeaders = new Headers((createCall[1]?.headers ?? {}) as HeadersInit);
      expect(upstreamHeaders.get("x-user-id")).toBeNull();
    }

    await app.close();
  });

  it("surfaces duplicate team-email conflicts from identity", async () => {
    const app = await buildApp();
    const operatorUserId = "123e4567-e89b-12d3-a456-426614174997";

    const duplicateCreate = await app.inject({
      method: "POST",
      url: "/v1/admin/staff",
      headers: ownerOperatorHeaders,
      payload: {
        displayName: "Duplicate Owner",
        email: "owner@gazellecoffee.com",
        role: "manager",
        password: "DuplicateOwner123!"
      }
    });
    expect(duplicateCreate.statusCode).toBe(409);
    expect(duplicateCreate.json()).toMatchObject({
      code: "OPERATOR_EMAIL_ALREADY_EXISTS"
    });

    const duplicateUpdate = await app.inject({
      method: "PATCH",
      url: `/v1/admin/staff/${operatorUserId}`,
      headers: ownerOperatorHeaders,
      payload: {
        email: "owner@gazellecoffee.com"
      }
    });
    expect(duplicateUpdate.statusCode).toBe(409);
    expect(duplicateUpdate.json()).toMatchObject({
      code: "OPERATOR_EMAIL_ALREADY_EXISTS"
    });

    await app.close();
  });

  it("forwards admin lifecycle updates with the internal orders token", async () => {
    const app = await buildApp();
    const orderId = "123e4567-e89b-12d3-a456-426614174114";
    const response = await app.inject({
      method: "POST",
      url: `/v1/admin/orders/${orderId}/status`,
      headers: storeOperatorHeaders,
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
      expect(upstreamHeaders.get("x-operator-location-id")).toBe("flagship-01");
    }

    await app.close();
  });

  it("allows multi-location operators to scope order reads to an accessible location", async () => {
    const app = await buildApp();
    const response = await app.inject({
      method: "GET",
      url: "/v1/admin/orders?locationId=northside-01",
      headers: multiLocationOperatorHeaders
    });

    expect(response.statusCode).toBe(200);
    const ordersCall = fetchMock.mock.calls.find(([input]) => {
      const url = typeof input === "string" ? input : input.url;
      return url === "http://orders.internal/v1/orders";
    });
    expect(ordersCall).toBeDefined();
    if (ordersCall) {
      const upstreamHeaders = new Headers((ordersCall[1]?.headers ?? {}) as HeadersInit);
      expect(upstreamHeaders.get("x-operator-location-id")).toBe("northside-01");
    }

    await app.close();
  });

  it("rejects operator requests for locations outside their access set", async () => {
    const app = await buildApp();
    const response = await app.inject({
      method: "GET",
      url: "/v1/admin/staff?locationId=westside-01",
      headers: multiLocationOperatorHeaders
    });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({
      code: "FORBIDDEN"
    });
    expect(
      fetchMock.mock.calls.some(([input]) => {
        const url = typeof input === "string" ? input : input.url;
        return url.includes("/v1/operator/users");
      })
    ).toBe(false);

    await app.close();
  });

  it("routes admin cancellations through the refund-aware cancel endpoint", async () => {
    const app = await buildApp();
    const orderId = "123e4567-e89b-12d3-a456-426614174115";
    const response = await app.inject({
      method: "POST",
      url: `/v1/admin/orders/${orderId}/status`,
      headers: storeOperatorHeaders,
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
      expect(upstreamHeaders.get("x-operator-location-id")).toBe("flagship-01");
      expect(JSON.parse(String(cancelCall[1]?.body ?? "{}"))).toEqual({
        reason: "Espresso machine issue"
      });
    }

    await app.close();
  });

  it("forwards internal pilot bootstrap routes for authenticated internal admins", async () => {
    const app = await buildApp();

    const bootstrapResponse = await app.inject({
      method: "POST",
      url: "/v1/internal/locations/bootstrap",
      headers: ownerInternalAdminHeaders,
      payload: {
        brandId: "northside-coffee",
        brandName: "Northside Coffee",
        locationId: "northside-01",
        locationName: "Northside Flagship",
        marketLabel: "Detroit, MI"
      }
    });
    expect(bootstrapResponse.statusCode).toBe(200);
    expect(bootstrapResponse.json()).toMatchObject({
      brandName: "Northside Coffee",
      locationId: "northside-01",
      action: "created"
    });

    const listResponse = await app.inject({
      method: "GET",
      url: "/v1/internal/locations",
      headers: ownerInternalAdminHeaders
    });
    expect(listResponse.statusCode).toBe(200);
    expect(listResponse.json()).toMatchObject({
      locations: [
        {
          locationId: "northside-01",
          brandName: "Northside Coffee"
        }
      ]
    });

    const ownerResponse = await app.inject({
      method: "POST",
      url: "/v1/internal/locations/northside-01/owner/provision",
      headers: ownerInternalAdminHeaders,
      payload: {
        displayName: "Pilot Owner",
        email: "owner@northside.com"
      }
    });
    expect(ownerResponse.statusCode).toBe(200);
    expect(ownerResponse.json()).toMatchObject({
      operator: {
        email: "owner@northside.com",
        locationId: "northside-01",
        role: "owner"
      },
      action: "created"
    });

    const ownerSummaryResponse = await app.inject({
      method: "GET",
      url: "/v1/internal/locations/northside-01/owner",
      headers: ownerInternalAdminHeaders
    });
    expect(ownerSummaryResponse.statusCode).toBe(200);
    expect(ownerSummaryResponse.json()).toMatchObject({
      locationId: "northside-01",
      owner: {
        email: "owner@northside.com",
        role: "owner"
      }
    });

    const summaryResponse = await app.inject({
      method: "GET",
      url: "/v1/internal/locations/northside-01",
      headers: ownerInternalAdminHeaders
    });
    expect(summaryResponse.statusCode).toBe(200);
    expect(summaryResponse.json()).toMatchObject({
      locationId: "northside-01",
      marketLabel: "Detroit, MI"
    });

    const paymentProfileResponse = await app.inject({
      method: "GET",
      url: "/v1/internal/locations/northside-01/payment-profile",
      headers: ownerInternalAdminHeaders
    });
    expect(paymentProfileResponse.statusCode).toBe(200);
    expect(paymentProfileResponse.json()).toMatchObject({
      locationId: "northside-01",
      stripeAccountId: "acct_123456789",
      stripeOnboardingStatus: "completed"
    });

    const paymentProfileUpdateResponse = await app.inject({
      method: "PUT",
      url: "/v1/internal/locations/northside-01/payment-profile",
      headers: ownerInternalAdminHeaders,
      payload: {
        stripeAccountId: "acct_1TOk7VE0L5J7W3jY",
        stripeOnboardingStatus: "completed",
        stripeDetailsSubmitted: true,
        stripeChargesEnabled: true,
        stripePayoutsEnabled: true,
        stripeDashboardEnabled: true,
        country: "US",
        currency: "USD",
        cardEnabled: true,
        applePayEnabled: true,
        refundsEnabled: true,
        cloverPosEnabled: true
      }
    });
    expect(paymentProfileUpdateResponse.statusCode).toBe(200);
    expect(paymentProfileUpdateResponse.json()).toMatchObject({
      locationId: "northside-01",
      stripeAccountId: "acct_1TOk7VE0L5J7W3jY",
      stripeOnboardingStatus: "completed"
    });

    const bootstrapCall = fetchMock.mock.calls.find(([input]) => {
      const url = typeof input === "string" ? input : input.url;
      return url === "http://catalog.internal/v1/catalog/internal/locations/bootstrap";
    });
    expect(bootstrapCall).toBeDefined();
    if (bootstrapCall) {
      const upstreamHeaders = new Headers((bootstrapCall[1]?.headers ?? {}) as HeadersInit);
      expect(upstreamHeaders.get("x-gateway-token")).toBe("gateway-test-token");
      expect(upstreamHeaders.get("x-user-id")).toBeNull();
    }

    const paymentProfileGetCall = fetchMock.mock.calls.find(([input]) => {
      const url = typeof input === "string" ? input : input.url;
      return url === "http://catalog.internal/v1/catalog/internal/locations/northside-01/payment-profile";
    });
    expect(paymentProfileGetCall).toBeDefined();
    if (paymentProfileGetCall) {
      const upstreamHeaders = new Headers((paymentProfileGetCall[1]?.headers ?? {}) as HeadersInit);
      expect(upstreamHeaders.get("x-gateway-token")).toBe("gateway-test-token");
      expect(upstreamHeaders.get("x-user-id")).toBeNull();
    }

    const paymentProfileUpdateCall = [...fetchMock.mock.calls].reverse().find(([input, init]) => {
      const url = typeof input === "string" ? input : input.url;
      return url === "http://catalog.internal/v1/catalog/internal/locations/northside-01/payment-profile" && init?.method === "PUT";
    });
    expect(paymentProfileUpdateCall).toBeDefined();
    if (paymentProfileUpdateCall) {
      const upstreamHeaders = new Headers((paymentProfileUpdateCall[1]?.headers ?? {}) as HeadersInit);
      expect(upstreamHeaders.get("x-gateway-token")).toBe("gateway-test-token");
      expect(upstreamHeaders.get("x-user-id")).toBeNull();
      expect(JSON.parse(String(paymentProfileUpdateCall[1]?.body ?? "{}"))).toMatchObject({
        locationId: "northside-01",
        stripeAccountId: "acct_1TOk7VE0L5J7W3jY",
        stripeOnboardingStatus: "completed"
      });
    }

    await app.close();
  });

  it("rejects internal pilot routes without internal admin auth", async () => {
    const app = await buildApp();

    const response = await app.inject({
      method: "POST",
      url: "/v1/internal/locations/bootstrap",
      payload: {
        brandId: "northside-coffee",
        brandName: "Northside Coffee",
        locationId: "northside-01",
        locationName: "Northside Flagship",
        marketLabel: "Detroit, MI"
      }
    });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({
      code: "UNAUTHORIZED_INTERNAL_ADMIN"
    });
    expect(fetchMock).not.toHaveBeenCalledWith(
      "http://catalog.internal/v1/catalog/internal/locations/bootstrap",
      expect.anything()
    );

    await app.close();
  });

  it("rejects internal admin mutations without the required capability", async () => {
    const app = await buildApp();

    const response = await app.inject({
      method: "POST",
      url: "/v1/internal/locations/bootstrap",
      headers: readonlyInternalAdminHeaders,
      payload: {
        brandId: "northside-coffee",
        brandName: "Northside Coffee",
        locationId: "northside-01",
        locationName: "Northside Flagship",
        marketLabel: "Detroit, MI"
      }
    });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({
      code: "FORBIDDEN"
    });
    expect(fetchMock).not.toHaveBeenCalledWith(
      "http://catalog.internal/v1/catalog/internal/locations/bootstrap",
      expect.anything()
    );

    await app.close();
  });

  it("forwards loyalty balance and ledger routes", async () => {
    const app = await buildApp();

    const balanceResponse = await app.inject({
      method: "GET",
      url: "/v1/loyalty/balance?locationId=flagship-01",
      headers: authHeader
    });
    expect(balanceResponse.statusCode).toBe(200);
    expect(balanceResponse.json()).toMatchObject({
      availablePoints: 240,
      lifetimeEarned: 600
    });

    const ledgerResponse = await app.inject({
      method: "GET",
      url: "/v1/loyalty/ledger?locationId=flagship-01",
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
    expect(requestedUrls).toContain("http://loyalty.internal/v1/loyalty/balance?locationId=flagship-01");
    expect(requestedUrls).toContain("http://loyalty.internal/v1/loyalty/ledger?locationId=flagship-01");

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

  it("forwards Stripe mobile payment session creation through the gateway", async () => {
    const app = await buildApp();
    const orderId = "123e4567-e89b-12d3-a456-426614174112";
    const response = await app.inject({
      method: "POST",
      url: "/v1/payments/stripe/mobile-session",
      headers: authHeader,
      payload: {
        orderId
      }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      orderId,
      paymentIntentId: "pi_3QxExample123",
      paymentIntentClientSecret: "pi_3QxExample123_secret_abc",
      stripeAccountId: "acct_123456789"
    });

    const sessionCall = fetchMock.mock.calls.find(
      ([input]) => (typeof input === "string" ? input : input.url) === "http://payments.internal/v1/payments/stripe/mobile-session"
    );
    expect(sessionCall).toBeDefined();

    await app.close();
  });

  it("forwards Stripe onboarding-link creation through the internal gateway", async () => {
    const app = await buildApp();
    const response = await app.inject({
      method: "POST",
      url: "/v1/internal/locations/northside-01/stripe/onboarding-link",
      headers: ownerInternalAdminHeaders,
      payload: {
        returnUrl: "https://admin.example.com/clients/northside-01/payments",
        refreshUrl: "https://admin.example.com/clients/northside-01/payments?refresh=1"
      }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      locationId: "northside-01",
      stripeAccountId: "acct_1TOk7VE0L5J7W3jY",
      paymentReadiness: {
        ready: false
      }
    });

    const onboardingCall = fetchMock.mock.calls.find(([input]) => {
      const url = typeof input === "string" ? input : input.url;
      return url === "http://payments.internal/v1/payments/stripe/connect/onboarding-link";
    });
    expect(onboardingCall).toBeDefined();
    if (onboardingCall) {
      const upstreamHeaders = new Headers((onboardingCall[1]?.headers ?? {}) as HeadersInit);
      expect(upstreamHeaders.get("x-gateway-token")).toBe("gateway-test-token");
      expect(JSON.parse(String(onboardingCall[1]?.body ?? "{}"))).toMatchObject({
        locationId: "northside-01",
        returnUrl: "https://admin.example.com/clients/northside-01/payments",
        refreshUrl: "https://admin.example.com/clients/northside-01/payments?refresh=1"
      });
    }

    await app.close();
  });

  it("forwards Stripe dashboard-link creation through the internal gateway", async () => {
    const app = await buildApp();
    const response = await app.inject({
      method: "POST",
      url: "/v1/internal/locations/northside-01/stripe/dashboard-link",
      headers: ownerInternalAdminHeaders,
      payload: {}
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      locationId: "northside-01",
      stripeAccountId: "acct_1TOk7VE0L5J7W3jY",
      paymentReadiness: {
        ready: true
      }
    });

    const dashboardCall = fetchMock.mock.calls.find(([input]) => {
      const url = typeof input === "string" ? input : input.url;
      return url === "http://payments.internal/v1/payments/stripe/connect/dashboard-link";
    });
    expect(dashboardCall).toBeDefined();
    if (dashboardCall) {
      const upstreamHeaders = new Headers((dashboardCall[1]?.headers ?? {}) as HeadersInit);
      expect(upstreamHeaders.get("x-gateway-token")).toBe("gateway-test-token");
      expect(JSON.parse(String(dashboardCall[1]?.body ?? "{}"))).toMatchObject({
        locationId: "northside-01"
      });
    }

    await app.close();
  });

  it("preserves Clover OAuth callback redirects through the gateway", async () => {
    const app = await buildApp();
    const response = await app.inject({
      method: "GET",
      url: "/v1/payments/clover/oauth/callback?merchant_id=test-merchant-123"
    });

    expect(response.statusCode).toBe(302);
    expect(response.headers.location).toBe("https://www.clover.com/oauth/v2/authorize?client_id=clover-app-id");

    const callbackCall = fetchMock.mock.calls.find(([input]) =>
      (typeof input === "string" ? input : input.url).includes("/v1/payments/clover/oauth/callback?merchant_id=test-merchant-123")
    );
    expect(callbackCall).toBeDefined();

    await app.close();
  });

  it("forwards Stripe webhook requests with the raw body and signature through the gateway", async () => {
    const app = await buildApp();
    const payload = JSON.stringify({
      id: "evt_stripe_gateway_1",
      type: "payment_intent.succeeded",
      data: {
        object: {
          id: "pi_gateway_1"
        }
      }
    });
    const stripeSignature = "t=123,v1=test-signature";

    const response = await app.inject({
      method: "POST",
      url: "/v1/payments/webhooks/stripe",
      headers: {
        "content-type": "application/json",
        "stripe-signature": stripeSignature
      },
      payload
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      accepted: true,
      provider: "STRIPE",
      eventId: "evt_stripe_gateway_1"
    });

    const webhookCall = fetchMock.mock.calls.find(([input]) =>
      (typeof input === "string" ? input : input.url).endsWith("/v1/payments/webhooks/stripe")
    );
    expect(webhookCall).toBeDefined();
    if (webhookCall) {
      expect(typeof webhookCall[0] === "string" ? webhookCall[0] : webhookCall[0].url).toBe(
        "http://payments.internal/v1/payments/webhooks/stripe"
      );
      expect(webhookCall[1]?.body).toBe(payload);
      const upstreamHeaders = new Headers((webhookCall[1]?.headers ?? {}) as HeadersInit);
      expect(upstreamHeaders.get("stripe-signature")).toBe(stripeSignature);
      expect(upstreamHeaders.get("content-type")).toBe("application/json");
    }

    await app.close();
  });

  it("rate limits Clover OAuth refresh writes when configured threshold is reached", async () => {
    vi.stubEnv("GATEWAY_RATE_LIMIT_PAYMENTS_WRITE_MAX", "1");
    vi.stubEnv("GATEWAY_RATE_LIMIT_WINDOW_MS", "60000");
    const app = await buildApp();

    try {
      const firstResponse = await app.inject({
        method: "POST",
        url: "/v1/payments/clover/oauth/refresh"
      });
      expect(firstResponse.statusCode).toBe(200);

      const secondResponse = await app.inject({
        method: "POST",
        url: "/v1/payments/clover/oauth/refresh"
      });
      expect(secondResponse.statusCode).toBe(429);
    } finally {
      vi.unstubAllEnvs();
      await app.close();
    }
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
        url: "/v1/auth/dev-access",
        payload: { email: "owner@gazellecoffee.com" }
      });
      expect(firstRequest.statusCode).toBe(200);

      const secondRequest = await app.inject({
        method: "POST",
        url: "/v1/auth/dev-access",
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
