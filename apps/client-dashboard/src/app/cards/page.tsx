import { Suspense } from "react";
import { DashboardShellLoading } from "../../components/dashboard/DashboardShell";
import { CardsRoute } from "../../features/cards/components/CardsRoute";

export default function CardsPageRoute() {
  return <Suspense fallback={<DashboardShellLoading />}><CardsRoute /></Suspense>;
}
