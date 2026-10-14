import React from "react";
import { AppReleaseProgress } from "./AppReleaseProgress";
import type { useOnboarding } from "../../onboarding/use-onboarding";
import type { OwnerSettingsTab } from "../owner-settings-tabs";
import { AppProfileForm } from "./AppProfileForm";
import { matchesDashboardSearch } from "../../../components/dashboard/search-text";

type SetupState = ReturnType<typeof useOnboarding>;

export function OwnerSetupPanel({ tab, setup, query, canWrite, pending }: { tab: OwnerSettingsTab; setup: SetupState; query: string; canWrite: boolean; pending: boolean }) {
  if (setup.status === "loading") return <div role="status" aria-busy="true">Loading location setup…</div>;
  if (!setup.summary || setup.status !== "ready") return <div role="alert"><p>{setup.error ?? "Launch setup is unavailable for this location."}</p><button className="button button--secondary" type="button" onClick={() => { void setup.reload(); }}>Try again</button></div>;
  const { summary } = setup;
  if (tab === "app") return <AppProfileForm key={setup.scopeKey} summary={summary} query={query} pending={pending} canWrite={canWrite} onSave={setup.saveAppIdentity} />;
  if (tab === "payments") {
    const readiness = summary.paymentReadiness;
    const connected = summary.checklist.some((check) => check.id === "payments_connected" && check.passed);
    const dashboardAvailable = setup.appConfig?.paymentCapabilities.stripe?.dashboardEnabled === true;
    const hasAccount = dashboardAvailable || Boolean(readiness?.onboardingState && readiness.onboardingState !== "unconfigured");
    if (!matchesDashboardSearch(query, ["Payments Stripe Connect Refresh status Open Stripe Express", readiness?.onboardingState, readiness?.ready ? "Ready" : "Needs attention", ...(readiness?.missingRequiredFields ?? [])])) return <div role="status">No payment settings match this search.</div>;
    return <div className="dash-owner-settings-panel">
      <h3>Payments</h3><p className="muted-copy">{connected ? "Stripe is connected for this location." : "Connect your location’s Stripe account to accept payments."}</p>
      {setup.appConfigError ? <p role="alert">Payment configuration could not be loaded. {setup.appConfigError}</p> : null}
      {readiness ? <><p>Status: {readiness.onboardingState} · {readiness.ready ? "Ready" : "Needs attention"}</p>{readiness.missingRequiredFields.length ? <p className="muted-copy">Missing: {readiness.missingRequiredFields.join(", ")}</p> : null}</> : null}
      <div className="dash-owner-settings-actions">
        <button className="button button--secondary" type="button" disabled={!canWrite || pending || connected} onClick={() => { void setup.startStripeSetup(); }}>{connected ? "Stripe connected" : hasAccount ? "Continue Stripe setup" : "Connect Stripe"}</button>
        <button className="button button--secondary" type="button" disabled={!canWrite || pending || !hasAccount} onClick={() => { void setup.refreshStripeStatus(); }}>Refresh status</button>
        <button className="button button--secondary" type="button" disabled={pending || !dashboardAvailable} onClick={() => { void setup.openStripeDashboard(); }}>Open Stripe Express</button>
      </div>
    </div>;
  }
  const checks = summary.checklist.filter((check) => matchesDashboardSearch(query, [check.label, check.detail, check.passed ? "Complete" : "Needs attention"]));
  if (query.trim() && checks.length === 0) return <div role="status">No readiness checks match this search.</div>;
  return <div className="dash-owner-settings-panel">
    <h3>Launch readiness</h3>
    <p className="muted-copy">Brand onboarding {summary.ownerSetupCompletedAt ? "is complete" : "and app launch are separate"}. Missing release requirements never reopen first-time setup.</p>
    <ul className="dash-owner-settings-checklist">{checks.map((check) => <li key={check.id}><span>{check.label}{!check.passed && check.detail ? <small className="muted-copy"> · {check.detail}</small> : null}</span><span>{check.passed ? "Complete" : "Needs attention"}</span></li>)}</ul>
    {summary.blockedReason ? <p className="muted-copy">{summary.blockedReason}</p> : null}
    <div className="dash-owner-settings-actions"><button className="button button--secondary" type="button" disabled={!canWrite || pending || !summary.readyForReview || summary.status === "ready_for_review" || summary.status === "approved" || summary.status === "live"} onClick={() => { void setup.submitForReview(); }}>Submit app for Nomly review</button></div>
    <AppReleaseProgress setup={setup} />
  </div>;
}
