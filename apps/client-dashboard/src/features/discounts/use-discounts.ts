"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { OperatorSession } from "../../api";
import { canAccessCapability, type OperatorDiscountCode } from "../../model";
import { isSessionAuthFailure } from "../auth/session-compat";
import { useDashboardSession } from "../auth/session-provider";
import { useDashboardLocation } from "../location/location-provider";
import { fetchOperatorDiscountCodes } from "./discounts-api";
import { createDiscountsRequestLifecycle, getDiscountsScopeKey } from "./discounts-lifecycle";

type DiscountsState = {
  scopeKey: string;
  status: "loading" | "ready" | "error";
  discountCodes: OperatorDiscountCode[] | null;
  error: string | null;
};

type DiscountsLoadContext = {
  session: OperatorSession | null;
  locationId: string | "all" | null;
  locationStatus: "idle" | "loading" | "ready" | "error";
  locationError: string | null;
  canRead: boolean;
  refreshSession: () => Promise<OperatorSession | null>;
  logout: () => Promise<void>;
};

export function useDiscounts() {
  const { status: sessionStatus, session, refreshSession, logout } = useDashboardSession();
  const location = useDashboardLocation();
  const operatorUserId = session?.operator.operatorUserId ?? null;
  const scopeKey = getDiscountsScopeKey(operatorUserId, location.selectedLocationId);
  const canRead = canAccessCapability(session?.operator, "menu:read");
  const contextRef = useRef<DiscountsLoadContext>({
    session,
    locationId: location.selectedLocationId,
    locationStatus: location.status,
    locationError: location.error,
    canRead,
    refreshSession,
    logout
  });
  const requests = useRef(createDiscountsRequestLifecycle());
  const mounted = useRef(false);
  const stateRef = useRef<DiscountsState>({ scopeKey: "", status: "loading", discountCodes: null, error: null });
  const [discountsState, setDiscountsState] = useState<DiscountsState>(stateRef.current);

  contextRef.current = {
    session,
    locationId: location.selectedLocationId,
    locationStatus: location.status,
    locationError: location.error,
    canRead,
    refreshSession,
    logout
  };
  stateRef.current = discountsState;

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
    const requestScope = getDiscountsScopeKey(context.session?.operator.operatorUserId ?? null, context.locationId);
    const request = requests.current.begin();

    if (!context.session) {
      setDiscountsState({ scopeKey: requestScope, status: "ready", discountCodes: null, error: null });
      requests.current.finish(request);
      return false;
    }
    if (!context.canRead) {
      setDiscountsState({ scopeKey: requestScope, status: "error", discountCodes: null, error: "You don’t have permission to view discount codes." });
      requests.current.finish(request);
      return false;
    }
    if (context.locationStatus === "error") {
      setDiscountsState({ scopeKey: requestScope, status: "error", discountCodes: null, error: context.locationError ?? "Unable to load authorized locations." });
      requests.current.finish(request);
      return false;
    }
    if (context.locationStatus !== "ready") {
      setDiscountsState({ scopeKey: requestScope, status: "loading", discountCodes: null, error: null });
      requests.current.finish(request);
      return false;
    }
    if (context.locationId === "all" || context.locationId === null) {
      setDiscountsState({ scopeKey: requestScope, status: "ready", discountCodes: [], error: null });
      requests.current.finish(request);
      return true;
    }

    setDiscountsState({ scopeKey: requestScope, status: "loading", discountCodes: null, error: null });
    try {
      const currentSession = await context.refreshSession();
      if (!currentSession || !requests.current.isCurrent(request)) return false;
      const discountCodes = await fetchOperatorDiscountCodes(currentSession, context.locationId, request.controller.signal);
      if (!requests.current.isCurrent(request)) return false;
      const currentContext = contextRef.current;
      if (getDiscountsScopeKey(currentContext.session?.operator.operatorUserId ?? null, currentContext.locationId) !== requestScope) return false;
      setDiscountsState({ scopeKey: requestScope, status: "ready", discountCodes, error: null });
      return true;
    } catch (error) {
      if (!requests.current.isCurrent(request)) return false;
      if (isSessionAuthFailure(error)) void context.logout();
      const currentContext = contextRef.current;
      if (getDiscountsScopeKey(currentContext.session?.operator.operatorUserId ?? null, currentContext.locationId) === requestScope) {
        setDiscountsState({
          scopeKey: requestScope,
          status: "error",
          discountCodes: null,
          error: error instanceof Error ? error.message : "Unable to load discount codes for this location."
        });
      }
      return false;
    } finally {
      requests.current.finish(request);
    }
  }, []);

  const acceptServerDiscountCode = useCallback((discountCode: OperatorDiscountCode, expectedScope: string) => {
    const context = contextRef.current;
    if (!mounted.current || getDiscountsScopeKey(context.session?.operator.operatorUserId ?? null, context.locationId) !== expectedScope) return false;
    const current = stateRef.current;
    if (current.scopeKey !== expectedScope || current.status !== "ready" || !current.discountCodes) return false;
    requests.current.invalidate();
    const exists = current.discountCodes.some((candidate) => candidate.discountCodeId === discountCode.discountCodeId);
    const nextCodes = exists
      ? current.discountCodes.map((candidate) => candidate.discountCodeId === discountCode.discountCodeId ? discountCode : candidate)
      : [...current.discountCodes, discountCode];
    setDiscountsState({ scopeKey: expectedScope, status: "ready", discountCodes: nextCodes, error: null });
    return true;
  }, []);

  useEffect(() => {
    void reload();
    return () => requests.current.invalidate();
  }, [canRead, location.selectedLocationId, location.status, operatorUserId, reload, sessionStatus]);

  const currentState = discountsState.scopeKey === scopeKey
    ? discountsState
    : { scopeKey, status: "loading" as const, discountCodes: null, error: null };

  return {
    status: currentState.status,
    discountCodes: currentState.discountCodes,
    error: currentState.error,
    scopeKey,
    reload,
    acceptServerDiscountCode
  };
}
