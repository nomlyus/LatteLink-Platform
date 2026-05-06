import { z } from "zod";
import { operatorSessionSchema } from "@lattelink/contracts-auth";
import { normalizeApiBaseUrl, resolveDefaultApiBaseUrl, type OperatorSession } from "./api.js";
import type { DashboardSection } from "./model.js";

const API_BASE_URL_STORAGE_KEY = "lattelink.operator.api-base-url.v2";
const OPERATOR_SESSION_STORAGE_KEY = "lattelink.operator.session.v2";
const DASHBOARD_SECTION_STORAGE_KEY = "lattelink.operator.section.v2";

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
}

export function clearStoredSession() {
  const storage = getStorage();
  if (!storage) {
    return;
  }

  storage.removeItem(OPERATOR_SESSION_STORAGE_KEY);
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

export function loadStoredSection(): DashboardSection {
  const storage = getStorage();
  const nextSection = storage?.getItem(DASHBOARD_SECTION_STORAGE_KEY);
  return nextSection === "orders" ||
    nextSection === "onboarding" ||
    nextSection === "menu" ||
    nextSection === "cards" ||
    nextSection === "discounts" ||
    nextSection === "store" ||
    nextSection === "team"
    ? nextSection
    : "overview";
}

export function persistSection(section: DashboardSection) {
  const storage = getStorage();
  storage?.setItem(DASHBOARD_SECTION_STORAGE_KEY, section);
}
