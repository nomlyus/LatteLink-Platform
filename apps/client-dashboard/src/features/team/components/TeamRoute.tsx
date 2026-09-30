"use client";

import React from "react";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { SignInRoute } from "../../auth/components/SignInRoute";
import { DashboardShell, DashboardShellLoading } from "../../../components/dashboard/DashboardShell";
import { useDashboardSession } from "../../auth/session-provider";
import { useDashboardLocation } from "../../location/location-provider";
import { canReadTeam } from "../team-domain";
import { useTeam } from "../use-team";
import { useTeamMutations } from "../use-team-mutations";
import { TeamPage } from "./TeamPage";

export function TeamRoute() {
  const { status: sessionStatus, session } = useDashboardSession();
  const location = useDashboardLocation();
  const team = useTeam();
  const mutations = useTeamMutations(team);

  if (sessionStatus === "loading") return <DashboardShellLoading />;
  if (sessionStatus === "signed-out") return <SignInRoute />;
  if (!session) return <DashboardShellLoading />;
  if (session.operator.role === "store") return <StoreOperatorRedirect />;

  if (!canReadTeam(session.operator)) {
    return <DashboardShell activeSection="team"><div className="dash-team-state" role="alert"><strong>Team access unavailable</strong><span>Your current operator session does not have permission to view team accounts.</span></div></DashboardShell>;
  }

  if (location.status === "idle" || location.status === "loading") {
    return <DashboardShell activeSection="team"><TeamRouteLoading /></DashboardShell>;
  }
  if (location.status === "error") {
    return <DashboardShell activeSection="team"><div className="dash-team-state dash-team-state--error" role="alert"><span>Unable to load authorized locations. {location.error}</span><button className="button button--ghost" type="button" onClick={() => { void location.loadAvailableLocations(); }}>Try again</button></div></DashboardShell>;
  }

  return (
    <DashboardShell activeSection="team" locationSelectionDisabled={mutations.isMutating}>
      <TeamPage
        members={team.members}
        loadStatus={team.status}
        loadError={team.error}
        scopeKey={team.scopeKey}
        selectedLocationId={location.selectedLocationId}
        selectedLocationName={location.selectedLocation?.locationName ?? "the selected location"}
        locations={location.availableLocations}
        currentOperator={session.operator}
        canWrite={session.operator.capabilities.includes("team:write")}
        mutations={mutations}
        onRetry={() => { void team.reload(); }}
      />
    </DashboardShell>
  );
}

function StoreOperatorRedirect() {
  const router = useRouter();
  useEffect(() => { router.replace(`/orders${window.location.search}${window.location.hash}`); }, [router]);
  return <DashboardShellLoading />;
}

function TeamRouteLoading() {
  return <section className="dash-section dash-section--team" aria-label="Loading team" aria-busy="true"><div className="dash-team-list-surface"><div className="dash-team-skeleton"><span /><span /><span /><span /></div></div></section>;
}
