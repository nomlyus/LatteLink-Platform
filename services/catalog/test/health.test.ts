import { afterEach, describe, expect, it, vi } from "vitest";
import {
  adminMenuItemSchema,
  adminMenuResponseSchema,
  adminStoreConfigSchema,
  appConfigSchema,
  internalLocationListResponseSchema,
  internalLocationSummarySchema,
  menuResponseSchema,
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
    const response = await app.inject({ method: "GET", url: "/v1/menu" });

    expect(response.statusCode).toBe(200);
    const parsed = menuResponseSchema.parse(response.json());
    expect(parsed.categories.length).toBeGreaterThan(0);
    await app.close();
  });

  it("returns v1 app config payload", async () => {
    const app = await buildApp();
    const response = await app.inject({ method: "GET", url: "/v1/app-config" });

    expect(response.statusCode).toBe(200);
    const parsed = appConfigSchema.parse(response.json());
    expect(parsed.brand.brandName).toBe(DEFAULT_BRAND_NAME);
    expect(parsed.enabledTabs).toEqual(["home", "menu", "orders", "account"]);
    expect(parsed.storeCapabilities.menu.source).toBe("platform_managed");
    expect(parsed.storeCapabilities.operations.dashboardEnabled).toBe(true);
    expect(parsed.storeCapabilities.loyalty.visible).toBe(true);
    expect(parsed.fulfillment.mode).toBe("time_based");
    await app.close();
  });

  it("returns a staff fulfillment mode when configured", async () => {
    process.env.ORDER_FULFILLMENT_MODE = "staff";
    const app = await buildApp();
    const response = await app.inject({ method: "GET", url: "/v1/app-config" });

    expect(response.statusCode).toBe(200);
    const parsed = appConfigSchema.parse(response.json());
    expect(parsed.fulfillment.mode).toBe("staff");
    expect(parsed.storeCapabilities.operations.fulfillmentMode).toBe("staff");
    expect(parsed.fulfillment.timeBasedScheduleMinutes.completed).toBe(15);

    await app.close();
  });

  it("returns v1 store config payload", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-03-10T17:00:00.000Z"));
    const app = await buildApp();
    const response = await app.inject({ method: "GET", url: "/v1/store/config" });

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
    const response = await app.inject({ method: "GET", url: "/v1/store/config" });

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
        "x-gateway-token": "catalog-gateway-token"
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
        "x-gateway-token": "catalog-gateway-token"
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
        "x-gateway-token": "catalog-gateway-token"
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
        "x-gateway-token": "catalog-gateway-token"
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

    const storeConfigResponse = await app.inject({ method: "GET", url: "/v1/store/config" });
    expect(storeConfigResponse.statusCode).toBe(200);
    expect(storeConfigResponseSchema.parse(storeConfigResponse.json())).toMatchObject({
      taxRateBasisPoints: 650
    });

    const appConfigResponse = await app.inject({ method: "GET", url: "/v1/app-config" });
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

  it("rejects invalid admin customization payloads with a 4xx response", async () => {
    process.env.GATEWAY_INTERNAL_API_TOKEN = "catalog-gateway-token";
    const app = await buildApp();

    const response = await app.inject({
      method: "PUT",
      url: "/v1/catalog/admin/menu/latte",
      headers: {
        "x-gateway-token": "catalog-gateway-token"
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
          "x-gateway-token": "catalog-gateway-token"
        }
      });
      expect(firstRead.statusCode).toBe(200);

      const secondRead = await app.inject({
        method: "GET",
        url: "/v1/catalog/admin/menu",
        headers: {
          "x-gateway-token": "catalog-gateway-token"
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
      url: "/v1/menu",
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

    await app.close();
  });
});
