import { Suspense } from "react";
import { DashboardHomeRoute } from "../features/home/components/DashboardHomeRoute";
import { DashboardShellLoading } from "../components/dashboard/DashboardShell";

export default function DashboardEntryPage() {
  return (
    <Suspense fallback={<DashboardShellLoading />}>
      <DashboardHomeRoute />
    </Suspense>
  );
}
