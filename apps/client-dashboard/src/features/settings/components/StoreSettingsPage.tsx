"use client";

import React from "react";
import type { OperatorDashboardSnapshot } from "../../../api";
import type { StoreSettingsFormInput } from "../store-settings-domain";
import { StoreSettingsForm } from "./StoreSettingsForm";
import { ownerSettingsTabs, type OwnerSettingsTab } from "../owner-settings-tabs";

type StoreConfig = NonNullable<OperatorDashboardSnapshot["storeConfig"]>;

export function StoreSettingsPage({
  config,
  query = "",
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
  isOwner,
  activeTab = "store",
  onTabChange,
  tabContent,
  storeDetails
}: {
  config: StoreConfig | null;
  query?: string;
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
  activeTab?: OwnerSettingsTab;
  onTabChange?: (tab: OwnerSettingsTab) => void;
  tabContent?: React.ReactNode;
  storeDetails?: React.ReactNode;
}) {
  const isAllLocations = selectedLocationId === "all";
  const hasLocation = Boolean(selectedLocationId && !isAllLocations);
  if (!isOwner) return <section className="dash-section dash-section--settings" role="alert">Settings are only available to the store owner.</section>;

  return (
    <section className="dash-section dash-section--settings dash-section--management-table" aria-label="Store settings" id="settings-results">
      <div className="dash-menu-navigation">
        <div className="dash-menu-tabs" role="tablist" aria-label="Settings sections" onKeyDown={(event) => {
          const index = ownerSettingsTabs.findIndex(([id]) => id === activeTab);
          const next = event.key === "ArrowRight" ? (index + 1) % ownerSettingsTabs.length : event.key === "ArrowLeft" ? (index + ownerSettingsTabs.length - 1) % ownerSettingsTabs.length : event.key === "Home" ? 0 : event.key === "End" ? ownerSettingsTabs.length - 1 : -1;
          if (next >= 0) { event.preventDefault(); const id = ownerSettingsTabs[next]![0]; onTabChange?.(id); document.getElementById(`settings-tab-${id}`)?.focus(); }
        }}>
          {ownerSettingsTabs.map(([id, label]) => <button type="button" role="tab" id={`settings-tab-${id}`} key={id} className={`dash-menu-tab${activeTab === id ? " dash-menu-tab--active" : ""}`} aria-selected={activeTab === id} aria-controls="settings-panel" tabIndex={activeTab === id ? 0 : -1} disabled={pending} onClick={() => onTabChange?.(id)}>{label}</button>)}
        </div>
        {hasLocation && config ? <span className="dash-inline-note">{selectedLocationName ?? config.locationName}</span> : null}
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
        <article className="dash-settings-surface" id="settings-panel" role="tabpanel" aria-labelledby={`settings-tab-${activeTab}`} aria-label={`Location settings for ${selectedLocationName ?? config.locationName}`}>
          {activeTab === "store" ? <>{storeDetails}<StoreSettingsForm config={config} query={query} scopeKey={scopeKey} canWrite={canWrite} pending={pending} onSave={onSave} fields={storeDetails ? ["pickupInstructions"] : undefined} /></> : tabContent}
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
