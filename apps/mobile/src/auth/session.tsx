import { useQueryClient } from "@tanstack/react-query";
import { AppState } from "react-native";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { apiClient } from "../api/client";
import { type AuthRecoveryState } from "./recovery";
import {
  clearStoredSession,
  getSessionRefreshDelayMs,
  isSessionExpiringSoon,
  loadStoredSession,
  persistSession,
  type AuthSession
} from "./sessionStore";

type SignOutOptions = {
  revokeRemote?: boolean;
};

type SessionContextValue = {
  session: AuthSession | null;
  isAuthenticated: boolean;
  isHydrating: boolean;
  authRecoveryState: AuthRecoveryState;
  signIn: (nextSession: AuthSession) => Promise<void>;
  signOut: (options?: SignOutOptions) => Promise<void>;
  refreshSession: () => Promise<AuthSession | null>;
};

const SessionContext = createContext<SessionContextValue | undefined>(undefined);

export function AuthSessionProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [session, setSession] = useState<AuthSession | null>(null);
  const [isHydrating, setIsHydrating] = useState(true);
  const [authRecoveryState, setAuthRecoveryState] = useState<AuthRecoveryState>("idle");
  const sessionRef = useRef<AuthSession | null>(null);
  const refreshInFlightRef = useRef<Promise<AuthSession | null> | null>(null);

  const clearAccountQueries = useCallback(async () => {
    await queryClient.cancelQueries({ queryKey: ["account"] });
    queryClient.removeQueries({ queryKey: ["account"] });
  }, [queryClient]);

  const clearLocalSession = useCallback(
    async (recoveryState: AuthRecoveryState = "idle") => {
      apiClient.setAccessToken(undefined);
      sessionRef.current = null;
      setSession(null);
      setAuthRecoveryState(recoveryState);
      try {
        await Promise.all([clearStoredSession(), clearAccountQueries()]);
      } catch {
        // If local cleanup fails, keep in-memory session cleared.
      }
    },
    [clearAccountQueries]
  );

  const signIn = useCallback(async (nextSession: AuthSession) => {
    setAuthRecoveryState("idle");
    apiClient.setAccessToken(nextSession.accessToken);
    sessionRef.current = nextSession;
    setSession(nextSession);
    try {
      await persistSession(nextSession);
    } catch {
      // Session remains active even if persistence fails.
    }
  }, []);

  const signOut = useCallback(
    async (options?: SignOutOptions) => {
      const shouldRevokeRemote = options?.revokeRemote ?? true;
      if (shouldRevokeRemote && session?.refreshToken) {
        try {
          await apiClient.logout({ refreshToken: session.refreshToken });
        } catch {
          // Best effort remote revoke.
        }
      }

      await clearLocalSession("idle");
    },
    [clearLocalSession, session?.refreshToken]
  );

  const refreshSession = useCallback(async (): Promise<AuthSession | null> => {
    if (refreshInFlightRef.current) {
      return refreshInFlightRef.current;
    }

    const currentSession = sessionRef.current;
    if (!currentSession) {
      return null;
    }

    const refreshPromise = (async (): Promise<AuthSession | null> => {
      try {
        const nextSession = await apiClient.refreshSession({ refreshToken: currentSession.refreshToken });
        await signIn(nextSession);
        return nextSession;
      } catch {
        if (sessionRef.current?.refreshToken === currentSession.refreshToken) {
          await clearLocalSession("expired");
        }
        return null;
      } finally {
        refreshInFlightRef.current = null;
      }
    })();

    refreshInFlightRef.current = refreshPromise;
    return refreshPromise;
  }, [clearLocalSession, signIn]);

  useEffect(() => {
    sessionRef.current = session;
  }, [session]);

  useEffect(() => {
    let isMounted = true;

    async function hydrate() {
      try {
        const storedSession = await loadStoredSession();
        if (!isMounted) {
          return;
        }

        if (!storedSession) {
          apiClient.setAccessToken(undefined);
          setSession(null);
          setAuthRecoveryState("idle");
          return;
        }

        if (isSessionExpiringSoon(storedSession)) {
          try {
            const refreshedSession = await apiClient.refreshSession({ refreshToken: storedSession.refreshToken });
            if (!isMounted) {
              return;
            }
            await signIn(refreshedSession);
          } catch {
            if (!isMounted) {
              return;
            }
            await clearLocalSession("expired");
          }
          return;
        }

        apiClient.setAccessToken(storedSession.accessToken);
        sessionRef.current = storedSession;
        setSession(storedSession);
        setAuthRecoveryState("idle");
      } finally {
        if (isMounted) {
          setIsHydrating(false);
        }
      }
    }

    void hydrate();
    return () => {
      isMounted = false;
    };
  }, [clearLocalSession, signIn]);

  useEffect(() => {
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active" && session && isSessionExpiringSoon(session)) {
        void refreshSession();
      }
    });

    return () => {
      subscription.remove();
    };
  }, [refreshSession, session]);

  useEffect(() => {
    apiClient.setSessionRefreshHandler(refreshSession);

    return () => {
      apiClient.setSessionRefreshHandler(undefined);
    };
  }, [refreshSession]);

  useEffect(() => {
    if (!session) {
      return;
    }

    const refreshTimeout = setTimeout(() => {
      void refreshSession();
    }, getSessionRefreshDelayMs(session));

    return () => {
      clearTimeout(refreshTimeout);
    };
  }, [refreshSession, session]);

  const value = useMemo<SessionContextValue>(
    () => ({
      session,
      isHydrating,
      isAuthenticated: session !== null,
      authRecoveryState,
      signIn,
      signOut,
      refreshSession
    }),
    [authRecoveryState, isHydrating, refreshSession, session, signIn, signOut]
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useAuthSession() {
  const context = useContext(SessionContext);
  if (!context) {
    throw new Error("useAuthSession must be used inside AuthSessionProvider");
  }

  return context;
}
