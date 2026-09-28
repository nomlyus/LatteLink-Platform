"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode
} from "react";
import { logoutOperatorSession, refreshOperatorSession, type OperatorSession } from "../../api";
import { sessionNeedsRefresh, type OperatorCapability, type OperatorUser } from "../../model";
import { clearStoredSession, loadStoredSession, persistSession, subscribeToStoredSession } from "../../storage";
import { isSessionAuthFailure } from "./session-compat";

type DashboardSessionContextValue = {
  status: "loading" | "signed-out" | "authenticated";
  session: OperatorSession | null;
  operator: OperatorUser | null;
  capabilities: readonly OperatorCapability[];
  refreshSession: () => Promise<OperatorSession | null>;
  logout: () => Promise<void>;
};

const DashboardSessionContext = createContext<DashboardSessionContextValue | null>(null);

export function DashboardSessionProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<OperatorSession | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const restore = () => {
      setSession(loadStoredSession());
      setLoading(false);
    };
    restore();
    return subscribeToStoredSession(restore);
  }, []);

  const refreshSession = useCallback(async () => {
    const currentSession = session;
    if (!currentSession) return null;
    if (!sessionNeedsRefresh(currentSession.expiresAt)) return currentSession;

    try {
      const refreshed = await refreshOperatorSession(currentSession);
      persistSession(refreshed);
      return refreshed;
    } catch (error) {
      if (isSessionAuthFailure(error)) {
        clearStoredSession();
        try {
          await logoutOperatorSession(currentSession);
        } catch {
          // Match the legacy flow: failed remote revocation does not restore local auth.
        }
        return null;
      }
      throw error;
    }
  }, [session]);

  const logout = useCallback(async () => {
    const currentSession = session;
    clearStoredSession();
    if (currentSession) {
      try {
        await logoutOperatorSession(currentSession);
      } catch {
        // Local sign-out remains authoritative when remote revocation is unavailable.
      }
    }
  }, [session]);

  const value = useMemo<DashboardSessionContextValue>(() => ({
    status: loading ? "loading" : session ? "authenticated" : "signed-out",
    session,
    operator: session?.operator ?? null,
    capabilities: session?.operator.capabilities ?? [],
    refreshSession,
    logout
  }), [loading, session, refreshSession, logout]);

  return <DashboardSessionContext.Provider value={value}>{children}</DashboardSessionContext.Provider>;
}

export function useDashboardSession() {
  const context = useContext(DashboardSessionContext);
  if (!context) throw new Error("useDashboardSession must be used within DashboardSessionProvider.");
  return context;
}
