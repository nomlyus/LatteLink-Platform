"use client";

import React, { useEffect, useId, useRef } from "react";
import type { OwnerOnboardingStep } from "../owner-onboarding-state";
import { OwnerOnboardingSteps, type OwnerOnboardingActions } from "./OwnerOnboardingSteps";
import styles from "./onboarding-v3.module.css";
import authStyles from "../../auth/components/auth-v3.module.css";

const focusableSelector = "button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href]";
export function OnboardingWizard({ brandName, canWrite, state, step, onStepChange, onClose, onRetry }: {
  brandName: string;
  canWrite: boolean;
  state: OwnerOnboardingActions & { mutationError: string | null };
  step: OwnerOnboardingStep;
  onStepChange: (step: OwnerOnboardingStep) => void;
  onClose: () => void;
  onRetry?: () => void;
}) {
  const titleId = useId();
  const stepLabels = ["Your business", "Locations", "Payments", "Team", "Review"];
  const dialogRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const dialog = dialogRef.current;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    dialog?.focus({ preventScroll: true });
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); return; }
      if (event.key !== "Tab" || !dialog) return;
      const controls = [...dialog.querySelectorAll<HTMLElement>(focusableSelector)];
      if (!controls.length) { event.preventDefault(); dialog.focus({ preventScroll: true }); }
      else if (event.shiftKey && (document.activeElement === controls[0] || document.activeElement === dialog)) { event.preventDefault(); controls.at(-1)?.focus(); }
      else if (!event.shiftKey && (document.activeElement === controls.at(-1) || document.activeElement === dialog)) { event.preventDefault(); controls[0]?.focus(); }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => { document.body.style.overflow = previousOverflow; document.removeEventListener("keydown", onKeyDown); opener?.focus({ preventScroll: true }); };
  }, []);
  useEffect(() => { dialogRef.current?.focus({ preventScroll: true }); }, [step]);

  return <div className={styles.overlay} role="presentation">
    <div className={styles.backdrop} aria-hidden="true" />
    <div ref={dialogRef} className={styles.dialog} role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1} aria-busy={state.pending || undefined}>
      <div className={styles.progress} role="progressbar" aria-label="Onboarding progress" aria-valuemin={0} aria-valuemax={5} aria-valuenow={step + 1} aria-valuetext={`Step ${step + 1} of 5: ${stepLabels[step]}`}><span className={styles.progressFill} style={{ width: `${(step + 1) * 20}%` }} /></div>
      <div className={styles.header}><div><h2 className={styles.heading} id={titleId}>{stepLabels[step]}</h2>{state.locations[0]?.summary.ownerProfile ? <p className={styles.brand}>{brandName}</p> : null}</div></div>
      <div className={styles.body}>
        {state.mutationError ? <p className={authStyles.error} role="alert">{state.mutationError}</p> : null}
        {onRetry ? <button className={authStyles.action} disabled={state.pending} onClick={onRetry}>Retry loading saved details</button> : null}
        {!canWrite && !onRetry ? <p role="status">Owner configuration access is required. Contact Nomly.</p> : null}
        {!onRetry ? <OwnerOnboardingSteps key={step} state={state} step={step} canWrite={canWrite} onNext={onStepChange} onClose={onClose} /> : null}
      </div>
    </div>
  </div>;
}
