import {
  fetchDashboardLocations,
  fetchOperatorOrders,
  fetchOperatorSnapshot,
  isApiRequestError,
  logoutOperatorSession,
  refreshOperatorSession,
  type OperatorSession
} from "./api.js";
import { isStoreOperator, sessionNeedsRefresh } from "./model.js";
import { clearStoredSession, persistApiBaseUrl, persistSection, persistSession } from "./storage.js";
import { resetDashboardData, setError, setNotice, state } from "./state.js";
import { snapshotCustomizationDrafts } from "./customizations.js";
import { reconcileMenuCreateDraft, resetMenuCreateWizard } from "./menu-wizard.js";
import {
  clearPendingCancel,
  reconcileSelectedOrder,
  startAutoRefresh,
  stopAutoRefresh
} from "./orders-runtime.js";
import { ensureSectionIsAvailable } from "./sections.js";
import { render } from "./render.js";

export function isSessionAuthFailure(error: unknown) {
  if (isApiRequestError(error)) {
    return error.statusCode === 401;
  }
  return (
    error instanceof Error &&
    (error.message.toLowerCase().includes("refresh") ||
      error.message.toLowerCase().includes("auth"))
  );
}

export async function signOut(message = "Signed out of the client dashboard.") {
  const currentSession = state.session;
  clearStoredSession();
  state.session = null;
  state.authPassword = "";
  stopAutoRefresh();
  clearPendingCancel();
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
  const refreshedSession = await refreshOperatorSession(state.session);
  state.session = refreshedSession;
  persistSession(refreshedSession);
  return refreshedSession;
}

function resolveSelectedLocationId() {
  const availableLocationIds = new Set(state.availableLocations.map((location) => location.locationId));
  if (availableLocationIds.size === 0) {
    return null;
  }

  if (isStoreOperator(state.session?.operator ?? null)) {
    return state.session?.operator.locationId ?? state.availableLocations[0]?.locationId ?? null;
  }

  if (state.selectedLocationId === "all" && availableLocationIds.size > 1) {
    return "all" as const;
  }

  if (state.selectedLocationId && state.selectedLocationId !== "all" && availableLocationIds.has(state.selectedLocationId)) {
    return state.selectedLocationId;
  }

  return availableLocationIds.size > 1 ? ("all" as const) : state.availableLocations[0]?.locationId ?? null;
}

export async function loadDashboard(): Promise<void> {
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

    state.availableLocations = await fetchDashboardLocations(session);
    state.selectedLocationId = resolveSelectedLocationId();

    if (state.selectedLocationId === "all") {
      const orders = new Set(session.operator.capabilities).has("orders:read")
        ? (
            await Promise.all(state.availableLocations.map((location) => fetchOperatorOrders(session, location.locationId)))
          ).flat()
        : [];
      state.appConfig = null;
      state.orders = orders;
      state.menuCategories = [];
      state.menuCustomizationDrafts = {};
      state.newsCards = [];
      state.storeConfig = null;
      state.teamUsers = [];
    } else {
      const snapshot = await fetchOperatorSnapshot(session, state.selectedLocationId);
      state.appConfig = snapshot.appConfig;
      state.orders = snapshot.orders;
      state.menuCategories = snapshot.menu.categories;
      reconcileMenuCreateDraft();
      state.menuCustomizationDrafts = snapshotCustomizationDrafts(snapshot.menu.categories);
      state.newsCards = snapshot.cards;
      state.storeConfig = snapshot.storeConfig;
      state.teamUsers = snapshot.team;
    }

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
    startAutoRefresh(loadDashboard);
    render();
  }
}

export async function applyVerifiedSession(nextSession: OperatorSession, notice: string) {
  state.session = nextSession;
  state.section = isStoreOperator(nextSession.operator) ? "orders" : "overview";
  state.selectedLocationId = isStoreOperator(nextSession.operator)
    ? nextSession.operator.locationId
    : (nextSession.operator.locationIds?.length ?? 1) > 1
      ? "all"
      : nextSession.operator.locationId;
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
  resetMenuCreateWizard();
  render();
  await loadDashboard();
}
