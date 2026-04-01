import "./styles.css";
import type { AdminStoreConfig, AppConfig } from "@gazelle/contracts-catalog";
import {
  createOperatorMenuItem,
  createOperatorStaffUser,
  deleteOperatorMenuItem,
  fetchOperatorSnapshot,
  logoutOperatorSession,
  refreshOperatorSession,
  requestOperatorMagicLink,
  resolveDefaultApiBaseUrl,
  updateOperatorMenuItem,
  updateOperatorMenuItemVisibility,
  updateOperatorOrderStatus,
  updateOperatorStaffUser,
  updateOperatorStoreConfig,
  verifyOperatorMagicLink,
  type OperatorSession,
  type OperatorUser
} from "./api.js";
import {
  canAccessCapability,
  canManageOrderStatus,
  countHiddenMenuItems,
  countVisibleMenuItems,
  filterOrdersByView,
  formatOrderStatus,
  getAppConfigCapabilityLabels,
  getAvailableSections,
  getOperatorRoleLabel,
  getOrderActions,
  getOrderCustomerLabel,
  isActiveOrder,
  sessionNeedsRefresh,
  type DashboardSection,
  type OperatorMenuCategory,
  type OperatorOrder,
  type OperatorOrderFilter
} from "./model.js";
import {
  clearStoredSession,
  loadStoredApiBaseUrl,
  loadStoredSection,
  loadStoredSession,
  persistApiBaseUrl,
  persistSection,
  persistSession
} from "./storage.js";

type AppState = {
  section: DashboardSection;
  session: OperatorSession | null;
  authApiBaseUrl: string;
  authEmail: string;
  authToken: string;
  initializing: boolean;
  loading: boolean;
  requestingMagicLink: boolean;
  verifyingMagicLink: boolean;
  errorMessage: string | null;
  notice: string | null;
  appConfig: AppConfig | null;
  orders: OperatorOrder[];
  orderFilter: OperatorOrderFilter;
  menuCategories: OperatorMenuCategory[];
  storeConfig: AdminStoreConfig | null;
  teamUsers: OperatorUser[];
  selectedOrderId: string | null;
  busyOrderId: string | null;
  busyMenuItemId: string | null;
  busyMenuVisibilityItemId: string | null;
  busyDeleteMenuItemId: string | null;
  busyTeamUserId: string | null;
  savingStore: boolean;
  creatingMenuItem: boolean;
  creatingTeamUser: boolean;
  lastRefreshedAt: number | null;
  autoRefreshHandle: ReturnType<typeof setInterval> | null;
  pendingCancelOrderId: string | null;
  pendingCancelTimeoutHandle: ReturnType<typeof setTimeout> | null;
};

const ordersRefreshIntervalMs = 30_000;
const cancelConfirmTimeoutMs = 10_000;

const appRoot = document.querySelector<HTMLDivElement>("#app");
if (!appRoot) {
  throw new Error("Operator root element was not found.");
}

const root: HTMLDivElement = appRoot;
const initialStoredSession = loadStoredSession();

const state: AppState = {
  section: loadStoredSection(),
  session: initialStoredSession,
  authApiBaseUrl: initialStoredSession?.apiBaseUrl ?? loadStoredApiBaseUrl(),
  authEmail: initialStoredSession?.operator.email ?? "",
  authToken: "",
  initializing: true,
  loading: false,
  requestingMagicLink: false,
  verifyingMagicLink: false,
  errorMessage: null,
  notice: null,
  appConfig: null,
  orders: [],
  orderFilter: "active",
  menuCategories: [],
  storeConfig: null,
  teamUsers: [],
  selectedOrderId: null,
  busyOrderId: null,
  busyMenuItemId: null,
  busyMenuVisibilityItemId: null,
  busyDeleteMenuItemId: null,
  busyTeamUserId: null,
  savingStore: false,
  creatingMenuItem: false,
  creatingTeamUser: false,
  lastRefreshedAt: null,
  autoRefreshHandle: null,
  pendingCancelOrderId: null,
  pendingCancelTimeoutHandle: null
};

function escapeHtml(value: string | undefined | null) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function formatMoney(amountCents: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD"
  }).format(amountCents / 100);
}

function formatDateTime(value: string) {
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) {
    return value;
  }

  return new Date(parsed).toLocaleString();
}

function formatRelativeRefresh(value: number | null) {
  if (value === null) {
    return state.loading ? "Refreshing…" : "Not refreshed yet";
  }

  const deltaSeconds = Math.max(0, Math.floor((Date.now() - value) / 1000));
  return deltaSeconds < 60 ? `Updated ${deltaSeconds}s ago` : `Updated ${Math.floor(deltaSeconds / 60)}m ago`;
}

function setNotice(message: string | null) {
  state.notice = message;
}

function setError(message: string | null) {
  state.errorMessage = message;
}

function stopAutoRefresh() {
  if (state.autoRefreshHandle !== null) {
    clearInterval(state.autoRefreshHandle);
    state.autoRefreshHandle = null;
  }
}

function startAutoRefresh() {
  if (typeof window === "undefined" || state.autoRefreshHandle !== null) {
    return;
  }

  if (!state.session || state.section !== "orders" || state.loading || !canAccessCapability(state.session.operator, "orders:read")) {
    return;
  }

  state.autoRefreshHandle = setInterval(() => {
    if (state.section === "orders" && state.session && !state.loading) {
      void loadDashboard();
    }
  }, ordersRefreshIntervalMs);
}

function clearPendingCancel() {
  if (state.pendingCancelTimeoutHandle !== null) {
    clearTimeout(state.pendingCancelTimeoutHandle);
    state.pendingCancelTimeoutHandle = null;
  }

  state.pendingCancelOrderId = null;
}

function armPendingCancel(orderId: string) {
  clearPendingCancel();
  state.pendingCancelOrderId = orderId;
  state.pendingCancelTimeoutHandle = setTimeout(() => {
    if (state.pendingCancelOrderId === orderId) {
      clearPendingCancel();
      render();
    }
  }, cancelConfirmTimeoutMs);
}

function selectOrder(orderId: string | null) {
  clearPendingCancel();
  state.selectedOrderId = orderId;
}

function reconcileSelectedOrder() {
  if (state.selectedOrderId && state.orders.some((order) => order.id === state.selectedOrderId)) {
    return;
  }

  state.selectedOrderId = state.orders.find(isActiveOrder)?.id ?? state.orders[0]?.id ?? null;
}

function getSelectedOrder() {
  if (state.selectedOrderId) {
    return state.orders.find((order) => order.id === state.selectedOrderId) ?? null;
  }

  return state.orders.find(isActiveOrder) ?? state.orders[0] ?? null;
}

function getVisibleOrders() {
  return filterOrdersByView(state.orders, state.orderFilter);
}

function getAvailableDashboardSections() {
  return getAvailableSections(state.session?.operator ?? null, state.appConfig ?? undefined);
}

function ensureSectionIsAvailable() {
  const availableSections = getAvailableDashboardSections();
  if (!availableSections.includes(state.section)) {
    state.section = availableSections[0] ?? "overview";
    persistSection(state.section);
  }
}

function resetDashboardData() {
  stopAutoRefresh();
  clearPendingCancel();
  state.appConfig = null;
  state.orders = [];
  state.menuCategories = [];
  state.storeConfig = null;
  state.teamUsers = [];
  state.selectedOrderId = null;
  state.lastRefreshedAt = null;
  state.busyOrderId = null;
  state.busyMenuItemId = null;
  state.busyMenuVisibilityItemId = null;
  state.busyDeleteMenuItemId = null;
  state.busyTeamUserId = null;
  state.savingStore = false;
  state.creatingMenuItem = false;
  state.creatingTeamUser = false;
}

async function signOut(message = "Signed out of the operator workspace.") {
  const currentSession = state.session;
  clearStoredSession();
  state.session = null;
  resetDashboardData();
  setError(null);
  setNotice(message);
  render();

  if (!currentSession) {
    return;
  }

  try {
    await logoutOperatorSession(currentSession);
  } catch {
    // Ignore remote logout failures when clearing a local browser session.
  }
}

async function ensureFreshSession() {
  if (!state.session) {
    return null;
  }

  if (!sessionNeedsRefresh(state.session.expiresAt)) {
    return state.session;
  }

  const refreshedSession = await refreshOperatorSession(state.session);
  state.session = refreshedSession;
  persistSession(refreshedSession);
  return refreshedSession;
}

async function loadDashboard() {
  if (!state.session) {
    state.loading = false;
    stopAutoRefresh();
    render();
    return;
  }

  if (state.loading) {
    return;
  }

  state.loading = true;
  setError(null);
  render();

  try {
    const session = await ensureFreshSession();
    if (!session) {
      return;
    }

    const snapshot = await fetchOperatorSnapshot(session);
    state.appConfig = snapshot.appConfig;
    state.orders = snapshot.orders;
    state.menuCategories = snapshot.menu.categories;
    state.storeConfig = snapshot.storeConfig;
    state.teamUsers = snapshot.staff;
    state.lastRefreshedAt = Date.now();
    ensureSectionIsAvailable();
    reconcileSelectedOrder();

    if (state.pendingCancelOrderId && !state.orders.some((order) => order.id === state.pendingCancelOrderId)) {
      clearPendingCancel();
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to load operator data.";
    if (message.toLowerCase().includes("refresh") || message.toLowerCase().includes("auth")) {
      await signOut("Your operator session expired. Sign in again to continue.");
      return;
    }
    setError(message);
  } finally {
    state.loading = false;
    startAutoRefresh();
    render();
  }
}

async function applyVerifiedSession(nextSession: OperatorSession, notice: string) {
  state.session = nextSession;
  state.authApiBaseUrl = nextSession.apiBaseUrl;
  state.authEmail = nextSession.operator.email;
  state.authToken = "";
  persistApiBaseUrl(nextSession.apiBaseUrl);
  persistSession(nextSession);
  setError(null);
  setNotice(notice);
  resetDashboardData();
  render();
  await loadDashboard();
}

function getMagicLinkTokenFromUrl() {
  if (typeof window === "undefined") {
    return null;
  }

  const url = new URL(window.location.href);
  return url.searchParams.get("operator_token");
}

function clearMagicLinkTokenFromUrl() {
  if (typeof window === "undefined") {
    return;
  }

  const url = new URL(window.location.href);
  url.searchParams.delete("operator_token");
  window.history.replaceState({}, document.title, url.toString());
}

async function bootstrap() {
  render();

  const urlToken = getMagicLinkTokenFromUrl();
  if (urlToken) {
    state.authToken = urlToken;
    state.verifyingMagicLink = true;
    state.initializing = false;
    setNotice("Verifying operator magic link…");
    render();

    try {
      const session = await verifyOperatorMagicLink({
        apiBaseUrl: state.authApiBaseUrl,
        token: urlToken
      });
      clearMagicLinkTokenFromUrl();
      state.verifyingMagicLink = false;
      await applyVerifiedSession(session, "Magic link accepted. Operator workspace unlocked.");
      return;
    } catch (error) {
      clearMagicLinkTokenFromUrl();
      state.verifyingMagicLink = false;
      state.initializing = false;
      setError(error instanceof Error ? error.message : "Unable to verify the operator magic link.");
      render();
      return;
    }
  }

  state.initializing = false;
  if (state.session) {
    await loadDashboard();
    return;
  }

  render();
}

function renderBanner() {
  if (!state.errorMessage && !state.notice) {
    return "";
  }

  const toneClass = state.errorMessage ? "banner banner--error" : "banner banner--notice";
  const message = state.errorMessage ?? state.notice ?? "";
  return `<div class="${toneClass}">${escapeHtml(message)}</div>`;
}

function renderAuthScreen() {
  return `
    <main class="auth-layout">
      <section class="auth-hero">
        <div class="auth-hero__badge">LatteLink Operator</div>
        <h1>Run store operations with the same polish as the customer app.</h1>
        <p class="auth-copy">
          Owners, managers, and staff use one workspace for live orders, menu controls, store settings, and team access.
          This dashboard now uses real operator sessions instead of a shared token.
        </p>
        <div class="auth-feature-list">
          <article class="feature-chip">
            <strong>Orders</strong>
            <span>Live prep board, handoff actions, and pickup-ready progression.</span>
          </article>
          <article class="feature-chip">
            <strong>Menu</strong>
            <span>Create items, adjust pricing, or only toggle visibility based on role.</span>
          </article>
          <article class="feature-chip">
            <strong>Team</strong>
            <span>Store-scoped access for owners, managers, and staff.</span>
          </article>
        </div>
      </section>

      <section class="auth-panel">
        <div class="auth-panel__header">
          <p class="eyebrow">Secure Access</p>
          <h2>Request a magic link</h2>
          <p class="muted-copy">Use the operator email assigned to your store account.</p>
        </div>

        ${renderBanner()}

        <form class="form-stack" data-form="auth-request-link">
          <label class="field">
            <span>Gateway API</span>
            <input name="apiBaseUrl" type="url" value="${escapeHtml(state.authApiBaseUrl)}" placeholder="http://127.0.0.1:8080/v1" required />
          </label>

          <label class="field">
            <span>Work email</span>
            <input name="email" type="email" value="${escapeHtml(state.authEmail)}" placeholder="owner@store.com" required />
          </label>

          <button class="button button--primary" type="submit" ${state.requestingMagicLink ? "disabled" : ""}>
            ${state.requestingMagicLink ? "Sending link…" : "Send magic link"}
          </button>
        </form>

        <div class="auth-divider"><span>or</span></div>

        <form class="form-stack" data-form="auth-verify-token">
          <label class="field">
            <span>Magic link token</span>
            <input name="token" value="${escapeHtml(state.authToken)}" placeholder="Paste token if you are testing locally" required />
          </label>

          <button class="button button--secondary" type="submit" ${state.verifyingMagicLink ? "disabled" : ""}>
            ${state.verifyingMagicLink ? "Verifying…" : "Verify token"}
          </button>
        </form>

        <p class="auth-footnote">
          Local default operator emails seed automatically in memory mode. Production stores should use invited staff accounts instead.
        </p>
      </section>
    </main>
  `;
}

function renderNavItems() {
  const availableSections = getAvailableDashboardSections();
  return availableSections
    .map(
      (section) => `
        <button
          class="nav-link ${state.section === section ? "nav-link--active" : ""}"
          type="button"
          data-action="set-section"
          data-section="${section}"
        >
          <span>${escapeHtml(section)}</span>
        </button>
      `
    )
    .join("");
}

function renderTopMetrics() {
  const activeOrders = filterOrdersByView(state.orders, "active").length;
  const visibleItems = countVisibleMenuItems(state.menuCategories);
  const hiddenItems = countHiddenMenuItems(state.menuCategories);
  const teamCount = state.teamUsers.length;

  return `
    <div class="hero-metrics">
      <article class="metric-card">
        <span class="metric-card__label">Active orders</span>
        <strong>${activeOrders}</strong>
      </article>
      <article class="metric-card">
        <span class="metric-card__label">Visible menu items</span>
        <strong>${visibleItems}</strong>
      </article>
      <article class="metric-card">
        <span class="metric-card__label">Hidden items</span>
        <strong>${hiddenItems}</strong>
      </article>
      <article class="metric-card">
        <span class="metric-card__label">Team members</span>
        <strong>${teamCount}</strong>
      </article>
    </div>
  `;
}

function renderRuntimeSummary() {
  if (!state.appConfig || !state.session) {
    return "";
  }

  const labels = getAppConfigCapabilityLabels(state.appConfig);
  const capabilityPills = state.session.operator.capabilities
    .map((capability: string) => `<span class="pill pill--accent">${escapeHtml(capability)}</span>`)
    .join("");
  const runtimePills = labels.map((label) => `<span class="pill">${escapeHtml(label)}</span>`).join("");

  return `
    <section class="panel panel--runtime">
      <div class="panel-header">
        <div>
          <p class="eyebrow">Runtime</p>
          <h3>Store capabilities and feature flags</h3>
        </div>
        <span class="subtle-chip">${escapeHtml(formatRelativeRefresh(state.lastRefreshedAt))}</span>
      </div>
      <div class="pill-row">${capabilityPills}${runtimePills}</div>
    </section>
  `;
}

function renderOverviewSection() {
  const storeName = state.storeConfig?.storeName ?? state.appConfig?.brand.locationName ?? "Operator workspace";
  const liveOrdersEnabled = state.appConfig?.featureFlags.orderTracking ? "Enabled" : "Disabled";
  const quickActions = getAvailableDashboardSections()
    .filter((section) => section !== "overview")
    .map(
      (section) => `
        <button class="quick-action" type="button" data-action="set-section" data-section="${section}">
          <strong>${escapeHtml(section)}</strong>
          <span>Open ${escapeHtml(section)} workspace</span>
        </button>
      `
    )
    .join("");
  const teamPreview = state.teamUsers
    .slice(0, 4)
    .map(
      (user) => `
        <div class="team-preview-row">
          <span>
            <strong>${escapeHtml(user.displayName)}</strong>
            <small>${escapeHtml(getOperatorRoleLabel(user.role))}</small>
          </span>
          <span class="subtle-chip ${user.active ? "" : "subtle-chip--muted"}">${user.active ? "Active" : "Inactive"}</span>
        </div>
      `
    )
    .join("");

  return `
    <section class="content-grid content-grid--overview">
      <article class="panel panel--spotlight">
        <p class="eyebrow">Store pulse</p>
        <h2>${escapeHtml(storeName)}</h2>
        <p class="muted-copy">
          Order tracking is <strong>${escapeHtml(liveOrdersEnabled)}</strong>. Menu editing is
          <strong>${state.appConfig?.featureFlags.menuEditing ? " enabled" : " read only"}</strong>.
        </p>
        ${renderTopMetrics()}
      </article>

      <article class="panel">
        <div class="panel-header">
          <div>
            <p class="eyebrow">Quick Actions</p>
            <h3>Jump into the next task</h3>
          </div>
        </div>
        <div class="quick-action-grid">${quickActions || `<p class="muted-copy">No additional sections available for this role.</p>`}</div>
      </article>

      <article class="panel">
        <div class="panel-header">
          <div>
            <p class="eyebrow">Store Settings</p>
            <h3>Operations summary</h3>
          </div>
        </div>
        <div class="detail-list">
          <div class="detail-row"><span>Hours</span><strong>${escapeHtml(state.storeConfig?.hours ?? "Unavailable")}</strong></div>
          <div class="detail-row"><span>Pickup</span><strong>${escapeHtml(state.storeConfig?.pickupInstructions ?? "Unavailable")}</strong></div>
          <div class="detail-row"><span>Location</span><strong>${escapeHtml(state.session?.operator.locationId ?? "Unknown")}</strong></div>
        </div>
      </article>

      <article class="panel">
        <div class="panel-header">
          <div>
            <p class="eyebrow">Team</p>
            <h3>Assigned operator access</h3>
          </div>
        </div>
        <div class="team-preview">${teamPreview || `<p class="muted-copy">No team directory access for this role.</p>`}</div>
      </article>
    </section>
  `;
}

function renderOrderFilterRow(activeOrderCount: number, completedOrderCount: number) {
  return (
    [
      { key: "active", label: "Active", count: activeOrderCount },
      { key: "all", label: "All", count: state.orders.length },
      { key: "completed", label: "Completed", count: completedOrderCount }
    ] as const
  )
    .map(
      (filter) => `
        <button
          class="filter-btn ${state.orderFilter === filter.key ? "filter-btn--active" : ""}"
          type="button"
          data-action="set-order-filter"
          data-order-filter="${filter.key}"
        >
          ${escapeHtml(filter.label)} <span>${filter.count}</span>
        </button>
      `
    )
    .join("");
}

function renderCancelButton(order: OperatorOrder, manualStatusControlsEnabled: boolean) {
  if (!manualStatusControlsEnabled || order.status === "COMPLETED" || order.status === "CANCELED") {
    return "";
  }

  const disabled = state.busyOrderId === order.id ? "disabled" : "";
  if (state.pendingCancelOrderId === order.id) {
    return `
      <div class="confirm-row">
        <button class="button button--danger" type="button" data-action="confirm-cancel-order" data-order-id="${order.id}" ${disabled}>
          Confirm cancel
        </button>
        <button class="button button--ghost" type="button" data-action="dismiss-cancel-order" data-order-id="${order.id}" ${disabled}>
          Back
        </button>
      </div>
    `;
  }

  return `
    <button class="button button--ghost" type="button" data-action="cancel-order" data-order-id="${order.id}" ${disabled}>
      Cancel order
    </button>
  `;
}

function renderOrderDetail(order: OperatorOrder, appConfig: AppConfig | null) {
  const manualStatusControlsEnabled = canManageOrderStatus(appConfig);
  const fulfillmentMode = appConfig?.fulfillment.mode ?? "time_based";
  const actions = getOrderActions(order, fulfillmentMode);
  const timeline = order.timeline
    .map(
      (entry) => `
        <div class="timeline-row">
          <strong>${escapeHtml(formatOrderStatus(entry.status))}</strong>
          <span>${escapeHtml(formatDateTime(entry.occurredAt))}</span>
          ${entry.note ? `<p>${escapeHtml(entry.note)}</p>` : ""}
        </div>
      `
    )
    .join("");
  const items = order.items
    .map((item) => {
      const selectedOptions = item.customization?.selectedOptions?.map((option) => option.optionLabel).join(" · ");
      return `
        <div class="line-item">
          <div>
            <strong>${item.quantity}x ${escapeHtml(item.itemName ?? item.itemId)}</strong>
            ${selectedOptions ? `<p>${escapeHtml(selectedOptions)}</p>` : ""}
            ${item.customization?.notes ? `<p>Note: ${escapeHtml(item.customization.notes)}</p>` : ""}
          </div>
          <span>${formatMoney(item.lineTotalCents ?? item.unitPriceCents * item.quantity)}</span>
        </div>
      `;
    })
    .join("");

  const actionButtons = actions
    .map(
      (action) => `
        <button
          class="button ${action.tone === "primary" ? "button--primary" : "button--secondary"}"
          type="button"
          data-action="advance-order"
          data-order-id="${order.id}"
          data-order-status="${action.status}"
          data-order-note="${escapeHtml(action.note ?? "")}"
          ${state.busyOrderId === order.id ? "disabled" : ""}
        >
          ${escapeHtml(action.label)}
        </button>
      `
    )
    .join("");

  return `
    <div class="panel-header">
      <div>
        <p class="eyebrow">Order Detail</p>
        <h3>${escapeHtml(order.pickupCode)}</h3>
        <p class="muted-copy">${escapeHtml(getOrderCustomerLabel(order))}</p>
      </div>
      <span class="subtle-chip">${escapeHtml(formatOrderStatus(order.status))}</span>
    </div>
    <p class="muted-copy">${escapeHtml(order.locationId)} · ${formatMoney(order.total.amountCents)}</p>
    <div class="detail-stack">${items || `<p class="muted-copy">No line items recorded for this order.</p>`}</div>
    ${
      manualStatusControlsEnabled
        ? `<div class="button-row">${actionButtons}${renderCancelButton(order, manualStatusControlsEnabled)}</div>`
        : `<p class="muted-copy">Time-based fulfillment is active, so manual order controls are disabled.</p>`
    }
    <div class="timeline-stack">${timeline}</div>
  `;
}

function renderOrdersSection() {
  if (!state.appConfig?.featureFlags.orderTracking) {
    return `
      <section class="panel">
        <p class="eyebrow">Orders</p>
        <h3>Live order tracking is disabled for this store.</h3>
        <p class="muted-copy">Enable the order-tracking feature flag before using the live operations board.</p>
      </section>
    `;
  }

  const activeOrders = filterOrdersByView(state.orders, "active");
  const completedOrders = filterOrdersByView(state.orders, "completed");
  const visibleOrders = getVisibleOrders();
  const selectedOrder = getSelectedOrder();
  const orderRows =
    visibleOrders.length > 0
      ? visibleOrders
          .map(
            (order) => `
              <button class="list-row ${selectedOrder?.id === order.id ? "list-row--selected" : ""}" type="button" data-action="select-order" data-order-id="${order.id}">
                <span>
                  <strong>${escapeHtml(order.pickupCode)}</strong>
                  <span class="list-subtitle">${escapeHtml(formatOrderStatus(order.status))} · ${escapeHtml(getOrderCustomerLabel(order))}</span>
                </span>
                <span class="list-amount">${formatMoney(order.total.amountCents)}</span>
              </button>
            `
          )
          .join("")
      : `<p class="muted-copy">No orders are loaded for the selected view.</p>`;

  return `
    <section class="content-grid content-grid--orders">
      <article class="panel">
        <div class="panel-header">
          <div>
            <p class="eyebrow">Orders</p>
            <h3>${visibleOrders.length} in view</h3>
          </div>
          <span class="subtle-chip">${escapeHtml(formatRelativeRefresh(state.lastRefreshedAt))}</span>
        </div>
        <div class="filter-row">${renderOrderFilterRow(activeOrders.length, completedOrders.length)}</div>
        <div class="list-stack">${orderRows}</div>
      </article>

      <article class="panel">
        ${selectedOrder ? renderOrderDetail(selectedOrder, state.appConfig) : `<p class="muted-copy">Select an order to inspect its line items and timeline.</p>`}
      </article>
    </section>
  `;
}

function renderMenuCategory(category: OperatorMenuCategory, canWrite: boolean, canToggleVisibility: boolean) {
  return `
    <article class="panel">
      <div class="panel-header">
        <div>
          <p class="eyebrow">Category</p>
          <h3>${escapeHtml(category.title)}</h3>
        </div>
        <span class="subtle-chip">${category.items.length} items</span>
      </div>
      <div class="card-stack">
        ${category.items
          .map((item) => {
            const visibilityButton = canToggleVisibility
              ? `
                  <button
                    class="button ${item.visible ? "button--secondary" : "button--ghost"}"
                    type="button"
                    data-action="toggle-menu-visibility"
                    data-item-id="${item.itemId}"
                    data-visible="${item.visible ? "false" : "true"}"
                    ${state.busyMenuVisibilityItemId === item.itemId ? "disabled" : ""}
                  >
                    ${state.busyMenuVisibilityItemId === item.itemId ? "Saving…" : item.visible ? "Hide item" : "Show item"}
                  </button>
                `
              : "";

            return `
              <form class="editor-card" data-form="menu-item" data-item-id="${item.itemId}">
                <div class="editor-card__header">
                  <div>
                    <strong>${escapeHtml(item.name)}</strong>
                    <p>${escapeHtml(item.description ?? item.itemId)}</p>
                  </div>
                  <span class="subtle-chip ${item.visible ? "" : "subtle-chip--muted"}">${item.visible ? "Visible" : "Hidden"}</span>
                </div>

                <label class="field">
                  <span>Name</span>
                  <input name="name" value="${escapeHtml(item.name)}" ${canWrite ? "" : "disabled"} required />
                </label>

                <label class="field">
                  <span>Price (cents)</span>
                  <input name="priceCents" type="number" min="0" step="1" value="${item.priceCents}" ${canWrite ? "" : "disabled"} required />
                </label>

                <label class="toggle toggle--inline">
                  <input type="checkbox" name="visible" ${item.visible ? "checked" : ""} ${canWrite ? "" : "disabled"} />
                  <span>${item.visible ? "Visible in app" : "Hidden from app"}</span>
                </label>

                <div class="button-row">
                  ${
                    canWrite
                      ? `
                          <button class="button button--secondary" type="submit" ${state.busyMenuItemId === item.itemId ? "disabled" : ""}>
                            ${state.busyMenuItemId === item.itemId ? "Saving…" : "Save item"}
                          </button>
                          <button class="button button--ghost" type="button" data-action="delete-menu-item" data-item-id="${item.itemId}" ${state.busyDeleteMenuItemId === item.itemId ? "disabled" : ""}>
                            ${state.busyDeleteMenuItemId === item.itemId ? "Removing…" : "Remove"}
                          </button>
                        `
                      : ""
                  }
                  ${visibilityButton}
                </div>
              </form>
            `;
          })
          .join("")}
      </div>
    </article>
  `;
}

function renderMenuSection() {
  const canWrite = Boolean(state.appConfig?.featureFlags.menuEditing) && canAccessCapability(state.session?.operator, "menu:write");
  const canToggleVisibility = Boolean(state.appConfig?.featureFlags.menuEditing) && canAccessCapability(state.session?.operator, "menu:visibility");
  const createForm = canWrite
    ? `
        <article class="panel panel--create">
          <div class="panel-header">
            <div>
              <p class="eyebrow">Create item</p>
              <h3>Add a menu item</h3>
            </div>
          </div>
          <form class="form-grid" data-form="menu-create">
            <label class="field">
              <span>Category</span>
              <select name="categoryId">
                ${state.menuCategories
                  .map((category) => `<option value="${escapeHtml(category.categoryId)}">${escapeHtml(category.title)}</option>`)
                  .join("")}
              </select>
            </label>
            <label class="field">
              <span>Name</span>
              <input name="name" placeholder="Seasonal latte" required />
            </label>
            <label class="field">
              <span>Description</span>
              <input name="description" placeholder="Short item description" />
            </label>
            <label class="field">
              <span>Price (cents)</span>
              <input name="priceCents" type="number" min="0" step="1" value="675" required />
            </label>
            <label class="toggle toggle--inline">
              <input type="checkbox" name="visible" checked />
              <span>Visible in customer app</span>
            </label>
            <button class="button button--primary" type="submit" ${state.creatingMenuItem ? "disabled" : ""}>
              ${state.creatingMenuItem ? "Creating…" : "Create item"}
            </button>
          </form>
        </article>
      `
    : "";

  return `
    <section class="section-stack">
      ${
        state.appConfig?.featureFlags.menuEditing
          ? ""
          : `<section class="panel"><p class="muted-copy">Menu editing is disabled for this store. Operators can review the live menu but cannot mutate it.</p></section>`
      }
      ${createForm}
      <section class="content-grid content-grid--menu">
        ${state.menuCategories.length > 0 ? state.menuCategories.map((category) => renderMenuCategory(category, canWrite, canToggleVisibility)).join("") : `<article class="panel"><p class="muted-copy">No menu data is available yet.</p></article>`}
      </section>
    </section>
  `;
}

function renderStoreSection() {
  if (!state.storeConfig) {
    return `<section class="panel"><p class="muted-copy">Loading store configuration…</p></section>`;
  }

  const canWrite = canAccessCapability(state.session?.operator, "store:write");

  return `
    <section class="panel panel--store">
      <div class="panel-header">
        <div>
          <p class="eyebrow">Store configuration</p>
          <h3>${escapeHtml(state.storeConfig.storeName)}</h3>
        </div>
        <span class="subtle-chip">${escapeHtml(state.storeConfig.locationId)}</span>
      </div>

      ${
        canWrite
          ? `
              <form class="form-stack" data-form="store-config">
                <label class="field">
                  <span>Store name</span>
                  <input name="storeName" value="${escapeHtml(state.storeConfig.storeName)}" required />
                </label>
                <label class="field">
                  <span>Hours</span>
                  <input name="hours" value="${escapeHtml(state.storeConfig.hours)}" required />
                </label>
                <label class="field">
                  <span>Pickup instructions</span>
                  <textarea name="pickupInstructions" rows="4" required>${escapeHtml(state.storeConfig.pickupInstructions)}</textarea>
                </label>
                <button class="button button--primary" type="submit" ${state.savingStore ? "disabled" : ""}>
                  ${state.savingStore ? "Saving…" : "Save store settings"}
                </button>
              </form>
            `
          : `
              <div class="detail-list">
                <div class="detail-row"><span>Store name</span><strong>${escapeHtml(state.storeConfig.storeName)}</strong></div>
                <div class="detail-row"><span>Hours</span><strong>${escapeHtml(state.storeConfig.hours)}</strong></div>
                <div class="detail-row"><span>Pickup instructions</span><strong>${escapeHtml(state.storeConfig.pickupInstructions)}</strong></div>
              </div>
            `
      }
    </section>
  `;
}

function renderTeamSection() {
  const canWrite = canAccessCapability(state.session?.operator, "staff:write");
  return `
    <section class="section-stack">
      ${
        canWrite
          ? `
              <article class="panel panel--create">
                <div class="panel-header">
                  <div>
                    <p class="eyebrow">Invite operator</p>
                    <h3>Add a team member</h3>
                  </div>
                </div>
                <form class="form-grid" data-form="team-create">
                  <label class="field">
                    <span>Name</span>
                    <input name="displayName" placeholder="Avery Quinn" required />
                  </label>
                  <label class="field">
                    <span>Email</span>
                    <input name="email" type="email" placeholder="avery@store.com" required />
                  </label>
                  <label class="field">
                    <span>Role</span>
                    <select name="role">
                      <option value="staff">Staff</option>
                      <option value="manager">Manager</option>
                      <option value="owner">Owner</option>
                    </select>
                  </label>
                  <button class="button button--primary" type="submit" ${state.creatingTeamUser ? "disabled" : ""}>
                    ${state.creatingTeamUser ? "Creating…" : "Create operator"}
                  </button>
                </form>
              </article>
            `
          : ""
      }

      <section class="content-grid content-grid--team">
        ${
          state.teamUsers.length > 0
            ? state.teamUsers
                .map(
                  (user) => `
                    <form class="editor-card editor-card--team" data-form="team-user" data-operator-user-id="${user.operatorUserId}">
                      <div class="editor-card__header">
                        <div>
                          <strong>${escapeHtml(user.displayName)}</strong>
                          <p>${escapeHtml(user.email)}</p>
                        </div>
                        <span class="subtle-chip ${user.active ? "" : "subtle-chip--muted"}">${user.active ? "Active" : "Inactive"}</span>
                      </div>

                      <label class="field">
                        <span>Name</span>
                        <input name="displayName" value="${escapeHtml(user.displayName)}" ${canWrite ? "" : "disabled"} />
                      </label>
                      <label class="field">
                        <span>Email</span>
                        <input name="email" type="email" value="${escapeHtml(user.email)}" ${canWrite ? "" : "disabled"} />
                      </label>
                      <label class="field">
                        <span>Role</span>
                        <select name="role" ${canWrite ? "" : "disabled"}>
                          ${(["owner", "manager", "staff"] as const)
                            .map((role) => `<option value="${role}" ${role === user.role ? "selected" : ""}>${escapeHtml(getOperatorRoleLabel(role))}</option>`)
                            .join("")}
                        </select>
                      </label>
                      <label class="toggle toggle--inline">
                        <input type="checkbox" name="active" ${user.active ? "checked" : ""} ${canWrite ? "" : "disabled"} />
                        <span>Account active</span>
                      </label>

                      ${
                        canWrite
                          ? `
                              <button class="button button--secondary" type="submit" ${state.busyTeamUserId === user.operatorUserId ? "disabled" : ""}>
                                ${state.busyTeamUserId === user.operatorUserId ? "Saving…" : "Save operator"}
                              </button>
                            `
                          : ""
                      }
                    </form>
                  `
                )
                .join("")
            : `<article class="panel"><p class="muted-copy">No team members available for this store yet.</p></article>`
        }
      </section>
    </section>
  `;
}

function renderDashboardContent() {
  switch (state.section) {
    case "orders":
      return renderOrdersSection();
    case "menu":
      return renderMenuSection();
    case "store":
      return renderStoreSection();
    case "team":
      return renderTeamSection();
    case "overview":
    default:
      return renderOverviewSection();
  }
}

function renderDashboard() {
  ensureSectionIsAvailable();

  return `
    <main class="app-shell">
      <aside class="sidebar">
        <div class="sidebar__brand">
          <p class="eyebrow">LatteLink</p>
          <h1>Operator</h1>
          <p class="muted-copy">Premium control surface for each store team.</p>
        </div>

        <nav class="sidebar__nav" aria-label="Operator sections">
          ${renderNavItems()}
        </nav>

        <div class="sidebar__footer">
          <div>
            <strong>${escapeHtml(state.session?.operator.displayName ?? "Operator")}</strong>
            <p>${escapeHtml(getOperatorRoleLabel(state.session?.operator.role ?? "staff"))}</p>
          </div>
          <span class="subtle-chip">${escapeHtml(state.session?.operator.locationId ?? "")}</span>
        </div>
      </aside>

      <section class="workspace">
        <header class="workspace-hero">
          <div>
            <p class="eyebrow">Client workspace</p>
            <h2>${escapeHtml(state.appConfig?.brand.locationName ?? state.storeConfig?.storeName ?? "Operator dashboard")}</h2>
            <p class="muted-copy">
              ${escapeHtml(state.appConfig?.brand.marketLabel ?? "Store operations")} · ${escapeHtml(formatRelativeRefresh(state.lastRefreshedAt))}
            </p>
          </div>
          <div class="button-row">
            <button class="button button--secondary" type="button" data-action="refresh" ${state.loading ? "disabled" : ""}>
              ${state.loading ? "Refreshing…" : "Refresh"}
            </button>
            <button class="button button--ghost" type="button" data-action="sign-out">Sign out</button>
          </div>
        </header>

        ${renderBanner()}
        ${renderRuntimeSummary()}
        ${renderDashboardContent()}
      </section>
    </main>
  `;
}

function render() {
  root.innerHTML = state.session ? renderDashboard() : renderAuthScreen();
}

async function handleMagicLinkRequest(form: HTMLFormElement) {
  const formData = new FormData(form);
  const apiBaseUrl = String(formData.get("apiBaseUrl") ?? resolveDefaultApiBaseUrl());
  const email = String(formData.get("email") ?? "").trim();

  if (!email) {
    setError("A work email is required.");
    render();
    return;
  }

  try {
    state.requestingMagicLink = true;
    state.authApiBaseUrl = apiBaseUrl;
    state.authEmail = email;
    persistApiBaseUrl(apiBaseUrl);
    setError(null);
    render();
    await requestOperatorMagicLink({ apiBaseUrl, email });
    setNotice(`Magic link sent to ${email}. Open the email on this device or paste the token below.`);
  } catch (error) {
    setError(error instanceof Error ? error.message : "Unable to request a magic link.");
  } finally {
    state.requestingMagicLink = false;
    render();
  }
}

async function handleMagicLinkVerify(form: HTMLFormElement) {
  const formData = new FormData(form);
  const token = String(formData.get("token") ?? "").trim();

  if (!token) {
    setError("A magic link token is required.");
    render();
    return;
  }

  try {
    state.verifyingMagicLink = true;
    state.authToken = token;
    setError(null);
    render();
    const session = await verifyOperatorMagicLink({
      apiBaseUrl: state.authApiBaseUrl,
      token
    });
    await applyVerifiedSession(session, "Operator session established.");
  } catch (error) {
    setError(error instanceof Error ? error.message : "Unable to verify the operator magic link.");
  } finally {
    state.verifyingMagicLink = false;
    render();
  }
}

async function handleMenuCreateSubmit(form: HTMLFormElement) {
  if (!state.session) {
    return;
  }

  const formData = new FormData(form);
  const visibleField = form.elements.namedItem("visible");
  const visible = visibleField instanceof HTMLInputElement ? visibleField.checked : true;

  try {
    state.creatingMenuItem = true;
    setError(null);
    render();
    await createOperatorMenuItem(state.session, {
      categoryId: formData.get("categoryId"),
      name: formData.get("name"),
      description: formData.get("description"),
      priceCents: formData.get("priceCents"),
      visible
    });
    setNotice("Created menu item.");
    form.reset();
    await loadDashboard();
  } catch (error) {
    setError(error instanceof Error ? error.message : "Unable to create menu item.");
  } finally {
    state.creatingMenuItem = false;
    render();
  }
}

async function handleMenuItemSubmit(form: HTMLFormElement) {
  if (!state.session) {
    return;
  }

  const itemId = form.dataset.itemId;
  if (!itemId) {
    return;
  }

  const formData = new FormData(form);
  const visibleField = form.elements.namedItem("visible");
  const visible = visibleField instanceof HTMLInputElement ? visibleField.checked : false;

  try {
    state.busyMenuItemId = itemId;
    setError(null);
    render();
    await updateOperatorMenuItem(state.session, itemId, {
      name: formData.get("name"),
      priceCents: formData.get("priceCents"),
      visible
    });
    setNotice(`Saved ${itemId}.`);
    await loadDashboard();
  } catch (error) {
    setError(error instanceof Error ? error.message : "Unable to save menu item.");
  } finally {
    state.busyMenuItemId = null;
    render();
  }
}

async function handleStoreSubmit(form: HTMLFormElement) {
  if (!state.session) {
    return;
  }

  const formData = new FormData(form);
  try {
    state.savingStore = true;
    setError(null);
    render();
    await updateOperatorStoreConfig(state.session, {
      storeName: formData.get("storeName"),
      hours: formData.get("hours"),
      pickupInstructions: formData.get("pickupInstructions")
    });
    setNotice("Saved store settings.");
    await loadDashboard();
  } catch (error) {
    setError(error instanceof Error ? error.message : "Unable to save store settings.");
  } finally {
    state.savingStore = false;
    render();
  }
}

async function handleTeamCreateSubmit(form: HTMLFormElement) {
  if (!state.session) {
    return;
  }

  const formData = new FormData(form);

  try {
    state.creatingTeamUser = true;
    setError(null);
    render();
    await createOperatorStaffUser(state.session, {
      displayName: formData.get("displayName"),
      email: formData.get("email"),
      role: formData.get("role")
    });
    setNotice("Created operator account.");
    form.reset();
    await loadDashboard();
  } catch (error) {
    setError(error instanceof Error ? error.message : "Unable to create operator account.");
  } finally {
    state.creatingTeamUser = false;
    render();
  }
}

async function handleTeamUserSubmit(form: HTMLFormElement) {
  if (!state.session) {
    return;
  }

  const operatorUserId = form.dataset.operatorUserId;
  if (!operatorUserId) {
    return;
  }

  const formData = new FormData(form);
  const activeField = form.elements.namedItem("active");
  const active = activeField instanceof HTMLInputElement ? activeField.checked : false;

  try {
    state.busyTeamUserId = operatorUserId;
    setError(null);
    render();
    await updateOperatorStaffUser(state.session, operatorUserId, {
      displayName: formData.get("displayName"),
      email: formData.get("email"),
      role: formData.get("role"),
      active
    });
    setNotice("Updated operator access.");
    await loadDashboard();
  } catch (error) {
    setError(error instanceof Error ? error.message : "Unable to update operator access.");
  } finally {
    state.busyTeamUserId = null;
    render();
  }
}

async function handleOrderAdvance(orderId: string, status: "IN_PREP" | "READY" | "COMPLETED" | "CANCELED", note?: string) {
  if (!state.session) {
    return;
  }

  if (!canManageOrderStatus(state.appConfig)) {
    setError("Manual order status controls are disabled while time-based fulfillment is active.");
    render();
    return;
  }

  try {
    state.busyOrderId = orderId;
    clearPendingCancel();
    setError(null);
    render();
    await updateOperatorOrderStatus(state.session, orderId, { status, note });
    setNotice(`Updated order to ${formatOrderStatus(status)}.`);
    await loadDashboard();
  } catch (error) {
    setError(error instanceof Error ? error.message : "Unable to update order.");
  } finally {
    state.busyOrderId = null;
    render();
  }
}

async function handleMenuVisibilityToggle(itemId: string, visible: boolean) {
  if (!state.session) {
    return;
  }

  try {
    state.busyMenuVisibilityItemId = itemId;
    setError(null);
    render();
    await updateOperatorMenuItemVisibility(state.session, itemId, visible);
    setNotice(visible ? "Item is visible in the app." : "Item was hidden from the app.");
    await loadDashboard();
  } catch (error) {
    setError(error instanceof Error ? error.message : "Unable to change item visibility.");
  } finally {
    state.busyMenuVisibilityItemId = null;
    render();
  }
}

async function handleMenuItemDelete(itemId: string) {
  if (!state.session) {
    return;
  }

  if (typeof window !== "undefined" && !window.confirm("Remove this menu item from the operator-managed menu?")) {
    return;
  }

  try {
    state.busyDeleteMenuItemId = itemId;
    setError(null);
    render();
    await deleteOperatorMenuItem(state.session, itemId);
    setNotice("Menu item removed.");
    await loadDashboard();
  } catch (error) {
    setError(error instanceof Error ? error.message : "Unable to remove the menu item.");
  } finally {
    state.busyDeleteMenuItemId = null;
    render();
  }
}

root.addEventListener("submit", (event) => {
  const target = event.target;
  if (!(target instanceof HTMLFormElement)) {
    return;
  }

  event.preventDefault();
  const formType = target.dataset.form;
  if (formType === "auth-request-link") {
    void handleMagicLinkRequest(target);
    return;
  }
  if (formType === "auth-verify-token") {
    void handleMagicLinkVerify(target);
    return;
  }
  if (formType === "menu-create") {
    void handleMenuCreateSubmit(target);
    return;
  }
  if (formType === "menu-item") {
    void handleMenuItemSubmit(target);
    return;
  }
  if (formType === "store-config") {
    void handleStoreSubmit(target);
    return;
  }
  if (formType === "team-create") {
    void handleTeamCreateSubmit(target);
    return;
  }
  if (formType === "team-user") {
    void handleTeamUserSubmit(target);
  }
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
  if (action === "refresh") {
    void loadDashboard();
    return;
  }

  if (action === "sign-out") {
    void signOut();
    return;
  }

  if (action === "set-section") {
    const section = actionElement.dataset.section;
    if (section === "overview" || section === "orders" || section === "menu" || section === "store" || section === "team") {
      if (section !== "orders") {
        stopAutoRefresh();
        clearPendingCancel();
      }

      state.section = section;
      persistSection(section);
      render();

      if (section === "orders") {
        startAutoRefresh();
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
      void handleOrderAdvance(orderId, "CANCELED", "Canceled by operator");
    }
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
  }
});

void bootstrap();
