"use client";

import React from "react";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { SignInRoute } from "../../auth/components/SignInRoute";
import { DashboardShell, DashboardShellLoading } from "../../../components/dashboard/DashboardShell";
import { canAccessCapability, isStoreOperator } from "../../../model";
import { useDashboardSession } from "../../auth/session-provider";
import { useDashboardLocation } from "../../location/location-provider";
import { useDiscountMutations } from "../use-discount-mutations";
import { useDiscounts } from "../use-discounts";
import { DiscountsPage } from "./DiscountsPage";

export function DiscountsRoute() {
  const { status: sessionStatus, session } = useDashboardSession();
  const location = useDashboardLocation();
  const discounts = useDiscounts();
  const mutations = useDiscountMutations(discounts);

  if (sessionStatus === "loading") return <DashboardShellLoading />;
  if (sessionStatus === "signed-out") return <SignInRoute />;
  if (!session) return <DashboardShellLoading />;
  if (isStoreOperator(session.operator)) return <StoreOperatorRedirect />;

  if (!canAccessCapability(session.operator, "menu:read")) {
    return <DashboardShell activeSection="discounts"><DiscountsRouteMessage role="alert">You don’t have permission to view discount codes.</DiscountsRouteMessage></DashboardShell>;
  }

  if (location.status === "idle" || location.status === "loading") {
    return <DashboardShell activeSection="discounts"><DiscountsRouteLoading /></DashboardShell>;
  }

  if (location.status === "error") {
    return <DashboardShell activeSection="discounts"><DiscountsRouteMessage role="alert">Unable to load authorized locations. <button className="button button--ghost" type="button" onClick={() => { void location.loadAvailableLocations(); }}>Try again</button></DiscountsRouteMessage></DashboardShell>;
  }

  return (
    <DashboardShell activeSection="discounts" locationSelectionDisabled={mutations.isMutating}>
      <DiscountsPage
        discountCodes={discounts.discountCodes}
        loadStatus={discounts.status}
        loadError={discounts.error}
        selectedLocationId={location.selectedLocationId}
        scopeKey={discounts.scopeKey}
        canWrite={canAccessCapability(session.operator, "menu:write")}
        mutations={mutations}
        onRetry={() => { void discounts.reload(); }}
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

function DiscountsRouteLoading() {
  return <section className="dash-section dash-section--discounts" aria-label="Loading discount codes" aria-busy="true"><div className="dash-discounts-list-surface"><div className="dash-discounts-skeleton"><span /><span /><span /></div></div></section>;
}

function DiscountsRouteMessage({ children, role = "status" }: { children: React.ReactNode; role?: "status" | "alert" }) {
  return <section className="dash-section dash-section--discounts"><div className="dash-discounts-state" role={role}>{children}</div></section>;
}
