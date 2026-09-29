import { afterEach, describe, expect, it, vi } from "vitest";
import type { OperatorSession } from "../src/api";

const refreshOperatorSession = vi.hoisted(() => vi.fn());
const logoutOperatorSession = vi.hoisted(() => vi.fn());
const fetchDashboardLocations = vi.hoisted(() => vi.fn());
const fetchOperatorSnapshot = vi.hoisted(() => vi.fn());
const fetchOperatorOnboardingSummary = vi.hoisted(() => vi.fn());
vi.mock("../src/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../src/api")>()),
  refreshOperatorSession,
  logoutOperatorSession,
  fetchDashboardLocations,
  fetchOperatorSnapshot,
  fetchOperatorOnboardingSummary
}));
vi.mock("../src/render", () => ({ render: vi.fn() }));

const values = new Map<string, string>();
const session = {
  apiBaseUrl: "https://api-dev.nomly.us/v1",
  accessToken: "expired-access-token",
  refreshToken: "existing-refresh-token",
  expiresAt: "2020-01-01T00:00:00.000Z",
  operator: {
    operatorUserId: "11111111-1111-4111-8111-111111111111",
    displayName: "Operator",
    email: "operator@example.com",
    role: "manager",
    locationId: "location-a",
    locationIds: ["location-a"],
    active: true,
    capabilities: ["orders:read"],
    createdAt: "2020-01-01T00:00:00.000Z",
    updatedAt: "2020-01-01T00:00:00.000Z"
  }
} as OperatorSession;

function mockBrowserStorage(pathname = "/") {
  vi.stubGlobal("window", {
    location: { hostname: "localhost", pathname, search: "" },
    localStorage: {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
      removeItem: (key: string) => values.delete(key)
    }
  });
}

describe("existing dashboard session expiration behavior", () => {
  afterEach(() => {
    values.clear();
    vi.clearAllMocks();
    vi.resetModules();
    vi.unstubAllGlobals();
  });

  it("tries the existing refresh token and transitions to signed-out when refresh returns 401", async () => {
    mockBrowserStorage();
    refreshOperatorSession.mockRejectedValue(new (await import("../src/api")).ApiRequestError("Session expired", 401, {}));
    logoutOperatorSession.mockResolvedValue({ success: true });
    const { state } = await import("../src/state");
    const { persistSession } = await import("../src/storage");
    const { loadDashboard } = await import("../src/lifecycle");
    persistSession(session);
    state.session = session;

    await loadDashboard();

    expect(refreshOperatorSession).toHaveBeenCalledWith(session);
    expect(logoutOperatorSession).toHaveBeenCalledWith(session);
    expect(state.session).toBeNull();
    expect(values.has("lattelink.operator.session.v2")).toBe(false);
  });

  it("lands completed owner launch intents on Home instead of the removed editor", async () => {
    mockBrowserStorage();
    const ownerSession: OperatorSession = {
      ...session,
      expiresAt: "2099-01-01T00:00:00.000Z",
      operator: { ...session.operator, role: "owner", capabilities: ["store:read", "menu:read"] }
    };
    fetchDashboardLocations.mockResolvedValue([]);
    fetchOperatorSnapshot.mockResolvedValue({
      appConfig: null,
      menu: { locationId: "location-a", categories: [], modifierGroups: [] },
      storeConfig: null,
      mobileReleaseBuildJobs: { jobs: [] }
    });
    fetchOperatorOnboardingSummary.mockResolvedValue({ locationId: "location-a", status: "approved" });
    const { state } = await import("../src/state");
    const { persistSession } = await import("../src/storage");
    const { loadDashboard } = await import("../src/lifecycle");
    persistSession(ownerSession);
    state.session = ownerSession;
    state.selectedLocationId = "location-a";
    state.section = "store";
    state.launchEntryIntent = true;

    await loadDashboard();

    expect(state.section).toBe("overview");
    expect(state.launchEntryIntent).toBe(false);
    expect(state.notice).toBe("Your workspace is ready.");
    expect(values.get("lattelink.operator.section.v2")).toBe("overview");
  });

  it("keeps an owner on the onboarding compatibility route after a fresh sign-in", async () => {
    mockBrowserStorage("/legacy/onboarding");
    const ownerSession: OperatorSession = {
      ...session,
      expiresAt: "2099-01-01T00:00:00.000Z",
      operator: { ...session.operator, role: "owner", capabilities: ["store:read", "store:write"] }
    };
    fetchDashboardLocations.mockResolvedValue([]);
    fetchOperatorSnapshot.mockResolvedValue({
      appConfig: null,
      menu: { locationId: "location-a", categories: [], modifierGroups: [] },
      storeConfig: null,
      mobileReleaseBuildJobs: { jobs: [] }
    });
    fetchOperatorOnboardingSummary.mockResolvedValue({ locationId: "location-a", status: "in_progress" });
    const { state } = await import("../src/state");
    const { applyVerifiedSession } = await import("../src/lifecycle");

    await applyVerifiedSession(ownerSession, "");

    expect(state.section).toBe("store");
    expect(values.get("lattelink.operator.section.v2")).toBe("store");
  });
});
