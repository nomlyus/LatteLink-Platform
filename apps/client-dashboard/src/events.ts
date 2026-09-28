import { root, render } from "./render";
import { resetMenuItemDetails, setError, state } from "./state";
import { addToast, dismissToast } from "./toast-runtime";
import { persistSection } from "./storage";
import { selectLocationInContext } from "./features/location/location-compat";
import { navigateToDashboardSection, getDashboardRouteOwner, syncLegacySectionPath } from "./lib/navigation/dashboard-navigation";
import {
  syncMenuCreateDraft,
  advanceMenuCreateWizard,
  retreatMenuCreateWizard,
  openMenuCreateWizard,
  resetMenuCreateWizard
} from "./menu-wizard";
import {
  updateCustomizationDraftFromInput,
  ensureMenuCustomizationDraft,
  createCustomizationGroupDraft,
  createCustomizationOptionDraft
} from "./customizations";
import {
  armPendingCancel,
  clearPendingCancel,
  selectOrder,
  startAutoRefresh,
  stopAutoRefresh
} from "./orders-runtime";
import { canCreateMenuItems } from "./model";
import { enableNewOrderSound } from "./order-alert";
import { loadDashboard, loadOwnerHomeReport, refreshOrdersOnly, signOut } from "./lifecycle";
import { getAvailableDashboardSections } from "./sections";
import {
  handleGoogleSignInStart,
  handleMerchantLaunchSubmit,
  handleOwnerInviteAccept,
  handlePasswordSignIn,
  showSignInScreen
} from "./controllers/auth";
import {
  handleMenuCreateSubmit,
  handleMenuQuickCreateSubmit,
  handleMenuCategoryCreateSubmit,
  handleMenuCategoryDelete,
  handleMenuCategoryItemReorder,
  handleMenuCategoryReorder,
  handleMenuCategorySubmit,
  handleMenuItemSubmit,
  handleMenuItemDelete,
  handleMenuAvailabilityToggle,
  handleMenuVisibilityToggle,
  handleModifierGroupDelete,
  handleModifierGroupSubmit
} from "./controllers/menu";
import { renderModifierAssignmentRow } from "./views/menu-items";
import { renderModifierOptionEditorRow } from "./views/menu-modifier-groups";
import {
  handleNewsCardCreateSubmit,
  handleNewsCardDelete,
  handleNewsCardSubmit,
  handleNewsCardVisibilityToggle
} from "./controllers/cards";
import { handleDiscountCodeCreateSubmit, handleDiscountCodeSubmit } from "./controllers/discounts";
import { handleStoreSubmit } from "./controllers/store";
import {
  handleMobileExperiencePublish,
  handleMobileExperienceRollback,
  handleMobileExperienceSectionMove,
  handleMobileExperienceSubmit
} from "./controllers/experience";
import { handleTeamCreateSubmit, handleTeamUserDelete, handleTeamUserSubmit } from "./controllers/team";
import { handleOrderAdvance, handleOrderCancel, handleOrderRefund } from "./controllers/orders";
import {
  handleOnboardingBusinessProfileSubmit,
  handleOnboardingAppIdentitySubmit,
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
    if (target && menu.contains(target)) {
      return;
    }
    menu.open = false;
  });
}

const orderDetailsAnimationMs = 420;
const menuItemDetailsAnimationMs = 360;
let menuDialogOpener: { action: string; keys: Record<string, string> } | null = null;

function openOrderDetails(orderId: string) {
  if (state.orderDetailsClosingTimeoutHandle !== null) {
    clearTimeout(state.orderDetailsClosingTimeoutHandle);
    state.orderDetailsClosingTimeoutHandle = null;
  }
  state.orderDetailsOpen = true;
  state.orderDetailsOpening = true;
  state.orderDetailsClosing = false;
  selectOrder(orderId);
  render();
  state.orderDetailsOpening = false;
}

function closeOrderDetails() {
  if (!state.orderDetailsOpen || !state.selectedOrderId || state.orderDetailsClosing) {
    return;
  }

  state.orderDetailsClosing = true;
  state.orderDetailsOpening = false;
  state.orderDetailsClosingTimeoutHandle = setTimeout(() => {
    state.orderDetailsClosingTimeoutHandle = null;
    state.orderDetailsOpen = false;
    state.orderDetailsClosing = false;
    selectOrder(null);
    render();
  }, orderDetailsAnimationMs);
  render();
}

function startMenuDialogEntrance() {
  const dialog = root.querySelector<HTMLElement>("[data-menu-dialog-root]");
  if (!dialog) return;
  const panel = dialog.querySelector<HTMLElement>('[role="dialog"]');
  panel?.querySelector<HTMLElement>("input:not([type=hidden]):not([type=file]):not([disabled]), button:not([disabled])")?.focus({ preventScroll: true });
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      state.menuDialogOpening = false;
      dialog.classList.remove("dash-menu-modal--opening");
    });
  });
}

function syncItemPrimaryCategory(form: HTMLFormElement) {
  const select = form.querySelector<HTMLSelectElement>('[data-control="item-primary-category"]');
  if (!select) return;
  const previousValue = select.value;
  const selected = [...form.querySelectorAll<HTMLInputElement>('input[name="categoryIds"]:checked')];
  select.replaceChildren(...selected.map((checkbox) => {
    const option = document.createElement("option");
    option.value = checkbox.value;
    option.textContent = checkbox.closest("label")?.querySelector("span")?.textContent?.trim() ?? checkbox.value;
    return option;
  }));
  if (selected.some((checkbox) => checkbox.value === previousValue)) select.value = previousValue;
  else if (selected[0]) select.value = selected[0].value;
}

function openMenuDialog(kind: NonNullable<typeof state.menuDialogKind>, entityId: string | null = null, opener?: HTMLElement) {
  if (opener?.dataset.action) {
    const keys = Object.fromEntries(Object.entries(opener.dataset).filter(([key, value]) => key !== "action" && value !== undefined)) as Record<string, string>;
    menuDialogOpener = { action: opener.dataset.action, keys };
  } else {
    menuDialogOpener = null;
  }
  resetMenuItemDetails();
  state.menuDialogKind = kind;
  state.menuDialogEntityId = entityId;
  state.menuDialogOpening = true;
  if (kind === "item") {
    state.selectedMenuItemId = entityId;
    state.menuItemDetailsOpen = true;
    state.menuItemDetailsOpening = true;
  }
  if (kind === "category" || kind === "create-category") state.menuCategoryItemSearch = "";
  setError(null);
  render();
  startMenuDialogEntrance();
}

function focusMenuDialogOpener() {
  const opener = menuDialogOpener;
  if (opener) {
    const candidate = [...root.querySelectorAll<HTMLElement>("[data-action]")].find((element) =>
      element.offsetParent !== null && element.dataset.action === opener.action &&
      Object.entries(opener.keys).every(([key, value]) => element.dataset[key] === value)
    );
    if (candidate) {
      candidate.focus({ preventScroll: true });
      menuDialogOpener = null;
      return;
    }
  }
  root.querySelector<HTMLElement>(`#menu-tab-${state.menuActiveTab}`)?.focus({ preventScroll: true });
  menuDialogOpener = null;
}

function closeNestedModifierGroupDialog() {
  const nested = root.querySelector<HTMLElement>("[data-menu-group-create-dialog]:not([hidden])");
  if (!nested) return false;
  nested.hidden = true;
  state.menuCreateModifierGroupForItemId = null;
  root.querySelector<HTMLElement>(".dash-menu-group-picker summary")?.focus({ preventScroll: true });
  return true;
}

function closeMenuDialog() {
  if (!state.menuDialogKind || state.menuDialogClosing) return;
  state.menuItemDetailsClosing = true;
  state.menuDialogClosing = true;
  state.menuDialogOpening = false;
  if (state.menuDialogClosingTimeoutHandle !== null) clearTimeout(state.menuDialogClosingTimeoutHandle);
  state.menuDialogClosingTimeoutHandle = setTimeout(() => {
    resetMenuItemDetails();
    render();
    focusMenuDialogOpener();
  }, menuItemDetailsAnimationMs);
  render();
}

function renderPreservingControl(control: HTMLElement) {
  const controlName = control.dataset.control;
  if (!controlName) return render();
  const start = control instanceof HTMLInputElement ? control.selectionStart : null;
  const end = control instanceof HTMLInputElement ? control.selectionEnd : null;
  render();
  const next = root.querySelector<HTMLElement>(`[data-control="${CSS.escape(controlName)}"]`);
  next?.focus({ preventScroll: true });
  if (next instanceof HTMLInputElement && start !== null && end !== null) {
    try { next.setSelectionRange(start, end); } catch { /* Search controls may not support text selection. */ }
  }
}

function refreshItemModifierAssignmentControls(list: HTMLElement) {
  const rows = [...list.querySelectorAll<HTMLElement>("[data-assignment-group-id]")];
  const canWrite = list.dataset.canWrite === "true";
  rows.forEach((row, index) => {
    const buttons = row.querySelectorAll<HTMLButtonElement>('[data-action="move-item-modifier-group"]');
    if (buttons[0]) buttons[0].disabled = !canWrite || index === 0;
    if (buttons[1]) buttons[1].disabled = !canWrite || index === rows.length - 1;
  });
}

function setModifierGroupPickerAssignment(form: HTMLFormElement, itemId: string, groupId: string, assigned: boolean) {
  const options = form.querySelector<HTMLElement>(".dash-menu-group-picker__options");
  if (!options) return;
  let option = options.querySelector<HTMLElement>(`[data-modifier-group-id="${CSS.escape(groupId)}"]`);
  const group = state.menuModifierGroups.find((candidate) => candidate.id === groupId);
  if (!group) return;
  if (!option) {
    options.querySelector(".dash-menu-empty-inline")?.remove();
    option = document.createElement("div");
    option.className = "dash-menu-group-picker__option";
    option.dataset.modifierGroupId = group.id;
    option.dataset.groupSearch = `${group.label} ${group.selectionType}`.toLocaleLowerCase();
    const copy = document.createElement("span");
    const name = document.createElement("strong");
    name.textContent = group.label;
    const description = document.createElement("small");
    description.textContent = `${group.selectionType === "multiple" ? "Multiple" : "Single"}${group.required ? " · Required" : " · Optional"}`;
    copy.append(name, description);
    const button = document.createElement("button");
    button.className = "button button--ghost";
    button.type = "button";
    button.dataset.action = "add-item-modifier-group";
    button.dataset.itemId = itemId;
    button.dataset.modifierGroupId = group.id;
    option.append(copy, button);
    options.append(option);
  }
  const button = option.querySelector<HTMLButtonElement>("button[data-action=add-item-modifier-group]");
  if (button) {
    button.disabled = assigned;
    button.textContent = assigned ? "Added" : "Add";
  }
  option.hidden = !option.dataset.groupSearch?.includes(form.querySelector<HTMLInputElement>('[data-control="item-modifier-search"]')?.value.trim().toLocaleLowerCase() ?? "");
}

function refreshModifierOptionControls(list: HTMLElement) {
  const rows = [...list.querySelectorAll<HTMLElement>("[data-modifier-option-row]")];
  rows.forEach((row, index) => {
    const sortOrder = row.querySelector<HTMLInputElement>('[name="optionSortOrder"]');
    if (sortOrder) sortOrder.value = String(index);
    const buttons = row.querySelectorAll<HTMLButtonElement>('[data-action="move-modifier-option"]');
    if (buttons[0]) buttons[0].disabled = index === 0;
    if (buttons[1]) buttons[1].disabled = index === rows.length - 1;
    const remove = row.querySelector<HTMLButtonElement>('[data-action="remove-modifier-option"]');
    if (remove) remove.disabled = rows.length === 1;
  });
}

function focusTrapKeydown(event: KeyboardEvent) {
  const nested = root.querySelector<HTMLElement>("[data-menu-group-create-dialog]:not([hidden])");
  const panel = nested?.querySelector<HTMLElement>('[role="dialog"]') ?? root.querySelector<HTMLElement>("[data-menu-dialog-root] [role=dialog]");
  if (!panel || event.key !== "Tab") return;
  const focusable = [...panel.querySelectorAll<HTMLElement>('a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])')]
    .filter((element) => element.offsetParent !== null);
  if (focusable.length === 0) {
    event.preventDefault();
    panel.focus();
    return;
  }
  const first = focusable[0]!;
  const last = focusable[focusable.length - 1]!;
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}

export function registerEvents(parentSignal?: AbortSignal) {
  const controller = parentSignal ? null : new AbortController();
  const signal = parentSignal ?? controller!.signal;

  document.addEventListener("click", (event) => {
    if (event.target instanceof Node) {
      closeOpenAccountMenus(event.target);
    }
  }, { signal });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      if (state.orderDetailsOpen && state.selectedOrderId) {
        closeOrderDetails();
      }
      if (!closeNestedModifierGroupDialog() && state.menuDialogKind) {
        closeMenuDialog();
      } else if (!state.menuDialogKind && state.menuItemDetailsOpen && state.selectedMenuItemId) {
        closeMenuDialog();
      }
      closeOpenAccountMenus();
      return;
    }
    focusTrapKeydown(event);
  }, { signal });

  root.addEventListener("keydown", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
    if (target.matches('[role="tab"]') && (event.key === "ArrowLeft" || event.key === "ArrowRight" || event.key === "Home" || event.key === "End")) {
      event.preventDefault();
      const tabIds = ["items", "categories", "modifier-groups"] as const;
      const currentIndex = tabIds.indexOf(state.menuActiveTab);
      const nextIndex = event.key === "Home" ? 0 : event.key === "End" ? tabIds.length - 1 : (currentIndex + (event.key === "ArrowRight" ? 1 : -1) + tabIds.length) % tabIds.length;
      state.menuActiveTab = tabIds[nextIndex]!;
      render();
      root.querySelector<HTMLElement>(`#menu-tab-${state.menuActiveTab}`)?.focus({ preventScroll: true });
      return;
    }
    if (target.matches("tr[data-menu-item-row]") && (event.key === "Enter" || event.key === " ")) {
      event.preventDefault();
      const itemId = target.dataset.menuItemRow;
      if (itemId) openMenuDialog("item", itemId, target);
    }
  }, { signal });

  root.addEventListener("submit", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLFormElement)) {
      return;
    }
    event.preventDefault();
    const formType = target.dataset.form;
    switch (formType) {
      case "auth-sign-in":
        void handlePasswordSignIn(target);
        return;
      case "merchant-launch":
        void handleMerchantLaunchSubmit(target);
        return;
      case "owner-invite-accept":
        void handleOwnerInviteAccept(target);
        return;
      case "menu-create":
        void handleMenuCreateSubmit(target);
        return;
      case "menu-item":
        void handleMenuItemSubmit(target);
        return;
      case "menu-item-create-quick":
        void handleMenuQuickCreateSubmit(target);
        return;
      case "menu-category-create":
        void handleMenuCategoryCreateSubmit(target);
        return;
      case "menu-category":
        void handleMenuCategorySubmit(target);
        return;
      case "modifier-group":
        void handleModifierGroupSubmit(target);
        return;
      case "news-card-create":
        void handleNewsCardCreateSubmit(target);
        return;
      case "news-card":
        void handleNewsCardSubmit(target);
        return;
      case "discount-code-create":
        void handleDiscountCodeCreateSubmit(target);
        return;
      case "discount-code":
        void handleDiscountCodeSubmit(target);
        return;
      case "store-config":
        void handleStoreSubmit(target);
        return;
      case "mobile-experience":
        void handleMobileExperienceSubmit(target);
        return;
      case "onboarding-step":
        void handleOnboardingStepSubmit(target);
        return;
      case "onboarding-business-profile":
        void handleOnboardingBusinessProfileSubmit(target);
        return;
      case "onboarding-store-operations":
        void handleOnboardingStoreOperationsSubmit(target);
        return;
      case "onboarding-store-basics":
        void handleOnboardingStoreBasicsSubmit(target);
        return;
      case "onboarding-app-identity":
        void handleOnboardingAppIdentitySubmit(target);
        return;
      case "team-create":
        void handleTeamCreateSubmit(target);
        return;
      case "team-user":
        void handleTeamUserSubmit(target);
        return;
      case "cancel-order": {
        const orderId = target.dataset.orderId;
        const reason = String(new FormData(target).get("reason") ?? "");
        if (orderId) {
          void handleOrderCancel(orderId, reason);
        }
        return;
      }
    }
  }, { signal });

  root.addEventListener("input", (event) => {
    syncMenuCreateDraft(event.target);
    updateCustomizationDraftFromInput(event.target);
    const target = event.target;
    if (!(target instanceof HTMLInputElement)) return;
    if (target.dataset.control === "menu-search") {
      state.menuSearch = target.value;
      state.menuItemsPage = 1;
      renderPreservingControl(target);
      return;
    }
    if (target.dataset.control === "modifier-group-search") {
      state.menuModifierGroupSearch = target.value;
      renderPreservingControl(target);
      return;
    }
    if (target.dataset.control === "item-modifier-search") {
      const query = target.value.trim().toLocaleLowerCase();
      target.closest(".dash-menu-group-picker__body")?.querySelectorAll<HTMLElement>(".dash-menu-group-picker__option").forEach((option) => {
        option.hidden = !option.dataset.groupSearch?.includes(query);
      });
      return;
    }
    if (target.dataset.control === "category-item-search") {
      state.menuCategoryItemSearch = target.value;
      const query = target.value.trim().toLocaleLowerCase();
      target.closest("form")?.querySelectorAll<HTMLElement>("[data-category-item-row]").forEach((row) => {
        row.hidden = !row.dataset.itemName?.includes(query);
      });
    }
  }, { signal });

  root.addEventListener("change", (event) => {
    syncMenuCreateDraft(event.target);
    updateCustomizationDraftFromInput(event.target);

    const target = event.target;
    if (target instanceof HTMLInputElement && target.name === "categoryIds") {
      const form = target.closest<HTMLFormElement>('form[data-form="menu-item"]');
      if (form) syncItemPrimaryCategory(form);
      return;
    }
    if (target instanceof HTMLSelectElement && target.dataset.control === "location-scope") {
      const nextLocationId = target.value === "all" ? "all" : target.value || null;
      if (nextLocationId === state.selectedLocationId) {
        return;
      }

      if (!state.session || !nextLocationId || !selectLocationInContext(state.session, nextLocationId)) {
        setError("That location is no longer available for this operator session.");
        render();
        return;
      }

      state.selectedLocationId = nextLocationId;
      state.ordersPage = 1;
      state.menuItemsPage = 1;
      resetMenuItemDetails();
      stopAutoRefresh();
      clearPendingCancel();
      void loadDashboard();
      return;
    }

    if (!(target instanceof HTMLSelectElement)) return;
    if (target.dataset.control === "menu-category-filter") {
      state.menuCategoryFilter = target.value;
      state.menuItemsPage = 1;
      renderPreservingControl(target);
    } else if (target.dataset.control === "menu-availability-filter") {
      state.menuAvailabilityFilter = target.value as typeof state.menuAvailabilityFilter;
      state.menuItemsPage = 1;
      renderPreservingControl(target);
    } else if (target.dataset.control === "menu-visibility-filter") {
      state.menuVisibilityFilter = target.value as typeof state.menuVisibilityFilter;
      state.menuItemsPage = 1;
      renderPreservingControl(target);
    }
  }, { signal });

  root.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof Element)) {
      return;
    }
    const actionElement = target.closest<HTMLElement>("[data-action]");
    if (!actionElement) {
      return;
    }
    const action = actionElement.dataset.action;

    if (action === "dismiss-toast") {
      const toastId = actionElement.dataset.toastId;
      if (toastId) {
        dismissToast(toastId);
        render();
      }
      return;
    }

    switch (action) {
      case "set-owner-period": {
        const period = actionElement.dataset.period;
        if (period === "today" || period === "7d" || period === "30d") {
          if (state.ownerHome.period !== period) {
            state.ownerHome.period = period;
            void loadOwnerHomeReport();
          }
        }
        return;
      }
      case "set-owner-chart-metric": {
        const metric = actionElement.dataset.chartMetric;
        if (metric === "netSales" || metric === "orders") {
          state.ownerHome.chartMetric = metric;
          render();
        }
        return;
      }
      case "enable-order-sound":
        void enableNewOrderSound().then((enabled) => {
          addToast(
            enabled
              ? "Order sound enabled. The test chime confirms audio is working."
              : "Order sound could not be enabled. Check this site's browser audio permissions.",
            enabled ? "success" : "error"
          );
          render();
        });
        return;
      case "refresh":
        if (state.section === "orders" && root.querySelector(".dash-section--orders")) {
          void refreshOrdersOnly();
        } else {
          void loadDashboard();
        }
        return;
      case "open-menu-create-wizard":
        openMenuCreateWizard();
        setError(null);
        render();
        return;
      case "close-menu-create-wizard":
        if (!state.creatingMenuItem) {
          resetMenuCreateWizard();
          setError(null);
          render();
        }
        return;
      case "menu-create-next":
        advanceMenuCreateWizard();
        return;
      case "menu-create-prev":
        retreatMenuCreateWizard();
        return;
      case "start-google-sign-in":
        void handleGoogleSignInStart();
        return;
      case "show-sign-in":
        showSignInScreen();
        return;
      case "sign-out":
        void signOut();
        return;
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
        state.onboardingWizardStep =
          actionElement.dataset.onboardingStep === "2" ||
          actionElement.dataset.onboardingStep === "3" ||
          actionElement.dataset.onboardingStep === "4" ||
          actionElement.dataset.onboardingStep === "5"
            ? (Number(actionElement.dataset.onboardingStep) as 2 | 3 | 4 | 5)
            : 1;
        persistSection(state.section);
        render();
        return;
      case "onboarding-wizard-next":
        state.onboardingWizardStep = state.onboardingWizardStep < 5 ? ((state.onboardingWizardStep + 1) as 1 | 2 | 3 | 4 | 5) : 5;
        render();
        return;
      case "onboarding-wizard-prev":
        state.onboardingWizardStep = state.onboardingWizardStep > 1 ? ((state.onboardingWizardStep - 1) as 1 | 2 | 3 | 4 | 5) : 1;
        render();
        return;
      case "submit-onboarding-review":
        void handleOnboardingReviewSubmit();
        return;
      case "start-stripe-onboarding":
        void handleStripeOnboardingStart();
        return;
      case "open-stripe-dashboard":
        void handleStripeDashboardOpen();
        return;
      case "refresh-stripe-status":
        void handleStripeStatusRefresh();
        return;
      case "delete-team-user": {
        const operatorUserId = actionElement.dataset.operatorUserId;
        if (operatorUserId) {
          void handleTeamUserDelete(operatorUserId);
        }
        return;
      }
    }

    if (action === "set-section") {
      const section = actionElement.dataset.section;
      if (
        section === "overview" ||
        section === "orders" ||
        section === "menu" ||
          section === "cards" ||
          section === "discounts" ||
          section === "experience" ||
          section === "store" ||
        section === "team"
      ) {
        if (!getAvailableDashboardSections().includes(section)) {
          setError("That dashboard section is unavailable for this store or your current role.");
          render();
          return;
        }
        if (getDashboardRouteOwner(section) === "react") {
          navigateToDashboardSection(section);
          return;
        }
        if (section !== "menu") {
          resetMenuItemDetails();
        }
        if (section !== "orders") {
          stopAutoRefresh();
          clearPendingCancel();
        }
        state.section = section;
        persistSection(section);
        syncLegacySectionPath(section);
        render();
        if (section === "overview" && state.session?.operator.role === "owner") {
          void loadOwnerHomeReport();
        }
        if (section === "orders") {
          startAutoRefresh(loadDashboard);
        }
      }
      return;
    }

    if (action === "publish-mobile-experience") {
      void handleMobileExperiencePublish();
      return;
    }

    if (action === "move-mobile-experience-section") {
      const sectionType = actionElement.dataset.sectionType;
      const direction = actionElement.dataset.direction === "down" ? "down" : "up";
      if (sectionType) {
        handleMobileExperienceSectionMove(sectionType, direction);
      }
      return;
    }

    if (action === "rollback-mobile-experience") {
      const versionId = actionElement.dataset.versionId;
      if (versionId) {
        void handleMobileExperienceRollback(versionId);
      }
      return;
    }

    if (action === "set-order-filter") {
      const filter = actionElement.dataset.orderFilter;
      if (filter === "all" || filter === "active" || filter === "completed") {
        state.orderFilter = filter;
        render();
      }
      return;
    }

    if (action === "set-orders-page") {
      const page = Number(actionElement.dataset.ordersPage);
      if (Number.isInteger(page) && page > 0 && page !== state.ordersPage) {
        state.ordersPage = page;
        render();
      }
      return;
    }

    if (action === "set-menu-items-page") {
      const page = Number(actionElement.dataset.menuItemsPage);
      if (Number.isInteger(page) && page > 0 && page !== state.menuItemsPage) {
        state.menuItemsPage = page;
        render();
      }
      return;
    }

    if (action === "set-menu-tab") {
      const tab = actionElement.dataset.menuTab;
      if (tab === "items" || tab === "categories" || tab === "modifier-groups") {
        state.menuActiveTab = tab;
        render();
        root.querySelector<HTMLElement>(`#menu-tab-${tab}`)?.focus({ preventScroll: true });
      }
      return;
    }

    if (action === "switch-menu-tab") {
      const tab = actionElement.dataset.menuTab;
      if (tab === "items" || tab === "categories" || tab === "modifier-groups") {
        resetMenuItemDetails();
        state.menuActiveTab = tab;
        render();
        root.querySelector<HTMLElement>(`#menu-tab-${tab}`)?.focus({ preventScroll: true });
      }
      return;
    }

    if (action === "open-menu-create-item") {
      openMenuDialog("create-item", null, actionElement);
      return;
    }

    if (action === "open-menu-create-category") {
      openMenuDialog("create-category", null, actionElement);
      return;
    }

    if (action === "open-menu-create-modifier-group") {
      openMenuDialog("create-modifier-group", null, actionElement);
      return;
    }

    if (action === "open-menu-item" || action === "open-menu-item-details") {
      const itemId = actionElement.dataset.itemId ?? actionElement.dataset.menuItemRow;
      if (itemId) openMenuDialog("item", itemId, actionElement);
      return;
    }

    if (action === "open-menu-category") {
      const categoryId = actionElement.dataset.categoryId;
      if (categoryId) openMenuDialog("category", categoryId, actionElement);
      return;
    }

    if (action === "open-modifier-group") {
      const modifierGroupId = actionElement.dataset.modifierGroupId;
      if (modifierGroupId) openMenuDialog("modifier-group", modifierGroupId, actionElement);
      return;
    }

    if (action === "close-menu-dialog" || action === "close-menu-item-details") {
      if (!closeNestedModifierGroupDialog()) closeMenuDialog();
      return;
    }

    if (action === "stop-menu-row-action") return;

    if (action === "retry-menu-load") {
      state.menuLoadError = null;
      void loadDashboard();
      return;
    }

    if (action === "toggle-menu-availability") {
      const itemId = actionElement.dataset.itemId;
      const available = actionElement.dataset.available;
      if (itemId && (available === "true" || available === "false")) {
        void handleMenuAvailabilityToggle(itemId, available === "true");
      }
      return;
    }

    if (action === "open-item-modifier-group-create") {
      const itemId = actionElement.dataset.itemId;
      const nested = root.querySelector<HTMLElement>("[data-menu-group-create-dialog]");
      if (itemId && nested) {
        state.menuCreateModifierGroupForItemId = itemId;
        nested.hidden = false;
        nested.querySelector<HTMLElement>('[role="dialog"] input:not([disabled])')?.focus({ preventScroll: true });
      }
      return;
    }

    if (action === "close-item-modifier-group-create") {
      closeNestedModifierGroupDialog();
      return;
    }

    if (action === "add-item-modifier-group") {
      const itemId = actionElement.dataset.itemId;
      const groupId = actionElement.dataset.modifierGroupId;
      const list = actionElement.closest("form")?.querySelector<HTMLElement>("[data-assignment-list]");
      if (!itemId || !groupId || !list || list.querySelector(`[data-assignment-group-id="${CSS.escape(groupId)}"]`)) return;
      list.querySelector(".dash-menu-empty-inline")?.remove();
      list.dataset.canWrite = "true";
      const count = list.querySelectorAll("[data-assignment-group-id]").length;
      list.insertAdjacentHTML("beforeend", renderModifierAssignmentRow(itemId, groupId, count, count + 1, true));
      const form = actionElement.closest<HTMLFormElement>("form");
      if (form) setModifierGroupPickerAssignment(form, itemId, groupId, true);
      refreshItemModifierAssignmentControls(list);
      return;
    }

    if (action === "remove-item-modifier-group") {
      const row = actionElement.closest<HTMLElement>("[data-assignment-group-id]");
      const list = row?.parentElement;
      const form = actionElement.closest<HTMLFormElement>("form");
      const itemId = actionElement.dataset.itemId;
      const groupId = row?.dataset.assignmentGroupId;
      if (form && itemId && groupId) setModifierGroupPickerAssignment(form, itemId, groupId, false);
      row?.remove();
      if (list) {
        if (list.querySelectorAll("[data-assignment-group-id]").length === 0) list.innerHTML = '<p class="dash-menu-empty-inline">No modifier groups assigned.</p>';
        refreshItemModifierAssignmentControls(list);
      }
      return;
    }

    if (action === "move-item-modifier-group") {
      const row = actionElement.closest<HTMLElement>("[data-assignment-group-id]");
      const list = row?.parentElement;
      if (!row || !list) return;
      const rows = [...list.querySelectorAll<HTMLElement>("[data-assignment-group-id]")];
      const index = rows.indexOf(row);
      const direction = actionElement.dataset.direction;
      const neighbor = rows[index + (direction === "up" ? -1 : 1)];
      if (neighbor) {
        if (direction === "up") list.insertBefore(row, neighbor);
        else list.insertBefore(neighbor, row);
        refreshItemModifierAssignmentControls(list);
      }
      return;
    }

    if (action === "add-modifier-option") {
      const list = actionElement.closest("form")?.querySelector<HTMLElement>("[data-modifier-options]");
      if (!list) return;
      const index = list.querySelectorAll("[data-modifier-option-row]").length;
      list.insertAdjacentHTML("beforeend", renderModifierOptionEditorRow(null, null, index, true, index + 1));
      refreshModifierOptionControls(list);
      list.querySelectorAll<HTMLInputElement>('[name="optionLabel"]')[index]?.focus({ preventScroll: true });
      return;
    }

    if (action === "remove-modifier-option") {
      const row = actionElement.closest<HTMLElement>("[data-modifier-option-row]");
      const list = row?.parentElement;
      if (!row || !list || list.querySelectorAll("[data-modifier-option-row]").length <= 1) return;
      row.remove();
      refreshModifierOptionControls(list);
      return;
    }

    if (action === "move-modifier-option") {
      const row = actionElement.closest<HTMLElement>("[data-modifier-option-row]");
      const list = row?.parentElement;
      if (!row || !list) return;
      const rows = [...list.querySelectorAll<HTMLElement>("[data-modifier-option-row]")];
      const index = rows.indexOf(row);
      const neighbor = rows[index + (actionElement.dataset.direction === "up" ? -1 : 1)];
      if (neighbor) {
        if (actionElement.dataset.direction === "up") list.insertBefore(row, neighbor);
        else list.insertBefore(neighbor, row);
        refreshModifierOptionControls(list);
      }
      return;
    }

    if (action === "move-category-item") {
      const categoryId = actionElement.dataset.categoryId;
      const itemId = actionElement.dataset.itemId;
      const direction = actionElement.dataset.direction === "down" ? "down" : "up";
      if (categoryId && itemId) void handleMenuCategoryItemReorder(categoryId, itemId, direction);
      return;
    }

    if (action === "open-order-details") {
      const orderId = actionElement.dataset.orderId;
      if (orderId) {
        openOrderDetails(orderId);
      }
      return;
    }

    if (action === "close-order-details") {
      closeOrderDetails();
      return;
    }

    if (action === "set-store-ticket-filter") {
      const filter = actionElement.dataset.storeTicketFilter;
      if (
        filter === "all" ||
        filter === "needs_action" ||
        filter === "in_progress" ||
        filter === "ready" ||
        filter === "closed"
      ) {
        state.storeTicketFilter = filter;
        render();
      }
      return;
    }

    if (action === "select-order") {
      const orderId = actionElement.dataset.orderId;
      if (orderId) {
        selectOrder(orderId);
        render();
      }
      return;
    }

    if (action === "advance-order") {
      const orderId = actionElement.dataset.orderId;
      const status = actionElement.dataset.orderStatus;
      const note = actionElement.dataset.orderNote;
      if (
        orderId &&
        (status === "IN_PREP" || status === "READY" || status === "COMPLETED")
      ) {
        void handleOrderAdvance(orderId, status, note);
      }
      return;
    }

    if (action === "cancel-order") {
      const orderId = actionElement.dataset.orderId;
      if (orderId) {
        armPendingCancel(orderId);
        render();
      }
      return;
    }

    if (action === "refund-order") {
      const orderId = actionElement.dataset.orderId;
      if (orderId) {
        const reason = window.prompt("Reason for refund", "Customer requested a refund")?.trim();
        if (reason) void handleOrderRefund(orderId, reason);
      }
      return;
    }

    if (action === "dismiss-cancel-order") {
      clearPendingCancel();
      render();
      return;
    }

    if (action === "add-customization-group") {
      const itemId = actionElement.dataset.itemId;
      if (!itemId || !state.session) {
        return;
      }
      if (!canCreateMenuItems(state.session.operator, state.appConfig)) {
        setError("Menu editing is unavailable until platform-managed menu editing is enabled for your account.");
        render();
        return;
      }
      const draft = ensureMenuCustomizationDraft(itemId);
      draft.push(createCustomizationGroupDraft(draft.length));
      setError(null);
      render();
      return;
    }

    if (action === "delete-customization-group") {
      const itemId = actionElement.dataset.itemId;
      const groupIndexValue = actionElement.dataset.groupIndex;
      if (!itemId || !groupIndexValue || !state.session) {
        return;
      }
      if (!canCreateMenuItems(state.session.operator, state.appConfig)) {
        setError("Menu editing is unavailable until platform-managed menu editing is enabled for your account.");
        render();
        return;
      }
      const groupIndex = Number.parseInt(groupIndexValue, 10);
      if (!Number.isFinite(groupIndex)) {
        return;
      }
      const draft = ensureMenuCustomizationDraft(itemId);
      draft.splice(groupIndex, 1);
      setError(null);
      render();
      return;
    }

    if (action === "add-customization-option") {
      const itemId = actionElement.dataset.itemId;
      const groupIndexValue = actionElement.dataset.groupIndex;
      if (!itemId || !groupIndexValue || !state.session) {
        return;
      }
      if (!canCreateMenuItems(state.session.operator, state.appConfig)) {
        setError("Menu editing is unavailable until platform-managed menu editing is enabled for your account.");
        render();
        return;
      }
      const groupIndex = Number.parseInt(groupIndexValue, 10);
      if (!Number.isFinite(groupIndex)) {
        return;
      }
      const draft = ensureMenuCustomizationDraft(itemId);
      const group = draft[groupIndex];
      if (!group) {
        return;
      }
      group.options.push(createCustomizationOptionDraft(group.options.length));
      setError(null);
      render();
      return;
    }

    if (action === "delete-customization-option") {
      const itemId = actionElement.dataset.itemId;
      const groupIndexValue = actionElement.dataset.groupIndex;
      const optionIndexValue = actionElement.dataset.optionIndex;
      if (!itemId || !groupIndexValue || !optionIndexValue || !state.session) {
        return;
      }
      if (!canCreateMenuItems(state.session.operator, state.appConfig)) {
        setError("Menu editing is unavailable until platform-managed menu editing is enabled for your account.");
        render();
        return;
      }
      const groupIndex = Number.parseInt(groupIndexValue, 10);
      const optionIndex = Number.parseInt(optionIndexValue, 10);
      if (!Number.isFinite(groupIndex) || !Number.isFinite(optionIndex)) {
        return;
      }
      const draft = ensureMenuCustomizationDraft(itemId);
      const group = draft[groupIndex];
      if (!group) {
        return;
      }
      group.options.splice(optionIndex, 1);
      setError(null);
      render();
      return;
    }

    if (action === "toggle-menu-visibility") {
      const itemId = actionElement.dataset.itemId;
      const visible = actionElement.dataset.visible;
      if (itemId && (visible === "true" || visible === "false")) {
        void handleMenuVisibilityToggle(itemId, visible === "true");
      }
      return;
    }

    if (action === "delete-menu-item") {
      const itemId = actionElement.dataset.itemId;
      if (itemId) {
        void handleMenuItemDelete(itemId);
      }
      return;
    }

    if (action === "delete-menu-category") {
      const categoryId = actionElement.dataset.categoryId;
      if (categoryId) void handleMenuCategoryDelete(categoryId);
      return;
    }

    if (action === "reorder-menu-category") {
      const categoryId = actionElement.dataset.categoryId;
      const direction = actionElement.dataset.direction === "down" ? "down" : "up";
      if (categoryId) void handleMenuCategoryReorder(categoryId, direction);
      return;
    }

    if (action === "delete-modifier-group") {
      const modifierGroupId = actionElement.dataset.modifierGroupId;
      if (modifierGroupId) void handleModifierGroupDelete(modifierGroupId);
      return;
    }

    if (action === "toggle-news-card-visibility") {
      const cardId = actionElement.dataset.cardId;
      const visible = actionElement.dataset.visible;
      if (cardId && (visible === "true" || visible === "false")) {
        void handleNewsCardVisibilityToggle(cardId, visible === "true");
      }
      return;
    }

    if (action === "delete-news-card") {
      const cardId = actionElement.dataset.cardId;
      if (cardId) {
        void handleNewsCardDelete(cardId);
      }
      return;
    }
  }, { signal });

  return () => controller?.abort();
}
