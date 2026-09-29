"use client";

import React, { useEffect } from "react";
import { useRouter } from "next/navigation";
import { ClientDashboardRoot } from "../../../app/ClientDashboardRoot";
import { DashboardShell, DashboardShellLoading } from "../../../components/dashboard/DashboardShell";
import { canAccessCapability, canUpdateStoreSettings } from "../../../model";
import { useDashboardSession } from "../../auth/session-provider";
import { useDashboardLocation } from "../../location/location-provider";
import { useStoreSettings } from "../use-store-settings";
import { StoreSettingsPage } from "./StoreSettingsPage";

export function SettingsRoute() {
  const { status: sessionStatus, session } = useDashboardSession();

  if (sessionStatus === "loading") return <DashboardShellLoading />;
  if (sessionStatus === "signed-out") return <ClientDashboardRoot initialSection="store" />;
  if (!session) return <DashboardShellLoading />;
  if (session.operator.role === "store") return <StoreOperatorRedirect />;

  if (!canAccessCapability(session.operator, "store:read")) {
    return <DashboardShell activeSection="store"><SettingsMessage>You don’t have permission to view store settings.</SettingsMessage></DashboardShell>;
  }

  return <AuthorizedSettingsRoute isOwner={session.operator.role === "owner"} canWrite={canUpdateStoreSettings(session.operator)} />;
}

function AuthorizedSettingsRoute({ isOwner, canWrite }: { isOwner: boolean; canWrite: boolean }) {
  const location = useDashboardLocation();
  const settings = useStoreSettings();

  if (location.status === "idle" || location.status === "loading") {
    return <DashboardShell activeSection="store"><SettingsMessage busy>Loading your authorized locations…</SettingsMessage></DashboardShell>;
  }
  if (location.status === "error") {
    return <DashboardShell activeSection="store"><SettingsMessage error>{location.error ?? "Unable to load authorized locations."}<button className="button button--secondary" type="button" onClick={() => { void location.loadAvailableLocations(); }}>Try again</button></SettingsMessage></DashboardShell>;
  }

  return (
    <DashboardShell activeSection="store" locationSelectionDisabled={settings.pending}>
      <StoreSettingsPage
        config={settings.config}
        status={settings.status}
        error={settings.loadError}
        notice={settings.notice}
        mutationError={settings.error}
        scopeKey={settings.scopeKey}
        selectedLocationId={location.selectedLocationId}
        selectedLocationName={location.selectedLocation?.locationName ?? null}
        canWrite={canWrite}
        pending={settings.pending}
        onRetry={() => { void settings.reload(); }}
        onSave={settings.save}
        isOwner={isOwner}
      />
    </DashboardShell>
  );
}

function StoreOperatorRedirect() {
  const router = useRouter();
  useEffect(() => { router.replace(`/orders${window.location.search}${window.location.hash}`); }, [router]);
  return <DashboardShellLoading />;
}

function SettingsMessage({ children, error = false, busy = false }: { children: React.ReactNode; error?: boolean; busy?: boolean }) {
  return <section className="dash-section dash-section--settings"><div className="dash-surface dash-empty-surface" role={error ? "alert" : "status"} aria-busy={busy || undefined}><div>{children}</div></div></section>;
}
