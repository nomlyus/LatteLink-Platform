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
