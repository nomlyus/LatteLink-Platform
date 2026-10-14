"use client";

import React, { useEffect, useState, type FormEvent } from "react";
import type { OperatorDashboardSnapshot } from "../../../api";
import type { StoreSettingsFormInput } from "../store-settings-domain";
import { getMatchingStoreSettings } from "../store-settings-search";

type StoreConfig = NonNullable<OperatorDashboardSnapshot["storeConfig"]>;

export function StoreSettingsForm({
  config,
  query = "",
  scopeKey,
  canWrite,
  pending,
  submitLabel = "Save store settings",
  onSave,
  fields
}: {
  config: StoreConfig;
  query?: string;
  scopeKey: string;
  canWrite: boolean;
  pending: boolean;
  submitLabel?: string;
  onSave: (input: StoreSettingsFormInput) => Promise<boolean>;
  fields?: readonly (keyof StoreSettingsFormInput)[];
}) {
  const [form, setForm] = useState<StoreSettingsFormInput>(() => formFromConfig(config));
  const matchingFields = getMatchingStoreSettings(config, query);
  if (fields) for (const field of matchingFields) { if (!fields.includes(field)) matchingFields.delete(field); }

  useEffect(() => {
    setForm(formFromConfig(config));
  }, [config, scopeKey]);

  function updateField(field: keyof StoreSettingsFormInput, value: string) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending || !canWrite) return;
    await onSave(form);
  }

  if (!canWrite) {
    return (
      <>
        <p className="muted-copy" role="status">Store settings are read-only for your current role. Contact a store owner to make changes.</p>
        <div className="dash-detail-grid">
          <StoreSettingValue hidden={!matchingFields.has("storeName")} label="Store name" value={config.storeName} />
          <StoreSettingValue hidden={!matchingFields.has("locationName")} label="Location name" value={config.locationName} />
          <StoreSettingValue hidden={!matchingFields.has("hours")} label="Hours" value={config.hours} />
          <StoreSettingValue hidden={!matchingFields.has("taxRateBasisPoints")} label="Tax rate basis points" value={String(config.taxRateBasisPoints)} />
          <StoreSettingValue hidden={!matchingFields.has("pickupInstructions")} label="Pickup instructions" value={config.pickupInstructions} wide />
        </div>
        {matchingFields.size === 0 ? <SettingsSearchEmpty /> : null}
      </>
    );
  }

  return (
    <form className="dash-store-form dash-settings-form" onSubmit={(event) => { void submit(event); }}>
      <label className="field" hidden={!matchingFields.has("storeName")}>
        <span>Store name</span>
        <input name="storeName" required value={form.storeName ?? ""} disabled={pending} onChange={(event) => updateField("storeName", event.target.value)} />
      </label>
      <label className="field" hidden={!matchingFields.has("locationName")}>
        <span>Location name</span>
        <input name="locationName" required value={form.locationName ?? ""} disabled={pending} onChange={(event) => updateField("locationName", event.target.value)} />
      </label>
      <label className="field" hidden={!matchingFields.has("hours")}>
        <span>Hours</span>
        <input name="hours" required value={form.hours ?? ""} disabled={pending} onChange={(event) => updateField("hours", event.target.value)} />
      </label>
      <label className="field" hidden={!matchingFields.has("taxRateBasisPoints")}>
        <span>Tax rate basis points</span>
        <input name="taxRateBasisPoints" type="number" min="0" max="10000" step="1" required value={form.taxRateBasisPoints ?? ""} disabled={pending} onChange={(event) => updateField("taxRateBasisPoints", event.target.value)} />
      </label>
      <label className="field dash-store-form__wide" hidden={!matchingFields.has("pickupInstructions")}>
        <span>Pickup instructions</span>
        <textarea name="pickupInstructions" rows={3} required value={form.pickupInstructions ?? ""} disabled={pending} onChange={(event) => updateField("pickupInstructions", event.target.value)} />
      </label>
      {matchingFields.size === 0 ? <SettingsSearchEmpty /> : null}
      <div className="dash-form-actions dash-store-form__wide" hidden={matchingFields.size === 0}>
        <button className="button button--secondary" type="submit" disabled={pending}>
          {pending ? <><span className="spinner" aria-hidden="true" /> Saving…</> : submitLabel}
        </button>
      </div>
    </form>
  );
}

function StoreSettingValue({ label, value, wide = false, hidden = false }: { label: string; value: string; wide?: boolean; hidden?: boolean }) {
  return <div hidden={hidden} className={`dash-detail-metric${wide ? " dash-detail-metric--wide" : ""}`}><span>{label}</span><strong>{value}</strong></div>;
}

function SettingsSearchEmpty() {
  return <div className="dash-store-form__wide dash-settings-search-empty" role="status"><strong>No settings match this search</strong><span>Try another search.</span></div>;
}

function formFromConfig(config: StoreConfig): StoreSettingsFormInput {
  return {
    storeName: config.storeName,
    locationName: config.locationName,
    hours: config.hours,
    pickupInstructions: config.pickupInstructions,
    taxRateBasisPoints: String(config.taxRateBasisPoints)
  };
}
