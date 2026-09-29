import { afterEach, describe, expect, it, vi } from "vitest";
import type { OperatorSession } from "../src/api";

const storage = new Map<string, string>();

function mockLocalStorage(hostname = "localhost") {
  vi.stubGlobal("window", {
    location: { hostname },
    localStorage: {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => storage.set(key, value),
      removeItem: (key: string) => storage.delete(key)
    },
    addEventListener: vi.fn(),
    removeEventListener: vi.fn()
  });
}

const persistedSession: OperatorSession = {
  accessToken: "operator-access-token",
  refreshToken: "operator-refresh-token",
  apiBaseUrl: "https://api-dev.nomly.us/v1",
  expiresAt: "2026-09-28T12:00:00.000Z",
  operator: {
    operatorUserId: "11111111-1111-4111-8111-111111111111",
    displayName: "Dashboard Owner",
    email: "owner@example.com",
    role: "owner",
    locationId: "location-a",
    locationIds: ["location-a", "location-b"],
    active: true,
    capabilities: ["orders:read", "menu:read"],
    createdAt: "2026-09-28T12:00:00.000Z",
    updatedAt: "2026-09-28T12:00:00.000Z"
  }
};

describe("client dashboard storage", () => {
  afterEach(() => {
    storage.clear();
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("uses the configured API base URL when no stored override exists", async () => {
    vi.stubEnv("NEXT_PUBLIC_API_BASE_URL", "https://api-dev.nomly.us/v1");
    mockLocalStorage();

    const { loadStoredApiBaseUrl } = await import("../src/storage");

    expect(loadStoredApiBaseUrl()).toBe("https://api-dev.nomly.us/v1");
  });

  it("drops a stored API base URL from another deployed environment", async () => {
    vi.stubEnv("NEXT_PUBLIC_API_BASE_URL", "https://api-dev.nomly.us/v1");
    mockLocalStorage();
    storage.set("lattelink.operator.api-base-url.v2", "https://api.nomly.us/v1");

    const { loadStoredApiBaseUrl } = await import("../src/storage");

    expect(loadStoredApiBaseUrl()).toBe("https://api-dev.nomly.us/v1");
    expect(storage.has("lattelink.operator.api-base-url.v2")).toBe(false);
  });

  it("uses the dev API on the canonical dev dashboard when the build env is missing", async () => {
    vi.stubEnv("NEXT_PUBLIC_API_BASE_URL", "");
    mockLocalStorage("app-dev.nomly.us");

    const { loadStoredApiBaseUrl } = await import("../src/storage");

    expect(loadStoredApiBaseUrl()).toBe("https://api-dev.nomly.us/v1");
  });

  it("does not infer an API URL for other deployed hosts", async () => {
    vi.stubEnv("NEXT_PUBLIC_API_BASE_URL", "");
    mockLocalStorage("app.nomly.us");

    const { loadStoredApiBaseUrl } = await import("../src/storage");

    expect(loadStoredApiBaseUrl()).toBe("");
  });

  it("migrates the legacy setup section to settings", async () => {
    mockLocalStorage();
    storage.set("lattelink.operator.section.v2", "onboarding");

    const { loadStoredSection } = await import("../src/storage");

    expect(loadStoredSection()).toBe("store");
  });

  it("clears removed legacy sections and normalizes migrated Cards to Home", async () => {
    mockLocalStorage();
    const { loadStoredSection } = await import("../src/storage");

    storage.set("lattelink.operator.section.v2", "experience");
    expect(loadStoredSection()).toBe("overview");
    expect(storage.has("lattelink.operator.section.v2")).toBe(false);

    storage.set("lattelink.operator.section.v2", "discounts");
    expect(loadStoredSection()).toBe("overview");
    expect(storage.has("lattelink.operator.section.v2")).toBe(false);

    storage.set("lattelink.operator.section.v2", "cards");
    expect(loadStoredSection()).toBe("overview");
  });

  it("restores the persisted browser session with the same bearer and refresh tokens", async () => {
    mockLocalStorage();
    const { loadStoredSession, persistSession } = await import("../src/storage");

    persistSession(persistedSession);

    expect(loadStoredSession()).toEqual(persistedSession);
    expect(JSON.parse(storage.get("lattelink.operator.session.v2") ?? "{}")).toMatchObject({
      accessToken: "operator-access-token",
      refreshToken: "operator-refresh-token",
      apiBaseUrl: "https://api-dev.nomly.us/v1"
    });
  });

  it("keeps an expired but schema-valid session available for the existing refresh flow", async () => {
    mockLocalStorage();
    const expiredSession = { ...persistedSession, expiresAt: "2020-01-01T00:00:00.000Z" };
    const { loadStoredSession, persistSession } = await import("../src/storage");
    const { sessionNeedsRefresh } = await import("../src/model");

    persistSession(expiredSession);

    expect(loadStoredSession()).toEqual(expiredSession);
    expect(sessionNeedsRefresh(expiredSession.expiresAt)).toBe(true);
  });

  it("clears malformed session state without clearing the configured API or location preference", async () => {
    mockLocalStorage();
    storage.set("lattelink.operator.session.v2", "{not-json");
    storage.set("lattelink.operator.api-base-url.v2", "https://api-dev.nomly.us/v1");
    storage.set("lattelink.operator.location.v1.11111111-1111-4111-8111-111111111111", "location-b");
    const { loadStoredSession } = await import("../src/storage");

    expect(loadStoredSession()).toBeNull();
    expect(storage.has("lattelink.operator.session.v2")).toBe(false);
    expect(storage.get("lattelink.operator.api-base-url.v2")).toBe("https://api-dev.nomly.us/v1");
    expect(storage.get("lattelink.operator.location.v1.11111111-1111-4111-8111-111111111111")).toBe("location-b");
  });

  it("logout storage cleanup removes only the session token record", async () => {
    mockLocalStorage();
    storage.set("lattelink.operator.session.v2", JSON.stringify(persistedSession));
    storage.set("lattelink.operator.api-base-url.v2", persistedSession.apiBaseUrl);
    storage.set("lattelink.operator.location.v1.11111111-1111-4111-8111-111111111111", "all");
    const { clearStoredSession } = await import("../src/storage");

    clearStoredSession();

    expect(storage.has("lattelink.operator.session.v2")).toBe(false);
    expect(storage.get("lattelink.operator.api-base-url.v2")).toBe(persistedSession.apiBaseUrl);
    expect(storage.get("lattelink.operator.location.v1.11111111-1111-4111-8111-111111111111")).toBe("all");
  });

  it("notifies the React compatibility boundary when the legacy runtime restores, refreshes, or clears a session", async () => {
    mockLocalStorage();
    const { clearStoredSession, persistSession, subscribeToStoredSession } = await import("../src/storage");
    const changed = vi.fn();
    const unsubscribe = subscribeToStoredSession(changed);

    persistSession(persistedSession);
    clearStoredSession();
    expect(changed).toHaveBeenCalledTimes(2);

    unsubscribe();
    persistSession(persistedSession);
    expect(changed).toHaveBeenCalledTimes(2);
  });

  it("restores section-scoped location choice per operator, including distinct all-location state", async () => {
    mockLocalStorage();
    const { loadStoredLocationSelection, persistLocationSelection } = await import("../src/storage");
    const operatorId = persistedSession.operator.operatorUserId;

    persistLocationSelection(operatorId, "location-b");
    expect(loadStoredLocationSelection(operatorId)).toBe("location-b");
    persistLocationSelection(operatorId, "all");
    expect(loadStoredLocationSelection(operatorId)).toBe("all");
    expect(loadStoredLocationSelection("22222222-2222-4222-8222-222222222222")).toBeNull();
  });

  it("restores owner section and selected location through the legacy state bootstrap", async () => {
    mockLocalStorage();
    const { persistLocationSelection, persistSection, persistSession } = await import("../src/storage");
    persistSession(persistedSession);
    persistSection("menu");
    persistLocationSelection(persistedSession.operator.operatorUserId, "location-b");

    const { state } = await import("../src/state");

    expect(state.session).toEqual(persistedSession);
    expect(state.section).toBe("menu");
    expect(state.selectedLocationId).toBe("location-b");
  });

  it("keeps the store-operator Orders landing and assigned location regardless of saved dashboard scope", async () => {
    mockLocalStorage();
    const storeSession: OperatorSession = {
      ...persistedSession,
      operator: { ...persistedSession.operator, role: "store", locationIds: ["location-a"] }
    };
    const { persistLocationSelection, persistSection, persistSession } = await import("../src/storage");
    persistSession(storeSession);
    persistSection("menu");
    persistLocationSelection(storeSession.operator.operatorUserId, "all");

    const { state } = await import("../src/state");

    expect(state.section).toBe("orders");
    expect(state.selectedLocationId).toBe("location-a");
  });

  it("tracks whether the first onboarding wizard has already been shown for an operator location", async () => {
    mockLocalStorage();

    const { hasSeenOnboardingWizard, markOnboardingWizardSeen } = await import("../src/storage");

    expect(hasSeenOnboardingWizard("operator-1", "northside-01")).toBe(false);
    markOnboardingWizardSeen("operator-1", "northside-01");
    expect(hasSeenOnboardingWizard("operator-1", "northside-01")).toBe(true);
    expect(hasSeenOnboardingWizard("operator-1", "downtown-01")).toBe(false);
  });
});
