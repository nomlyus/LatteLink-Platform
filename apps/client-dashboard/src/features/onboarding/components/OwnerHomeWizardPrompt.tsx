"use client";

import React, { useEffect, useState } from "react";
import { hasSeenOnboardingWizard, markOnboardingWizardSeen } from "../../../storage";
import { useDashboardSession } from "../../auth/session-provider";
import { useDashboardLocation } from "../../location/location-provider";
import { isOwnerOperator } from "../../../model";
import { isOnboardingIncomplete } from "../onboarding-domain";
import { useOnboarding } from "../use-onboarding";
import { OnboardingWizard } from "./OnboardingWizard";

export function OwnerHomeWizardPrompt() {
  const { status: sessionStatus, session } = useDashboardSession();
  const location = useDashboardLocation();
  const onboarding = useOnboarding();
  const [wizardOpen, setWizardOpen] = useState(false);
  const [wizardStep, setWizardStep] = useState<1 | 2 | 3 | 4 | 5>(1);
  const operatorUserId = session?.operator.operatorUserId;
  const locationId = location.selectedLocationId;

  useEffect(() => {
    if (
      sessionStatus !== "authenticated" || !session || !isOwnerOperator(session.operator) ||
      location.status !== "ready" || !locationId || locationId === "all" ||
      onboarding.status !== "ready" || !onboarding.summary ||
      !isOnboardingIncomplete(onboarding.summary.status) ||
      hasSeenOnboardingWizard(session.operator.operatorUserId, locationId)
    ) return;

    markOnboardingWizardSeen(session.operator.operatorUserId, locationId);
    setWizardStep(1);
    setWizardOpen(true);
  }, [location.status, locationId, onboarding.status, onboarding.summary, session, sessionStatus]);

  useEffect(() => {
    setWizardOpen(false);
  }, [onboarding.scopeKey]);

  if (!session || !operatorUserId || !onboarding.summary || onboarding.status !== "ready" || !wizardOpen) return null;

  return <OnboardingWizard
    key={onboarding.scopeKey}
    summary={onboarding.summary}
    storeConfig={onboarding.storeConfig}
    canWrite={location.hasCapability("store:write")}
    state={onboarding}
    step={wizardStep}
    onStepChange={setWizardStep}
    onClose={() => setWizardOpen(false)}
  />;
}
