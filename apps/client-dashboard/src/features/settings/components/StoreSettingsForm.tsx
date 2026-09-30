"use client";

import React, { useEffect, useState, type FormEvent } from "react";
import type { OperatorDashboardSnapshot } from "../../../api";
import type { StoreSettingsFormInput } from "../store-settings-domain";

type StoreConfig = NonNullable<OperatorDashboardSnapshot["storeConfig"]>;

export function StoreSettingsForm({
  config,
  scopeKey,
  canWrite,
  pending,
  onSave
}: {
  config: StoreConfig;
  scopeKey: string;
  canWrite: boolean;
  pending: boolean;
  onSave: (input: StoreSettingsFormInput) => Promise<boolean>;
}) {
  const [form, setForm] = useState<StoreSettingsFormInput>(() => formFromConfig(config));

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
          <StoreSettingValue label="Store name" value={config.storeName} />
          <StoreSettingValue label="Location name" value={config.locationName} />
          <StoreSettingValue label="Hours" value={config.hours} />
          <StoreSettingValue label="Tax rate basis points" value={String(config.taxRateBasisPoints)} />
          <StoreSettingValue label="Pickup instructions" value={config.pickupInstructions} wide />
        </div>
      </>
    );
  }

  return (
    <form className="dash-store-form" onSubmit={(event) => { void submit(event); }}>
      <label className="field">
        <span>Store name</span>
        <input name="storeName" required value={form.storeName ?? ""} disabled={pending} onChange={(event) => updateField("storeName", event.target.value)} />
      </label>
      <label className="field">
        <span>Location name</span>
        <input name="locationName" required value={form.locationName ?? ""} disabled={pending} onChange={(event) => updateField("locationName", event.target.value)} />
      </label>
      <label className="field">
        <span>Hours</span>
        <input name="hours" required value={form.hours ?? ""} disabled={pending} onChange={(event) => updateField("hours", event.target.value)} />
      </label>
      <label className="field">
        <span>Tax rate basis points</span>
        <input name="taxRateBasisPoints" type="number" min="0" max="10000" step="1" required value={form.taxRateBasisPoints ?? ""} disabled={pending} onChange={(event) => updateField("taxRateBasisPoints", event.target.value)} />
      </label>
      <label className="field dash-store-form__wide">
        <span>Pickup instructions</span>
        <textarea name="pickupInstructions" rows={4} required value={form.pickupInstructions ?? ""} disabled={pending} onChange={(event) => updateField("pickupInstructions", event.target.value)} />
      </label>
      <div className="dash-form-actions dash-store-form__wide">
        <button className="button button--primary" type="submit" disabled={pending}>
          {pending ? <><span className="spinner" aria-hidden="true" /> Saving…</> : "Save store settings"}
        </button>
      </div>
    </form>
  );
}

function StoreSettingValue({ label, value, wide = false }: { label: string; value: string; wide?: boolean }) {
  return <div className={`dash-detail-metric${wide ? " dash-detail-metric--wide" : ""}`}><span>{label}</span><strong>{value}</strong></div>;
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
