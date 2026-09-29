import { Suspense } from "react";
import { OrdersRoute } from "../../features/orders/components/OrdersRoute";
import { DashboardShellLoading } from "../../components/dashboard/DashboardShell";

export default function OrdersPageRoute() {
  return <Suspense fallback={<DashboardShellLoading />}><OrdersRoute /></Suspense>;
}
