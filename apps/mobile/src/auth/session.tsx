import { createContext, useContext, useMemo, useState, type ReactNode } from "react";
import { apiClient } from "../api/client";

type AuthSession = {
  accessToken: string;
  refreshToken: string;
  expiresAt: string;
  userId: string;
};

type SessionContextValue = {
  session: AuthSession | null;
  isAuthenticated: boolean;
  signIn: (nextSession: AuthSession) => void;
  signOut: () => void;
};

const SessionContext = createContext<SessionContextValue | undefined>(undefined);

export function AuthSessionProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<AuthSession | null>(null);

  const value = useMemo<SessionContextValue>(
    () => ({
      session,
      isAuthenticated: session !== null,
      signIn: (nextSession) => {
        apiClient.setAccessToken(nextSession.accessToken);
        setSession(nextSession);
      },
      signOut: () => {
        apiClient.setAccessToken(undefined);
        setSession(null);
      }
    }),
    [session]
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
