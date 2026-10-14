"use client";

import { Suspense, type ReactNode } from "react";
import { OwnerOnboardingGate } from "../features/onboarding/components/OwnerOnboardingGate";
import { DashboardSessionProvider } from "../features/auth/session-provider";
import { DashboardLocationProvider } from "../features/location/location-provider";

export function DashboardProviders({ children }: { children: ReactNode }) {
  return (
    <DashboardSessionProvider>
      <DashboardLocationProvider><Suspense fallback={<div className="dash-shell" role="status">Loading…</div>}><OwnerOnboardingGate>{children}</OwnerOnboardingGate></Suspense></DashboardLocationProvider>
    </DashboardSessionProvider>
  );
}
