import { afterEach, describe, expect, it, vi } from "vitest";
import { updateOperatorStoreConfig } from "../src/features/settings/store-settings-api";
import type { OperatorSession } from "../src/api";

const session = {
  apiBaseUrl: "https://api-dev.nomly.us/v1",
  accessToken: "test-access-token"
} as OperatorSession;

const responseConfig = {
  locationId: "location-a",
  storeName: "Northside Coffee",
  locationName: "Downtown",
  timezone: "America/Detroit",
  hours: "Daily 8 AM - 4 PM",
  pickupInstructions: "Front counter",
  taxRateBasisPoints: 625,
  capabilities: {
    menu: { source: "platform_managed" },
    operations: { fulfillmentMode: "staff", liveOrderTrackingEnabled: true, dashboardEnabled: true },
    loyalty: { visible: true }
  }
};

describe("store settings API ownership", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("requires a specific location before making a mutation request", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    expect(() => updateOperatorStoreConfig(session, "all", {})).toThrow("Choose one location");
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("normalizes and persists through the existing location-scoped store config endpoint", async () => {
    const fetchSpy = vi.fn().mockResolvedValue(new Response(JSON.stringify(responseConfig), { status: 200 }));
    vi.stubGlobal("fetch", fetchSpy);

    await expect(updateOperatorStoreConfig(session, "location-a", {
      storeName: " Northside Coffee ",
      locationName: " Downtown ",
      hours: " Daily 8 AM - 4 PM ",
      pickupInstructions: " Front counter ",
      taxRateBasisPoints: "625"
    })).resolves.toEqual(responseConfig);

    expect(fetchSpy).toHaveBeenCalledWith(
      "https://api-dev.nomly.us/v1/admin/store/config?locationId=location-a",
      expect.objectContaining({
        method: "PUT",
        headers: { authorization: "Bearer test-access-token", "content-type": "application/json" },
        body: JSON.stringify({
          storeName: "Northside Coffee",
          locationName: "Downtown",
          hours: "Daily 8 AM - 4 PM",
          pickupInstructions: "Front counter",
          taxRateBasisPoints: 625
        })
      })
    );
  });
});
