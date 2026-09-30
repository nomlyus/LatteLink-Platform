"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { OperatorSession } from "../../api";
import type { OperatorUser } from "../../model";
import { isSessionAuthFailure } from "../auth/session-compat";
import { useDashboardSession } from "../auth/session-provider";
import { useDashboardLocation } from "../location/location-provider";
import { fetchOperatorTeam } from "./team-api";
import { createTeamRequestLifecycle } from "./team-lifecycle";
import { getTeamScopeKey } from "./team-domain";

type TeamState = {
  scopeKey: string;
  status: "loading" | "ready" | "error";
  members: OperatorUser[] | null;
  error: string | null;
};

type TeamLoadContext = {
  session: OperatorSession | null;
  locationId: string | "all" | null;
  locationStatus: "idle" | "loading" | "ready" | "error";
  locationError: string | null;
  capabilities: readonly string[];
  canRead: boolean;
  refreshSession: () => Promise<OperatorSession | null>;
  logout: () => Promise<void>;
};

const emptyTeamState: TeamState = { scopeKey: "", status: "loading", members: null, error: null };

export function useTeam() {
  const { status: sessionStatus, session, refreshSession, logout } = useDashboardSession();
  const location = useDashboardLocation();
  const operatorUserId = session?.operator.operatorUserId ?? null;
  const capabilities = session?.operator.capabilities ?? [];
  const scopeKey = getTeamScopeKey(operatorUserId, location.selectedLocationId, capabilities);
  const contextRef = useRef<TeamLoadContext>({
    session,
    locationId: location.selectedLocationId,
    locationStatus: location.status,
    locationError: location.error,
    capabilities,
    canRead: capabilities.includes("team:read"),
    refreshSession,
    logout
  });
  const requests = useRef(createTeamRequestLifecycle());
  const mounted = useRef(false);
  const stateRef = useRef<TeamState>(emptyTeamState);
  const [teamState, setTeamState] = useState<TeamState>(emptyTeamState);

  contextRef.current = {
    session,
    locationId: location.selectedLocationId,
    locationStatus: location.status,
    locationError: location.error,
    capabilities,
    canRead: capabilities.includes("team:read"),
    refreshSession,
    logout
  };
  stateRef.current = teamState;

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      requests.current.invalidate();
    };
  }, []);

  useEffect(() => {
    if (session) void location.loadAvailableLocations();
  }, [location.loadAvailableLocations, session]);

  const reload = useCallback(async () => {
    if (!mounted.current) return false;
    const context = contextRef.current;
    const requestScope = getTeamScopeKey(
      context.session?.operator.operatorUserId ?? null,
      context.locationId,
      context.capabilities
    );
    const request = requests.current.begin();

    if (!context.session) {
      setTeamState({ scopeKey: requestScope, status: "ready", members: null, error: null });
      requests.current.finish(request);
      return false;
    }
    if (!context.canRead) {
      setTeamState({ scopeKey: requestScope, status: "error", members: null, error: "You don’t have permission to view team members." });
      requests.current.finish(request);
      return false;
    }
    if (context.locationStatus === "error") {
      setTeamState({ scopeKey: requestScope, status: "error", members: null, error: context.locationError ?? "Unable to load authorized locations." });
      requests.current.finish(request);
      return false;
    }
    if (context.locationStatus !== "ready") {
      setTeamState({ scopeKey: requestScope, status: "loading", members: null, error: null });
      requests.current.finish(request);
      return false;
    }
    if (!context.locationId || context.locationId === "all") {
      setTeamState({ scopeKey: requestScope, status: "ready", members: [], error: null });
      requests.current.finish(request);
      return true;
    }

    setTeamState({ scopeKey: requestScope, status: "loading", members: null, error: null });
    try {
      const currentSession = await context.refreshSession();
      if (!currentSession || !requests.current.isCurrent(request)) return false;
      if (contextRef.current.session?.accessToken !== currentSession.accessToken) return false;
      const members = await fetchOperatorTeam(currentSession, context.locationId, request.controller.signal);
      if (!requests.current.isCurrent(request)) return false;
      const currentContext = contextRef.current;
      if (currentContext.session?.accessToken !== currentSession.accessToken) return false;
      if (getTeamScopeKey(
        currentContext.session?.operator.operatorUserId ?? null,
        currentContext.locationId,
        currentContext.capabilities
      ) !== requestScope) return false;
      setTeamState({ scopeKey: requestScope, status: "ready", members, error: null });
      return true;
    } catch (error) {
      if (!requests.current.isCurrent(request)) return false;
      if (isSessionAuthFailure(error)) void context.logout();
      const currentContext = contextRef.current;
      if (getTeamScopeKey(
        currentContext.session?.operator.operatorUserId ?? null,
        currentContext.locationId,
        currentContext.capabilities
      ) === requestScope) {
        setTeamState({
          scopeKey: requestScope,
          status: "error",
          members: null,
          error: error instanceof Error ? error.message : "Unable to load team members for this location."
        });
      }
      return false;
    } finally {
      requests.current.finish(request);
    }
  }, []);

  const acceptServerMember = useCallback((member: OperatorUser, expectedScope: string) => {
    const context = contextRef.current;
    if (!mounted.current || getTeamScopeKey(
      context.session?.operator.operatorUserId ?? null,
      context.locationId,
      context.capabilities
    ) !== expectedScope) return false;
    const current = stateRef.current;
    if (current.scopeKey !== expectedScope || current.status !== "ready" || !current.members) return false;
    requests.current.invalidate();
    const exists = current.members.some((candidate) => candidate.operatorUserId === member.operatorUserId);
    const members = exists
      ? current.members.map((candidate) => candidate.operatorUserId === member.operatorUserId ? member : candidate)
      : [...current.members, member];
    setTeamState({ scopeKey: expectedScope, status: "ready", members, error: null });
    return true;
  }, []);

  const acceptServerRemoval = useCallback((operatorUserIdToRemove: string, expectedScope: string) => {
    const context = contextRef.current;
    if (!mounted.current || getTeamScopeKey(
      context.session?.operator.operatorUserId ?? null,
      context.locationId,
      context.capabilities
    ) !== expectedScope) return false;
    const current = stateRef.current;
    if (current.scopeKey !== expectedScope || current.status !== "ready" || !current.members) return false;
    requests.current.invalidate();
    setTeamState({
      scopeKey: expectedScope,
      status: "ready",
      members: current.members.filter((member) => member.operatorUserId !== operatorUserIdToRemove),
      error: null
    });
    return true;
  }, []);

  useEffect(() => {
    void reload();
    return () => requests.current.invalidate();
  }, [location.selectedLocationId, location.status, operatorUserId, capabilities, reload, sessionStatus, session]);

  const currentState = teamState.scopeKey === scopeKey
    ? teamState
    : { ...emptyTeamState, scopeKey };

  return {
    members: currentState.members,
    status: currentState.status,
    error: currentState.error,
    scopeKey,
    reload,
    acceptServerMember,
    acceptServerRemoval
  };
}
