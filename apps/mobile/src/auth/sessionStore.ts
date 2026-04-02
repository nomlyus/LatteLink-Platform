import * as SecureStore from "expo-secure-store";

export type AuthSession = {
  accessToken: string;
  refreshToken: string;
  expiresAt: string;
  userId: string;
};

export const SESSION_STORAGE_KEY = "gazelle.auth.session.v1";
export const EXPIRY_REFRESH_WINDOW_MS = 60_000;

function isString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

function hasValidTimestamp(value: string): boolean {
  return Number.isFinite(Date.parse(value));
}

export function isAuthSession(value: unknown): value is AuthSession {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }

  const candidate = value as Record<string, unknown>;
  return (
    isString(candidate.accessToken) &&
    isString(candidate.refreshToken) &&
    isString(candidate.expiresAt) &&
    hasValidTimestamp(candidate.expiresAt) &&
    isString(candidate.userId)
  );
}

export function parseStoredSession(rawValue: string | null): AuthSession | null {
  if (!rawValue) {
    return null;
  }

  try {
    const parsed = JSON.parse(rawValue) as unknown;
    if (isAuthSession(parsed)) {
      return parsed;
    }
  } catch {
    return null;
  }

  return null;
}

export function isSessionExpiringSoon(session: AuthSession, nowMs = Date.now()): boolean {
  return Date.parse(session.expiresAt) <= nowMs + EXPIRY_REFRESH_WINDOW_MS;
}

export function getSessionRefreshDelayMs(session: AuthSession, nowMs = Date.now()): number {
  return Math.max(0, Date.parse(session.expiresAt) - nowMs - EXPIRY_REFRESH_WINDOW_MS);
}

export async function loadStoredSession(): Promise<AuthSession | null> {
  const rawValue = await SecureStore.getItemAsync(SESSION_STORAGE_KEY);
  const session = parseStoredSession(rawValue);
  if (rawValue && !session) {
    await SecureStore.deleteItemAsync(SESSION_STORAGE_KEY);
  }

  return session;
}

export async function persistSession(session: AuthSession): Promise<void> {
  await SecureStore.setItemAsync(SESSION_STORAGE_KEY, JSON.stringify(session));
}

export async function clearStoredSession(): Promise<void> {
  await SecureStore.deleteItemAsync(SESSION_STORAGE_KEY);
}
