import { getSelectedLocation, hasMultipleLocations, isAllLocationsSelected, state } from "../state";
import { escapeHtml, formatDashboardDate, formatDashboardHeadingDate, getOperatorInitials } from "../ui/format";
import { getOperatorRoleLabel, isOwnerOperator, isStoreOperator, type DashboardSection } from "../model";
import {
  ensureSectionIsAvailable,
  getAvailableDashboardSections,
  getDashboardSectionLabel
} from "../sections";
import { getDashboardSectionIcon } from "../lib/navigation/dashboard-sections";
import { getDashboardDestination, getDashboardRouteOwner } from "../lib/navigation/dashboard-navigation";
import { renderBanner } from "./common";
import { renderHomeState, renderOverviewSection, type HomeState } from "./overview";

function renderNavIcon(section: DashboardSection) {
  return `<img class="dash-nav-icon" src="${getDashboardSectionIcon(section)}" alt="" aria-hidden="true" />`;
}

function getAccountStoreLabel() {
  return (
    state.storeConfig?.storeName ??
    getSelectedLocation()?.locationName ??
    state.appConfig?.brand.locationName ??
    "Store"
  );
}

function isSidebarLoading() {
  return state.initializing || state.loading;
}

function isHomeLoading() {
  if (isSidebarLoading()) {
    return true;
  }

  if (typeof window === "undefined") {
    return false;
  }

  const previewState = new URLSearchParams(window.location.search).get("homeState");
  return previewState === "loading" || previewState === "all";
}

function renderNavItems(sections: DashboardSection[]) {
  return sections
    .map((section) => {
      const active = state.section === section;
      const destination = getDashboardDestination(section);
      const content = `
            <span class="dash-nav-item__content">
              ${renderNavIcon(section)}
              <span class="dash-nav-label">${escapeHtml(getDashboardSectionLabel(section))}</span>
            </span>
            `;
      if (getDashboardRouteOwner(section) === "react") {
        return `<a class="dash-nav-item ${active ? "dash-nav-item--active" : ""}" href="${destination.href}"${active ? ' aria-current="page"' : ""} title="${escapeHtml(getDashboardSectionLabel(section))}">${content}</a>`;
      }
      return `
        <button
          class="dash-nav-item ${active ? "dash-nav-item--active" : ""}"
          type="button"
          data-action="set-section"
          data-section="${section}"
          title="${escapeHtml(getDashboardSectionLabel(section))}"
        >
          ${content}
        </button>
      `;
    })
    .join("");
}

function renderDashboardNav() {
  const availableSections = getAvailableDashboardSections();
  const primarySections: DashboardSection[] = ["overview", "orders", "menu", "cards", "discounts"];
  const operationsSections: DashboardSection[] = ["store", "team"];
  const visiblePrimary = primarySections.filter((section) => availableSections.includes(section));
  const visibleOperations = operationsSections.filter((section) => availableSections.includes(section));

  return `
    <div class="dash-nav-group">
      <div class="dash-nav-group__label">Primary</div>
      ${renderNavItems(visiblePrimary)}
    </div>
    ${
      visibleOperations.length > 0
        ? `<div class="dash-nav-group">
            <div class="dash-nav-group__label">Operations</div>
            ${renderNavItems(visibleOperations)}
          </div>`
        : ""
    }
  `;
}

function renderDashboardSidebarLoading(storeMode = false) {
  const renderLoadingItems = (count: number) =>
    ["long", "medium", "short", "long", "medium", "short"]
      .slice(0, count)
      .map(
        (width) => `
        <div class="dash-sidebar__loading-item" aria-hidden="true">
          <span class="dash-skeleton dash-skeleton--icon"></span>
          <span class="dash-skeleton dash-skeleton--text dash-skeleton--text-${width}"></span>
        </div>
      `
      )
      .join("");

  return `
    <div class="dash-sidebar__loading" aria-label="Loading sidebar" aria-busy="true">
      <div class="dash-sidebar__loading-brand" aria-hidden="true">
        <span class="dash-skeleton dash-skeleton--wordmark"></span>
      </div>
      ${
        storeMode
          ? `
              <div class="dash-sidebar__loading-spacer" aria-hidden="true"></div>
              <div class="dash-sidebar__loading-store-meta" aria-hidden="true">
                <span class="dash-skeleton dash-skeleton--live"></span>
                <span class="dash-skeleton dash-skeleton--date"></span>
                <div class="dash-sidebar__loading-account">
                  <span class="dash-skeleton dash-skeleton--avatar"></span>
                  <span class="dash-skeleton dash-skeleton--account"></span>
                </div>
              </div>
            `
          : `
              <nav class="dash-sidebar__loading-nav" aria-hidden="true">
                <div class="dash-sidebar__loading-group">
                  <span class="dash-skeleton dash-skeleton--label"></span>
                  ${renderLoadingItems(6)}
                </div>
                <div class="dash-sidebar__loading-group dash-sidebar__loading-group--secondary">
                  <span class="dash-skeleton dash-skeleton--label"></span>
                  ${renderLoadingItems(2)}
                </div>
              </nav>
              <div class="dash-sidebar__loading-footer" aria-hidden="true">
                <span class="dash-skeleton dash-skeleton--avatar"></span>
                <span class="dash-skeleton dash-skeleton--account"></span>
              </div>
            `
      }
    </div>
  `;
}

function renderDashboardContent() {
  if (state.section !== "overview") {
    const pageState = getDashboardPageState();
    if (pageState) {
      const stateNames: Exclude<HomeState, "all">[] =
        pageState === "all"
          ? ["loading", "empty", "no-connection", "no-api", "error"]
          : [pageState];
      return `
        <section class="dash-page-state${pageState === "all" ? " dash-page-state--preview" : ""}" aria-label="${escapeHtml(getDashboardSectionLabel(state.section))}">
          ${stateNames.map((stateName) => renderHomeState(stateName, getDashboardSectionIcon(state.section))).join("")}
        </section>
      `;
    }
  }

  switch (state.section) {
    case "store":
      return "";
    case "overview":
      // Owner Home is React-owned; the legacy invite/section host only keeps a generic fallback here.
      return isOwnerOperator(state.session?.operator ?? null) ? "" : renderOverviewSection();
    default:
      return renderOverviewSection();
  }
}

function getDashboardPageState(): Exclude<HomeState, "all"> | "all" | null {
  if (typeof window !== "undefined") {
    const previewState = new URLSearchParams(window.location.search).get("pageState");
    if (
      previewState === "all" ||
      previewState === "loading" ||
      previewState === "empty" ||
      previewState === "no-connection" ||
      previewState === "no-api" ||
      previewState === "error"
    ) {
      return previewState;
    }
  }

  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    return "no-connection";
  }

  if (state.loading) {
    return "loading";
  }

  if (!state.authApiBaseUrl.trim() || state.errorMessage === "Unable to reach backend.") {
    return "no-api";
  }

  if (state.errorMessage && !state.dashboardLoaded) {
    return "error";
  }

  return null;
}

function renderStoreModeSidebar() {
  return `
    <aside class="dash-sidebar dash-sidebar--store${isSidebarLoading() ? " dash-sidebar--loading" : ""}">
      ${
        isSidebarLoading()
          ? renderDashboardSidebarLoading(true)
          : `
              <div class="dash-sidebar__brand">
                <div class="dash-lockup dash-lockup--store">
                  <div class="dash-lockup__brand">
                    <span class="dash-wordmark">nomly</span>
                    <span class="dash-beta-pill">Beta</span>
                  </div>
                  <span class="dash-byline">Store mode</span>
                </div>
              </div>

              <div class="dash-sidebar__footer dash-sidebar__footer--store">
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
                      <img class="dash-account-chevron" src="/icons/operator-v3/account-chevron.svg" alt="" aria-hidden="true" />
                    </summary>
                    <div class="dash-account-dropdown" role="menu">
                      <div class="dash-account-dropdown__identity">
                        <div class="dash-avatar">${escapeHtml(getOperatorInitials(state.session?.operator.displayName))}</div>
                        <div class="dash-account-dropdown__identity-copy">
                          <div class="dash-account-dropdown__identity-name">${escapeHtml(state.session?.operator.displayName ?? "Store screen")}</div>
                          <div class="dash-account-dropdown__identity-store">${escapeHtml(getAccountStoreLabel())}</div>
                        </div>
                      </div>
                      <button class="dash-account-action dash-account-action--danger" type="button" role="menuitem" data-action="sign-out">
                        <img class="dash-account-action__icon" src="/icons/operator-v3/log-out.svg" alt="" aria-hidden="true" />
                        Sign out
                      </button>
                    </div>
                  </details>
                </div>
              </div>
            `
      }
    </aside>
  `;
}

export function renderDashboard() {
  ensureSectionIsAvailable();
  const storeMode = isStoreOperator(state.session?.operator ?? null);
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
        ${renderStoreModeSidebar()}
        <main class="dash-main dash-main--store">
          <div class="dash-content dash-content--store">
            ${renderBanner()}
            ${renderDashboardContent()}
          </div>
        </main>
      </div>
    `;
  }

  const isHomeSection = state.section === "overview";
  const dashboardContent = `${renderBanner()}${renderDashboardContent()}`;

  return `
    <div class="dash-shell">
      <aside class="dash-sidebar${isSidebarLoading() ? " dash-sidebar--loading" : ""}">
        ${
          isSidebarLoading()
            ? renderDashboardSidebarLoading()
            : `
                <div class="dash-sidebar__brand">
                  <div class="dash-lockup">
                    <div class="dash-lockup__brand">
                      <span class="dash-wordmark">nomly</span>
                      <span class="dash-beta-pill">Beta</span>
                    </div>
                  </div>
                </div>

                <nav class="dash-nav" aria-label="Dashboard sections">
                  ${renderDashboardNav()}
                </nav>

                <div class="dash-sidebar__footer">
                  <details class="dash-account-menu">
                    <summary class="dash-account-trigger" aria-label="Open account menu">
                      <div class="dash-avatar">${escapeHtml(getOperatorInitials(state.session?.operator.displayName))}</div>
                      <div class="dash-user-meta">
                        <div class="dash-user-name">${escapeHtml(state.session?.operator.displayName ?? "Operator")}</div>
                        <div class="dash-user-role">${escapeHtml(getOperatorRoleLabel(state.session?.operator.role ?? "manager"))}</div>
                      </div>
                      <img class="dash-account-chevron" src="/icons/operator-v3/account-chevron.svg" alt="" aria-hidden="true" />
                    </summary>
                    <div class="dash-account-dropdown" role="menu">
                      <div class="dash-account-dropdown__identity">
                        <div class="dash-avatar">${escapeHtml(getOperatorInitials(state.session?.operator.displayName))}</div>
                        <div class="dash-account-dropdown__identity-copy">
                          <div class="dash-account-dropdown__identity-name">${escapeHtml(state.session?.operator.displayName ?? "Operator")}</div>
                          <div class="dash-account-dropdown__identity-store">${escapeHtml(getAccountStoreLabel())}</div>
                        </div>
                      </div>
                      <button class="dash-account-action" type="button" role="menuitem">
                        <img class="dash-account-action__icon" src="/icons/operator-v3/user-round.svg" alt="" aria-hidden="true" />
                        Account
                      </button>
                      <button
                        class="dash-account-action"
                        type="button"
                        role="menuitem"
                        ${settingsAvailable ? `data-action="set-section" data-section="store"` : "disabled"}
                      >
                        <img class="dash-account-action__icon" src="/icons/operator-v3/settings.svg" alt="" aria-hidden="true" />
                        Settings
                      </button>
                      <button class="dash-account-action dash-account-action--danger" type="button" role="menuitem" data-action="sign-out">
                        <img class="dash-account-action__icon" src="/icons/operator-v3/log-out.svg" alt="" aria-hidden="true" />
                        Sign out
                      </button>
                    </div>
                  </details>
                </div>
              `
        }
      </aside>

      <div class="dash-main">
        <div class="dash-topbar">
          <div class="dash-page-stack">
            <div class="dash-page-title">${escapeHtml(getDashboardSectionLabel(state.section))}</div>
            ${
              state.section === "overview"
                ? isHomeLoading()
                  ? '<span class="dash-skeleton dash-page-date-skeleton" aria-hidden="true"></span>'
                  : `<div class="dash-page-date">${escapeHtml(formatDashboardHeadingDate())}</div>`
                : ""
            }
          </div>
          <div class="dash-global-search" aria-hidden="true">
            <img class="dash-global-search__icon" src="/icons/operator-v3/search.svg" alt="" />
            <span>⌘ + K</span>
          </div>
          ${locationSelector}
          <div class="dash-notification-button" role="img" aria-label="Notifications">
            <img src="/icons/operator-v3/notifications.svg" alt="" aria-hidden="true" />
          </div>
        </div>

        <div class="dash-content${isHomeSection ? " dash-content--home" : ""}">
          ${
            isHomeSection
              ? dashboardContent
              : `<div class="dash-content__scroll">${dashboardContent}</div>`
          }
        </div>
      </div>
    </div>
  `;
}
