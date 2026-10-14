"use client";
import React, { useId } from "react";
import type { useOnboarding } from "../../onboarding/use-onboarding";
import { OwnerProfileForm } from "../../onboarding/components/OwnerProfileForm";
import { OnboardingLocationDetails } from "../../onboarding/components/OnboardingLocationDetails";

export function OwnerBusinessDetails({ setup, canWrite, pending, onSaved }: {
  setup: ReturnType<typeof useOnboarding>; canWrite: boolean; pending: boolean; onSaved: () => void;
}) {
  const profileForm = useId();
  const locationForm = useId();
  if (!setup.summary || !setup.storeConfig) return null;
  return <div className="dash-owner-settings-panel">
    <section aria-label="Business details">
      <h3>Business details · All locations</h3>
      <OwnerProfileForm key={setup.scopeKey} formId={profileForm} initial={setup.summary.ownerProfile} disabled={pending || !canWrite} onSave={setup.saveOwnerProfile} onContinue={onSaved} />
      <button className="button button--secondary" form={profileForm} type="submit" disabled={pending || !canWrite}>Save business details</button>
    </section>
    <section aria-label="Location details">
      <h3>Location details · {setup.storeConfig.locationName}</h3>
      <OnboardingLocationDetails key={setup.scopeKey} formId={locationForm} location={{ summary: setup.summary, config: setup.storeConfig }} pending={pending} canWrite={canWrite && Boolean(setup.summary.ownerProfile)} onSave={(_, input) => setup.saveOwnerLocation(input)} onContinue={onSaved} />
      <button className="button button--secondary" form={locationForm} type="submit" disabled={pending || !canWrite || !setup.summary.ownerProfile}>Save location details</button>
    </section>
  </div>;
}
