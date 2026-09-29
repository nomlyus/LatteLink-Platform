import { Suspense } from "react";
import { DashboardShellLoading } from "../../components/dashboard/DashboardShell";
import { MenuRoute } from "../../features/menu/components/MenuRoute";

export default function MenuPageRoute() {
  return <Suspense fallback={<DashboardShellLoading />}><MenuRoute /></Suspense>;
}
