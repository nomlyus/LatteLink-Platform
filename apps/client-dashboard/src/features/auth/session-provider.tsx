"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode
} from "react";
import { logoutOperatorSession, refreshOperatorSession } from "./auth-api";
import type { OperatorCapability, OperatorSession, OperatorUser } from "./auth-types";
import { sessionNeedsRefresh } from "../../model";
import { clearStoredSession, loadStoredSession, persistSession, subscribeToStoredSession } from "../../storage";
import { isSessionAuthFailure } from "./session-compat";
import { createSessionRestoreCoordinator, isCurrentSessionOperation } from "./session-domain";

type DashboardSessionContextValue = {
  status: "loading" | "signed-out" | "authenticated";
  session: OperatorSession | null;
  operator: OperatorUser | null;
  capabilities: readonly OperatorCapability[];
  authNotice: string | null;
  establishSession: (session: OperatorSession, notice?: string) => void;
  discardLocalSession: () => void;
  clearAuthNotice: () => void;
  refreshSession: () => Promise<OperatorSession | null>;
  logout: () => Promise<void>;
};

const DashboardSessionContext = createContext<DashboardSessionContextValue | null>(null);

function sameSession(left: OperatorSession | null, right: OperatorSession | null) {
  return left?.operator.operatorUserId === right?.operator.operatorUserId &&
    left?.accessToken === right?.accessToken && left?.refreshToken === right?.refreshToken;
}

export function DashboardSessionProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<OperatorSession | null>(null);
  const [loading, setLoading] = useState(true);
  const [authNotice, setAuthNotice] = useState<string | null>(null);
  const sessionRef = useRef<OperatorSession | null>(null);
  const revisionRef = useRef(0);
  const refreshFlightRef = useRef<{ refreshToken: string; promise: Promise<OperatorSession | null> } | null>(null);
  const restoreSessionOnce = useRef(createSessionRestoreCoordinator()).current;

  const publishSession = useCallback((nextSession: OperatorSession | null) => {
    sessionRef.current = nextSession;
    setSession(nextSession);
  }, []);

  const discardLocalSession = useCallback(() => {
    revisionRef.current += 1;
    refreshFlightRef.current = null;
    setAuthNotice(null);
    clearStoredSession();
    publishSession(null);
  }, [publishSession]);

  const establishSession = useCallback((nextSession: OperatorSession, notice?: string) => {
    revisionRef.current += 1;
    refreshFlightRef.current = null;
    setAuthNotice(notice ?? null);
    publishSession(nextSession);
    persistSession(nextSession);
  }, [publishSession]);

  useEffect(() => {
    let mounted = true;
    let initialRestore = true;
    const synchronizeFromStorage = () => {
      if (!mounted) return;
      const stored = loadStoredSession();
      if (!sameSession(sessionRef.current, stored)) {
        revisionRef.current += 1;
        refreshFlightRef.current = null;
        sessionRef.current = stored;
        setSession(stored);
        setAuthNotice(null);
      }
      if (!initialRestore) setLoading(false);
    };

    const unsubscribe = subscribeToStoredSession(synchronizeFromStorage);
    synchronizeFromStorage();
    const restoredSession = sessionRef.current;
    const restoredRevision = revisionRef.current;
    if (restoredSession) {
      void restoreSessionOnce(restoredSession, refreshOperatorSession).then((result) => {
        if (!mounted || !isCurrentSessionOperation(restoredRevision, revisionRef.current, restoredSession.refreshToken, sessionRef.current)) return;
        if (result.invalid) {
          discardLocalSession();
          setAuthNotice("Your session expired. Sign in again to continue.");
          if (result.remoteRevocationRequired) void logoutOperatorSession(restoredSession).catch(() => undefined);
        } else if (result.session && result.session.refreshToken !== restoredSession.refreshToken) {
          publishSession(result.session);
          persistSession(result.session);
        }
      }).finally(() => {
        if (mounted) setLoading(false);
      });
    } else {
      setLoading(false);
    }
    initialRestore = false;
    return () => {
      mounted = false;
      unsubscribe();
    };
  }, [discardLocalSession, publishSession]);

  const refreshSession = useCallback(async () => {
    const currentSession = sessionRef.current;
    if (!currentSession) return null;
    if (!sessionNeedsRefresh(currentSession.expiresAt)) return currentSession;

    const existingFlight = refreshFlightRef.current;
    if (existingFlight?.refreshToken === currentSession.refreshToken) return existingFlight.promise;

    const revision = revisionRef.current;
    let promise: Promise<OperatorSession | null> = Promise.resolve(null);
    promise = (async (): Promise<OperatorSession | null> => {
      try {
        const refreshed = await refreshOperatorSession(currentSession);
        if (!isCurrentSessionOperation(revision, revisionRef.current, currentSession.refreshToken, sessionRef.current)) {
          return sessionRef.current;
        }
        publishSession(refreshed);
        persistSession(refreshed);
        return refreshed;
      } catch (error) {
        if (!isCurrentSessionOperation(revision, revisionRef.current, currentSession.refreshToken, sessionRef.current)) {
          return sessionRef.current;
        }
        if (isSessionAuthFailure(error)) {
          discardLocalSession();
          try {
            await logoutOperatorSession(currentSession);
          } catch {
            // Local sign-out remains authoritative if remote revocation is unavailable.
          }
          return null;
        }
        throw error;
      } finally {
        if (refreshFlightRef.current?.promise === promise) refreshFlightRef.current = null;
      }
    })();
    refreshFlightRef.current = { refreshToken: currentSession.refreshToken, promise };
    return promise;
  }, [discardLocalSession, publishSession]);

  const logout = useCallback(async () => {
    const currentSession = sessionRef.current;
    discardLocalSession();
    if (!currentSession) return;
    try {
      await logoutOperatorSession(currentSession);
    } catch {
      // Local sign-out remains authoritative if remote revocation is unavailable.
    }
  }, [discardLocalSession]);

  const clearAuthNotice = useCallback(() => setAuthNotice(null), []);
  const value = useMemo<DashboardSessionContextValue>(() => ({
    status: loading ? "loading" : session ? "authenticated" : "signed-out",
    session,
    operator: session?.operator ?? null,
    capabilities: session?.operator.capabilities ?? [],
    authNotice,
    establishSession,
    discardLocalSession,
    clearAuthNotice,
    refreshSession,
    logout
  }), [loading, session, authNotice, establishSession, discardLocalSession, clearAuthNotice, refreshSession, logout]);

  return <DashboardSessionContext.Provider value={value}>{children}</DashboardSessionContext.Provider>;
}

export function useDashboardSession() {
  const context = useContext(DashboardSessionContext);
  if (!context) throw new Error("useDashboardSession must be used within DashboardSessionProvider.");
  return context;
}
