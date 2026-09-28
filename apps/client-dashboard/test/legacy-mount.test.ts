import { afterEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  initializing: true,
  section: "overview",
  session: null as unknown,
  orderDetailsClosingTimeoutHandle: null as ReturnType<typeof setTimeout> | null,
  orderDetailsOpen: false,
  orderDetailsOpening: false,
  orderDetailsClosing: false,
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
const clearPendingCancel = vi.hoisted(() => vi.fn());
const refreshOrderConnection = vi.hoisted(() => vi.fn());
const stopAutoRefresh = vi.hoisted(() => vi.fn());
const disposeNewOrderAlertRuntime = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
const resumeNewOrderSound = vi.hoisted(() => vi.fn());
const resetToastRuntime = vi.hoisted(() => vi.fn());
const persistSection = vi.hoisted(() => vi.fn());
const resetMenuDialog = vi.hoisted(() => vi.fn());
const resetMenuItemDetails = vi.hoisted(() => vi.fn());

vi.mock("../src/state", () => ({ state, setNotice, resetMenuDialog, resetMenuItemDetails }));
vi.mock("../src/render", () => ({ bindDashboardRoot, render }));
vi.mock("../src/events", () => ({ registerEvents }));
vi.mock("../src/controllers/auth", () => ({ handleGoogleCallback, handleOwnerInviteFromUrl, loadAuthProviders }));
vi.mock("../src/controllers/onboarding", () => ({ handleStripeOnboardingStart, handleStripeStatusRefresh }));
vi.mock("../src/lifecycle", () => ({ cancelDashboardLoad, loadDashboard }));
vi.mock("../src/orders-runtime", () => ({ clearPendingCancel, refreshOrderConnection, stopAutoRefresh }));
vi.mock("../src/order-alert", () => ({ disposeNewOrderAlertRuntime, resumeNewOrderSound }));
vi.mock("../src/toast-runtime", () => ({ resetToastRuntime }));
vi.mock("../src/storage", () => ({ persistSection }));
vi.mock("../src/legacy/browser-lifecycle", () => ({ registerLegacyBrowserLifecycle }));

describe("legacy React host mount lifecycle", () => {
  afterEach(() => {
    state.session = null;
    state.orderDetailsClosingTimeoutHandle = null;
    state.toasts = [];
    vi.clearAllMocks();
    vi.resetModules();
    vi.unstubAllGlobals();
  });

  it("deduplicates an active mount and disposes resources before a later remount", async () => {
    vi.stubGlobal("window", {
      location: { pathname: "/", search: "" },
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
    expect(resumeNewOrderSound).not.toHaveBeenCalled();
    doc.visibilityState = "visible";
    lifecycleHandlers?.visible();
    lifecycleHandlers?.online();
    lifecycleHandlers?.offline();
    expect(resumeNewOrderSound).toHaveBeenCalledTimes(1);
    expect(refreshOrderConnection).toHaveBeenCalledTimes(2);
    expect(render).toHaveBeenCalled();

    firstDispose();
    firstDispose();
    expect(cancelDashboardLoad).toHaveBeenCalledTimes(1);
    expect(stopAutoRefresh).toHaveBeenCalledTimes(1);
    expect(clearPendingCancel).toHaveBeenCalledTimes(1);
    expect(resetToastRuntime).toHaveBeenCalledTimes(1);

    const secondDispose = mountLegacyDashboard({} as HTMLDivElement);
    expect(registerEvents).toHaveBeenCalledTimes(2);
    expect(registerLegacyBrowserLifecycle).toHaveBeenCalledTimes(2);
    secondDispose();
  });
});
