import { describe, expect, it } from "vitest";
import { getStoreSettingsScopeKey, normalizeStoreSettingsForm } from "../src/features/settings/store-settings-domain";

describe("store settings domain", () => {
  it("preserves the existing form normalization and basis-point bounds", () => {
    expect(normalizeStoreSettingsForm({
      storeName: "  Northside Coffee  ",
      locationName: "  Downtown  ",
      hours: "  Daily 8 AM - 4 PM  ",
      pickupInstructions: "  Front counter  ",
      taxRateBasisPoints: "625"
    })).toEqual({
      storeName: "Northside Coffee",
      locationName: "Downtown",
      hours: "Daily 8 AM - 4 PM",
      pickupInstructions: "Front counter",
      taxRateBasisPoints: 625
    });
    const requiredFields = { storeName: "Store", locationName: "Location", hours: "Daily 8 AM - 4 PM", pickupInstructions: "Front counter" };
    expect(normalizeStoreSettingsForm({ ...requiredFields, taxRateBasisPoints: 15_000 }).taxRateBasisPoints).toBe(10_000);
    expect(normalizeStoreSettingsForm({ ...requiredFields, taxRateBasisPoints: -10 }).taxRateBasisPoints).toBe(0);
  });

  it("keeps location and capability changes in distinct request scopes", () => {
    expect(getStoreSettingsScopeKey("operator-a", "location-a", ["store:write", "store:read"]))
      .toBe(getStoreSettingsScopeKey("operator-a", "location-a", ["store:read", "store:write"]));
    expect(getStoreSettingsScopeKey("operator-a", "all", ["store:read"]))
      .not.toBe(getStoreSettingsScopeKey("operator-a", "location-a", ["store:read"]));
    expect(getStoreSettingsScopeKey("operator-a", "location-a", ["store:read"]))
      .not.toBe(getStoreSettingsScopeKey("operator-b", "location-a", ["store:read"]));
    expect(getStoreSettingsScopeKey("operator-a", "location-a", ["store:read"], 1))
      .not.toBe(getStoreSettingsScopeKey("operator-a", "location-a", ["store:read"], 2));
  });
});
