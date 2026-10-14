import React from "react";
import styles from "./onboarding-v3.module.css";
import authStyles from "../../auth/components/auth-v3.module.css";

export function OnboardingStepFooter({ label, disabled, formId, onContinue, onBack }: {
  label: string;
  disabled: boolean;
  formId?: string;
  onContinue?: () => void;
  onBack?: () => void;
}) {
  return <footer className={styles.footer}>
    {onBack ? <button className={styles.backNavigation} type="button" aria-label="Back" disabled={disabled} onClick={onBack}>‹</button> : null}
    <button className={`${authStyles.action} ${authStyles.actionLight}`} type={formId ? "submit" : "button"} form={formId} disabled={disabled} onClick={onContinue}>{label}</button>
  </footer>;
}
