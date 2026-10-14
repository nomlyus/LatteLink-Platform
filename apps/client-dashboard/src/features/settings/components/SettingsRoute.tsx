"use client";

import React, { useEffect, useState } from "react";
import { DashboardSearch } from "../../../components/dashboard/DashboardSearch";
import { useRouter, useSearchParams } from "next/navigation";
import { SignInRoute } from "../../auth/components/SignInRoute";
import { DashboardShell, DashboardShellLoading } from "../../../components/dashboard/DashboardShell";
import { canAccessCapability, canUpdateStoreSettings } from "../../../model";
import { useDashboardSession } from "../../auth/session-provider";
import { useDashboardLocation } from "../../location/location-provider";
import { useStoreSettings } from "../use-store-settings";
import { StoreSettingsPage } from "./StoreSettingsPage";
import { useOnboarding } from "../../onboarding/use-onboarding";
import { OwnerSetupPanel } from "./OwnerSetupPanel";
import { resolveOwnerSettingsTab, type OwnerSettingsTab } from "../owner-settings-tabs";
import type { StoreSettingsFormInput } from "../store-settings-domain";
import { OwnerBusinessDetails } from "./OwnerBusinessDetails";

export function SettingsRoute() {
  const { status: sessionStatus, session } = useDashboardSession();

  if (sessionStatus === "loading") return <DashboardShellLoading />;
  if (sessionStatus === "signed-out") return <SignInRoute />;
  if (!session) return <DashboardShellLoading />;
  if (session.operator.role !== "owner") return <NonOwnerSettingsRedirect />;

  if (!canAccessCapability(session.operator, "store:read")) {
    return <DashboardShell activeSection="store"><SettingsMessage>You don’t have permission to view store settings.</SettingsMessage></DashboardShell>;
  }

  return <AuthorizedSettingsRoute isOwner={session.operator.role === "owner"} canWrite={canUpdateStoreSettings(session.operator)} />;
}

function AuthorizedSettingsRoute({ isOwner, canWrite }: { isOwner: boolean; canWrite: boolean }) {
  const location = useDashboardLocation();
  const settings = useStoreSettings();
  const setup = useOnboarding();
  const router = useRouter();
  const searchParams = useSearchParams();
  const tab = resolveOwnerSettingsTab(searchParams.get("tab"));
  const pending = settings.pending || setup.isMutating;
  const [query, setQuery] = useState("");
  useEffect(() => { setQuery(""); }, [settings.scopeKey]);

  function selectTab(next: OwnerSettingsTab) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("tab", next);
    setQuery("");
    router.replace(`/settings?${params}`, { scroll: false });
  }

  async function saveStore(input: StoreSettingsFormInput) {
    // Store details and onboarding completion still use the existing authoritative
    // endpoints. Reload the Settings snapshot even after a partial save failure.
    const saved = await setup.saveStoreDetails(input);
    await settings.reload();
    return saved;
  }

  if (location.status === "idle" || location.status === "loading") {
    return <DashboardShell activeSection="store"><SettingsMessage busy>Loading your authorized locations…</SettingsMessage></DashboardShell>;
  }
  if (location.status === "error") {
    return <DashboardShell activeSection="store"><SettingsMessage error>{location.error ?? "Unable to load authorized locations."}<button className="button button--secondary" type="button" onClick={() => { void location.loadAvailableLocations(); }}>Try again</button></SettingsMessage></DashboardShell>;
  }

  return (
    <DashboardShell activeSection="store" locationSelectionDisabled={pending}
      search={<DashboardSearch label="Search settings" controls="settings-results" query={query} onQueryChange={setQuery} />}>
      <StoreSettingsPage
        config={settings.config}
        query={query}
        status={settings.status}
        error={settings.loadError}
        notice={settings.notice}
        mutationError={settings.error ?? setup.mutationError}
        scopeKey={settings.scopeKey}
        selectedLocationId={location.selectedLocationId}
        selectedLocationName={location.selectedLocation?.locationName ?? null}
        canWrite={canWrite}
        pending={pending}
        onRetry={() => { void settings.reload(); }}
        onSave={saveStore}
        isOwner={isOwner}
        activeTab={tab}
        onTabChange={selectTab}
        tabContent={<OwnerSetupPanel tab={tab} setup={setup} query={query} canWrite={canWrite} pending={pending} />}
        storeDetails={setup.summary?.ownerProfile ? <OwnerBusinessDetails setup={setup} canWrite={canWrite} pending={pending} onSaved={() => { void settings.reload(); }} /> : undefined}
      />
    </DashboardShell>
  );
}

function NonOwnerSettingsRedirect() {
  const router = useRouter();
  useEffect(() => { router.replace(`/orders${window.location.search}${window.location.hash}`); }, [router]);
  return <DashboardShellLoading />;
}

function SettingsMessage({ children, error = false, busy = false }: { children: React.ReactNode; error?: boolean; busy?: boolean }) {
  return <section className="dash-section dash-section--settings"><div className="dash-surface dash-empty-surface" role={error ? "alert" : "status"} aria-busy={busy || undefined}><div>{children}</div></div></section>;
}
