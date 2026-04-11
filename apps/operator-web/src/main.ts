import "./styles.css";
import {
  isOrderTrackingEnabled,
  isPlatformManagedMenu,
  isStaffDashboardEnabled,
  resolveAppConfigFulfillmentMode,
  type AdminStoreConfig,
  type AppConfig,
  type MenuItemCustomizationGroup
} from "@gazelle/contracts-catalog";
import {
  createOperatorMenuItem,
  createOperatorStaffUser,
  deleteOperatorMenuItem,
  exchangeOperatorGoogleCode,
  fetchOperatorAuthProviders,
  fetchOperatorSnapshot,
  isApiRequestError,
  logoutOperatorSession,
  refreshOperatorSession,
  resolveDefaultApiBaseUrl,
  signInOperatorWithPassword,
  startOperatorGoogleSignIn,
  replaceOperatorNewsCards,
  updateOperatorMenuItem,
  updateOperatorMenuItemVisibility,
  updateOperatorOrderStatus,
  updateOperatorStaffUser,
  updateOperatorStoreConfig,
  type OperatorAuthProviders,
  type OperatorSession,
  type OperatorUser
} from "./api.js";
import {
  canAdvanceOrderStatus,
  canAccessCapability,
  canCancelOrder,
  canCreateMenuItems,
  getOrderDetailActionUnavailableMessage,
  canManageTeamMembers,
  canToggleMenuItemVisibility,
  canUpdateStoreSettings,
  filterOrdersByView,
  formatOrderStatus,
  getAvailableSections,
  getOrderCancelUnavailableMessage,
  getOrderControlUnavailableMessage,
  getOperatorRoleLabel,
  getOrderActions,
  getOrderCustomerLabel,
  isActiveOrder,
  sessionNeedsRefresh,
  type DashboardSection,
  type OperatorMenuCategory,
  type OperatorMenuItem,
  type OperatorNewsCard,
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
  authPassword: string;
  authProviders: OperatorAuthProviders | null;
  initializing: boolean;
  loading: boolean;
  signingIn: boolean;
  errorMessage: string | null;
  notice: string | null;
  appConfig: AppConfig | null;
  orders: OperatorOrder[];
  orderFilter: OperatorOrderFilter;
  menuCategories: OperatorMenuCategory[];
  menuCustomizationDrafts: Record<string, MenuItemCustomizationGroup[]>;
  newsCards: OperatorNewsCard[];
  storeConfig: AdminStoreConfig | null;
  teamUsers: OperatorUser[];
  selectedOrderId: string | null;
  busyOrderId: string | null;
  busyMenuItemId: string | null;
  busyMenuVisibilityItemId: string | null;
  busyDeleteMenuItemId: string | null;
  busyNewsCardId: string | null;
  busyNewsCardVisibilityId: string | null;
  busyDeleteNewsCardId: string | null;
  busyTeamUserId: string | null;
  savingStore: boolean;
  creatingMenuItem: boolean;
  creatingNewsCard: boolean;
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
  authPassword: "",
  authProviders: null,
  initializing: true,
  loading: false,
  signingIn: false,
  errorMessage: null,
  notice: null,
  appConfig: null,
  orders: [],
  orderFilter: "active",
  menuCategories: [],
  menuCustomizationDrafts: {},
  newsCards: [],
  storeConfig: null,
  teamUsers: [],
  selectedOrderId: null,
  busyOrderId: null,
  busyMenuItemId: null,
  busyMenuVisibilityItemId: null,
  busyDeleteMenuItemId: null,
  busyNewsCardId: null,
  busyNewsCardVisibilityId: null,
  busyDeleteNewsCardId: null,
  busyTeamUserId: null,
  savingStore: false,
  creatingMenuItem: false,
  creatingNewsCard: false,
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

function isLocalDevAccessEnabled() {
  if (import.meta.env.DEV) {
    return true;
  }

  if (typeof window === "undefined") {
    return false;
  }

  return window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1";
}

function isGoogleSignInConfigured() {
  return state.authProviders?.google.configured === true;
}

async function loadAuthProviders() {
  const apiBaseUrl = state.authApiBaseUrl || resolveDefaultApiBaseUrl();

  try {
    state.authProviders = await fetchOperatorAuthProviders({ apiBaseUrl });
  } catch {
    state.authProviders = {
      google: {
        configured: false
      }
    };
  } finally {
    if (!state.session) {
      render();
    }
  }
}

function getGoogleCallbackRedirectUri() {
  if (typeof window === "undefined") {
    return "http://127.0.0.1/?google_auth_callback=1";
  }

  const url = new URL(window.location.href);
  url.pathname = "/";
  url.hash = "";
  url.search = "";
  url.searchParams.set("google_auth_callback", "1");
  return url.toString();
}

function readGoogleCallbackParams() {
  if (typeof window === "undefined") {
    return null;
  }

  const url = new URL(window.location.href);
  if (url.searchParams.get("google_auth_callback") !== "1") {
    return null;
  }

  const code = url.searchParams.get("code");
  const stateValue = url.searchParams.get("state");
  const error = url.searchParams.get("error");

  return {
    redirectUri: getGoogleCallbackRedirectUri(),
    code: code?.trim() || undefined,
    state: stateValue?.trim() || undefined,
    error: error?.trim() || undefined
  };
}

function clearGoogleCallbackParams() {
  if (typeof window === "undefined") {
    return;
  }

  const url = new URL(window.location.href);
  url.searchParams.delete("google_auth_callback");
  url.searchParams.delete("code");
  url.searchParams.delete("state");
  url.searchParams.delete("scope");
  url.searchParams.delete("authuser");
  url.searchParams.delete("prompt");
  url.searchParams.delete("error");
  url.searchParams.delete("error_subtype");
  const nextPath = `${url.pathname}${url.search}${url.hash}`;
  window.history.replaceState({}, document.title, nextPath);
}

function setNotice(message: string | null) {
  state.notice = message;
}

function setError(message: string | null) {
  state.errorMessage = message;
}

function isSessionAuthFailure(error: unknown) {
  if (isApiRequestError(error)) {
    return error.statusCode === 401;
  }

  return error instanceof Error && (error.message.toLowerCase().includes("refresh") || error.message.toLowerCase().includes("auth"));
}

async function handleOperatorActionError(error: unknown, fallbackMessage: string) {
  if (isSessionAuthFailure(error)) {
    await signOut("Your client dashboard session expired. Sign in again to continue.");
    return;
  }

  setError(error instanceof Error ? error.message : fallbackMessage);
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

function cloneCustomizationGroups(groups: readonly MenuItemCustomizationGroup[]) {
  return groups.map((group) => ({
    ...group,
    options: group.options.map((option) => ({ ...option }))
  }));
}

function snapshotCustomizationDrafts(categories: readonly OperatorMenuCategory[]) {
  const drafts: Record<string, MenuItemCustomizationGroup[]> = {};
  for (const category of categories) {
    for (const item of category.items) {
      drafts[item.itemId] = cloneCustomizationGroups(item.customizationGroups ?? []);
    }
  }
  return drafts;
}

function findMenuItem(itemId: string): OperatorMenuItem | null {
  for (const category of state.menuCategories) {
    const found = category.items.find((item) => item.itemId === itemId);
    if (found) {
      return found;
    }
  }
  return null;
}

function ensureMenuCustomizationDraft(itemId: string) {
  if (!state.menuCustomizationDrafts[itemId]) {
    const menuItem = findMenuItem(itemId);
    state.menuCustomizationDrafts[itemId] = cloneCustomizationGroups(menuItem?.customizationGroups ?? []);
  }
  return state.menuCustomizationDrafts[itemId] ?? [];
}

function parseIntegerOrFallback(value: string, fallback = 0) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function createCustomizationOptionDraft(sortOrder: number): MenuItemCustomizationGroup["options"][number] {
  return {
    id: globalThis.crypto.randomUUID(),
    label: "New option",
    description: undefined,
    priceDeltaCents: 0,
    default: false,
    available: true,
    sortOrder,
    displayStyle: undefined
  };
}

function createCustomizationGroupDraft(sortOrder: number): MenuItemCustomizationGroup {
  return {
    id: globalThis.crypto.randomUUID(),
    sourceGroupId: undefined,
    label: "New group",
    description: undefined,
    selectionType: "single",
    required: false,
    minSelections: 0,
    maxSelections: 1,
    sortOrder,
    displayStyle: undefined,
    options: [createCustomizationOptionDraft(0)]
  };
}

function sanitizeCustomizationGroupsForSubmit(groups: readonly MenuItemCustomizationGroup[]) {
  return groups.map((group) => ({
    id: group.id,
    sourceGroupId: group.sourceGroupId,
    label: group.label,
    description: group.description,
    selectionType: group.selectionType,
    required: group.required,
    sortOrder: group.sortOrder,
    displayStyle: group.displayStyle,
    options: group.options.map((option) => ({
      id: option.id,
      label: option.label,
      description: option.description,
      priceDeltaCents: option.priceDeltaCents,
      default: option.default,
      available: option.available,
      sortOrder: option.sortOrder,
      displayStyle: option.displayStyle
    }))
  }));
}

function updateCustomizationDraftFromInput(target: EventTarget | null) {
  if (!(target instanceof HTMLInputElement || target instanceof HTMLSelectElement)) {
    return false;
  }

  const itemId = target.dataset.customizationItemId;
  const groupIndexValue = target.dataset.customizationGroupIndex;
  const field = target.dataset.customizationField;
  if (!itemId || !groupIndexValue || !field) {
    return false;
  }

  const groupIndex = Number.parseInt(groupIndexValue, 10);
  if (!Number.isFinite(groupIndex)) {
    return false;
  }

  const draft = ensureMenuCustomizationDraft(itemId);
  const group = draft[groupIndex];
  if (!group) {
    return false;
  }

  const optionIndexValue = target.dataset.customizationOptionIndex;
  if (optionIndexValue !== undefined) {
    const optionIndex = Number.parseInt(optionIndexValue, 10);
    if (!Number.isFinite(optionIndex)) {
      return false;
    }
    const option = group.options[optionIndex];
    if (!option) {
      return false;
    }

    if (field === "label") {
      option.label = target.value;
    } else if (field === "priceDeltaCents") {
      option.priceDeltaCents = parseIntegerOrFallback(target.value, option.priceDeltaCents);
    } else if (field === "default" && target instanceof HTMLInputElement) {
      option.default = target.checked;
    } else if (field === "available" && target instanceof HTMLInputElement) {
      option.available = target.checked;
    } else if (field === "sortOrder") {
      option.sortOrder = parseIntegerOrFallback(target.value, option.sortOrder ?? optionIndex);
    }

    return true;
  }

  if (field === "label") {
    group.label = target.value;
  } else if (field === "selectionType") {
    group.selectionType = target.value === "single" ? "single" : "multiple";
  } else if (field === "required" && target instanceof HTMLInputElement) {
    group.required = target.checked;
  } else if (field === "sortOrder") {
    group.sortOrder = parseIntegerOrFallback(target.value, group.sortOrder ?? groupIndex);
  }

  return true;
}

function getAvailableDashboardSections() {
  return getAvailableSections(state.session?.operator ?? null, state.appConfig ?? undefined);
}

const dashboardSectionLabels: Record<DashboardSection, string> = {
  overview: "Overview",
  orders: "Orders",
  menu: "Menu",
  cards: "News cards",
  team: "Team",
  store: "Settings"
};

type MetricTrendTone = "positive" | "neutral" | "negative";

function getDashboardSectionLabel(section: DashboardSection) {
  return dashboardSectionLabels[section];
}

function startOfLocalDay(value: Date) {
  const next = new Date(value);
  next.setHours(0, 0, 0, 0);
  return next;
}

function addDays(value: Date, amount: number) {
  const next = new Date(value);
  next.setDate(next.getDate() + amount);
  return next;
}

function getOrderPlacedAt(order: OperatorOrder) {
  const timestamps = order.timeline
    .map((entry) => Date.parse(entry.occurredAt))
    .filter((value): value is number => Number.isFinite(value));

  return timestamps.length > 0 ? Math.min(...timestamps) : Date.now();
}

function formatCompactCount(value: number) {
  return new Intl.NumberFormat("en-US").format(value);
}

function formatCompactMoney(amountCents: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0
  }).format(amountCents / 100);
}

function buildMetricTrend(params: {
  current: number;
  previous: number;
  suffix: string;
  formatter?: (value: number) => string;
}): { text: string; tone: MetricTrendTone } {
  const { current, previous, suffix, formatter = formatCompactCount } = params;
  if (current === previous) {
    return { text: `No change ${suffix}`, tone: "neutral" };
  }

  if (previous <= 0) {
    const direction = current > previous ? "↑" : "↓";
    return {
      text: `${direction} ${formatter(Math.abs(current - previous))} ${suffix}`,
      tone: current > previous ? "positive" : "negative"
    };
  }

  const deltaRatio = Math.round((Math.abs(current - previous) / previous) * 100);
  return {
    text: `${current > previous ? "↑" : "↓"} ${deltaRatio}% ${suffix}`,
    tone: current > previous ? "positive" : "negative"
  };
}

function formatDashboardDate() {
  return new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric"
  }).format(new Date());
}

function getOperatorInitials(name: string | undefined) {
  const tokens = (name ?? "Client")
    .split(/\s+/)
    .map((token) => token.trim())
    .filter((token) => token.length > 0)
    .slice(0, 2);

  return tokens.map((token) => token[0]?.toUpperCase() ?? "").join("") || "OP";
}

function getOverviewSnapshot() {
  const now = new Date();
  const todayStart = startOfLocalDay(now);
  const tomorrowStart = addDays(todayStart, 1);
  const yesterdayStart = addDays(todayStart, -1);
  const todayStartMs = todayStart.getTime();
  const tomorrowStartMs = tomorrowStart.getTime();
  const yesterdayStartMs = yesterdayStart.getTime();

  const todayOrders = state.orders.filter((order) => {
    const placedAt = getOrderPlacedAt(order);
    return placedAt >= todayStartMs && placedAt < tomorrowStartMs;
  });
  const yesterdayOrders = state.orders.filter((order) => {
    const placedAt = getOrderPlacedAt(order);
    return placedAt >= yesterdayStartMs && placedAt < todayStartMs;
  });
  const todayRevenueCents = todayOrders
    .filter((order) => order.status !== "PENDING_PAYMENT" && order.status !== "CANCELED")
    .reduce((total, order) => total + order.total.amountCents, 0);
  const yesterdayRevenueCents = yesterdayOrders
    .filter((order) => order.status !== "PENDING_PAYMENT" && order.status !== "CANCELED")
    .reduce((total, order) => total + order.total.amountCents, 0);

  const activeMembers =
    state.teamUsers.length > 0 ? state.teamUsers.filter((user) => user.active).length : state.session ? 1 : 0;
  const totalMembers = state.teamUsers.length > 0 ? state.teamUsers.length : activeMembers;
  const activeMemberTrend =
    totalMembers > 0
      ? {
          text: `${formatCompactCount(totalMembers)} total on the roster`,
          tone: "positive" as const
        }
      : {
          text: "Add staff access to populate this workspace",
          tone: "neutral" as const
        };

  const chartStart = addDays(todayStart, -6);
  const rawChartBars = Array.from({ length: 7 }, (_, index) => {
    const dayStart = addDays(chartStart, index);
    const dayEnd = addDays(dayStart, 1);
    const count = state.orders.filter((order) => {
      const placedAt = getOrderPlacedAt(order);
      return placedAt >= dayStart.getTime() && placedAt < dayEnd.getTime();
    }).length;

    return {
      label: dayStart.toLocaleDateString("en-US", { weekday: "short" }),
      count
    };
  });
  const maxBarCount = Math.max(...rawChartBars.map((bar) => bar.count), 1);

  return {
    chartBars: rawChartBars.map((bar) => ({
      ...bar,
      height: Math.max(18, Math.round((bar.count / maxBarCount) * 100)),
      highlighted: bar.count === maxBarCount && maxBarCount > 0
    })),
    metrics: [
      {
        label: "Today's orders",
        value: formatCompactCount(todayOrders.length),
        trend: buildMetricTrend({
          current: todayOrders.length,
          previous: yesterdayOrders.length,
          suffix: "vs yesterday"
        })
      },
      {
        label: "Revenue",
        value: formatCompactMoney(todayRevenueCents),
        trend: buildMetricTrend({
          current: todayRevenueCents,
          previous: yesterdayRevenueCents,
          suffix: "vs yesterday",
          formatter: formatCompactMoney
        })
      },
      {
        label: "Active members",
        value: formatCompactCount(activeMembers),
        trend: activeMemberTrend
      }
    ]
  };
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
  state.menuCustomizationDrafts = {};
  state.newsCards = [];
  state.storeConfig = null;
  state.teamUsers = [];
  state.selectedOrderId = null;
  state.lastRefreshedAt = null;
  state.busyOrderId = null;
  state.busyMenuItemId = null;
  state.busyMenuVisibilityItemId = null;
  state.busyDeleteMenuItemId = null;
  state.busyNewsCardId = null;
  state.busyNewsCardVisibilityId = null;
  state.busyDeleteNewsCardId = null;
  state.busyTeamUserId = null;
  state.savingStore = false;
  state.creatingMenuItem = false;
  state.creatingNewsCard = false;
  state.creatingTeamUser = false;
}

async function signOut(message = "Signed out of the client dashboard.") {
  const currentSession = state.session;
  clearStoredSession();
  state.session = null;
  state.authPassword = "";
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
    state.menuCustomizationDrafts = snapshotCustomizationDrafts(snapshot.menu.categories);
    state.newsCards = snapshot.cards;
    state.storeConfig = snapshot.storeConfig;
    state.teamUsers = snapshot.staff;
    state.lastRefreshedAt = Date.now();
    ensureSectionIsAvailable();
    reconcileSelectedOrder();

    if (state.pendingCancelOrderId && !state.orders.some((order) => order.id === state.pendingCancelOrderId)) {
      clearPendingCancel();
    }
  } catch (error) {
    if (isSessionAuthFailure(error)) {
      await signOut("Your client dashboard session expired. Sign in again to continue.");
      return;
    }
    setError(error instanceof Error ? error.message : "Unable to load client dashboard data.");
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
  state.authPassword = "";
  persistApiBaseUrl(nextSession.apiBaseUrl);
  persistSession(nextSession);
  setError(null);
  setNotice(notice);
  resetDashboardData();
  render();
  await loadDashboard();
}

async function bootstrap() {
  render();

  state.initializing = false;
  void loadAuthProviders();
  const handledGoogleCallback = await handleGoogleCallback();
  if (handledGoogleCallback) {
    return;
  }

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

function renderBrandMark() {
  return `
    <span class="brand-mark" aria-hidden="true">
      <svg viewBox="0 0 54 54" fill="none">
        <path d="M14 8 L14 36 Q14 45 23 45 L45 45" stroke="white" stroke-width="4.5" stroke-linecap="round" />
        <path d="M23 23 A13 13 0 0 1 36 36" stroke="white" stroke-width="2.5" stroke-linecap="round" opacity="0.7" />
        <circle cx="14" cy="8" r="5.5" fill="white" />
        <circle cx="45" cy="45" r="5.5" fill="white" />
      </svg>
    </span>
  `;
}

function renderAuthScreen() {
  const showLocalDevHints = isLocalDevAccessEnabled();
  const showApiField = showLocalDevHints;
  const googleSsoConfigured = isGoogleSignInConfigured();
  const googleButtonHint =
    state.authProviders === null
      ? "Checking availability"
      : googleSsoConfigured
        ? "Use your store Google account"
        : "Unavailable for this environment";

  return `
    <div class="auth-page">
      <header class="auth-nav">
        <div class="auth-nav__shell">
          <div class="brand-lockup">
            ${renderBrandMark()}
            <span class="brand-wordmark">Latte<span>Link</span></span>
          </div>
          <span class="auth-nav__tag">Client Dashboard</span>
        </div>
      </header>

      <main class="auth-stage">
        <section class="auth-card">
          <div class="auth-card__header">
            <p class="eyebrow">Store access</p>
            <h1>Sign in to your client dashboard.</h1>
            <p class="muted-copy">Use the email and password assigned to your store account.</p>
          </div>

          ${renderBanner()}

          <form class="auth-stack" data-form="auth-sign-in">
            <label class="field">
              <span>Work email</span>
              <input name="email" type="email" value="${escapeHtml(state.authEmail)}" placeholder="owner@store.com" required />
            </label>

            <label class="field">
              <span>Password</span>
              <input name="password" type="password" value="${escapeHtml(state.authPassword)}" placeholder="Enter your password" required />
            </label>

            ${
              showApiField
                ? `
                    <label class="field field--compact">
                      <span>Gateway API</span>
                      <input name="apiBaseUrl" type="url" value="${escapeHtml(state.authApiBaseUrl)}" placeholder="http://127.0.0.1:8080/v1" required />
                    </label>
                  `
                : ""
            }

            <button class="button button--primary" type="submit" ${state.signingIn ? "disabled" : ""}>
              ${state.signingIn ? "Signing in…" : "Sign in"}
            </button>
          </form>

          <div class="auth-divider"><span>or continue with SSO</span></div>

          <div class="sso-stack">
            <button class="sso-button" type="button" disabled>
              <span class="sso-button__icon">A</span>
              <span class="sso-button__meta">
                <strong>Sign in with Apple</strong>
                <small>Coming soon</small>
              </span>
            </button>
            <button
              class="sso-button"
              type="button"
              data-action="start-google-sign-in"
              ${state.signingIn || !googleSsoConfigured ? "disabled" : ""}
            >
              <span class="sso-button__icon">G</span>
              <span class="sso-button__meta">
                <strong>Sign in with Google</strong>
                <small>${escapeHtml(googleButtonHint)}</small>
              </span>
            </button>
          </div>
        </section>
      </main>
    </div>
  `;
}

function renderNavItems() {
  const availableSections = getAvailableDashboardSections();
  const activeOrders = filterOrdersByView(state.orders, "active").length;
  return availableSections
    .map(
      (section) => {
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
      }
    )
    .join("");
}

function renderTopMetrics() {
  const overview = getOverviewSnapshot();

  return `
    <div class="dash-kpi-row">
      ${overview.metrics
        .map(
          (metric) => `
            <article class="dash-kpi-card">
              <span class="dash-kpi-label">${escapeHtml(metric.label)}</span>
              <strong class="dash-kpi-value">${escapeHtml(metric.value)}</strong>
              <span class="dash-kpi-delta dash-kpi-delta--${metric.trend.tone}">${escapeHtml(metric.trend.text)}</span>
            </article>
          `
        )
        .join("")}
    </div>
  `;
}

function renderOverviewSection() {
  const overview = getOverviewSnapshot();
  const chartBars = overview.chartBars
    .map(
      (bar) => `
        <div class="dash-bar-column">
          <div class="dash-bar ${bar.highlighted ? "dash-bar--active" : ""}" style="height: ${bar.height}%"></div>
          <span class="dash-bar-label">${escapeHtml(bar.label)}</span>
        </div>
      `
    )
    .join("");

  return `
    <section class="dash-overview">
      ${renderTopMetrics()}
      <section class="dash-chart-panel">
        <div class="dash-panel-header">
          <div class="dash-panel-title">Orders — Last 7 Days</div>
        </div>
        <div class="dash-chart-body">
          <div class="dash-bars">${chartBars}</div>
        </div>
      </section>
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
          class="dash-segment-button ${state.orderFilter === filter.key ? "dash-segment-button--active" : ""}"
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

function getOrderStatusTone(status: OperatorOrder["status"]) {
  switch (status) {
    case "READY":
    case "COMPLETED":
      return "success";
    case "CANCELED":
      return "danger";
    case "IN_PREP":
      return "warning";
    case "PENDING_PAYMENT":
    default:
      return "neutral";
  }
}

function renderOrderStatusBadge(status: OperatorOrder["status"]) {
  return `<span class="dash-status-badge dash-status-badge--${getOrderStatusTone(status)}">${escapeHtml(formatOrderStatus(status))}</span>`;
}

function renderSectionHeading(config: {
  eyebrow: string;
  title: string;
  description: string;
  actions?: string;
}) {
  return `
    <div class="dash-section-heading">
      <div>
        <div class="dash-panel-title">${escapeHtml(config.eyebrow)}</div>
        <h2 class="dash-section-title">${escapeHtml(config.title)}</h2>
        <p class="muted-copy">${escapeHtml(config.description)}</p>
      </div>
      ${config.actions ? `<div class="dash-section-actions">${config.actions}</div>` : ""}
    </div>
  `;
}

function renderCancelButton(order: OperatorOrder) {
  if (order.status === "COMPLETED" || order.status === "CANCELED") {
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
  const manualStatusControlsEnabled = canAdvanceOrderStatus(state.session?.operator ?? null, appConfig);
  const cancelControlsEnabled = canCancelOrder(state.session?.operator ?? null, appConfig, order);
  const fulfillmentMode = resolveAppConfigFulfillmentMode(appConfig);
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
  const controlButtons = [
    manualStatusControlsEnabled ? actionButtons : "",
    cancelControlsEnabled ? renderCancelButton(order) : ""
  ]
    .filter((markup) => markup.length > 0)
    .join("");
  const latestTimelineEntry = order.timeline[order.timeline.length - 1];

  return `
    <div class="dash-detail-header">
      <div>
        <div class="dash-panel-title">Order detail</div>
        <h3 class="dash-surface-title">${escapeHtml(order.pickupCode)}</h3>
        <p class="muted-copy">${escapeHtml(getOrderCustomerLabel(order))}</p>
      </div>
      ${renderOrderStatusBadge(order.status)}
    </div>
    <div class="dash-detail-grid">
      <div class="dash-detail-metric">
        <span>Store</span>
        <strong>${escapeHtml(order.locationId)}</strong>
      </div>
      <div class="dash-detail-metric">
        <span>Total</span>
        <strong>${formatMoney(order.total.amountCents)}</strong>
      </div>
      <div class="dash-detail-metric">
        <span>Last update</span>
        <strong>${escapeHtml(latestTimelineEntry ? formatDateTime(latestTimelineEntry.occurredAt) : "Just now")}</strong>
      </div>
    </div>
    <div class="dash-detail-block">
      <div class="dash-detail-block__label">Items</div>
      <div class="detail-stack">${items || `<p class="muted-copy">No line items recorded for this order.</p>`}</div>
    </div>
    ${
      controlButtons
        ? `<div class="button-row">${controlButtons}</div>`
        : `<p class="muted-copy">${escapeHtml(
            getOrderDetailActionUnavailableMessage(state.session?.operator ?? null, appConfig, order)
          )}</p>`
    }
    <div class="dash-detail-block">
      <div class="dash-detail-block__label">Timeline</div>
      <div class="timeline-stack">${timeline}</div>
    </div>
  `;
}

function renderOrdersSection() {
  if (!isStaffDashboardEnabled(state.appConfig) || !isOrderTrackingEnabled(state.appConfig)) {
    return `
      <section class="dash-section">
        ${renderSectionHeading({
          eyebrow: "Orders",
          title: "Live order tracking is paused.",
          description: "Enable order tracking in store capabilities before using the operations board."
        })}
        <article class="dash-surface dash-empty-surface">
          <p class="muted-copy">This workspace will show incoming orders, prep states, and fulfillment activity once the live order board is enabled for the store.</p>
        </article>
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
              <button class="dash-order-row ${selectedOrder?.id === order.id ? "dash-order-row--selected" : ""}" type="button" data-action="select-order" data-order-id="${order.id}">
                <span class="dash-order-row__main">
                  <strong>${escapeHtml(order.pickupCode)}</strong>
                  <span class="dash-order-row__meta">${escapeHtml(getOrderCustomerLabel(order))}</span>
                </span>
                ${renderOrderStatusBadge(order.status)}
                <span class="dash-order-row__amount">${formatMoney(order.total.amountCents)}</span>
              </button>
            `
          )
          .join("")
      : `<p class="muted-copy">No orders are loaded for the selected view.</p>`;

  return `
    <section class="dash-section">
      ${renderSectionHeading({
        eyebrow: "Orders",
        title: "Live order operations",
        description: "Track incoming orders and move drinks through prep without leaving the dashboard.",
        actions: `
          <div class="dash-segmented-control">
            ${renderOrderFilterRow(activeOrders.length, completedOrders.length)}
          </div>
          <button class="button button--ghost" type="button" data-action="refresh" ${state.loading ? "disabled" : ""}>
            ${state.loading ? "Refreshing…" : "Refresh"}
          </button>
        `
      })}
      <div class="dash-split-layout dash-split-layout--orders">
        <article class="dash-surface">
          <div class="dash-surface-head">
            <div>
              <div class="dash-panel-title">Queue</div>
              <h3 class="dash-surface-title">${visibleOrders.length} in view</h3>
            </div>
            <span class="dash-inline-note">${escapeHtml(formatRelativeRefresh(state.lastRefreshedAt))}</span>
          </div>
          <div class="dash-order-list">${orderRows}</div>
        </article>

        <article class="dash-surface">
          ${
            selectedOrder
              ? renderOrderDetail(selectedOrder, state.appConfig)
              : `<div class="dash-empty-surface"><p class="muted-copy">Select an order to inspect its items and fulfillment timeline.</p></div>`
          }
        </article>
      </div>
    </section>
  `;
}

function createNewsCardId(title: string) {
  const slug = title
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return `${slug.length > 0 ? slug : "card"}-${Math.random().toString(36).slice(2, 10)}`;
}

function renderNewsCard(card: OperatorNewsCard, canWrite: boolean, canToggleVisibility: boolean) {
  const visibilityButton = canToggleVisibility
    ? `
        <button
          class="button ${card.visible ? "button--secondary" : "button--ghost"}"
          type="button"
          data-action="toggle-news-card-visibility"
          data-card-id="${card.cardId}"
          data-visible="${card.visible ? "false" : "true"}"
          ${state.busyNewsCardVisibilityId === card.cardId ? "disabled" : ""}
        >
          ${state.busyNewsCardVisibilityId === card.cardId ? "Saving…" : card.visible ? "Hide" : "Show"}
        </button>
      `
    : "";

  return `
    <form class="dash-data-row dash-data-row--news-card" data-form="news-card" data-card-id="${card.cardId}">
      <div class="dash-data-row__identity dash-data-row__identity--news-card">
        <strong>${escapeHtml(card.title)}</strong>
        <span>${escapeHtml(card.label)} · ${escapeHtml(card.cardId)}</span>
      </div>
      <div class="dash-data-row__fields dash-data-row__fields--news-card">
        <label class="field dash-field-inline dash-field-span-1">
          <span>Label</span>
          <input name="label" value="${escapeHtml(card.label)}" ${canWrite ? "" : "disabled"} required />
        </label>
        <label class="field dash-field-inline dash-field-span-1">
          <span>Title</span>
          <input name="title" value="${escapeHtml(card.title)}" ${canWrite ? "" : "disabled"} required />
        </label>
        <label class="field dash-field-inline dash-field-span-full">
          <span>Body</span>
          <textarea name="body" rows="3" ${canWrite ? "" : "disabled"} required>${escapeHtml(card.body)}</textarea>
        </label>
        <label class="field dash-field-inline dash-field-span-full">
          <span>Note</span>
          <textarea name="note" rows="2" ${canWrite ? "" : "disabled"}>${escapeHtml(card.note ?? "")}</textarea>
        </label>
        <label class="field dash-field-inline dash-field-span-1">
          <span>Sort order</span>
          <input name="sortOrder" type="number" min="0" step="1" value="${card.sortOrder}" ${canWrite ? "" : "disabled"} required />
        </label>
        <label class="toggle dash-toggle-inline dash-toggle-inline--news-card">
          <input type="checkbox" name="visible" ${card.visible ? "checked" : ""} ${canWrite ? "" : "disabled"} />
          <span>${card.visible ? "Visible" : "Hidden"}</span>
        </label>
      </div>
      <div class="dash-data-row__actions dash-data-row__actions--news-card">
        <span class="dash-status-badge dash-status-badge--${card.visible ? "success" : "neutral"}">${card.visible ? "Visible" : "Hidden"}</span>
        ${
          canWrite
            ? `
                <button class="button button--secondary" type="submit" ${state.busyNewsCardId === card.cardId ? "disabled" : ""}>
                  ${state.busyNewsCardId === card.cardId ? "Saving…" : "Save"}
                </button>
                <button class="button button--ghost" type="button" data-action="delete-news-card" data-card-id="${card.cardId}" ${state.busyDeleteNewsCardId === card.cardId ? "disabled" : ""}>
                  ${state.busyDeleteNewsCardId === card.cardId ? "Removing…" : "Remove"}
                </button>
              `
            : ""
        }
        ${visibilityButton}
      </div>
    </form>
  `;
}

function renderMenuCategory(category: OperatorMenuCategory, canWrite: boolean, canToggleVisibility: boolean) {
  return `
    <section class="dash-data-group">
      <div class="dash-data-group__header">
        <div>
          <div class="dash-panel-title">Category</div>
          <h3 class="dash-surface-title">${escapeHtml(category.title)}</h3>
        </div>
        <span class="dash-inline-note">${category.items.length} items</span>
      </div>
      <div class="dash-data-group__rows">
        ${
          category.items.length > 0
            ? category.items
                .map((item) => {
                  const customizationGroups = ensureMenuCustomizationDraft(item.itemId);
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
                          ${state.busyMenuVisibilityItemId === item.itemId ? "Saving…" : item.visible ? "Hide" : "Show"}
                        </button>
                      `
                    : "";
                  const customizationGroupsMarkup =
                    customizationGroups.length > 0
                      ? customizationGroups
                          .map((group, groupIndex) => {
                            const optionRows =
                              group.options.length > 0
                                ? group.options
                                    .map(
                                      (option, optionIndex) => `
                                        <div class="dash-customization-option-row">
                                          <label class="field dash-field-inline">
                                            <span>Option label</span>
                                            <input
                                              value="${escapeHtml(option.label)}"
                                              data-customization-item-id="${item.itemId}"
                                              data-customization-group-index="${groupIndex}"
                                              data-customization-option-index="${optionIndex}"
                                              data-customization-field="label"
                                              ${canWrite ? "" : "disabled"}
                                              required
                                            />
                                          </label>
                                          <label class="field dash-field-inline">
                                            <span>Price delta (cents)</span>
                                            <input
                                              type="number"
                                              min="0"
                                              step="1"
                                              value="${option.priceDeltaCents}"
                                              data-customization-item-id="${item.itemId}"
                                              data-customization-group-index="${groupIndex}"
                                              data-customization-option-index="${optionIndex}"
                                              data-customization-field="priceDeltaCents"
                                              ${canWrite ? "" : "disabled"}
                                              required
                                            />
                                          </label>
                                          <label class="toggle dash-toggle-inline">
                                            <input
                                              type="checkbox"
                                              ${option.default ? "checked" : ""}
                                              data-customization-item-id="${item.itemId}"
                                              data-customization-group-index="${groupIndex}"
                                              data-customization-option-index="${optionIndex}"
                                              data-customization-field="default"
                                              ${canWrite ? "" : "disabled"}
                                            />
                                            <span>Default</span>
                                          </label>
                                          <label class="toggle dash-toggle-inline">
                                            <input
                                              type="checkbox"
                                              ${option.available ? "checked" : ""}
                                              data-customization-item-id="${item.itemId}"
                                              data-customization-group-index="${groupIndex}"
                                              data-customization-option-index="${optionIndex}"
                                              data-customization-field="available"
                                              ${canWrite ? "" : "disabled"}
                                            />
                                            <span>Available</span>
                                          </label>
                                          <label class="field dash-field-inline">
                                            <span>Sort order</span>
                                            <input
                                              type="number"
                                              step="1"
                                              value="${option.sortOrder ?? optionIndex}"
                                              data-customization-item-id="${item.itemId}"
                                              data-customization-group-index="${groupIndex}"
                                              data-customization-option-index="${optionIndex}"
                                              data-customization-field="sortOrder"
                                              ${canWrite ? "" : "disabled"}
                                              required
                                            />
                                          </label>
                                          ${
                                            canWrite
                                              ? `
                                                  <button
                                                    class="button button--ghost"
                                                    type="button"
                                                    data-action="delete-customization-option"
                                                    data-item-id="${item.itemId}"
                                                    data-group-index="${groupIndex}"
                                                    data-option-index="${optionIndex}"
                                                  >
                                                    Delete option
                                                  </button>
                                                `
                                              : ""
                                          }
                                        </div>
                                      `
                                    )
                                    .join("")
                                : `<p class="muted-copy">No options in this group yet.</p>`;

                            return `
                              <article class="dash-customization-group-card">
                                <div class="dash-customization-group-grid">
                                  <label class="field dash-field-inline">
                                    <span>Group label</span>
                                    <input
                                      value="${escapeHtml(group.label)}"
                                      data-customization-item-id="${item.itemId}"
                                      data-customization-group-index="${groupIndex}"
                                      data-customization-field="label"
                                      ${canWrite ? "" : "disabled"}
                                      required
                                    />
                                  </label>
                                  <label class="field dash-field-inline">
                                    <span>Selection type</span>
                                    <select
                                      data-customization-item-id="${item.itemId}"
                                      data-customization-group-index="${groupIndex}"
                                      data-customization-field="selectionType"
                                      ${canWrite ? "" : "disabled"}
                                    >
                                      <option value="single" ${group.selectionType === "single" ? "selected" : ""}>single</option>
                                      <option value="multiple" ${group.selectionType === "multiple" ? "selected" : ""}>multiple</option>
                                    </select>
                                  </label>
                                  <label class="toggle dash-toggle-inline">
                                    <input
                                      type="checkbox"
                                      ${group.required ? "checked" : ""}
                                      data-customization-item-id="${item.itemId}"
                                      data-customization-group-index="${groupIndex}"
                                      data-customization-field="required"
                                      ${canWrite ? "" : "disabled"}
                                    />
                                    <span>Required</span>
                                  </label>
                                  <label class="field dash-field-inline">
                                    <span>Sort order</span>
                                    <input
                                      type="number"
                                      step="1"
                                      value="${group.sortOrder ?? groupIndex}"
                                      data-customization-item-id="${item.itemId}"
                                      data-customization-group-index="${groupIndex}"
                                      data-customization-field="sortOrder"
                                      ${canWrite ? "" : "disabled"}
                                      required
                                    />
                                  </label>
                                </div>
                                <div class="dash-customization-options-stack">
                                  ${optionRows}
                                </div>
                                ${
                                  canWrite
                                    ? `
                                        <div class="dash-customization-group-actions">
                                          <button
                                            class="button button--secondary"
                                            type="button"
                                            data-action="add-customization-option"
                                            data-item-id="${item.itemId}"
                                            data-group-index="${groupIndex}"
                                          >
                                            Add option
                                          </button>
                                          <button
                                            class="button button--ghost"
                                            type="button"
                                            data-action="delete-customization-group"
                                            data-item-id="${item.itemId}"
                                            data-group-index="${groupIndex}"
                                          >
                                            Delete group
                                          </button>
                                        </div>
                                      `
                                    : ""
                                }
                              </article>
                            `;
                          })
                          .join("")
                      : `<p class="muted-copy">No customization groups configured.</p>`;

                  return `
                    <form class="dash-data-row" data-form="menu-item" data-item-id="${item.itemId}">
                      <div class="dash-data-row__identity">
                        <strong>${escapeHtml(item.name)}</strong>
                        <span>${escapeHtml(item.description ?? item.itemId)}</span>
                      </div>
                      <div class="dash-data-row__fields">
                        <label class="field dash-field-inline">
                          <span>Name</span>
                          <input name="name" value="${escapeHtml(item.name)}" ${canWrite ? "" : "disabled"} required />
                        </label>
                        <label class="field dash-field-inline">
                          <span>Price (cents)</span>
                          <input name="priceCents" type="number" min="0" step="1" value="${item.priceCents}" ${canWrite ? "" : "disabled"} required />
                        </label>
                        <label class="toggle dash-toggle-inline">
                          <input type="checkbox" name="visible" ${item.visible ? "checked" : ""} ${canWrite ? "" : "disabled"} />
                          <span>${item.visible ? "Visible" : "Hidden"}</span>
                        </label>
                      </div>
                      <details class="dash-customization-panel">
                        <summary>
                          <span>Customizations</span>
                          <span>${customizationGroups.length} group${customizationGroups.length === 1 ? "" : "s"}</span>
                        </summary>
                        <div class="dash-customization-panel__body">
                          ${customizationGroupsMarkup}
                          ${
                            canWrite
                              ? `
                                  <button
                                    class="button button--secondary"
                                    type="button"
                                    data-action="add-customization-group"
                                    data-item-id="${item.itemId}"
                                  >
                                    Add customization group
                                  </button>
                                `
                              : ""
                          }
                        </div>
                      </details>
                      <div class="dash-data-row__actions">
                        <span class="dash-status-badge dash-status-badge--${item.visible ? "success" : "neutral"}">${item.visible ? "Visible" : "Hidden"}</span>
                        ${
                          canWrite
                            ? `
                                <button class="button button--secondary" type="submit" ${state.busyMenuItemId === item.itemId ? "disabled" : ""}>
                                  ${state.busyMenuItemId === item.itemId ? "Saving…" : "Save"}
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
                .join("")
            : `<div class="dash-empty-surface"><p class="muted-copy">No items are in this category yet.</p></div>`
        }
      </div>
    </section>
  `;
}

function renderMenuSection() {
  const menuIsPlatformManaged = isPlatformManagedMenu(state.appConfig);
  const canWrite = canCreateMenuItems(state.session?.operator ?? null, state.appConfig);
  const canToggleVisibility = canToggleMenuItemVisibility(state.session?.operator ?? null, state.appConfig);
  const canCreateIntoExistingCategory = canWrite && state.menuCategories.length > 0;
  const accessNotice =
    menuIsPlatformManaged && !canWrite && !canToggleVisibility
      ? `<article class="dash-surface dash-empty-surface"><p class="muted-copy">Your account can review the menu, but menu editing and visibility controls are disabled for this role.</p></article>`
      : !menuIsPlatformManaged
        ? `<article class="dash-surface dash-empty-surface"><p class="muted-copy">This store is using an external menu sync, so dashboard edits stay disabled until the menu source is switched back to LatteLink.</p></article>`
        : "";
  const createForm = canCreateIntoExistingCategory
    ? `
        <article class="dash-surface">
          <div class="dash-surface-head">
            <div>
              <div class="dash-panel-title">Create item</div>
              <h3 class="dash-surface-title">Add to the synced menu</h3>
            </div>
          </div>
          <form class="dash-inline-form dash-inline-form--menu" data-form="menu-create">
            <label class="field dash-field-inline">
              <span>Category</span>
              <select name="categoryId">
                ${state.menuCategories
                  .map((category) => `<option value="${escapeHtml(category.categoryId)}">${escapeHtml(category.title)}</option>`)
                  .join("")}
              </select>
            </label>
            <label class="field dash-field-inline">
              <span>Name</span>
              <input name="name" placeholder="Seasonal latte" required />
            </label>
            <label class="field dash-field-inline">
              <span>Description</span>
              <input name="description" placeholder="Short item description" />
            </label>
            <label class="field dash-field-inline">
              <span>Price (cents)</span>
              <input name="priceCents" type="number" min="0" step="1" value="675" required />
            </label>
            <label class="toggle dash-toggle-inline">
              <input type="checkbox" name="visible" checked />
              <span>Visible</span>
            </label>
            <button class="button button--primary" type="submit" ${state.creatingMenuItem ? "disabled" : ""}>
              ${state.creatingMenuItem ? "Creating…" : "Create item"}
            </button>
          </form>
        </article>
      `
    : canWrite
      ? `
          <article class="dash-surface dash-empty-surface">
            <p class="muted-copy">Add at least one synced menu category before creating dashboard-managed items for this store.</p>
          </article>
        `
    : "";

  return `
    <section class="dash-section">
      ${renderSectionHeading({
        eyebrow: "Menu",
        title: "Menu management",
        description: "Keep the live customer menu clean, available, and accurate."
      })}
      ${accessNotice}
      ${createForm}
      <article class="dash-surface">
        ${
          state.menuCategories.length > 0
            ? state.menuCategories.map((category) => renderMenuCategory(category, canWrite, canToggleVisibility)).join("")
            : `<div class="dash-empty-surface"><p class="muted-copy">No menu data is available yet.</p></div>`
        }
      </article>
    </section>
  `;
}

function renderCardsSection() {
  const canWrite = canAccessCapability(state.session?.operator ?? null, "menu:write");
  const canToggleVisibility = canAccessCapability(state.session?.operator ?? null, "menu:visibility");
  const accessNotice =
    !canWrite
      ? `<article class="dash-surface dash-empty-surface"><p class="muted-copy">Your account can review home cards, but editing is disabled for this role.</p></article>`
      : "";

  return `
    <section class="dash-section">
      ${renderSectionHeading({
        eyebrow: "Home",
        title: "News cards",
        description: "Manage the rotating cards shown on the mobile home page."
      })}
      ${accessNotice}
      ${
        canWrite
          ? `
              <article class="dash-surface">
                <div class="dash-surface-head">
                  <div>
                    <div class="dash-panel-title">Create card</div>
                    <h3 class="dash-surface-title">Add a homepage card</h3>
                  </div>
                </div>
                <form class="dash-inline-form dash-inline-form--news-card" data-form="news-card-create">
                  <label class="field dash-field-inline dash-field-span-1">
                    <span>Label</span>
                    <input name="label" placeholder="NEW DRINK" required />
                  </label>
                  <label class="field dash-field-inline dash-field-span-1">
                    <span>Title</span>
                    <input name="title" placeholder="Seasonal highlight" required />
                  </label>
                  <label class="field dash-field-inline dash-field-span-full">
                    <span>Body</span>
                    <textarea name="body" rows="3" placeholder="Card body copy" required></textarea>
                  </label>
                  <label class="field dash-field-inline dash-field-span-full">
                    <span>Note</span>
                    <textarea name="note" rows="2" placeholder="Optional note"></textarea>
                  </label>
                  <label class="field dash-field-inline dash-field-span-1">
                    <span>Sort order</span>
                    <input
                      name="sortOrder"
                      type="number"
                      min="0"
                      step="1"
                      value="${state.newsCards.reduce((max, card) => Math.max(max, card.sortOrder), -1) + 1}"
                      required
                    />
                  </label>
                  <label class="toggle dash-toggle-inline dash-toggle-inline--news-card">
                    <input type="checkbox" name="visible" checked />
                    <span>Visible</span>
                  </label>
                  <div class="dash-form-actions dash-form-actions--news-card">
                    <button class="button button--primary" type="submit" ${state.creatingNewsCard ? "disabled" : ""}>
                      ${state.creatingNewsCard ? "Creating…" : "Create card"}
                    </button>
                  </div>
                </form>
              </article>
            `
          : ""
      }
      <article class="dash-surface">
        ${
          state.newsCards.length > 0
            ? state.newsCards.map((card) => renderNewsCard(card, canWrite, canToggleVisibility)).join("")
            : `<div class="dash-empty-surface"><p class="muted-copy">No homepage cards are configured yet.</p></div>`
        }
      </article>
    </section>
  `;
}

function renderStoreSection() {
  if (!state.storeConfig) {
    return `
      <section class="dash-section">
        ${renderSectionHeading({
          eyebrow: "Settings",
          title: "Store configuration",
          description: "Loading the latest store configuration."
        })}
        <article class="dash-surface dash-empty-surface"><p class="muted-copy">Loading store configuration…</p></article>
      </section>
    `;
  }

  const canWrite = canUpdateStoreSettings(state.session?.operator ?? null);

  return `
    <section class="dash-section">
      ${renderSectionHeading({
        eyebrow: "Settings",
        title: state.storeConfig.storeName,
        description: "Update the storefront title, location label, hours, and customer pickup instructions."
      })}
      <article class="dash-surface">
        <div class="dash-surface-head">
          <div>
            <div class="dash-panel-title">Store</div>
            <h3 class="dash-surface-title">${escapeHtml(state.storeConfig.locationId)}</h3>
          </div>
        </div>
        ${
          canWrite
            ? ""
            : `<p class="muted-copy">Store settings are read-only for your current role. Contact a store owner to make changes.</p>`
        }

        ${
          canWrite
            ? `
                <form class="dash-store-form" data-form="store-config">
                  <label class="field">
                    <span>Store name</span>
                    <input name="storeName" value="${escapeHtml(state.storeConfig.storeName)}" required />
                  </label>
                  <label class="field">
                    <span>Location name</span>
                    <input name="locationName" value="${escapeHtml(state.storeConfig.locationName)}" required />
                  </label>
                  <label class="field">
                    <span>Hours</span>
                    <input name="hours" value="${escapeHtml(state.storeConfig.hours)}" required />
                  </label>
                  <label class="field dash-store-form__wide">
                    <span>Pickup instructions</span>
                    <textarea name="pickupInstructions" rows="4" required>${escapeHtml(state.storeConfig.pickupInstructions)}</textarea>
                  </label>
                  <div class="dash-form-actions dash-store-form__wide">
                    <button class="button button--primary" type="submit" ${state.savingStore ? "disabled" : ""}>
                      ${state.savingStore ? "Saving…" : "Save store settings"}
                    </button>
                  </div>
                </form>
              `
            : `
                <div class="dash-detail-grid">
                  <div class="dash-detail-metric">
                    <span>Store name</span>
                    <strong>${escapeHtml(state.storeConfig.storeName)}</strong>
                  </div>
                  <div class="dash-detail-metric">
                    <span>Location name</span>
                    <strong>${escapeHtml(state.storeConfig.locationName)}</strong>
                  </div>
                  <div class="dash-detail-metric">
                    <span>Hours</span>
                    <strong>${escapeHtml(state.storeConfig.hours)}</strong>
                  </div>
                  <div class="dash-detail-metric dash-detail-metric--wide">
                    <span>Pickup instructions</span>
                    <strong>${escapeHtml(state.storeConfig.pickupInstructions)}</strong>
                  </div>
                </div>
              `
        }
      </article>
    </section>
  `;
}

function renderTeamSection() {
  const canWrite = canManageTeamMembers(state.session?.operator ?? null);
  return `
    <section class="dash-section">
      ${renderSectionHeading({
        eyebrow: "Team",
        title: "Staff access",
        description: "Control who can operate the store workspace and what level of access they have."
      })}
      ${
        canWrite
          ? `
              <article class="dash-surface">
                <div class="dash-surface-head">
                  <div>
                    <div class="dash-panel-title">Create account</div>
                    <h3 class="dash-surface-title">Add a team member</h3>
                  </div>
                </div>
                <form class="dash-inline-form dash-inline-form--team" data-form="team-create">
                  <label class="field dash-field-inline">
                    <span>Name</span>
                    <input name="displayName" placeholder="Avery Quinn" required />
                  </label>
                  <label class="field dash-field-inline">
                    <span>Email</span>
                    <input name="email" type="email" placeholder="avery@store.com" required />
                  </label>
                  <label class="field dash-field-inline">
                    <span>Role</span>
                    <select name="role">
                      <option value="staff">Staff</option>
                      <option value="manager">Manager</option>
                      <option value="owner">Owner</option>
                    </select>
                  </label>
                  <label class="field dash-field-inline">
                    <span>Temporary password</span>
                    <input name="password" type="password" placeholder="Minimum 8 characters" minlength="8" required />
                  </label>
                  <button class="button button--primary" type="submit" ${state.creatingTeamUser ? "disabled" : ""}>
                    ${state.creatingTeamUser ? "Creating…" : "Create account"}
                  </button>
                </form>
              </article>
            `
          : ""
      }

      <article class="dash-surface">
        <div class="dash-surface-head">
          <div>
            <div class="dash-panel-title">Team</div>
            <h3 class="dash-surface-title">${state.teamUsers.length} active accounts</h3>
          </div>
        </div>
        ${
          canWrite
            ? ""
            : `<p class="muted-copy">Team access is read-only for your current role. Only store owners can create, deactivate, or update staff accounts.</p>`
        }
        <div class="dash-data-group__rows">
        ${
          state.teamUsers.length > 0
            ? state.teamUsers
                .map(
                  (user) => `
                    <form
                      class="dash-data-row dash-data-row--team"
                      data-form="team-user"
                      data-operator-user-id="${user.operatorUserId}"
                      data-was-active="${user.active ? "true" : "false"}"
                    >
                      <div class="dash-data-row__identity dash-data-row__identity--with-avatar">
                        <span class="dash-avatar">${escapeHtml(getOperatorInitials(user.displayName))}</span>
                        <div>
                          <strong>${escapeHtml(user.displayName)}</strong>
                          <span>${escapeHtml(user.email)}</span>
                        </div>
                      </div>
                      <div class="dash-data-row__fields">
                        <label class="field dash-field-inline">
                          <span>Name</span>
                          <input name="displayName" value="${escapeHtml(user.displayName)}" ${canWrite ? "" : "disabled"} />
                        </label>
                        <label class="field dash-field-inline">
                          <span>Email</span>
                          <input name="email" type="email" value="${escapeHtml(user.email)}" ${canWrite ? "" : "disabled"} />
                        </label>
                        <label class="field dash-field-inline">
                          <span>Role</span>
                          <select name="role" ${canWrite ? "" : "disabled"}>
                            ${(["owner", "manager", "staff"] as const)
                              .map((role) => `<option value="${role}" ${role === user.role ? "selected" : ""}>${escapeHtml(getOperatorRoleLabel(role))}</option>`)
                              .join("")}
                          </select>
                        </label>
                      ${
                        canWrite
                          ? `
                              <label class="field dash-field-inline">
                                <span>Reset password</span>
                                <input name="password" type="password" placeholder="Leave blank to keep current password" minlength="8" />
                              </label>
                            `
                          : ""
                      }
                        <label class="toggle dash-toggle-inline">
                          <input type="checkbox" name="active" ${user.active ? "checked" : ""} ${canWrite ? "" : "disabled"} />
                          <span>${user.active ? "Active" : "Inactive"}</span>
                        </label>
                      </div>

                      <div class="dash-data-row__actions">
                        <span class="dash-status-badge dash-status-badge--${user.active ? "success" : "neutral"}">${user.active ? "Active" : "Inactive"}</span>
                        ${
                          canWrite
                            ? `
                                <button class="button button--secondary" type="submit" ${state.busyTeamUserId === user.operatorUserId ? "disabled" : ""}>
                                  ${state.busyTeamUserId === user.operatorUserId ? "Saving…" : "Save"}
                                </button>
                              `
                            : ""
                        }
                      </div>
                    </form>
                  `
                )
                .join("")
            : `<div class="dash-empty-surface"><p class="muted-copy">No team members available for this store yet.</p></div>`
        }
        </div>
      </article>
    </section>
  `;
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

function renderDashboard() {
  ensureSectionIsAvailable();
  const locationLabel = state.appConfig?.brand.locationName ?? state.storeConfig?.storeName ?? "Client dashboard";
  const marketLabel = state.appConfig?.brand.marketLabel ?? "Store operations";
  const liveEnabled = isStaffDashboardEnabled(state.appConfig) && isOrderTrackingEnabled(state.appConfig);

  return `
    <div class="dash-shell">
      <aside class="dash-sidebar">
        <div class="dash-logo-area">
          <div class="dash-lockup">
            <span class="dash-icon">${renderBrandMark()}</span>
            <span class="dash-wordmark">Latte<span>Link</span></span>
          </div>
          <div class="dash-shop-block">
            <div>
              <div class="dash-shop-name">${escapeHtml(locationLabel)}</div>
              <div class="dash-shop-sub">${escapeHtml(marketLabel)} · 1 location</div>
            </div>
            <div class="dash-chevron">▾</div>
          </div>
        </div>

        <nav class="dash-nav" aria-label="Client dashboard sections">
          ${renderNavItems()}
        </nav>

        <div class="dash-sidebar-footer">
          <div class="dash-user-row">
            <div class="dash-avatar">${escapeHtml(getOperatorInitials(state.session?.operator.displayName))}</div>
            <div>
              <div class="dash-user-name">${escapeHtml(state.session?.operator.displayName ?? "Client")}</div>
              <div class="dash-user-role">${escapeHtml(getOperatorRoleLabel(state.session?.operator.role ?? "staff"))}</div>
            </div>
          </div>
          <button class="dash-signout" type="button" data-action="sign-out">Sign out</button>
        </div>
      </aside>

      <div class="dash-main">
        <div class="dash-topbar">
          <div class="dash-page-title">${escapeHtml(getDashboardSectionLabel(state.section))}</div>
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
    </div>
  `;
}

function render() {
  root.innerHTML = state.session ? renderDashboard() : renderAuthScreen();
}

async function handlePasswordSignIn(form: HTMLFormElement) {
  const formData = new FormData(form);
  const apiBaseUrl = String(formData.get("apiBaseUrl") ?? resolveDefaultApiBaseUrl());
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  if (!email) {
    setError("A work email is required.");
    render();
    return;
  }

  if (!password) {
    setError("A password is required.");
    render();
    return;
  }

  try {
    state.signingIn = true;
    state.authApiBaseUrl = apiBaseUrl;
    state.authEmail = email;
    state.authPassword = password;
    persistApiBaseUrl(apiBaseUrl);
    setError(null);
    render();
    const session = await signInOperatorWithPassword({ apiBaseUrl, email, password });
    await applyVerifiedSession(session, `Signed in as ${session.operator.displayName}.`);
  } catch (error) {
    setError(error instanceof Error ? error.message : "Unable to sign in.");
  } finally {
    state.signingIn = false;
    render();
  }
}

async function handleGoogleSignInStart() {
  if (!isGoogleSignInConfigured()) {
    setError("Google Sign-In is not configured for this environment.");
    render();
    return;
  }

  const apiBaseUrl = state.authApiBaseUrl || resolveDefaultApiBaseUrl();

  try {
    state.signingIn = true;
    state.authApiBaseUrl = apiBaseUrl;
    persistApiBaseUrl(apiBaseUrl);
    setError(null);
    render();

    const start = await startOperatorGoogleSignIn({
      apiBaseUrl,
      redirectUri: getGoogleCallbackRedirectUri()
    });

    if (typeof window !== "undefined") {
      window.location.assign(start.authorizeUrl);
      return;
    }
  } catch (error) {
    state.signingIn = false;
    setError(error instanceof Error ? error.message : "Unable to start Google sign-in.");
    render();
  }
}

async function handleGoogleCallback() {
  const callback = readGoogleCallbackParams();
  if (!callback) {
    return false;
  }

  state.signingIn = true;
  setError(null);
  render();

  if (callback.error) {
    clearGoogleCallbackParams();
    state.signingIn = false;
    setError("Google sign-in was canceled or could not be completed.");
    render();
    return true;
  }

  if (!callback.code || !callback.state) {
    clearGoogleCallbackParams();
    state.signingIn = false;
    setError("Google sign-in returned incomplete callback data.");
    render();
    return true;
  }

  try {
    const session = await exchangeOperatorGoogleCode({
      apiBaseUrl: state.authApiBaseUrl || resolveDefaultApiBaseUrl(),
      code: callback.code,
      state: callback.state,
      redirectUri: callback.redirectUri
    });

    clearGoogleCallbackParams();
    state.signingIn = false;
    await applyVerifiedSession(session, `Signed in with Google as ${session.operator.displayName}.`);
  } catch (error) {
    clearGoogleCallbackParams();
    state.signingIn = false;
    setError(error instanceof Error ? error.message : "Unable to complete Google sign-in.");
    render();
  }

  return true;
}

async function handleMenuCreateSubmit(form: HTMLFormElement) {
  if (!state.session) {
    return;
  }

  if (!canCreateMenuItems(state.session.operator, state.appConfig)) {
    setError("Menu item creation is unavailable until platform-managed menu editing is enabled for your account.");
    render();
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
    await handleOperatorActionError(error, "Unable to create menu item.");
  } finally {
    state.creatingMenuItem = false;
    render();
  }
}

async function handleMenuItemSubmit(form: HTMLFormElement) {
  if (!state.session) {
    return;
  }

  if (!canCreateMenuItems(state.session.operator, state.appConfig)) {
    setError("Menu editing is unavailable until platform-managed menu editing is enabled for your account.");
    render();
    return;
  }

  const itemId = form.dataset.itemId;
  if (!itemId) {
    return;
  }

  const formData = new FormData(form);
  const visibleField = form.elements.namedItem("visible");
  const visible = visibleField instanceof HTMLInputElement ? visibleField.checked : false;
  const customizationGroups = sanitizeCustomizationGroupsForSubmit(ensureMenuCustomizationDraft(itemId));

  try {
    state.busyMenuItemId = itemId;
    setError(null);
    render();
    await updateOperatorMenuItem(state.session, itemId, {
      name: formData.get("name"),
      priceCents: formData.get("priceCents"),
      visible,
      customizationGroups
    });
    setNotice(`Saved ${itemId}.`);
    await loadDashboard();
  } catch (error) {
    await handleOperatorActionError(error, "Unable to save menu item.");
  } finally {
    state.busyMenuItemId = null;
    render();
  }
}

async function handleStoreSubmit(form: HTMLFormElement) {
  if (!state.session) {
    return;
  }

  if (!canUpdateStoreSettings(state.session.operator)) {
    setError("Store settings are read-only for your account.");
    render();
    return;
  }

  const formData = new FormData(form);
  try {
    state.savingStore = true;
    setError(null);
    render();
    await updateOperatorStoreConfig(state.session, {
      storeName: formData.get("storeName"),
      locationName: formData.get("locationName"),
      hours: formData.get("hours"),
      pickupInstructions: formData.get("pickupInstructions")
    });
    setNotice("Saved store settings.");
    await loadDashboard();
  } catch (error) {
    await handleOperatorActionError(error, "Unable to save store settings.");
  } finally {
    state.savingStore = false;
    render();
  }
}

async function handleTeamCreateSubmit(form: HTMLFormElement) {
  if (!state.session) {
    return;
  }

  if (!canManageTeamMembers(state.session.operator)) {
    setError("Team management is only available to accounts with staff access controls.");
    render();
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
      role: formData.get("role"),
      password: formData.get("password")
    });
    setNotice("Created team member account.");
    form.reset();
    await loadDashboard();
  } catch (error) {
    await handleOperatorActionError(error, "Unable to create team member account.");
  } finally {
    state.creatingTeamUser = false;
    render();
  }
}

async function handleTeamUserSubmit(form: HTMLFormElement) {
  if (!state.session) {
    return;
  }

  if (!canManageTeamMembers(state.session.operator)) {
    setError("Team management is only available to accounts with staff access controls.");
    render();
    return;
  }

  const operatorUserId = form.dataset.operatorUserId;
  if (!operatorUserId) {
    return;
  }

  const formData = new FormData(form);
  const activeField = form.elements.namedItem("active");
  const active = activeField instanceof HTMLInputElement ? activeField.checked : false;
  const wasActive = form.dataset.wasActive === "true";

  if (wasActive && !active && typeof window !== "undefined") {
    const confirmed = window.confirm("Deactivate this team member? They will lose dashboard access until you reactivate them.");
    if (!confirmed) {
      if (activeField instanceof HTMLInputElement) {
        activeField.checked = true;
      }
      return;
    }
  }

  try {
    state.busyTeamUserId = operatorUserId;
    setError(null);
    render();
    await updateOperatorStaffUser(state.session, operatorUserId, {
      displayName: formData.get("displayName"),
      email: formData.get("email"),
      role: formData.get("role"),
      password: formData.get("password"),
      active
    });
    setNotice("Updated team member access.");
    await loadDashboard();
  } catch (error) {
    await handleOperatorActionError(error, "Unable to update team member access.");
  } finally {
    state.busyTeamUserId = null;
    render();
  }
}

async function handleOrderAdvance(orderId: string, status: "IN_PREP" | "READY" | "COMPLETED" | "CANCELED", note?: string) {
  if (!state.session) {
    return;
  }

  const selectedOrder = state.orders.find((order) => order.id === orderId);
  const canProceed =
    status === "CANCELED"
      ? canCancelOrder(state.session.operator, state.appConfig, selectedOrder ?? null)
      : canAdvanceOrderStatus(state.session.operator, state.appConfig);

  if (!canProceed) {
    setError(
      status === "CANCELED"
        ? getOrderCancelUnavailableMessage(state.session.operator, state.appConfig, selectedOrder ?? null) ??
            "Canceling this order is unavailable for this store."
        : getOrderControlUnavailableMessage(state.session.operator, state.appConfig) ??
            "Manual order status controls are unavailable for this store."
    );
    render();
    return;
  }

  try {
    state.busyOrderId = orderId;
    clearPendingCancel();
    setNotice(null);
    setError(null);
    render();
    await updateOperatorOrderStatus(state.session, orderId, { status, note });
    await loadDashboard();
  } catch (error) {
    await handleOperatorActionError(error, "Unable to update order.");
  } finally {
    state.busyOrderId = null;
    render();
  }
}

async function handleMenuVisibilityToggle(itemId: string, visible: boolean) {
  if (!state.session) {
    return;
  }

  if (!canToggleMenuItemVisibility(state.session.operator, state.appConfig)) {
    setError("Menu visibility controls are unavailable until platform-managed menu visibility is enabled for your account.");
    render();
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
    await handleOperatorActionError(error, "Unable to change item visibility.");
  } finally {
    state.busyMenuVisibilityItemId = null;
    render();
  }
}

async function handleMenuItemDelete(itemId: string) {
  if (!state.session) {
    return;
  }

  if (!canCreateMenuItems(state.session.operator, state.appConfig)) {
    setError("Menu item removal is unavailable until platform-managed menu editing is enabled for your account.");
    render();
    return;
  }

  if (typeof window !== "undefined" && !window.confirm("Remove this menu item from the client-managed menu?")) {
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
    await handleOperatorActionError(error, "Unable to remove the menu item.");
  } finally {
    state.busyDeleteMenuItemId = null;
    render();
  }
}

async function handleNewsCardCreateSubmit(form: HTMLFormElement) {
  if (!state.session) {
    return;
  }

  if (!canAccessCapability(state.session.operator, "menu:write")) {
    setError("Home card creation is unavailable for your account.");
    render();
    return;
  }

  const formData = new FormData(form);
  const visibleField = form.elements.namedItem("visible");
  const title = String(formData.get("title") ?? "").trim();
  const sortOrderInput = Number(formData.get("sortOrder") ?? 0);
  const nextCard = {
    cardId: createNewsCardId(title || "card"),
    label: String(formData.get("label") ?? "").trim(),
    title,
    body: String(formData.get("body") ?? "").trim(),
    note: (() => {
      const next = String(formData.get("note") ?? "").trim();
      return next.length > 0 ? next : undefined;
    })(),
    sortOrder: Number.isFinite(sortOrderInput) ? Math.max(0, Math.trunc(sortOrderInput)) : 0,
    visible: visibleField instanceof HTMLInputElement ? visibleField.checked : true
  };

  try {
    state.creatingNewsCard = true;
    setError(null);
    render();
    const response = await replaceOperatorNewsCards(state.session, [...state.newsCards, nextCard]);
    state.newsCards = response.cards;
    setNotice("Created home card.");
    form.reset();
  } catch (error) {
    await handleOperatorActionError(error, "Unable to create home card.");
  } finally {
    state.creatingNewsCard = false;
    render();
  }
}

async function handleNewsCardSubmit(form: HTMLFormElement) {
  if (!state.session) {
    return;
  }

  if (!canAccessCapability(state.session.operator, "menu:write")) {
    setError("Home card editing is unavailable for your account.");
    render();
    return;
  }

  const cardId = form.dataset.cardId;
  if (!cardId) {
    return;
  }

  const formData = new FormData(form);
  const visibleField = form.elements.namedItem("visible");
  const visible = visibleField instanceof HTMLInputElement ? visibleField.checked : false;
  const sortOrder = Math.max(0, Math.trunc(Number(formData.get("sortOrder") ?? 0) || 0));
  const updatedCard = {
    cardId,
    label: String(formData.get("label") ?? "").trim(),
    title: String(formData.get("title") ?? "").trim(),
    body: String(formData.get("body") ?? "").trim(),
    note: (() => {
      const next = String(formData.get("note") ?? "").trim();
      return next.length > 0 ? next : undefined;
    })(),
    sortOrder,
    visible
  };

  try {
    state.busyNewsCardId = cardId;
    setError(null);
    render();
    const nextCards = state.newsCards
      .map((card) => (card.cardId === cardId ? updatedCard : card))
      .sort((left, right) => left.sortOrder - right.sortOrder || left.cardId.localeCompare(right.cardId));
    const response = await replaceOperatorNewsCards(state.session, nextCards);
    state.newsCards = response.cards;
    setNotice(`Saved ${cardId}.`);
  } catch (error) {
    await handleOperatorActionError(error, "Unable to save home card.");
  } finally {
    state.busyNewsCardId = null;
    render();
  }
}

async function handleNewsCardVisibilityToggle(cardId: string, visible: boolean) {
  if (!state.session) {
    return;
  }

  if (!canAccessCapability(state.session.operator, "menu:visibility")) {
    setError("Home card visibility controls are unavailable for your account.");
    render();
    return;
  }

  try {
    state.busyNewsCardVisibilityId = cardId;
    setError(null);
    render();
    const nextCards = state.newsCards
      .map((card) => (card.cardId === cardId ? { ...card, visible } : card))
      .sort((left, right) => left.sortOrder - right.sortOrder || left.cardId.localeCompare(right.cardId));
    const response = await replaceOperatorNewsCards(state.session, nextCards);
    state.newsCards = response.cards;
    setNotice(visible ? "Home card is visible in the app." : "Home card was hidden from the app.");
  } catch (error) {
    await handleOperatorActionError(error, "Unable to change home card visibility.");
  } finally {
    state.busyNewsCardVisibilityId = null;
    render();
  }
}

async function handleNewsCardDelete(cardId: string) {
  if (!state.session) {
    return;
  }

  if (!canAccessCapability(state.session.operator, "menu:write")) {
    setError("Home card removal is unavailable for your account.");
    render();
    return;
  }

  if (typeof window !== "undefined" && !window.confirm("Remove this homepage card?")) {
    return;
  }

  try {
    state.busyDeleteNewsCardId = cardId;
    setError(null);
    render();
    const nextCards = state.newsCards.filter((card) => card.cardId !== cardId);
    const response = await replaceOperatorNewsCards(state.session, nextCards);
    state.newsCards = response.cards;
    setNotice("Home card removed.");
  } catch (error) {
    await handleOperatorActionError(error, "Unable to remove the home card.");
  } finally {
    state.busyDeleteNewsCardId = null;
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
  if (formType === "auth-sign-in") {
    void handlePasswordSignIn(target);
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
  if (formType === "news-card-create") {
    void handleNewsCardCreateSubmit(target);
    return;
  }
  if (formType === "news-card") {
    void handleNewsCardSubmit(target);
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

root.addEventListener("input", (event) => {
  updateCustomizationDraftFromInput(event.target);
});

root.addEventListener("change", (event) => {
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
  if (action === "refresh") {
    void loadDashboard();
    return;
  }

  if (action === "start-google-sign-in") {
    void handleGoogleSignInStart();
    return;
  }

  if (action === "sign-out") {
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

void bootstrap();
