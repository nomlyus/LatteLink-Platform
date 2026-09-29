"use client";

import React, { useEffect, useId, useRef, type FormEvent } from "react";
import type { AdminStoreConfig } from "@lattelink/contracts-catalog";
import type { OperatorOnboardingSummary } from "../onboarding-api";
import { buildAppIdentityUpdate, clientSetupSteps, getRemainingOnboardingSteps } from "../onboarding-domain";
import type { useOnboarding } from "../use-onboarding";

type OnboardingState = ReturnType<typeof useOnboarding>;
const focusableSelector = "button:not([disabled]), input:not([disabled]):not([type=hidden]), select:not([disabled]), textarea:not([disabled]), a[href]";

export function OnboardingWizard({
  summary,
  storeConfig,
  canWrite,
  state,
  step,
  onStepChange,
  onClose
}: {
  summary: OperatorOnboardingSummary;
  storeConfig: AdminStoreConfig | null;
  canWrite: boolean;
  state: OnboardingState;
  step: 1 | 2 | 3 | 4 | 5;
  onStepChange: (step: 1 | 2 | 3 | 4 | 5) => void;
  onClose: () => void;
}) {
  const pending = state.isMutating;
  const titleId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  const pendingRef = useRef(pending);
  closeRef.current = onClose;
  pendingRef.current = pending;
  const steps = ["Start", "Details", "Payments", "App", "Finish"];

  useEffect(() => {
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const dialog = dialogRef.current;
    const first = dialog?.querySelector<HTMLElement>(focusableSelector);
    (first ?? dialog)?.focus({ preventScroll: true });
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !pendingRef.current) {
        event.preventDefault();
        closeRef.current();
        return;
      }
      if (event.key !== "Tab" || !dialog) return;
      const controls = [...dialog.querySelectorAll<HTMLElement>(focusableSelector)];
      if (!controls.length) {
        event.preventDefault();
        dialog.focus({ preventScroll: true });
      } else if (event.shiftKey && document.activeElement === controls[0]) {
        event.preventDefault();
        controls.at(-1)?.focus();
      } else if (!event.shiftKey && document.activeElement === controls.at(-1)) {
        event.preventDefault();
        controls[0]?.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      opener?.focus({ preventScroll: true });
    };
  }, []);

  function handleStoreSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    void state.saveStoreDetails({
      storeName: String(form.get("storeName") ?? ""),
      locationName: String(form.get("locationName") ?? ""),
      hours: String(form.get("hours") ?? ""),
      pickupInstructions: String(form.get("pickupInstructions") ?? "")
    }).then((saved) => { if (saved) onStepChange(3); });
  }

  function handleAppIdentitySubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void state.saveAppIdentity(buildAppIdentityUpdate(new FormData(event.currentTarget))).then((saved) => {
      // The legacy button said “Save and continue” but left users on the same step.
      if (saved) onStepChange(5);
    });
  }

  return (
    <div className="dash-modal" role="presentation">
      <button className="dash-modal__backdrop" type="button" onClick={() => { if (!pending) onClose(); }} aria-label="Close setup wizard" disabled={pending} />
      <div ref={dialogRef} className="dash-modal__dialog dash-modal__dialog--onboarding" role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1} aria-busy={pending || undefined}>
        <div className="dash-modal__header">
          <div><div className="dash-panel-title">Setup wizard</div><h2 className="dash-surface-title" id={titleId}>{summary.brandName} launch setup</h2></div>
          <button className="button button--ghost" type="button" onClick={onClose} disabled={pending}>Close</button>
        </div>
        <WizardSteps current={step} labels={steps} />
        {state.mutationError ? <div className="banner banner--error" role="alert">{state.mutationError}<button className="button button--ghost" type="button" onClick={state.clearMessages}>Dismiss</button></div> : null}
        {state.notice ? <div className="banner banner--notice" role="status">{state.notice}</div> : null}
        {step === 1 ? <WelcomeStep onClose={onClose} onContinue={() => onStepChange(2)} /> : null}
        {step === 2 ? <StoreDetailsStep config={storeConfig} canWrite={canWrite} pending={pending} loadError={state.storeConfigError} onRetry={() => { void state.reload(); }} onBack={() => onStepChange(1)} onSubmit={handleStoreSubmit} /> : null}
        {step === 3 ? <PaymentsStep summary={summary} appConfigError={state.appConfigError} canWrite={canWrite} pending={pending} state={state} onBack={() => onStepChange(2)} onContinue={() => onStepChange(4)} /> : null}
        {step === 4 ? <AppIdentityStep summary={summary} canWrite={canWrite} pending={pending} onBack={() => onStepChange(3)} onSubmit={handleAppIdentitySubmit} /> : null}
        {step === 5 ? <FinishStep summary={summary} pending={pending} onBack={() => onStepChange(4)} onClose={onClose} onSubmit={state.submitForReview} /> : null}
      </div>
    </div>
  );
}

function WizardSteps({ current, labels }: { current: number; labels: string[] }) {
  return <div className="dash-wizard-steps" aria-label="Setup progress" role="list">
    {labels.map((label, index) => <div className={`dash-wizard-step${current === index + 1 ? " dash-wizard-step--active" : current > index + 1 ? " dash-wizard-step--complete" : ""}`} key={label} role="listitem" aria-current={current === index + 1 ? "step" : undefined}><span>{index + 1}</span><strong>{label}</strong></div>)}
  </div>;
}

function WelcomeStep({ onClose, onContinue }: { onClose: () => void; onContinue: () => void }) {
  return <>
    <div className="dash-wizard-body dash-wizard-body--stacked onboarding-wizard-panel"><div><div className="dash-panel-title">Launch setup</div><h3 className="dash-surface-title">We only need the essentials first.</h3><p className="muted-copy">Confirm store details, connect Stripe, then Nomly will review the launch and manage the mobile release.</p></div><SetupPills /></div>
    <div className="dash-wizard-actions"><button className="button button--ghost" type="button" onClick={onClose}>Close</button><button className="button button--primary" type="button" onClick={onContinue}>Continue</button></div>
  </>;
}

function SetupPills({ summary }: { summary?: OperatorOnboardingSummary }) {
  return <div className="onboarding-pill-row">{clientSetupSteps.map((step) => {
    const passed = summary?.checklist.find((entry) => entry.id === step.id)?.passed === true;
    return <span className={`onboarding-pill${passed ? " onboarding-pill--complete" : ""}`} key={step.id}>{step.shortLabel}</span>;
  })}</div>;
}

function StoreDetailsStep({ config, canWrite, pending, loadError, onRetry, onBack, onSubmit }: {
  config: AdminStoreConfig | null;
  canWrite: boolean;
  pending: boolean;
  loadError: string | null;
  onRetry: () => void;
  onBack: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  if (!config) return <>
    <div className="dash-wizard-body"><article className="dash-empty-surface"><p className="muted-copy">{loadError ?? "Store configuration is loading."}</p>{loadError ? <button className="button button--secondary" type="button" onClick={onRetry}>Try again</button> : null}</article></div>
    <div className="dash-wizard-actions"><button className="button button--secondary" type="button" onClick={onBack}>Back</button></div>
  </>;
  return <form className="dash-wizard-form" onSubmit={onSubmit}>
    <div className="dash-wizard-body dash-wizard-body--stacked">
      {!canWrite ? <p className="muted-copy">Your current session can view setup but does not have store-write permission.</p> : null}
      <label className="field"><span>Store name</span><input name="storeName" defaultValue={config.storeName} required disabled={!canWrite || pending} /></label>
      <label className="field"><span>Location name</span><input name="locationName" defaultValue={config.locationName} required disabled={!canWrite || pending} /></label>
      <label className="field"><span>Hours</span><input name="hours" defaultValue={config.hours} required disabled={!canWrite || pending} /></label>
      <label className="field"><span>Pickup instructions</span><textarea name="pickupInstructions" rows={4} defaultValue={config.pickupInstructions} required disabled={!canWrite || pending} /></label>
    </div>
    <div className="dash-wizard-actions"><button className="button button--secondary" type="button" onClick={onBack} disabled={pending}>Back</button><button className="button button--primary" type="submit" disabled={!canWrite || pending}>{pending ? "Saving…" : "Save and continue"}</button></div>
  </form>;
}

function PaymentsStep({ summary, appConfigError, canWrite, pending, state, onBack, onContinue }: {
  summary: OperatorOnboardingSummary;
  appConfigError: string | null;
  canWrite: boolean;
  pending: boolean;
  state: OnboardingState;
  onBack: () => void;
  onContinue: () => void;
}) {
  const readiness = summary.paymentReadiness;
  const dashboardAvailable = state.appConfig?.paymentCapabilities.stripe?.dashboardEnabled === true;
  const hasStripeAccount = dashboardAvailable || Boolean(readiness?.onboardingState && readiness.onboardingState !== "unconfigured");
  const paymentsComplete = summary.checklist.some((item) => item.id === "payments_connected" && item.passed);
  const paymentCopy = paymentsComplete ? "Stripe is connected for this location." : readiness?.onboardingState && readiness.onboardingState !== "unconfigured" ? "Stripe needs a little more information before launch." : "Connect a Stripe account for this location.";
  const connectLabel = paymentsComplete ? "Stripe connected" : hasStripeAccount ? "Continue Stripe setup" : "Connect Stripe";
  return <>
    <div className="dash-wizard-body dash-wizard-body--stacked onboarding-wizard-panel">
      <div><div className="dash-panel-title">Payments</div><h3 className="dash-surface-title">{paymentsComplete ? "Payments connected" : "Connect Stripe"}</h3><p className="muted-copy">{paymentCopy}</p></div>
      {appConfigError ? <p className="banner banner--notice" role="status">Payment configuration is unavailable. {appConfigError}</p> : null}
      {readiness ? <div className="onboarding-payment-status"><div><span>Status</span><strong>{readiness.onboardingState}</strong></div><div><span>Readiness</span><strong>{readiness.ready ? "Ready" : "Needs attention"}</strong></div>{readiness.missingRequiredFields.length ? <p className="muted-copy">Missing: {readiness.missingRequiredFields.join(", ")}.</p> : null}</div> : null}
      <div className="onboarding-payment-actions">
        <button className="button button--primary" type="button" onClick={() => { void state.startStripeSetup(); }} disabled={!canWrite || pending || paymentsComplete}>{connectLabel}</button>
        <button className="button button--secondary" type="button" onClick={() => { void state.refreshStripeStatus(); }} disabled={!canWrite || pending || !hasStripeAccount}>Refresh status</button>
        <button className="button button--secondary" type="button" onClick={() => { void state.openStripeDashboard(); }} disabled={pending || !dashboardAvailable}>Open Stripe Express</button>
      </div>
    </div>
    <div className="dash-wizard-actions"><button className="button button--secondary" type="button" onClick={onBack} disabled={pending}>Back</button><button className="button button--primary" type="button" onClick={onContinue} disabled={pending}>Continue</button></div>
  </>;
}

function AppIdentityStep({ summary, canWrite, pending, onBack, onSubmit }: {
  summary: OperatorOnboardingSummary;
  canWrite: boolean;
  pending: boolean;
  onBack: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  const identity = summary.appIdentity;
  const fallbackName = identity?.appName ?? summary.brandName;
  return <form className="dash-wizard-form" onSubmit={onSubmit}>
    <div className="dash-wizard-body dash-wizard-body--stacked">
      <div><div className="dash-panel-title">App profile</div><h3 className="dash-surface-title">Customer-facing app details</h3><p className="muted-copy">These details are used for the app record, App Store submission, and launch review.</p></div>
      {!canWrite ? <p className="muted-copy">Your current session can view setup but does not have store-write permission.</p> : null}
      <label className="field"><span>App name</span><input name="appName" maxLength={30} defaultValue={identity?.appName ?? fallbackName} required disabled={!canWrite || pending} /></label>
      <label className="field"><span>Home screen name</span><input name="displayName" maxLength={30} defaultValue={identity?.displayName ?? fallbackName} required disabled={!canWrite || pending} /></label>
      <label className="field"><span>Bundle identifier</span><input name="bundleIdentifier" defaultValue={identity?.bundleIdentifier ?? ""} placeholder="us.nomly.brand" required disabled={!canWrite || pending} /></label>
      <label className="field"><span>SKU</span><input name="sku" defaultValue={identity?.sku ?? ""} required disabled={!canWrite || pending} /></label>
      <label className="field"><span>App Store subtitle</span><input name="subtitle" maxLength={30} defaultValue={identity?.subtitle ?? ""} required disabled={!canWrite || pending} /></label>
      <label className="field"><span>App Store description</span><textarea name="description" rows={4} defaultValue={identity?.description ?? ""} required disabled={!canWrite || pending} /></label>
      <label className="field"><span>Keywords</span><input name="keywords" defaultValue={identity?.keywords.join(", ") ?? ""} placeholder="coffee, pickup, rewards" disabled={!canWrite || pending} /></label>
      <label className="field"><span>Support URL</span><input name="supportUrl" type="url" defaultValue={identity?.supportUrl ?? ""} required disabled={!canWrite || pending} /></label>
      <label className="field"><span>Privacy policy URL</span><input name="privacyPolicyUrl" type="url" defaultValue={identity?.privacyPolicyUrl ?? ""} required disabled={!canWrite || pending} /></label>
      <label className="field"><span>Marketing URL</span><input name="marketingUrl" type="url" defaultValue={identity?.marketingUrl ?? ""} disabled={!canWrite || pending} /></label>
      <label className="field"><span>Asset mode</span><select name="assetMode" defaultValue={identity?.assetMode ?? "placeholder"} disabled={!canWrite || pending}><option value="placeholder">Use Nomly placeholder assets</option><option value="provided">Use provided brand assets</option></select></label>
      <label className="field"><span>Icon asset URL</span><input name="iconAssetUrl" type="url" defaultValue={identity?.iconAssetUrl ?? ""} disabled={!canWrite || pending} /></label>
      <label className="field"><span>Splash asset URL</span><input name="splashAssetUrl" type="url" defaultValue={identity?.splashAssetUrl ?? ""} disabled={!canWrite || pending} /></label>
      <label className="field"><span>Screenshot URLs</span><textarea name="screenshotAssetUrls" rows={3} defaultValue={identity?.screenshotAssetUrls.join("\n") ?? ""} disabled={!canWrite || pending} /></label>
    </div>
    <div className="dash-wizard-actions"><button className="button button--secondary" type="button" onClick={onBack} disabled={pending}>Back</button><button className="button button--primary" type="submit" disabled={!canWrite || pending}>{pending ? "Saving…" : "Save and continue"}</button></div>
  </form>;
}

function FinishStep({ summary, pending, onBack, onClose, onSubmit }: {
  summary: OperatorOnboardingSummary;
  pending: boolean;
  onBack: () => void;
  onClose: () => void;
  onSubmit: () => Promise<boolean>;
}) {
  const remaining = getRemainingOnboardingSteps(summary);
  const submitted = summary.status === "ready_for_review" || Boolean(summary.submittedForReviewAt);
  const canSubmit = summary.readyForReview && !submitted && summary.status !== "approved" && summary.status !== "live";
  return <>
    <div className="dash-wizard-body dash-wizard-body--stacked onboarding-wizard-panel"><div><div className="dash-panel-title">Finish</div><h3 className="dash-surface-title">{submitted ? "Submitted for review" : remaining.length === 0 ? "Ready for Nomly review" : "Setup is saved"}</h3><p className="muted-copy">{remaining.length === 0 ? "Nomly will review the launch details, prepare the app build, and update release progress here." : `Still left: ${remaining.map((item) => item.label).join(", ")}.`}</p></div><SetupPills summary={summary} /></div>
    <div className="dash-wizard-actions"><button className="button button--secondary" type="button" onClick={onBack} disabled={pending}>Back</button><div className="dash-wizard-actions__group">{canSubmit ? <button className="button button--primary" type="button" disabled={pending} onClick={() => { void onSubmit(); }}>Submit to Nomly</button> : null}<button className="button button--primary" type="button" onClick={onClose} disabled={pending}>Done</button></div></div>
  </>;
}
