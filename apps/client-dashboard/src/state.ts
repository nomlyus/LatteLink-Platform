import type {
  AdminStoreConfig,
  AppConfig,
  MobileExperienceDraftResponse,
  MobileExperienceVersionsResponse,
  MobileReleaseBuildJobListResponse,
  MenuItemCustomizationGroup
} from "@lattelink/contracts-catalog";
import type {
  DashboardLocation,
  OperatorAuthProviders,
  OperatorInviteLookup,
  OperatorOnboardingSummary,
  OperatorSession,
  OperatorUser
} from "./api";
import type {
  DashboardSection,
  OperatorMenuCategory,
  OperatorMenuResponse,
  OperatorDiscountCode,
  OperatorNewsCard,
  OperatorOrder,
  OperatorOrderFilter
} from "./model";
import type { OperatorReportingResponse } from "./api";
import type { AdminOrderStreamState } from "./api";
import { isStoreOperator } from "./model";
import { loadStoredApiBaseUrl, loadStoredSection, loadStoredSession } from "./storage";

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
  onboardingSummary: OperatorOnboardingSummary | null;
  launchEntryIntent: boolean;
  launchRequest: {
    submitting: boolean;
    submitted: boolean;
    ownerEmail: string | null;
  };
  onboardingAutoOpened: boolean;
  onboardingWizardOpen: boolean;
  onboardingWizardStep: 1 | 2 | 3 | 4 | 5;
  updatingOnboarding: boolean;
  initializing: boolean;
  loading: boolean;
  ordersRefreshing: boolean;
  orderRefreshError: string | null;
  signingIn: boolean;
  errorMessage: string | null;
  notice: string | null;
  appConfig: AppConfig | null;
  orders: OperatorOrder[];
  ownerHome: {
    period: "today" | "7d" | "30d";
    chartMetric: "netSales" | "orders";
    loading: boolean;
    report: OperatorReportingResponse | null;
    error: string | null;
  };
  orderFilter: OperatorOrderFilter;
  ordersPage: number;
  storeTicketFilter: "all" | "needs_action" | "in_progress" | "ready" | "closed";
  menuCategories: OperatorMenuCategory[];
  menuItemsPage: number;
  menuModifierGroups: OperatorMenuResponse["modifierGroups"];
  menuCustomizationDrafts: Record<string, MenuItemCustomizationGroup[]>;
  newsCards: OperatorNewsCard[];
  discountCodes: OperatorDiscountCode[];
  storeConfig: AdminStoreConfig | null;
  mobileExperience: MobileExperienceDraftResponse | null;
  mobileExperienceVersions: MobileExperienceVersionsResponse;
  mobileReleaseBuildJobs: MobileReleaseBuildJobListResponse;
  teamUsers: OperatorUser[];
  selectedOrderId: string | null;
  orderDetailsOpen: boolean;
  orderDetailsOpening: boolean;
  orderDetailsClosing: boolean;
  orderDetailsClosingTimeoutHandle: ReturnType<typeof setTimeout> | null;
  selectedMenuItemId: string | null;
  menuItemDetailsOpen: boolean;
  menuItemDetailsOpening: boolean;
  menuItemDetailsClosing: boolean;
  menuItemDetailsClosingTimeoutHandle: ReturnType<typeof setTimeout> | null;
  busyOrderId: string | null;
  busyMenuItemId: string | null;
  busyMenuVisibilityItemId: string | null;
  busyDeleteMenuItemId: string | null;
  busyNewsCardId: string | null;
  busyNewsCardVisibilityId: string | null;
  busyDeleteNewsCardId: string | null;
  busyDiscountCodeId: string | null;
  busyTeamUserId: string | null;
  savingStore: boolean;
  savingMobileExperience: boolean;
  publishingMobileExperience: boolean;
  rollingBackMobileExperienceVersionId: string | null;
  creatingMenuItem: boolean;
  menuCreateWizardOpen: boolean;
  menuCreateWizardStep: 1 | 2 | 3;
  creatingNewsCard: boolean;
  creatingDiscountCode: boolean;
  creatingTeamUser: boolean;
  lastRefreshedAt: number | null;
  autoRefreshHandle: ReturnType<typeof setInterval> | null;
  orderStreamUnsubscribe: (() => void) | null;
  orderConnectionState: AdminOrderStreamState;
  pendingCancelOrderId: string | null;
  pendingCancelTimeoutHandle: ReturnType<typeof setTimeout> | null;
  menuCreateDraft: {
    categoryId: string;
    name: string;
    description: string;
    priceCents: string;
    visible: boolean;
  };
  toasts: Array<{
    id: string;
    message: string;
    tone: "success" | "error" | "notice";
    dismissing: boolean;
  }>;
};

export const ordersRefreshIntervalMs = 30_000;
export const cancelConfirmTimeoutMs = 10_000;

const initialStoredSession = loadStoredSession();
const initialSection =
  initialStoredSession && isStoreOperator(initialStoredSession.operator)
    ? "orders"
    : loadStoredSection();
const initialSelectedLocationId =
  initialStoredSession && isStoreOperator(initialStoredSession.operator)
    ? initialStoredSession.operator.locationId
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
  onboardingSummary: null,
  launchEntryIntent: false,
  launchRequest: {
    submitting: false,
    submitted: false,
    ownerEmail: null
  },
  onboardingAutoOpened: false,
  onboardingWizardOpen: false,
  onboardingWizardStep: 1,
  updatingOnboarding: false,
  initializing: true,
  loading: false,
  ordersRefreshing: false,
  orderRefreshError: null,
  signingIn: false,
  errorMessage: null,
  notice: null,
  appConfig: null,
  orders: [],
  ownerHome: {
    period: "today",
    chartMetric: "netSales",
    loading: false,
    report: null,
    error: null
  },
  orderFilter: "active",
  ordersPage: 1,
  storeTicketFilter: "all",
  menuCategories: [],
  menuItemsPage: 1,
  menuModifierGroups: [],
  menuCustomizationDrafts: {},
  newsCards: [],
  discountCodes: [],
  storeConfig: null,
  mobileExperience: null,
  mobileExperienceVersions: { locationId: initialSelectedLocationId === "all" ? "" : initialSelectedLocationId ?? "", versions: [] },
  mobileReleaseBuildJobs: { jobs: [] },
  teamUsers: [],
  selectedOrderId: null,
  orderDetailsOpen: false,
  orderDetailsOpening: false,
  orderDetailsClosing: false,
  orderDetailsClosingTimeoutHandle: null,
  selectedMenuItemId: null,
  menuItemDetailsOpen: false,
  menuItemDetailsOpening: false,
  menuItemDetailsClosing: false,
  menuItemDetailsClosingTimeoutHandle: null,
  busyOrderId: null,
  busyMenuItemId: null,
  busyMenuVisibilityItemId: null,
  busyDeleteMenuItemId: null,
  busyNewsCardId: null,
  busyNewsCardVisibilityId: null,
  busyDeleteNewsCardId: null,
  busyDiscountCodeId: null,
  busyTeamUserId: null,
  savingStore: false,
  savingMobileExperience: false,
  publishingMobileExperience: false,
  rollingBackMobileExperienceVersionId: null,
  creatingMenuItem: false,
  menuCreateWizardOpen: false,
  menuCreateWizardStep: 1,
  creatingNewsCard: false,
  creatingDiscountCode: false,
  creatingTeamUser: false,
  lastRefreshedAt: null,
  autoRefreshHandle: null,
  orderStreamUnsubscribe: null,
  orderConnectionState: "connecting",
  pendingCancelOrderId: null,
  pendingCancelTimeoutHandle: null,
  toasts: [],
  menuCreateDraft: {
    categoryId: "",
    name: "",
    description: "",
    priceCents: "675",
    visible: true
  }
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
  state.orders = [];
  state.ordersRefreshing = false;
  state.orderRefreshError = null;
  state.ownerHome = {
    period: "today",
    chartMetric: "netSales",
    loading: false,
    report: null,
    error: null
  };
  state.storeTicketFilter = "all";
  state.menuCategories = [];
  state.menuItemsPage = 1;
  state.menuModifierGroups = [];
  state.menuCustomizationDrafts = {};
  state.newsCards = [];
  state.discountCodes = [];
  state.storeConfig = null;
  state.mobileExperience = null;
  state.mobileExperienceVersions = { locationId: "", versions: [] };
  state.mobileReleaseBuildJobs = { jobs: [] };
  state.teamUsers = [];
  state.onboardingSummary = null;
  state.launchEntryIntent = false;
  state.onboardingAutoOpened = false;
  state.onboardingWizardOpen = false;
  state.onboardingWizardStep = 1;
  state.updatingOnboarding = false;
  if (state.orderDetailsClosingTimeoutHandle !== null) {
    clearTimeout(state.orderDetailsClosingTimeoutHandle);
  }
  state.orderDetailsClosingTimeoutHandle = null;
  state.orderDetailsOpen = false;
  state.orderDetailsOpening = false;
  state.orderDetailsClosing = false;
  state.selectedOrderId = null;
  resetMenuItemDetails();
  state.lastRefreshedAt = null;
  state.orderConnectionState = "connecting";
  state.busyOrderId = null;
  state.busyMenuItemId = null;
  state.busyMenuVisibilityItemId = null;
  state.busyDeleteMenuItemId = null;
  state.busyNewsCardId = null;
  state.busyNewsCardVisibilityId = null;
  state.busyDeleteNewsCardId = null;
  state.busyTeamUserId = null;
  state.savingStore = false;
  state.savingMobileExperience = false;
  state.publishingMobileExperience = false;
  state.creatingMenuItem = false;
  state.creatingNewsCard = false;
  state.creatingTeamUser = false;
}

export function resetMenuItemDetails() {
  if (state.menuItemDetailsClosingTimeoutHandle !== null) {
    clearTimeout(state.menuItemDetailsClosingTimeoutHandle);
  }
  state.menuItemDetailsClosingTimeoutHandle = null;
  state.selectedMenuItemId = null;
  state.menuItemDetailsOpen = false;
  state.menuItemDetailsOpening = false;
  state.menuItemDetailsClosing = false;
}
