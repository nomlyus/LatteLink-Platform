import { afterEach, describe, expect, it, vi } from "vitest";
import type { OperatorSession } from "../src/api";

const state = vi.hoisted(() => ({
  initializing: true,
  section: "overview",
  session: null as unknown,
  authApiBaseUrl: "",
  authEmail: "",
  authPassword: "",
  selectedLocationId: null as string | "all" | null,
  toasts: [] as unknown[]
}));
const setNotice = vi.hoisted(() => vi.fn());
const bindDashboardRoot = vi.hoisted(() => vi.fn());
const render = vi.hoisted(() => vi.fn());
const registerEvents = vi.hoisted(() => vi.fn(() => vi.fn()));
const registerLegacyBrowserLifecycle = vi.hoisted(() => vi.fn());
const handleGoogleCallback = vi.hoisted(() => vi.fn().mockResolvedValue(false));
const handleOwnerInviteFromUrl = vi.hoisted(() => vi.fn().mockResolvedValue(false));
const loadAuthProviders = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
const handleStripeOnboardingStart = vi.hoisted(() => vi.fn());
const handleStripeStatusRefresh = vi.hoisted(() => vi.fn());
const cancelDashboardLoad = vi.hoisted(() => vi.fn());
const loadDashboard = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
const resetToastRuntime = vi.hoisted(() => vi.fn());
const persistSection = vi.hoisted(() => vi.fn());
const loadStoredSession = vi.hoisted(() => vi.fn(() => null));
const loadStoredApiBaseUrl = vi.hoisted(() => vi.fn(() => "https://api-dev.nomly.us/v1"));
const loadStoredLocationSelection = vi.hoisted(() => vi.fn(() => null));
const resetDashboardData = vi.hoisted(() => vi.fn());

const storedOperatorSession: OperatorSession = {
  apiBaseUrl: "https://api-dev.nomly.us/v1",
  accessToken: "preserved-access-token",
  refreshToken: "preserved-refresh-token",
  expiresAt: "2099-01-01T00:00:00.000Z",
  operator: {
    operatorUserId: "11111111-1111-4111-8111-111111111111",
    displayName: "Owner",
    email: "owner@example.com",
    role: "owner",
    locationId: "location-a",
    locationIds: ["location-a", "location-b"],
    active: true,
    capabilities: ["orders:read", "menu:read"],
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z"
  }
};

vi.mock("../src/state", () => ({ state, setNotice, resetDashboardData }));
vi.mock("../src/render", () => ({ bindDashboardRoot, render }));
vi.mock("../src/events", () => ({ registerEvents }));
vi.mock("../src/controllers/auth", () => ({ handleGoogleCallback, handleOwnerInviteFromUrl, loadAuthProviders }));
vi.mock("../src/controllers/onboarding", () => ({ handleStripeOnboardingStart, handleStripeStatusRefresh }));
vi.mock("../src/lifecycle", () => ({ cancelDashboardLoad, loadDashboard }));
vi.mock("../src/toast-runtime", () => ({ resetToastRuntime }));
vi.mock("../src/storage", () => ({ persistSection, loadStoredSession, loadStoredApiBaseUrl, loadStoredLocationSelection }));
vi.mock("../src/legacy/browser-lifecycle", () => ({ registerLegacyBrowserLifecycle }));

describe("legacy React host mount lifecycle", () => {
  afterEach(() => {
    state.session = null;
    state.selectedLocationId = null;
    state.toasts = [];
    vi.clearAllMocks();
    vi.resetModules();
    vi.unstubAllGlobals();
  });

  it("deduplicates an active mount and disposes resources before a later remount", async () => {
    vi.stubGlobal("window", {
      location: { pathname: "/legacy/discounts", search: "" },
      history: { replaceState: vi.fn() }
    });
    const doc = { title: "Operator Dashboard", visibilityState: "hidden" };
    vi.stubGlobal("document", doc);
    const { mountLegacyDashboard } = await import("../src/main");
    const firstRoot = {} as HTMLDivElement;
    const firstDispose = mountLegacyDashboard(firstRoot);
    const duplicateDispose = mountLegacyDashboard(firstRoot);

    expect(duplicateDispose).toBe(firstDispose);
    expect(registerEvents).toHaveBeenCalledTimes(1);
    expect(registerLegacyBrowserLifecycle).toHaveBeenCalledTimes(1);
    const lifecycleHandlers = registerLegacyBrowserLifecycle.mock.calls[0]?.[1];
    lifecycleHandlers?.visible();
    expect(loadDashboard).not.toHaveBeenCalled();
    doc.visibilityState = "visible";
    lifecycleHandlers?.visible();
    lifecycleHandlers?.online();
    lifecycleHandlers?.offline();
    expect(loadDashboard).toHaveBeenCalledTimes(2);
    expect(render).toHaveBeenCalled();

    firstDispose();
    firstDispose();
    expect(cancelDashboardLoad).toHaveBeenCalledTimes(1);
    expect(resetToastRuntime).toHaveBeenCalledTimes(1);

    const secondDispose = mountLegacyDashboard({} as HTMLDivElement);
    expect(registerEvents).toHaveBeenCalledTimes(2);
    expect(registerLegacyBrowserLifecycle).toHaveBeenCalledTimes(2);
    secondDispose();
  });

  it("rehydrates the current session and authorized location preference when entering a legacy route", async () => {
    vi.stubGlobal("window", {
      location: { pathname: "/legacy/discounts", search: "" },
      history: { replaceState: vi.fn() }
    });
    vi.stubGlobal("document", { title: "Operator Dashboard", visibilityState: "visible" });
    loadStoredSession.mockReturnValueOnce(storedOperatorSession as never);
    const { mountLegacyDashboard } = await import("../src/main");

    const dispose = mountLegacyDashboard({} as HTMLDivElement, "discounts");

    expect(state.session).toBe(storedOperatorSession);
    expect(state.authApiBaseUrl).toBe(storedOperatorSession.apiBaseUrl);
    expect(state.authEmail).toBe("owner@example.com");
    expect(state.authPassword).toBe("");
    expect(state.selectedLocationId).toBe("all");
    expect(state.section).toBe("discounts");
    expect(persistSection).toHaveBeenCalledWith("discounts");
    expect(resetDashboardData).toHaveBeenCalledTimes(1);
    dispose();
  });

  it("sends store operators from the legacy host to React Orders and preserves the URL context", async () => {
    const replace = vi.fn();
    vi.stubGlobal("window", {
      location: { pathname: "/legacy/discounts", search: "?source=shortcut", hash: "#section", replace },
      history: { replaceState: vi.fn() }
    });
    vi.stubGlobal("document", { title: "Operator Dashboard", visibilityState: "visible" });
    loadStoredSession.mockReturnValueOnce({
      ...storedOperatorSession,
      operator: { ...storedOperatorSession.operator, role: "store" }
    } as never);
    const { mountLegacyDashboard } = await import("../src/main");

    const dispose = mountLegacyDashboard({} as HTMLDivElement, "discounts");

    expect(replace).toHaveBeenCalledWith("/orders?source=shortcut#section");
    expect(registerEvents).not.toHaveBeenCalled();
    dispose();
  });
});
