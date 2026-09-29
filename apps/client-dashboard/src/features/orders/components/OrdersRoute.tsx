"use client";

import { ClientDashboardRoot } from "../../../app/ClientDashboardRoot";
import { DashboardShell, DashboardShellLoading } from "../../../components/dashboard/DashboardShell";
import { useDashboardSession } from "../../auth/session-provider";
import { OrdersPage } from "./OrdersPage";

export function OrdersRoute() {
  const { status, session } = useDashboardSession();
  if (status === "loading") return <DashboardShellLoading />;
  if (status === "signed-out") return <ClientDashboardRoot initialSection="orders" />;
  if (!session) return <DashboardShellLoading />;
  return <DashboardShell activeSection="orders"><OrdersPage /></DashboardShell>;
}
