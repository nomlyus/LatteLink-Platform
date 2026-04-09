import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GazelleApiClient } from "../src";

describe("sdk-mobile", () => {
  const fetchMock = vi.fn<typeof fetch>();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("creates client instance", () => {
    const client = new GazelleApiClient({ baseUrl: "https://api.gazellecoffee.com/v1" });
    expect(client).toBeInstanceOf(GazelleApiClient);
  });

  it("requests a customer dev-access session", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          accessToken: "customer-access-token",
          refreshToken: "customer-refresh-token",
          expiresAt: "2030-01-01T00:30:00.000Z",
          userId: "123e4567-e89b-12d3-a456-426614174000"
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      )
    );

    const client = new GazelleApiClient({ baseUrl: "https://api.gazellecoffee.com/v1" });
    const session = await client.devAccess({
      email: "dev@rawaq.local",
      name: "Rawaq Dev"
    });

    expect(session).toMatchObject({
      accessToken: "customer-access-token",
      refreshToken: "customer-refresh-token",
      userId: "123e4567-e89b-12d3-a456-426614174000"
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.gazellecoffee.com/v1/auth/dev-access",
      expect.objectContaining({
        method: "POST"
      })
    );
  });

  it("parses menu and store config responses", async () => {
    fetchMock
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            locationId: "flagship-01",
            currency: "USD",
            categories: [
              {
                id: "coffee",
                title: "Coffee",
                items: [
                  {
                    id: "latte",
                    name: "Latte",
                    description: "Steamed milk and espresso",
                    priceCents: 575,
                    badgeCodes: ["popular"],
                    visible: true
                  }
                ]
              }
            ]
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        )
      )
      .mockResolvedValueOnce(
        new Response(
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
        )
      )
      .mockResolvedValueOnce(
        new Response(
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
              staffDashboard: false,
              menuEditing: false
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
        )
      );

    const client = new GazelleApiClient({ baseUrl: "https://api.gazellecoffee.com/v1" });
    const menu = await client.menu();
    const storeConfig = await client.storeConfig();
    const appConfig = await client.appConfig();

    expect(menu.categories[0]?.items[0]?.name).toBe("Latte");
    expect(storeConfig.taxRateBasisPoints).toBe(600);
    expect(storeConfig.nextOpenAt).toBeNull();
    expect(storeConfig.isOpen).toBe(true);
    expect(appConfig.brand.brandName).toBe("Gazelle Coffee");
    expect(appConfig.fulfillment.mode).toBe("time_based");
  });

  it("supports quote, create, and pay order flow", async () => {
    fetchMock
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            quoteId: "123e4567-e89b-12d3-a456-426614174011",
            locationId: "flagship-01",
            items: [{ itemId: "latte", quantity: 1, unitPriceCents: 675 }],
            subtotal: { currency: "USD", amountCents: 675 },
            discount: { currency: "USD", amountCents: 0 },
            tax: { currency: "USD", amountCents: 41 },
            total: { currency: "USD", amountCents: 716 },
            pointsToRedeem: 0,
            quoteHash: "quote-hash"
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        )
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            id: "123e4567-e89b-12d3-a456-426614174012",
            locationId: "flagship-01",
            status: "PENDING_PAYMENT",
            items: [{ itemId: "latte", quantity: 1, unitPriceCents: 675 }],
            total: { currency: "USD", amountCents: 716 },
            pickupCode: "A1B2C3",
            timeline: [{ status: "PENDING_PAYMENT", occurredAt: "2026-03-10T00:00:00.000Z" }]
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        )
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            id: "123e4567-e89b-12d3-a456-426614174012",
            locationId: "flagship-01",
            status: "PAID",
            items: [{ itemId: "latte", quantity: 1, unitPriceCents: 675 }],
            total: { currency: "USD", amountCents: 716 },
            pickupCode: "A1B2C3",
            timeline: [
              { status: "PENDING_PAYMENT", occurredAt: "2026-03-10T00:00:00.000Z" },
              { status: "PAID", occurredAt: "2026-03-10T00:01:00.000Z" }
            ]
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        )
      );

    const client = new GazelleApiClient({ baseUrl: "https://api.gazellecoffee.com/v1" });

    const quote = await client.quoteOrder({
      locationId: "flagship-01",
      items: [{ itemId: "latte", quantity: 1 }],
      pointsToRedeem: 0
    });
    const order = await client.createOrder({ quoteId: quote.quoteId, quoteHash: quote.quoteHash });
    const paidOrder = await client.payOrder(order.id, {
      applePayToken: "apple-pay-token",
      idempotencyKey: "checkout-idempotency-key"
    });

    expect(quote.quoteHash).toBe("quote-hash");
    expect(order.status).toBe("PENDING_PAYMENT");
    expect(paidOrder.status).toBe("PAID");
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("supports customer profile completion updates", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          userId: "123e4567-e89b-12d3-a456-426614174000",
          email: "member@example.com",
          name: "Avery Quinn",
          displayName: "Avery Quinn",
          phoneNumber: "+13135550123",
          birthday: "1992-04-12",
          profileCompleted: true,
          methods: ["apple"]
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      )
    );

    const client = new GazelleApiClient({ baseUrl: "https://api.gazellecoffee.com/v1" });
    const me = await client.saveCustomerProfile({
      name: "Avery Quinn",
      displayName: "Avery Quinn",
      phoneNumber: "+13135550123",
      birthday: "1992-04-12"
    });

    expect(me.name).toBe("Avery Quinn");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("supports customer account deletion", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: { "content-type": "application/json" }
      })
    );

    const client = new GazelleApiClient({ baseUrl: "https://api.gazellecoffee.com/v1" });
    const response = await client.deleteAccount();

    expect(response.success).toBe(true);
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.gazellecoffee.com/v1/auth/account",
      expect.objectContaining({
        method: "DELETE"
      })
    );
  });

  it("supports structured Apple Pay wallet payload for payOrder", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          id: "123e4567-e89b-12d3-a456-426614174112",
          locationId: "flagship-01",
          status: "PAID",
          items: [{ itemId: "latte", quantity: 1, unitPriceCents: 675 }],
          total: { currency: "USD", amountCents: 716 },
          pickupCode: "A1B2C3",
          timeline: [
            { status: "PENDING_PAYMENT", occurredAt: "2026-03-10T00:00:00.000Z" },
            { status: "PAID", occurredAt: "2026-03-10T00:01:00.000Z" }
          ]
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      )
    );

    const client = new GazelleApiClient({ baseUrl: "https://api.gazellecoffee.com/v1" });
    const orderId = "123e4567-e89b-12d3-a456-426614174112";
    const paidOrder = await client.payOrder(orderId, {
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
      idempotencyKey: "checkout-wallet-idempotency-key"
    });

    expect(paidOrder.status).toBe("PAID");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const request = fetchMock.mock.calls[0];
    expect(request).toBeDefined();
    if (request) {
      const body = JSON.parse(String(request[1]?.body ?? "{}")) as Record<string, unknown>;
      expect(body).toMatchObject({
        idempotencyKey: "checkout-wallet-idempotency-key",
        applePayWallet: {
          version: "EC_v1"
        }
      });
      expect(body.applePayToken).toBeUndefined();
    }
  });

  it("supports direct Clover source tokens for payOrder", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          id: "123e4567-e89b-12d3-a456-426614174113",
          locationId: "flagship-01",
          status: "PAID",
          items: [{ itemId: "latte", quantity: 1, unitPriceCents: 675 }],
          total: { currency: "USD", amountCents: 716 },
          pickupCode: "A1B2C3",
          timeline: [
            { status: "PENDING_PAYMENT", occurredAt: "2026-03-10T00:00:00.000Z" },
            { status: "PAID", occurredAt: "2026-03-10T00:01:00.000Z" }
          ]
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      )
    );

    const client = new GazelleApiClient({ baseUrl: "https://api.gazellecoffee.com/v1" });
    const orderId = "123e4567-e89b-12d3-a456-426614174113";
    const paidOrder = await client.payOrder(orderId, {
      paymentSourceToken: "clv_1TSTxxxxxxxxxxxxxxxxxFQif",
      idempotencyKey: "checkout-card-idempotency-key"
    });

    expect(paidOrder.status).toBe("PAID");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const request = fetchMock.mock.calls[0];
    expect(request).toBeDefined();
    if (request) {
      const body = JSON.parse(String(request[1]?.body ?? "{}")) as Record<string, unknown>;
      expect(body).toMatchObject({
        idempotencyKey: "checkout-card-idempotency-key",
        paymentSourceToken: "clv_1TSTxxxxxxxxxxxxxxxxxFQif"
      });
      expect(body.applePayToken).toBeUndefined();
      expect(body.applePayWallet).toBeUndefined();
    }
  });

  it("retries concurrent unauthorized requests behind a single refresh", async () => {
    const client = new GazelleApiClient({ baseUrl: "https://api.gazellecoffee.com/v1" });
    client.setAccessToken("access-old");
    const refreshHandler = vi.fn(async () => ({
      accessToken: "access-new",
      refreshToken: "refresh-new",
      expiresAt: "2030-01-01T00:30:00.000Z",
      userId: "123e4567-e89b-12d3-a456-426614174000"
    }));
    client.setSessionRefreshHandler(refreshHandler);

    fetchMock.mockImplementation(async (input, init) => {
      const url = typeof input === "string" ? input : input.toString();
      const authHeader = String((init?.headers as Record<string, string> | undefined)?.Authorization ?? "");

      if (url.endsWith("/auth/me")) {
        if (authHeader === "Bearer access-old") {
          return new Response(JSON.stringify({ code: "UNAUTHORIZED" }), { status: 401 });
        }

        return new Response(
          JSON.stringify({
            userId: "123e4567-e89b-12d3-a456-426614174000",
            email: "owner@gazellecoffee.com",
            profileCompleted: false,
            methods: ["apple"]
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        );
      }

      if (url.endsWith("/orders")) {
        if (authHeader === "Bearer access-old") {
          return new Response(JSON.stringify({ code: "UNAUTHORIZED" }), { status: 401 });
        }

        return new Response(
          JSON.stringify([
            {
              id: "123e4567-e89b-12d3-a456-426614174012",
              locationId: "flagship-01",
              status: "PAID",
              items: [{ itemId: "latte", quantity: 1, unitPriceCents: 675 }],
              total: { currency: "USD", amountCents: 716 },
              pickupCode: "A1B2C3",
              timeline: [
                { status: "PENDING_PAYMENT", occurredAt: "2026-03-10T00:00:00.000Z" },
                { status: "PAID", occurredAt: "2026-03-10T00:01:00.000Z" }
              ]
            }
          ]),
          { status: 200, headers: { "content-type": "application/json" } }
        );
      }

      return new Response("not-found", { status: 404 });
    });

    const [me, orders] = await Promise.all([client.me(), client.listOrders()]);

    expect(refreshHandler).toHaveBeenCalledTimes(1);
    expect(me.email).toBe("owner@gazellecoffee.com");
    expect(orders[0]?.status).toBe("PAID");
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });
});
