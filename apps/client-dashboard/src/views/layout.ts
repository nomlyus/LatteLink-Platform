import { getSelectedLocation, hasMultipleLocations, isAllLocationsSelected, state } from "../state.js";
import { escapeHtml, formatDashboardDate, getOperatorInitials } from "../ui/format.js";
import { filterOrdersByView, getOperatorRoleLabel, isStoreOperator } from "../model.js";
import {
  isOrderTrackingEnabled,
  isStaffDashboardEnabled
} from "@lattelink/contracts-catalog";
import {
  ensureSectionIsAvailable,
  getAvailableDashboardSections,
  getDashboardSectionLabel
} from "../sections.js";
import { reconcileMenuCreateDraft } from "../menu-wizard.js";
import { renderBanner } from "./common.js";
import { renderOverviewSection } from "./overview.js";
import { renderOrdersSection } from "./orders.js";
import { renderMenuSection } from "./menu.js";
import { renderMenuCreateWizard } from "./menu-wizard.js";
import { renderCardsSection } from "./cards.js";
import { renderStoreSection } from "./store.js";
import { renderTeamSection } from "./team.js";

function renderNavItems() {
  const availableSections = getAvailableDashboardSections();
  const activeOrders = filterOrdersByView(state.orders, "active").length;
  return availableSections
    .map((section) => {
      const badge =
        section === "orders" && activeOrders > 0
          ? `<span class="dash-nav-badge">${activeOrders}</span>`
          : "";
      return `
        <button
          class="dash-nav-item ${state.section === section ? "dash-nav-item--active" : ""}"
          type="button"
          data-action="set-section"
          data-section="${section}"
        >
          <span class="dash-nav-item__content">
            <span class="dash-nav-dot" aria-hidden="true"></span>
            <span>${escapeHtml(getDashboardSectionLabel(section))}</span>
          </span>
          ${badge}
        </button>
      `;
    })
    .join("");
}

function renderDashboardContent() {
  switch (state.section) {
    case "orders":
      return renderOrdersSection();
    case "menu":
      return renderMenuSection();
    case "cards":
      return renderCardsSection();
    case "store":
      return renderStoreSection();
    case "team":
      return renderTeamSection();
    case "overview":
    default:
      return renderOverviewSection();
  }
}

function renderStoreModeHeader(locationLabel: string, marketLabel: string) {
  return `
    <header class="dash-header dash-header--store">
      <div class="dash-header__shell dash-header__shell--store">
        <div class="dash-store-lockup">
          <div class="dash-lockup">
            <span class="dash-wordmark">LatteLink</span>
            <span class="dash-byline">Store mode</span>
          </div>
          <div class="dash-store-title-group">
            <div class="dash-page-title">${escapeHtml(locationLabel)}</div>
            <div class="dash-shop-sub">${escapeHtml(marketLabel)}</div>
          </div>
        </div>

        <div class="dash-store-meta">
          <div class="dash-live-pill">
            <div class="dash-live-dot"></div>
            Live orders
          </div>
          <div class="dash-date">${escapeHtml(formatDashboardDate())}</div>
          <details class="dash-account-menu">
            <summary class="dash-account-trigger" aria-label="Open account menu">
              <div class="dash-avatar">${escapeHtml(getOperatorInitials(state.session?.operator.displayName))}</div>
              <div class="dash-user-meta">
                <div class="dash-user-name">${escapeHtml(state.session?.operator.displayName ?? "Store screen")}</div>
                <div class="dash-user-role">${escapeHtml(getOperatorRoleLabel(state.session?.operator.role ?? "store"))}</div>
              </div>
              <span class="dash-account-chevron" aria-hidden="true">▾</span>
            </summary>
            <div class="dash-account-dropdown" role="menu">
              <button class="dash-account-action dash-account-action--danger" type="button" role="menuitem" data-action="sign-out">
                Sign out
              </button>
            </div>
          </details>
        </div>
      </div>
    </header>
  `;
}

export function renderDashboard() {
  ensureSectionIsAvailable();
  reconcileMenuCreateDraft();
  const storeMode = isStoreOperator(state.session?.operator ?? null);
  const selectedLocation = getSelectedLocation();
  const locationLabel = isAllLocationsSelected()
    ? "All locations"
    : selectedLocation?.locationName ?? state.appConfig?.brand.locationName ?? state.storeConfig?.storeName ?? "Operator dashboard";
  const marketLabel = isAllLocationsSelected()
    ? `${state.availableLocations.length} locations`
    : selectedLocation?.marketLabel ?? state.appConfig?.brand.marketLabel ?? "Store operations";
  const liveEnabled = isStaffDashboardEnabled(state.appConfig) && isOrderTrackingEnabled(state.appConfig);
  const settingsAvailable = getAvailableDashboardSections().includes("store");
  const locationSelector = hasMultipleLocations()
    ? `
        <label class="field dash-field-inline dash-location-picker">
          <span>Workspace</span>
          <select data-control="location-scope" ${state.loading ? "disabled" : ""}>
            <option value="all" ${isAllLocationsSelected() ? "selected" : ""}>All locations</option>
            ${state.availableLocations
              .map(
                (location) => `
                  <option value="${escapeHtml(location.locationId)}" ${state.selectedLocationId === location.locationId ? "selected" : ""}>
                    ${escapeHtml(location.locationName)} · ${escapeHtml(location.marketLabel)}
                  </option>
                `
              )
              .join("")}
          </select>
        </label>
      `
    : "";

  if (storeMode) {
    return `
      <div class="dash-shell dash-shell--store">
        ${renderStoreModeHeader(locationLabel, marketLabel)}
        <main class="dash-main dash-main--store">
          <div class="dash-content dash-content--store">
            ${renderBanner()}
            ${renderDashboardContent()}
          </div>
        </main>
        ${renderMenuCreateWizard()}
      </div>
    `;
  }

  return `
    <div class="dash-shell">
      <header class="dash-header">
        <div class="dash-header__shell">
          <div class="dash-lockup">
            <span class="dash-wordmark">LatteLink</span>
            <span class="dash-byline">by nomly</span>
          </div>

          <nav class="dash-nav" aria-label="Dashboard sections">
            ${renderNavItems()}
          </nav>

          <details class="dash-account-menu">
            <summary class="dash-account-trigger" aria-label="Open account menu">
              <div class="dash-avatar">${escapeHtml(getOperatorInitials(state.session?.operator.displayName))}</div>
              <div class="dash-user-meta">
                <div class="dash-user-name">${escapeHtml(state.session?.operator.displayName ?? "Operator")}</div>
                <div class="dash-user-role">${escapeHtml(getOperatorRoleLabel(state.session?.operator.role ?? "manager"))}</div>
              </div>
              <span class="dash-account-chevron" aria-hidden="true">▾</span>
            </summary>
            <div class="dash-account-dropdown" role="menu">
              <button class="dash-account-action" type="button" role="menuitem">
                Account
              </button>
              <button
                class="dash-account-action"
                type="button"
                role="menuitem"
                ${settingsAvailable ? `data-action="set-section" data-section="store"` : "disabled"}
              >
                Settings
              </button>
              <button class="dash-account-action dash-account-action--danger" type="button" role="menuitem" data-action="sign-out">
                Sign out
              </button>
            </div>
          </details>
        </div>
      </header>

      <div class="dash-main">
        <div class="dash-topbar">
          <div class="dash-page-stack">
            <div class="dash-page-title">${escapeHtml(getDashboardSectionLabel(state.section))}</div>
            <div class="dash-shop-sub">${escapeHtml(locationLabel)} · ${escapeHtml(marketLabel)}</div>
          </div>
          ${locationSelector}
          <div class="dash-date">${escapeHtml(formatDashboardDate())}</div>
          <div class="dash-live-pill ${liveEnabled ? "" : "dash-live-pill--muted"}">
            <div class="dash-live-dot"></div>
            ${liveEnabled ? "Live" : "Paused"}
          </div>
        </div>

        <div class="dash-content">
          ${renderBanner()}
          ${renderDashboardContent()}
        </div>
      </div>
      ${renderMenuCreateWizard()}
    </div>
  `;
}
