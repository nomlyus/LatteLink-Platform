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

export type LocationSelectionResult =
  | { ok: true; selectedLocationId: string }
  | { ok: false; reason: "not_available" | "confirmation_required" | "persistence_failed" | "switch_in_progress" };

export function resolveLocationSelectionAttempt(input: {
  locations: readonly MobileBrandBootstrapLocation[];
  selectedLocationId: string | null;
  requestedLocationId: string;
  cartIsNonEmpty: boolean;
}): LocationSelectionResult {
  const isAvailable = input.locations.some((location) => location.locationId === input.requestedLocationId);
  if (!isAvailable) {
    return { ok: false, reason: "not_available" };
  }
  if (input.requestedLocationId === input.selectedLocationId) {
    return { ok: true, selectedLocationId: input.requestedLocationId };
  }
  if (input.cartIsNonEmpty) {
    return { ok: false, reason: "confirmation_required" };
  }
  return { ok: true, selectedLocationId: input.requestedLocationId };
}

export async function persistConfirmedLocationSwitch(input: {
  brandId: string;
  locations: readonly MobileBrandBootstrapLocation[];
  selectedLocationId: string | null;
  requestedLocationId: string;
  preferences: LocationPreferenceStore;
  clearCart: () => void;
  clearCheckoutState: () => void;
  commitSelection: (locationId: string) => void;
}): Promise<LocationSelectionResult> {
  const result = resolveLocationSelectionAttempt({
    locations: input.locations,
    selectedLocationId: input.selectedLocationId,
    requestedLocationId: input.requestedLocationId,
    cartIsNonEmpty: false
  });
  if (!result.ok || result.selectedLocationId === input.selectedLocationId) return result;

  try {
    await input.preferences.set(input.brandId, result.selectedLocationId);
  } catch {
    return { ok: false, reason: "persistence_failed" };
  }

  input.clearCart();
  input.clearCheckoutState();
  input.commitSelection(result.selectedLocationId);
  return result;
}

export function hasMultipleBootstrapLocations(bootstrap: MobileBrandBootstrap) {
  return bootstrap.status === "ready" && bootstrap.locations.length > 1;
}

export function canStartLocationSensitiveQueries(input: {
  bootstrapStatus: "loading" | "ready" | "unavailable" | "brand_not_found" | "error" | "configuration_error";
  isReady: boolean;
}) {
  return input.bootstrapStatus === "ready" && input.isReady;
}
