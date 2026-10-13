"use client";

import React from "react";
import { SignInRoute } from "../../auth/components/SignInRoute";
import { DashboardShell, DashboardShellLoading } from "../../../components/dashboard/DashboardShell";
import { useDashboardSession } from "../../auth/session-provider";
import { isStoreOperator } from "../../../model";
import { OrdersManagementPage } from "./OrdersManagementPage";
import { StoreOrdersPage } from "./StoreOrdersPage";
import { OrdersSearch } from "./OrdersSearch";
import { OrdersSearchProvider } from "../orders-search-provider";

export function OrdersRoute() {
  const { status, session } = useDashboardSession();
  if (status === "loading") return <DashboardShellLoading />;
  if (status === "signed-out") return <SignInRoute />;
  if (!session) return <DashboardShellLoading />;
  return <OrdersSearchProvider key={`${session.operator.operatorUserId}:${session.operator.role}`}>
    <DashboardShell activeSection="orders" search={<OrdersSearch />}>
      {isStoreOperator(session.operator) ? <StoreOrdersPage /> : <OrdersManagementPage />}
    </DashboardShell>
  </OrdersSearchProvider>;
}
