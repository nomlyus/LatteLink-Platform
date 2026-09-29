import { root, render } from "./render";
import { setError, state } from "./state";
import { dismissToast } from "./toast-runtime";
import { persistSection } from "./storage";
import { selectLocationInContext } from "./features/location/location-compat";
import {
  getDashboardRouteOwner,
  isDashboardSection,
  navigateToDashboardSection,
  syncLegacySectionPath
} from "./lib/navigation/dashboard-navigation";
import { loadDashboard, signOut } from "./lifecycle";
import { getAvailableDashboardSections } from "./sections";
import {
  handleGoogleSignInStart,
  handleMerchantLaunchSubmit,
  handleOwnerInviteAccept,
  handlePasswordSignIn,
  showSignInScreen
} from "./controllers/auth";
import { handleDiscountCodeCreateSubmit, handleDiscountCodeSubmit } from "./controllers/discounts";
import { handleStoreSubmit } from "./controllers/store";
import { handleTeamCreateSubmit, handleTeamUserDelete, handleTeamUserSubmit } from "./controllers/team";
import {
  handleOnboardingAppIdentitySubmit,
  handleOnboardingBusinessProfileSubmit,
  handleOnboardingReviewSubmit,
  handleOnboardingStepSubmit,
  handleOnboardingStoreBasicsSubmit,
  handleOnboardingStoreOperationsSubmit,
  handleStripeDashboardOpen,
  handleStripeOnboardingStart,
  handleStripeStatusRefresh
} from "./controllers/onboarding";

function closeOpenAccountMenus(target?: Node) {
  root.querySelectorAll<HTMLDetailsElement>(".dash-account-menu[open]").forEach((menu) => {
    if (target && menu.contains(target)) return;
    menu.open = false;
  });
}

export function registerEvents(parentSignal?: AbortSignal) {
  const controller = parentSignal ? null : new AbortController();
  const signal = parentSignal ?? controller!.signal;

  document.addEventListener("click", (event) => {
    if (event.target instanceof Node) closeOpenAccountMenus(event.target);
  }, { signal });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") closeOpenAccountMenus();
  }, { signal });

  root.addEventListener("submit", (event) => {
    const form = event.target;
    if (!(form instanceof HTMLFormElement)) return;
    event.preventDefault();

    switch (form.dataset.form) {
      case "auth-sign-in": void handlePasswordSignIn(form); return;
      case "merchant-launch": void handleMerchantLaunchSubmit(form); return;
      case "owner-invite-accept": void handleOwnerInviteAccept(form); return;
      case "discount-code-create": void handleDiscountCodeCreateSubmit(form); return;
      case "discount-code": void handleDiscountCodeSubmit(form); return;
      case "store-config": void handleStoreSubmit(form); return;
      case "onboarding-step": void handleOnboardingStepSubmit(form); return;
      case "onboarding-business-profile": void handleOnboardingBusinessProfileSubmit(form); return;
      case "onboarding-store-operations": void handleOnboardingStoreOperationsSubmit(form); return;
      case "onboarding-store-basics": void handleOnboardingStoreBasicsSubmit(form); return;
      case "onboarding-app-identity": void handleOnboardingAppIdentitySubmit(form); return;
      case "team-create": void handleTeamCreateSubmit(form); return;
      case "team-user": void handleTeamUserSubmit(form); return;
    }
  }, { signal });

  root.addEventListener("change", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLSelectElement) || target.dataset.control !== "location-scope") return;

    const nextLocationId = target.value === "all" ? "all" : target.value || null;
    if (nextLocationId === state.selectedLocationId) return;
    if (!state.session || !nextLocationId || !selectLocationInContext(state.session, nextLocationId)) {
      setError("That location is no longer available for this operator session.");
      render();
      return;
    }

    state.selectedLocationId = nextLocationId;
    void loadDashboard();
  }, { signal });

  root.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    const actionElement = target.closest<HTMLElement>("[data-action]");
    if (!actionElement) return;
    const action = actionElement.dataset.action;

    if (action === "dismiss-toast") {
      if (actionElement.dataset.toastId) dismissToast(actionElement.dataset.toastId);
      render();
      return;
    }

    switch (action) {
      case "start-google-sign-in": void handleGoogleSignInStart(); return;
      case "show-sign-in": showSignInScreen(); return;
      case "sign-out": void signOut(); return;
      case "refresh": void loadDashboard(); return;
      case "return-to-onboarding":
        state.section = "store";
        state.onboardingWizardOpen = false;
        persistSection(state.section);
        render();
        return;
      case "close-onboarding-wizard":
        state.onboardingWizardOpen = false;
        render();
        return;
      case "open-onboarding-wizard":
        state.section = "store";
        state.onboardingWizardOpen = true;
        state.onboardingWizardStep = ["2", "3", "4", "5"].includes(actionElement.dataset.onboardingStep ?? "")
          ? Number(actionElement.dataset.onboardingStep) as 2 | 3 | 4 | 5
          : 1;
        persistSection(state.section);
        render();
        return;
      case "onboarding-wizard-next":
        state.onboardingWizardStep = Math.min(state.onboardingWizardStep + 1, 5) as 1 | 2 | 3 | 4 | 5;
        render();
        return;
      case "onboarding-wizard-prev":
        state.onboardingWizardStep = Math.max(state.onboardingWizardStep - 1, 1) as 1 | 2 | 3 | 4 | 5;
        render();
        return;
      case "submit-onboarding-review": void handleOnboardingReviewSubmit(); return;
      case "start-stripe-onboarding": void handleStripeOnboardingStart(); return;
      case "open-stripe-dashboard": void handleStripeDashboardOpen(); return;
      case "refresh-stripe-status": void handleStripeStatusRefresh(); return;
      case "delete-team-user":
        if (actionElement.dataset.operatorUserId) void handleTeamUserDelete(actionElement.dataset.operatorUserId);
        return;
    }

    if (action === "set-section") {
      const section = actionElement.dataset.section;
      if (!section || !isDashboardSection(section)) return;
      if (!getAvailableDashboardSections().includes(section)) {
        setError("That dashboard section is unavailable for this store or your current role.");
        render();
        return;
      }
      if (getDashboardRouteOwner(section) === "react") {
        navigateToDashboardSection(section);
        return;
      }
      state.section = section;
      persistSection(section);
      syncLegacySectionPath(section);
      render();
    }
  }, { signal });

  return () => controller?.abort();
}
