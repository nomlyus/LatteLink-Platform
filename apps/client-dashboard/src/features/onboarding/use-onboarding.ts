"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { AdminStoreConfig } from "@lattelink/contracts-catalog";
import { ApiRequestError, fetchOperatorLocationStoreConfig, type OperatorSession } from "../../api";
import { canAccessCapability, isOwnerOperator } from "../../model";
import { isSessionAuthFailure } from "../auth/session-compat";
import { useDashboardSession } from "../auth/session-provider";
import { useDashboardLocation } from "../location/location-provider";
import { updateOperatorStoreConfig } from "../settings/store-settings-api";
import type { StoreSettingsFormInput } from "../settings/store-settings-domain";
import {
  createOnboardingMutationGate,
  createOnboardingRequestLifecycle
} from "./onboarding-lifecycle";
import {
  createOperatorStripeDashboardLink,
  createOperatorStripeOnboardingLink,
  fetchOperatorOnboardingAppConfig,
  fetchOperatorOnboardingBuildJobs,
  fetchOperatorOnboardingSummary,
  refreshOperatorStripeStatus,
  submitOperatorOnboardingReview,
  updateOperatorAppIdentity,
  updateOperatorOnboarding,
  type OperatorOnboardingSummary,
  type OperatorAppIdentityUpdate,
  type OperatorOnboardingAppConfig,
  type OperatorOnboardingBuildJobs
} from "./onboarding-api";
import { getOnboardingScopeKey } from "./onboarding-domain";

type OnboardingLoadStatus = "loading" | "ready" | "not-found" | "error" | "scope-required";
type OnboardingAuxiliaryData = {
  appConfig: OperatorOnboardingAppConfig | null;
  storeConfig: AdminStoreConfig | null;
  buildJobs: OperatorOnboardingBuildJobs;
  appConfigError: string | null;
  storeConfigError: string | null;
  buildJobsError: string | null;
};
type OnboardingDataState = {
  scopeKey: string;
  status: OnboardingLoadStatus;
  summary: OperatorOnboardingSummary | null;
  error: string | null;
} & OnboardingAuxiliaryData;
type MutationState = { pendingOperation: string | null; error: string | null; notice: string | null };
type OnboardingContext = {
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

const emptyAuxiliaryData: OnboardingAuxiliaryData = {
  appConfig: null,
  storeConfig: null,
  buildJobs: { jobs: [] },
  appConfigError: null,
  storeConfigError: null,
  buildJobsError: null
};
const emptyDataState: OnboardingDataState = {
  scopeKey: "",
  status: "loading",
  summary: null,
  error: null,
  ...emptyAuxiliaryData
};
const emptyMutationState: MutationState = { pendingOperation: null, error: null, notice: null };

function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

function resultError(result: PromiseSettledResult<unknown>, fallback: string) {
  return result.status === "rejected" ? errorMessage(result.reason, fallback) : null;
}

export function useOnboarding() {
  const { status: sessionStatus, session, refreshSession, logout } = useDashboardSession();
  const location = useDashboardLocation();
  const operatorUserId = session?.operator.operatorUserId ?? null;
  const capabilities = session?.operator.capabilities ?? [];
  const sessionIdentity = useRef({ status: sessionStatus, operatorUserId, generation: 0 });
  if (sessionIdentity.current.status !== sessionStatus || sessionIdentity.current.operatorUserId !== operatorUserId) {
    sessionIdentity.current = { status: sessionStatus, operatorUserId, generation: sessionIdentity.current.generation + 1 };
  }
  const scopeKey = getOnboardingScopeKey(operatorUserId, location.selectedLocationId, capabilities, sessionIdentity.current.generation);
  const contextRef = useRef<OnboardingContext>({
    session,
    operatorUserId,
    locationId: location.selectedLocationId,
    locationStatus: location.status,
    locationError: location.error,
    authorizedLocationIds: new Set(location.availableLocations.map((entry) => entry.locationId)),
    scopeKey,
    refreshSession,
    logout
  });
  const requests = useRef(createOnboardingRequestLifecycle());
  const mutations = useRef(createOnboardingMutationGate());
  const mounted = useRef(false);
  const [dataState, setDataState] = useState<OnboardingDataState>(emptyDataState);
  const [mutationState, setMutationState] = useState<MutationState>(emptyMutationState);
  const dataRef = useRef(dataState);
  dataRef.current = dataState;

  contextRef.current = {
    session,
    operatorUserId,
    locationId: location.selectedLocationId,
    locationStatus: location.status,
    locationError: location.error,
    authorizedLocationIds: new Set(location.availableLocations.map((entry) => entry.locationId)),
    scopeKey,
    refreshSession,
    logout
  };

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

  useEffect(() => {
    setMutationState(emptyMutationState);
  }, [scopeKey]);

  const reload = useCallback(async () => {
    if (!mounted.current) return false;
    const context = contextRef.current;
    const expectedScope = context.scopeKey;
    const request = requests.current.begin();
    const setScopedState = (next: Omit<OnboardingDataState, "scopeKey">) => {
      if (mounted.current && requests.current.isCurrent(request)) {
        setDataState({ ...next, scopeKey: expectedScope });
      }
    };

    if (!context.session || !isOwnerOperator(context.session.operator)) {
      setScopedState({ ...emptyDataState, status: "error", error: "Only owners can review launch readiness." });
      requests.current.finish(request);
      return false;
    }
    if (!canAccessCapability(context.session.operator, "store:read")) {
      setScopedState({ ...emptyDataState, status: "error", error: "You don’t have permission to view launch readiness." });
      requests.current.finish(request);
      return false;
    }
    if (context.locationStatus === "error") {
      setScopedState({ ...emptyDataState, status: "error", error: context.locationError ?? "Unable to load authorized locations." });
      requests.current.finish(request);
      return false;
    }
    if (context.locationStatus !== "ready") {
      setScopedState({ ...emptyDataState, status: "loading", error: null });
      requests.current.finish(request);
      return false;
    }
    if (!context.locationId || context.locationId === "all") {
      setScopedState({ ...emptyDataState, status: "scope-required", error: null });
      requests.current.finish(request);
      return false;
    }
    if (!context.authorizedLocationIds.has(context.locationId)) {
      setScopedState({ ...emptyDataState, status: "error", error: "That location is no longer available for this operator session." });
      requests.current.finish(request);
      return false;
    }

    setScopedState({ ...emptyDataState, status: "loading", error: null });
    try {
      const currentSession = await context.refreshSession();
      if (!currentSession || !requests.current.isCurrent(request)) return false;
      if (contextRef.current.scopeKey !== expectedScope) return false;

      const canReadStore = canAccessCapability(currentSession.operator, "store:read");
      const [summaryResult, appConfigResult, storeConfigResult, buildJobsResult] = await Promise.allSettled([
        fetchOperatorOnboardingSummary(currentSession, context.locationId, request.controller.signal),
        fetchOperatorOnboardingAppConfig(currentSession, context.locationId, request.controller.signal),
        canReadStore
          ? fetchOperatorLocationStoreConfig(currentSession, context.locationId, request.controller.signal)
          : Promise.reject(new Error("Store details are not available to this operator.")),
        canReadStore
          ? fetchOperatorOnboardingBuildJobs(currentSession, context.locationId, request.controller.signal)
          : Promise.reject(new Error("Release activity is not available to this operator."))
      ]);
      if (!requests.current.isCurrent(request) || contextRef.current.scopeKey !== expectedScope) return false;

      const supportingResults = [appConfigResult, storeConfigResult, buildJobsResult];
      const authFailure = supportingResults.find((result) => result.status === "rejected" && isSessionAuthFailure(result.reason));
      if (authFailure?.status === "rejected") {
        await context.logout();
        return false;
      }

      if (summaryResult.status === "rejected") {
        if (summaryResult.reason instanceof ApiRequestError && summaryResult.reason.statusCode === 404) {
          setScopedState({ ...emptyDataState, status: "not-found", error: null });
          return false;
        }
        throw summaryResult.reason;
      }

      const currentContext = contextRef.current;
      if (
        currentContext.scopeKey !== expectedScope ||
        currentContext.locationId !== context.locationId ||
        !currentContext.authorizedLocationIds.has(context.locationId)
      ) return false;

      setScopedState({
        status: "ready",
        summary: summaryResult.value,
        error: null,
        appConfig: appConfigResult.status === "fulfilled" ? appConfigResult.value : null,
        storeConfig: storeConfigResult.status === "fulfilled" ? storeConfigResult.value : null,
        buildJobs: buildJobsResult.status === "fulfilled" ? buildJobsResult.value : { jobs: [] },
        appConfigError: resultError(appConfigResult, "Unable to load payment configuration."),
        storeConfigError: canReadStore ? resultError(storeConfigResult, "Unable to load store configuration.") : "Store details are not available to this operator.",
        buildJobsError: canReadStore ? resultError(buildJobsResult, "Unable to load release activity.") : "Release activity is not available to this operator."
      });
      return true;
    } catch (error) {
      if (!requests.current.isCurrent(request)) return false;
      if (isSessionAuthFailure(error)) void context.logout();
      if (contextRef.current.scopeKey === expectedScope) {
        setScopedState({ ...emptyDataState, status: "error", error: errorMessage(error, "Unable to load launch readiness.") });
      }
      return false;
    } finally {
      requests.current.finish(request);
    }
  }, []);

  useEffect(() => {
    if (!mounted.current || mutations.current.isActive()) return;
    void reload();
    return () => requests.current.invalidate();
  }, [location.error, location.status, reload, scopeKey, sessionStatus, session]);

  const runMutation = useCallback(async (args: {
    label: string;
    success: string;
    fallback: string;
    capability: "store:read" | "store:write";
    ownerOnly?: boolean;
    refreshData?: boolean;
    operation: (currentSession: OperatorSession, locationId: string) => Promise<unknown>;
    onSuccess?: (result: unknown) => void;
  }) => {
    if (!mutations.current.begin()) return false;
    const initial = contextRef.current;
    const expectedScope = initial.scopeKey;
    const expectedOperator = initial.operatorUserId;
    const expectedLocation = initial.locationId;
    const acceptedTokens = new Set(initial.session ? [initial.session.accessToken] : []);
    const stillInScope = () => mounted.current &&
      contextRef.current.scopeKey === expectedScope &&
      contextRef.current.operatorUserId === expectedOperator &&
      contextRef.current.locationId === expectedLocation &&
      Boolean(contextRef.current.session && acceptedTokens.has(contextRef.current.session.accessToken)) &&
      Boolean(expectedLocation && expectedLocation !== "all" && contextRef.current.authorizedLocationIds.has(expectedLocation));

    if (
      !initial.session ||
      !expectedLocation ||
      expectedLocation === "all" ||
      initial.locationStatus !== "ready" ||
      !initial.authorizedLocationIds.has(expectedLocation) ||
      (args.ownerOnly && !isOwnerOperator(initial.session.operator)) ||
      !canAccessCapability(initial.session.operator, args.capability)
    ) {
      if (mounted.current) setMutationState({ pendingOperation: null, error: "Choose one authorized location and verify your access before continuing.", notice: null });
      mutations.current.release();
      return false;
    }

    setMutationState({ pendingOperation: args.label, error: null, notice: null });
    try {
      const currentSession = await initial.refreshSession();
      if (currentSession) acceptedTokens.add(currentSession.accessToken);
      if (!currentSession || !stillInScope()) return false;
      if ((args.ownerOnly && !isOwnerOperator(currentSession.operator)) || !canAccessCapability(currentSession.operator, args.capability)) {
        throw new Error("This action is no longer available to your operator session.");
      }
      const result = await args.operation(currentSession, expectedLocation);
      if (!stillInScope()) return false;
      if (args.refreshData !== false) {
        const reloaded = await reload();
        if (!reloaded || !stillInScope()) return false;
      }
      args.onSuccess?.(result);
      if (stillInScope()) setMutationState({ pendingOperation: null, error: null, notice: args.success });
      return true;
    } catch (error) {
      if (isSessionAuthFailure(error)) void initial.logout();
      // Store details save and readiness update are separate existing API mutations.
      // Reload to show server truth if the first one succeeded and the second failed.
      if (stillInScope()) await reload();
      if (stillInScope()) setMutationState({ pendingOperation: null, error: errorMessage(error, args.fallback), notice: null });
      return false;
    } finally {
      mutations.current.release();
      if (mounted.current && stillInScope()) {
        setMutationState((current) => ({ ...current, pendingOperation: null }));
      }
    }
  }, [reload]);

  const saveStoreDetails = useCallback((input: StoreSettingsFormInput) => runMutation({
    label: "Saving store details…",
    success: "Saved store details.",
    fallback: "Unable to save store details.",
    capability: "store:write",
    operation: async (currentSession, locationId) => {
      const config = dataRef.current.storeConfig;
      if (!config) throw new Error("Store configuration is not ready yet.");
      await updateOperatorStoreConfig(currentSession, locationId, {
        storeName: input.storeName,
        locationName: input.locationName,
        hours: input.hours,
        pickupInstructions: input.pickupInstructions,
        taxRateBasisPoints: config.taxRateBasisPoints
      });
      if (contextRef.current.scopeKey !== scopeKey || contextRef.current.locationId !== locationId) {
        throw new Error("The selected location changed. Reload setup before continuing.");
      }
      return updateOperatorOnboarding(currentSession, locationId, {
        businessProfileComplete: true,
        storeOperationsComplete: true
      });
    }
  }), [runMutation, scopeKey]);

  const saveAppIdentity = useCallback((input: OperatorAppIdentityUpdate) => runMutation({
    label: "Saving app profile…",
    success: "Saved app profile.",
    fallback: "Unable to save app profile.",
    capability: "store:write",
    operation: (currentSession, locationId) => updateOperatorAppIdentity(currentSession, locationId, {
      ...input,
      targetLocationIds: [locationId]
    })
  }), [runMutation]);

  const submitForReview = useCallback(() => runMutation({
    label: "Submitting setup…",
    success: "Setup submitted to Nomly for review.",
    fallback: "Unable to submit setup for review.",
    capability: "store:write",
    operation: submitOperatorOnboardingReview
  }), [runMutation]);

  const startStripeSetup = useCallback(() => runMutation({
    label: "Opening Stripe setup…",
    success: "Opening Stripe setup.",
    fallback: "Unable to start Stripe onboarding.",
    capability: "store:write",
    ownerOnly: true,
    refreshData: false,
    operation: async (currentSession, locationId) => {
      const origin = window.location.origin;
      return createOperatorStripeOnboardingLink(currentSession, locationId, {
        returnUrl: `${origin}/onboarding?stripeReturn=1`,
        refreshUrl: `${origin}/onboarding?stripeRefresh=1`
      });
    },
    onSuccess: (result) => {
      if (result && typeof result === "object" && "url" in result && typeof result.url === "string") window.location.assign(result.url);
    }
  }), [runMutation]);

  const openStripeDashboard = useCallback(() => runMutation({
    label: "Opening Stripe Express…",
    success: "Opening Stripe Express.",
    fallback: "Unable to open Stripe Express.",
    capability: "store:read",
    ownerOnly: true,
    refreshData: false,
    operation: createOperatorStripeDashboardLink,
    onSuccess: (result) => {
      if (result && typeof result === "object" && "url" in result && typeof result.url === "string") window.location.assign(result.url);
    }
  }), [runMutation]);

  const refreshStripeStatus = useCallback(() => runMutation({
    label: "Refreshing Stripe status…",
    success: "Stripe status refreshed.",
    fallback: "Unable to refresh Stripe status.",
    capability: "store:write",
    ownerOnly: true,
    operation: refreshOperatorStripeStatus
  }), [runMutation]);

  const clearMessages = useCallback(() => setMutationState((current) => ({ ...current, error: null, notice: null })), []);
  const currentData = dataState.scopeKey === scopeKey ? dataState : { ...emptyDataState, scopeKey };

  return {
    ...currentData,
    scopeKey,
    pendingOperation: mutationState.pendingOperation,
    isMutating: mutationState.pendingOperation !== null,
    mutationError: mutationState.error,
    notice: mutationState.notice,
    reload,
    clearMessages,
    saveStoreDetails,
    saveAppIdentity,
    submitForReview,
    startStripeSetup,
    openStripeDashboard,
    refreshStripeStatus
  };
}
