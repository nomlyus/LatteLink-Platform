"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { fetchOperatorLocationStoreConfig, type OperatorSession } from "../../api";
import { isOwnerOperator, canAccessCapability } from "../../model";
import { useDashboardSession } from "../auth/session-provider";
import { isSessionAuthFailure } from "../auth/session-compat";
import { useDashboardLocation } from "../location/location-provider";
import { updateOwnerName } from "./owner-input-api";
import type { OwnerProfileInput, OwnerLocationInput } from "./owner-input-domain";
import { fetchOperatorTeam } from "../team/team-api";
import { createOnboardingMutationGate, createOnboardingRequestLifecycle } from "./onboarding-lifecycle";
import { createOperatorStripeOnboardingLink, fetchOperatorOnboardingSummary, refreshOperatorStripeStatus, updateOperatorOnboarding } from "./onboarding-api";
import { requiresFirstTimeOwnerSetup } from "./owner-setup-domain";
import { type OwnerOnboardingLocation } from "./owner-onboarding-state";

type Data = { scope: string; status: "loading" | "ready" | "error"; locations: OwnerOnboardingLocation[]; error: string | null };
const initialData: Data = { scope: "", status: "loading", locations: [], error: null };
const message = (error: unknown) => error instanceof Error ? error.message : "Unable to update onboarding.";

// This brand-scoped lifecycle intentionally does not use the dashboard selected
// location as a write target. Each operation names one authorized provisioned row.
export function useOwnerOnboarding() {
  const auth = useDashboardSession();
  const location = useDashboardLocation();
  const ids = location.availableLocations.map((entry) => entry.locationId).sort();
  const identity = `${auth.status}:${auth.session?.operator.operatorUserId ?? ""}:${auth.session?.apiBaseUrl ?? ""}`;
  const epoch = useRef({ identity, generation: 0 });
  if (epoch.current.identity !== identity) epoch.current = { identity, generation: epoch.current.generation + 1 };
  const scope = `${identity}:${epoch.current.generation}:${ids.join(",")}:${auth.session?.operator.capabilities.join(",") ?? ""}`;
  const context = useRef({ auth, location, ids, scope });
  context.current = { auth, location, ids, scope };
  const mounted = useRef(false);
  const requests = useRef(createOnboardingRequestLifecycle());
  const mutations = useRef(createOnboardingMutationGate());
  const [data, setData] = useState<Data>(initialData);
  const dataRef = useRef(data);
  dataRef.current = data;
  const [mutation, setMutation] = useState({ scope: "", pending: false, error: null as string | null });

  const reload = useCallback(async (preserve = false) => {
    const current = context.current;
    if (!mounted.current || current.auth.status !== "authenticated" || !isOwnerOperator(current.auth.session?.operator) || current.location.status !== "ready") return false;
    const request = requests.current.begin();
    const valid = () => mounted.current && requests.current.isCurrent(request) && context.current.scope === current.scope;
    if (!preserve) setData({ ...initialData, scope: current.scope });
    try {
      const session = await current.auth.refreshSession();
      if (!session || !valid()) return false;
      if (!isOwnerOperator(session.operator) || !canAccessCapability(session.operator, "store:read")) throw new Error("Owner access is required to load brand onboarding.");
      if (!current.ids.length) throw new Error("No provisioned locations are available. Contact Nomly.");
      const anchorId = current.ids.includes(session.operator.locationId) ? session.operator.locationId : current.ids[0];
      const anchor = await fetchOperatorOnboardingSummary(session, anchorId, request.controller.signal);
      if (!valid()) return false;
      // Existing/completed brands do not need another configuration load just
      // to decide that no first-time modal should be shown.
      if (!requiresFirstTimeOwnerSetup(anchor)) {
        setData({ scope: current.scope, status: "ready", locations: [], error: null });
        return true;
      }
      const summaries = await Promise.all(current.ids.map((id) => id === anchorId ? anchor : fetchOperatorOnboardingSummary(session, id, request.controller.signal)));
      const brand = summaries.filter((summary) => summary.tenantId === anchor.tenantId && summary.brandId === anchor.brandId);
      const locations = await Promise.all(brand.map(async (summary) => ({ summary, config: await fetchOperatorLocationStoreConfig(session, summary.locationId, request.controller.signal) })));
      if (!valid()) return false;
      if (locations.some(({ summary, config }) => summary.locationId !== config.locationId)) throw new Error("Location configuration did not match the requested onboarding scope.");
      setData({ scope: current.scope, status: "ready", locations, error: null });
      return true;
    } catch (error) {
      if (!valid()) return false;
      if (isSessionAuthFailure(error)) void current.auth.logout();
      // Keep the mounted editor after a failed same-scope reload, but mark the
      // data unusable for writes until a successful retry reconciles it.
      setData({ scope: current.scope, status: "error", locations: preserve && dataRef.current.scope === current.scope ? dataRef.current.locations : [], error: message(error) });
      return false;
    } finally { requests.current.finish(request); }
  }, []);

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; requests.current.invalidate(); };
  }, []);
  useEffect(() => { if (auth.session && isOwnerOperator(auth.session.operator)) void location.loadAvailableLocations(); }, [auth.session, location.loadAvailableLocations]);
  useEffect(() => {
    if (!mutations.current.isActive()) void reload();
    return () => requests.current.invalidate();
  }, [scope, location.status, reload]);

  const mutate = useCallback(async (targetIds: string[], operation: (session: OperatorSession, assertCurrent: () => void) => Promise<unknown>, redirect?: (result: unknown) => void) => {
    if (!mutations.current.begin()) return false;
    const current = context.current;
    const valid = () => mounted.current && context.current.scope === current.scope;
    const rows = dataRef.current.scope === current.scope && dataRef.current.status === "ready" ? dataRef.current.locations : [];
    setMutation({ scope: current.scope, pending: true, error: null });
    try {
      if (current.location.status !== "ready" || !rows.length || targetIds.some((id) => !rows.some((row) => row.summary.locationId === id))) throw new Error("Reload the provisioned locations before continuing.");
      const session = await current.auth.refreshSession();
      if (!session || !valid()) return false;
      if (!isOwnerOperator(session.operator) || !canAccessCapability(session.operator, "store:write") || targetIds.some((id) => ![session.operator.locationId, ...(session.operator.locationIds ?? [])].includes(id))) throw new Error("Owner access to these locations is required.");
      const result = await operation(session, () => { if (!valid()) throw new Error("Your onboarding session changed. Reload before continuing."); });
      if (!valid()) return false;
      if (redirect) redirect(result);
      else if (!await reload(true) || !valid()) return false;
      return true;
    } catch (error) {
      if (isSessionAuthFailure(error)) void current.auth.logout();
      if (valid()) { await reload(true); if (valid()) setMutation({ scope: current.scope, pending: false, error: message(error) }); }
      return false;
    } finally {
      mutations.current.release();
      if (valid()) setMutation((previous) => ({ ...previous, pending: false }));
      else if (mounted.current) void reload();
    }
  }, [reload]);

  const saveProfile = useCallback((input: OwnerProfileInput) => {
    const ids = dataRef.current.locations.map((row) => row.summary.locationId);
    return mutate(ids, async (session, assertCurrent) => {
      // Identity owns the name; Catalog owns the confirmed onboarding profile.
      // Catalog confirmation is last, so a failed cross-service retry cannot
      // incorrectly mark the profile complete.
      const updatedOperator = await updateOwnerName(session, input.ownerName);
      assertCurrent();
      const result = await updateOperatorOnboarding(session, ids[0], { ownerProfile: input });
      assertCurrent();
      context.current.auth.establishSession({ ...session, operator: updatedOperator });
      return result;
    });
  }, [mutate]);
  const saveLocation = useCallback((locationId: string, input: OwnerLocationInput) => mutate([locationId], async (session) => {
    return updateOperatorOnboarding(session, locationId, { ownerLocationDetails: input });
  }), [mutate]);
  const setTeamComplete = useCallback((locationId: string, skipped: boolean) => mutate([locationId], async (session, assertCurrent) => {
    if (!skipped) {
      if (!canAccessCapability(session.operator, "team:read")) throw new Error("Team access is required to verify members.");
      const members = await fetchOperatorTeam(session, locationId);
      if (!members.some((member) => member.active && member.operatorUserId !== session.operator.operatorUserId)) throw new Error("Add a team member first, or choose Set up later.");
    }
    assertCurrent();
    return updateOperatorOnboarding(session, locationId, { teamConfiguredOrSkipped: true });
  }), [mutate]);
  const connectStripe = useCallback((locationId: string) => mutate([locationId], (session) => {
    const base = `${window.location.origin}/onboarding`;
    return createOperatorStripeOnboardingLink(session, locationId, {
      returnUrl: `${base}?stripeReturn=1&locationId=${encodeURIComponent(locationId)}`,
      refreshUrl: `${base}?stripeRefresh=1&locationId=${encodeURIComponent(locationId)}`
    });
  }, (result) => {
    if (result && typeof result === "object" && "url" in result && typeof result.url === "string") window.location.assign(result.url);
    else throw new Error("Stripe did not return an onboarding link.");
  }), [mutate]);
  const refreshStripe = useCallback((locationId: string) => mutate([locationId], (session) => refreshOperatorStripeStatus(session, locationId)), [mutate]);
  const submit = useCallback(() => {
    const ids = dataRef.current.locations.map((row) => row.summary.locationId);
    return mutate(ids, async (session) => {
      const summary = await updateOperatorOnboarding(session, ids[0], { submitOwnerSetup: true, locationIds: ids });
      if (!summary.ownerSetupCompletedAt || !summary.submittedForReviewAt) throw new Error("Nomly submission could not be confirmed. Your saved details are safe; the server may need the onboarding update.");
      return summary;
    });
  }, [mutate]);
  const current = data.scope === scope ? data : { ...initialData, scope };
  return { ...current, required: current.locations.some((row) => requiresFirstTimeOwnerSetup(row.summary)),
    pending: mutation.scope === scope && mutation.pending, mutationError: mutation.scope === scope ? mutation.error : null,
    reload, saveProfile, saveLocation, setTeamComplete, connectStripe, refreshStripe, submit };
}
