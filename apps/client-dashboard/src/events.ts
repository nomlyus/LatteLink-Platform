import { root, render } from "./render.js";
import { setError, dismissToast, state } from "./state.js";
import { persistSection } from "./storage.js";
import {
  syncMenuCreateDraft,
  advanceMenuCreateWizard,
  retreatMenuCreateWizard,
  openMenuCreateWizard,
  resetMenuCreateWizard
} from "./menu-wizard.js";
import {
  updateCustomizationDraftFromInput,
  ensureMenuCustomizationDraft,
  createCustomizationGroupDraft,
  createCustomizationOptionDraft
} from "./customizations.js";
import {
  armPendingCancel,
  clearPendingCancel,
  selectOrder,
  startAutoRefresh,
  stopAutoRefresh
} from "./orders-runtime.js";
import { canCreateMenuItems } from "./model.js";
import { loadDashboard, signOut } from "./lifecycle.js";
import { getAvailableDashboardSections } from "./sections.js";
import {
  handleGoogleSignInStart,
  handlePasswordSignIn
} from "./controllers/auth.js";
import {
  handleMenuCreateSubmit,
  handleMenuItemSubmit,
  handleMenuItemDelete,
  handleMenuVisibilityToggle
} from "./controllers/menu.js";
import {
  handleNewsCardCreateSubmit,
  handleNewsCardDelete,
  handleNewsCardSubmit,
  handleNewsCardVisibilityToggle
} from "./controllers/cards.js";
import { handleStoreSubmit } from "./controllers/store.js";
import { handleTeamCreateSubmit, handleTeamUserSubmit } from "./controllers/team.js";
import { handleOrderAdvance } from "./controllers/orders.js";

export function registerEvents() {
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
      case "menu-create":
        void handleMenuCreateSubmit(target);
        return;
      case "menu-item":
        void handleMenuItemSubmit(target);
        return;
      case "news-card-create":
        void handleNewsCardCreateSubmit(target);
        return;
      case "news-card":
        void handleNewsCardSubmit(target);
        return;
      case "store-config":
        void handleStoreSubmit(target);
        return;
      case "team-create":
        void handleTeamCreateSubmit(target);
        return;
      case "team-user":
        void handleTeamUserSubmit(target);
        return;
    }
  });

  root.addEventListener("input", (event) => {
    syncMenuCreateDraft(event.target);
    updateCustomizationDraftFromInput(event.target);
  });

  root.addEventListener("change", (event) => {
    syncMenuCreateDraft(event.target);
    updateCustomizationDraftFromInput(event.target);
  });

  root.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) {
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
      case "refresh":
        void loadDashboard();
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
      case "sign-out":
        void signOut();
        return;
    }

    if (action === "set-section") {
      const section = actionElement.dataset.section;
      if (section === "overview" || section === "orders" || section === "menu" || section === "cards" || section === "store" || section === "team") {
        if (!getAvailableDashboardSections().includes(section)) {
          setError("That dashboard section is unavailable for this store or your current role.");
          render();
          return;
        }
        if (section !== "orders") {
          stopAutoRefresh();
          clearPendingCancel();
        }
        state.section = section;
        persistSection(section);
        render();
        if (section === "orders") {
          startAutoRefresh(loadDashboard);
        }
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
        (status === "IN_PREP" || status === "READY" || status === "COMPLETED" || status === "CANCELED")
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

    if (action === "dismiss-cancel-order") {
      clearPendingCancel();
      render();
      return;
    }

    if (action === "confirm-cancel-order") {
      const orderId = actionElement.dataset.orderId;
      if (orderId) {
        void handleOrderAdvance(orderId, "CANCELED", "Canceled by staff");
      }
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
