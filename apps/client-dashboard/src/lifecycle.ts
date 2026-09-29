import {
  fetchDashboardLocations,
  fetchOperatorOnboardingSummary,
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
import { ensureSectionIsAvailable } from "./sections";
import { mergePendingTeamUserUpdates } from "./team-state";
import { render } from "./render";
import { isSessionAuthFailure } from "./features/auth/session-compat";
import { shouldAutoOpenOwnerOnboarding } from "./lib/navigation/dashboard-navigation";
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
  if (typeof window !== "undefined" && !shouldAutoOpenOwnerOnboarding(window.location.pathname)) {
    return;
  }

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
        state.menuCategories = [];
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
        state.menuCategories = snapshot.menu.categories;
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
      if (!silent) setError(error instanceof Error ? error.message : "Unable to load client dashboard data.");
    }

    await loadOwnerOnboarding(session);
    if (loadGeneration !== dashboardLoadGeneration) return;
    if (!applyLaunchEntryIntent()) {
      autoOpenOwnerOnboarding();
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
  resetDashboardData();
  state.selectedLocationId = isStoreOperator(nextSession.operator)
    ? nextSession.operator.locationId
    : locationContext.selectedLocationId ?? ((nextSession.operator.locationIds?.length ?? 1) > 1
      ? "all"
      : nextSession.operator.locationId);
  state.launchEntryIntent = launchEntryIntent;
  render();
  await loadDashboard();
}
