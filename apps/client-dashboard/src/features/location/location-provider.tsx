"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useSyncExternalStore, type ReactNode } from "react";
import { fetchDashboardLocations, type DashboardLocation } from "../../api";
import type { OperatorCapability } from "../../model";
import {
  clearLocationContext,
  getLocationContextSnapshot,
  initializeLocationContext,
  publishLocationContext,
  selectLocationInContext,
  subscribeToLocationContext
} from "./location-compat";
import { useDashboardSession } from "../auth/session-provider";

type DashboardLocationContextValue = {
  selectedLocationId: string | "all" | null;
  selectedLocation: DashboardLocation | null;
  availableLocations: readonly DashboardLocation[];
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

  useEffect(() => {
    if (session) initializeLocationContext(session);
    else clearLocationContext();
  }, [session]);

  const loadAvailableLocations = useCallback(async () => {
    const current = await refreshSession();
    if (!current) return [];
    const locations = await fetchDashboardLocations(current);
    publishLocationContext(current, locations);
    return locations;
  }, [refreshSession]);

  const selectLocation = useCallback((locationId: string | "all") => {
    return session ? selectLocationInContext(session, locationId) : false;
  }, [session]);

  const value = useMemo<DashboardLocationContextValue>(() => ({
    selectedLocationId: snapshot.selectedLocationId,
    selectedLocation: snapshot.availableLocations.find((location) => location.locationId === snapshot.selectedLocationId) ?? null,
    availableLocations: snapshot.availableLocations,
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
