import type { DashboardLocation, OperatorSession } from "../../api";
import { isStoreOperator } from "../../model";
import { loadStoredLocationSelection, persistLocationSelection } from "../../storage";

export type LocationContextSnapshot = {
  operatorUserId: string | null;
  selectedLocationId: string | "all" | null;
  availableLocations: readonly DashboardLocation[];
  status: "idle" | "loading" | "ready" | "error";
  error: string | null;
};

const emptySnapshot: LocationContextSnapshot = {
  operatorUserId: null,
  selectedLocationId: null,
  availableLocations: [],
  status: "idle",
  error: null
};

let snapshot = emptySnapshot;
const listeners = new Set<() => void>();

function notify() {
  for (const listener of listeners) listener();
}

function accessibleLocationIds(session: OperatorSession) {
  const ids = session.operator.locationIds ?? [];
  return new Set(ids.length > 0 ? ids : [session.operator.locationId]);
}

export function defaultLocationSelection(session: OperatorSession, locations: readonly DashboardLocation[] = []): string | "all" | null {
  if (isStoreOperator(session.operator)) return session.operator.locationId;
  const accessible = accessibleLocationIds(session);
  const count = locations.length > 0
    ? locations.filter((location) => accessible.has(location.locationId)).length
    : accessible.size;
  if (count > 1) return "all";
  return accessible.has(session.operator.locationId) ? session.operator.locationId : [...accessible][0] ?? null;
}

export function resolveLocationSelection(
  session: OperatorSession,
  locations: readonly DashboardLocation[],
  preferred: string | "all" | null = loadStoredLocationSelection(session.operator.operatorUserId)
): string | "all" | null {
  const accessible = accessibleLocationIds(session);
  const available = new Set(
    (locations.length > 0 ? locations.map((location) => location.locationId) : [...accessible])
      .filter((id) => accessible.has(id))
  );
  if (isStoreOperator(session.operator)) {
    return session.operator.locationId;
  }

  if (preferred === "all" && available.size > 1) return "all";
  if (preferred && preferred !== "all" && available.has(preferred)) return preferred;

  if (available.size > 1) return "all";
  if (available.has(session.operator.locationId)) return session.operator.locationId;
  return [...available][0] ?? null;
}

export function initializeLocationContext(session: OperatorSession) {
  const sameOperator = snapshot.operatorUserId === session.operator.operatorUserId;
  if (sameOperator) {
    const accessible = accessibleLocationIds(session);
    const availableLocations = snapshot.availableLocations.filter((location) => accessible.has(location.locationId));
    const selectedLocationId = isStoreOperator(session.operator)
      ? session.operator.locationId
      : availableLocations.length > 0
        ? resolveLocationSelection(session, availableLocations, snapshot.selectedLocationId)
        : snapshot.selectedLocationId === "all" && accessible.size > 1
          ? "all"
          : snapshot.selectedLocationId && snapshot.selectedLocationId !== "all" && accessible.has(snapshot.selectedLocationId)
            ? snapshot.selectedLocationId
            : defaultLocationSelection(session);
    snapshot = { ...snapshot, operatorUserId: session.operator.operatorUserId, selectedLocationId, availableLocations, error: null };
    notify();
    return snapshot;
  }

  const storedSelection = loadStoredLocationSelection(session.operator.operatorUserId);
  const accessible = accessibleLocationIds(session);
  const selectedLocationId = isStoreOperator(session.operator)
    ? session.operator.locationId
    : storedSelection === "all" && accessible.size > 1
      ? "all"
      : storedSelection && storedSelection !== "all" && accessible.has(storedSelection)
        ? storedSelection
        : defaultLocationSelection(session);
  snapshot = {
    operatorUserId: session.operator.operatorUserId,
    selectedLocationId,
    availableLocations: [],
    status: "idle",
    error: null
  };
  notify();
  return snapshot;
}

export function publishLocationContext(
  session: OperatorSession,
  locations: readonly DashboardLocation[],
  requestedSelection?: string | "all" | null
) {
  const selectedLocationId = resolveLocationSelection(
    session,
    locations,
    requestedSelection ?? loadStoredLocationSelection(session.operator.operatorUserId)
  );
  if (selectedLocationId) persistLocationSelection(session.operator.operatorUserId, selectedLocationId);
  snapshot = {
    operatorUserId: session.operator.operatorUserId,
    selectedLocationId,
    availableLocations: [...locations],
    status: "ready",
    error: null
  };
  notify();
  return selectedLocationId;
}

export function markLocationContextLoading(session: OperatorSession) {
  if (snapshot.operatorUserId !== session.operator.operatorUserId) return;
  snapshot = { ...snapshot, status: "loading", error: null };
  notify();
}

export function markLocationContextError(session: OperatorSession, error: string) {
  if (snapshot.operatorUserId !== session.operator.operatorUserId) return;
  snapshot = { ...snapshot, status: "error", error };
  notify();
}

export function selectLocationInContext(session: OperatorSession, locationId: string | "all") {
  if (snapshot.operatorUserId !== session.operator.operatorUserId) return false;
  const selectedLocationId = resolveLocationSelection(session, snapshot.availableLocations, locationId);
  if (selectedLocationId !== locationId) return false;
  persistLocationSelection(session.operator.operatorUserId, locationId);
  snapshot = { ...snapshot, selectedLocationId: locationId };
  notify();
  return true;
}

export function clearLocationContext() {
  snapshot = emptySnapshot;
  notify();
}

export function subscribeToLocationContext(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getLocationContextSnapshot() {
  return snapshot;
}
