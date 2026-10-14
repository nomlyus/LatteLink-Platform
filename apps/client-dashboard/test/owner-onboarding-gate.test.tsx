import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { onboardingSummarySchema } from "@lattelink/contracts-catalog";
import type { OwnerOnboardingLocation } from "../src/features/onboarding/owner-onboarding-state";
import { isOwnerOnboardingCompatibilityEntry } from "../src/features/onboarding/owner-onboarding-access";

const harness = vi.hoisted(() => ({
  path: "/", search: "", role: "owner" as "owner" | "manager" | "store",
  sessionStatus: "authenticated", locationStatus: "ready", locationError: null as string | null,
  onboarding: {
    status: "ready", scope: "owner-a", required: true, locations: [] as OwnerOnboardingLocation[],
    pending: false, error: null as string | null, mutationError: null,
    reload: vi.fn(async () => true), saveProfile: vi.fn(async () => true), saveLocation: vi.fn(async () => true),
    connectStripe: vi.fn(async () => true), refreshStripe: vi.fn(async () => true),
    setTeamComplete: vi.fn(async () => true), submit: vi.fn(async () => true)
  }
}));
vi.mock("next/navigation", () => ({ usePathname: () => harness.path, useSearchParams: () => new URLSearchParams(harness.search) }));
vi.mock("../src/features/auth/session-provider", () => ({ useDashboardSession: () => ({ status: harness.sessionStatus, session: { operator: { role: harness.role } } }) }));
vi.mock("../src/features/location/location-provider", () => ({ useDashboardLocation: () => ({ status: harness.locationStatus, error: harness.locationError, hasCapability: () => true, loadAvailableLocations: vi.fn(async () => []) }) }));
vi.mock("../src/features/onboarding/use-owner-onboarding", () => ({ useOwnerOnboarding: () => harness.onboarding }));
import { OwnerOnboardingGate } from "../src/features/onboarding/components/OwnerOnboardingGate";

function renderGate() { return renderToStaticMarkup(<OwnerOnboardingGate><p>Protected dashboard content</p></OwnerOnboardingGate>); }
beforeEach(() => {
  harness.path = "/"; harness.search = ""; harness.role = "owner"; harness.sessionStatus = "authenticated";
  harness.locationStatus = "ready"; harness.locationError = null;
  harness.onboarding.status = "ready"; harness.onboarding.required = true; harness.onboarding.error = null;
  harness.onboarding.locations = [{
    summary: onboardingSummarySchema.parse({ tenantId: "tenant-a", brandId: "brand-a", brandName: "Coffee", locationId: "a", locationName: "Downtown", marketLabel: "Detroit", status: "in_progress", readyForReview: false, ownerSetupRequired: true, checklist: [] }),
    config: { locationId: "a", locationName: "Downtown", storeName: "Coffee", hours: "Daily 8–4", taxRateBasisPoints: 600, pickupInstructions: "Counter", capabilities: { menu: { source: "platform_managed" }, operations: { fulfillmentMode: "staff", dashboardEnabled: true, liveOrderTrackingEnabled: true }, loyalty: { visible: true } } }
  }];
});
describe("mandatory owner setup", () => {
  it.each(["/", "/orders", "/menu", "/settings", "/team", "/cards", "/discounts"])("blocks incomplete owners on %s", (path) => {
    harness.path = path;
    const html = renderGate();
    expect(html).toContain('role="dialog"');
    expect(html).not.toContain("Protected dashboard content");
    expect(html).not.toContain("Finish later");
  });
  it("unlocks only after authoritative setup state says completion is not required", () => {
    harness.onboarding.required = false;
    expect(renderGate()).toContain("Protected dashboard content");
  });
  it.each(["loading", "error"])("fails closed when the setup check is %s", (status) => {
    harness.onboarding.status = status;
    harness.onboarding.error = status === "error" ? "Setup could not be checked" : null;
    expect(renderGate()).not.toContain("Protected dashboard content");
  });
  it("fails closed when location authorization could not be resolved", () => {
    harness.locationStatus = "error"; harness.locationError = "Location check failed";
    expect(renderGate()).toContain("Location check failed");
    expect(renderGate()).not.toContain("Protected dashboard content");
  });
  it.each(["manager", "store"] as const)("does not apply owner setup to %s", (role) => {
    harness.role = role;
    expect(renderGate()).toContain("Protected dashboard content");
  });
  it("preserves signed-out entry", () => {
    harness.sessionStatus = "signed-out";
    expect(renderGate()).toContain("Protected dashboard content");
  });
  it.each(["/invites", "/onboarding"])("preserves the %s completion entry", (path) => {
    harness.path = path;
    expect(renderGate()).toContain("Protected dashboard content");
  });
  it("preserves the Google callback without permitting query-based dashboard bypass", () => {
    harness.search = "google_auth_callback=1";
    expect(renderGate()).toContain("Protected dashboard content");
    harness.path = "/orders";
    expect(renderGate()).not.toContain("Protected dashboard content");
  });
  it("allows the sample preview only in development", () => {
    expect(isOwnerOnboardingCompatibilityEntry("/dev/onboarding", "", true)).toBe(true);
    expect(isOwnerOnboardingCompatibilityEntry("/dev/onboarding", "", false)).toBe(false);
  });
});
