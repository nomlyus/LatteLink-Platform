import { type MobileBrandBootstrap, type MobileBrandBootstrapLocation } from "@lattelink/contracts-catalog";
import { MobileBrandBootstrapError } from "@lattelink/sdk-mobile";
import { useQuery } from "@tanstack/react-query";
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { MOBILE_API_ENVIRONMENT, MOBILE_LOCATION_ID, isBackendReachabilityError, mobileBootstrapApiClient } from "../api/client";
import { secureLocationPreferenceStore } from "./preference";
import {
  hasMultipleBootstrapLocations,
  resolveLocationSelectionAttempt,
  resolvePersistedLocationSelection,
  resolveTransitionalCatalogLocationId,
  type LocationSelectionResult
} from "./model";

export type LocationBootstrapStatus = "loading" | "ready" | "unavailable" | "brand_not_found" | "error" | "configuration_error";
export type LocationBootstrapErrorKind = "brand_not_found" | "invalid_response" | "reachability" | "other" | null;

export type LocationContextValue = {
  brandId: string;
  bootstrapStatus: LocationBootstrapStatus;
  bootstrapErrorKind: LocationBootstrapErrorKind;
  locations: MobileBrandBootstrapLocation[];
  primaryLocationId: string | null;
  /** Customer's persisted/future selection; kept distinct from the Phase 2A fixed-client location. */
  selectedLocationId: string | null;
  selectedLocation: MobileBrandBootstrapLocation | null;
  /** Actual location used by legacy catalog clients until Phase 3 removes their fixed binding. */
  activeLocationId: string | null;
  activeLocation: MobileBrandBootstrapLocation | null;
  hasMultipleLocations: boolean;
  isResolvingSelection: boolean;
  isReady: boolean;
  orderingEnabled: boolean;
  canSwitchLocations: boolean;
  isCatalogLocationCompatible: boolean;
  locationCompatibilityError: string | null;
  retryBootstrap: () => Promise<void>;
  selectLocation: (locationId: string) => Promise<LocationSelectionResult>;
};

const LocationContext = createContext<LocationContextValue | undefined>(undefined);

function selectionSignature(brandId: string, bootstrap: MobileBrandBootstrap) {
  const ids = bootstrap.locations.map((location) => location.locationId).sort();
  return `${brandId}:${bootstrap.status}:${bootstrap.primaryLocationId ?? ""}:${ids.join(",")}`;
}

export function LocationProvider({ children }: { children: ReactNode }) {
  const brandId = MOBILE_API_ENVIRONMENT.brandId;
  const apiConfigurationError = MOBILE_API_ENVIRONMENT.apiConfigurationError;
  const bootstrapQuery = useQuery({
    queryKey: ["mobile", "brand-bootstrap", brandId],
    // Bootstrap is public discovery/configuration; future location-sensitive routes still require server membership validation.
    queryFn: () => mobileBootstrapApiClient.mobileBrandBootstrap(brandId),
    enabled: Boolean(brandId) && !apiConfigurationError,
    retry: false,
    staleTime: 5 * 60 * 1000
  });
  const bootstrap = bootstrapQuery.data;
  const signature = bootstrap ? selectionSignature(brandId, bootstrap) : "";
  const [resolvedSelection, setResolvedSelection] = useState<{
    signature: string;
    locationId: string | null;
  } | null>(null);

  useEffect(() => {
    let isCurrent = true;
    setResolvedSelection(null);
    if (!bootstrap) {
      return () => {
        isCurrent = false;
      };
    }

    void resolvePersistedLocationSelection(bootstrap, brandId, secureLocationPreferenceStore).then((locationId) => {
      if (isCurrent) {
        setResolvedSelection({ signature, locationId });
      }
    });
    return () => {
      isCurrent = false;
    };
  }, [bootstrap, brandId, signature]);

  const selectionIsResolved = Boolean(signature) && resolvedSelection?.signature === signature;
  const selectedLocationId = selectionIsResolved ? (resolvedSelection?.locationId ?? null) : null;
  const locations = bootstrap?.status === "ready" ? bootstrap.locations : [];
  const primaryLocationId = bootstrap?.status === "ready" ? bootstrap.primaryLocationId : null;
  const selectedLocation = locations.find((location) => location.locationId === selectedLocationId) ?? null;
  const activeLocationId = resolveTransitionalCatalogLocationId(locations, MOBILE_LOCATION_ID);
  const activeLocation = locations.find((location) => location.locationId === activeLocationId) ?? null;
  const bootstrapErrorKind: LocationBootstrapErrorKind =
    bootstrapQuery.error instanceof MobileBrandBootstrapError
      ? bootstrapQuery.error.kind
      : isBackendReachabilityError(bootstrapQuery.error)
        ? "reachability"
        : bootstrapQuery.error
          ? "other"
          : null;
  const bootstrapStatus: LocationBootstrapStatus = apiConfigurationError
    ? "configuration_error"
    : bootstrapQuery.isPending
      ? "loading"
      : bootstrapQuery.error
        ? bootstrapErrorKind === "brand_not_found"
          ? "brand_not_found"
          : "error"
        : (bootstrap?.status ?? "error");
  const isResolvingSelection = bootstrapStatus === "ready" && !selectionIsResolved;
  const isReady = bootstrapStatus === "ready" && selectionIsResolved && selectedLocationId !== null && selectedLocation !== null;
  const isCatalogLocationCompatible = isReady && activeLocationId !== null;
  const locationCompatibilityError = isCatalogLocationCompatible
    ? null
    : isReady || MOBILE_API_ENVIRONMENT.locationCompatibilityError
      ? "This app’s store configuration is unavailable. Please update the app or contact the app provider."
      : null;

  const refetchBootstrap = bootstrapQuery.refetch;
  const retryBootstrap = useCallback(async () => {
    await refetchBootstrap();
  }, [refetchBootstrap]);

  const selectLocation = useCallback(
    async (locationId: string) => {
      const result = resolveLocationSelectionAttempt({
        locations,
        selectedLocationId,
        requestedLocationId: locationId,
        switchingEnabled: false
      });
      if (!result.ok || result.selectedLocationId !== selectedLocationId) {
        return result;
      }
      await secureLocationPreferenceStore.set(brandId, result.selectedLocationId);
      return result;
    },
    [brandId, locations, selectedLocationId]
  );

  const value = useMemo<LocationContextValue>(
    () => ({
      brandId,
      bootstrapStatus,
      bootstrapErrorKind,
      locations,
      primaryLocationId,
      selectedLocationId,
      selectedLocation,
      activeLocationId,
      activeLocation,
      hasMultipleLocations: bootstrap ? hasMultipleBootstrapLocations(bootstrap) : false,
      isResolvingSelection,
      isReady,
      orderingEnabled: isCatalogLocationCompatible && bootstrap?.status === "ready" && bootstrap.orderingEnabled,
      canSwitchLocations: false,
      isCatalogLocationCompatible,
      locationCompatibilityError,
      retryBootstrap,
      selectLocation
    }),
    [
      brandId,
      bootstrap?.status,
      bootstrap?.status === "ready" ? bootstrap.orderingEnabled : false,
      bootstrap ? hasMultipleBootstrapLocations(bootstrap) : false,
      bootstrapErrorKind,
      bootstrapStatus,
      isCatalogLocationCompatible,
      isReady,
      isResolvingSelection,
      locationCompatibilityError,
      locations,
      primaryLocationId,
      retryBootstrap,
      selectLocation,
      activeLocation,
      activeLocationId,
      selectedLocation,
      selectedLocationId
    ]
  );

  return <LocationContext.Provider value={value}>{children}</LocationContext.Provider>;
}

export function useLocationContext() {
  const context = useContext(LocationContext);
  if (!context) {
    throw new Error("useLocationContext must be used inside LocationProvider.");
  }
  return context;
}
