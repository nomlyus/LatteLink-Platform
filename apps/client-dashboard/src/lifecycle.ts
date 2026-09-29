import {
  fetchDashboardLocations,
  fetchOperatorSnapshot,
  logoutOperatorSession,
  refreshOperatorSession,
  type OperatorSession
} from "./api";
import { isStoreOperator, sessionNeedsRefresh } from "./model";
import {
  clearStoredSession,
  loadStoredSection,
  persistApiBaseUrl,
  persistSection,
  persistSession
} from "./storage";
import { resetDashboardData, setError, setNotice, state } from "./state";
import { ensureSectionIsAvailable } from "./sections";
import { render } from "./render";
import { isSessionAuthFailure } from "./features/auth/session-compat";
import {
  clearLocationContext,
  initializeLocationContext,
  publishLocationContext,
  resolveLocationSelection
} from "./features/location/location-compat";

let dashboardLoadInFlight = false;
let dashboardLoadGeneration = 0;

export function cancelDashboardLoad() {
  dashboardLoadGeneration += 1;
  dashboardLoadInFlight = false;
}

export async function signOut(message = "") {
  const currentSession = state.session;
  clearStoredSession();
  state.session = null;
  state.authPassword = "";
  clearLocationContext();
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

export function resolveSelectedLocationId() {
  if (!state.session) return null;
  return resolveLocationSelection(
    state.session,
    state.availableLocations,
    state.selectedLocationId
  );
}

export async function loadDashboard(options: { silent?: boolean } = {}): Promise<void> {
  if (!state.session) {
    state.loading = false;
    render();
    return;
  }
  if (dashboardLoadInFlight) {
    return;
  }

  const silent = options.silent === true;
  const loadGeneration = dashboardLoadGeneration;
  dashboardLoadInFlight = true;

  const storedSection = loadStoredSection();
  state.section = !isStoreOperator(state.session.operator) && storedSection !== "overview" &&
    storedSection !== "orders" && storedSection !== "menu"
    ? storedSection
    : "overview";

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

    try {
      if (state.selectedLocationId === "all") {
        state.appConfig = null;
        state.storeConfig = null;
      } else {
        const snapshot = await fetchOperatorSnapshot(session, state.selectedLocationId);
        if (loadGeneration !== dashboardLoadGeneration) return;
        state.appConfig = snapshot.appConfig;
        state.storeConfig = snapshot.storeConfig;
      }
    } catch (error) {
      if (isSessionAuthFailure(error)) throw error;
      if (!silent) setError(error instanceof Error ? error.message : "Unable to load client dashboard data.");
    }

    state.dashboardLoaded = true;
    ensureSectionIsAvailable();
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
      render();
    }
  }
}

export async function applyVerifiedSession(nextSession: OperatorSession, notice: string) {
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
  resetDashboardData();
  state.selectedLocationId = isStoreOperator(nextSession.operator)
    ? nextSession.operator.locationId
    : locationContext.selectedLocationId ?? ((nextSession.operator.locationIds?.length ?? 1) > 1
      ? "all"
      : nextSession.operator.locationId);
  render();
  await loadDashboard();
}
