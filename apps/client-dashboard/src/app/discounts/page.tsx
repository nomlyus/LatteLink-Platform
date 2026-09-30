import { Suspense } from "react";
import { DashboardShellLoading } from "../../components/dashboard/DashboardShell";
import { DiscountsRoute } from "../../features/discounts/components/DiscountsRoute";

export default function DiscountsPageRoute() {
  return <Suspense fallback={<DashboardShellLoading />}><DiscountsRoute /></Suspense>;
}
