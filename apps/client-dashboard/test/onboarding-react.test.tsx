import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { onboardingSummarySchema, type AdminStoreConfig } from "@lattelink/contracts-catalog";
import { OnboardingWizard } from "../src/features/onboarding/components/OnboardingWizard";
import { OwnerSetupPanel } from "../src/features/settings/components/OwnerSetupPanel";
import type { useOnboarding } from "../src/features/onboarding/use-onboarding";
import type { OwnerOnboardingStep } from "../src/features/onboarding/owner-onboarding-state";
import type { OwnerOnboardingActions } from "../src/features/onboarding/components/OwnerOnboardingSteps";

const summary = onboardingSummarySchema.parse({ tenantId: "tenant-a", brandId: "brand-a", brandName: "Northside Coffee", locationId: "location-a", locationName: "Downtown", marketLabel: "Detroit, MI", status: "in_progress", readyForReview: false, ownerSetupRequired: true, checklist: [], paymentReadiness: { ready: false, onboardingState: "pending", missingRequiredFields: ["Stripe verification"] } });
const config: AdminStoreConfig = { locationId: "location-a", storeName: "Northside Coffee", locationName: "Downtown", hours: "Daily 8 AM - 4 PM", pickupInstructions: "Front counter", taxRateBasisPoints: 625, capabilities: { menu: { source: "platform_managed" }, operations: { fulfillmentMode: "staff", liveOrderTrackingEnabled: true, dashboardEnabled: true }, loyalty: { visible: true } } };
const state: OwnerOnboardingActions & { mutationError: string | null } = {
  locations: [{ summary, config }], pending: false, mutationError: null,
  saveProfile: vi.fn(async () => true), saveLocation: vi.fn(async () => true), connectStripe: vi.fn(async () => true),
  refreshStripe: vi.fn(async () => true), setTeamComplete: vi.fn(async () => true), submit: vi.fn(async () => true)
};
function wizard(step: OwnerOnboardingStep, canWrite = true, pending = false) {
  return renderToStaticMarkup(<OnboardingWizard brandName={summary.brandName} canWrite={canWrite} state={{ ...state, pending }} step={step} onStepChange={vi.fn()} onClose={vi.fn()} />);
}

describe("minimal owner onboarding", () => {
  it("keeps the four-step progress and accessible dialog in the authentication-style presentation", () => {
    for (const step of [0, 1, 2, 3, 4] as const) {
      const html = wizard(step);
      expect(html).toContain('aria-modal="true"');
      expect(html).toContain('aria-label="Onboarding progress"');
      expect(html).toContain('role="progressbar"');
      expect(html).toContain(`aria-valuenow="${step + 1}"`);
      expect(html).toContain(`width:${(step + 1) * 20}%`);
      expect(html.match(/<h[1-6] /g)).toHaveLength(1);
      expect(html).not.toContain("dash-wizard-step");
      expect(html).not.toContain("dash-modal__dialog");
    }
  });
  it("has no dismiss or finish-later controls, including while saving", () => {
    const html = wizard(1, true, true);
    expect(html).not.toContain("Finish later");
    expect(html).not.toContain("Finish onboarding later");
    expect(html).toContain('aria-hidden="true"');
    expect(html).toContain('aria-busy="true"');
  });
  it("requires owner entry even when provisioning values are populated", () => {
    const html = wizard(1);
    expect(html).toContain('role="dialog"');
    expect(html).toContain('name="locationName"');
    expect(html).toContain('name="address"');
    expect(html).toContain('name="timezone"');
    expect(html).toContain('name="taxPercent"');
    expect(html).not.toContain('value="Downtown"');
    expect(html).not.toContain('value="Daily 8 AM - 4 PM"');
    expect(html).not.toContain('name="pickupInstructions"');
    expect(html).not.toContain('name="storeName"');
  });
  it("renders missing location fields without adding a branding step", () => {
    const html = renderToStaticMarkup(<OnboardingWizard brandName="Coffee" canWrite state={{ ...state, locations: [{ summary, config: { ...config, hours: "" } }] }} step={1} onStepChange={vi.fn()} onClose={vi.fn()} />);
    expect(html).toContain('name="hours"');
    for (const field of ["pickupInstructions", "iconAssetUrl", "bundleIdentifier", "sku"]) expect(html).not.toContain(`name="${field}"`);
  });
  it("shows each provisioned location", () => {
    const html = renderToStaticMarkup(<OnboardingWizard brandName="Coffee" canWrite state={{ ...state, locations: [state.locations[0], { summary: { ...summary, locationId: "b", locationName: "Uptown" }, config: { ...config, locationId: "b", locationName: "Uptown" } }] }} step={1} onStepChange={vi.fn()} onClose={vi.fn()} />);
    expect(html).toContain("1 / 2");
    expect(html).toContain("Location");
    expect(html).not.toContain('aria-label="Previous location"');
    expect(html).not.toContain('aria-label="Next location"');
    expect(html).not.toContain("<select");
    expect(html.match(/<form /g)).toHaveLength(1);
  });
  it("shows Stripe readiness without collecting bank details", () => {
    expect(wizard(2)).toContain("Connect Stripe");
    expect(wizard(2)).not.toContain("Check Stripe status");
  });
  it("defers optional team setup with one action instead of leaving onboarding", () => {
    const html = wizard(3);
    expect(html).not.toContain('href="/team"');
    expect(html).toContain("Set up later");
    expect(html).not.toContain("Verify existing team");
    expect(html).toContain("invite your team after setup");
  });
  it("keeps one business action per screen", () => {
    for (const step of [0, 1, 2, 3, 4] as const) {
      const html = wizard(step);
      const footer = html.slice(html.indexOf("<footer"), html.indexOf("</footer>"));
      expect(footer.match(/<button /g)).toHaveLength(step === 0 ? 1 : 2);
      if (step > 0) expect(footer).toContain('aria-label="Back"');
      for (const label of ["Edit details", "Save location", "Check Stripe status", "Verify existing team", "Manage team"]) expect(html).not.toContain(label);
    }
  });
  it("collects personal and brand names once rather than on every location", () => {
    const html = wizard(0);
    for (const field of ["ownerName", "brandName", "customerFacingName"]) expect(html).toContain(`name="${field}"`);
    expect(html).not.toContain('value="Northside Coffee"');
    expect(wizard(1)).not.toContain('name="brandName"');
  });
  it("restores owner-confirmed values, not provisioning placeholders", () => {
    const savedSummary = { ...summary, ownerProfile: { ownerName: "Owner Name", brandName: "Business Company", customerFacingName: "Public Coffee" }, ownerDetailsConfirmedAt: "2026-10-14T12:00:00Z", ownerLocationDetails: { locationName: "Owner Location", address: "123 Test Street", timezone: "America/Detroit", hours: "Weekdays 8–5", taxRateBasisPoints: 625 } };
    const props = { brandName: "Business Company", canWrite: true, state: { ...state, locations: [{ summary: savedSummary, config }] }, onStepChange: vi.fn(), onClose: vi.fn() };
    const profile = renderToStaticMarkup(<OnboardingWizard {...props} step={0} />);
    for (const value of ["Owner Name", "Business Company", "Public Coffee"]) expect(profile).toContain(`value="${value}"`);
    const location = renderToStaticMarkup(<OnboardingWizard {...props} step={1} />);
    for (const value of ["Owner Location", "123 Test Street", "America/Detroit", "Weekdays 8–5", "6.25"]) expect(location).toContain(`value="${value}"`);
    expect(location).not.toContain('value="625"');
  });
  it("submits to Nomly without claiming publication and blocks incomplete review", () => {
    const html = wizard(4);
    expect(html).toContain("Submit to Nomly");
    expect(html).toContain("does not publish your app");
    expect(html).toContain('disabled=""');
  });
  it("shows pending, permission, and mutation failure states", () => {
    expect(wizard(4, true, true)).toContain("Submitting…");
    expect(wizard(1, false)).toContain("Owner configuration access is required");
    const html = renderToStaticMarkup(<OnboardingWizard brandName="Coffee" canWrite state={{ ...state, mutationError: "Save rejected" }} step={1} onStepChange={vi.fn()} onClose={vi.fn()} />);
    expect(html).toContain("Save rejected");
  });
  it("Settings retains direct editing/release information without reopening onboarding", () => {
    const setup: ReturnType<typeof useOnboarding> = {
      summary: onboardingSummarySchema.parse({ ...summary, ownerSetupCompletedAt: "2026-10-14T12:00:00.000Z", ownerSetupRequired: false, checklist: [{ id: "app_identity_ready", label: "App profile", passed: false, status: "pending", detail: "Missing support URL" }], mobileRelease: { locationId: "location-a", status: "ready_for_launch", buildNumber: "42" } }),
      status: "ready", error: null, scopeKey: "scope", buildJobs: { jobs: [] }, storeConfig: config,
      appConfig: null, appConfigError: null, storeConfigError: null, buildJobsError: null,
      isMutating: false, pendingOperation: null, mutationError: null, notice: null,
      reload: vi.fn(async () => true), clearMessages: vi.fn(), saveStoreDetails: vi.fn(async () => true),
      saveOwnerProfile: vi.fn(async () => true), saveOwnerLocation: vi.fn(async () => true), saveAppIdentity: vi.fn(async () => true), completeOwnerSetup: vi.fn(async () => true),
      submitForReview: vi.fn(async () => true), startStripeSetup: vi.fn(async () => true),
      openStripeDashboard: vi.fn(async () => true), refreshStripeStatus: vi.fn(async () => true)
    };
    const html = renderToStaticMarkup(<OwnerSetupPanel tab="launch" setup={setup} query="" canWrite pending={false} />);
    expect(html).toContain("Missing support URL");
    expect(html).toContain("Build 42");
    expect(html).not.toContain('role="dialog"');
  });
});
