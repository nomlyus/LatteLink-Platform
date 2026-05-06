import { afterEach, describe, expect, it, vi } from "vitest";
import {
  adminMenuItemSchema,
  adminMenuResponseSchema,
  adminStoreConfigSchema,
  appConfigSchema,
  clientPaymentProfileSchema,
  adminClientCreateResponseSchema,
  internalClientDetailSchema,
  internalClientListResponseSchema,
  internalLocationListResponseSchema,
  internalLocationSummarySchema,
  menuResponseSchema,
  onboardingSummarySchema,
  storeConfigResponseSchema
} from "@lattelink/contracts-catalog";
import { buildApp } from "../src/app.js";
import {
  DEFAULT_BRAND_NAME,
  DEFAULT_LOCATION_ID,
  DEFAULT_LOCATION_NAME
} from "../src/tenant.js";

describe("catalog service", () => {
  const previousGatewayToken = process.env.GATEWAY_INTERNAL_API_TOKEN;
  const previousFulfillmentMode = process.env.ORDER_FULFILLMENT_MODE;
  const previousCatalogDefaultLocationId = process.env.CATALOG_DEFAULT_LOCATION_ID;
  const mediaEnvNames = [
    "CATALOG_MEDIA_R2_ACCOUNT_ID",
    "CATALOG_MEDIA_R2_ACCESS_KEY_ID",
    "CATALOG_MEDIA_R2_SECRET_ACCESS_KEY",
    "CATALOG_MEDIA_R2_BUCKET",
    "CATALOG_MEDIA_PUBLIC_BASE_URL",
    "CATALOG_MEDIA_UPLOAD_MAX_BYTES",
    "CATALOG_MEDIA_UPLOAD_EXPIRY_SECONDS"
  ] as const;
  const previousMediaEnv = Object.fromEntries(mediaEnvNames.map((name) => [name, process.env[name]])) as Record<
    (typeof mediaEnvNames)[number],
    string | undefined
  >;

  afterEach(() => {
    if (previousGatewayToken === undefined) {
      delete process.env.GATEWAY_INTERNAL_API_TOKEN;
    } else {
      process.env.GATEWAY_INTERNAL_API_TOKEN = previousGatewayToken;
    }

    if (previousFulfillmentMode === undefined) {
      delete process.env.ORDER_FULFILLMENT_MODE;
    } else {
      process.env.ORDER_FULFILLMENT_MODE = previousFulfillmentMode;
    }

    if (previousCatalogDefaultLocationId === undefined) {
      delete process.env.CATALOG_DEFAULT_LOCATION_ID;
    } else {
      process.env.CATALOG_DEFAULT_LOCATION_ID = previousCatalogDefaultLocationId;
    }

    for (const name of mediaEnvNames) {
      const previousValue = previousMediaEnv[name];
      if (previousValue === undefined) {
        delete process.env[name];
      } else {
        process.env[name] = previousValue;
      }
    }

    vi.useRealTimers();
  });

  it("responds on /health", async () => {
    const app = await buildApp();
    const response = await app.inject({ method: "GET", url: "/health" });

    expect(response.statusCode).toBe(200);
    await app.close();
  });

  it("returns v1 menu payload", async () => {
    const app = await buildApp();
    const response = await app.inject({ method: "GET", url: `/v1/menu?locationId=${DEFAULT_LOCATION_ID}` });

    expect(response.statusCode).toBe(200);
    expect(response.headers["cache-control"]).toBe("public, max-age=60, stale-while-revalidate=300");
    const parsed = menuResponseSchema.parse(response.json());
    expect(parsed.categories.length).toBeGreaterThan(0);
    await app.close();
  });

  it("rejects public catalog requests without locationId unless an explicit fallback is configured", async () => {
    const app = await buildApp();
    const missingLocationResponse = await app.inject({ method: "GET", url: "/v1/menu" });

    expect(missingLocationResponse.statusCode).toBe(400);
    expect(missingLocationResponse.json()).toMatchObject({
      code: "MISSING_LOCATION_ID",
      message: "locationId query parameter is required"
    });
    await app.close();

    process.env.CATALOG_DEFAULT_LOCATION_ID = DEFAULT_LOCATION_ID;
    const fallbackApp = await buildApp();
    const fallbackResponse = await fallbackApp.inject({ method: "GET", url: "/v1/menu" });

    expect(fallbackResponse.statusCode).toBe(200);
    expect(menuResponseSchema.parse(fallbackResponse.json()).locationId).toBe(DEFAULT_LOCATION_ID);
    await fallbackApp.close();
  });

  it("returns v1 app config payload with staff fulfillment by default", async () => {
    const app = await buildApp();
    const response = await app.inject({ method: "GET", url: `/v1/app-config?locationId=${DEFAULT_LOCATION_ID}` });

    expect(response.statusCode).toBe(200);
    const parsed = appConfigSchema.parse(response.json());
    expect(parsed.brand.brandName).toBe(DEFAULT_BRAND_NAME);
    expect(parsed.enabledTabs).toEqual(["home", "menu", "orders", "account"]);
    expect(parsed.storeCapabilities.menu.source).toBe("platform_managed");
    expect(parsed.storeCapabilities.operations.dashboardEnabled).toBe(true);
    expect(parsed.storeCapabilities.loyalty.visible).toBe(true);
    expect(parsed.fulfillment.mode).toBe("staff");
    expect(parsed.storeCapabilities.operations.fulfillmentMode).toBe("staff");
    await app.close();
  });

  it("returns a time-based fulfillment mode only when explicitly configured", async () => {
    process.env.ORDER_FULFILLMENT_MODE = "time_based";
    const app = await buildApp();
    const response = await app.inject({ method: "GET", url: `/v1/app-config?locationId=${DEFAULT_LOCATION_ID}` });

    expect(response.statusCode).toBe(200);
    const parsed = appConfigSchema.parse(response.json());
    expect(parsed.fulfillment.mode).toBe("time_based");
    expect(parsed.storeCapabilities.operations.fulfillmentMode).toBe("time_based");
    expect(parsed.fulfillment.timeBasedScheduleMinutes.completed).toBe(15);

    await app.close();
  });

  it("returns v1 store config payload", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-03-10T17:00:00.000Z"));
    const app = await buildApp();
    const response = await app.inject({ method: "GET", url: `/v1/store/config?locationId=${DEFAULT_LOCATION_ID}` });

    expect(response.statusCode).toBe(200);
    const parsed = storeConfigResponseSchema.parse(response.json());
    expect(parsed.hoursText).toContain("Daily");
    expect(parsed.isOpen).toBe(true);
    expect(parsed.nextOpenAt).toBeNull();
    expect(parsed.prepEtaMinutes).toBeGreaterThan(0);
    await app.close();
  });

  it("marks the store closed outside configured hours", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-03-10T02:00:00.000Z"));
    const app = await buildApp();
    const response = await app.inject({ method: "GET", url: `/v1/store/config?locationId=${DEFAULT_LOCATION_ID}` });

    expect(response.statusCode).toBe(200);
    const parsed = storeConfigResponseSchema.parse(response.json());
    expect(parsed.isOpen).toBe(false);
    expect(parsed.nextOpenAt).toBeTruthy();
    await app.close();
  });

  it("exposes gateway-protected admin menu and store config routes", async () => {
    process.env.GATEWAY_INTERNAL_API_TOKEN = "catalog-gateway-token";
    const app = await buildApp();

    const adminMenuResponse = await app.inject({
      method: "GET",
      url: "/v1/catalog/admin/menu",
      headers: {
        "x-gateway-token": "catalog-gateway-token",
        "x-operator-location-id": DEFAULT_LOCATION_ID
      }
    });
    expect(adminMenuResponse.statusCode).toBe(200);
    const adminMenu = adminMenuResponseSchema.parse(adminMenuResponse.json());
    expect(adminMenu.categories.length).toBeGreaterThan(0);
    expect(
      Array.isArray((adminMenuResponse.json() as { categories: Array<{ items: Array<{ customizationGroups?: unknown }> }> }).categories[0]?.items[0]?.customizationGroups)
    ).toBe(true);

    const updateResponse = await app.inject({
      method: "PUT",
      url: "/v1/catalog/admin/menu/latte",
      headers: {
        "x-gateway-token": "catalog-gateway-token",
        "x-operator-location-id": DEFAULT_LOCATION_ID
      },
      payload: {
        name: "Operator Latte",
        priceCents: 715,
        visible: false,
        customizationGroups: [
          {
            id: "milk",
            label: "Milk",
            selectionType: "single",
            required: true,
            sortOrder: 0,
            options: [
              {
                id: "whole",
                label: "Whole milk",
                priceDeltaCents: 0,
                default: true,
                available: true,
                sortOrder: 0
              }
            ]
          }
        ]
      }
    });
    expect(updateResponse.statusCode).toBe(200);
    const updatedItem = adminMenuItemSchema.parse(updateResponse.json());
    expect(updatedItem.name).toBe("Operator Latte");
    expect(updatedItem.visible).toBe(false);
    expect(updateResponse.json()).toMatchObject({
      customizationGroups: [
        {
          id: "milk",
          label: "Milk"
        }
      ]
    });

    const adminStoreConfigResponse = await app.inject({
      method: "GET",
      url: "/v1/catalog/admin/store/config",
      headers: {
        "x-gateway-token": "catalog-gateway-token",
        "x-operator-location-id": DEFAULT_LOCATION_ID
      }
    });
    expect(adminStoreConfigResponse.statusCode).toBe(200);
    const adminStoreConfig = adminStoreConfigSchema.parse(adminStoreConfigResponse.json());
    expect(adminStoreConfig.storeName).toBe(DEFAULT_BRAND_NAME);
    expect(adminStoreConfig.locationName).toBe(DEFAULT_LOCATION_NAME);
    expect(adminStoreConfig.taxRateBasisPoints).toBe(600);
    expect(adminStoreConfig.capabilities.menu.source).toBe("platform_managed");

    const storeUpdateResponse = await app.inject({
      method: "PUT",
      url: "/v1/catalog/admin/store/config",
      headers: {
        "x-gateway-token": "catalog-gateway-token",
        "x-operator-location-id": DEFAULT_LOCATION_ID
      },
      payload: {
        storeName: "Gazelle Coffee Downtown",
        locationName: "Ann Arbor, MI",
        hours: "Weekdays · 6:30 AM - 5:00 PM",
        pickupInstructions: "Use the front pickup shelves.",
        taxRateBasisPoints: 650,
        capabilities: {
          menu: {
            source: "external_sync"
          },
          operations: {
            fulfillmentMode: "staff",
            liveOrderTrackingEnabled: false,
            dashboardEnabled: false
          },
          loyalty: {
            visible: false
          }
        }
      }
    });
    expect(storeUpdateResponse.statusCode).toBe(200);
    expect(adminStoreConfigSchema.parse(storeUpdateResponse.json())).toMatchObject({
      storeName: "Gazelle Coffee Downtown",
      locationName: "Ann Arbor, MI",
      hours: "Weekdays · 6:30 AM - 5:00 PM",
      taxRateBasisPoints: 650,
      capabilities: {
        menu: {
          source: "external_sync"
        },
        operations: {
          fulfillmentMode: "staff",
          liveOrderTrackingEnabled: false,
          dashboardEnabled: false
        },
        loyalty: {
          visible: false
        }
      }
    });

    const storeConfigResponse = await app.inject({ method: "GET", url: `/v1/store/config?locationId=${DEFAULT_LOCATION_ID}` });
    expect(storeConfigResponse.statusCode).toBe(200);
    expect(storeConfigResponseSchema.parse(storeConfigResponse.json())).toMatchObject({
      taxRateBasisPoints: 650
    });

    const appConfigResponse = await app.inject({ method: "GET", url: `/v1/app-config?locationId=${DEFAULT_LOCATION_ID}` });
    expect(appConfigResponse.statusCode).toBe(200);
    expect(appConfigSchema.parse(appConfigResponse.json())).toMatchObject({
      brand: {
        brandName: "Gazelle Coffee Downtown",
        locationName: "Ann Arbor, MI"
      },
      storeCapabilities: {
        menu: {
          source: "external_sync"
        },
        operations: {
          fulfillmentMode: "staff",
          liveOrderTrackingEnabled: false,
          dashboardEnabled: false
        },
        loyalty: {
          visible: false
        }
      },
      fulfillment: {
        mode: "staff"
      },
      featureFlags: {
        loyalty: false,
        orderTracking: false,
        staffDashboard: false,
        menuEditing: false
      },
      loyaltyEnabled: false
    });

    await app.close();
  });

  it("returns a clear 503 when menu image uploads are not configured", async () => {
    process.env.GATEWAY_INTERNAL_API_TOKEN = "catalog-gateway-token";
    for (const name of mediaEnvNames) {
      delete process.env[name];
    }

    const app = await buildApp();
    const response = await app.inject({
      method: "POST",
      url: "/v1/catalog/admin/menu/latte/image-upload",
      headers: {
        "x-gateway-token": "catalog-gateway-token",
        "x-operator-location-id": DEFAULT_LOCATION_ID
      },
      payload: {
        fileName: "latte.jpg",
        contentType: "image/jpeg",
        sizeBytes: 512
      }
    });

    expect(response.statusCode).toBe(503);
    expect(response.json()).toMatchObject({
      code: "MENU_IMAGE_UPLOAD_UNAVAILABLE",
      message: "Menu image uploads are not configured."
    });

    await app.close();
  });

  it("validates menu image upload content type and size", async () => {
    process.env.GATEWAY_INTERNAL_API_TOKEN = "catalog-gateway-token";
    process.env.CATALOG_MEDIA_R2_ACCOUNT_ID = "test-account";
    process.env.CATALOG_MEDIA_R2_ACCESS_KEY_ID = "test-access-key";
    process.env.CATALOG_MEDIA_R2_SECRET_ACCESS_KEY = "test-secret-key";
    process.env.CATALOG_MEDIA_R2_BUCKET = "menu-media";
    process.env.CATALOG_MEDIA_PUBLIC_BASE_URL = "https://media.example.test";
    process.env.CATALOG_MEDIA_UPLOAD_MAX_BYTES = "1024";
    process.env.CATALOG_MEDIA_UPLOAD_EXPIRY_SECONDS = "120";

    const app = await buildApp();
    const unsupportedTypeResponse = await app.inject({
      method: "POST",
      url: "/v1/catalog/admin/menu/latte/image-upload",
      headers: {
        "x-gateway-token": "catalog-gateway-token",
        "x-operator-location-id": DEFAULT_LOCATION_ID
      },
      payload: {
        fileName: "latte.svg",
        contentType: "image/svg+xml",
        sizeBytes: 512
      }
    });

    expect(unsupportedTypeResponse.statusCode).toBe(400);
    expect(unsupportedTypeResponse.json()).toMatchObject({
      code: "INVALID_MENU_IMAGE_UPLOAD"
    });

    const oversizedResponse = await app.inject({
      method: "POST",
      url: "/v1/catalog/admin/menu/latte/image-upload",
      headers: {
        "x-gateway-token": "catalog-gateway-token",
        "x-operator-location-id": DEFAULT_LOCATION_ID
      },
      payload: {
        fileName: "latte.jpg",
        contentType: "image/jpeg",
        sizeBytes: 2048
      }
    });

    expect(oversizedResponse.statusCode).toBe(413);
    expect(oversizedResponse.json()).toMatchObject({
      code: "INVALID_MENU_IMAGE_UPLOAD"
    });

    await app.close();
  });

  it("rejects invalid admin customization payloads with a 4xx response", async () => {
    process.env.GATEWAY_INTERNAL_API_TOKEN = "catalog-gateway-token";
    const app = await buildApp();

    const response = await app.inject({
      method: "PUT",
      url: "/v1/catalog/admin/menu/latte",
      headers: {
        "x-gateway-token": "catalog-gateway-token",
        "x-operator-location-id": DEFAULT_LOCATION_ID
      },
      payload: {
        name: "Operator Latte",
        priceCents: 715,
        visible: true,
        customizationGroups: [
          {
            id: "milk",
            label: "Milk",
            selectionType: "single",
            required: true,
            sortOrder: 0,
            options: []
          }
        ]
      }
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({
      code: "INVALID_CUSTOMIZATION_GROUPS_PAYLOAD"
    });

    await app.close();
  });

  it("rejects admin requests with an invalid gateway token", async () => {
    process.env.GATEWAY_INTERNAL_API_TOKEN = "catalog-gateway-token";
    const app = await buildApp();

    const response = await app.inject({
      method: "GET",
      url: "/v1/catalog/admin/menu",
      headers: {
        "x-gateway-token": "wrong-token"
      }
    });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({
      code: "UNAUTHORIZED_GATEWAY_REQUEST"
    });

    await app.close();
  });

  it("rejects gateway-protected admin requests without an operator location header", async () => {
    process.env.GATEWAY_INTERNAL_API_TOKEN = "catalog-gateway-token";
    const app = await buildApp();

    const response = await app.inject({
      method: "GET",
      url: "/v1/catalog/admin/menu",
      headers: {
        "x-gateway-token": "catalog-gateway-token"
      }
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({
      code: "MISSING_OPERATOR_LOCATION_ID"
    });

    await app.close();
  });

  it("fails closed on gateway-protected routes when gateway auth is not configured", async () => {
    delete process.env.GATEWAY_INTERNAL_API_TOKEN;
    const app = await buildApp();

    const response = await app.inject({
      method: "GET",
      url: "/v1/catalog/admin/menu",
      headers: {
        "x-gateway-token": "catalog-gateway-token"
      }
    });

    expect(response.statusCode).toBe(503);
    expect(response.json()).toMatchObject({
      code: "GATEWAY_ACCESS_NOT_CONFIGURED"
    });

    await app.close();
  });

  it("protects catalog internal ping with the gateway token", async () => {
    process.env.GATEWAY_INTERNAL_API_TOKEN = "catalog-gateway-token";
    const app = await buildApp();

    const response = await app.inject({
      method: "POST",
      url: "/v1/catalog/internal/ping",
      headers: {
        "x-gateway-token": "catalog-gateway-token"
      },
      payload: {
        id: "123e4567-e89b-12d3-a456-426614174998"
      }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      service: "catalog",
      accepted: true
    });

    await app.close();
  });

  it("rate limits gateway-protected catalog routes when configured threshold is reached", async () => {
    process.env.GATEWAY_INTERNAL_API_TOKEN = "catalog-gateway-token";
    vi.stubEnv("CATALOG_RATE_LIMIT_GATEWAY_READ_MAX", "1");
    vi.stubEnv("CATALOG_RATE_LIMIT_GATEWAY_WRITE_MAX", "1");
    vi.stubEnv("CATALOG_RATE_LIMIT_WINDOW_MS", "60000");
    const app = await buildApp();

    try {
      const firstRead = await app.inject({
        method: "GET",
        url: "/v1/catalog/admin/menu",
        headers: {
          "x-gateway-token": "catalog-gateway-token",
          "x-operator-location-id": DEFAULT_LOCATION_ID
        }
      });
      expect(firstRead.statusCode).toBe(200);

      const secondRead = await app.inject({
        method: "GET",
        url: "/v1/catalog/admin/menu",
        headers: {
          "x-gateway-token": "catalog-gateway-token",
          "x-operator-location-id": DEFAULT_LOCATION_ID
        }
      });
      expect(secondRead.statusCode).toBe(429);

      const firstWrite = await app.inject({
        method: "POST",
        url: "/v1/catalog/internal/ping",
        headers: {
          "x-gateway-token": "catalog-gateway-token"
        },
        payload: {
          id: "123e4567-e89b-12d3-a456-426614174998"
        }
      });
      expect(firstWrite.statusCode).toBe(200);

      const secondWrite = await app.inject({
        method: "POST",
        url: "/v1/catalog/internal/ping",
        headers: {
          "x-gateway-token": "catalog-gateway-token"
        },
        payload: {
          id: "123e4567-e89b-12d3-a456-426614174998"
        }
      });
      expect(secondWrite.statusCode).toBe(429);
    } finally {
      vi.unstubAllEnvs();
      await app.close();
    }
  });

  it("propagates x-request-id and exposes metrics counters", async () => {
    const app = await buildApp();
    const requestId = "catalog-trace-1";

    const menuResponse = await app.inject({
      method: "GET",
      url: `/v1/menu?locationId=${DEFAULT_LOCATION_ID}`,
      headers: {
        "x-request-id": requestId
      }
    });

    expect(menuResponse.statusCode).toBe(200);
    expect(menuResponse.headers["x-request-id"]).toBe(requestId);

    const metricsResponse = await app.inject({
      method: "GET",
      url: "/metrics"
    });
    expect(metricsResponse.statusCode).toBe(200);
    expect(metricsResponse.json()).toMatchObject({
      service: "catalog",
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

  it("reports persistence backend on /ready", async () => {
    const app = await buildApp();
    const response = await app.inject({ method: "GET", url: "/ready" });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      status: "ready",
      service: "catalog",
      persistence: expect.stringMatching(/^(memory|postgres)$/)
    });

    await app.close();
  });

  it("bootstraps and fetches an internal pilot location through gateway-protected routes", async () => {
    process.env.GATEWAY_INTERNAL_API_TOKEN = "catalog-gateway-token";
    const app = await buildApp();

    const bootstrapResponse = await app.inject({
      method: "POST",
      url: "/v1/catalog/internal/locations/bootstrap",
      headers: {
        "x-gateway-token": "catalog-gateway-token"
      },
      payload: {
        brandId: "northside-coffee",
        brandName: "Northside Coffee",
        locationId: "northside-01",
        locationName: "Northside Flagship",
        marketLabel: "Detroit, MI",
        storeName: "Northside Coffee",
        hours: "Daily · 7:00 AM - 6:00 PM",
        pickupInstructions: "Pickup at the espresso counter.",
        taxRateBasisPoints: 675,
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
    });

    expect(bootstrapResponse.statusCode).toBe(200);
    const bootstrap = internalLocationSummarySchema.parse(bootstrapResponse.json());
    expect(bootstrap.action).toBe("created");
    expect(bootstrap.locationId).toBe("northside-01");
    expect(bootstrap.taxRateBasisPoints).toBe(675);

    const listResponse = await app.inject({
      method: "GET",
      url: "/v1/catalog/internal/locations",
      headers: {
        "x-gateway-token": "catalog-gateway-token"
      }
    });

    expect(listResponse.statusCode).toBe(200);
    const locationList = internalLocationListResponseSchema.parse(listResponse.json());
    expect(locationList.locations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          locationId: DEFAULT_LOCATION_ID,
          brandName: DEFAULT_BRAND_NAME
        }),
        expect.objectContaining({
          locationId: "northside-01",
          brandName: "Northside Coffee"
        })
      ])
    );

    const summaryResponse = await app.inject({
      method: "GET",
      url: "/v1/catalog/internal/locations/northside-01",
      headers: {
        "x-gateway-token": "catalog-gateway-token"
      }
    });

    expect(summaryResponse.statusCode).toBe(200);
    expect(internalLocationSummarySchema.parse(summaryResponse.json())).toMatchObject({
      brandName: "Northside Coffee",
      locationId: "northside-01",
      taxRateBasisPoints: 675,
      capabilities: {
        operations: {
          fulfillmentMode: "staff"
        }
      }
    });

    const paymentProfileResponse = await app.inject({
      method: "PUT",
      url: "/v1/catalog/internal/locations/northside-01/payment-profile",
      headers: {
        "x-gateway-token": "catalog-gateway-token"
      },
      payload: {
        locationId: "northside-01",
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
      }
    });

    expect(paymentProfileResponse.statusCode).toBe(200);
    expect(clientPaymentProfileSchema.parse(paymentProfileResponse.json())).toMatchObject({
      locationId: "northside-01",
      stripeAccountId: "acct_123456789",
      stripeOnboardingStatus: "completed"
    });

    const paymentProfileReadResponse = await app.inject({
      method: "GET",
      url: "/v1/catalog/internal/locations/northside-01/payment-profile",
      headers: {
        "x-gateway-token": "catalog-gateway-token"
      }
    });

    expect(paymentProfileReadResponse.statusCode).toBe(200);
    expect(clientPaymentProfileSchema.parse(paymentProfileReadResponse.json())).toMatchObject({
      locationId: "northside-01",
      stripeChargesEnabled: true,
      stripePayoutsEnabled: true
    });

    await app.close();
  });

  it("generates internal brand and location identifiers when bootstrapping a new location", async () => {
    process.env.GATEWAY_INTERNAL_API_TOKEN = "catalog-gateway-token";
    const app = await buildApp();

    const bootstrapResponse = await app.inject({
      method: "POST",
      url: "/v1/catalog/internal/locations/bootstrap",
      headers: {
        "x-gateway-token": "catalog-gateway-token"
      },
      payload: {
        brandName: "Generated Coffee",
        locationName: "Generated Flagship",
        marketLabel: "Detroit, MI"
      }
    });

    expect(bootstrapResponse.statusCode).toBe(200);
    const bootstrap = internalLocationSummarySchema.parse(bootstrapResponse.json());
    expect(bootstrap.action).toBe("created");
    expect(bootstrap.brandId).toMatch(/^brd_[a-f0-9]{16}$/);
    expect(bootstrap.locationId).toMatch(/^loc_[a-f0-9]{16}$/);
    expect(bootstrap.brandName).toBe("Generated Coffee");
    expect(bootstrap.locationName).toBe("Generated Flagship");

    const summaryResponse = await app.inject({
      method: "GET",
      url: `/v1/catalog/internal/locations/${bootstrap.locationId}`,
      headers: {
        "x-gateway-token": "catalog-gateway-token"
      }
    });

    expect(summaryResponse.statusCode).toBe(200);
    expect(internalLocationSummarySchema.parse(summaryResponse.json())).toMatchObject({
      brandId: bootstrap.brandId,
      locationId: bootstrap.locationId,
      brandName: "Generated Coffee"
    });

    await app.close();
  });

  it("creates a client shell and tracks onboarding readiness through internal APIs", async () => {
    process.env.GATEWAY_INTERNAL_API_TOKEN = "catalog-gateway-token";
    const app = await buildApp();

    const createResponse = await app.inject({
      method: "POST",
      url: "/v1/catalog/internal/clients",
      headers: {
        "x-gateway-token": "catalog-gateway-token"
      },
      payload: {
        clientName: "Wizard Coffee",
        locationName: "Wizard Flagship",
        marketLabel: "Detroit, MI",
        ownerEmail: "owner@wizard.example",
        storeName: "Wizard Coffee"
      }
    });

    expect(createResponse.statusCode).toBe(200);
    const created = adminClientCreateResponseSchema.parse(createResponse.json());
    expect(created.tenantId).toMatch(/^ten_[a-f0-9]{16}$/);
    expect(created.locationId).toMatch(/^loc_[a-f0-9]{16}$/);
    expect(created.onboarding.readyForReview).toBe(false);

    const listResponse = await app.inject({
      method: "GET",
      url: "/v1/catalog/internal/clients",
      headers: {
        "x-gateway-token": "catalog-gateway-token"
      }
    });
    expect(listResponse.statusCode).toBe(200);
    expect(internalClientListResponseSchema.parse(listResponse.json()).clients).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          tenantId: created.tenantId,
          primaryLocationId: created.locationId
        })
      ])
    );

    const detailResponse = await app.inject({
      method: "GET",
      url: `/v1/catalog/internal/clients/${created.tenantId}`,
      headers: {
        "x-gateway-token": "catalog-gateway-token"
      }
    });
    expect(detailResponse.statusCode).toBe(200);
    expect(internalClientDetailSchema.parse(detailResponse.json())).toMatchObject({
      tenantId: created.tenantId,
      locations: [
        {
          locationId: created.locationId,
          primaryLocation: true
        }
      ]
    });

    const onboardingUpdateResponse = await app.inject({
      method: "PATCH",
      url: `/v1/catalog/internal/locations/${created.locationId}/onboarding`,
      headers: {
        "x-gateway-token": "catalog-gateway-token"
      },
      payload: {
        businessProfileComplete: true,
        storeOperationsComplete: true,
        menuReady: true,
        teamConfiguredOrSkipped: true,
        testOrderCompleted: true,
        readyForReview: true
      }
    });
    expect(onboardingUpdateResponse.statusCode).toBe(200);
    expect(onboardingSummarySchema.parse(onboardingUpdateResponse.json())).toMatchObject({
      status: "ready_for_review",
      readyForReview: false
    });

    const mobileReleaseResponse = await app.inject({
      method: "PATCH",
      url: `/v1/catalog/internal/locations/${created.locationId}/mobile-release`,
      headers: {
        "x-gateway-token": "catalog-gateway-token"
      },
      payload: {
        status: "ready_for_launch",
        buildNumber: "42"
      }
    });
    expect(mobileReleaseResponse.statusCode).toBe(200);
    expect(onboardingSummarySchema.parse(mobileReleaseResponse.json()).mobileRelease).toMatchObject({
      status: "ready_for_launch",
      buildNumber: "42"
    });

    const paymentProfileResponse = await app.inject({
      method: "PUT",
      url: `/v1/catalog/internal/locations/${created.locationId}/payment-profile`,
      headers: {
        "x-gateway-token": "catalog-gateway-token"
      },
      payload: {
        locationId: created.locationId,
        stripeAccountId: "acct_wizard123",
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
        cloverPosEnabled: false
      }
    });
    expect(paymentProfileResponse.statusCode).toBe(200);

    const onboardingReadResponse = await app.inject({
      method: "GET",
      url: `/v1/catalog/internal/locations/${created.locationId}/onboarding`,
      headers: {
        "x-gateway-token": "catalog-gateway-token"
      }
    });
    expect(onboardingReadResponse.statusCode).toBe(200);
    const onboarding = onboardingSummarySchema.parse(onboardingReadResponse.json());
    expect(onboarding.readyForReview).toBe(false);
    expect(onboarding.checklist).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "payments_connected", passed: true }),
        expect.objectContaining({ id: "mobile_release_ready", passed: true }),
        expect.objectContaining({ id: "admin_launch_approved", passed: false })
      ])
    );

    const launchApprovalResponse = await app.inject({
      method: "POST",
      url: `/v1/catalog/internal/locations/${created.locationId}/launch-approval`,
      headers: {
        "x-gateway-token": "catalog-gateway-token"
      },
      payload: {
        approved: true,
        note: "Manual pilot approval."
      }
    });
    expect(launchApprovalResponse.statusCode).toBe(200);
    expect(onboardingSummarySchema.parse(launchApprovalResponse.json())).toMatchObject({
      status: "approved",
      readyForReview: false
    });

    await app.close();
  });

  it("reflects the default location payment profile in public app-config", async () => {
    process.env.GATEWAY_INTERNAL_API_TOKEN = "catalog-gateway-token";
    const app = await buildApp();

    const paymentProfileResponse = await app.inject({
      method: "PUT",
      url: `/v1/catalog/internal/locations/${DEFAULT_LOCATION_ID}/payment-profile`,
      headers: {
        "x-gateway-token": "catalog-gateway-token"
      },
      payload: {
        locationId: DEFAULT_LOCATION_ID,
        stripeAccountId: "acct_default123",
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
      }
    });

    expect(paymentProfileResponse.statusCode).toBe(200);

    const appConfigResponse = await app.inject({ method: "GET", url: `/v1/app-config?locationId=${DEFAULT_LOCATION_ID}` });

    expect(appConfigResponse.statusCode).toBe(200);
    expect(appConfigSchema.parse(appConfigResponse.json())).toMatchObject({
      paymentCapabilities: {
        applePay: true,
        card: true,
        refunds: true,
        stripe: {
          enabled: true,
          onboarded: true,
          dashboardEnabled: true
        }
      }
    });

    await app.close();
  });
});
