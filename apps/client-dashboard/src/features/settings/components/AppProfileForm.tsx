"use client";

import React, { useRef, useState, type FormEvent } from "react";
import type { OperatorOnboardingSummary, OperatorAppIdentityUpdate } from "../../onboarding/onboarding-api";
import { buildAppIdentityUpdate } from "../../onboarding/onboarding-domain";
import { matchesDashboardSearch } from "../../../components/dashboard/search-text";
import { operatorAppIdentityProfileUpdateSchema } from "@lattelink/contracts-catalog";

export function AppProfileForm({ summary, pending, canWrite, query, onSave }: {
  summary: OperatorOnboardingSummary;
  pending: boolean;
  canWrite: boolean;
  query: string;
  onSave: (input: OperatorAppIdentityUpdate) => Promise<boolean>;
}) {
  const identity = summary.appIdentity;
  const submitting = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const fields = [
    { name: "appName", label: "App name", value: identity?.appName ?? summary.brandName, required: true, maxLength: 30 },
    { name: "displayName", label: "Home screen name", value: identity?.displayName ?? summary.brandName, required: true, maxLength: 30 },
    { name: "subtitle", label: "App Store subtitle", value: identity?.subtitle ?? "", required: true, maxLength: 30 },
    { name: "description", label: "App Store description", value: identity?.description ?? "", required: true, multiline: true, maxLength: 4000 },
    { name: "keywords", label: "Keywords", value: identity?.keywords.join(", ") ?? "" },
    { name: "supportUrl", label: "Support URL", value: identity?.supportUrl ?? "", required: true, type: "url" },
    { name: "privacyPolicyUrl", label: "Privacy policy URL", value: identity?.privacyPolicyUrl ?? "", required: true, type: "url" },
    { name: "marketingUrl", label: "Marketing URL", value: identity?.marketingUrl ?? "", type: "url" },
    { name: "iconAssetUrl", label: "Icon asset URL", value: identity?.iconAssetUrl ?? "", type: "url" },
    { name: "splashAssetUrl", label: "Splash asset URL", value: identity?.splashAssetUrl ?? "", type: "url" },
    { name: "screenshotAssetUrls", label: "Screenshot URLs", value: identity?.screenshotAssetUrls.join("\n") ?? "", multiline: true }
  ];
  const matches = (label: string, value: string) => matchesDashboardSearch(query, [label, value]);
  const assetModeVisible = matches("Asset mode", identity?.assetMode ?? "placeholder");
  const hasMatches = assetModeVisible || fields.some((field) => matches(field.label, field.value));

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending || !canWrite || submitting.current) return;
    submitting.current = true;
    setError(null);
    try { await onSave(operatorAppIdentityProfileUpdateSchema.parse(buildAppIdentityUpdate(new FormData(event.currentTarget)))); }
    catch (saveError) { setError(saveError instanceof Error ? saveError.message : "Unable to save app profile."); }
    finally { submitting.current = false; }
  }

  return <form className="dash-store-form dash-settings-form" noValidate onSubmit={(event) => { void submit(event); }}>
    <p className="dash-store-form__wide muted-copy">Nomly automatically assigns and manages your app’s bundle identifier and SKU.</p>
    {error ? <p className="dash-store-form__wide" role="alert">{error}</p> : null}
    {fields.map((field) => <label key={field.name} className={`field${field.multiline ? " dash-store-form__wide" : ""}`} hidden={!matches(field.label, field.value)}>
      <span>{field.label}</span>
      {field.multiline ? <textarea name={field.name} rows={3} defaultValue={field.value} required={field.required} maxLength={field.maxLength} disabled={!canWrite || pending} /> : <input name={field.name} type={field.type ?? "text"} defaultValue={field.value} required={field.required} maxLength={field.maxLength} disabled={!canWrite || pending} />}
    </label>)}
    <label className="field" hidden={!assetModeVisible}><span>Asset mode</span><select name="assetMode" defaultValue={identity?.assetMode ?? "placeholder"} disabled={!canWrite || pending}><option value="placeholder">Use Nomly placeholder assets</option><option value="provided">Use provided brand assets</option></select></label>
    {!hasMatches ? <div className="dash-store-form__wide dash-settings-search-empty" role="status">No app settings match this search.</div> : null}
    {canWrite ? <div className="dash-form-actions dash-store-form__wide" hidden={!hasMatches}><button className="button button--secondary" type="submit" disabled={pending}>{pending ? "Saving…" : "Save app profile"}</button></div> : null}
  </form>;
}
