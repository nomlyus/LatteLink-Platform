import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Stripe from "stripe";
import { buildApp } from "../src/app.js";
import { summarizeCloverResponseForLogs } from "../src/routes.js";

const internalPaymentsToken = "orders-internal-token";
const stripeWebhookSecret = "whsec_test_secret";
const stripe = new Stripe("sk_test_placeholder");

function internalHeaders(extraHeaders?: Record<string, string>) {
  return {
    "x-internal-token": internalPaymentsToken,
    ...extraHeaders
  };
}

function stripeWebhookHeaders(payload: string, extraHeaders?: Record<string, string>) {
  return {
    "content-type": "application/json",
    "stripe-signature": stripe.webhooks.generateTestHeaderString({
      payload,
      secret: stripeWebhookSecret
    }),
    ...extraHeaders
  };
}

async function connectCloverOauth(app: Awaited<ReturnType<typeof buildApp>>, merchantId = "merchant-oauth-1") {
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
    url: `/v1/payments/clover/oauth/callback?code=oauth-code-1&state=${encodeURIComponent(String(state))}&merchant_id=${merchantId}`
  });
  expect(callbackResponse.statusCode).toBe(200);
  return callbackResponse;
}

function stubLiveCloverOauthEnv() {
  vi.stubEnv("PAYMENTS_PROVIDER_MODE", "live");
  vi.stubEnv("CLOVER_APP_ID", "clover-app-id");
  vi.stubEnv("CLOVER_APP_SECRET", "clover-app-secret");
  vi.stubEnv("CLOVER_OAUTH_REDIRECT_URI", "https://example.test/v1/payments/clover/oauth/callback");
}

describe("payments service", () => {
  beforeEach(() => {
    vi.stubEnv("ORDERS_INTERNAL_API_TOKEN", internalPaymentsToken);
    vi.stubEnv("GATEWAY_INTERNAL_API_TOKEN", "gateway-payments-token");
    vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_payments");
    vi.stubEnv("STRIPE_PUBLISHABLE_KEY", "pk_test_payments");
    vi.stubEnv("STRIPE_CONNECT_WEBHOOK_SECRET", stripeWebhookSecret);
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
      stripe: {
        expectedMode: "test",
        secretKeyMode: "test",
        publishableKeyMode: "test",
        configured: true,
        connectWebhookConfigured: true
      }
    });
    await app.close();
  });

  it("fails fast in production when Stripe keys are still test mode", async () => {
    vi.stubEnv("DEPLOY_ENV", "production");

    await expect(buildApp()).rejects.toThrow("Production payments must use a live Stripe secret key");
  });

  it("accepts live Stripe keys for production readiness", async () => {
    vi.stubEnv("DEPLOY_ENV", "production");
    vi.stubEnv("STRIPE_SECRET_KEY", "sk_live_payments");
    vi.stubEnv("STRIPE_PUBLISHABLE_KEY", "pk_live_payments");

    const app = await buildApp();
    const ready = await app.inject({ method: "GET", url: "/ready" });

    expect(ready.statusCode).toBe(200);
    expect(ready.json()).toMatchObject({
      stripe: {
        expectedMode: "live",
        secretKeyMode: "live",
        publishableKeyMode: "live",
        configured: true
      }
    });
    await app.close();
  });

  it("rejects mixed Stripe key modes", async () => {
    vi.stubEnv("STRIPE_SECRET_KEY", "sk_live_payments");
    vi.stubEnv("STRIPE_PUBLISHABLE_KEY", "pk_test_payments");

    await expect(buildApp()).rejects.toThrow("Stripe secret and publishable keys must both use the same live/test mode.");
  });

  it("keeps readiness green when live Clover OAuth is not configured", async () => {
    vi.stubEnv("PAYMENTS_PROVIDER_MODE", "live");

    const app = await buildApp();
    const ready = await app.inject({ method: "GET", url: "/ready" });

    expect(ready.statusCode).toBe(200);
    expect(ready.json()).toMatchObject({
      status: "ready",
      service: "payments",
      persistence: expect.any(String)
    });
    await app.close();
  });

  it("creates a Stripe mobile payment session from trusted order and catalog context", async () => {
    const fetchMock = vi.fn<typeof fetch>();
    vi.stubGlobal("fetch", fetchMock);
    const orderId = "123e4567-e89b-12d3-a456-426614174777";
    const stripeCreateSpy = vi.spyOn(Object.getPrototypeOf(stripe.paymentIntents), "create").mockResolvedValue({
      id: "pi_3QxExample123",
      client_secret: "pi_3QxExample123_secret_abc"
    } as Stripe.PaymentIntent);

    fetchMock.mockImplementation(async (input, init) => {
      const url = typeof input === "string" ? input : input.toString();
      const headers = new Headers(init?.headers);

      if (url === `http://127.0.0.1:3001/v1/orders/internal/${orderId}/payment-context`) {
        expect(headers.get("x-internal-token")).toBe(internalPaymentsToken);
        expect(headers.get("x-user-id")).toBe("123e4567-e89b-12d3-a456-426614174000");
        return new Response(
          JSON.stringify({
            orderId,
            locationId: "flagship-01",
            status: "PENDING_PAYMENT",
            total: {
              currency: "USD",
              amountCents: 1295
            }
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        );
      }

      if (url === "http://127.0.0.1:3002/v1/catalog/internal/locations/flagship-01") {
        expect(headers.get("x-gateway-token")).toBe("gateway-payments-token");
        return new Response(
          JSON.stringify({
            brandId: "gazelle",
            brandName: "Gazelle Coffee",
            locationId: "flagship-01",
            locationName: "Flagship",
            marketLabel: "Detroit, MI",
            storeName: "Gazelle Flagship",
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
            },
            paymentProfile: {
              locationId: "flagship-01",
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

      throw new Error(`unexpected Stripe mobile session URL: ${url}`);
    });

    const app = await buildApp();
    const response = await app.inject({
      method: "POST",
      url: "/v1/payments/stripe/mobile-session",
      headers: {
        "x-gateway-token": "gateway-payments-token",
        "x-user-id": "123e4567-e89b-12d3-a456-426614174000"
      },
      payload: {
        orderId
      }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      orderId,
      paymentIntentId: "pi_3QxExample123",
      paymentIntentClientSecret: "pi_3QxExample123_secret_abc",
      publishableKey: "pk_test_payments",
      stripeAccountId: "acct_123456789",
      merchantDisplayName: "Gazelle Flagship",
      merchantCountryCode: "US",
      amountCents: 1295,
      currency: "USD",
      applePayEnabled: true,
      cardEnabled: true
    });

    expect(stripeCreateSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        amount: 1295,
        currency: "usd",
        metadata: expect.objectContaining({
          orderId,
          locationId: "flagship-01",
          userId: "123e4567-e89b-12d3-a456-426614174000"
        })
      }),
      expect.objectContaining({
        stripeAccount: "acct_123456789",
        idempotencyKey: `stripe-mobile-session:${orderId}`
      })
    );

    stripeCreateSpy.mockRestore();
    await app.close();
  });

  it("finalizes a Stripe mobile payment by verifying the PaymentIntent before reconciling the order", async () => {
    const fetchMock = vi.fn<typeof fetch>();
    vi.stubGlobal("fetch", fetchMock);
    const orderId = "123e4567-e89b-12d3-a456-426614174402";
    const stripeRetrieveSpy = vi.spyOn(Object.getPrototypeOf(stripe.paymentIntents), "retrieve").mockResolvedValue({
      id: "pi_finalize_123",
      object: "payment_intent",
      amount: 1295,
      amount_received: 1295,
      currency: "usd",
      metadata: {
        orderId
      },
      status: "succeeded"
    } as unknown as Stripe.PaymentIntent);

    fetchMock.mockImplementation(async (input, init) => {
      const url = typeof input === "string" ? input : input.toString();
      const headers = new Headers(init?.headers);

      if (url === `http://127.0.0.1:3001/v1/orders/internal/${orderId}/payment-context`) {
        expect(headers.get("x-internal-token")).toBe(internalPaymentsToken);
        expect(headers.get("x-user-id")).toBe("123e4567-e89b-12d3-a456-426614174000");
        return new Response(
          JSON.stringify({
            orderId,
            locationId: "flagship-01",
            status: "PENDING_PAYMENT",
            total: {
              currency: "USD",
              amountCents: 1295
            }
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        );
      }

      if (url === "http://127.0.0.1:3002/v1/catalog/internal/locations/flagship-01") {
        expect(headers.get("x-gateway-token")).toBe("gateway-payments-token");
        return new Response(
          JSON.stringify({
            brandId: "gazelle",
            brandName: "Gazelle Coffee",
            locationId: "flagship-01",
            locationName: "Flagship",
            marketLabel: "Detroit, MI",
            storeName: "Gazelle Flagship",
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
            },
            paymentProfile: {
              locationId: "flagship-01",
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

      if (url === "http://127.0.0.1:3001/v1/orders/internal/payments/reconcile") {
        expect(headers.get("x-internal-token")).toBe(internalPaymentsToken);
        expect(JSON.parse(String(init?.body ?? "{}"))).toMatchObject({
          provider: "STRIPE",
          kind: "CHARGE",
          orderId,
          paymentId: "pi_finalize_123",
          status: "SUCCEEDED",
          amountCents: 1295,
          currency: "USD"
        });
        return new Response(
          JSON.stringify({
            accepted: true,
            applied: true,
            orderStatus: "PAID"
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        );
      }

      throw new Error(`unexpected Stripe mobile finalize URL: ${url}`);
    });

    const app = await buildApp();
    const response = await app.inject({
      method: "POST",
      url: "/v1/payments/stripe/mobile-session/finalize",
      headers: {
        "x-gateway-token": "gateway-payments-token",
        "x-user-id": "123e4567-e89b-12d3-a456-426614174000"
      },
      payload: {
        orderId,
        paymentIntentId: "pi_finalize_123"
      }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      orderId,
      paymentIntentId: "pi_finalize_123",
      accepted: true,
      applied: true,
      orderStatus: "PAID"
    });
    expect(stripeRetrieveSpy).toHaveBeenCalledWith(
      "pi_finalize_123",
      {},
      {
        stripeAccount: "acct_123456789"
      }
    );

    stripeRetrieveSpy.mockRestore();
    await app.close();
  });

  it("creates and persists a Stripe Connect account before returning an onboarding link", async () => {
    const fetchMock = vi.fn<typeof fetch>();
    vi.stubGlobal("fetch", fetchMock);
    const stripeAccountCreateSpy = vi.spyOn(Object.getPrototypeOf(stripe.accounts), "create").mockResolvedValue({
      id: "acct_1TOk7VE0L5J7W3jY",
      type: "express",
      details_submitted: false,
      charges_enabled: false,
      payouts_enabled: false,
      country: "US",
      default_currency: "usd",
      requirements: {
        currently_due: ["business_profile.mcc"],
        eventually_due: [],
        past_due: [],
        pending_verification: []
      }
    } as unknown as Stripe.Account);
    const accountLinkCreateSpy = vi.spyOn(Object.getPrototypeOf(stripe.accountLinks), "create").mockResolvedValue({
      object: "account_link",
      created: 1776829800,
      expires_at: 1776830400,
      url: "https://connect.stripe.com/setup/s/test_123"
    } as Stripe.AccountLink);

    fetchMock.mockImplementation(async (input, init) => {
      const url = typeof input === "string" ? input : input.toString();
      const headers = new Headers(init?.headers);

      if (url === "http://127.0.0.1:3002/v1/catalog/internal/locations/flagship-01") {
        expect(headers.get("x-gateway-token")).toBe("gateway-payments-token");
        return new Response(
          JSON.stringify({
            brandId: "gazelle",
            brandName: "Gazelle Coffee",
            locationId: "flagship-01",
            locationName: "Flagship",
            marketLabel: "Detroit, MI",
            storeName: "Gazelle Flagship",
            hours: "Daily · 7:00 AM - 6:00 PM",
            pickupInstructions: "Pickup at the espresso counter.",
            taxRateBasisPoints: 600,
            capabilities: {
              menu: { source: "platform_managed" },
              operations: {
                fulfillmentMode: "staff",
                liveOrderTrackingEnabled: true,
                dashboardEnabled: true
              },
              loyalty: { visible: true }
            }
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        );
      }

      if (url === "http://127.0.0.1:3002/v1/catalog/internal/locations/flagship-01/payment-profile") {
        expect(headers.get("x-gateway-token")).toBe("gateway-payments-token");
        const body = JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>;
        expect(body).toMatchObject({
          locationId: "flagship-01",
          stripeAccountId: "acct_1TOk7VE0L5J7W3jY",
          stripeOnboardingStatus: "pending",
          stripeDetailsSubmitted: false,
          stripeChargesEnabled: false,
          stripePayoutsEnabled: false,
          stripeDashboardEnabled: true
        });
        return new Response(JSON.stringify(body), {
          status: 200,
          headers: { "content-type": "application/json" }
        });
      }

      throw new Error(`unexpected Stripe onboarding URL: ${url}`);
    });

    const app = await buildApp();
    const response = await app.inject({
      method: "POST",
      url: "/v1/payments/stripe/connect/onboarding-link",
      headers: {
        "x-gateway-token": "gateway-payments-token"
      },
      payload: {
        locationId: "flagship-01",
        returnUrl: "https://admin.example.com/clients/flagship-01/payments",
        refreshUrl: "https://admin.example.com/clients/flagship-01/payments?refresh=1"
      }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      locationId: "flagship-01",
      stripeAccountId: "acct_1TOk7VE0L5J7W3jY",
      url: "https://connect.stripe.com/setup/s/test_123",
      paymentReadiness: {
        ready: false,
        onboardingState: "pending",
        missingRequiredFields: ["stripeChargesEnabled", "stripePayoutsEnabled"]
      }
    });

    expect(stripeAccountCreateSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "express",
        country: "US",
        metadata: {
          locationId: "flagship-01"
        }
      })
    );
    expect(accountLinkCreateSpy).toHaveBeenCalledWith({
      account: "acct_1TOk7VE0L5J7W3jY",
      type: "account_onboarding",
      return_url: "https://admin.example.com/clients/flagship-01/payments",
      refresh_url: "https://admin.example.com/clients/flagship-01/payments?refresh=1"
    });

    stripeAccountCreateSpy.mockRestore();
    accountLinkCreateSpy.mockRestore();
    await app.close();
  });

  it("replaces a stored Stripe account that is missing from the active Stripe mode", async () => {
    const fetchMock = vi.fn<typeof fetch>();
    vi.stubGlobal("fetch", fetchMock);
    const stripeAccountRetrieveSpy = vi.spyOn(Object.getPrototypeOf(stripe.accounts), "retrieve").mockRejectedValue({
      type: "StripeInvalidRequestError",
      code: "resource_missing",
      statusCode: 404,
      message: "No such account: acct_testonly"
    });
    const stripeAccountCreateSpy = vi.spyOn(Object.getPrototypeOf(stripe.accounts), "create").mockResolvedValue({
      id: "acct_livereplacement",
      type: "express",
      details_submitted: false,
      charges_enabled: false,
      payouts_enabled: false,
      country: "US",
      default_currency: "usd",
      requirements: {
        currently_due: ["business_profile.mcc"],
        eventually_due: [],
        past_due: [],
        pending_verification: []
      }
    } as unknown as Stripe.Account);
    const accountLinkCreateSpy = vi.spyOn(Object.getPrototypeOf(stripe.accountLinks), "create").mockResolvedValue({
      object: "account_link",
      created: 1776829800,
      expires_at: 1776830400,
      url: "https://connect.stripe.com/setup/s/live_123"
    } as Stripe.AccountLink);

    fetchMock.mockImplementation(async (input, init) => {
      const url = typeof input === "string" ? input : input.toString();
      const headers = new Headers(init?.headers);

      if (url === "http://127.0.0.1:3002/v1/catalog/internal/locations/flagship-01") {
        expect(headers.get("x-gateway-token")).toBe("gateway-payments-token");
        return new Response(
          JSON.stringify({
            brandId: "gazelle",
            brandName: "Gazelle Coffee",
            locationId: "flagship-01",
            locationName: "Flagship",
            marketLabel: "Detroit, MI",
            storeName: "Gazelle Flagship",
            hours: "Daily · 7:00 AM - 6:00 PM",
            pickupInstructions: "Pickup at the espresso counter.",
            taxRateBasisPoints: 600,
            capabilities: {
              menu: { source: "platform_managed" },
              operations: {
                fulfillmentMode: "staff",
                liveOrderTrackingEnabled: true,
                dashboardEnabled: true
              },
              loyalty: { visible: true }
            },
            paymentProfile: {
              locationId: "flagship-01",
              stripeAccountId: "acct_testonly",
              stripeAccountType: "express",
              stripeOnboardingStatus: "restricted",
              stripeDetailsSubmitted: false,
              stripeChargesEnabled: false,
              stripePayoutsEnabled: false,
              stripeDashboardEnabled: true,
              country: "US",
              currency: "USD",
              cardEnabled: true,
              applePayEnabled: true,
              refundsEnabled: true,
              cloverPosEnabled: false
            }
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        );
      }

      if (url === "http://127.0.0.1:3002/v1/catalog/internal/locations/flagship-01/payment-profile") {
        expect(headers.get("x-gateway-token")).toBe("gateway-payments-token");
        const body = JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>;
        expect(body).toMatchObject({
          locationId: "flagship-01",
          stripeAccountId: "acct_livereplacement",
          stripeOnboardingStatus: "pending",
          stripeChargesEnabled: false,
          stripePayoutsEnabled: false
        });
        return new Response(JSON.stringify(body), {
          status: 200,
          headers: { "content-type": "application/json" }
        });
      }

      throw new Error(`unexpected Stripe replacement onboarding URL: ${url}`);
    });

    const app = await buildApp();
    const response = await app.inject({
      method: "POST",
      url: "/v1/payments/stripe/connect/onboarding-link",
      headers: {
        "x-gateway-token": "gateway-payments-token"
      },
      payload: {
        locationId: "flagship-01",
        returnUrl: "https://admin.example.com/clients/flagship-01/payments",
        refreshUrl: "https://admin.example.com/clients/flagship-01/payments?refresh=1"
      }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      locationId: "flagship-01",
      stripeAccountId: "acct_livereplacement",
      url: "https://connect.stripe.com/setup/s/live_123"
    });
    expect(stripeAccountRetrieveSpy).toHaveBeenCalledWith("acct_testonly");
    expect(stripeAccountCreateSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "express",
        country: "US",
        metadata: {
          locationId: "flagship-01"
        }
      })
    );
    expect(accountLinkCreateSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        account: "acct_livereplacement"
      })
    );

    stripeAccountRetrieveSpy.mockRestore();
    stripeAccountCreateSpy.mockRestore();
    accountLinkCreateSpy.mockRestore();
    await app.close();
  });

  it("returns a Stripe Express dashboard link for an existing connected account", async () => {
    const fetchMock = vi.fn<typeof fetch>();
    vi.stubGlobal("fetch", fetchMock);
    const stripeAccountRetrieveSpy = vi.spyOn(Object.getPrototypeOf(stripe.accounts), "retrieve").mockResolvedValue({
      id: "acct_1TOk7VE0L5J7W3jY",
      type: "express",
      details_submitted: true,
      charges_enabled: true,
      payouts_enabled: true,
      country: "US",
      default_currency: "usd",
      requirements: {
        currently_due: [],
        eventually_due: [],
        past_due: [],
        pending_verification: []
      }
    } as unknown as Stripe.Account);
    const createLoginLinkSpy = vi.spyOn(Object.getPrototypeOf(stripe.accounts), "createLoginLink").mockResolvedValue({
      object: "login_link",
      created: 1776829900,
      url: "https://connect.stripe.com/express/test_dashboard"
    } as unknown as Stripe.LoginLink);

    fetchMock.mockImplementation(async (input, init) => {
      const url = typeof input === "string" ? input : input.toString();
      const headers = new Headers(init?.headers);

      if (url === "http://127.0.0.1:3002/v1/catalog/internal/locations/flagship-01") {
        expect(headers.get("x-gateway-token")).toBe("gateway-payments-token");
        return new Response(
          JSON.stringify({
            brandId: "gazelle",
            brandName: "Gazelle Coffee",
            locationId: "flagship-01",
            locationName: "Flagship",
            marketLabel: "Detroit, MI",
            storeName: "Gazelle Flagship",
            hours: "Daily · 7:00 AM - 6:00 PM",
            pickupInstructions: "Pickup at the espresso counter.",
            taxRateBasisPoints: 600,
            capabilities: {
              menu: { source: "platform_managed" },
              operations: {
                fulfillmentMode: "staff",
                liveOrderTrackingEnabled: true,
                dashboardEnabled: true
              },
              loyalty: { visible: true }
            },
            paymentProfile: {
              locationId: "flagship-01",
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

      if (url === "http://127.0.0.1:3002/v1/catalog/internal/locations/flagship-01/payment-profile") {
        expect(headers.get("x-gateway-token")).toBe("gateway-payments-token");
        const body = JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>;
        expect(body).toMatchObject({
          locationId: "flagship-01",
          stripeAccountId: "acct_1TOk7VE0L5J7W3jY",
          stripeOnboardingStatus: "completed",
          stripeChargesEnabled: true,
          stripePayoutsEnabled: true
        });
        return new Response(JSON.stringify(body), {
          status: 200,
          headers: { "content-type": "application/json" }
        });
      }

      throw new Error(`unexpected Stripe dashboard URL: ${url}`);
    });

    const app = await buildApp();
    const response = await app.inject({
      method: "POST",
      url: "/v1/payments/stripe/connect/dashboard-link",
      headers: {
        "x-gateway-token": "gateway-payments-token"
      },
      payload: {
        locationId: "flagship-01"
      }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      locationId: "flagship-01",
      stripeAccountId: "acct_1TOk7VE0L5J7W3jY",
      url: "https://connect.stripe.com/express/test_dashboard",
      paymentReadiness: {
        ready: true,
        onboardingState: "completed",
        missingRequiredFields: []
      }
    });

    expect(stripeAccountRetrieveSpy).toHaveBeenCalledWith("acct_1TOk7VE0L5J7W3jY");
    expect(createLoginLinkSpy).toHaveBeenCalledWith("acct_1TOk7VE0L5J7W3jY");

    stripeAccountRetrieveSpy.mockRestore();
    createLoginLinkSpy.mockRestore();
    await app.close();
  });

  it("reports ready when live Clover has a stored OAuth connection", async () => {
    vi.stubEnv("PAYMENTS_PROVIDER_MODE", "live");
    vi.stubEnv("CLOVER_APP_ID", "clover-app-id");
    vi.stubEnv("CLOVER_APP_SECRET", "clover-app-secret");
    vi.stubEnv("CLOVER_OAUTH_REDIRECT_URI", "https://example.test/v1/payments/clover/oauth/callback");

    const fetchMock = vi.fn<typeof fetch>();
    vi.stubGlobal("fetch", fetchMock);
    fetchMock.mockImplementation(async (input, init) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url === "https://apisandbox.dev.clover.com/oauth/v2/token") {
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
        return new Response(
          JSON.stringify({
            apiAccessKey: "oauth-api-access-key-1"
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        );
      }

      throw new Error(`unexpected Clover URL: ${url}`);
    });

    const app = await buildApp();
    await connectCloverOauth(app, "merchant-ready-1");
    const ready = await app.inject({ method: "GET", url: "/ready" });

    expect(ready.statusCode).toBe(200);
    expect(ready.json()).toMatchObject({
      status: "ready",
      service: "payments",
      persistence: expect.any(String)
    });
    await app.close();
  });

  it("rejects Stripe webhooks when the Stripe webhook secret is not configured", async () => {
    vi.stubEnv("STRIPE_CONNECT_WEBHOOK_SECRET", "");
    const app = await buildApp();
    const payload = JSON.stringify({
      id: "evt_test_missing_secret",
      object: "event",
      type: "payment_intent.succeeded",
      account: "acct_123456789",
      livemode: false,
      data: {
        object: {
          id: "pi_test_123"
        }
      }
    });

    const response = await app.inject({
      method: "POST",
      url: "/v1/payments/webhooks/stripe",
      headers: stripeWebhookHeaders(payload),
      payload
    });

    expect(response.statusCode).toBe(503);
    expect(response.json()).toMatchObject({
      code: "STRIPE_WEBHOOK_NOT_CONFIGURED"
    });
    await app.close();
  });

  it("rejects Stripe webhooks with invalid signatures", async () => {
    const app = await buildApp();
    const payload = JSON.stringify({
      id: "evt_test_invalid_signature",
      object: "event",
      type: "payment_intent.succeeded",
      account: "acct_123456789",
      livemode: false,
      data: {
        object: {
          id: "pi_test_invalid"
        }
      }
    });

    const response = await app.inject({
      method: "POST",
      url: "/v1/payments/webhooks/stripe",
      headers: {
        "content-type": "application/json",
        "stripe-signature": "t=1,v1=bad"
      },
      payload
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({
      code: "INVALID_STRIPE_SIGNATURE"
    });
    await app.close();
  });

  it("reconciles a signed Stripe payment webhook and deduplicates repeated deliveries", async () => {
    const fetchMock = vi.fn<typeof fetch>();
    vi.stubGlobal("fetch", fetchMock);
    const orderId = "123e4567-e89b-12d3-a456-426614174401";
    fetchMock.mockImplementation(async (input, init) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url === "http://127.0.0.1:3001/v1/orders/internal/payments/reconcile") {
        const headers = new Headers(init?.headers);
        expect(headers.get("x-internal-token")).toBe(internalPaymentsToken);
        expect(JSON.parse(String(init?.body ?? "{}"))).toMatchObject({
          eventId: "evt_test_valid_signature",
          provider: "STRIPE",
          kind: "CHARGE",
          orderId,
          paymentId: "pi_test_valid",
          status: "SUCCEEDED",
          amountCents: 975,
          currency: "USD"
        });
        return new Response(
          JSON.stringify({
            accepted: true,
            applied: true,
            orderStatus: "PAID"
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        );
      }

      throw new Error(`unexpected Stripe webhook dispatch URL: ${url}`);
    });

    const app = await buildApp();
    const payload = JSON.stringify({
      id: "evt_test_valid_signature",
      object: "event",
      type: "payment_intent.succeeded",
      account: "acct_123456789",
      created: 1776829450,
      livemode: false,
      data: {
        object: {
          id: "pi_test_valid",
          amount: 975,
          amount_received: 975,
          currency: "usd",
          metadata: {
            orderId
          }
        }
      }
    });

    const first = await app.inject({
      method: "POST",
      url: "/v1/payments/webhooks/stripe",
      headers: stripeWebhookHeaders(payload),
      payload
    });

    expect(first.statusCode).toBe(200);
    expect(first.json()).toMatchObject({
      accepted: true,
      provider: "STRIPE",
      eventId: "evt_test_valid_signature",
      eventType: "payment_intent.succeeded",
      duplicate: false,
      account: "acct_123456789"
    });

    const second = await app.inject({
      method: "POST",
      url: "/v1/payments/webhooks/stripe",
      headers: stripeWebhookHeaders(payload),
      payload
    });

    expect(second.statusCode).toBe(200);
    expect(second.json()).toMatchObject({
      accepted: true,
      provider: "STRIPE",
      eventId: "evt_test_valid_signature",
      duplicate: true
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await app.close();
  });

  it("retries Stripe webhook reconciliation after a transient downstream failure", async () => {
    const fetchMock = vi.fn<typeof fetch>();
    vi.stubGlobal("fetch", fetchMock);
    const orderId = "123e4567-e89b-12d3-a456-426614174402";
    let reconcileAttempts = 0;
    fetchMock.mockImplementation(async (input) => {
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

        return new Response(
          JSON.stringify({
            accepted: true,
            applied: false,
            orderStatus: "PENDING_PAYMENT"
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        );
      }

      throw new Error(`unexpected Stripe webhook dispatch URL: ${url}`);
    });

    const app = await buildApp();
    const payload = JSON.stringify({
      id: "evt_test_retry_signature",
      object: "event",
      type: "payment_intent.payment_failed",
      account: "acct_123456789",
      created: 1776829510,
      livemode: false,
      data: {
        object: {
          id: "pi_test_retry",
          amount: 825,
          currency: "usd",
          metadata: {
            orderId
          },
          last_payment_error: {
            code: "card_declined",
            decline_code: "insufficient_funds",
            message: "Card was declined"
          }
        }
      }
    });

    const first = await app.inject({
      method: "POST",
      url: "/v1/payments/webhooks/stripe",
      headers: stripeWebhookHeaders(payload),
      payload
    });
    const second = await app.inject({
      method: "POST",
      url: "/v1/payments/webhooks/stripe",
      headers: stripeWebhookHeaders(payload),
      payload
    });

    expect(first.statusCode).toBe(502);
    expect(first.json()).toMatchObject({ code: "ORDERS_RECONCILIATION_FAILED" });
    expect(second.statusCode).toBe(200);
    expect(second.json()).toMatchObject({
      accepted: true,
      provider: "STRIPE",
      eventId: "evt_test_retry_signature",
      duplicate: false
    });
    expect(reconcileAttempts).toBe(2);
    await app.close();
  });

  it("reconciles a signed Stripe refund webhook", async () => {
    const fetchMock = vi.fn<typeof fetch>();
    vi.stubGlobal("fetch", fetchMock);
    const orderId = "123e4567-e89b-12d3-a456-426614174403";
    fetchMock.mockImplementation(async (input, init) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url === "http://127.0.0.1:3001/v1/orders/internal/payments/reconcile") {
        expect(JSON.parse(String(init?.body ?? "{}"))).toMatchObject({
          eventId: "evt_test_refund_signature",
          provider: "STRIPE",
          kind: "REFUND",
          orderId,
          paymentId: "pi_test_refund",
          refundId: "re_test_refund",
          status: "REFUNDED",
          amountCents: 650,
          currency: "USD"
        });
        return new Response(
          JSON.stringify({
            accepted: true,
            applied: true,
            orderStatus: "CANCELED"
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        );
      }

      throw new Error(`unexpected Stripe refund dispatch URL: ${url}`);
    });

    const app = await buildApp();
    const payload = JSON.stringify({
      id: "evt_test_refund_signature",
      object: "event",
      type: "charge.refunded",
      account: "acct_123456789",
      created: 1776829570,
      livemode: false,
      data: {
        object: {
          id: "ch_test_refund",
          payment_intent: "pi_test_refund",
          amount: 650,
          amount_refunded: 650,
          currency: "usd",
          metadata: {
            orderId
          },
          refunds: {
            data: [
              {
                id: "re_test_refund"
              }
            ]
          }
        }
      }
    });

    const response = await app.inject({
      method: "POST",
      url: "/v1/payments/webhooks/stripe",
      headers: stripeWebhookHeaders(payload),
      payload
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      accepted: true,
      provider: "STRIPE",
      eventId: "evt_test_refund_signature",
      duplicate: false
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
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
    vi.stubEnv("PAYMENTS_PROVIDER_MODE", "live");
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

  it("rejects refund requests when the internal token is missing", async () => {
    const app = await buildApp();
    const response = await app.inject({
      method: "POST",
      url: "/v1/payments/refunds",
      payload: {
        orderId: "123e4567-e89b-12d3-a456-426614174019",
        paymentId: "pi_missing_internal_token",
        amountCents: 825,
        currency: "USD",
        reason: "customer cancellation",
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
      url: "/v1/payments/refunds",
      headers: internalHeaders(),
      payload: {
        orderId: "123e4567-e89b-12d3-a456-426614174018",
        paymentId: "pi_missing_internal_config",
        amountCents: 825,
        currency: "USD",
        reason: "customer cancellation",
        idempotencyKey: "missing-internal-config"
      }
    });

    expect(response.statusCode).toBe(503);
    expect(response.json()).toMatchObject({ code: "INTERNAL_ACCESS_NOT_CONFIGURED" });
    await app.close();
  });

  it("treats refund requests as idempotent", async () => {
    const app = await buildApp();
    const orderId = "123e4567-e89b-12d3-a456-426614174023";

    const firstRefund = await app.inject({
      method: "POST",
      url: "/v1/payments/refunds",
      headers: internalHeaders(),
      payload: {
        orderId,
        paymentId: "pi_refund_idempotent",
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
        paymentId: "pi_refund_idempotent",
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

    const refund = await app.inject({
      method: "POST",
      url: "/v1/payments/refunds",
      headers: internalHeaders(),
      payload: {
        orderId,
        paymentId: "pi_refund_reject",
        amountCents: 700,
        currency: "USD",
        reason: "reject this refund",
        idempotencyKey: "refund-reject"
      }
    });

    expect(refund.statusCode).toBe(200);
    expect(refund.json()).toMatchObject({ status: "REJECTED", provider: "STRIPE" });
    await app.close();
  });

  it("requires locationId on live refund requests", async () => {
    stubLiveCloverOauthEnv();

    const app = await buildApp();

    const refund = await app.inject({
      method: "POST",
      url: "/v1/payments/refunds",
      headers: internalHeaders(),
      payload: {
        orderId: "123e4567-e89b-12d3-a456-426614174028",
        paymentId: "pi_provider_payment_id",
        amountCents: 1295,
        currency: "USD",
        reason: "store canceled order",
        idempotencyKey: "refund-provider-payment-id"
      }
    });

    expect(refund.statusCode).toBe(409);
    expect(refund.json()).toMatchObject({ code: "LOCATION_REQUIRED" });
    await app.close();
  });

  it("rejects refund idempotency key reuse when the payload changes", async () => {
    const app = await buildApp();
    const orderId = "123e4567-e89b-12d3-a456-426614174099";

    const firstRefund = await app.inject({
      method: "POST",
      url: "/v1/payments/refunds",
      headers: internalHeaders(),
      payload: {
        orderId,
        paymentId: "pi_refund_key_reuse",
        amountCents: 800,
        currency: "USD",
        reason: "customer cancellation",
        idempotencyKey: "refund-key-reuse"
      }
    });
    expect(firstRefund.statusCode).toBe(200);

    const conflictingRefund = await app.inject({
      method: "POST",
      url: "/v1/payments/refunds",
      headers: internalHeaders(),
      payload: {
        orderId,
        paymentId: "pi_refund_key_reuse",
        amountCents: 825,
        currency: "USD",
        reason: "customer cancellation",
        idempotencyKey: "refund-key-reuse"
      }
    });

    expect(conflictingRefund.statusCode).toBe(409);
    expect(conflictingRefund.json()).toMatchObject({
      code: "IDEMPOTENCY_KEY_REUSE"
    });
    await app.close();
  });

  it("propagates x-request-id and exposes metrics counters", async () => {
    const app = await buildApp();
    const requestId = "payments-trace-1";

    const refund = await app.inject({
      method: "POST",
      url: "/v1/payments/refunds",
      headers: internalHeaders({
        "x-request-id": requestId
      }),
      payload: {
        orderId: "123e4567-e89b-12d3-a456-426614174025",
        paymentId: "pi_trace_refund",
        amountCents: 500,
        currency: "USD",
        reason: "unknown payment",
        idempotencyKey: "trace-refund"
      }
    });

    expect(refund.statusCode).toBe(200);
    expect(refund.headers["x-request-id"]).toBe(requestId);

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
    expect(metricsResponse.json().requests.status2xx).toBeGreaterThanOrEqual(1);

    await app.close();
  });

  it("supports live Stripe refunds via a configured location payment profile", async () => {
    vi.stubEnv("PAYMENTS_PROVIDER_MODE", "live");

    const fetchMock = vi.fn<typeof fetch>();
    vi.stubGlobal("fetch", fetchMock);
    const stripeRefundCreateSpy = vi.spyOn(Object.getPrototypeOf(stripe.refunds), "create").mockResolvedValue({
      id: "re_live_refund_1"
    } as Stripe.Refund);
    fetchMock.mockImplementation(async (input, init) => {
      const url = typeof input === "string" ? input : input.toString();
      const headers = new Headers(init?.headers);

      if (url === "http://127.0.0.1:3002/v1/catalog/internal/locations/flagship-01") {
        expect(headers.get("x-gateway-token")).toBe("gateway-payments-token");
        return new Response(
          JSON.stringify({
            brandId: "gazelle",
            brandName: "Gazelle Coffee",
            locationId: "flagship-01",
            locationName: "Flagship",
            marketLabel: "Detroit, MI",
            storeName: "Gazelle Flagship",
            hours: "Daily · 7:00 AM - 6:00 PM",
            pickupInstructions: "Pickup at the espresso counter.",
            taxRateBasisPoints: 600,
            capabilities: {
              menu: { source: "platform_managed" },
              operations: {
                fulfillmentMode: "staff",
                liveOrderTrackingEnabled: true,
                dashboardEnabled: true
              },
              loyalty: { visible: true }
            },
            paymentProfile: {
              locationId: "flagship-01",
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

      throw new Error(`unexpected Stripe refund URL: ${url}`);
    });

    const app = await buildApp();
    const response = await app.inject({
      method: "POST",
      url: "/v1/payments/refunds",
      headers: internalHeaders(),
      payload: {
        orderId: "123e4567-e89b-12d3-a456-426614174030",
        paymentId: "pi_live_refund_1",
        amountCents: 650,
        currency: "USD",
        reason: "store canceled order",
        idempotencyKey: "live-refund-1",
        locationId: "flagship-01"
      }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      provider: "STRIPE",
      status: "REFUNDED",
      orderId: "123e4567-e89b-12d3-a456-426614174030",
      paymentId: "pi_live_refund_1"
    });
    expect(stripeRefundCreateSpy).toHaveBeenCalledWith(
      {
        payment_intent: "pi_live_refund_1",
        amount: 650
      },
      {
        stripeAccount: "acct_123456789",
        idempotencyKey: "live-refund-1"
      }
    );

    stripeRefundCreateSpy.mockRestore();
    await app.close();
  });

  it("rate limits write endpoints when configured threshold is reached", async () => {
    vi.stubEnv("PAYMENTS_RATE_LIMIT_WRITE_MAX", "1");
    vi.stubEnv("PAYMENTS_RATE_LIMIT_WINDOW_MS", "60000");

    const app = await buildApp();
    try {
      const firstRefund = await app.inject({
        method: "POST",
        url: "/v1/payments/refunds",
        headers: internalHeaders(),
        payload: {
          orderId: "123e4567-e89b-12d3-a456-426614174099",
          paymentId: "pi_rate_limit_refund_1",
          amountCents: 825,
          currency: "USD",
          reason: "customer cancellation",
          idempotencyKey: "rate-limit-refund-1"
        }
      });
      expect(firstRefund.statusCode).toBe(200);

      const secondRefund = await app.inject({
        method: "POST",
        url: "/v1/payments/refunds",
        headers: internalHeaders(),
        payload: {
          orderId: "123e4567-e89b-12d3-a456-426614174098",
          paymentId: "pi_rate_limit_refund_2",
          amountCents: 825,
          currency: "USD",
          reason: "customer cancellation",
          idempotencyKey: "rate-limit-refund-2"
        }
      });
      expect(secondRefund.statusCode).toBe(429);
      expect(secondRefund.json()).toMatchObject({ statusCode: 429 });
    } finally {
      await app.close();
      vi.unstubAllEnvs();
    }
  });

  it("accepts live order submission when Clover print_event fails after order creation", async () => {
    stubLiveCloverOauthEnv();

    const fetchMock = vi.fn<typeof fetch>();
    vi.stubGlobal("fetch", fetchMock);
    let createOrderBody: Record<string, unknown> | null = null;
    const lineItemBodies: Array<Record<string, unknown>> = [];
    fetchMock.mockImplementation(async (input, init) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url === "https://apisandbox.dev.clover.com/oauth/v2/token") {
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
        return new Response(
          JSON.stringify({
            apiAccessKey: "oauth-api-access-key-1"
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        );
      }

      if (url === "https://apisandbox.dev.clover.com/v3/merchants/merchant-sbx/orders") {
        createOrderBody = JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>;
        return new Response(JSON.stringify({ id: "clover-order-1" }), {
          status: 200,
          headers: { "content-type": "application/json" }
        });
      }

      if (url === "https://apisandbox.dev.clover.com/v3/merchants/merchant-sbx/orders/clover-order-1/line_items") {
        lineItemBodies.push(JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>);
        return new Response(JSON.stringify({ id: `line-item-${lineItemBodies.length}` }), {
          status: 200,
          headers: { "content-type": "application/json" }
        });
      }

      if (url === "https://apisandbox.dev.clover.com/v3/merchants/merchant-sbx/print_event") {
        return new Response(JSON.stringify({ message: "The default printing device is missing" }), {
          status: 400,
          headers: { "content-type": "application/json" }
        });
      }

      throw new Error(`unexpected live Clover URL: ${url}`);
    });

    const app = await buildApp();
    await connectCloverOauth(app, "merchant-sbx");
    const response = await app.inject({
      method: "POST",
      url: "/v1/payments/orders/submit",
      headers: internalHeaders(),
      payload: {
        id: "123e4567-e89b-12d3-a456-426614174199",
        locationId: "flagship-01",
        status: "PAID",
        items: [
          {
            itemId: "latte",
            itemName: "Honey Oat Latte",
            quantity: 2,
            unitPriceCents: 675,
            customization: {
              selectedOptions: [
                {
                  groupId: "size",
                  groupLabel: "Size",
                  optionId: "large",
                  optionLabel: "Large",
                  priceDeltaCents: 75
                },
                {
                  groupId: "milk",
                  groupLabel: "Milk",
                  optionId: "oat",
                  optionLabel: "Oat",
                  priceDeltaCents: 0
                }
              ],
              notes: "Half sweet"
            }
          }
        ],
        total: {
          currency: "USD",
          amountCents: 1350
        },
        pickupCode: "ABC123",
        timeline: [
          {
            status: "PENDING_PAYMENT",
            occurredAt: "2026-04-03T00:00:00.000Z",
            source: "customer"
          },
          {
            status: "PAID",
            occurredAt: "2026-04-03T00:00:05.000Z",
            source: "customer"
          }
        ]
      }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      accepted: true,
      merchantId: "merchant-sbx"
    });
    expect(createOrderBody).toMatchObject({
      total: 1350,
      currency: "USD",
      state: "Open",
      groupLineItems: false,
      note: "LatteLink order 123e4567-e89b-12d3-a456-426614174199"
    });
    expect(lineItemBodies).toEqual([
      {
        name: "Honey Oat Latte",
        alternateName: "latte",
        price: 675,
        note: "Size: Large\nMilk: Oat\nNotes: Half sweet",
        taxRates: []
      },
      {
        name: "Honey Oat Latte",
        alternateName: "latte",
        price: 675,
        note: "Size: Large\nMilk: Oat\nNotes: Half sweet",
        taxRates: []
      }
    ]);
    expect(fetchMock).toHaveBeenCalledTimes(6);
    await app.close();
  });

});
