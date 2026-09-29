import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  GazelleApiClient,
  UNABLE_TO_REACH_BACKEND_MESSAGE,
  isBackendReachabilityError
} from "../src";

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

  it("includes the configured brand on customer order history, detail, and cancel requests", async () => {
    const order = {
      id: "123e4567-e89b-12d3-a456-426614174000",
      locationId: "flagship-01",
      status: "PAID",
      items: [],
      total: { currency: "USD", amountCents: 530 },
      pickupCode: "A1B2C3",
      timeline: [{ status: "PAID", occurredAt: "2026-09-28T12:00:00.000Z" }]
    };
    fetchMock
      .mockResolvedValueOnce(new Response(JSON.stringify([order]), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify(order), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify(order), { status: 200 }));
    const client = new GazelleApiClient({
      baseUrl: "https://api.gazellecoffee.com/v1",
      brandId: "brand-a"
    });

    await client.listOrders();
    await client.getOrder(order.id);
    await client.cancelOrder(order.id, { reason: "customer request" });

    expect(fetchMock.mock.calls.map(([input]) => String(input))).toEqual([
      "https://api.gazellecoffee.com/v1/orders?brandId=brand-a",
      `https://api.gazellecoffee.com/v1/orders/${order.id}?brandId=brand-a`,
      `https://api.gazellecoffee.com/v1/orders/${order.id}/cancel?brandId=brand-a`
    ]);
  });

  it("throws a stable reachability error when the api base url is missing", async () => {
    const client = new GazelleApiClient({ baseUrl: "", brandId: "gazelle" });

    await expect(client.forLocation("flagship-01").menu()).rejects.toMatchObject({
      message: UNABLE_TO_REACH_BACKEND_MESSAGE
    });
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
              stripe: {
                enabled: true,
                onboarded: true,
                dashboardEnabled: true
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
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            locationId: "flagship-01",
            cards: [
              {
                cardId: "morning-special",
                label: "TODAY",
                title: "Morning Special",
                body: "Fresh pastries are ready.",
                note: "Until 11 AM.",
                sortOrder: 0,
                visible: true
              }
            ]
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        )
      );

    const client = new GazelleApiClient({
      baseUrl: "https://api.gazellecoffee.com/v1",
      brandId: "gazelle"
    });
    const locationClient = client.forLocation("flagship-01");
    const menu = await locationClient.menu();
    const storeConfig = await locationClient.storeConfig();
    const appConfig = await locationClient.appConfig();
    const homeNewsCards = await locationClient.homeNewsCards();

    expect(menu.categories[0]?.items[0]?.name).toBe("Latte");
    expect(storeConfig.taxRateBasisPoints).toBe(600);
    expect(storeConfig.nextOpenAt).toBeNull();
    expect(storeConfig.isOpen).toBe(true);
    expect(appConfig.brand.brandName).toBe("Gazelle Coffee");
    expect(appConfig.fulfillment.mode).toBe("time_based");
    expect(homeNewsCards.cards[0]?.title).toBe("Morning Special");
    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      "https://api.gazellecoffee.com/v1/menu?brandId=gazelle&locationId=flagship-01",
      expect.objectContaining({ method: "GET" })
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "https://api.gazellecoffee.com/v1/store/config?brandId=gazelle&locationId=flagship-01",
      expect.objectContaining({ method: "GET" })
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      3,
      "https://api.gazellecoffee.com/v1/app-config?brandId=gazelle&locationId=flagship-01",
      expect.objectContaining({ method: "GET" })
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      4,
      "https://api.gazellecoffee.com/v1/store/cards?brandId=gazelle&locationId=flagship-01",
      expect.objectContaining({ method: "GET" })
    );
  });

  it("fetches the canonical branded bootstrap contract without a location parameter", async () => {
    const bootstrap = {
      schemaVersion: 1,
      status: "ready",
      brand: { brandId: "northside coffee", displayName: "Northside Coffee" },
      locations: [
        { locationId: "northside-01", displayName: "Flagship", marketLabel: "Detroit, MI", timezone: "America/Detroit" }
      ],
      primaryLocationId: "northside-01",
      orderingEnabled: true,
      compatibility: {}
    };
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify(bootstrap), { status: 200, headers: { "content-type": "application/json" } })
    );

    const client = new GazelleApiClient({ baseUrl: "https://api.nomly.us/v1" });
    await expect(client.mobileBrandBootstrap("northside coffee")).resolves.toEqual(bootstrap);
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.nomly.us/v1/mobile/bootstrap?brandId=northside%20coffee",
      expect.objectContaining({ method: "GET" })
    );
  });

  it("preserves typed unavailable bootstrap responses", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({
        schemaVersion: 1,
        status: "unavailable",
        brand: { brandId: "northside", displayName: "Northside Coffee" },
        locations: [],
        primaryLocationId: null,
        orderingEnabled: false,
        compatibility: {}
      }), { status: 200, headers: { "content-type": "application/json" } })
    );

    const result = await new GazelleApiClient({ baseUrl: "https://api.nomly.us/v1" }).mobileBrandBootstrap("northside");
    expect(result.status).toBe("unavailable");
    expect(result.primaryLocationId).toBeNull();
  });

  it("routes concurrent location-scoped requests independently with the public brand context", async () => {
    fetchMock.mockImplementation(async (input, init) => {
      const url = new URL(String(input));
      return new Response(JSON.stringify({
        locationId: url.searchParams.get("locationId"),
        currency: "USD",
        categories: []
      }), { status: 200, headers: { "content-type": "application/json" } });
    });

    const client = new GazelleApiClient({ baseUrl: "https://api.nomly.us/v1", brandId: "northside" });
    const signalA = new AbortController().signal;
    const signalB = new AbortController().signal;
    const [menuA, menuB] = await Promise.all([
      client.forLocation("northside-01").menu({ signal: signalA }),
      client.forLocation("northside-02").menu({ signal: signalB })
    ]);

    expect(menuA.locationId).toBe("northside-01");
    expect(menuB.locationId).toBe("northside-02");
    expect(fetchMock.mock.calls.map(([input]) => String(input))).toEqual([
      "https://api.nomly.us/v1/menu?brandId=northside&locationId=northside-01",
      "https://api.nomly.us/v1/menu?brandId=northside&locationId=northside-02"
    ]);
    expect(fetchMock.mock.calls.map(([, init]) => init?.signal)).toEqual([signalA, signalB]);
  });

  it("preserves abort errors so canceled location requests are not reported as backend outages", async () => {
    const abortError = new Error("The operation was aborted.");
    abortError.name = "AbortError";
    fetchMock.mockRejectedValueOnce(abortError);
    const client = new GazelleApiClient({ baseUrl: "https://api.nomly.us/v1", brandId: "northside" });

    const error = await client.forLocation("northside-01").menu({ signal: new AbortController().signal }).catch((reason) => reason);

    expect(error).toBe(abortError);
    expect(isBackendReachabilityError(error)).toBe(false);
  });

  it("requires a brand selector and fails closed for unknown or malformed bootstrap responses", async () => {
    const client = new GazelleApiClient({ baseUrl: "https://api.nomly.us/v1" });
    await expect(client.mobileBrandBootstrap("  ")).rejects.toThrow();
    expect(fetchMock).not.toHaveBeenCalled();

    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ code: "MOBILE_BRAND_NOT_FOUND" }), { status: 404 }));
    await expect(client.mobileBrandBootstrap("unknown")).rejects.toMatchObject({
      name: "MobileBrandBootstrapError",
      kind: "brand_not_found"
    });

    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ status: "ready" }), { status: 200 }));
    await expect(client.mobileBrandBootstrap("northside")).rejects.toMatchObject({
      name: "MobileBrandBootstrapError",
      kind: "invalid_response"
    });

    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({
      schemaVersion: 1,
      status: "ready",
      brand: { brandId: "other-brand", displayName: "Other Brand" },
      locations: [{ locationId: "other-01", displayName: "Flagship", marketLabel: "Detroit, MI", timezone: "America/Detroit" }],
      primaryLocationId: "other-01",
      orderingEnabled: true,
      compatibility: {}
    }), { status: 200 }));
    await expect(client.mobileBrandBootstrap("northside")).rejects.toMatchObject({
      name: "MobileBrandBootstrapError",
      kind: "invalid_response"
    });
  });

  it("uses existing reachability handling for network and server failures", async () => {
    const client = new GazelleApiClient({ baseUrl: "https://api.nomly.us/v1" });
    fetchMock.mockRejectedValueOnce(new TypeError("Network request failed"));
    const networkError = await client.mobileBrandBootstrap("northside").catch((error) => error);
    expect(networkError).toMatchObject({ message: UNABLE_TO_REACH_BACKEND_MESSAGE });
    expect(isBackendReachabilityError(networkError)).toBe(true);

    fetchMock.mockResolvedValueOnce(new Response("service unavailable", { status: 503 }));
    const serverError = await client.mobileBrandBootstrap("northside").catch((error) => error);
    expect(serverError).toMatchObject({ message: UNABLE_TO_REACH_BACKEND_MESSAGE });
    expect(isBackendReachabilityError(serverError)).toBe(true);
  });

  it("supports quote, create, and Stripe payment session flow", async () => {
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
            checkoutId: "123e4567-e89b-12d3-a456-426614174012",
            quoteId: "123e4567-e89b-12d3-a456-426614174011",
            quoteHash: "quote-hash",
            locationId: "flagship-01",
            status: "OPEN",
            items: [{ itemId: "latte", quantity: 1, unitPriceCents: 675 }],
            total: { currency: "USD", amountCents: 716 },
            expiresAt: "2030-03-10T00:30:00.000Z"
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        )
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            checkoutId: "123e4567-e89b-12d3-a456-426614174012",
            paymentIntentId: "pi_3QxExample123",
            paymentIntentClientSecret: "pi_3QxExample123_secret_abc",
            publishableKey: "pk_test_payments",
            stripeAccountId: "acct_123456789",
            merchantDisplayName: "Northside Coffee",
            merchantCountryCode: "US",
            amountCents: 716,
            currency: "USD",
            applePayEnabled: true,
            cardEnabled: true
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        )
      );

    const client = new GazelleApiClient({ baseUrl: "https://api.gazellecoffee.com/v1", brandId: "gazelle" });

    const quote = await client.quoteOrder({
      locationId: "flagship-01",
      items: [{ itemId: "latte", quantity: 1 }],
      pointsToRedeem: 0
    });
    const checkout = await client.createCheckoutDraft({ quoteId: quote.quoteId, quoteHash: quote.quoteHash });
    const paymentSession = await client.createStripeMobilePaymentSession({ checkoutId: checkout.checkoutId });

    expect(quote.quoteHash).toBe("quote-hash");
    expect(checkout.status).toBe("OPEN");
    expect(paymentSession.paymentIntentId).toBe("pi_3QxExample123");
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock.mock.calls.map(([input]) => String(input))).toEqual([
      "https://api.gazellecoffee.com/v1/orders/quote?brandId=gazelle",
      "https://api.gazellecoffee.com/v1/orders/checkouts?brandId=gazelle",
      "https://api.gazellecoffee.com/v1/payments/stripe/mobile-session?brandId=gazelle"
    ]);
  });

  it("surfaces a stable reachability error when fetch fails", async () => {
    fetchMock.mockRejectedValueOnce(new TypeError("Network request failed"));

    const client = new GazelleApiClient({ baseUrl: "https://api.gazellecoffee.com/v1", brandId: "gazelle" });
    const error = await client.forLocation("flagship-01").storeConfig().catch((rejection) => rejection);

    expect(error).toMatchObject({
      message: UNABLE_TO_REACH_BACKEND_MESSAGE
    });
    expect(isBackendReachabilityError(error)).toBe(true);
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

  it("retries concurrent unauthorized requests behind a single refresh", async () => {
    const client = new GazelleApiClient({ baseUrl: "https://api.gazellecoffee.com/v1", brandId: "gazelle" });
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

      if (url.endsWith("/orders?brandId=gazelle")) {
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
