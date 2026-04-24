import { afterEach, describe, expect, it, vi } from "vitest";
import {
  ApiRequestError,
  buildOperatorHeaders,
  extractApiErrorMessage,
  fetchDashboardLocations,
  isApiRequestError,
  normalizeApiBaseUrl,
  signInOperatorWithPassword,
  updateOperatorOrderStatus,
  uploadOperatorMenuItemImage
} from "../src/api";

describe("client dashboard api helpers", () => {
  it("normalizes operator api base URLs onto /v1", () => {
    expect(normalizeApiBaseUrl("")).toBe("");
    expect(normalizeApiBaseUrl("http://127.0.0.1:8080")).toBe("http://127.0.0.1:8080/v1");
    expect(normalizeApiBaseUrl("http://127.0.0.1:8080/")).toBe("http://127.0.0.1:8080/v1");
    expect(normalizeApiBaseUrl("http://127.0.0.1:8080/v1")).toBe("http://127.0.0.1:8080/v1");
  });

  it("builds bearer headers for authenticated operator requests", () => {
    expect(buildOperatorHeaders("operator-access-token", true)).toEqual({
      authorization: "Bearer operator-access-token",
      "content-type": "application/json"
    });

    expect(buildOperatorHeaders("operator-access-token", false)).toEqual({
      authorization: "Bearer operator-access-token"
    });
  });

  it("prefers upstream error messages when present", () => {
    expect(extractApiErrorMessage({ message: "Gateway token is invalid" }, 401)).toBe("Gateway token is invalid");
    expect(extractApiErrorMessage({}, 503)).toBe("Request failed (503)");
  });

  it("identifies typed API request errors for auth handling", () => {
    const error = new ApiRequestError("Request failed (401)", 401, { message: "Unauthorized" });

    expect(isApiRequestError(error)).toBe(true);
    expect(isApiRequestError(new Error("plain error"))).toBe(false);
    expect(error.statusCode).toBe(401);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("throws a stable backend reachability error when the api base URL is missing", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);

    await expect(
      signInOperatorWithPassword({
        apiBaseUrl: "",
        email: "owner@store.com",
        password: "password123"
      })
    ).rejects.toThrow("Unable to reach backend.");

    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("throws a stable backend reachability error when fetch fails", async () => {
    const fetchSpy = vi.fn().mockRejectedValue(new TypeError("Failed to fetch"));
    vi.stubGlobal("fetch", fetchSpy);

    await expect(
      signInOperatorWithPassword({
        apiBaseUrl: "https://api.nomly.us",
        email: "owner@store.com",
        password: "password123"
      })
    ).rejects.toThrow("Unable to reach backend.");

    expect(fetchSpy).toHaveBeenCalledWith(
      "https://api.nomly.us/v1/operator/auth/sign-in",
      expect.objectContaining({
        method: "POST"
      })
    );
  });

  it("requests a signed upload then uploads the file to storage", async () => {
    const fetchSpy = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            uploadMethod: "PUT",
            uploadUrl: "https://uploads.example.com/menu/item-1",
            uploadHeaders: {
              "content-type": "image/png"
            },
            assetUrl: "https://media.example.com/menu/item-1.png",
            expiresAt: "2026-04-23T22:00:00.000Z"
          }),
          { status: 200 }
        )
      )
      .mockResolvedValueOnce(new Response(null, { status: 200 }));
    vi.stubGlobal("fetch", fetchSpy);

    const file = new File(["binary"], "item.png", { type: "image/png" });
    const assetUrl = await uploadOperatorMenuItemImage(
      {
        accessToken: "access-token",
        refreshToken: "refresh-token",
        apiBaseUrl: "https://api.nomly.us/v1",
        expiresAt: "2026-04-23T23:00:00.000Z",
        operator: {
          operatorUserId: "11111111-1111-4111-8111-111111111111",
          displayName: "Avery Quinn",
          email: "avery@store.com",
          role: "manager",
          locationId: "flagship-01",
          locationIds: ["flagship-01", "northside-01"],
          active: true,
          capabilities: ["menu:write"],
          createdAt: "2026-04-23T20:00:00.000Z",
          updatedAt: "2026-04-23T20:00:00.000Z"
        }
      },
      "flagship-01",
      "item-1",
      file
    );

    expect(assetUrl).toBe("https://media.example.com/menu/item-1.png");
    expect(fetchSpy).toHaveBeenNthCalledWith(
      1,
      "https://api.nomly.us/v1/admin/menu/item-1/image-upload?locationId=flagship-01",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          authorization: "Bearer access-token",
          "content-type": "application/json"
        })
      })
    );
    expect(fetchSpy).toHaveBeenNthCalledWith(
      2,
      "https://uploads.example.com/menu/item-1",
      expect.objectContaining({
        method: "PUT",
        headers: {
          "content-type": "image/png"
        },
        body: file
      })
    );
  });

  it("loads dashboard location metadata for every accessible operator location", async () => {
    const fetchSpy = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            brand: {
              brandId: "gazelle-default",
              brandName: "Gazelle Coffee",
              locationId: "flagship-01",
              locationName: "Flagship",
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
          { status: 200 }
        )
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            brand: {
              brandId: "gazelle-default",
              brandName: "Gazelle Coffee",
              locationId: "northside-01",
              locationName: "Northside",
              marketLabel: "Detroit, MI"
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
                merchantRef: "northside-01"
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
          { status: 200 }
        )
      );
    vi.stubGlobal("fetch", fetchSpy);

    const locations = await fetchDashboardLocations({
      accessToken: "access-token",
      refreshToken: "refresh-token",
      apiBaseUrl: "https://api.nomly.us/v1",
      expiresAt: "2026-04-23T23:00:00.000Z",
      operator: {
        operatorUserId: "11111111-1111-4111-8111-111111111111",
        displayName: "Avery Quinn",
        email: "avery@store.com",
        role: "manager",
        locationId: "flagship-01",
        locationIds: ["flagship-01", "northside-01"],
        active: true,
        capabilities: ["orders:read"],
        createdAt: "2026-04-23T20:00:00.000Z",
        updatedAt: "2026-04-23T20:00:00.000Z"
      }
    });

    expect(locations).toHaveLength(2);
    expect(locations.map((location) => location.locationId)).toEqual(["flagship-01", "northside-01"]);
    expect(fetchSpy).toHaveBeenNthCalledWith(
      1,
      "https://api.nomly.us/v1/app-config?locationId=flagship-01",
      expect.objectContaining({
        method: "GET"
      })
    );
    expect(fetchSpy).toHaveBeenNthCalledWith(
      2,
      "https://api.nomly.us/v1/app-config?locationId=northside-01",
      expect.objectContaining({
        method: "GET"
      })
    );
  });

  it("requires a specific location before updating order status", async () => {
    expect(() =>
      updateOperatorOrderStatus(
        {
          accessToken: "access-token",
          refreshToken: "refresh-token",
          apiBaseUrl: "https://api.nomly.us/v1",
          expiresAt: "2026-04-23T23:00:00.000Z",
          operator: {
            operatorUserId: "11111111-1111-4111-8111-111111111111",
            displayName: "Avery Quinn",
            email: "avery@store.com",
            role: "manager",
            locationId: "flagship-01",
            locationIds: ["flagship-01", "northside-01"],
            active: true,
            capabilities: ["orders:write"],
            createdAt: "2026-04-23T20:00:00.000Z",
            updatedAt: "2026-04-23T20:00:00.000Z"
          }
        },
        null,
        "order-1",
        { status: "READY" }
      )
    ).toThrow("Choose a specific location before managing store settings.");
  });
});
