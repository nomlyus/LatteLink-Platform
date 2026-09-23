import { setNotice, state } from "./state";
import { render } from "./render";
import { registerEvents } from "./events";
import { handleGoogleCallback, handleOwnerInviteFromUrl, loadAuthProviders } from "./controllers/auth";
import { handleStripeOnboardingStart, handleStripeStatusRefresh } from "./controllers/onboarding";
import { loadDashboard } from "./lifecycle";
import { refreshOrderConnection } from "./orders-runtime";
import { resumeNewOrderSound } from "./order-alert";

function handleStripeReturnParams() {
  if (typeof window === "undefined") {
    return { returned: false, refreshRequested: false };
  }

  const params = new URLSearchParams(window.location.search);
  const returned = params.has("stripeReturn");
  const refreshed = params.has("stripeRefresh");
  if (!returned && !refreshed) {
    return { returned: false, refreshRequested: false };
  }

  setNotice(
    refreshed
      ? "Stripe requested a refreshed onboarding link."
      : "Returned from Stripe. Payment readiness will refresh from the latest account status."
  );
  params.delete("stripeReturn");
  params.delete("stripeRefresh");
  const nextSearch = params.toString();
  window.history.replaceState({}, document.title, `${window.location.pathname}${nextSearch ? `?${nextSearch}` : ""}`);
  return { returned, refreshRequested: refreshed };
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

async function bootstrap() {
  registerEvents();
  window.addEventListener("online", () => {
    refreshOrderConnection(loadDashboard);
    render();
  });
  window.addEventListener("offline", render);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") {
      void resumeNewOrderSound();
      refreshOrderConnection(loadDashboard);
    }
  });

  state.initializing = false;
  const stripeReturn = handleStripeReturnParams();
  handleLaunchEntryParams();

  const handledOwnerInvite = await handleOwnerInviteFromUrl();
  if (handledOwnerInvite) {
    return;
  }

  render();
  void loadAuthProviders();

  const handledGoogleCallback = await handleGoogleCallback();
  if (handledGoogleCallback) {
    return;
  }

  if (state.session) {
    await loadDashboard();
    if (stripeReturn.refreshRequested) {
      await handleStripeOnboardingStart();
    } else if (stripeReturn.returned) {
      await handleStripeStatusRefresh();
    }
    return;
  }

  render();
}

void bootstrap();
