import { setNotice, state, resetDashboardData } from "./state";
import { bindDashboardRoot, render } from "./render";
import { registerEvents } from "./events";
import { handleGoogleCallback, handleOwnerInviteFromUrl, loadAuthProviders } from "./controllers/auth";
import { handleStripeOnboardingStart, handleStripeStatusRefresh } from "./controllers/onboarding";
import { cancelDashboardLoad, loadDashboard } from "./lifecycle";
import { resetToastRuntime } from "./toast-runtime";
import { loadStoredApiBaseUrl, loadStoredSession, persistSection } from "./storage";
import { registerLegacyBrowserLifecycle } from "./legacy/browser-lifecycle";
import { stripStripeReturnParams, readStripeReturnParams } from "./lib/navigation/route-callbacks";
import { isStoreOperator, type DashboardSection } from "./model";
import { resolveLocationSelection } from "./features/location/location-compat";
import { getDashboardDestination } from "./lib/navigation/dashboard-navigation";

type LegacyRuntime = {
  root: HTMLDivElement;
  dispose: () => void;
};

let activeRuntime: LegacyRuntime | null = null;

function handleStripeReturnParams() {
  if (typeof window === "undefined") {
    return { returned: false, refreshRequested: false };
  }

  const { returned, refreshRequested } = readStripeReturnParams(window.location.search);
  if (!returned && !refreshRequested) {
    return { returned: false, refreshRequested: false };
  }

  setNotice(
    refreshRequested
      ? "Stripe requested a refreshed onboarding link."
      : "Returned from Stripe. Payment readiness will refresh from the latest account status."
  );
  window.history.replaceState(
    {},
    document.title,
    stripStripeReturnParams(window.location.pathname, window.location.search)
  );
  return { returned, refreshRequested };
}

function handleLaunchEntryParams() {
  if (typeof window === "undefined") {
    return;
  }

  const params = new URLSearchParams(window.location.search);
  const intent = params.get("intent")?.trim().toLowerCase();
  const start = params.get("start")?.trim().toLowerCase();
  if (intent !== "launch" && start !== "app") {
    return;
  }

  state.launchEntryIntent = true;
  setNotice("Sign in to create and launch your branded app.");
  params.delete("intent");
  params.delete("start");
  const nextSearch = params.toString();
  window.history.replaceState({}, document.title, `${window.location.pathname}${nextSearch ? `?${nextSearch}` : ""}`);
}

async function bootstrap(signal: AbortSignal) {
  if (signal.aborted) return;
  state.initializing = false;
  const stripeReturn = handleStripeReturnParams();
  handleLaunchEntryParams();

  const handledOwnerInvite = await handleOwnerInviteFromUrl();
  if (signal.aborted || handledOwnerInvite) return;

  render();
  void loadAuthProviders();

  const handledGoogleCallback = await handleGoogleCallback();
  if (signal.aborted || handledGoogleCallback) return;

  if (state.session) {
    await loadDashboard();
    if (signal.aborted) return;
    if (stripeReturn.refreshRequested) {
      await handleStripeOnboardingStart();
    } else if (stripeReturn.returned) {
      await handleStripeStatusRefresh();
    }
    return;
  }

  render();
}

export function mountLegacyDashboard(root: HTMLDivElement, initialSection?: DashboardSection) {
  if (activeRuntime?.root === root) return activeRuntime.dispose;
  activeRuntime?.dispose();

  const storedSession = loadStoredSession();
  if (initialSection && storedSession && isStoreOperator(storedSession.operator) && typeof window !== "undefined") {
    window.location.replace(`${getDashboardDestination("orders").href}${window.location.search}${window.location.hash}`);
    return () => undefined;
  }

  bindDashboardRoot(root);
  const sessionChanged = state.session?.operator.operatorUserId !== storedSession?.operator.operatorUserId ||
    state.session?.accessToken !== storedSession?.accessToken;
  state.session = storedSession;
  state.authApiBaseUrl = storedSession?.apiBaseUrl ?? loadStoredApiBaseUrl();
  state.authEmail = storedSession?.operator.email ?? "";
  state.authPassword = "";
  if (sessionChanged) resetDashboardData();
  state.selectedLocationId = storedSession ? resolveLocationSelection(storedSession, []) : null;
  if (initialSection) {
    state.section = initialSection;
    persistSection(initialSection);
  }

  const controller = new AbortController();
  const unregisterEvents = registerEvents(controller.signal);
  registerLegacyBrowserLifecycle(controller.signal, {
    online: () => {
      void loadDashboard({ silent: true });
      render();
    },
    offline: render,
    visible: () => {
      if (document.visibilityState === "visible") {
        void loadDashboard({ silent: true });
      }
    }
  });

  let disposed = false;
  const runtime: LegacyRuntime = {
    root,
    dispose: () => {
      if (disposed) return;
      disposed = true;
      controller.abort();
      unregisterEvents();
      cancelDashboardLoad();
      state.toasts = [];
      resetToastRuntime();
      bindDashboardRoot(null);
      if (activeRuntime === runtime) activeRuntime = null;
    }
  };
  activeRuntime = runtime;
  void bootstrap(controller.signal);
  return runtime.dispose;
}

export function setLegacyDashboardSection(section: DashboardSection) {
  if (state.section === section) return;
  state.section = section;
  persistSection(section);
  if (activeRuntime) render();
}
