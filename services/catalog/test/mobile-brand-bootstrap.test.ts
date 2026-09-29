import { describe, expect, it } from "vitest";
import {
  buildMobileBrandBootstrap,
  isCustomerLocationLaunchable,
  MobileBrandBootstrapConfigurationError,
  type MobileBrandLocationMembership,
  type MobileBrandRecord
} from "../src/mobile-brand-bootstrap.js";
import { storeConfigResponseSchema } from "@lattelink/contracts-catalog";

const brand: MobileBrandRecord = {
  tenantId: "tenant-a",
  brandId: "brand-a",
  displayName: "Brand A"
};

const launchChecklistIds = [
  "owner_invited",
  "owner_activated",
  "business_profile_complete",
  "store_operations_complete",
  "app_identity_ready",
  "payments_connected",
  "menu_ready",
  "team_configured_or_skipped",
  "test_order_completed",
  "mobile_release_ready",
  "admin_launch_approved"
] as const;

function membership(locationId: string, primaryLocation: boolean): MobileBrandLocationMembership {
  return {
    tenantId: brand.tenantId,
    brandId: brand.brandId,
    locationId,
    locationName: `Location ${locationId}`,
    marketLabel: "Detroit, MI",
    timezone: "America/Detroit",
    primaryLocation
  };
}

function launchable(locationId: string) {
  return {
    brand,
    membership: membership(locationId, false),
    onboarding: {
      tenantId: brand.tenantId,
      brandId: brand.brandId,
      locationId,
      status: "live" as const,
      liveAt: "2026-09-01T10:00:00.000Z",
      checklist: launchChecklistIds.map((id) => ({
        id,
        label: id,
        status: "complete" as const,
        passed: true,
        required: true,
        manual: false
      }))
    },
    appConfig: {
      brand: {
        brandId: brand.brandId,
        brandName: brand.displayName,
        locationId,
        locationName: `Location ${locationId}`,
        marketLabel: "Detroit, MI"
      }
    },
    storeConfig: storeConfigResponseSchema.parse({
      locationId,
      hoursText: "Daily · 7:00 AM–6:00 PM",
      isOpen: true,
      nextOpenAt: null,
      prepEtaMinutes: 12,
      taxRateBasisPoints: 600,
      pickupInstructions: "Pickup at the counter."
    }),
    locationSummary: {
      brandId: brand.brandId,
      locationId,
      hours: "Daily · 7:00 AM–6:00 PM",
      taxRateBasisPoints: 600,
      capabilities: {
        menu: { source: "platform_managed" as const },
        operations: { fulfillmentMode: "staff" as const, liveOrderTrackingEnabled: true, dashboardEnabled: true },
        loyalty: { visible: true }
      }
    }
  };
}

describe("mobile brand bootstrap", () => {
  it("requires live onboarding, a passing launch checklist, and a matching internal location summary", () => {
    expect(isCustomerLocationLaunchable(launchable("a1"))).toBe(true);
    expect(isCustomerLocationLaunchable({ ...launchable("a1"), onboarding: undefined })).toBe(false);
    expect(isCustomerLocationLaunchable({ ...launchable("a1"), appConfig: undefined })).toBe(false);
    expect(isCustomerLocationLaunchable({ ...launchable("a1"), storeConfig: undefined })).toBe(false);
    expect(isCustomerLocationLaunchable({
      ...launchable("a1"),
      onboarding: { ...launchable("a1").onboarding, status: "approved" }
    })).toBe(false);
    expect(isCustomerLocationLaunchable({
      ...launchable("a1"),
      onboarding: {
        ...launchable("a1").onboarding,
        checklist: [{ ...launchable("a1").onboarding.checklist[0]!, passed: false }]
      }
    })).toBe(false);
    expect(isCustomerLocationLaunchable({
      ...launchable("a1"),
      onboarding: {
        ...launchable("a1").onboarding,
        checklist: launchable("a1").onboarding.checklist.slice(1)
      }
    })).toBe(false);
    expect(isCustomerLocationLaunchable({
      ...launchable("a1"),
      locationSummary: { ...launchable("a1").locationSummary, brandId: "brand-b" }
    })).toBe(false);
    expect(isCustomerLocationLaunchable({
      ...launchable("a1"),
      appConfig: { brand: { ...launchable("a1").appConfig.brand, brandId: "brand-b" } }
    })).toBe(false);
    expect(isCustomerLocationLaunchable({
      ...launchable("a1"),
      locationSummary: { ...launchable("a1").locationSummary, hours: " " }
    })).toBe(false);
    expect(isCustomerLocationLaunchable({
      ...launchable("a1"),
      locationSummary: {
        ...launchable("a1").locationSummary,
        capabilities: {
          ...launchable("a1").locationSummary.capabilities,
          operations: { ...launchable("a1").locationSummary.capabilities.operations, fulfillmentMode: "time_based" }
        }
      }
    })).toBe(false);
  });

  it("accepts valid zero or positive tax under the parsed store-config contract", () => {
    const ready = launchable("a1");
    const zeroTaxConfig = storeConfigResponseSchema.parse({ ...ready.storeConfig, taxRateBasisPoints: 0 });
    expect(isCustomerLocationLaunchable({
      ...ready,
      storeConfig: zeroTaxConfig,
      locationSummary: { ...ready.locationSummary, taxRateBasisPoints: 0 }
    })).toBe(true);
    expect(isCustomerLocationLaunchable(ready)).toBe(true);
    expect(() => storeConfigResponseSchema.parse({ ...ready.storeConfig, taxRateBasisPoints: -1 })).toThrow();
  });

  it("returns one launchable location and makes it primary by definition", () => {
    const result = buildMobileBrandBootstrap({
      brand,
      memberships: [membership("a1", false)],
      launchableLocationIds: new Set(["a1"])
    });

    expect(result).toMatchObject({ status: "ready", primaryLocationId: "a1", orderingEnabled: true });
    expect(result.locations.map(({ locationId }) => locationId)).toEqual(["a1"]);
  });

  it("returns only launchable memberships for a multi-location brand and honors its persisted primary", () => {
    const result = buildMobileBrandBootstrap({
      brand,
      memberships: [membership("a2", false), membership("a1", true), membership("a3", false)],
      launchableLocationIds: new Set(["a1", "a2"])
    });

    expect(result.status).toBe("ready");
    expect(result.primaryLocationId).toBe("a1");
    expect(result.locations.map(({ locationId }) => locationId)).toEqual(["a1", "a2"]);
  });

  it("returns typed unavailable data when there are no launchable locations", () => {
    expect(buildMobileBrandBootstrap({ brand, memberships: [membership("a1", true)], launchableLocationIds: new Set() }))
      .toMatchObject({ status: "unavailable", locations: [], primaryLocationId: null, orderingEnabled: false });
    expect(isCustomerLocationLaunchable({
      ...launchable("a1"),
      onboarding: { ...launchable("a1").onboarding, status: "blocked" }
    })).toBe(false);
  });

  it("fails closed for missing, duplicate, or non-launchable primary configuration", () => {
    const locations = [membership("a1", false), membership("a2", false)];
    const launchableIds = new Set(["a1", "a2"]);
    expect(() => buildMobileBrandBootstrap({ brand, memberships: locations, launchableLocationIds: launchableIds }))
      .toThrow(MobileBrandBootstrapConfigurationError);
    expect(() => buildMobileBrandBootstrap({
      brand,
      memberships: [membership("a1", true), membership("a2", true)],
      launchableLocationIds: launchableIds
    })).toThrow(MobileBrandBootstrapConfigurationError);
    expect(() => buildMobileBrandBootstrap({
      brand,
      memberships: [membership("a1", true), membership("a2", false), membership("a3", false)],
      launchableLocationIds: new Set(["a2", "a3"])
    })).toThrow(MobileBrandBootstrapConfigurationError);
  });

  it("rejects foreign tenant, brand, duplicate membership, and launchable IDs outside canonical membership", () => {
    expect(() => buildMobileBrandBootstrap({
      brand,
      memberships: [{ ...membership("b1", false), tenantId: "tenant-b", brandId: "brand-b" }],
      launchableLocationIds: new Set()
    })).toThrow(MobileBrandBootstrapConfigurationError);
    expect(() => buildMobileBrandBootstrap({
      brand,
      memberships: [membership("a1", false), membership("a1", false)],
      launchableLocationIds: new Set()
    })).toThrow(MobileBrandBootstrapConfigurationError);
    expect(() => buildMobileBrandBootstrap({
      brand,
      memberships: [membership("a1", false)],
      launchableLocationIds: new Set(["b1"])
    })).toThrow(MobileBrandBootstrapConfigurationError);
  });
});
