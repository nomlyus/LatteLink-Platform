"use client";

import { isPlatformManagedMenu } from "@lattelink/contracts-catalog";
import React, { type ReactNode } from "react";
import { ClientDashboardRoot } from "../../../app/ClientDashboardRoot";
import { DashboardShell, DashboardShellLoading } from "../../../components/dashboard/DashboardShell";
import { canAccessCapability } from "../../../model";
import { useDashboardSession } from "../../auth/session-provider";
import { useDashboardLocation } from "../../location/location-provider";
import { MenuPage } from "./MenuPage";
import { useMenuCatalog } from "../use-menu-catalog";
import { useMenuMutations } from "../use-menu-mutations";

export function MenuRoute() {
  const { status: sessionStatus, session } = useDashboardSession();
  const location = useDashboardLocation();
  const catalog = useMenuCatalog();
  const mutations = useMenuMutations(catalog.menu, catalog.reload);

  if (sessionStatus === "loading") return <DashboardShellLoading />;
  if (sessionStatus === "signed-out") return <ClientDashboardRoot initialSection="menu" />;
  if (!session) return <DashboardShellLoading />;

  if (!canAccessCapability(session.operator, "menu:read")) {
    return <DashboardShell activeSection="menu"><MenuRouteMessage>You don’t have permission to view this menu.</MenuRouteMessage></DashboardShell>;
  }

  if (location.status === "idle" || location.status === "loading") {
    return <DashboardShell activeSection="menu"><MenuRouteLoading /></DashboardShell>;
  }

  if (location.status === "error") {
    return <DashboardShell activeSection="menu"><MenuRouteMessage role="alert">Unable to load authorized locations. <button className="button button--ghost" type="button" onClick={() => { void location.loadAvailableLocations(); }}>Try again</button></MenuRouteMessage></DashboardShell>;
  }

  const externalSync = Boolean(location.selectedLocation && !isPlatformManagedMenu(location.selectedLocation.appConfig));
  return (
    <DashboardShell activeSection="menu" locationSelectionDisabled={mutations.isMutating}>
      <MenuPage
        menu={catalog.menu}
        loadStatus={catalog.status}
        loadError={catalog.error}
        selectedLocationId={location.selectedLocationId}
        scopeKey={catalog.scopeKey}
        externalSync={externalSync}
        mutations={mutations}
        onRetry={() => { void catalog.reload(); }}
      />
    </DashboardShell>
  );
}

function MenuRouteLoading() {
  return <section className="dash-section dash-section--menu" aria-label="Loading menu" aria-busy="true"><div className="dash-menu-table-skeleton">{Array.from({ length: 6 }, (_, index) => <span className="dash-menu-table-skeleton__row" key={index} />)}</div></section>;
}

function MenuRouteMessage({ children, role = "status" }: { children: ReactNode; role?: "status" | "alert" }) {
  return <section className="dash-section dash-section--menu"><div className="dash-menu-error" role={role}>{children}</div></section>;
}
