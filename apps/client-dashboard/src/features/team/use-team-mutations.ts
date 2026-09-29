"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { OperatorSession } from "../../api";
import { persistSession } from "../../storage";
import type { OperatorUser } from "../../model";
import { isSessionAuthFailure } from "../auth/session-compat";
import { useDashboardSession } from "../auth/session-provider";
import { useDashboardLocation } from "../location/location-provider";
import {
  canDeleteTeamMember,
  canWriteTeam
} from "./team-domain";
import { createOperatorTeamMember, deleteOperatorTeamMember, updateOperatorTeamMember } from "./team-api";
import { createTeamMutationGate } from "./team-lifecycle";
import { ApiRequestError, fetchOperatorOnboardingSummary, updateOperatorOnboarding } from "../../api";

type TeamAccessors = {
  scopeKey: string;
  reload: () => Promise<boolean>;
  acceptServerMember: (member: OperatorUser, expectedScope: string) => boolean;
  acceptServerRemoval: (operatorUserId: string, expectedScope: string) => boolean;
};

type TeamMutationContext = {
  session: OperatorSession | null;
  operatorUserId: string | null;
  locationId: string | "all" | null;
  scopeKey: string;
  refreshSession: () => Promise<OperatorSession | null>;
  logout: () => Promise<void>;
};

export function useTeamMutations(accessors: TeamAccessors) {
  const { session, refreshSession, logout } = useDashboardSession();
  const location = useDashboardLocation();
  const gate = useRef(createTeamMutationGate());
  const mounted = useRef(false);
  const contextRef = useRef<TeamMutationContext>({
    session,
    operatorUserId: session?.operator.operatorUserId ?? null,
    locationId: location.selectedLocationId,
    scopeKey: accessors.scopeKey,
    refreshSession,
    logout
  });
  const [pendingOperation, setPendingOperation] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  contextRef.current = {
    session,
    operatorUserId: session?.operator.operatorUserId ?? null,
    locationId: location.selectedLocationId,
    scopeKey: accessors.scopeKey,
    refreshSession,
    logout
  };

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);
  useEffect(() => {
    setError(null);
    setNotice(null);
  }, [accessors.scopeKey]);

  const run = useCallback(async <TResult,>(args: {
    label: string;
    successMessage: string;
    fallbackMessage: string;
    operation: (currentSession: OperatorSession, locationId: string) => Promise<TResult>;
    accept: (result: TResult, scopeKey: string, currentSession: OperatorSession) => boolean | "self-updated";
    afterSuccess?: (result: TResult, currentSession: OperatorSession, locationId: string) => Promise<string | null>;
  }) => {
    if (!gate.current.begin()) return false;
    const initial = contextRef.current;
    const expectedScope = initial.scopeKey;
    const expectedOperator = initial.operatorUserId;
    const expectedLocation = initial.locationId;
    const acceptedAccessTokens = new Set(initial.session ? [initial.session.accessToken] : []);
    const stillInScope = () => mounted.current
      && contextRef.current.scopeKey === expectedScope
      && contextRef.current.operatorUserId === expectedOperator
      && contextRef.current.locationId === expectedLocation
      && Boolean(contextRef.current.session && acceptedAccessTokens.has(contextRef.current.session.accessToken));

    if (!initial.session || !expectedLocation || expectedLocation === "all" || !canWriteTeam(initial.session.operator)) {
      if (mounted.current) setError("Choose one location and make sure you have permission to manage team access.");
      gate.current.release();
      return false;
    }
    if (mounted.current) {
      setPendingOperation(args.label);
      setError(null);
      setNotice(null);
    }
    try {
      const currentSession = await initial.refreshSession();
      if (currentSession) acceptedAccessTokens.add(currentSession.accessToken);
      if (!currentSession || !stillInScope()) return false;
      if (!canWriteTeam(currentSession.operator)) throw new Error("Team changes are no longer available for this operator session.");
      const result = await args.operation(currentSession, expectedLocation);
      if (!stillInScope()) return false;
      const followUpMessage = await args.afterSuccess?.(result, currentSession, expectedLocation);
      if (!stillInScope()) return false;
      const accepted = args.accept(result, expectedScope, currentSession);
      if (!accepted) throw new Error("Team data changed. Reload the page before trying again.");
      if (accepted === "self-updated") {
        if (mounted.current) setNotice(args.successMessage);
        return true;
      }
      await accessors.reload();
      if (stillInScope() && mounted.current) setNotice(followUpMessage ? `${args.successMessage} ${followUpMessage}` : args.successMessage);
      return true;
    } catch (mutationError) {
      if (isSessionAuthFailure(mutationError)) void initial.logout();
      if (stillInScope() && mounted.current) {
        setError(mutationError instanceof Error ? mutationError.message : args.fallbackMessage);
      }
      return false;
    } finally {
      gate.current.release();
      if (mounted.current) setPendingOperation(null);
    }
  }, [accessors]);

  const createMember = useCallback((input: Parameters<typeof createOperatorTeamMember>[2]) => run({
    label: "Creating operator account…",
    successMessage: "Operator account created.",
    fallbackMessage: "Unable to create operator account.",
    operation: (currentSession, locationId) => createOperatorTeamMember(currentSession, locationId, input),
    afterSuccess: async (_member, currentSession, locationId) => {
      if (currentSession.operator.role !== "owner") return null;
      try {
        await fetchOperatorOnboardingSummary(currentSession, locationId);
        await updateOperatorOnboarding(currentSession, locationId, { teamConfiguredOrSkipped: true });
        return null;
      } catch (error) {
        if (error instanceof ApiRequestError && error.statusCode === 404) return null;
        return "Setup progress could not be refreshed.";
      }
    },
    accept: () => true
  }), [run]);

  const updateMember = useCallback((member: OperatorUser, input: Parameters<typeof updateOperatorTeamMember>[3]) => run({
    label: "Saving operator access…",
    successMessage: "Operator access updated.",
    fallbackMessage: "Unable to update operator access.",
    operation: (currentSession, locationId) => updateOperatorTeamMember(currentSession, locationId, member.operatorUserId, input),
    accept: (updatedMember, expectedScope, currentSession) => {
      if (!accessors.acceptServerMember(updatedMember, expectedScope)) return false;
      if (updatedMember.operatorUserId === currentSession.operator.operatorUserId) {
        persistSession({ ...currentSession, operator: updatedMember });
        return "self-updated";
      }
      return true;
    }
  }), [accessors, run]);

  const removeMember = useCallback((member: OperatorUser) => run({
    label: "Removing operator account…",
    successMessage: "Operator account removed.",
    fallbackMessage: "Unable to remove operator account.",
    operation: async (currentSession, locationId) => {
      if (!canDeleteTeamMember(currentSession.operator, member)) throw new Error("Only owners can remove another non-owner account.");
      return deleteOperatorTeamMember(currentSession, locationId, member.operatorUserId);
    },
    accept: (_result, expectedScope) => accessors.acceptServerRemoval(member.operatorUserId, expectedScope)
  }), [accessors, run]);

  const clearMessages = useCallback(() => {
    setError(null);
    setNotice(null);
  }, []);

  return {
    pendingOperation,
    isMutating: pendingOperation !== null,
    error,
    notice,
    clearMessages,
    createMember,
    updateMember,
    removeMember
  };
}
