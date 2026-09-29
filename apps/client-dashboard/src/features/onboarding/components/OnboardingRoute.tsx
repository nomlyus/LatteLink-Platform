"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ClientDashboardRoot } from "../../../app/ClientDashboardRoot";
import { DashboardShell, DashboardShellLoading } from "../../../components/dashboard/DashboardShell";
import { hasSeenOnboardingWizard, markOnboardingWizardSeen } from "../../../storage";
import { readStripeReturnParams, stripStripeReturnParams } from "../../../lib/navigation/route-callbacks";
import { useDashboardSession } from "../../auth/session-provider";
import { useDashboardLocation } from "../../location/location-provider";
import { isOwnerOperator, isStoreOperator } from "../../../model";
import { completeLaunchIntent, isOnboardingIncomplete, readLaunchIntent, stripOnboardingEntryParams } from "../onboarding-domain";
import { OnboardingPage } from "./OnboardingPage";
import { useOnboarding } from "../use-onboarding";

type WizardStep = 1 | 2 | 3 | 4 | 5;

export function OnboardingRoute() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const search = searchParams.toString();
  const { status: sessionStatus, session } = useDashboardSession();
  const location = useDashboardLocation();
  const onboarding = useOnboarding();
  const { status: onboardingStatus, summary: onboardingSummary } = onboarding;
  const refreshStripeStatus = onboarding.refreshStripeStatus;
  const startStripeSetup = onboarding.startStripeSetup;
  const [wizardOpen, setWizardOpen] = useState(false);
  const [wizardStep, setWizardStep] = useState<WizardStep>(1);
  const [callbackNotice, setCallbackNotice] = useState<string | null>(null);
  const processedStripeCallback = useRef<string | null>(null);
  const processedLaunchIntent = useRef<string | null>(null);
  const locationId = location.selectedLocationId;
  const isOwner = isOwnerOperator(session?.operator);
  const canWrite = location.hasCapability("store:write");
  const canManagePayments = isOwner && canWrite;
  const stripeCallback = readStripeReturnParams(search);
  const hasGoogleCallback = new URLSearchParams(search).get("google_auth_callback") === "1";

  const closeWizard = useCallback(() => setWizardOpen(false), []);
  const openWizard = useCallback((step: WizardStep = 1) => {
    onboarding.clearMessages();
    setWizardStep(step);
    setWizardOpen(true);
  }, [onboarding.clearMessages]);
  const changeWizardStep = useCallback((step: WizardStep) => setWizardStep(step), []);

  useEffect(() => {
    setWizardOpen(false);
  }, [onboarding.scopeKey]);

  useEffect(() => {
    if (
      sessionStatus !== "authenticated" || !session || !isOwner ||
      location.status !== "ready" || !locationId || locationId === "all" ||
      (!stripeCallback.returned && !stripeCallback.refreshRequested)
    ) return;

    const key = `${session.operator.operatorUserId}:${locationId}:${search}`;
    if (processedStripeCallback.current === key) return;
    processedStripeCallback.current = key;
    setCallbackNotice(stripeCallback.refreshRequested
      ? "Stripe requested a refreshed onboarding link."
      : "Returned from Stripe. Payment readiness will refresh from the latest account status.");
    const cleanUrl = stripStripeReturnParams(window.location.pathname, window.location.search, window.location.hash);
    router.replace(cleanUrl, { scroll: false });

    if (stripeCallback.refreshRequested) {
      void startStripeSetup();
    } else {
      void refreshStripeStatus();
    }
  }, [isOwner, location.status, locationId, refreshStripeStatus, router, search, session, sessionStatus, startStripeSetup, stripeCallback.refreshRequested, stripeCallback.returned]);

  useEffect(() => {
    if (
      sessionStatus !== "authenticated" || !session || !isOwner ||
      location.status !== "ready" || !locationId || locationId === "all" ||
      stripeCallback.returned || stripeCallback.refreshRequested ||
      !readLaunchIntent(search) || onboardingStatus === "loading"
    ) return;

    const key = `${session.operator.operatorUserId}:${locationId}:${search}`;
    if (processedLaunchIntent.current === key) return;
    processedLaunchIntent.current = key;

    if (onboardingStatus === "ready" && onboardingSummary && isOnboardingIncomplete(onboardingSummary.status)) {
      markOnboardingWizardSeen(session.operator.operatorUserId, locationId);
      openWizard(1);
      router.replace(stripOnboardingEntryParams(window.location.pathname, window.location.search, window.location.hash), { scroll: false });
    } else if (onboardingStatus === "ready" && onboardingSummary) {
      router.replace(completeLaunchIntent(window.location.search, window.location.hash), { scroll: false });
    } else if (onboardingStatus === "scope-required" || onboardingStatus === "not-found") {
      router.replace(stripOnboardingEntryParams(window.location.pathname, window.location.search, window.location.hash), { scroll: false });
    }
  }, [isOwner, location.status, locationId, onboardingStatus, onboardingSummary, openWizard, router, search, session, sessionStatus, stripeCallback.refreshRequested, stripeCallback.returned]);

  useEffect(() => {
    if (
      sessionStatus !== "authenticated" || !session || !isOwner ||
      location.status !== "ready" || !locationId || locationId === "all" ||
      readLaunchIntent(search) || stripeCallback.returned || stripeCallback.refreshRequested ||
      onboardingStatus !== "ready" || !onboardingSummary || !isOnboardingIncomplete(onboardingSummary.status)
    ) return;
    if (hasSeenOnboardingWizard(session.operator.operatorUserId, locationId)) return;
    markOnboardingWizardSeen(session.operator.operatorUserId, locationId);
    openWizard(1);
  }, [isOwner, location.status, locationId, onboardingStatus, onboardingSummary, openWizard, search, session, sessionStatus, stripeCallback.refreshRequested, stripeCallback.returned]);

  if (sessionStatus === "loading") return <DashboardShellLoading />;
  if (sessionStatus === "signed-out" || hasGoogleCallback) return <ClientDashboardRoot />;
  if (!session) return <DashboardShellLoading />;
  if (isStoreOperator(session.operator)) return <StoreOperatorRedirect />;
  if (!isOwner) {
    return <DashboardShell><section className="dash-section dash-section--onboarding"><div className="dash-section-heading"><div><span className="dash-panel-title">Launch setup</span><h1 className="dash-section-title">Owner access required</h1><p>Only an owner can review branded-app launch readiness.</p></div></div></section></DashboardShell>;
  }

  return <DashboardShell activeSection="store" locationSelectionDisabled={onboarding.isMutating}>
    <OnboardingPage
      state={onboarding}
      callbackNotice={callbackNotice}
      selectedLocationName={location.selectedLocation?.locationName ?? null}
      selectedLocationId={locationId}
      canWrite={canWrite}
      canManagePayments={canManagePayments}
      wizardOpen={wizardOpen}
      wizardStep={wizardStep}
      onOpenWizard={openWizard}
      onCloseWizard={closeWizard}
      onWizardStepChange={changeWizardStep}
    />
  </DashboardShell>;
}

function StoreOperatorRedirect() {
  const router = useRouter();
  useEffect(() => { router.replace(`/orders${window.location.search}${window.location.hash}`); }, [router]);
  return <DashboardShellLoading />;
}
