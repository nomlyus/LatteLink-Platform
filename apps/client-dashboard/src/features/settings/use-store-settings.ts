"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { AdminStoreConfig } from "@lattelink/contracts-catalog";
import {
  fetchOperatorLocationStoreConfig,
  type OperatorSession
} from "../../api";
import { canAccessCapability } from "../../model";
import { isSessionAuthFailure } from "../auth/session-compat";
import { useDashboardSession } from "../auth/session-provider";
import { useDashboardLocation } from "../location/location-provider";
import {
  createStoreSettingsMutationGate,
  createStoreSettingsRequestLifecycle
} from "./store-settings-lifecycle";
import {
  getStoreSettingsScopeKey,
  normalizeStoreSettingsForm,
  type StoreSettingsFormInput
} from "./store-settings-domain";
import { updateOperatorStoreConfig } from "./store-settings-api";

type StoreSettingsState = {
  scopeKey: string;
  status: "loading" | "ready" | "error";
  config: AdminStoreConfig | null;
  loadError: string | null;
};

type StoreSettingsMutationState = {
  pending: boolean;
  error: string | null;
  notice: string | null;
};

type StoreSettingsContext = {
  session: OperatorSession | null;
  operatorUserId: string | null;
  locationId: string | "all" | null;
  locationStatus: "idle" | "loading" | "ready" | "error";
  locationError: string | null;
  authorizedLocationIds: ReadonlySet<string>;
  scopeKey: string;
  refreshSession: () => Promise<OperatorSession | null>;
  logout: () => Promise<void>;
};

const initialSettingsState: StoreSettingsState = {
  scopeKey: "",
  status: "loading",
  config: null,
  loadError: null
};

const initialMutationState: StoreSettingsMutationState = {
  pending: false,
  error: null,
  notice: null
};

export function useStoreSettings() {
  const sessionContext = useDashboardSession();
  const location = useDashboardLocation();
  const operatorUserId = sessionContext.session?.operator.operatorUserId ?? null;
  const capabilities = sessionContext.session?.operator.capabilities ?? [];
  const sessionIdentity = useRef({ status: sessionContext.status, operatorUserId, generation: 0 });
  if (sessionIdentity.current.status !== sessionContext.status || sessionIdentity.current.operatorUserId !== operatorUserId) {
    sessionIdentity.current = {
      status: sessionContext.status,
      operatorUserId,
      generation: sessionIdentity.current.generation + 1
    };
  }
  const scopeKey = getStoreSettingsScopeKey(operatorUserId, location.selectedLocationId, capabilities, sessionIdentity.current.generation);
  const contextRef = useRef<StoreSettingsContext>({
    session: sessionContext.session,
    operatorUserId,
    locationId: location.selectedLocationId,
    locationStatus: location.status,
    locationError: location.error,
    authorizedLocationIds: new Set(location.availableLocations.map(({ locationId }) => locationId)),
    scopeKey,
    refreshSession: sessionContext.refreshSession,
    logout: sessionContext.logout
  });
  const requests = useRef(createStoreSettingsRequestLifecycle());
  const mutationGate = useRef(createStoreSettingsMutationGate());
  const mounted = useRef(false);
  const [settingsState, setSettingsState] = useState(initialSettingsState);
  const [mutationState, setMutationState] = useState(initialMutationState);

  contextRef.current = {
    session: sessionContext.session,
    operatorUserId,
    locationId: location.selectedLocationId,
    locationStatus: location.status,
    locationError: location.error,
    authorizedLocationIds: new Set(location.availableLocations.map(({ locationId }) => locationId)),
    scopeKey,
    refreshSession: sessionContext.refreshSession,
    logout: sessionContext.logout
  };

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      requests.current.invalidate();
    };
  }, []);

  useEffect(() => {
    if (sessionContext.session) void location.loadAvailableLocations();
  }, [location.loadAvailableLocations, sessionContext.session]);

  useEffect(() => {
    setMutationState(initialMutationState);
  }, [scopeKey]);

  const reload = useCallback(async () => {
    if (!mounted.current) return false;
    const context = contextRef.current;
    const requestScope = context.scopeKey;
    const request = requests.current.begin();

    const setScopedState = (next: Omit<StoreSettingsState, "scopeKey">) => {
      if (mounted.current && requests.current.isCurrent(request)) {
        setSettingsState({ ...next, scopeKey: requestScope });
      }
    };

    if (!context.session || !canAccessCapability(context.session.operator, "store:read")) {
      setScopedState({ status: "error", config: null, loadError: "You don’t have permission to view store settings." });
      requests.current.finish(request);
      return false;
    }
    if (context.locationStatus === "error") {
      setScopedState({ status: "error", config: null, loadError: context.locationError ?? "Unable to load authorized locations." });
      requests.current.finish(request);
      return false;
    }
    if (context.locationStatus !== "ready") {
      setScopedState({ status: "loading", config: null, loadError: null });
      requests.current.finish(request);
      return false;
    }
    if (!context.locationId || context.locationId === "all") {
      setScopedState({ status: "ready", config: null, loadError: null });
      requests.current.finish(request);
      return true;
    }
    if (!context.authorizedLocationIds.has(context.locationId)) {
      setScopedState({ status: "error", config: null, loadError: "That location is no longer available for this operator session." });
      requests.current.finish(request);
      return false;
    }

    setScopedState({ status: "loading", config: null, loadError: null });
    try {
      const currentSession = await context.refreshSession();
      if (!currentSession || !requests.current.isCurrent(request)) return false;
      if (contextRef.current.scopeKey !== requestScope) return false;
      const config = await fetchOperatorLocationStoreConfig(currentSession, context.locationId, request.controller.signal);
      if (!requests.current.isCurrent(request)) return false;
      if (contextRef.current.scopeKey !== requestScope) return false;
      setScopedState({ status: "ready", config, loadError: null });
      return true;
    } catch (error) {
      if (!requests.current.isCurrent(request)) return false;
      if (isSessionAuthFailure(error)) void context.logout();
      if (contextRef.current.scopeKey === requestScope) {
        setScopedState({
          status: "error",
          config: null,
          loadError: error instanceof Error ? error.message : "Unable to load store settings."
        });
      }
      return false;
    } finally {
      requests.current.finish(request);
    }
  }, []);

  useEffect(() => {
    if (mutationGate.current.isActive()) return;
    void reload();
  }, [location.error, location.status, reload, scopeKey, sessionContext.status]);

  const save = useCallback(async (input: StoreSettingsFormInput) => {
    if (!mutationGate.current.begin()) return false;
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

    if (
      !initial.session ||
      !expectedLocation ||
      expectedLocation === "all" ||
      initial.locationStatus !== "ready" ||
      !initial.authorizedLocationIds.has(expectedLocation) ||
      !canAccessCapability(initial.session.operator, "store:write")
    ) {
      if (mounted.current) {
        setMutationState({ pending: false, error: "Choose one authorized location and make sure you have permission to update store settings.", notice: null });
      }
      mutationGate.current.release();
      return false;
    }

    if (mounted.current) setMutationState({ pending: true, error: null, notice: null });
    try {
      const currentSession = await initial.refreshSession();
      if (currentSession) acceptedAccessTokens.add(currentSession.accessToken);
      if (!currentSession || !stillInScope()) return false;
      if (!canAccessCapability(currentSession.operator, "store:write")) {
        throw new Error("Store settings are read-only for your current role.");
      }

      const normalized = normalizeStoreSettingsForm(input);
      const config = await updateOperatorStoreConfig(currentSession, expectedLocation, normalized);
      if (!stillInScope()) return false;
      setSettingsState({ scopeKey: expectedScope, status: "ready", config, loadError: null });
      setMutationState({ pending: false, error: null, notice: "Saved store settings." });
      return true;
    } catch (error) {
      if (isSessionAuthFailure(error)) void initial.logout();
      if (stillInScope()) {
        setMutationState({
          pending: false,
          error: error instanceof Error ? error.message : "Unable to save store settings.",
          notice: null
        });
      }
      return false;
    } finally {
      mutationGate.current.release();
      if (mounted.current && stillInScope()) {
        setMutationState((current) => ({ ...current, pending: false }));
      }
    }
  }, []);

  const currentSettings = settingsState.scopeKey === scopeKey
    ? settingsState
    : { ...initialSettingsState, scopeKey };
  const currentMutation = mutationState;

  return {
    ...currentSettings,
    ...currentMutation,
    scopeKey,
    reload,
    save
  };
}
