import { z } from "zod";
import { operatorSessionSchema } from "@gazelle/contracts-auth";
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
  if (!storage) {
    return resolveDefaultApiBaseUrl();
  }

  return normalizeApiBaseUrl(storage.getItem(API_BASE_URL_STORAGE_KEY) ?? resolveDefaultApiBaseUrl());
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
  return nextSection === "orders" || nextSection === "menu" || nextSection === "store" || nextSection === "team"
    ? nextSection
    : "overview";
}

export function persistSection(section: DashboardSection) {
  const storage = getStorage();
  storage?.setItem(DASHBOARD_SECTION_STORAGE_KEY, section);
}
