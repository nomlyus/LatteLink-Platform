import { Suspense } from "react";
import { DashboardShellLoading } from "../../components/dashboard/DashboardShell";
import { SettingsRoute } from "../../features/settings/components/SettingsRoute";

export default function SettingsPageRoute() {
  return <Suspense fallback={<DashboardShellLoading />}><SettingsRoute /></Suspense>;
}
