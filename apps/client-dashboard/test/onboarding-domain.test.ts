import { describe, expect, it } from "vitest";
import { onboardingSummarySchema } from "@lattelink/contracts-catalog";
import {
  buildAppIdentityUpdate,
  completeLaunchIntent,
  getOnboardingPrimaryAction,
  isOnboardingIncomplete,
  readLaunchIntent,
  stripOnboardingEntryParams
} from "../src/features/onboarding/onboarding-domain";

const summary = (passedIds: string[] = [], status: "in_progress" | "approved" | "live" = "in_progress") => onboardingSummarySchema.parse({
  tenantId: "tenant-a",
  brandId: "brand-a",
  brandName: "Northside Coffee",
  locationId: "location-a",
  locationName: "Downtown",
  marketLabel: "Detroit, MI",
  status,
  readyForReview: false,
  checklist: passedIds.map((id) => ({ id, label: id, status: "complete", passed: true })),
  updatedAt: "2026-09-01T12:00:00.000Z"
});

describe("onboarding readiness domain", () => {
  it.each(["in_progress", "ready_for_review"]) ("treats %s as incomplete", (status) => {
    expect(isOnboardingIncomplete(status)).toBe(true);
  });

  it.each(["approved", "live"]) ("treats %s as complete", (status) => {
    expect(isOnboardingIncomplete(status)).toBe(false);
  });

  it("uses the server checklist to select the next launch action", () => {
    expect(getOnboardingPrimaryAction(summary())).toEqual({ kind: "open-wizard", step: 2 });
    expect(getOnboardingPrimaryAction(summary(["business_profile_complete", "store_operations_complete"]))).toEqual({ kind: "stripe" });
    expect(getOnboardingPrimaryAction(summary([
      "business_profile_complete", "store_operations_complete", "payments_connected", "app_identity_ready"
    ]))).toEqual({ kind: "navigate", href: "/menu" });
  });

  it("normalizes app identity form fields without introducing empty optional values", () => {
    const form = new FormData();
    form.set("appName", " Northside App ");
    form.set("keywords", "coffee, pickup,, Detroit ");
    form.set("screenshotAssetUrls", "https://example.com/one.png\n\nhttps://example.com/two.png");
    form.set("assetMode", "provided");
    const update = buildAppIdentityUpdate(form);
    expect(update.appName).toBe("Northside App");
    expect(update.keywords).toEqual(["coffee", "pickup", "Detroit"]);
    expect(update.screenshotAssetUrls).toEqual(["https://example.com/one.png", "https://example.com/two.png"]);
    expect(update.assetMode).toBe("provided");
    expect(update.subtitle).toBeUndefined();
    expect(update.marketingUrl).toBeUndefined();
  });

  it("preserves unrelated query and fragment values while routing launch completion", () => {
    expect(readLaunchIntent("?campaign=summer&intent=launch")).toBe(true);
    expect(readLaunchIntent("?campaign=summer")).toBe(false);
    expect(stripOnboardingEntryParams("/onboarding", "?intent=launch&stripeReturn=1&keep=1", "#setup")).toBe("/onboarding?keep=1#setup");
    expect(completeLaunchIntent("?intent=launch&keep=1", "#home")).toBe("/?keep=1&launchComplete=1#home");
  });
});
