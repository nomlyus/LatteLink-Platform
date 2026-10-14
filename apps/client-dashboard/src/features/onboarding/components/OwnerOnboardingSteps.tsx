"use client";

import React, { useId, useRef, useState } from "react";
import styles from "./onboarding-v3.module.css";
import { canSubmitOwnerOnboarding, hasCompletedTeamStep } from "../owner-onboarding-state";
import type { OwnerOnboardingStep } from "../owner-onboarding-state";
import type { useOwnerOnboarding } from "../use-owner-onboarding";
import { OnboardingLocationDetails } from "./OnboardingLocationDetails";
import { OnboardingStepFooter } from "./OnboardingStepFooter";
import { OwnerProfileForm } from "./OwnerProfileForm";

export type OwnerOnboardingActions = Pick<ReturnType<typeof useOwnerOnboarding>, "locations" | "pending" | "saveProfile" | "saveLocation" | "connectStripe" | "refreshStripe" | "setTeamComplete" | "submit">;

export function OwnerOnboardingSteps({ state, step, canWrite, onNext, onClose }: {
  state: OwnerOnboardingActions;
  step: OwnerOnboardingStep;
  canWrite: boolean;
  onNext: (step: OwnerOnboardingStep) => void;
  onClose: () => void;
}) {
  const { locations, pending } = state;
  const [locationIndex, setLocationIndex] = useState(0);
  const currentLocation = locations[Math.min(locationIndex, locations.length - 1)];
  const formId = useId();
  const acting = useRef(false);
  const disabled = pending || !canWrite;
  const goBack = step > 0 || locationIndex > 0 ? () => {
    if (locationIndex > 0) setLocationIndex((index) => index - 1);
    else onNext(step === 4 ? 3 : step === 3 ? 2 : step === 2 ? 1 : 0);
  } : undefined;
  function continueLocation(nextStep: OwnerOnboardingStep) {
    if (locationIndex < locations.length - 1) setLocationIndex((index) => index + 1);
    else onNext(nextStep);
  }
  async function perform(operation: () => Promise<boolean>, onSuccess?: () => void) {
    if (disabled || acting.current) return;
    acting.current = true;
    try { if (await operation()) onSuccess?.(); }
    finally { acting.current = false; }
  }
  if (!currentLocation) return <p role="status">Loading your provisioned locations…</p>;
  const locationLabel = <p className={styles.locationIdentity} role="status" aria-live="polite" aria-atomic="true">{currentLocation.summary.ownerLocationDetails?.locationName ?? "Location"}<span className={styles.copy}>{locationIndex + 1} / {locations.length}</span></p>;
  if (step === 0) return <>
    <OwnerProfileForm formId={formId} initial={currentLocation.summary.ownerProfile} disabled={disabled} onSave={state.saveProfile} onContinue={() => onNext(1)} />
    <OnboardingStepFooter label={pending ? "Saving…" : "Continue"} disabled={disabled} formId={formId} />
  </>;
  if (step === 1) {
    return <>
      {locationLabel}
      <OnboardingLocationDetails key={currentLocation.summary.locationId} location={currentLocation} pending={pending} canWrite={canWrite} onSave={state.saveLocation} formId={formId} onContinue={() => continueLocation(2)} />
      <OnboardingStepFooter label={pending ? "Saving…" : "Continue"} disabled={disabled} onBack={goBack} formId={formId} />
    </>;
  }
  if (step === 2) {
    const ready = currentLocation.summary.paymentReadiness?.ready;
    return <>
      {locationLabel}
      <p className={styles.copy}>{ready ? "Payments are connected." : "Connect Stripe to accept payments and receive payouts."}</p>
      <OnboardingStepFooter label={pending ? "Connecting…" : ready ? "Continue" : "Connect Stripe"} disabled={disabled} onBack={goBack} onContinue={() => {
        if (ready) continueLocation(3);
        else void perform(() => state.connectStripe(currentLocation.summary.locationId));
      }} />
    </>;
  }
  if (step === 3) {
    const complete = hasCompletedTeamStep(currentLocation.summary);
    return <>
      {locationLabel}
      <p className={styles.copy}>You can invite your team after setup.</p>
      <OnboardingStepFooter label={pending ? "Saving…" : complete ? "Continue" : "Set up later"} disabled={disabled} onBack={goBack} onContinue={() => {
        if (complete) continueLocation(4);
        else void perform(() => state.setTeamComplete(currentLocation.summary.locationId, true), () => continueLocation(4));
      }} />
    </>;
  }
  return <>
    <p className={styles.copy}>Your setup is ready for Nomly.</p>
    <p>{locations[0].summary.ownerProfile?.customerFacingName}</p>
    <p>{locations.length} {locations.length === 1 ? "location" : "locations"} configured.</p>
    <p className={styles.copy}>Nomly prepares your app. Submission does not publish your app.</p>
    <OnboardingStepFooter label={pending ? "Submitting…" : "Submit to Nomly"} disabled={disabled || !canSubmitOwnerOnboarding(locations)} onBack={() => onNext(3)} onContinue={() => { void perform(state.submit, onClose); }} />
  </>;
}
