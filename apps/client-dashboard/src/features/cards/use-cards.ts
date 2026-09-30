"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { OperatorSession } from "../../api";
import type { OperatorNewsCard } from "../../model";
import { canAccessCapability } from "../../model";
import { isSessionAuthFailure } from "../auth/session-compat";
import { useDashboardSession } from "../auth/session-provider";
import { useDashboardLocation } from "../location/location-provider";
import { fetchOperatorNewsCards } from "./cards-api";
import { createCardsRequestLifecycle } from "./cards-lifecycle";
import { sortNewsCards } from "./cards-domain";

type CardsState = {
  scopeKey: string;
  status: "loading" | "ready" | "error";
  cards: OperatorNewsCard[] | null;
  error: string | null;
};

type CardsLoadContext = {
  session: OperatorSession | null;
  locationId: string | "all" | null;
  locationStatus: "idle" | "loading" | "ready" | "error";
  canRead: boolean;
  refreshSession: () => Promise<OperatorSession | null>;
  logout: () => Promise<void>;
};

function getCardsScope(operatorUserId: string | null, locationId: string | "all" | null) {
  return `${operatorUserId ?? "signed-out"}:${locationId ?? "unselected"}`;
}

export function useCards() {
  const { status: sessionStatus, session, refreshSession, logout } = useDashboardSession();
  const location = useDashboardLocation();
  const operatorUserId = session?.operator.operatorUserId ?? null;
  const scopeKey = getCardsScope(operatorUserId, location.selectedLocationId);
  const canRead = canAccessCapability(session?.operator, "menu:read");
  const contextRef = useRef<CardsLoadContext>({
    session,
    locationId: location.selectedLocationId,
    locationStatus: location.status,
    canRead,
    refreshSession,
    logout
  });
  const requests = useRef(createCardsRequestLifecycle());
  const mounted = useRef(false);
  const stateRef = useRef<CardsState>({ scopeKey: "", status: "loading", cards: null, error: null });
  const [cardsState, setCardsState] = useState<CardsState>(stateRef.current);

  contextRef.current = {
    session,
    locationId: location.selectedLocationId,
    locationStatus: location.status,
    canRead,
    refreshSession,
    logout
  };
  stateRef.current = cardsState;

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  useEffect(() => {
    if (session) void location.loadAvailableLocations();
  }, [location.loadAvailableLocations, session]);

  const reload = useCallback(async () => {
    if (!mounted.current) return false;
    const context = contextRef.current;
    const requestScope = getCardsScope(context.session?.operator.operatorUserId ?? null, context.locationId);
    const request = requests.current.begin();

    if (!context.session) {
      setCardsState({ scopeKey: requestScope, status: "ready", cards: null, error: null });
      return false;
    }
    if (!context.canRead) {
      setCardsState({ scopeKey: requestScope, status: "error", cards: null, error: "You don’t have permission to view cards." });
      return false;
    }
    if (context.locationStatus !== "ready") {
      setCardsState({ scopeKey: requestScope, status: "loading", cards: null, error: null });
      return false;
    }
    if (context.locationId === "all" || context.locationId === null) {
      setCardsState({ scopeKey: requestScope, status: "ready", cards: [], error: null });
      return true;
    }

    const requestController = request.controller;
    setCardsState({ scopeKey: requestScope, status: "loading", cards: null, error: null });
    try {
      const currentSession = await context.refreshSession();
      if (!currentSession || !requests.current.isCurrent(request)) return false;
      const response = await fetchOperatorNewsCards(currentSession, context.locationId, requestController.signal);
      if (!requests.current.isCurrent(request)) return false;
      const currentContext = contextRef.current;
      if (getCardsScope(currentContext.session?.operator.operatorUserId ?? null, currentContext.locationId) !== requestScope) return false;
      setCardsState({ scopeKey: requestScope, status: "ready", cards: sortNewsCards(response.cards), error: null });
      return true;
    } catch (error) {
      if (!requests.current.isCurrent(request)) return false;
      if (isSessionAuthFailure(error)) void context.logout();
      const currentContext = contextRef.current;
      if (getCardsScope(currentContext.session?.operator.operatorUserId ?? null, currentContext.locationId) === requestScope) {
        setCardsState({
          scopeKey: requestScope,
          status: "error",
          cards: null,
          error: error instanceof Error ? error.message : "Unable to load cards for this location."
        });
      }
      return false;
    } finally {
      requests.current.finish(request);
    }
  }, []);

  const acceptServerCards = useCallback((cards: OperatorNewsCard[], expectedScope: string) => {
    const context = contextRef.current;
    if (!mounted.current || getCardsScope(context.session?.operator.operatorUserId ?? null, context.locationId) !== expectedScope) return false;
    requests.current.invalidate();
    setCardsState({ scopeKey: expectedScope, status: "ready", cards: sortNewsCards(cards), error: null });
    return true;
  }, []);

  const acceptServerCard = useCallback((card: OperatorNewsCard, expectedScope: string) => {
    const context = contextRef.current;
    if (!mounted.current || getCardsScope(context.session?.operator.operatorUserId ?? null, context.locationId) !== expectedScope) return false;
    const current = stateRef.current;
    if (current.scopeKey !== expectedScope || current.status !== "ready" || !current.cards) return false;
    requests.current.invalidate();
    setCardsState({
      scopeKey: expectedScope,
      status: "ready",
      cards: sortNewsCards(current.cards.map((candidate) => candidate.cardId === card.cardId ? card : candidate)),
      error: null
    });
    return true;
  }, []);

  useEffect(() => {
    void reload();
    return () => {
      requests.current.invalidate();
    };
  }, [canRead, location.selectedLocationId, location.status, operatorUserId, reload, sessionStatus]);

  const currentState = cardsState.scopeKey === scopeKey
    ? cardsState
    : { scopeKey, status: "loading" as const, cards: null, error: null };

  return {
    status: currentState.status,
    cards: currentState.cards,
    error: currentState.error,
    scopeKey,
    reload,
    acceptServerCards,
    acceptServerCard
  };
}
