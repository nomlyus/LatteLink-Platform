import { root, render } from "./render";
import { resetMenuItemDetails, setError, state } from "./state";
import { addToast, dismissToast } from "./toast-runtime";
import { persistSection } from "./storage";
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
  handleMenuCategoryCreateSubmit,
  handleMenuCategoryDelete,
  handleMenuCategoryReorder,
  handleMenuCategorySubmit,
  handleMenuItemSubmit,
  handleMenuItemDelete,
  handleMenuVisibilityToggle,
  handleModifierGroupDelete,
  handleModifierGroupSubmit
} from "./controllers/menu";
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
const menuItemDetailsAnimationMs = 420;

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

function openMenuItemDetails(itemId: string) {
  resetMenuItemDetails();
  state.selectedMenuItemId = itemId;
  state.menuItemDetailsOpen = true;
  state.menuItemDetailsOpening = true;
  render();
  state.menuItemDetailsOpening = false;
}

function closeMenuItemDetails() {
  if (!state.menuItemDetailsOpen || !state.selectedMenuItemId || state.menuItemDetailsClosing) {
    return;
  }

  state.menuItemDetailsClosing = true;
  state.menuItemDetailsOpening = false;
  state.menuItemDetailsClosingTimeoutHandle = setTimeout(() => {
    resetMenuItemDetails();
    render();
  }, menuItemDetailsAnimationMs);
  render();
}

export function registerEvents() {
  document.addEventListener("click", (event) => {
    if (event.target instanceof Node) {
      closeOpenAccountMenus(event.target);
    }
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      if (state.orderDetailsOpen && state.selectedOrderId) {
        closeOrderDetails();
      }
      if (state.menuItemDetailsOpen && state.selectedMenuItemId) {
        closeMenuItemDetails();
      }
      closeOpenAccountMenus();
    }
  });

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
  });

  root.addEventListener("input", (event) => {
    syncMenuCreateDraft(event.target);
    updateCustomizationDraftFromInput(event.target);
  });

  root.addEventListener("change", (event) => {
    syncMenuCreateDraft(event.target);
    updateCustomizationDraftFromInput(event.target);

    const target = event.target;
    if (!(target instanceof HTMLSelectElement)) {
      return;
    }

    if (target.dataset.control === "location-scope") {
      const nextLocationId = target.value === "all" ? "all" : target.value || null;
      if (nextLocationId === state.selectedLocationId) {
        return;
      }

      state.selectedLocationId = nextLocationId;
      state.ordersPage = 1;
      state.menuItemsPage = 1;
      resetMenuItemDetails();
      stopAutoRefresh();
      clearPendingCancel();
      void loadDashboard();
    }
  });

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
        if (section !== "menu") {
          resetMenuItemDetails();
        }
        if (section !== "orders") {
          stopAutoRefresh();
          clearPendingCancel();
        }
        state.section = section;
        persistSection(section);
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

    if (action === "open-menu-item-details") {
      const itemId = actionElement.dataset.itemId;
      if (itemId) {
        openMenuItemDetails(itemId);
      }
      return;
    }

    if (action === "close-menu-item-details") {
      closeMenuItemDetails();
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

    if (action === "add-modifier-option") {
      const form = actionElement.closest<HTMLFormElement>('form[data-form="modifier-group"]');
      const stack = form?.querySelector<HTMLElement>(".dash-customization-options-stack");
      if (!stack) return;
      const index = stack.querySelectorAll(".dash-customization-option-row").length;
      const optionId = `option-${globalThis.crypto.randomUUID()}`;
      stack.insertAdjacentHTML(
        "beforeend",
        `<div class="dash-customization-option-row"><label class="field dash-field-inline"><span>Option</span><input name="optionLabel" /></label><label class="field dash-field-inline"><span>Description</span><input name="optionDescription" /></label><label class="field dash-field-inline"><span>Price delta (cents)</span><input name="optionPriceDeltaCents" type="number" step="1" value="0" /></label><label class="field dash-field-inline"><span>Order</span><input name="optionSortOrder" type="number" min="0" step="1" value="${index}" /></label><label class="toggle dash-toggle-inline"><input name="optionDefault_${index}" type="checkbox" /><span>Default</span></label><label class="toggle dash-toggle-inline"><input name="optionAvailable_${index}" type="checkbox" checked /><span>Available</span></label><label class="toggle dash-toggle-inline"><input name="optionRemove_${index}" type="checkbox" /><span>Remove</span></label><input type="hidden" name="optionId" value="${optionId}" /></div>`
      );
      return;
    }

    if (action === "focus-modifier-group-create") {
      const form = document.querySelector<HTMLFormElement>('form[data-form="modifier-group"][data-modifier-group-id=""]');
      form?.scrollIntoView({ behavior: "smooth", block: "center" });
      form?.querySelector<HTMLInputElement>('input[name="label"]')?.focus({ preventScroll: true });
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
  });
}
