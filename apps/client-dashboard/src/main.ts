import "./styles.css";
import "./sentry.js";
import { setNotice, state } from "./state.js";
import { render } from "./render.js";
import { registerEvents } from "./events.js";
import { handleGoogleCallback, handleOwnerInviteFromUrl, loadAuthProviders } from "./controllers/auth.js";
import { handleStripeOnboardingStart } from "./controllers/onboarding.js";
import { loadDashboard } from "./lifecycle.js";

function handleStripeReturnParams() {
  if (typeof window === "undefined") {
    return { refreshRequested: false };
  }

  const params = new URLSearchParams(window.location.search);
  const returned = params.has("stripeReturn");
  const refreshed = params.has("stripeRefresh");
  if (!returned && !refreshed) {
    return { refreshRequested: false };
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
  return { refreshRequested: refreshed };
}

async function bootstrap() {
  registerEvents();

  state.initializing = false;
  const stripeReturn = handleStripeReturnParams();

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
    }
    return;
  }

  render();
}

void bootstrap();
