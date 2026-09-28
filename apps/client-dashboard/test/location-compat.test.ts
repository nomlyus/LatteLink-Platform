import { afterEach, describe, expect, it, vi } from "vitest";
import type { DashboardLocation, OperatorSession } from "../src/api";

const localStorageValues = new Map<string, string>();

function mockLocalStorage() {
  vi.stubGlobal("window", {
    localStorage: {
      getItem: (key: string) => localStorageValues.get(key) ?? null,
      setItem: (key: string, value: string) => localStorageValues.set(key, value),
      removeItem: (key: string) => localStorageValues.delete(key)
    }
  });
}

const ownerSession = {
  apiBaseUrl: "https://api-dev.nomly.us/v1",
  accessToken: "access-token",
  refreshToken: "refresh-token",
  expiresAt: "2027-01-01T00:00:00.000Z",
  operator: {
    operatorUserId: "11111111-1111-4111-8111-111111111111",
    role: "owner",
    locationId: "location-a",
    locationIds: ["location-a", "location-b"],
    capabilities: ["menu:read", "menu:write"]
  }
} as unknown as OperatorSession;

const locations = [
  { locationId: "location-a" },
  { locationId: "location-b" }
] as DashboardLocation[];

describe("React location compatibility boundary", () => {
  afterEach(() => {
    localStorageValues.clear();
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it("restores a valid saved location and preserves All Locations as a distinct value", async () => {
    mockLocalStorage();
    const compatibility = await import("../src/features/location/location-compat");
    const { persistLocationSelection } = await import("../src/storage");

    persistLocationSelection(ownerSession.operator.operatorUserId, "location-b");
    expect(compatibility.resolveLocationSelection(ownerSession, locations)).toBe("location-b");
    persistLocationSelection(ownerSession.operator.operatorUserId, "all");
    expect(compatibility.resolveLocationSelection(ownerSession, locations)).toBe("all");
  });

  it("falls back from a stale or unauthorized selection using the existing all-or-assigned-location rule", async () => {
    mockLocalStorage();
    const { resolveLocationSelection } = await import("../src/features/location/location-compat");
    const oneLocation = [locations[0]!];
    const staleSession = {
      ...ownerSession,
      operator: { ...ownerSession.operator, locationIds: ["location-a"] }
    } as OperatorSession;

    expect(resolveLocationSelection(ownerSession, locations, "removed-location")).toBe("all");
    expect(resolveLocationSelection(staleSession, oneLocation, "location-b")).toBe("location-a");
  });

  it("keeps store operators pinned to their assigned location regardless of saved preference", async () => {
    mockLocalStorage();
    const { resolveLocationSelection } = await import("../src/features/location/location-compat");
    const storeSession = {
      ...ownerSession,
      operator: { ...ownerSession.operator, role: "store", locationIds: ["location-a"] }
    } as OperatorSession;

    expect(resolveLocationSelection(storeSession, locations, "all")).toBe("location-a");
    expect(resolveLocationSelection(storeSession, locations, "location-b")).toBe("location-a");
  });

  it("rejects an attempted location selection outside the loaded authorized locations", async () => {
    mockLocalStorage();
    const { initializeLocationContext, publishLocationContext, resolveLocationSelection, selectLocationInContext } = await import(
      "../src/features/location/location-compat"
    );

    initializeLocationContext(ownerSession);
    publishLocationContext(ownerSession, locations, "all");
    expect(selectLocationInContext(ownerSession, "location-b")).toBe(true);
    expect(resolveLocationSelection(ownerSession, locations)).toBe("location-b");
    expect(selectLocationInContext(ownerSession, "outside-scope")).toBe(false);
    expect(selectLocationInContext(ownerSession, "all")).toBe(true);
  });

  it("revalidates a same-operator React location snapshot when the session scope narrows", async () => {
    mockLocalStorage();
    const {
      getLocationContextSnapshot,
      initializeLocationContext,
      publishLocationContext
    } = await import("../src/features/location/location-compat");
    initializeLocationContext(ownerSession);
    publishLocationContext(ownerSession, locations, "location-b");
    const narrowedSession = {
      ...ownerSession,
      operator: { ...ownerSession.operator, locationIds: ["location-a"] }
    } as OperatorSession;

    const snapshot = initializeLocationContext(narrowedSession);

    expect(snapshot.selectedLocationId).toBe("location-a");
    expect(snapshot.availableLocations.map((location) => location.locationId)).toEqual(["location-a"]);
    expect(getLocationContextSnapshot()).toBe(snapshot);
  });
});
