import { isSessionAuthFailure } from "./session-compat";
import type { OperatorSession } from "./auth-types";

export type PersistedSessionRestore = {
  session: OperatorSession | null;
  invalid: boolean;
  remoteRevocationRequired: boolean;
};

export function createSessionRestoreCoordinator() {
  let inFlight: {
    operatorUserId: string;
    apiBaseUrl: string;
    refreshToken: string;
    promise: Promise<PersistedSessionRestore>;
  } | null = null;

  return (session: OperatorSession, refresh: (session: OperatorSession) => Promise<OperatorSession>) => {
    if (
      inFlight?.operatorUserId === session.operator.operatorUserId &&
      inFlight.apiBaseUrl === session.apiBaseUrl &&
      inFlight.refreshToken === session.refreshToken
    ) {
      return inFlight.promise;
    }

    const promise = restorePersistedSession(session, refresh).finally(() => {
      if (inFlight?.promise === promise) inFlight = null;
    });
    inFlight = {
      operatorUserId: session.operator.operatorUserId,
      apiBaseUrl: session.apiBaseUrl,
      refreshToken: session.refreshToken,
      promise
    };
    return promise;
  };
}

export async function restorePersistedSession(
  session: OperatorSession,
  refresh: (session: OperatorSession) => Promise<OperatorSession>,
  now = Date.now()
): Promise<PersistedSessionRestore> {
  if (Date.parse(session.expiresAt) > now + 60_000) {
    return { session, invalid: false, remoteRevocationRequired: false };
  }

  try {
    return { session: await refresh(session), invalid: false, remoteRevocationRequired: false };
  } catch (error) {
    const authorizationFailure = isSessionAuthFailure(error);
    const alreadyExpired = Date.parse(session.expiresAt) <= now;
    if (authorizationFailure || alreadyExpired) {
      return { session: null, invalid: true, remoteRevocationRequired: authorizationFailure };
    }
    // A still-valid access token remains usable if refresh is temporarily unavailable.
    return { session, invalid: false, remoteRevocationRequired: false };
  }
}

export function isCurrentSessionOperation(
  expectedRevision: number,
  actualRevision: number,
  expectedRefreshToken: string,
  currentSession: OperatorSession | null
) {
  return expectedRevision === actualRevision && currentSession?.refreshToken === expectedRefreshToken;
}
