import type { MobileBrandBootstrap, MobileBrandBootstrapLocation } from "@lattelink/contracts-catalog";

export type LocationPreferenceStore = {
  get: (brandId: string) => Promise<string | null>;
  set: (brandId: string, locationId: string) => Promise<void>;
  clear: (brandId: string) => Promise<void>;
};

export function locationPreferenceStorageKey(brandId: string) {
  return `nomly:selected-location:${brandId}`;
}

export function resolveSelectedLocationId(bootstrap: MobileBrandBootstrap, rememberedLocationId: string | null) {
  if (bootstrap.status !== "ready") {
    return null;
  }

  if (rememberedLocationId && bootstrap.locations.some((location) => location.locationId === rememberedLocationId)) {
    return rememberedLocationId;
  }

  return bootstrap.primaryLocationId;
}

export async function resolvePersistedLocationSelection(bootstrap: MobileBrandBootstrap, brandId: string, preferences: LocationPreferenceStore) {
  if (bootstrap.status !== "ready") {
    try {
      await preferences.clear(brandId);
    } catch {
      // A storage failure must not keep an unavailable location selected in memory.
    }
    return null;
  }

  let rememberedLocationId: string | null = null;
  try {
    rememberedLocationId = await preferences.get(brandId);
  } catch {
    // Use the server primary when local preference storage is unavailable.
  }

  const selectedLocationId = resolveSelectedLocationId(bootstrap, rememberedLocationId);
  if (selectedLocationId && selectedLocationId !== rememberedLocationId) {
    try {
      await preferences.set(brandId, selectedLocationId);
    } catch {
      // Keep the in-memory selection; persistence can be retried on a later launch.
    }
  }
  return selectedLocationId;
}

export type LocationSelectionResult = { ok: true; selectedLocationId: string } | { ok: false; reason: "not_available" | "switching_gated" };

export function resolveLocationSelectionAttempt(input: {
  locations: readonly MobileBrandBootstrapLocation[];
  selectedLocationId: string | null;
  requestedLocationId: string;
  switchingEnabled: boolean;
}): LocationSelectionResult {
  const isAvailable = input.locations.some((location) => location.locationId === input.requestedLocationId);
  if (!isAvailable) {
    return { ok: false, reason: "not_available" };
  }
  if (input.requestedLocationId === input.selectedLocationId) {
    return { ok: true, selectedLocationId: input.selectedLocationId };
  }
  if (!input.switchingEnabled) {
    return { ok: false, reason: "switching_gated" };
  }
  return { ok: true, selectedLocationId: input.requestedLocationId };
}

/**
 * Phase 2A compatibility only: existing catalog clients are pinned to the
 * compiled location, so that location may run only when bootstrap confirms it
 * is currently launchable for this brand. The saved selection remains separate.
 */
export function resolveTransitionalCatalogLocationId(
  locations: readonly MobileBrandBootstrapLocation[],
  compiledLocationId: string
) {
  if (!compiledLocationId.trim()) {
    return null;
  }

  return locations.some((location) => location.locationId === compiledLocationId) ? compiledLocationId : null;
}

export function hasMultipleBootstrapLocations(bootstrap: MobileBrandBootstrap) {
  return bootstrap.status === "ready" && bootstrap.locations.length > 1;
}

export function canStartLocationSensitiveQueries(input: {
  bootstrapStatus: "loading" | "ready" | "unavailable" | "brand_not_found" | "error" | "configuration_error";
  isReady: boolean;
  isCatalogLocationCompatible: boolean;
}) {
  return input.bootstrapStatus === "ready" && input.isReady && input.isCatalogLocationCompatible;
}
