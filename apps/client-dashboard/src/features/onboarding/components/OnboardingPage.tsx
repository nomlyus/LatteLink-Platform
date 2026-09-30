"use client";

import React from "react";
import type { useOnboarding } from "../use-onboarding";
import { OnboardingSummary } from "./OnboardingSummary";
import { OnboardingWizard } from "./OnboardingWizard";

type OnboardingState = ReturnType<typeof useOnboarding>;

export function OnboardingPage({
  state,
  callbackNotice,
  selectedLocationName,
  selectedLocationId,
  canWrite,
  canManagePayments,
  wizardOpen,
  wizardStep,
  onOpenWizard,
  onCloseWizard,
  onWizardStepChange
}: {
  state: OnboardingState;
  callbackNotice: string | null;
  selectedLocationName: string | null;
  selectedLocationId: string | "all" | null;
  canWrite: boolean;
  canManagePayments: boolean;
  wizardOpen: boolean;
  wizardStep: 1 | 2 | 3 | 4 | 5;
  onOpenWizard: (step?: 1 | 2 | 3 | 4 | 5) => void;
  onCloseWizard: () => void;
  onWizardStepChange: (step: 1 | 2 | 3 | 4 | 5) => void;
}) {
  return <>
    {state.mutationError ? <div className="banner banner--error" role="alert">{state.mutationError}<button className="button button--ghost" type="button" onClick={state.clearMessages}>Dismiss</button></div> : null}
    {state.notice ? <div className="banner banner--notice" role="status">{state.notice}</div> : null}
    {callbackNotice ? <div className="banner banner--notice" role="status">{callbackNotice}</div> : null}
    {state.status === "loading" ? <OnboardingLoading locationName={selectedLocationName} /> : null}
    {state.status === "scope-required" ? <OnboardingStateMessage title="Choose one location">Launch readiness is managed one location at a time. Select a specific location from the workspace selector.</OnboardingStateMessage> : null}
    {state.status === "error" ? <OnboardingStateMessage title="Unable to load launch setup" error>{state.error ?? "Launch setup could not be loaded."}<button className="button button--secondary" type="button" onClick={() => { void state.reload(); }}>Try again</button></OnboardingStateMessage> : null}
    {state.status === "not-found" ? <OnboardingStateMessage title="No launch setup found">There is no onboarding record for this location. Contact your Nomly launch contact if this seems unexpected.</OnboardingStateMessage> : null}
    {state.status === "ready" && state.summary ? <OnboardingSummary
      summary={state.summary}
      appConfig={state.appConfig}
      buildJobs={state.buildJobs}
      buildJobsError={state.buildJobsError}
      appConfigError={state.appConfigError}
      canWrite={canWrite}
      canManagePayments={canManagePayments}
      pending={state.isMutating}
      onOpenWizard={onOpenWizard}
      onSubmitReview={() => { void state.submitForReview(); }}
      onStartStripe={() => { void state.startStripeSetup(); }}
      onRefresh={() => { void state.reload(); }}
    /> : null}
    {wizardOpen && state.status === "ready" && state.summary ? <OnboardingWizard
      key={state.scopeKey}
      summary={state.summary}
      storeConfig={state.storeConfig}
      canWrite={canWrite}
      state={state}
      step={wizardStep}
      onStepChange={onWizardStepChange}
      onClose={onCloseWizard}
    /> : null}
    {selectedLocationId === "all" ? <p className="sr-only">All locations is read-only for launch setup.</p> : null}
  </>;
}

function OnboardingLoading({ locationName }: { locationName: string | null }) {
  return <section className="dash-section dash-section--onboarding" aria-label="Launch setup" aria-busy="true"><div className="dash-section-heading"><div><span className="dash-panel-title">Launch setup</span><h1 className="dash-section-title">Loading setup</h1><p>Loading the latest readiness for {locationName ?? "this location"}.</p></div></div><article className="dash-surface onboarding-summary-card"><div className="dash-skeleton dash-skeleton--text dash-skeleton--text-long" /><div className="dash-skeleton dash-skeleton--text dash-skeleton--text-medium" /></article></section>;
}

function OnboardingStateMessage({ title, children, error = false }: { title: string; children: React.ReactNode; error?: boolean }) {
  return <section className="dash-section dash-section--onboarding" aria-label="Launch setup"><div className="dash-section-heading"><div><span className="dash-panel-title">Launch setup</span><h1 className="dash-section-title">{title}</h1></div></div><article className="dash-surface dash-empty-surface" role={error ? "alert" : "status"}><div className="muted-copy">{children}</div></article></section>;
}
