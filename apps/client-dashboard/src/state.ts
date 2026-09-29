import type { AdminStoreConfig, AppConfig } from "@lattelink/contracts-catalog";
import type {
  DashboardLocation,
  OperatorAuthProviders,
  OperatorInviteLookup,
  OperatorSession
} from "./api";
import type { DashboardSection } from "./model";
import { isStoreOperator } from "./model";
import { loadStoredApiBaseUrl, loadStoredLocationSelection, loadStoredSection, loadStoredSession } from "./storage";

export type AppState = {
  section: DashboardSection;
  session: OperatorSession | null;
  availableLocations: DashboardLocation[];
  selectedLocationId: string | "all" | null;
  authApiBaseUrl: string;
  authEmail: string;
  authPassword: string;
  authProviders: OperatorAuthProviders | null;
  ownerInvite: {
    token: string;
    status: "loading" | "ready" | "accepted" | "error";
    lookup: OperatorInviteLookup | null;
    accepting: boolean;
  } | null;
  launchSignInIntent: boolean;
  launchRequest: {
    submitting: boolean;
    submitted: boolean;
    ownerEmail: string | null;
  };
  initializing: boolean;
  loading: boolean;
  signingIn: boolean;
  errorMessage: string | null;
  notice: string | null;
  appConfig: AppConfig | null;
  storeConfig: AdminStoreConfig | null;
  dashboardLoaded: boolean;
  toasts: Array<{
    id: string;
    message: string;
    tone: "success" | "error" | "notice";
    dismissing: boolean;
  }>;
};

const initialStoredSession = loadStoredSession();
const initialSection =
  initialStoredSession && isStoreOperator(initialStoredSession.operator)
    ? "orders"
    : loadStoredSection();
const initialSelectedLocationId =
  initialStoredSession && isStoreOperator(initialStoredSession.operator)
    ? initialStoredSession.operator.locationId
    : initialStoredSession && loadStoredLocationSelection(initialStoredSession.operator.operatorUserId)
      ? loadStoredLocationSelection(initialStoredSession.operator.operatorUserId)
    : initialStoredSession && (initialStoredSession.operator.locationIds?.length ?? 1) > 1
    ? "all"
    : (initialStoredSession?.operator.locationId ?? null);

export const state: AppState = {
  section: initialSection,
  session: initialStoredSession,
  availableLocations: [],
  selectedLocationId: initialSelectedLocationId,
  authApiBaseUrl: initialStoredSession?.apiBaseUrl ?? loadStoredApiBaseUrl(),
  authEmail: initialStoredSession?.operator.email ?? "",
  authPassword: "",
  authProviders: null,
  ownerInvite: null,
  launchSignInIntent: false,
  launchRequest: {
    submitting: false,
    submitted: false,
    ownerEmail: null
  },
  initializing: true,
  loading: false,
  signingIn: false,
  errorMessage: null,
  notice: null,
  appConfig: null,
  storeConfig: null,
  dashboardLoaded: false,
  toasts: []
};

export function setError(message: string | null) {
  state.errorMessage = message;
}

export function setNotice(message: string | null) {
  state.notice = message;
}

export function createToast(message: string, tone: "success" | "error" | "notice" = "notice") {
  const id = Math.random().toString(36).slice(2);
  state.toasts.push({ id, message, tone, dismissing: false });
  return id;
}

export function markToastDismissing(id: string) {
  const toast = state.toasts.find((item) => item.id === id);
  if (toast) {
    toast.dismissing = true;
  }
}

export function removeToast(id: string) {
  state.toasts = state.toasts.filter((t) => t.id !== id);
}

export function hasMultipleLocations() {
  return state.availableLocations.length > 1 || (state.session?.operator.locationIds?.length ?? 1) > 1;
}

export function isAllLocationsSelected() {
  return state.selectedLocationId === "all";
}

export function getSelectedLocation() {
  if (!state.selectedLocationId || state.selectedLocationId === "all") {
    return null;
  }

  return state.availableLocations.find((location) => location.locationId === state.selectedLocationId) ?? null;
}

export function resetDashboardData() {
  state.availableLocations = [];
  state.selectedLocationId = state.session
    ? isStoreOperator(state.session.operator)
      ? state.session.operator.locationId
      : (state.session.operator.locationIds?.length ?? 1) > 1
      ? "all"
      : state.session.operator.locationId
    : null;
  state.appConfig = null;
  state.storeConfig = null;
  state.launchSignInIntent = false;
  state.dashboardLoaded = false;
}
