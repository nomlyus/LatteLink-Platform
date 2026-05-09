import {
  createOperatorStripeDashboardLink,
  createOperatorStripeOnboardingLink,
  submitOperatorOnboardingReview,
  updateOperatorOnboarding,
  updateOperatorStoreConfig
} from "../api.js";
import { loadDashboard, handleOperatorActionError } from "../lifecycle.js";
import { countVisibleMenuItems, isOwnerOperator } from "../model.js";
import { render } from "../render.js";
import { addToast, setError, state } from "../state.js";
import { persistSection } from "../storage.js";

type OnboardingBooleanField =
  | "businessProfileComplete"
  | "storeOperationsComplete"
  | "menuReady"
  | "teamConfiguredOrSkipped"
  | "testOrderCompleted";

const onboardingBooleanFields = new Set<OnboardingBooleanField>([
  "businessProfileComplete",
  "storeOperationsComplete",
  "menuReady",
  "teamConfiguredOrSkipped",
  "testOrderCompleted"
]);

function resolveOnboardingLocationId() {
  if (!state.session || !state.selectedLocationId || state.selectedLocationId === "all") {
    throw new Error("Choose a specific location before updating setup progress.");
  }

  return state.selectedLocationId;
}

function requireOwnerPaymentsAccess() {
  if (!state.session || !isOwnerOperator(state.session.operator)) {
    throw new Error("Only owner accounts can connect payments.");
  }

  return state.session;
}

function buildStripeReturnUrls() {
  const origin = typeof window === "undefined" ? "http://localhost:5173" : window.location.origin;
  return {
    returnUrl: `${origin}/?stripeReturn=1`,
    refreshUrl: `${origin}/?stripeRefresh=1`
  };
}

export async function handleOnboardingStepSubmit(form: HTMLFormElement) {
  const field = form.dataset.onboardingField;
  if (!field || !onboardingBooleanFields.has(field as OnboardingBooleanField)) {
    setError("That setup step cannot be updated from the dashboard.");
    render();
    return;
  }

  if (!state.session) {
    setError("Sign in again before updating setup progress.");
    render();
    return;
  }

  try {
    if (field === "menuReady" && countVisibleMenuItems(state.menuCategories) === 0) {
      setError("Menu readiness requires at least one visible launch item.");
      render();
      return;
    }

    state.updatingOnboarding = true;
    setError(null);
    render();
    const locationId = resolveOnboardingLocationId();
    state.onboardingSummary = await updateOperatorOnboarding(state.session, locationId, {
      [field]: true
    });
    addToast("Updated setup progress.", "success");
    await loadDashboard({ silent: true });
  } catch (error) {
    await handleOperatorActionError(error, "Unable to update setup progress.");
  } finally {
    state.updatingOnboarding = false;
    render();
  }
}

export async function handleOnboardingBusinessProfileSubmit(form: HTMLFormElement) {
  if (!state.session || !state.storeConfig) {
    setError("Store configuration is not ready yet.");
    render();
    return;
  }

  const formData = new FormData(form);
  try {
    state.updatingOnboarding = true;
    setError(null);
    render();
    const locationId = resolveOnboardingLocationId();
    await updateOperatorStoreConfig(state.session, locationId, {
      storeName: formData.get("storeName"),
      locationName: formData.get("locationName"),
      hours: state.storeConfig.hours,
      pickupInstructions: state.storeConfig.pickupInstructions,
      taxRateBasisPoints: state.storeConfig.taxRateBasisPoints
    });
    state.onboardingSummary = await updateOperatorOnboarding(state.session, locationId, {
      businessProfileComplete: true
    });
    addToast("Saved business profile.", "success");
    await loadDashboard({ silent: true });
  } catch (error) {
    await handleOperatorActionError(error, "Unable to save business profile.");
  } finally {
    state.updatingOnboarding = false;
    render();
  }
}

export async function handleOnboardingStoreOperationsSubmit(form: HTMLFormElement) {
  if (!state.session || !state.storeConfig) {
    setError("Store configuration is not ready yet.");
    render();
    return;
  }

  const formData = new FormData(form);
  try {
    state.updatingOnboarding = true;
    setError(null);
    render();
    const locationId = resolveOnboardingLocationId();
    await updateOperatorStoreConfig(state.session, locationId, {
      storeName: state.storeConfig.storeName,
      locationName: state.storeConfig.locationName,
      hours: formData.get("hours"),
      pickupInstructions: formData.get("pickupInstructions"),
      taxRateBasisPoints: formData.get("taxRateBasisPoints")
    });
    state.onboardingSummary = await updateOperatorOnboarding(state.session, locationId, {
      storeOperationsComplete: true
    });
    addToast("Saved store operations.", "success");
    await loadDashboard({ silent: true });
  } catch (error) {
    await handleOperatorActionError(error, "Unable to save store operations.");
  } finally {
    state.updatingOnboarding = false;
    render();
  }
}

export async function handleOnboardingStoreBasicsSubmit(form: HTMLFormElement) {
  if (!state.session || !state.storeConfig) {
    setError("Store configuration is not ready yet.");
    render();
    return;
  }

  const formData = new FormData(form);
  try {
    state.updatingOnboarding = true;
    setError(null);
    render();
    const locationId = resolveOnboardingLocationId();
    await updateOperatorStoreConfig(state.session, locationId, {
      storeName: formData.get("storeName"),
      locationName: formData.get("locationName"),
      hours: formData.get("hours"),
      pickupInstructions: formData.get("pickupInstructions"),
      taxRateBasisPoints: state.storeConfig.taxRateBasisPoints
    });
    state.onboardingSummary = await updateOperatorOnboarding(state.session, locationId, {
      businessProfileComplete: true,
      storeOperationsComplete: true
    });
    state.onboardingWizardStep = 3;
    addToast("Saved store details.", "success");
    await loadDashboard({ silent: true });
  } catch (error) {
    await handleOperatorActionError(error, "Unable to save store details.");
  } finally {
    state.updatingOnboarding = false;
    render();
  }
}

export async function handleOnboardingReviewSubmit() {
  if (!state.session) {
    setError("Sign in again before submitting setup for review.");
    render();
    return;
  }

  try {
    state.updatingOnboarding = true;
    setError(null);
    render();
    const locationId = resolveOnboardingLocationId();
    state.onboardingSummary = await submitOperatorOnboardingReview(state.session, locationId);
    await loadDashboard({ silent: true });
  } catch (error) {
    await handleOperatorActionError(error, "Unable to submit setup for review.");
  } finally {
    state.updatingOnboarding = false;
    render();
  }
}

export async function handleStripeOnboardingStart() {
  try {
    const session = requireOwnerPaymentsAccess();
    const locationId = resolveOnboardingLocationId();
    state.updatingOnboarding = true;
    state.section = "store";
    state.onboardingWizardOpen = false;
    persistSection(state.section);
    setError(null);
    render();
    const link = await createOperatorStripeOnboardingLink(session, locationId, buildStripeReturnUrls());
    if (typeof window !== "undefined") {
      window.location.assign(link.url);
    }
  } catch (error) {
    await handleOperatorActionError(error, "Unable to start Stripe onboarding.");
  } finally {
    state.updatingOnboarding = false;
    render();
  }
}

export async function handleStripeDashboardOpen() {
  try {
    const session = requireOwnerPaymentsAccess();
    const locationId = resolveOnboardingLocationId();
    state.updatingOnboarding = true;
    state.section = "store";
    state.onboardingWizardOpen = false;
    persistSection(state.section);
    setError(null);
    render();
    const link = await createOperatorStripeDashboardLink(session, locationId);
    if (typeof window !== "undefined") {
      window.location.assign(link.url);
    }
  } catch (error) {
    await handleOperatorActionError(error, "Unable to open Stripe Express.");
  } finally {
    state.updatingOnboarding = false;
    render();
  }
}
