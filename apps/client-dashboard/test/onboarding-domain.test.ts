import { describe, expect, it } from "vitest";
import {
  buildAppIdentityUpdate,
  resolveOnboardingCompatibilityDestination,
  readLaunchIntent
} from "../src/features/onboarding/onboarding-domain";

describe("onboarding configuration and compatibility domain", () => {

  it("normalizes app identity form fields without introducing empty optional values", () => {
    const form = new FormData();
    form.set("appName", " Northside App ");
    form.set("bundleIdentifier", "us.user.chosen");
    form.set("sku", "user-chosen-sku");
    form.set("keywords", "coffee, pickup,, Detroit ");
    form.set("screenshotAssetUrls", "https://example.com/one.png\n\nhttps://example.com/two.png");
    form.set("assetMode", "provided");
    const update = buildAppIdentityUpdate(form);
    expect(update.appName).toBe("Northside App");
    expect(update).not.toHaveProperty("bundleIdentifier");
    expect(update).not.toHaveProperty("sku");
    expect(update.keywords).toEqual(["coffee", "pickup", "Detroit"]);
    expect(update.screenshotAssetUrls).toEqual(["https://example.com/one.png", "https://example.com/two.png"]);
    expect(update.assetMode).toBe("provided");
    expect(update.subtitle).toBeUndefined();
    expect(update.marketingUrl).toBeUndefined();
  });

  it("preserves unrelated query and fragment values while routing launch completion", () => {
    expect(readLaunchIntent("?campaign=summer&intent=launch")).toBe(true);
    expect(readLaunchIntent("?campaign=summer")).toBe(false);
    expect(resolveOnboardingCompatibilityDestination("?intent=launch&stripeReturn=1&keep=1", "#setup")).toBe("/?keep=1#setup");
    expect(resolveOnboardingCompatibilityDestination("?keep=1", "#home", true)).toBe("/?keep=1#home");
  });
  it("routes old setup links to Settings without exposing a modal entry", () => {
    expect(resolveOnboardingCompatibilityDestination("?keep=1", "#progress")).toBe("/settings?keep=1&tab=launch#progress");
  });
  it("routes Stripe returns and refresh compatibility to payment Settings", () => {
    expect(resolveOnboardingCompatibilityDestination("?stripeReturn=1&keep=1")).toBe("/settings?keep=1&tab=payments");
    expect(resolveOnboardingCompatibilityDestination("?stripeRefresh=1")).toBe("/settings?tab=payments");
  });
});
