import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { onboardingSummarySchema, type AdminStoreConfig } from "@lattelink/contracts-catalog";
import { OnboardingPage } from "../src/features/onboarding/components/OnboardingPage";
import { OnboardingWizard } from "../src/features/onboarding/components/OnboardingWizard";
import type { useOnboarding } from "../src/features/onboarding/use-onboarding";

const summary = onboardingSummarySchema.parse({
  tenantId: "tenant-a",
  brandId: "brand-a",
  brandName: "Northside Coffee",
  locationId: "location-a",
  locationName: "Downtown",
  marketLabel: "Detroit, MI",
  status: "in_progress",
  readyForReview: false,
  checklist: [],
  updatedAt: "2026-09-01T12:00:00.000Z"
});

const storeConfig: AdminStoreConfig = {
  locationId: "location-a",
  storeName: "Northside Coffee",
  locationName: "Downtown",
  hours: "Daily 8 AM - 4 PM",
  pickupInstructions: "Pick up at the front counter.",
  taxRateBasisPoints: 625,
  capabilities: {
    menu: { source: "platform_managed" },
    operations: { fulfillmentMode: "staff", liveOrderTrackingEnabled: true, dashboardEnabled: true },
    loyalty: { visible: true }
  }
};

function onboardingState(overrides: Record<string, unknown> = {}) {
  return {
    status: "ready",
    summary,
    error: null,
    appConfig: null,
    storeConfig,
    buildJobs: { jobs: [] },
    appConfigError: null,
    storeConfigError: null,
    buildJobsError: null,
    pendingOperation: null,
    isMutating: false,
    mutationError: null,
    notice: null,
    scopeKey: "owner:location-a",
    clearMessages: vi.fn(),
    reload: vi.fn(async () => true),
    saveStoreDetails: vi.fn(async () => true),
    saveAppIdentity: vi.fn(async () => true),
    submitForReview: vi.fn(async () => true),
    startStripeSetup: vi.fn(async () => true),
    openStripeDashboard: vi.fn(async () => true),
    refreshStripeStatus: vi.fn(async () => true),
    ...overrides
  } as unknown as ReturnType<typeof useOnboarding>;
}

function renderPage(state: ReturnType<typeof useOnboarding>, options: { canWrite?: boolean; selectedLocationId?: string | "all" | null } = {}) {
  return renderToStaticMarkup(<OnboardingPage
    state={state}
    callbackNotice={null}
    selectedLocationName="Downtown"
    selectedLocationId={options.selectedLocationId ?? "location-a"}
    canWrite={options.canWrite ?? true}
    canManagePayments={options.canWrite ?? true}
    wizardOpen={false}
    wizardStep={1}
    onOpenWizard={vi.fn()}
    onCloseWizard={vi.fn()}
    onWizardStepChange={vi.fn()}
  />);
}

describe("React Onboarding surface", () => {
  it("renders loading, error, not-found, and All Locations states distinctly", () => {
    expect(renderPage(onboardingState({ status: "loading", summary: null }))).toContain("Loading the latest readiness");
    expect(renderPage(onboardingState({ status: "error", summary: null, error: "Gateway unavailable" }))).toContain("Gateway unavailable");
    expect(renderPage(onboardingState({ status: "not-found", summary: null }))).toContain("No launch setup found");
    expect(renderPage(onboardingState({ status: "scope-required", summary: null }), { selectedLocationId: "all" })).toContain("managed one location at a time");
  });

  it("renders authoritative readiness, release state, and a scoped setup entry point", () => {
    const approvedSummary = onboardingSummarySchema.parse({
      ...summary,
      status: "approved",
      readyForReview: true,
      mobileRelease: { locationId: "location-a", status: "ready_for_launch", buildNumber: "42" }
    });
    const html = renderPage(onboardingState({ summary: approvedSummary }));
    expect(html).toContain("Launch approved");
    expect(html).toContain("Ready for launch");
    expect(html).toContain("Build");
    expect(html).not.toContain("7 setup items left");
  });

  it("keeps payment mutations disabled for a read-only owner session", () => {
    const summaryWithPaymentNext = onboardingSummarySchema.parse({
      ...summary,
      checklist: [
        { id: "business_profile_complete", label: "Store profile", status: "complete", passed: true },
        { id: "store_operations_complete", label: "Hours and pickup", status: "complete", passed: true }
      ]
    });
    const html = renderToStaticMarkup(<OnboardingWizard
      summary={summaryWithPaymentNext}
      storeConfig={storeConfig}
      canWrite={false}
      state={onboardingState({ summary: summaryWithPaymentNext })}
      step={3}
      onStepChange={vi.fn()}
      onClose={vi.fn()}
    />);
    expect(html).toContain("Connect Stripe");
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>Connect Stripe<\/button>/);
  });

  it("renders a modal wizard and disables store edits without write capability", () => {
    const html = renderToStaticMarkup(<OnboardingWizard
      summary={summary}
      storeConfig={storeConfig}
      canWrite={false}
      state={onboardingState()}
      step={2}
      onStepChange={vi.fn()}
      onClose={vi.fn()}
    />);
    expect(html).toContain('role="dialog"');
    expect(html).toContain('aria-modal="true"');
    expect(html).toContain("Northside Coffee launch setup");
    expect(html).toContain("does not have store-write permission");
    expect(html).toContain('name="storeName"');
    expect(html).toContain("disabled=\"\"");
  });
});
