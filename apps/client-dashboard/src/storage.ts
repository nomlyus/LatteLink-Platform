import { z } from "zod";
import { operatorSessionSchema } from "@lattelink/contracts-auth";
import { normalizeApiBaseUrl, resolveDefaultApiBaseUrl } from "./api";
import type { OperatorSession } from "./features/auth/auth-types";

const API_BASE_URL_STORAGE_KEY = "lattelink.operator.api-base-url.v2";
const OPERATOR_SESSION_STORAGE_KEY = "lattelink.operator.session.v2";
const DASHBOARD_SECTION_STORAGE_KEY = "lattelink.operator.section.v2";
const DASHBOARD_LOCATION_STORAGE_PREFIX = "lattelink.operator.location.v1";
const ONBOARDING_WIZARD_SHOWN_STORAGE_PREFIX = "lattelink.operator.onboarding-wizard-shown.v1";

const storedSessionListeners = new Set<() => void>();
let crossTabStorageListenerAttached = false;

function notifyStoredSessionListeners() {
  for (const listener of storedSessionListeners) listener();
}

function handleCrossTabStorageChange(event: StorageEvent) {
  if (event.key === OPERATOR_SESSION_STORAGE_KEY || event.key === API_BASE_URL_STORAGE_KEY) {
    notifyStoredSessionListeners();
  }
}

const storedSessionSchema = operatorSessionSchema.extend({
  apiBaseUrl: z.string().min(1)
});

function getStorage() {
  if (typeof window === "undefined") {
    return undefined;
  }

  return window.localStorage;
}

function resolveConfiguredApiBaseUrl() {
  return normalizeApiBaseUrl(resolveDefaultApiBaseUrl());
}

function storageApiBaseUrlMatchesBuild(apiBaseUrl: string) {
  const configuredApiBaseUrl = resolveConfiguredApiBaseUrl();
  if (!configuredApiBaseUrl) {
    return true;
  }

  return normalizeApiBaseUrl(apiBaseUrl) === configuredApiBaseUrl;
}

export function loadStoredSession(): OperatorSession | null {
  clearLegacyDashboardSectionPreference();
  const storage = getStorage();
  if (!storage) {
    return null;
  }

  const rawSession = storage.getItem(OPERATOR_SESSION_STORAGE_KEY);
  if (!rawSession) {
    return null;
  }

  try {
    const parsed = storedSessionSchema.parse(JSON.parse(rawSession));
    if (!storageApiBaseUrlMatchesBuild(parsed.apiBaseUrl)) {
      storage.removeItem(OPERATOR_SESSION_STORAGE_KEY);
      storage.removeItem(API_BASE_URL_STORAGE_KEY);
      return null;
    }

    return {
      ...parsed,
      apiBaseUrl: normalizeApiBaseUrl(parsed.apiBaseUrl)
    };
  } catch {
    storage.removeItem(OPERATOR_SESSION_STORAGE_KEY);
    return null;
  }
}

export function persistSession(session: OperatorSession) {
  const storage = getStorage();
  if (!storage) {
    return;
  }

  storage.setItem(
    OPERATOR_SESSION_STORAGE_KEY,
    JSON.stringify({
      ...session,
      apiBaseUrl: normalizeApiBaseUrl(session.apiBaseUrl)
    })
  );
  storage.setItem(API_BASE_URL_STORAGE_KEY, normalizeApiBaseUrl(session.apiBaseUrl));
  notifyStoredSessionListeners();
}

export function clearStoredSession() {
  const storage = getStorage();
  if (!storage) {
    return;
  }

  storage.removeItem(OPERATOR_SESSION_STORAGE_KEY);
  notifyStoredSessionListeners();
}

export function subscribeToStoredSession(listener: () => void) {
  storedSessionListeners.add(listener);
  const browserWindow = typeof window === "undefined" ? undefined : window;
  if (browserWindow && !crossTabStorageListenerAttached) {
    browserWindow.addEventListener("storage", handleCrossTabStorageChange);
    crossTabStorageListenerAttached = true;
  }

  return () => {
    storedSessionListeners.delete(listener);
    if (storedSessionListeners.size === 0 && browserWindow && crossTabStorageListenerAttached) {
      browserWindow.removeEventListener("storage", handleCrossTabStorageChange);
      crossTabStorageListenerAttached = false;
    }
  };
}

export function loadStoredApiBaseUrl() {
  const storage = getStorage();
  const configuredApiBaseUrl = resolveConfiguredApiBaseUrl();
  if (!storage) {
    return configuredApiBaseUrl;
  }

  const storedApiBaseUrl = normalizeApiBaseUrl(storage.getItem(API_BASE_URL_STORAGE_KEY) ?? "");
  if (!storedApiBaseUrl || !storageApiBaseUrlMatchesBuild(storedApiBaseUrl)) {
    storage.removeItem(API_BASE_URL_STORAGE_KEY);
    return configuredApiBaseUrl;
  }

  return storedApiBaseUrl;
}

export function persistApiBaseUrl(apiBaseUrl: string) {
  const storage = getStorage();
  if (!storage) {
    return;
  }

  storage.setItem(API_BASE_URL_STORAGE_KEY, normalizeApiBaseUrl(apiBaseUrl));
}

export function clearLegacyDashboardSectionPreference() {
  getStorage()?.removeItem(DASHBOARD_SECTION_STORAGE_KEY);
}

function dashboardLocationStorageKey(operatorUserId: string) {
  return `${DASHBOARD_LOCATION_STORAGE_PREFIX}.${operatorUserId}`;
}

export function loadStoredLocationSelection(operatorUserId: string): string | "all" | null {
  const stored = getStorage()?.getItem(dashboardLocationStorageKey(operatorUserId));
  return stored === "all" || (typeof stored === "string" && stored.length > 0) ? stored : null;
}

export function persistLocationSelection(operatorUserId: string, locationId: string | "all") {
  getStorage()?.setItem(dashboardLocationStorageKey(operatorUserId), locationId);
}

function onboardingWizardShownStorageKey(operatorUserId: string, locationId: string) {
  return `${ONBOARDING_WIZARD_SHOWN_STORAGE_PREFIX}.${operatorUserId}.${locationId}`;
}

export function hasSeenOnboardingWizard(operatorUserId: string, locationId: string) {
  const storage = getStorage();
  return storage?.getItem(onboardingWizardShownStorageKey(operatorUserId, locationId)) === "1";
}

export function markOnboardingWizardSeen(operatorUserId: string, locationId: string) {
  const storage = getStorage();
  storage?.setItem(onboardingWizardShownStorageKey(operatorUserId, locationId), "1");
}
