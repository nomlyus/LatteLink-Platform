import { setNotice, state, resetMenuDialog, resetMenuItemDetails } from "./state";
import { bindDashboardRoot, render } from "./render";
import { registerEvents } from "./events";
import { handleGoogleCallback, handleOwnerInviteFromUrl, loadAuthProviders } from "./controllers/auth";
import { handleStripeOnboardingStart, handleStripeStatusRefresh } from "./controllers/onboarding";
import { cancelDashboardLoad, loadDashboard } from "./lifecycle";
import { clearPendingCancel, refreshOrderConnection, stopAutoRefresh } from "./orders-runtime";
import { disposeNewOrderAlertRuntime, resumeNewOrderSound } from "./order-alert";
import { resetToastRuntime } from "./toast-runtime";
import { persistSection } from "./storage";
import { registerLegacyBrowserLifecycle } from "./legacy/browser-lifecycle";
import { stripStripeReturnParams, readStripeReturnParams } from "./lib/navigation/route-callbacks";
import type { DashboardSection } from "./model";

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

  bindDashboardRoot(root);
  if (initialSection) {
    state.section = initialSection;
    persistSection(initialSection);
  }

  const controller = new AbortController();
  const unregisterEvents = registerEvents(controller.signal);
  registerLegacyBrowserLifecycle(controller.signal, {
    online: () => {
      refreshOrderConnection(loadDashboard);
      render();
    },
    offline: render,
    visible: () => {
      if (document.visibilityState === "visible") {
        void resumeNewOrderSound();
        refreshOrderConnection(loadDashboard);
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
      stopAutoRefresh();
      clearPendingCancel();
      resetMenuDialog();
      resetMenuItemDetails();
      if (state.orderDetailsClosingTimeoutHandle !== null) {
        clearTimeout(state.orderDetailsClosingTimeoutHandle);
        state.orderDetailsClosingTimeoutHandle = null;
      }
      state.orderDetailsOpen = false;
      state.orderDetailsOpening = false;
      state.orderDetailsClosing = false;
      state.toasts = [];
      resetToastRuntime();
      void disposeNewOrderAlertRuntime();
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
