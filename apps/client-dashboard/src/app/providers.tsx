"use client";

import type { ReactNode } from "react";
import { DashboardSessionProvider } from "../features/auth/session-provider";
import { DashboardLocationProvider } from "../features/location/location-provider";

export function DashboardProviders({ children }: { children: ReactNode }) {
  return (
    <DashboardSessionProvider>
      <DashboardLocationProvider>{children}</DashboardLocationProvider>
    </DashboardSessionProvider>
  );
}
