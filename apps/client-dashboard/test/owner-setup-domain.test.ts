import { describe, expect, it } from "vitest";
import { onboardingSummarySchema } from "@lattelink/contracts-catalog";
import { requiresFirstTimeOwnerSetup, getOwnerSetupResumeStep } from "../src/features/onboarding/owner-setup-domain";

const base = onboardingSummarySchema.parse({ tenantId: "tenant", brandId: "brand", brandName: "Coffee", locationId: "location", locationName: "Main", marketLabel: "Test", status: "draft", readyForReview: false, checklist: [] });
const basics = [{ id: "business_profile_complete", label: "Store profile", passed: true }, { id: "store_operations_complete", label: "Store operations", passed: true }];
describe("permanent owner setup eligibility", () => {
  it("opens for a new brand and resumes the first unsaved step", () => {
    expect(requiresFirstTimeOwnerSetup({ ...base, ownerSetupRequired: true })).toBe(true);
    expect(getOwnerSetupResumeStep(base)).toBe(1);
    const saved = onboardingSummarySchema.parse({ ...base, checklist: basics, ownerSetupRequired: true });
    expect(requiresFirstTimeOwnerSetup(saved)).toBe(true);
    expect(getOwnerSetupResumeStep(saved)).toBe(2);
  });
  it("never reopens after server completion, regardless of release failure or configuration edits", () => {
    expect(requiresFirstTimeOwnerSetup({ ...base, status: "blocked", ownerSetupCompletedAt: "2026-10-14T12:00:00.000Z", ownerSetupRequired: true })).toBe(false);
    expect(requiresFirstTimeOwnerSetup({ ...base, ownerSetupRequired: false })).toBe(false);
  });
  it("does not onboard configured legacy merchants during a rolling deployment", () => {
    expect(requiresFirstTimeOwnerSetup(onboardingSummarySchema.parse({ ...base, status: "in_progress", checklist: basics }))).toBe(false);
    expect(requiresFirstTimeOwnerSetup({ ...base, status: "live" })).toBe(false);
  });
  it("does not require App Store readiness to finish first-time brand setup", () => {
    const summary = onboardingSummarySchema.parse({ ...base, checklist: basics, appIdentity: { locationId: "location", appName: "Coffee", displayName: "Coffee", readiness: { ready: false, missingRequiredFields: ["SKU", "description"] } } });
    expect(getOwnerSetupResumeStep(summary)).toBe(3);
  });
});
