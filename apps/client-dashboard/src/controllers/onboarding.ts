import { submitOperatorOnboardingReview, updateOperatorOnboarding } from "../api.js";
import { loadDashboard, handleOperatorActionError } from "../lifecycle.js";
import { render } from "../render.js";
import { setError, state } from "../state.js";

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
    state.updatingOnboarding = true;
    setError(null);
    render();
    const locationId = resolveOnboardingLocationId();
    state.onboardingSummary = await updateOperatorOnboarding(state.session, locationId, {
      [field]: true
    });
    await loadDashboard({ silent: true });
  } catch (error) {
    await handleOperatorActionError(error, "Unable to update setup progress.");
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
