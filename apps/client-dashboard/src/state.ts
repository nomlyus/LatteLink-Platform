import type {
  AdminStoreConfig,
  AppConfig,
  MenuItemCustomizationGroup
} from "@lattelink/contracts-catalog";
import type { OperatorAuthProviders, OperatorSession, OperatorUser } from "./api.js";
import type {
  DashboardSection,
  OperatorMenuCategory,
  OperatorNewsCard,
  OperatorOrder,
  OperatorOrderFilter
} from "./model.js";
import { loadStoredApiBaseUrl, loadStoredSection, loadStoredSession } from "./storage.js";

export type AppState = {
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
  menuCreateWizardOpen: boolean;
  menuCreateWizardStep: 1 | 2 | 3;
  creatingNewsCard: boolean;
  creatingTeamUser: boolean;
  lastRefreshedAt: number | null;
  autoRefreshHandle: ReturnType<typeof setInterval> | null;
  pendingCancelOrderId: string | null;
  pendingCancelTimeoutHandle: ReturnType<typeof setTimeout> | null;
  menuCreateDraft: {
    categoryId: string;
    name: string;
    description: string;
    priceCents: string;
    visible: boolean;
  };
  toasts: Array<{ id: string; message: string; tone: "success" | "error" | "notice" }>;
};

export const ordersRefreshIntervalMs = 30_000;
export const cancelConfirmTimeoutMs = 10_000;

const initialStoredSession = loadStoredSession();

export const state: AppState = {
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
  menuCreateWizardOpen: false,
  menuCreateWizardStep: 1,
  creatingNewsCard: false,
  creatingTeamUser: false,
  lastRefreshedAt: null,
  autoRefreshHandle: null,
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

export function addToast(message: string, tone: "success" | "error" | "notice" = "notice") {
  const id = Math.random().toString(36).slice(2);
  state.toasts.push({ id, message, tone });
  return id;
}

export function dismissToast(id: string) {
  state.toasts = state.toasts.filter((t) => t.id !== id);
}

export function resetDashboardData() {
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
