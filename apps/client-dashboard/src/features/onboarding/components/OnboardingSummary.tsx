"use client";

import React from "react";
import Link from "next/link";
import type { OperatorOnboardingAppConfig, OperatorOnboardingBuildJobs, OperatorOnboardingSummary } from "../onboarding-api";
import {
  clientSetupSteps,
  getMobileReleaseStatusLabel,
  getOnboardingPrimaryAction,
  getOnboardingSummaryCopy,
  getRemainingOnboardingSteps,
  isOnboardingIncomplete,
  shouldShowMobileRelease
} from "../onboarding-domain";

export function OnboardingSummary({
  summary,
  appConfig,
  buildJobs,
  buildJobsError,
  appConfigError,
  canWrite,
  canManagePayments,
  pending,
  onOpenWizard,
  onSubmitReview,
  onStartStripe,
  onRefresh
}: {
  summary: OperatorOnboardingSummary;
  appConfig: OperatorOnboardingAppConfig | null;
  buildJobs: OperatorOnboardingBuildJobs;
  buildJobsError: string | null;
  appConfigError: string | null;
  canWrite: boolean;
  canManagePayments: boolean;
  pending: boolean;
  onOpenWizard: (step?: 1 | 2 | 3 | 4 | 5) => void;
  onSubmitReview: () => void;
  onStartStripe: () => void;
  onRefresh: () => void;
}) {
  const incomplete = isOnboardingIncomplete(summary.status);
  const submitted = summary.status === "ready_for_review" || Boolean(summary.submittedForReviewAt);
  const remaining = getRemainingOnboardingSteps(summary);
  const action = getOnboardingPrimaryAction(summary);
  const stripeDashboardEnabled = appConfig?.paymentCapabilities.stripe?.dashboardEnabled === true;

  return (
    <section className="dash-section dash-section--onboarding" aria-label="Launch setup">
      {incomplete ? (
        <>
          <div className="dash-section-heading">
            <div><span className="dash-panel-title">Launch setup</span><h1 className="dash-section-title">{getOnboardingSummaryCopy(summary).title}</h1><p>{getOnboardingSummaryCopy(summary).description}</p></div>
            <button className="button button--secondary" type="button" onClick={() => onOpenWizard(1)}>Open setup</button>
          </div>
          <article className="dash-surface onboarding-summary-card">
            <div className="onboarding-summary-card__main">
              <SetupStepPills summary={summary} />
              {remaining.length > 0 && !submitted ? (
                <ul className="onboarding-short-list">{remaining.map((step) => <li key={step.id}>{step.label}</li>)}</ul>
              ) : <p className="muted-copy">Nomly handles App Store setup, build submission, launch approval, and release updates from here.</p>}
            </div>
            <div className="onboarding-summary-card__actions">
              {action ? <PrimarySetupAction action={action} canWrite={canWrite} pending={pending} onOpenWizard={onOpenWizard} onSubmitReview={onSubmitReview} onStartStripe={onStartStripe} /> : null}
            </div>
          </article>
        </>
      ) : (
        <div className="dash-section-heading">
          <div><span className="dash-panel-title">Launch setup</span><h1 className="dash-section-title">{summary.status === "live" ? "App is live" : summary.status === "approved" ? "Launch approved" : "Setup is complete"}</h1><p>Nomly manages release updates from here.</p></div>
        </div>
      )}

      {shouldShowMobileRelease(summary) ? <MobileReleaseCard summary={summary} /> : null}
      {buildJobsError ? <div className="banner banner--notice" role="status">Release activity is temporarily unavailable. {buildJobsError}<button className="button button--ghost" type="button" onClick={onRefresh}>Retry</button></div> : <BuildJobsCard buildJobs={buildJobs} />}
      {appConfigError ? <div className="banner banner--notice" role="status">Payment connection controls may be incomplete until configuration reloads. {appConfigError}<button className="button button--ghost" type="button" onClick={onRefresh}>Retry</button></div> : null}
      <IntegrationsCard />
      {summary.blockedReason ? <div className="banner banner--notice" role="status">Launch review note: {summary.blockedReason}</div> : null}
      {stripeDashboardEnabled && canManagePayments ? <p className="muted-copy onboarding-payment-footer">Stripe payment readiness is reported by the connected account.</p> : null}
    </section>
  );
}

function SetupStepPills({ summary }: { summary: OperatorOnboardingSummary }) {
  return <div className="onboarding-pill-row" aria-label="Setup checklist">
    {clientSetupSteps.map((step) => {
      const passed = summary.checklist.find((item) => item.id === step.id)?.passed === true;
      return <span className={`onboarding-pill${passed ? " onboarding-pill--complete" : ""}`} key={step.id}>{step.shortLabel}</span>;
    })}
  </div>;
}

function PrimarySetupAction({ action, canWrite, pending, onOpenWizard, onSubmitReview, onStartStripe }: {
  action: NonNullable<ReturnType<typeof getOnboardingPrimaryAction>>;
  canWrite: boolean;
  pending: boolean;
  onOpenWizard: (step?: 1 | 2 | 3 | 4 | 5) => void;
  onSubmitReview: () => void;
  onStartStripe: () => void;
}) {
  if (action.kind === "submit-review") return <button className="button button--primary" type="button" disabled={!canWrite || pending} onClick={onSubmitReview}>Submit to Nomly</button>;
  if (action.kind === "open-wizard") return <button className="button button--primary" type="button" onClick={() => onOpenWizard(action.step)}>{action.step === 2 ? "Review store details" : "Complete app profile"}</button>;
  if (action.kind === "stripe") return <button className="button button--primary" type="button" disabled={!canWrite || pending} onClick={onStartStripe}>Connect Stripe</button>;
  return <Link className="button button--primary" href={action.href}>{action.href === "/menu" ? "Review menu" : action.href === "/team" ? "Review team" : "Run test order"}</Link>;
}

function MobileReleaseCard({ summary }: { summary: OperatorOnboardingSummary }) {
  const release = summary.mobileRelease;
  const status = summary.status === "live" ? "live" : release?.status ?? "not_started";
  const updatedAt = release?.updatedAt ? new Date(release.updatedAt).toLocaleString() : null;
  return (
    <article className="dash-surface onboarding-status-card">
      <div><div className="dash-panel-title">Mobile release</div><h2 className="dash-surface-title">{getMobileReleaseStatusLabel(status, release?.statusLabel)}</h2><p className="muted-copy">{updatedAt ? `Updated ${updatedAt}.` : "Nomly updates this as the app moves through release."}</p></div>
      <div className="onboarding-status-card__meta">
        {release?.buildNumber ? <div><span>Build</span><strong>{release.buildNumber}</strong></div> : null}
        {release?.testFlightUrl ? <a className="button button--secondary" href={release.testFlightUrl} target="_blank" rel="noreferrer">TestFlight</a> : null}
        {release?.appStoreUrl ? <a className="button button--secondary" href={release.appStoreUrl} target="_blank" rel="noreferrer">App Store</a> : null}
        {release?.blockedReason ? <p className="muted-copy">Blocked: {release.blockedReason}</p> : null}
      </div>
    </article>
  );
}

function BuildJobsCard({ buildJobs }: { buildJobs: OperatorOnboardingBuildJobs }) {
  const jobs = buildJobs.jobs.slice(0, 3);
  if (jobs.length === 0) return null;
  const inProgress = jobs.some((job) => job.status === "running" || job.status === "queued");
  return (
    <article className="dash-surface onboarding-build-jobs-card">
      <div className="dash-surface-head"><div><div className="dash-panel-title">Release activity</div><h2 className="dash-surface-title">Build progress</h2></div><span className="dash-status-badge dash-status-badge--neutral">{inProgress ? "In progress" : "Recent"}</span></div>
      <div className="onboarding-build-jobs-list">
        {jobs.map((job) => <div key={job.jobId}>
          <div className="onboarding-build-job-row"><div><strong>{job.profile === "production" ? "Production" : "Beta"} build</strong><small>{job.status} · {job.sourceCommitSha.slice(0, 12)}</small></div><span className="dash-status-badge dash-status-badge--neutral">{job.status}</span></div>
          {job.errorMessage ? <p className="muted-copy onboarding-build-job-error">{job.errorMessage}</p> : null}
        </div>)}
      </div>
    </article>
  );
}

function IntegrationsCard() {
  return <article className="dash-surface onboarding-integrations-card"><div><div className="dash-panel-title">Integrations</div><h2 className="dash-surface-title">Optional connectors</h2><p className="muted-copy">Clover, Toast, and Square are optional and can be connected later when a location needs external sync.</p></div><span className="dash-status-badge dash-status-badge--neutral">Optional</span></article>;
}
