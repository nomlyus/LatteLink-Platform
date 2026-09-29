"use client";

import React from "react";
import Link from "next/link";
import type { OperatorDashboardSnapshot } from "../../../api";
import { legacyOnboardingPath } from "../../../lib/navigation/dashboard-navigation";
import type { StoreSettingsFormInput } from "../store-settings-domain";
import { StoreSettingsForm } from "./StoreSettingsForm";

type StoreConfig = NonNullable<OperatorDashboardSnapshot["storeConfig"]>;

export function StoreSettingsPage({
  config,
  status,
  error,
  notice,
  mutationError,
  scopeKey,
  selectedLocationId,
  selectedLocationName,
  canWrite,
  pending,
  onRetry,
  onSave,
  isOwner
}: {
  config: StoreConfig | null;
  status: "loading" | "ready" | "error";
  error: string | null;
  notice: string | null;
  mutationError: string | null;
  scopeKey: string;
  selectedLocationId: string | "all" | null;
  selectedLocationName: string | null;
  canWrite: boolean;
  pending: boolean;
  onRetry: () => void;
  onSave: (input: StoreSettingsFormInput) => Promise<boolean>;
  isOwner: boolean;
}) {
  const isAllLocations = selectedLocationId === "all";
  const hasLocation = Boolean(selectedLocationId && !isAllLocations);

  return (
    <section className="dash-section dash-section--settings" aria-label="Store settings">
      <div className="dash-section-heading">
        <div>
          <span className="dash-panel-title">Workspace</span>
          <h1 className="dash-section-title">Settings</h1>
          <p className="muted-copy">Manage storefront details for one location at a time.</p>
        </div>
        {isOwner ? <Link className="button button--secondary" href={legacyOnboardingPath}>Launch setup</Link> : null}
      </div>

      {mutationError ? <div className="banner banner--error" role="alert">{mutationError}</div> : null}
      {notice ? <div className="banner banner--notice" role="status">{notice}</div> : null}

      {isAllLocations ? (
        <SettingsMessage title="Choose a location">Store configuration is managed one location at a time. Pick a specific location from the workspace selector to view or update its settings.</SettingsMessage>
      ) : !hasLocation ? (
        <SettingsMessage title="No location selected">Select an authorized location from the workspace selector to view its store settings.</SettingsMessage>
      ) : status === "loading" ? (
        <SettingsMessage title="Store configuration" busy>Loading the latest settings for {selectedLocationName ?? "this location"}…</SettingsMessage>
      ) : status === "error" ? (
        <SettingsMessage title="Unable to load settings" error>{error ?? "The store configuration could not be loaded."}<button className="button button--secondary" type="button" onClick={onRetry}>Try again</button></SettingsMessage>
      ) : config ? (
        <article className="dash-surface">
          <header className="dash-surface-head">
            <div>
              <div className="dash-panel-title">Location settings</div>
              <h2 className="dash-surface-title">{config.locationName}</h2>
              <p className="muted-copy">These values apply to {selectedLocationName ?? "the selected location"}.</p>
            </div>
          </header>
          {!canWrite ? <p className="muted-copy">You have view access. Contact an owner with store-write permission to make changes.</p> : null}
          {status === "ready" ? <StoreSettingsForm config={config} scopeKey={scopeKey} canWrite={canWrite} pending={pending} onSave={onSave} /> : null}
        </article>
      ) : (
        <SettingsMessage title="Store configuration unavailable">No store configuration was returned for this location.</SettingsMessage>
      )}
    </section>
  );
}

function SettingsMessage({
  title,
  children,
  busy = false,
  error = false
}: {
  title: string;
  children: React.ReactNode;
  busy?: boolean;
  error?: boolean;
}) {
  return (
    <article className="dash-surface dash-empty-surface" role={error ? "alert" : "status"} aria-busy={busy || undefined}>
      <div>
        <h2 className="dash-surface-title">{title}</h2>
        <div className="muted-copy">{children}</div>
      </div>
    </article>
  );
}
