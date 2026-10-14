import Fastify from "fastify";
import { afterEach, describe, expect, it, vi } from "vitest";
import { clientPaymentProfileSchema, operatorOnboardingUpdateSchema } from "@lattelink/contracts-catalog";
import { assertOwnerSubmissionReady, type OwnerSubmissionLocation } from "../src/owner-submission.js";
import { createCatalogRepository } from "../src/repository.js";

const profile = { ownerName: "Test Owner", brandName: "Coffee Company", customerFacingName: "Coffee" };
const payment = (locationId: string) => clientPaymentProfileSchema.parse({ locationId, stripeAccountId: "acct_submission", stripeOnboardingStatus: "completed", stripeChargesEnabled: true, stripePayoutsEnabled: true });
const row = (locationId: string): OwnerSubmissionLocation => ({ ownerDetailsConfirmedAt: "2026-10-14T12:00:00Z", address: "123 Test Street", timezone: "America/Detroit", locationId, locationName: locationId, storeName: "Coffee", hours: "Daily", taxRateBasisPoints: 600, teamConfiguredOrSkipped: true, paymentProfile: payment(locationId) });
afterEach(() => vi.unstubAllEnvs());

describe("owner onboarding submission", () => {
  it("accepts provisioned data without menu, assets, app listing, or pickup input", () => {
    expect(() => assertOwnerSubmissionReady([row("a"), row("b")], ["b", "a"], profile)).not.toThrow();
  });
  it("rejects omitted, duplicate, stale, or foreign location sets", () => {
    for (const ids of [["a"], ["a", "a"], ["a", "foreign"], ["a", "b", "c"]]) expect(() => assertOwnerSubmissionReady([row("a"), row("b")], ids)).toThrow("location list");
  });
  it("identifies incomplete payment, team, and location configuration", () => {
    expect(() => assertOwnerSubmissionReady([{ ...row("a"), hours: "", teamConfiguredOrSkipped: false, paymentProfile: undefined }], ["a"], profile)).toThrow("hours");
    expect(() => assertOwnerSubmissionReady([{ ...row("a"), paymentProfile: { ...payment("a"), stripePayoutsEnabled: false } }], ["a"], profile)).toThrow("Stripe");
    expect(() => assertOwnerSubmissionReady([{ ...row("a"), paymentProfile: payment("other") }], ["a"], profile)).toThrow("Stripe");
  });
  it("rejects invalid tax data and empty provisioning", () => {
    for (const taxRateBasisPoints of [-1, 10001, 6.5, undefined]) expect(() => assertOwnerSubmissionReady([{ ...row("a"), taxRateBasisPoints }], ["a"], profile)).toThrow("tax");
    expect(() => assertOwnerSubmissionReady([], [])).toThrow("location list");
  });
  it("requires an isolated distinct-location submission contract", () => {
    expect(operatorOnboardingUpdateSchema.safeParse({ submitOwnerSetup: true, locationIds: ["a"] }).success).toBe(true);
    for (const input of [{ submitOwnerSetup: true }, { locationIds: ["a"] }, { submitOwnerSetup: true, locationIds: ["a", "a"] }, { submitOwnerSetup: true, locationIds: ["a"], menuReady: true }]) expect(operatorOnboardingUpdateSchema.safeParse(input).success).toBe(false);
  });
  it("persists submission/completion together without requiring later launch work", async () => {
    vi.stubEnv("DATABASE_URL", ""); vi.stubEnv("NODE_ENV", "test");
    const app = Fastify({ logger: false });
    const repository = await createCatalogRepository(app.log);
    try {
      const client = await repository.createInternalClient({ clientName: "Submission Coffee", ownerEmail: "submission@example.test", locationName: "Main", marketLabel: "Test" });
      const input = { submitOwnerSetup: true as const, locationIds: [client.locationId] };
      await expect(repository.updateInternalLocationOnboarding(client.locationId, input)).rejects.toThrow("Complete");
      expect((await repository.getInternalLocationOnboarding(client.locationId))?.ownerSetupCompletedAt).toBeUndefined();
      await repository.updateInternalLocationPaymentProfile(client.locationId, payment(client.locationId));
      await repository.updateInternalLocationOnboarding(client.locationId, { teamConfiguredOrSkipped: true });
      await expect(repository.updateInternalLocationOnboarding(client.locationId, input)).rejects.toThrow("your name");
      await repository.updateInternalLocationOnboarding(client.locationId, { ownerProfile: profile });
      await expect(repository.updateInternalLocationOnboarding(client.locationId, input)).rejects.toThrow("owner-confirmed");
      await repository.updateInternalLocationOnboarding(client.locationId, { ownerLocationDetails: { locationName: "Downtown", address: "123 Test Street", timezone: "America/Detroit", hours: "Mon–Fri 8–5", taxRateBasisPoints: 625 } });
      const result = await repository.updateInternalLocationOnboarding(client.locationId, input);
      expect(result?.ownerSetupCompletedAt).toBeDefined();
      expect(result?.submittedForReviewAt).toBeDefined();
      expect(result?.ownerSetupRequired).toBe(false);
      expect(result?.appIdentity?.readiness.ready).toBe(false);
      expect((await repository.updateInternalLocationOnboarding(client.locationId, input))?.submittedForReviewAt).toBe(result?.submittedForReviewAt);
    } finally { await repository.close(); await app.close(); }
  });
});
