import {
  fetchDashboardLocations,
  fetchOperatorOnboardingSummary,
  fetchOperatorOrders,
  fetchOperatorReporting,
  fetchOperatorSnapshot,
  isApiRequestError,
  logoutOperatorSession,
  refreshOperatorSession,
  type OperatorSession
} from "./api";
import { isOnboardingIncomplete, isOwnerOperator, isStoreOperator, sessionNeedsRefresh } from "./model";
import {
  clearStoredSession,
  hasSeenOnboardingWizard,
  loadStoredSection,
  markOnboardingWizardSeen,
  persistApiBaseUrl,
  persistSection,
  persistSession
} from "./storage";
import { resetDashboardData, setError, setNotice, state } from "./state";
import { snapshotCustomizationDrafts } from "./customizations";
import { reconcileMenuCreateDraft, resetMenuCreateWizard } from "./menu-wizard";
import {
  alertForCurrentOrders,
  clearPendingCancel,
  reconcileSelectedOrder,
  startAutoRefresh,
  stopAutoRefresh
} from "./orders-runtime";
import { resetNewOrderAlert } from "./order-alert";
import { ensureSectionIsAvailable } from "./sections";
import { mergePendingTeamUserUpdates } from "./team-state";
import { render, renderOrdersSectionOnly } from "./render";
import { getOwnerReportingLocationIds, getReportingDateRange, reportingErrorCode, resolveOwnerReportingTimezone } from "./views/owner-home";
import { isSessionAuthFailure } from "./features/auth/session-compat";
import {
  clearLocationContext,
  initializeLocationContext,
  publishLocationContext,
  resolveLocationSelection
} from "./features/location/location-compat";

let dashboardLoadInFlight = false;
let ordersRefreshInFlight = false;
let dashboardLoadGeneration = 0;

export function cancelDashboardLoad() {
  dashboardLoadGeneration += 1;
  dashboardLoadInFlight = false;
}

export async function loadOwnerHomeReport(options: { renderStart?: boolean } = {}) {
  const session = state.session;
  if (!session || !isOwnerOperator(session.operator) || state.section !== "overview") {
    return;
  }

  const timezone = resolveOwnerReportingTimezone();
  if (timezone === "mixed") {
    state.ownerHome.report = null;
    state.ownerHome.loading = false;
    state.ownerHome.error = "MIXED_REPORTING_TIMEZONES";
    if (options.renderStart !== false) render();
    return;
  }
  const locationIds = getOwnerReportingLocationIds();
  if (!timezone || locationIds.length === 0) {
    state.ownerHome.report = null;
    state.ownerHome.loading = false;
    state.ownerHome.error = "Reporting location metadata is unavailable.";
    if (options.renderStart !== false) render();
    return;
  }

  state.ownerHome.loading = true;
  state.ownerHome.error = null;
  if (options.renderStart !== false) render();
  try {
    const range = getReportingDateRange(state.ownerHome.period, timezone);
    state.ownerHome.report = await fetchOperatorReporting(session, locationIds, range);
  } catch (error) {
    if (isSessionAuthFailure(error)) {
      await signOut("Your client dashboard session expired. Sign in again to continue.");
      return;
    }
    state.ownerHome.report = null;
    state.ownerHome.error = reportingErrorCode(error) ?? (error instanceof Error ? error.message : "Unable to load reporting data.");
  } finally {
    state.ownerHome.loading = false;
    if (options.renderStart !== false) render();
  }
}

export async function signOut(message = "") {
  const currentSession = state.session;
  clearStoredSession();
  state.session = null;
  state.authPassword = "";
  stopAutoRefresh();
  resetNewOrderAlert();
  clearPendingCancel();
  clearLocationContext();
  resetDashboardData();
  resetMenuCreateWizard();
  setError(null);
  setNotice(message);
  render();

  if (!currentSession) {
    return;
  }
  try {
    await logoutOperatorSession(currentSession);
  } catch {
    // ignore remote logout failures when clearing local session
  }
}

export async function handleOperatorActionError(error: unknown, fallbackMessage: string) {
  if (isSessionAuthFailure(error)) {
    await signOut("Your client dashboard session expired. Sign in again to continue.");
    return;
  }
  setError(error instanceof Error ? error.message : fallbackMessage);
}

async function ensureFreshSession() {
  if (!state.session) {
    return null;
  }
  if (!sessionNeedsRefresh(state.session.expiresAt)) {
    return state.session;
  }
  stopAutoRefresh();
  const refreshedSession = await refreshOperatorSession(state.session);
  state.session = refreshedSession;
  persistSession(refreshedSession);
  return refreshedSession;
}

export async function refreshOrdersOnly() {
  if (!state.session || dashboardLoadInFlight || ordersRefreshInFlight) return;

  const requestedLocationId = state.selectedLocationId;
  const locationIds = requestedLocationId === "all"
    ? state.availableLocations.map((location) => location.locationId)
    : requestedLocationId
      ? [requestedLocationId]
      : [];
  if (locationIds.length === 0) {
    state.orderRefreshError = "No location is available to refresh orders.";
    renderOrdersSectionOnly();
    return;
  }

  ordersRefreshInFlight = true;
  state.ordersRefreshing = true;
  state.orderRefreshError = null;
  renderOrdersSectionOnly();

  try {
    const session = await ensureFreshSession();
    if (!session) return;

    const orderGroups = await Promise.all(locationIds.map((locationId) => fetchOperatorOrders(session, locationId)));
    if (
      state.session?.operator.operatorUserId !== session.operator.operatorUserId ||
      state.selectedLocationId !== requestedLocationId
    ) {
      return;
    }

    state.orders = orderGroups.flat();
    state.lastRefreshedAt = Date.now();
    state.orderRefreshError = null;
    alertForCurrentOrders();
    reconcileSelectedOrder();
  } catch (error) {
    if (isSessionAuthFailure(error)) {
      await signOut("Your client dashboard session expired. Sign in again to continue.");
      return;
    }
    if (state.selectedLocationId === requestedLocationId) {
      state.orderRefreshError = error instanceof Error ? error.message : "Unable to refresh orders.";
    }
  } finally {
    ordersRefreshInFlight = false;
    state.ordersRefreshing = false;
    if (state.section === "orders") {
      renderOrdersSectionOnly();
    }
  }
}

export function resolveSelectedLocationId() {
  if (!state.session) return null;
  return resolveLocationSelection(
    state.session,
    state.availableLocations,
    state.selectedLocationId
  );
}

async function loadOwnerOnboarding(session: OperatorSession) {
  if (!isOwnerOperator(session.operator) || !state.selectedLocationId || state.selectedLocationId === "all") {
    state.onboardingSummary = null;
    return;
  }

  try {
    state.onboardingSummary = await fetchOperatorOnboardingSummary(session, state.selectedLocationId);
  } catch (error) {
    if (isApiRequestError(error) && error.statusCode === 404) {
      state.onboardingSummary = null;
      return;
    }
    throw error;
  }
}

function autoOpenOwnerOnboarding() {
  const operator = state.session?.operator ?? null;
  if (
    state.onboardingAutoOpened ||
    !operator ||
    !isOwnerOperator(operator) ||
    !state.onboardingSummary ||
    !isOnboardingIncomplete(state.onboardingSummary.status)
  ) {
    return;
  }

  if (hasSeenOnboardingWizard(operator.operatorUserId, state.onboardingSummary.locationId)) {
    state.onboardingAutoOpened = true;
    return;
  }

  state.section = "store";
  persistSection(state.section);
  state.onboardingWizardOpen = true;
  state.onboardingWizardStep = 1;
  state.onboardingAutoOpened = true;
  markOnboardingWizardSeen(operator.operatorUserId, state.onboardingSummary.locationId);
}

function applyLaunchEntryIntent() {
  if (!state.launchEntryIntent) {
    return false;
  }

  const operator = state.session?.operator ?? null;
  if (!operator) {
    return false;
  }

  if (!isOwnerOperator(operator)) {
    state.launchEntryIntent = false;
    setNotice("Sign in with an owner account to create and launch a branded app.");
    return false;
  }

  if (state.onboardingSummary && isOnboardingIncomplete(state.onboardingSummary.status)) {
    state.section = "store";
    persistSection(state.section);
    state.onboardingWizardOpen = true;
    state.onboardingWizardStep = 1;
    state.onboardingAutoOpened = true;
    state.launchEntryIntent = false;
    setNotice("Continue your branded app launch setup.");
    return true;
  }

  state.section = "experience";
  persistSection(state.section);
  state.launchEntryIntent = false;
  setNotice("Your app builder is ready.");
  return true;
}

export async function loadDashboard(options: { silent?: boolean } = {}): Promise<void> {
  if (!state.session) {
    state.loading = false;
    stopAutoRefresh();
    render();
    return;
  }
  if (dashboardLoadInFlight) {
    return;
  }

  const silent = options.silent === true;
  const loadGeneration = dashboardLoadGeneration;
  dashboardLoadInFlight = true;

  if (isStoreOperator(state.session.operator)) {
    state.section = "orders";
  } else {
    state.section = loadStoredSection();
  }
  state.orderRefreshError = null;

  if (!silent) {
    state.loading = true;
    setError(null);
    render();
  }

  try {
    const session = await ensureFreshSession();
    if (loadGeneration !== dashboardLoadGeneration) return;
    if (!session) {
      return;
    }

    state.availableLocations = await fetchDashboardLocations(session);
    if (loadGeneration !== dashboardLoadGeneration) return;
    state.selectedLocationId = resolveSelectedLocationId();
    state.selectedLocationId = publishLocationContext(session, state.availableLocations, state.selectedLocationId);

    // Reporting is intentionally isolated from the order/snapshot read. A stale or
    // unavailable orders API must not take down the analytics modules.
    if (isOwnerOperator(session.operator) && state.section === "overview") {
      await loadOwnerHomeReport({ renderStart: false });
      if (loadGeneration !== dashboardLoadGeneration) return;
    }

    try {
      if (state.selectedLocationId === "all") {
        const orders = new Set(session.operator.capabilities).has("orders:read")
          ? (
              await Promise.all(state.availableLocations.map((location) => fetchOperatorOrders(session, location.locationId)))
            ).flat()
          : [];
        state.appConfig = null;
        state.orders = orders;
        state.menuCategories = [];
        state.menuModifierGroups = [];
        state.menuLoadError = null;
        state.menuCustomizationDrafts = {};
        state.newsCards = [];
        state.discountCodes = [];
        state.storeConfig = null;
        state.mobileExperience = null;
        state.mobileExperienceVersions = { locationId: "", versions: [] };
        state.mobileReleaseBuildJobs = { jobs: [] };
        state.teamUsers = [];
      } else {
        const snapshot = await fetchOperatorSnapshot(session, state.selectedLocationId);
        if (loadGeneration !== dashboardLoadGeneration) return;
        state.appConfig = snapshot.appConfig;
        state.orders = snapshot.orders;
        state.menuCategories = snapshot.menu.categories;
        state.menuModifierGroups = snapshot.menu.modifierGroups;
        state.menuLoadError = null;
        reconcileMenuCreateDraft();
        state.menuCustomizationDrafts = snapshotCustomizationDrafts(snapshot.menu.categories);
        state.newsCards = snapshot.cards;
        state.discountCodes = snapshot.discountCodes;
        state.storeConfig = snapshot.storeConfig;
        state.mobileExperience = snapshot.mobileExperience;
        state.mobileExperienceVersions = snapshot.mobileExperienceVersions;
        state.mobileReleaseBuildJobs = snapshot.mobileReleaseBuildJobs;
        state.teamUsers = mergePendingTeamUserUpdates(snapshot.team);
      }
    } catch (error) {
      if (isSessionAuthFailure(error)) throw error;
      state.menuLoadError = "Unable to load this location’s menu. Try again.";
      if (!silent) state.orders = [];
    }

    alertForCurrentOrders();
    await loadOwnerOnboarding(session);
    if (loadGeneration !== dashboardLoadGeneration) return;
    if (!applyLaunchEntryIntent()) {
      autoOpenOwnerOnboarding();
    }
    state.lastRefreshedAt = Date.now();
    ensureSectionIsAvailable();
    reconcileSelectedOrder();

    if (!isOwnerOperator(session.operator) || state.section !== "overview") {
      state.ownerHome.report = null;
      state.ownerHome.error = null;
      state.ownerHome.loading = false;
    }

    if (state.pendingCancelOrderId && !state.orders.some((order) => order.id === state.pendingCancelOrderId)) {
      clearPendingCancel();
    }
  } catch (error) {
    if (loadGeneration !== dashboardLoadGeneration) return;
    if (isSessionAuthFailure(error)) {
      await signOut("Your client dashboard session expired. Sign in again to continue.");
      return;
    }
    if (!silent) {
      setError(error instanceof Error ? error.message : "Unable to load client dashboard data.");
    }
  } finally {
    if (loadGeneration === dashboardLoadGeneration) {
      dashboardLoadInFlight = false;
      if (!silent) {
        state.loading = false;
      }
      startAutoRefresh(loadDashboard);
      render();
    }
  }
}

export async function applyVerifiedSession(nextSession: OperatorSession, notice: string) {
  const launchEntryIntent = state.launchEntryIntent;
  const currentSession = state.session;
  const shouldPreserveSection =
    currentSession?.operator.operatorUserId === nextSession.operator.operatorUserId;
  state.session = nextSession;
  const locationContext = initializeLocationContext(nextSession);
  state.section = isStoreOperator(nextSession.operator)
    ? "orders"
    : shouldPreserveSection
      ? state.section
      : "overview";
  state.selectedLocationId = isStoreOperator(nextSession.operator)
    ? nextSession.operator.locationId
    : locationContext.selectedLocationId ?? ((nextSession.operator.locationIds?.length ?? 1) > 1
      ? "all"
      : nextSession.operator.locationId);
  state.authApiBaseUrl = nextSession.apiBaseUrl;
  state.authEmail = nextSession.operator.email;
  state.authPassword = "";
  persistApiBaseUrl(nextSession.apiBaseUrl);
  persistSection(state.section);
  persistSession(nextSession);
  setError(null);
  setNotice(notice);
  stopAutoRefresh();
  clearPendingCancel();
  resetDashboardData();
  state.selectedLocationId = isStoreOperator(nextSession.operator)
    ? nextSession.operator.locationId
    : locationContext.selectedLocationId ?? ((nextSession.operator.locationIds?.length ?? 1) > 1
      ? "all"
      : nextSession.operator.locationId);
  state.launchEntryIntent = launchEntryIntent;
  resetMenuCreateWizard();
  render();
  await loadDashboard();
}
