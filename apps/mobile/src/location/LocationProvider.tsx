import { type MobileBrandBootstrap, type MobileBrandBootstrapLocation } from "@lattelink/contracts-catalog";
import { MobileBrandBootstrapError } from "@lattelink/sdk-mobile";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { MOBILE_API_ENVIRONMENT, isBackendReachabilityError, mobileBootstrapApiClient } from "../api/client";
import { useCart } from "../cart/store";
import { secureLocationPreferenceStore } from "./preference";
import {
  hasMultipleBootstrapLocations,
  resolveLocationSelectionAttempt,
  resolvePersistedLocationSelection,
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
  /** Active runtime location used by location-scoped requests and query keys. */
  selectedLocationId: string | null;
  selectedLocation: MobileBrandBootstrapLocation | null;
  hasMultipleLocations: boolean;
  isResolvingSelection: boolean;
  isReady: boolean;
  orderingEnabled: boolean;
  canSwitchLocations: boolean;
  isSwitchingLocation: boolean;
  isSwitchBlockedByCart: boolean;
  retryBootstrap: () => Promise<void>;
  selectLocation: (locationId: string) => Promise<LocationSelectionResult>;
};

const LocationContext = createContext<LocationContextValue | undefined>(undefined);

function selectionSignature(brandId: string, bootstrap: MobileBrandBootstrap) {
  const ids = bootstrap.locations.map((location) => location.locationId).sort();
  return `${brandId}:${bootstrap.status}:${bootstrap.primaryLocationId ?? ""}:${ids.join(",")}`;
}

export function LocationProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const { items } = useCart();
  const itemsRef = useRef(items);
  itemsRef.current = items;
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
  const [isSwitchingLocation, setIsSwitchingLocation] = useState(false);
  const switchInFlight = useRef(false);

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
  const hasMultipleLocations = bootstrap ? hasMultipleBootstrapLocations(bootstrap) : false;
  const isSwitchBlockedByCart = items.length > 0;

  const previousSelectedLocationRef = useRef<string | null>(null);
  useEffect(() => {
    const previousLocationId = previousSelectedLocationRef.current;
    previousSelectedLocationRef.current = selectedLocationId;
    if (!previousLocationId || !selectedLocationId || previousLocationId === selectedLocationId) return;

    const belongsToPreviousLocation = (queryKey: readonly unknown[]) =>
      (queryKey[0] === "catalog" && queryKey[2] === previousLocationId && queryKey[3] === brandId) ||
      (queryKey[0] === "account" && queryKey[1] === "loyalty" && queryKey[3] === previousLocationId && queryKey[4] === brandId);
    const queryFilter = { predicate: (query: { queryKey: readonly unknown[] }) => belongsToPreviousLocation(query.queryKey) };
    void queryClient.cancelQueries(queryFilter).then(() => queryClient.removeQueries(queryFilter));
  }, [brandId, queryClient, selectedLocationId]);

  const refetchBootstrap = bootstrapQuery.refetch;
  const retryBootstrap = useCallback(async () => {
    await refetchBootstrap();
  }, [refetchBootstrap]);

  const selectLocation = useCallback(
    async (locationId: string) => {
      if (switchInFlight.current) {
        return { ok: false, reason: "switch_in_progress" } as const;
      }
      const result = resolveLocationSelectionAttempt({
        locations,
        selectedLocationId,
        requestedLocationId: locationId,
        cartIsNonEmpty: itemsRef.current.length > 0
      });
      if (!result.ok || result.selectedLocationId === selectedLocationId) {
        return result;
      }

      switchInFlight.current = true;
      setIsSwitchingLocation(true);
      try {
        await secureLocationPreferenceStore.set(brandId, result.selectedLocationId);
        if (itemsRef.current.length > 0) {
          try {
            if (selectedLocationId) await secureLocationPreferenceStore.set(brandId, selectedLocationId);
          } catch {
            // The in-memory selection remains unchanged if storage rollback is unavailable.
          }
          return { ok: false, reason: "cart_not_empty" } as const;
        }

        setResolvedSelection({ signature, locationId: result.selectedLocationId });
        return result;
      } catch {
        return { ok: false, reason: "persistence_failed" } as const;
      } finally {
        switchInFlight.current = false;
        setIsSwitchingLocation(false);
      }
    },
    [brandId, locations, selectedLocationId, signature]
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
      hasMultipleLocations,
      isResolvingSelection,
      isReady,
      orderingEnabled: isReady && bootstrap?.status === "ready" && bootstrap.orderingEnabled,
      canSwitchLocations: hasMultipleLocations && !isSwitchBlockedByCart && !isSwitchingLocation,
      isSwitchingLocation,
      isSwitchBlockedByCart,
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
      isReady,
      isResolvingSelection,
      locations,
      primaryLocationId,
      retryBootstrap,
      selectLocation,
      hasMultipleLocations,
      selectedLocation,
      selectedLocationId,
      isSwitchingLocation,
      isSwitchBlockedByCart
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
