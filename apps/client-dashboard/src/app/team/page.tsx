import { Suspense } from "react";
import { DashboardShellLoading } from "../../components/dashboard/DashboardShell";
import { TeamRoute } from "../../features/team/components/TeamRoute";

export default function TeamPageRoute() {
  return <Suspense fallback={<DashboardShellLoading />}><TeamRoute /></Suspense>;
}
