import Fastify from "fastify";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createCatalogRepository } from "../src/repository.js";
import { assertOwnerSetupComplete, OwnerSetupIncompleteError } from "../src/owner-setup.js";
import { operatorOnboardingUpdateSchema } from "@lattelink/contracts-catalog";
import { buildApp } from "../src/app.js";

afterEach(() => { vi.unstubAllEnvs(); });

describe("first-time owner setup", () => {
  it("requires saved basics, not Stripe, App Store metadata, or release approval", () => {
    expect(() => assertOwnerSetupComplete({ businessProfileComplete: true, storeOperationsComplete: true, storeName: "Coffee", hours: "Daily", pickupInstructions: "Counter", appName: "Coffee", displayName: "Coffee" })).not.toThrow();
    expect(() => assertOwnerSetupComplete({ businessProfileComplete: false, storeOperationsComplete: false })).toThrow(OwnerSetupIncompleteError);
  });
  it("does not accept reopening or a mixed completion/configuration mutation", () => {
    expect(operatorOnboardingUpdateSchema.safeParse({ completeOwnerSetup: false }).success).toBe(false);
    expect(operatorOnboardingUpdateSchema.safeParse({ completeOwnerSetup: true, businessProfileComplete: true }).success).toBe(false);
  });
  it("returns an actionable completion error through the Catalog API", async () => {
    vi.stubEnv("DATABASE_URL", "");
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("GATEWAY_INTERNAL_API_TOKEN", "owner-setup-test-gateway");
    const app = await buildApp();
    try {
      const headers = { "x-gateway-token": "owner-setup-test-gateway" };
      const created = await app.inject({ method: "POST", url: "/v1/catalog/internal/clients", headers, payload: { clientName: "Fresh Coffee", locationName: "Main", marketLabel: "Test", ownerEmail: "fresh-owner@example.test" } });
      expect(created.statusCode).toBe(200);
      const response = await app.inject({ method: "PATCH", url: `/v1/catalog/internal/locations/${created.json().locationId}/onboarding`, headers, payload: { completeOwnerSetup: true } });
      expect(response.statusCode).toBe(422);
      expect(response.json()).toMatchObject({ code: "OWNER_SETUP_INCOMPLETE", details: { missingFields: expect.arrayContaining(["store profile"]) } });
    } finally { await app.close(); }
  });
  it("persists completion once, survives config edits, and isolates brands", async () => {
    vi.stubEnv("DATABASE_URL", "");
    vi.stubEnv("NODE_ENV", "test");
    const app = Fastify({ logger: false });
    const repository = await createCatalogRepository(app.log);
    try {
      const a = await repository.createInternalClient({ clientName: "Setup Coffee", locationName: "Main", marketLabel: "Test", ownerEmail: "setup@example.test", hours: "Daily 8–4", pickupInstructions: "Counter" });
      const b = await repository.createInternalClient({ clientName: "Other Coffee", locationName: "Main", marketLabel: "Test", ownerEmail: "other@example.test" });
      expect(a.onboarding.ownerSetupRequired).toBe(true);
      await expect(repository.updateInternalLocationOnboarding(a.locationId, { completeOwnerSetup: true })).rejects.toThrow(OwnerSetupIncompleteError);
      expect((await repository.getInternalLocationOnboarding(a.locationId))?.ownerSetupCompletedAt).toBeUndefined();
      await repository.updateInternalLocationOnboarding(a.locationId, { businessProfileComplete: true, storeOperationsComplete: true });
      await repository.updateOperatorLocationAppIdentity(a.locationId, { appName: "Setup Coffee", displayName: "Setup Coffee" });
      await expect(repository.updateInternalLocationOnboarding(a.locationId, { completeOwnerSetup: true })).rejects.toThrow("owner-entered");
      await repository.updateInternalLocationOnboarding(a.locationId, { ownerProfile: { ownerName: "Owner", brandName: "Setup Coffee", customerFacingName: "Setup Coffee" } });
      await repository.updateInternalLocationOnboarding(a.locationId, { ownerLocationDetails: { locationName: "Main", address: "123 Test Street", timezone: "America/Detroit", hours: "Daily 8–4", taxRateBasisPoints: 600 } });
      const done = await repository.updateInternalLocationOnboarding(a.locationId, { completeOwnerSetup: true });
      expect(done?.ownerSetupCompletedAt).toBeDefined();
      expect(done?.ownerSetupRequired).toBe(false);
      expect(done?.appIdentity?.readiness.ready).toBe(false);
      expect((await repository.updateInternalLocationOnboarding(a.locationId, { completeOwnerSetup: true }))?.ownerSetupCompletedAt).toBe(done?.ownerSetupCompletedAt);
      await repository.updateInternalLocationOnboarding(a.locationId, { businessProfileComplete: false, blockedReason: "Release blocked" });
      expect((await repository.getInternalLocationOnboarding(a.locationId))?.ownerSetupRequired).toBe(false);
      expect((await repository.getInternalLocationOnboarding(b.locationId))?.ownerSetupRequired).toBe(true);
    } finally { await repository.close(); await app.close(); }
  });
});
