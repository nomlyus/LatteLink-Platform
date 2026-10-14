"use client";

import styles from "./onboarding-v3.module.css";
import authStyles from "../../auth/components/auth-v3.module.css";
import React, { useRef, useState } from "react";
import { ownerOnboardingLocationDetailsSchema } from "@lattelink/contracts-catalog";
import type { OwnerOnboardingLocation } from "../owner-onboarding-state";
import { taxPercentToBasisPoints, type OwnerLocationInput } from "../owner-input-domain";

export function OnboardingLocationDetails({ location, pending, canWrite, onSave, formId, onContinue }: {
  location: OwnerOnboardingLocation;
  pending: boolean;
  canWrite: boolean;
  onSave: (locationId: string, input: OwnerLocationInput) => Promise<boolean>;
  formId: string;
  onContinue: () => void;
}) {
  const initial = location.summary.ownerLocationDetails;
  const saving = useRef(false);
  const [error, setError] = useState<string | null>(null);
  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canWrite || pending || saving.current) return;
    const fields = new FormData(event.currentTarget);
    let input: OwnerLocationInput;
    try {
      input = ownerOnboardingLocationDetailsSchema.parse({
        locationName: fields.get("locationName"), address: fields.get("address"), timezone: fields.get("timezone"),
        hours: fields.get("hours"), taxRateBasisPoints: taxPercentToBasisPoints(String(fields.get("taxPercent") ?? ""))
      });
    } catch { setError("Enter a location name, address, valid timezone, hours, and tax percentage (0–100, up to two decimals)."); return; }
    setError(null); saving.current = true;
    try { if (await onSave(location.config.locationId, input)) onContinue(); }
    finally { saving.current = false; }
  }
  return <form id={formId} className={styles.form} onSubmit={(event) => { void save(event); }}>
    <label className={authStyles.field}><span className={authStyles.label}>Location name</span><input className={authStyles.input} name="locationName" defaultValue={initial?.locationName ?? ""} required maxLength={120} disabled={pending || !canWrite} /></label>
    <label className={authStyles.field}><span className={authStyles.label}>Address</span><input className={authStyles.input} name="address" autoComplete="street-address" defaultValue={initial?.address ?? ""} required maxLength={500} disabled={pending || !canWrite} /></label>
    <label className={authStyles.field}><span className={authStyles.label}>Timezone</span><input className={authStyles.input} name="timezone" placeholder="America/Detroit" defaultValue={initial?.timezone ?? ""} required disabled={pending || !canWrite} /></label>
    <label className={authStyles.field}><span className={authStyles.label}>Operating hours</span><input className={authStyles.input} name="hours" placeholder="Mon–Fri 8 AM–5 PM; Sat–Sun closed" defaultValue={initial?.hours ?? ""} required maxLength={1000} disabled={pending || !canWrite} /></label>
    <label className={authStyles.field}><span className={authStyles.label}>Tax rate (%)</span><input className={authStyles.input} name="taxPercent" type="number" min="0" max="100" step="0.01" placeholder="6.25" defaultValue={initial ? initial.taxRateBasisPoints / 100 : ""} required disabled={pending || !canWrite} /></label>
    {error ? <p role="alert">{error}</p> : null}
  </form>;
}
