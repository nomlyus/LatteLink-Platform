"use client";

import React, { useEffect, useState, type ReactNode } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { useDashboardSession } from "../../auth/session-provider";
import { useDashboardLocation } from "../../location/location-provider";
import { AuthFrame } from "../../auth/components/AuthFrame";
import authStyles from "../../auth/components/auth-v3.module.css";
import { isOwnerOperator } from "../../../model";
import { useOwnerOnboarding } from "../use-owner-onboarding";
import { getOwnerOnboardingStep, type OwnerOnboardingStep } from "../owner-onboarding-state";
import { isOwnerOnboardingCompatibilityEntry } from "../owner-onboarding-access";
import { OnboardingWizard } from "./OnboardingWizard";

function RequiredOwnerSetup({ children }: { children: ReactNode }) {
  const location = useDashboardLocation();
  const onboarding = useOwnerOnboarding();
  const [step, setStep] = useState<OwnerOnboardingStep | null>(null);
  useEffect(() => { setStep(null); }, [onboarding.scope]);
  // Fail closed while resolving setup state; dashboard children never mount yet.
  if (location.status === "error" || onboarding.status === "error") return <AuthFrame>
    <p role="alert">{location.error ?? onboarding.error ?? "Unable to check your setup. Please try again."}</p>
    <button className={authStyles.action} onClick={() => {
      if (location.status === "error") void location.loadAvailableLocations();
      else void onboarding.reload(true);
    }}>Try again</button>
  </AuthFrame>;
  if (location.status !== "ready" || onboarding.status !== "ready") return <AuthFrame><p role="status">Loading your setup…</p></AuthFrame>;
  if (!onboarding.required) return children;
  return <AuthFrame><OnboardingWizard key={onboarding.scope} brandName={onboarding.locations[0].summary.brandName}
    canWrite={location.hasCapability("store:write")} state={onboarding}
    step={step ?? getOwnerOnboardingStep(onboarding.locations)} onStepChange={setStep}
    onClose={() => { /* Submission reloads the persisted completion marker before unlocking. */ }} />
  </AuthFrame>;
}

export function OwnerOnboardingGate({ children }: { children: ReactNode }) {
  const { status, session } = useDashboardSession();
  const pathname = usePathname();
  const search = useSearchParams().toString();
  if (status !== "authenticated" || !isOwnerOperator(session?.operator) ||
    isOwnerOnboardingCompatibilityEntry(pathname, search, process.env.NODE_ENV === "development")) return children;
  return <RequiredOwnerSetup>{children}</RequiredOwnerSetup>;
}
