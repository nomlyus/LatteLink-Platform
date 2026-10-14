"use client";
import React, { useRef, useState } from "react";
import { ownerOnboardingProfileSchema } from "@lattelink/contracts-catalog";
import type { OwnerProfileInput } from "../owner-input-domain";
import styles from "./onboarding-v3.module.css";
import authStyles from "../../auth/components/auth-v3.module.css";

export function OwnerProfileForm({ formId, initial, disabled, onSave, onContinue }: {
  formId: string; initial?: OwnerProfileInput; disabled: boolean;
  onSave: (input: OwnerProfileInput) => Promise<boolean>; onContinue: () => void;
}) {
  const saving = useRef(false);
  const [error, setError] = useState<string | null>(null);
  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (disabled || saving.current) return;
    const fields = new FormData(event.currentTarget);
    const input = ownerOnboardingProfileSchema.safeParse({
      ownerName: fields.get("ownerName"), brandName: fields.get("brandName"),
      customerFacingName: String(fields.get("customerFacingName") ?? "").trim() || fields.get("brandName")
    });
    if (!input.success) { setError("Enter your name and business names."); return; }
    setError(null); saving.current = true;
    try { if (await onSave(input.data)) onContinue(); } finally { saving.current = false; }
  }
  return <form id={formId} className={styles.form} onSubmit={(event) => { void save(event); }}>
    <label className={authStyles.field}><span className={authStyles.label}>Your name</span><input className={authStyles.input} name="ownerName" autoComplete="name" defaultValue={initial?.ownerName ?? ""} required maxLength={120} disabled={disabled} /></label>
    <label className={authStyles.field}><span className={authStyles.label}>Brand name</span><input className={authStyles.input} name="brandName" autoComplete="organization" defaultValue={initial?.brandName ?? ""} required maxLength={120} disabled={disabled} /></label>
    <label className={authStyles.field}><span className={authStyles.label}>Customer-facing name</span><input className={authStyles.input} name="customerFacingName" placeholder="Same as brand name" defaultValue={initial?.customerFacingName ?? ""} maxLength={120} disabled={disabled} /></label>
    {error ? <p role="alert">{error}</p> : null}
  </form>;
}
