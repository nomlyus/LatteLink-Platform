"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { fetchOperatorMenu, type OperatorSession } from "../../api";
import type { OperatorMenuResponse } from "../../model";
import { canAccessCapability } from "../../model";
import { isSessionAuthFailure } from "../auth/session-compat";
import { useDashboardSession } from "../auth/session-provider";
import { useDashboardLocation } from "../location/location-provider";

type MenuCatalogState = {
  scopeKey: string;
  status: "loading" | "ready" | "error";
  menu: OperatorMenuResponse | null;
  error: string | null;
};

type MenuLoadContext = {
  session: OperatorSession | null;
  locationId: string | "all" | null;
  locationStatus: "idle" | "loading" | "ready" | "error";
  canRead: boolean;
  refreshSession: () => Promise<OperatorSession | null>;
  logout: () => Promise<void>;
};

function getScopeKey(operatorUserId: string | null, locationId: string | "all" | null) {
  return `${operatorUserId ?? "signed-out"}:${locationId ?? "unselected"}`;
}

export function useMenuCatalog() {
  const { status: sessionStatus, session, refreshSession, logout } = useDashboardSession();
  const location = useDashboardLocation();
  const operatorUserId = session?.operator.operatorUserId ?? null;
  const scopeKey = getScopeKey(operatorUserId, location.selectedLocationId);
  const canRead = canAccessCapability(session?.operator, "menu:read");
  const contextRef = useRef<MenuLoadContext>({
    session,
    locationId: location.selectedLocationId,
    locationStatus: location.status,
    canRead,
    refreshSession,
    logout
  });
  const sequence = useRef(0);
  const controller = useRef<AbortController | null>(null);
  const [catalogState, setCatalogState] = useState<MenuCatalogState>({
    scopeKey: "",
    status: "loading",
    menu: null,
    error: null
  });

  contextRef.current = {
    session,
    locationId: location.selectedLocationId,
    locationStatus: location.status,
    canRead,
    refreshSession,
    logout
  };

  useEffect(() => {
    if (session) void location.loadAvailableLocations();
  }, [location.loadAvailableLocations, session]);

  const loadMenu = useCallback(async () => {
    const context = contextRef.current;
    const requestScope = getScopeKey(context.session?.operator.operatorUserId ?? null, context.locationId);
    const requestSequence = ++sequence.current;
    controller.current?.abort();
    controller.current = null;

    if (!context.session) {
      setCatalogState({ scopeKey: requestScope, status: "ready", menu: null, error: null });
      return false;
    }
    if (!context.canRead) {
      setCatalogState({ scopeKey: requestScope, status: "error", menu: null, error: "You don’t have permission to view this menu." });
      return false;
    }
    if (context.locationStatus !== "ready") {
      setCatalogState({ scopeKey: requestScope, status: "loading", menu: null, error: null });
      return false;
    }
    if (context.locationId === "all" || context.locationId === null) {
      setCatalogState({ scopeKey: requestScope, status: "ready", menu: null, error: null });
      return true;
    }

    const requestController = new AbortController();
    controller.current = requestController;
    setCatalogState({ scopeKey: requestScope, status: "loading", menu: null, error: null });
    try {
      const currentSession = await context.refreshSession();
      if (!currentSession || requestController.signal.aborted || requestSequence !== sequence.current) return false;
      const menu = await fetchOperatorMenu(currentSession, context.locationId, requestController.signal);
      if (requestController.signal.aborted || requestSequence !== sequence.current) return false;
      const currentContext = contextRef.current;
      if (getScopeKey(currentContext.session?.operator.operatorUserId ?? null, currentContext.locationId) !== requestScope) return false;
      setCatalogState({ scopeKey: requestScope, status: "ready", menu, error: null });
      return true;
    } catch (error) {
      if (requestController.signal.aborted || requestSequence !== sequence.current) return false;
      if (isSessionAuthFailure(error)) void context.logout();
      const currentContext = contextRef.current;
      if (getScopeKey(currentContext.session?.operator.operatorUserId ?? null, currentContext.locationId) === requestScope) {
        setCatalogState({
          scopeKey: requestScope,
          status: "error",
          menu: null,
          error: error instanceof Error ? error.message : "Unable to load this location’s menu."
        });
      }
      return false;
    } finally {
      if (controller.current === requestController) controller.current = null;
    }
  }, []);

  useEffect(() => {
    void loadMenu();
    return () => {
      sequence.current += 1;
      controller.current?.abort();
      controller.current = null;
    };
  }, [canRead, location.selectedLocationId, location.status, loadMenu, operatorUserId, sessionStatus]);

  const currentState = catalogState.scopeKey === scopeKey
    ? catalogState
    : { scopeKey, status: "loading" as const, menu: null, error: null };

  return {
    status: currentState.status,
    menu: currentState.menu,
    error: currentState.error,
    scopeKey,
    reload: loadMenu
  };
}
