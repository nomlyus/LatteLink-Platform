"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { OperatorSession } from "../../api";
import type { OperatorNewsCard } from "../../model";
import { canAccessCapability } from "../../model";
import { isSessionAuthFailure } from "../auth/session-compat";
import { useDashboardSession } from "../auth/session-provider";
import { useDashboardLocation } from "../location/location-provider";
import { replaceOperatorNewsCards, updateOperatorNewsCardVisibility } from "./cards-api";
import { createCardsMutationGate } from "./cards-lifecycle";
import { buildNewsCard, createNewsCardId, moveNewsCard, type NewsCardDraft } from "./cards-domain";

type MutationContext = {
  session: OperatorSession | null;
  operatorUserId: string | null;
  locationId: string | "all" | null;
  scopeKey: string;
};

type CardsAccessors = {
  cards: OperatorNewsCard[] | null;
  reload: () => Promise<boolean>;
  acceptServerCards: (cards: OperatorNewsCard[], expectedScope: string) => boolean;
  acceptServerCard: (card: OperatorNewsCard, expectedScope: string) => boolean;
};

export function useCardMutations(accessors: CardsAccessors, scopeKey: string) {
  const { session, refreshSession, logout } = useDashboardSession();
  const location = useDashboardLocation();
  const [pendingOperation, setPendingOperation] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const gate = useRef(createCardsMutationGate());
  const mounted = useRef(false);
  const cardsRef = useRef(accessors.cards);
  cardsRef.current = accessors.cards;

  const contextRef = useRef<MutationContext>({
    session,
    operatorUserId: session?.operator.operatorUserId ?? null,
    locationId: location.selectedLocationId,
    scopeKey
  });
  contextRef.current = {
    session,
    operatorUserId: session?.operator.operatorUserId ?? null,
    locationId: location.selectedLocationId,
    scopeKey
  };

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);
  useEffect(() => {
    setError(null);
    setNotice(null);
  }, [scopeKey]);

  const run = useCallback(async <TResult,>(args: {
    label: string;
    success: string;
    fallback: string;
    capability: "menu:write" | "menu:visibility";
    operation: (currentSession: OperatorSession, locationId: string) => Promise<TResult>;
    accept: (result: TResult, expectedScope: string) => boolean;
  }) => {
    if (!gate.current.begin()) return false;
    const initial = contextRef.current;
    const capturedScope = initial.scopeKey;
    const capturedOperator = initial.operatorUserId;
    const capturedLocation = initial.locationId;
    const stillInScope = () => mounted.current && contextRef.current.scopeKey === capturedScope
      && contextRef.current.operatorUserId === capturedOperator
      && contextRef.current.locationId === capturedLocation;

    if (!initial.session || !capturedLocation || capturedLocation === "all") {
      if (mounted.current) setError("Choose one location before changing its cards.");
      gate.current.release();
      return false;
    }
    if (!canAccessCapability(initial.session.operator, args.capability)) {
      if (mounted.current) setError("This card action is read only for your current permissions.");
      gate.current.release();
      return false;
    }

    if (mounted.current) {
      setPendingOperation(args.label);
      setError(null);
      setNotice(null);
    }
    try {
      const currentSession = await refreshSession();
      if (!currentSession || !stillInScope()) return false;
      if (!canAccessCapability(currentSession.operator, args.capability)) {
        throw new Error("This card action is no longer available for your operator session.");
      }
      const result = await args.operation(currentSession, capturedLocation);
      if (!stillInScope()) return false;
      if (!args.accept(result, capturedScope)) throw new Error("The selected card changed. Reload the list and try again.");
      if (mounted.current) setNotice(args.success);
      return true;
    } catch (mutationError) {
      if (isSessionAuthFailure(mutationError)) void logout();
      if (stillInScope()) {
        await accessors.reload();
        if (stillInScope() && mounted.current) {
          setError(mutationError instanceof Error ? mutationError.message : args.fallback);
        }
      }
      return false;
    } finally {
      gate.current.release();
      if (mounted.current) setPendingOperation(null);
    }
  }, [accessors, logout, refreshSession]);

  const createCard = useCallback((draft: NewsCardDraft) => {
    const card = buildNewsCard(draft, createNewsCardId(draft.title));
    return run({
      label: "Creating card…",
      success: "Card created.",
      fallback: "Unable to create card.",
      capability: "menu:write",
      operation: (currentSession, locationId) => {
        const currentCards = cardsRef.current;
        if (!currentCards) throw new Error("Cards are still loading. Try again shortly.");
        return replaceOperatorNewsCards(currentSession, locationId, [...currentCards, card]);
      },
      accept: (response, expectedScope) => accessors.acceptServerCards(response.cards, expectedScope)
    });
  }, [accessors, run]);

  const saveCard = useCallback((cardId: string, draft: NewsCardDraft) => {
    const updated = buildNewsCard(draft, cardId);
    return run({
      label: "Saving card…",
      success: "Card saved.",
      fallback: "Unable to save card.",
      capability: "menu:write",
      operation: (currentSession, locationId) => {
        const currentCards = cardsRef.current;
        if (!currentCards?.some((card) => card.cardId === cardId)) throw new Error("This card is no longer available.");
        const nextCards = currentCards.map((card) => card.cardId === cardId ? updated : card);
        return replaceOperatorNewsCards(currentSession, locationId, nextCards);
      },
      accept: (response, expectedScope) => accessors.acceptServerCards(response.cards, expectedScope)
    });
  }, [accessors, run]);

  const setCardVisibility = useCallback((cardId: string, visible: boolean) => run({
    label: visible ? "Showing card…" : "Hiding card…",
    success: visible ? "Card is visible in the app." : "Card was hidden from the app.",
    fallback: "Unable to change card visibility.",
    capability: "menu:visibility",
    operation: (currentSession, locationId) => updateOperatorNewsCardVisibility(currentSession, locationId, cardId, visible),
    accept: (card, expectedScope) => accessors.acceptServerCard(card, expectedScope)
  }), [accessors, run]);

  const deleteCard = useCallback((cardId: string) => run({
    label: "Removing card…",
    success: "Card removed.",
    fallback: "Unable to remove card.",
    capability: "menu:write",
    operation: (currentSession, locationId) => {
      const currentCards = cardsRef.current;
      if (!currentCards?.some((card) => card.cardId === cardId)) throw new Error("This card is no longer available.");
      return replaceOperatorNewsCards(currentSession, locationId, currentCards.filter((card) => card.cardId !== cardId));
    },
    accept: (response, expectedScope) => accessors.acceptServerCards(response.cards, expectedScope)
  }), [accessors, run]);

  const reorderCards = useCallback((cardId: string, direction: "up" | "down") => run({
    label: "Saving card order…",
    success: "Card order saved.",
    fallback: "Unable to save card order.",
    capability: "menu:write",
    operation: (currentSession, locationId) => {
      const currentCards = cardsRef.current;
      if (!currentCards) throw new Error("Cards are still loading. Try again shortly.");
      return replaceOperatorNewsCards(currentSession, locationId, moveNewsCard(currentCards, cardId, direction));
    },
    accept: (response, expectedScope) => accessors.acceptServerCards(response.cards, expectedScope)
  }), [accessors, run]);

  return {
    pendingOperation,
    isMutating: pendingOperation !== null,
    error,
    notice,
    clearMessages: () => { setError(null); setNotice(null); },
    createCard,
    saveCard,
    setCardVisibility,
    deleteCard,
    reorderCards
  };
}
