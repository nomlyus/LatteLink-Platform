"use client";

import React, { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { DashboardShellLoading } from "../../../components/dashboard/DashboardShell";
import { SignInRoute } from "../../auth/components/SignInRoute";
import { useDashboardSession } from "../../auth/session-provider";
import { useDashboardLocation } from "../../location/location-provider";
import { readStripeReturnParams } from "../../../lib/navigation/route-callbacks";
import { isOwnerOperator } from "../../../model";
import { useOnboarding } from "../use-onboarding";
import { resolveOnboardingCompatibilityDestination } from "../onboarding-domain";
import { requiresFirstTimeOwnerSetup } from "../owner-setup-domain";

// Compatibility entry for existing invite/Stripe links, never a second setup UI.
export function OnboardingRoute() {
  const router = useRouter();
  const search = useSearchParams().toString();
  const { status, session } = useDashboardSession();
  const location = useDashboardLocation();
  const fallbackLocationId = location.availableLocations[0]?.locationId;
  const setup = useOnboarding({ fallbackLocationId });
  const operation = useRef<{ key: string; promise: Promise<boolean> } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const stripe = readStripeReturnParams(search);
  const callbackLocationId = new URLSearchParams(search).get("locationId");
  const operatorId = session?.operator.operatorUserId;
  const owner = isOwnerOperator(session?.operator);

  useEffect(() => {
    if (status !== "authenticated" || !operatorId || new URLSearchParams(search).get("google_auth_callback") === "1") return;
    if (!owner) { router.replace("/orders"); return; }
    if (location.status !== "ready" || setup.status === "loading") return;
    if ((stripe.returned || stripe.refreshRequested) && callbackLocationId) {
      if (!location.availableLocations.some((entry) => entry.locationId === callbackLocationId)) {
        setError("The Stripe return location is not authorized for this session.");
        return;
      }
      if (location.selectedLocationId !== callbackLocationId) {
        location.selectLocation(callbackLocationId);
        return;
      }
    }
    if ((stripe.returned || stripe.refreshRequested) && (!location.selectedLocationId || location.selectedLocationId === "all") && fallbackLocationId) {
      location.selectLocation(fallbackLocationId);
      return;
    }
    const key = `${setup.scopeKey}:${search}:${attempt}`;
    let disposed = false;
    if (operation.current?.key !== key) {
      operation.current = { key, promise: stripe.refreshRequested ? setup.startStripeSetup() : stripe.returned ? setup.refreshStripeStatus() : Promise.resolve(true) };
    }
    const promise = operation.current.promise;
    async function proceed() {
      if (stripe.returned || stripe.refreshRequested) {
        const succeeded = await promise;
        if (disposed) return;
        if (!succeeded) { setError("Payment status could not be refreshed. Your saved configuration is unchanged."); return; }
        if (stripe.refreshRequested) return;
      }
      if (disposed) return;
      router.replace(resolveOnboardingCompatibilityDestination(search, window.location.hash, Boolean(setup.summary && requiresFirstTimeOwnerSetup(setup.summary))), { scroll: false });
    }
    void proceed();
    return () => { disposed = true; };
  }, [status, operatorId, owner, location.status, location.selectedLocationId, location.selectLocation, location.availableLocations, callbackLocationId, fallbackLocationId, setup.scopeKey, setup.status, setup.summary, setup.startStripeSetup, setup.refreshStripeStatus, stripe.returned, stripe.refreshRequested, search, router, attempt]);

  if (status === "signed-out" || new URLSearchParams(search).get("google_auth_callback") === "1") return <SignInRoute />;
  if (error) return <section role="alert" className="dash-section"><p>{error}</p><button className="button button--secondary" onClick={() => { setError(null); setAttempt((value) => value + 1); }}>Try again</button></section>;
  return <DashboardShellLoading />;
}
