"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useSyncExternalStore, type ReactNode } from "react";
import { fetchDashboardLocations, type DashboardLocation } from "../../api";
import type { OperatorCapability } from "../../model";
import {
  clearLocationContext,
  getLocationContextSnapshot,
  initializeLocationContext,
  markLocationContextError,
  markLocationContextLoading,
  publishLocationContext,
  selectLocationInContext,
  subscribeToLocationContext
} from "./location-compat";
import { useDashboardSession } from "../auth/session-provider";

type DashboardLocationContextValue = {
  selectedLocationId: string | "all" | null;
  selectedLocation: DashboardLocation | null;
  availableLocations: readonly DashboardLocation[];
  status: "idle" | "loading" | "ready" | "error";
  error: string | null;
  isAllLocations: boolean;
  isScopedToLocation: boolean;
  hasCapability: (capability: OperatorCapability) => boolean;
  loadAvailableLocations: () => Promise<readonly DashboardLocation[]>;
  selectLocation: (locationId: string | "all") => boolean;
};

const DashboardLocationContext = createContext<DashboardLocationContextValue | null>(null);
const emptySnapshot = getLocationContextSnapshot();

export function DashboardLocationProvider({ children }: { children: ReactNode }) {
  const { session, refreshSession } = useDashboardSession();
  const snapshot = useSyncExternalStore(subscribeToLocationContext, getLocationContextSnapshot, () => emptySnapshot);
  const activeOperatorUserId = session?.operator.operatorUserId ?? null;
  const activeOperatorUserIdRef = useRef(activeOperatorUserId);
  const inFlightRef = useRef<{ operatorUserId: string; promise: Promise<readonly DashboardLocation[]> } | null>(null);
  activeOperatorUserIdRef.current = activeOperatorUserId;

  useEffect(() => {
    if (session) initializeLocationContext(session);
    else clearLocationContext();
  }, [session]);

  const loadAvailableLocations = useCallback(async () => {
    if (!session) return [];
    const operatorUserId = session.operator.operatorUserId;
    const currentSnapshot = getLocationContextSnapshot();
    if (currentSnapshot.operatorUserId === operatorUserId && currentSnapshot.status === "ready") {
      return currentSnapshot.availableLocations;
    }
    if (inFlightRef.current?.operatorUserId === operatorUserId) return inFlightRef.current.promise;

    markLocationContextLoading(session);
    const request = { operatorUserId, promise: Promise.resolve([] as readonly DashboardLocation[]) };
    inFlightRef.current = request;
    request.promise = (async () => {
      try {
        const current = await refreshSession();
        if (!current || activeOperatorUserIdRef.current !== operatorUserId) return [];
        const locations = await fetchDashboardLocations(current);
        if (activeOperatorUserIdRef.current !== operatorUserId) return [];
        publishLocationContext(current, locations);
        return locations;
      } catch (error) {
        if (activeOperatorUserIdRef.current === operatorUserId) {
          markLocationContextError(
            session,
            error instanceof Error ? error.message : "Unable to load authorized locations."
          );
        }
        return [];
      } finally {
        if (inFlightRef.current === request) inFlightRef.current = null;
      }
    })();
    return request.promise;
  }, [refreshSession, session]);

  const selectLocation = useCallback((locationId: string | "all") => {
    return session ? selectLocationInContext(session, locationId) : false;
  }, [session]);

  const value = useMemo<DashboardLocationContextValue>(() => ({
    selectedLocationId: snapshot.selectedLocationId,
    selectedLocation: snapshot.availableLocations.find((location) => location.locationId === snapshot.selectedLocationId) ?? null,
    availableLocations: snapshot.availableLocations,
    status: snapshot.status,
    error: snapshot.error,
    isAllLocations: snapshot.selectedLocationId === "all",
    isScopedToLocation: Boolean(snapshot.selectedLocationId && snapshot.selectedLocationId !== "all"),
    hasCapability: (capability) => Boolean(session?.operator.capabilities.includes(capability)),
    loadAvailableLocations,
    selectLocation
  }), [snapshot, session, loadAvailableLocations, selectLocation]);

  return <DashboardLocationContext.Provider value={value}>{children}</DashboardLocationContext.Provider>;
}

export function useDashboardLocation() {
  const context = useContext(DashboardLocationContext);
  if (!context) throw new Error("useDashboardLocation must be used within DashboardLocationProvider.");
  return context;
}
