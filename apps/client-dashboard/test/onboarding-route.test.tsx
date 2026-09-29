import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const harness = vi.hoisted(() => ({
  sessionStatus: "signed-out" as "loading" | "signed-out" | "authenticated",
  session: null as null | { operator: { operatorUserId: string; role: "owner" | "manager" | "store"; capabilities: string[] } },
  location: {
    selectedLocationId: null as string | "all" | null,
    selectedLocation: null as { locationName: string } | null,
    status: "idle" as "idle" | "loading" | "ready" | "error",
    hasCapability: () => false
  },
  onboarding: {
    status: "loading" as "loading" | "ready" | "not-found" | "error" | "scope-required",
    summary: null as null | Record<string, unknown>,
    scopeKey: "scope-a",
    isMutating: false,
    clearMessages: vi.fn(),
    reload: vi.fn(async () => true),
    saveStoreDetails: vi.fn(async () => true),
    saveAppIdentity: vi.fn(async () => true),
    submitForReview: vi.fn(async () => true),
    startStripeSetup: vi.fn(async () => true),
    openStripeDashboard: vi.fn(async () => true),
    refreshStripeStatus: vi.fn(async () => true)
  },
  replace: vi.fn(),
  search: ""
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: harness.replace }),
  useSearchParams: () => new URLSearchParams(harness.search)
}));
vi.mock("../src/features/auth/session-provider", () => ({ useDashboardSession: () => ({ status: harness.sessionStatus, session: harness.session }) }));
vi.mock("../src/features/location/location-provider", () => ({ useDashboardLocation: () => harness.location }));
vi.mock("../src/features/onboarding/use-onboarding", () => ({ useOnboarding: () => harness.onboarding }));
vi.mock("../src/components/dashboard/DashboardShell", () => ({
  DashboardShell: ({ children }: { children: React.ReactNode }) => <main>{children}</main>,
  DashboardShellLoading: () => <div>Dashboard loading</div>
}));
vi.mock("../src/app/ClientDashboardRoot", () => ({ ClientDashboardRoot: () => <div>Existing sign-in and invite compatibility</div> }));

import { OnboardingRoute } from "../src/features/onboarding/components/OnboardingRoute";

beforeEach(() => {
  harness.sessionStatus = "signed-out";
  harness.session = null;
  harness.location = { selectedLocationId: null, selectedLocation: null, status: "idle", hasCapability: () => false };
  harness.onboarding.status = "loading";
  harness.onboarding.summary = null;
  harness.search = "";
  vi.clearAllMocks();
});

describe("React Onboarding route ownership", () => {
  it("preserves the existing signed-out authentication and callback host", () => {
    expect(renderToStaticMarkup(<OnboardingRoute />)).toContain("Existing sign-in and invite compatibility");
    harness.search = "google_auth_callback=1&code=callback-code";
    expect(renderToStaticMarkup(<OnboardingRoute />)).toContain("Existing sign-in and invite compatibility");
  });

  it("keeps launch readiness owner-only", () => {
    harness.sessionStatus = "authenticated";
    harness.session = { operator: { operatorUserId: "manager-a", role: "manager", capabilities: ["store:read"] } };
    harness.location.status = "ready";
    harness.location.selectedLocationId = "location-a";
    expect(renderToStaticMarkup(<OnboardingRoute />)).toContain("Owner access required");
  });

  it("renders the location-specific scope requirement for All Locations", () => {
    harness.sessionStatus = "authenticated";
    harness.session = { operator: { operatorUserId: "owner-a", role: "owner", capabilities: ["store:read", "store:write"] } };
    harness.location.status = "ready";
    harness.location.selectedLocationId = "all";
    harness.onboarding.status = "scope-required";
    const html = renderToStaticMarkup(<OnboardingRoute />);
    expect(html).toContain("Choose one location");
    expect(html).toContain("Launch readiness is managed one location at a time");
  });

  it("keeps store operators on the React Orders destination", () => {
    harness.sessionStatus = "authenticated";
    harness.session = { operator: { operatorUserId: "store-a", role: "store", capabilities: ["orders:read"] } };
    const html = renderToStaticMarkup(<OnboardingRoute />);
    expect(html).toContain("Dashboard loading");
  });
});
