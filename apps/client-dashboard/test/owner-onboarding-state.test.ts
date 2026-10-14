import { describe, expect, it } from "vitest";
import { adminStoreConfigSchema, onboardingSummarySchema } from "@lattelink/contracts-catalog";
import { canSubmitOwnerOnboarding, getOwnerOnboardingStep, hasProvisionedLocationDetails, type OwnerOnboardingLocation } from "../src/features/onboarding/owner-onboarding-state";

function row(id: string): OwnerOnboardingLocation {
  return { config: adminStoreConfigSchema.parse({ locationId: id, storeName: "Coffee", locationName: id, hours: "Daily", pickupInstructions: "Default", taxRateBasisPoints: 600 }),
    summary: onboardingSummarySchema.parse({ tenantId: "tenant", brandId: "brand", brandName: "Coffee", locationId: id, locationName: id, marketLabel: "Test", status: "draft", readyForReview: false, ownerProfile: { ownerName: "Owner", brandName: "Coffee", customerFacingName: "Coffee" }, ownerDetailsConfirmedAt: "2026-10-14T12:00:00Z", ownerLocationDetails: { locationName: id, address: "Test street", timezone: "America/Detroit", hours: "Daily", taxRateBasisPoints: 600 }, checklist: [], paymentReadiness: { ready: false, onboardingState: "pending", missingRequiredFields: ["Stripe"] } }) };
}
describe("minimal multi-location onboarding progress", () => {
  it("resumes only from owner-confirmed records", () => { expect(getOwnerOnboardingStep([row("a")])).toBe(2); });
  it("does not mistake provisioned defaults for confirmed input", () => {
    const value = row("a");
    delete value.summary.ownerProfile;
    expect(getOwnerOnboardingStep([value])).toBe(0);
    value.summary.ownerProfile = { ownerName: "Owner", brandName: "Coffee", customerFacingName: "Coffee" };
    delete value.summary.ownerDetailsConfirmedAt;
    expect(getOwnerOnboardingStep([value])).toBe(1);
  });
  it("requires missing details in any provisioned location", () => {
    const b = row("b"); b.config.hours = "";
    expect(getOwnerOnboardingStep([row("a"), b])).toBe(1);
    expect(canSubmitOwnerOnboarding([])).toBe(false);
  });
  it("requires payments and explicit team completion/skip at each location", () => {
    const rows = [row("a"), row("b")];
    for (const value of rows) value.summary.paymentReadiness = { ready: true, onboardingState: "completed", missingRequiredFields: [] };
    expect(getOwnerOnboardingStep(rows)).toBe(3);
    rows[0].summary.checklist = [{ id: "team_configured_or_skipped", label: "Team", passed: true, status: "complete", required: true, manual: false }];
    expect(canSubmitOwnerOnboarding(rows)).toBe(false);
    rows[1].summary.checklist = rows[0].summary.checklist;
    expect(getOwnerOnboardingStep(rows)).toBe(4);
    expect(canSubmitOwnerOnboarding(rows)).toBe(true);
  });
  it("does not require pickup input, menu, or app branding for progress", () => {
    expect(hasProvisionedLocationDetails({ ...row("a").config, pickupInstructions: "" })).toBe(true);
  });
});
