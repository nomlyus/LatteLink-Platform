import { mobileBrandBootstrapSchema, type MobileBrandBootstrap } from "@lattelink/contracts-catalog";
import { describe, expect, it, vi } from "vitest";
import {
  canStartLocationSensitiveQueries,
  hasMultipleBootstrapLocations,
  locationPreferenceStorageKey,
  resolveLocationSelectionAttempt,
  resolvePersistedLocationSelection,
  resolveTransitionalCatalogLocationId
} from "../src/location/model";

function readyBootstrap(locationIds: string[], primaryLocationId = locationIds[0]): MobileBrandBootstrap {
  return mobileBrandBootstrapSchema.parse({
    schemaVersion: 1,
    status: "ready",
    brand: { brandId: "northside-coffee", displayName: "Northside Coffee" },
    locations: locationIds.map((locationId, index) => ({
      locationId,
      displayName: `Location ${index + 1}`,
      marketLabel: "Detroit, MI",
      timezone: "America/Detroit"
    })),
    primaryLocationId,
    orderingEnabled: true,
    compatibility: {}
  });
}

function unavailableBootstrap(): MobileBrandBootstrap {
  return mobileBrandBootstrapSchema.parse({
    schemaVersion: 1,
    status: "unavailable",
    brand: { brandId: "northside-coffee", displayName: "Northside Coffee" },
    locations: [],
    primaryLocationId: null,
    orderingEnabled: false,
    compatibility: {}
  });
}

function preferenceStore(initialValue: string | null) {
  let value = initialValue;
  return {
    get: vi.fn(async () => value),
    set: vi.fn(async (_brandId: string, next: string) => {
      value = next;
    }),
    clear: vi.fn(async () => {
      value = null;
    }),
    value: () => value
  };
}

describe("mobile location runtime model", () => {
  it("automatically resolves the only location and does not require a picker", async () => {
    const bootstrap = readyBootstrap(["northside-01"]);
    const preferences = preferenceStore(null);

    await expect(resolvePersistedLocationSelection(bootstrap, "northside-coffee", preferences)).resolves.toBe("northside-01");
    expect(hasMultipleBootstrapLocations(bootstrap)).toBe(false);
    expect(preferences.set).toHaveBeenCalledWith("northside-coffee", "northside-01");
  });

  it("restores a valid remembered location for multi-location brands", async () => {
    const bootstrap = readyBootstrap(["northside-01", "northside-02"]);
    const preferences = preferenceStore("northside-02");

    await expect(resolvePersistedLocationSelection(bootstrap, "northside-coffee", preferences)).resolves.toBe("northside-02");
    expect(hasMultipleBootstrapLocations(bootstrap)).toBe(true);
    expect(preferences.set).not.toHaveBeenCalled();
  });

  it("uses and persists the authoritative primary when there is no saved selection", async () => {
    const bootstrap = readyBootstrap(["northside-01", "northside-02"], "northside-02");
    const preferences = preferenceStore(null);

    await expect(resolvePersistedLocationSelection(bootstrap, "northside-coffee", preferences)).resolves.toBe("northside-02");
    expect(preferences.set).toHaveBeenCalledWith("northside-coffee", "northside-02");
  });

  it("rejects a removed remembered location and overwrites it with the current primary", async () => {
    const bootstrap = readyBootstrap(["northside-01", "northside-03"], "northside-01");
    const preferences = preferenceStore("northside-02");

    await expect(resolvePersistedLocationSelection(bootstrap, "northside-coffee", preferences)).resolves.toBe("northside-01");
    expect(preferences.value()).toBe("northside-01");
  });

  it("clears persisted selection and returns no location for unavailable brands", async () => {
    const preferences = preferenceStore("northside-02");

    await expect(resolvePersistedLocationSelection(unavailableBootstrap(), "northside-coffee", preferences)).resolves.toBeNull();
    expect(preferences.clear).toHaveBeenCalledWith("northside-coffee");
    expect(preferences.value()).toBeNull();
  });

  it("namespaces remembered selection by brand", () => {
    expect(locationPreferenceStorageKey("brand-a")).not.toBe(locationPreferenceStorageKey("brand-b"));
  });

  it("rejects locations absent from bootstrap and gates switching until the data layer is location-aware", () => {
    const locations = readyBootstrap(["northside-01", "northside-02"]).locations;
    expect(
      resolveLocationSelectionAttempt({
        locations,
        selectedLocationId: "northside-01",
        requestedLocationId: "other-brand-location",
        switchingEnabled: false
      })
    ).toEqual({ ok: false, reason: "not_available" });
    expect(
      resolveLocationSelectionAttempt({
        locations,
        selectedLocationId: "northside-01",
        requestedLocationId: "northside-02",
        switchingEnabled: false
      })
    ).toEqual({ ok: false, reason: "switching_gated" });
  });

  it("uses the compiled catalog location when bootstrap confirms it belongs to this brand", () => {
    const bootstrap = readyBootstrap(["northside-01"]);
    expect(resolveTransitionalCatalogLocationId(bootstrap.locations, "northside-01")).toBe("northside-01");
    expect(resolveTransitionalCatalogLocationId(bootstrap.locations, "")).toBeNull();
  });

  it("keeps a valid saved preference while legacy catalog clients use the compiled location", async () => {
    const bootstrap = readyBootstrap(["northside-01", "northside-02"]);
    const preferences = preferenceStore("northside-02");
    const preferredLocationId = await resolvePersistedLocationSelection(bootstrap, "northside-coffee", preferences);
    const activeLocationId = resolveTransitionalCatalogLocationId(bootstrap.locations, "northside-01");

    expect(preferredLocationId).toBe("northside-02");
    expect(activeLocationId).toBe("northside-01");
    expect(preferences.value()).toBe("northside-02");
    expect(preferences.set).not.toHaveBeenCalled();
    expect(canStartLocationSensitiveQueries({
      bootstrapStatus: "ready",
      isReady: true,
      isCatalogLocationCompatible: activeLocationId !== null
    })).toBe(true);
  });

  it("fails closed when the compiled location is not in the launchable bootstrap list", () => {
    const bootstrap = readyBootstrap(["northside-01", "northside-02"]);
    const activeLocationId = resolveTransitionalCatalogLocationId(bootstrap.locations, "northside-03");

    expect(activeLocationId).toBeNull();
    expect(canStartLocationSensitiveQueries({
      bootstrapStatus: "ready",
      isReady: true,
      isCatalogLocationCompatible: false
    })).toBe(false);
  });

  it("fails closed for a single-location brand if the compiled location differs", () => {
    const bootstrap = readyBootstrap(["northside-02"]);
    expect(hasMultipleBootstrapLocations(bootstrap)).toBe(false);
    expect(resolveTransitionalCatalogLocationId(bootstrap.locations, "northside-01")).toBeNull();
    expect(canStartLocationSensitiveQueries({
      bootstrapStatus: "ready",
      isReady: true,
      isCatalogLocationCompatible: false
    })).toBe(false);
  });

  it("does not substitute another location when the compiled location was removed", () => {
    const bootstrap = readyBootstrap(["northside-02"]);
    expect(resolveTransitionalCatalogLocationId(bootstrap.locations, "northside-01")).toBeNull();
    expect(resolveTransitionalCatalogLocationId(bootstrap.locations, "rawaqcoffee01")).toBeNull();
    expect(canStartLocationSensitiveQueries({
      bootstrapStatus: "ready",
      isReady: true,
      isCatalogLocationCompatible: false
    })).toBe(false);
  });

  it("does not start location-sensitive queries before bootstrap and location compatibility are ready", () => {
    for (const bootstrapStatus of ["loading", "unavailable", "brand_not_found", "error", "configuration_error"] as const) {
      expect(canStartLocationSensitiveQueries({
        bootstrapStatus,
        isReady: false,
        isCatalogLocationCompatible: false
      })).toBe(false);
    }
    expect(canStartLocationSensitiveQueries({
      bootstrapStatus: "ready",
      isReady: false,
      isCatalogLocationCompatible: false
    })).toBe(false);
    expect(canStartLocationSensitiveQueries({
      bootstrapStatus: "ready",
      isReady: true,
      isCatalogLocationCompatible: false
    })).toBe(false);
    expect(canStartLocationSensitiveQueries({
      bootstrapStatus: "ready",
      isReady: true,
      isCatalogLocationCompatible: true
    })).toBe(true);
  });
});
