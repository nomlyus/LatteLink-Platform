import { Suspense } from "react";
import { DashboardShellLoading } from "../../components/dashboard/DashboardShell";
import { OnboardingRoute } from "../../features/onboarding/components/OnboardingRoute";

export default function OnboardingPageRoute() {
  return <Suspense fallback={<DashboardShellLoading />}><OnboardingRoute /></Suspense>;
}
