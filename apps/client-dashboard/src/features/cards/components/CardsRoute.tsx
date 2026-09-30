"use client";

import React from "react";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { SignInRoute } from "../../auth/components/SignInRoute";
import { DashboardShell, DashboardShellLoading } from "../../../components/dashboard/DashboardShell";
import { canAccessCapability, isStoreOperator } from "../../../model";
import { useDashboardSession } from "../../auth/session-provider";
import { useDashboardLocation } from "../../location/location-provider";
import { CardsPage } from "./CardsPage";
import { useCardMutations } from "../use-card-mutations";
import { useCards } from "../use-cards";

export function CardsRoute() {
  const { status: sessionStatus, session } = useDashboardSession();
  const location = useDashboardLocation();
  const cards = useCards();
  const mutations = useCardMutations(cards, cards.scopeKey);

  if (sessionStatus === "loading") return <DashboardShellLoading />;
  if (sessionStatus === "signed-out") return <SignInRoute />;
  if (!session) return <DashboardShellLoading />;
  if (isStoreOperator(session.operator)) return <StoreOperatorRedirect />;

  if (!canAccessCapability(session.operator, "menu:read")) {
    return <DashboardShell activeSection="cards"><CardsRouteMessage role="alert">You don’t have permission to view cards.</CardsRouteMessage></DashboardShell>;
  }

  if (location.status === "idle" || location.status === "loading") {
    return <DashboardShell activeSection="cards"><CardsRouteLoading /></DashboardShell>;
  }

  if (location.status === "error") {
    return <DashboardShell activeSection="cards"><CardsRouteMessage role="alert">Unable to load authorized locations. <button className="button button--ghost" type="button" onClick={() => { void location.loadAvailableLocations(); }}>Try again</button></CardsRouteMessage></DashboardShell>;
  }

  return (
    <DashboardShell activeSection="cards" locationSelectionDisabled={mutations.isMutating}>
      <CardsPage
        cards={cards.cards}
        loadStatus={cards.status}
        loadError={cards.error}
        selectedLocationId={location.selectedLocationId}
        scopeKey={cards.scopeKey}
        canWrite={canAccessCapability(session.operator, "menu:write")}
        canChangeVisibility={canAccessCapability(session.operator, "menu:visibility")}
        mutations={mutations}
        onRetry={() => { void cards.reload(); }}
      />
    </DashboardShell>
  );
}

function StoreOperatorRedirect() {
  const router = useRouter();
  useEffect(() => {
    router.replace(`/orders${window.location.search}${window.location.hash}`);
  }, [router]);
  return <DashboardShellLoading />;
}

function CardsRouteLoading() {
  return <section className="dash-section dash-section--cards" aria-label="Loading cards" aria-busy="true"><div className="dash-cards-skeleton">{Array.from({ length: 4 }, (_, index) => <span className="dash-cards-skeleton__row" key={index} />)}</div></section>;
}

function CardsRouteMessage({ children, role = "status" }: { children: React.ReactNode; role?: "status" | "alert" }) {
  return <section className="dash-section dash-section--cards"><div className="dash-cards-message" role={role}>{children}</div></section>;
}
