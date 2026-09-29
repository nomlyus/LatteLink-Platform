"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { OperatorSession } from "../../api";
import { canAccessCapability, type OperatorDiscountCode } from "../../model";
import { isSessionAuthFailure } from "../auth/session-compat";
import { useDashboardSession } from "../auth/session-provider";
import { useDashboardLocation } from "../location/location-provider";
import { createOperatorDiscountCode, updateOperatorDiscountCode } from "./discounts-api";
import type { CreateDiscountCodeInput, UpdateDiscountCodeInput } from "./discounts-domain";
import { createDiscountMutationGate } from "./discounts-lifecycle";

type DiscountMutationContext = {
  session: OperatorSession | null;
  locationId: string | "all" | null;
  operatorUserId: string | null;
  scopeKey: string;
  refreshSession: () => Promise<OperatorSession | null>;
  logout: () => Promise<void>;
};

type DiscountMutationAccessors = {
  scopeKey: string;
  acceptServerDiscountCode: (discountCode: OperatorDiscountCode, expectedScope: string) => boolean;
};

export function useDiscountMutations(accessors: DiscountMutationAccessors) {
  const { session, refreshSession, logout } = useDashboardSession();
  const location = useDashboardLocation();
  const scopeKey = accessors.scopeKey;
  const gate = useRef(createDiscountMutationGate());
  const mounted = useRef(false);
  const contextRef = useRef<DiscountMutationContext>({
    session,
    locationId: location.selectedLocationId,
    operatorUserId: session?.operator.operatorUserId ?? null,
    scopeKey,
    refreshSession,
    logout
  });
  const [pendingOperation, setPendingOperation] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  contextRef.current = {
    session,
    locationId: location.selectedLocationId,
    operatorUserId: session?.operator.operatorUserId ?? null,
    scopeKey,
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
  }, [scopeKey]);

  const runMutation = useCallback(async (params: {
    label: string;
    successMessage: string;
    fallbackMessage: string;
    operation: (currentSession: OperatorSession, locationId: string) => Promise<OperatorDiscountCode>;
  }) => {
    if (!gate.current.begin()) return false;
    const initial = contextRef.current;
    const capturedScope = initial.scopeKey;
    const capturedOperatorId = initial.operatorUserId;
    const capturedLocationId = initial.locationId;
    const canWrite = (currentSession: OperatorSession | null) => canAccessCapability(currentSession?.operator, "menu:write");
    const stillInScope = () => mounted.current
      && contextRef.current.scopeKey === capturedScope
      && contextRef.current.operatorUserId === capturedOperatorId
      && contextRef.current.locationId === capturedLocationId;

    if (!initial.session || !capturedLocationId || capturedLocationId === "all") {
      if (mounted.current) setError("Choose one location before managing discount codes.");
      gate.current.release();
      return false;
    }
    if (!canWrite(initial.session)) {
      if (mounted.current) setError("Discount-code changes are read only for your current permissions.");
      gate.current.release();
      return false;
    }

    if (mounted.current) {
      setPendingOperation(params.label);
      setError(null);
      setNotice(null);
    }
    try {
      const currentSession = await initial.refreshSession();
      if (!currentSession || !stillInScope()) return false;
      if (!canWrite(currentSession)) throw new Error("Discount-code changes are no longer available for this operator session.");

      const discountCode = await params.operation(currentSession, capturedLocationId);
      if (!stillInScope()) return false;
      if (!accessors.acceptServerDiscountCode(discountCode, capturedScope)) {
        throw new Error("The selected location changed. Reload discount codes and try again.");
      }
      if (mounted.current) setNotice(params.successMessage);
      return true;
    } catch (mutationError) {
      if (isSessionAuthFailure(mutationError)) void initial.logout();
      if (stillInScope() && mounted.current) {
        setError(mutationError instanceof Error ? mutationError.message : params.fallbackMessage);
      }
      return false;
    } finally {
      gate.current.release();
      if (mounted.current) setPendingOperation(null);
    }
  }, [accessors]);

  const createDiscountCode = useCallback((input: CreateDiscountCodeInput) => runMutation({
    label: "Creating discount code…",
    successMessage: "Discount code created.",
    fallbackMessage: "Unable to create discount code.",
    operation: (currentSession, locationId) => createOperatorDiscountCode(currentSession, locationId, input)
  }), [runMutation]);

  const updateDiscountCode = useCallback((discountCodeId: string, input: UpdateDiscountCodeInput) => runMutation({
    label: "Saving discount code…",
    successMessage: "Discount code saved.",
    fallbackMessage: "Unable to save discount code.",
    operation: (currentSession, locationId) => updateOperatorDiscountCode(currentSession, locationId, discountCodeId, input)
  }), [runMutation]);

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
    createDiscountCode,
    updateDiscountCode
  };
}
