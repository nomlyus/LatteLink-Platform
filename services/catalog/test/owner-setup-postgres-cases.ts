import Fastify from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getMigrationProvenance, runMigrations, sql, type PersistenceDb } from "@lattelink/persistence";
import * as migration from "../../../packages/persistence/src/migrations/0060_owner_setup_completion.js";
import * as ownerInputMigration from "../../../packages/persistence/src/migrations/0061_owner_entered_onboarding.js";
import { createCatalogRepository, type CatalogRepository } from "../src/repository.js";

// Share the existing isolated Catalog fixture lifecycle. Independent suites
// changing DATABASE_URL and migration state concurrently can fall back to the
// memory repository, which would invalidate what these tests are proving.
export function registerOwnerSetupPostgresCases(db: PersistenceDb | undefined, scopedUrl: URL | undefined) {
describe("owner setup persistence and migration (PostgreSQL)", () => {
  const app = Fastify({ logger: false });
  let repository: CatalogRepository;
  const previousUrl = process.env.DATABASE_URL;

  beforeAll(async () => {
    await runMigrations(db!);
    process.env.DATABASE_URL = scopedUrl!.toString();
    repository = await createCatalogRepository(app.log);
    expect(repository.backend).toBe("postgres");
  });
  afterAll(async () => {
    if (previousUrl === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = previousUrl;
    await repository?.close();
    await app.close();
  });

  it("runs the full migration chain and has no pending migrations on retry", async () => {
    await runMigrations(db!);
    expect(await getMigrationProvenance(db!)).toMatchObject({ latestApplied: "0061_owner_entered_onboarding", pendingCount: 0 });
  });
  it("submits every provisioned location atomically and rolls back a mid-write failure", async () => {
    const created = await repository.createInternalClient({ clientName: "Submission Brand", locationName: "Main", marketLabel: "Test", ownerEmail: "submission-pg@example.test" });
    const client = await db!.selectFrom("catalog_clients").selectAll().where("tenant_id", "=", created.tenantId).executeTakeFirstOrThrow();
    const extra = "zz-submission-second-location";
    await repository.bootstrapInternalLocation({ brandId: client.brand_id, brandName: client.client_name, locationId: extra, locationName: "Second", marketLabel: "Test" });
    await db!.insertInto("catalog_client_locations").values({ tenant_id: client.tenant_id, brand_id: client.brand_id, location_id: extra, location_name: "Second", market_label: "Test", primary_location: false }).execute();
    const firstProgress = await db!.selectFrom("catalog_onboarding_progress").selectAll().where("location_id", "=", created.locationId).executeTakeFirstOrThrow();
    await db!.insertInto("catalog_onboarding_progress").values({ ...firstProgress, location_id: extra }).execute();
    const ids = [created.locationId, extra];
    await repository.updateInternalLocationOnboarding(created.locationId, { ownerProfile: { ownerName: "Test Owner", brandName: "Submission Company", customerFacingName: "Submission Coffee" } });
    await expect(repository.updateInternalLocationOnboarding(created.locationId, { submitOwnerSetup: true, locationIds: [created.locationId] })).rejects.toThrow("location list");
    for (const id of ids) {
      await repository.updateInternalLocationOnboarding(id, { ownerLocationDetails: { locationName: id === extra ? "Second" : "Main", address: "123 Test Street", timezone: "America/Detroit", hours: "Daily 8–5", taxRateBasisPoints: 625 } });
      await repository.updateInternalLocationPaymentProfile(id, { locationId: id, stripeAccountId: "acct_submissionPG", stripeAccountType: "express", stripeOnboardingStatus: "completed", stripeDetailsSubmitted: true, stripeChargesEnabled: true, stripePayoutsEnabled: true, stripeDashboardEnabled: false, country: "US", currency: "USD", cardEnabled: true, applePayEnabled: true, refundsEnabled: true, cloverPosEnabled: false });
      await repository.updateInternalLocationOnboarding(id, { teamConfiguredOrSkipped: true });
    }
    await sql`CREATE FUNCTION fail_owner_submission() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.location_id = 'zz-submission-second-location' AND NEW.submitted_for_review_at IS NOT NULL THEN RAISE EXCEPTION 'intentional submission failure'; END IF; RETURN NEW; END $$`.execute(db!);
    await sql`CREATE TRIGGER fail_owner_submission BEFORE UPDATE ON catalog_onboarding_progress FOR EACH ROW EXECUTE FUNCTION fail_owner_submission()`.execute(db!);
    try {
      await expect(repository.updateInternalLocationOnboarding(created.locationId, { submitOwnerSetup: true, locationIds: ids })).rejects.toThrow("intentional submission failure");
      for (const id of ids) {
        const summary = await repository.getInternalLocationOnboarding(id);
        expect(summary?.submittedForReviewAt).toBeUndefined();
        expect(summary?.ownerSetupCompletedAt).toBeUndefined();
      }
    } finally {
      await sql`DROP TRIGGER fail_owner_submission ON catalog_onboarding_progress`.execute(db!);
      await sql`DROP FUNCTION fail_owner_submission()`.execute(db!);
    }
    const [result, concurrent] = await Promise.all([
      repository.updateInternalLocationOnboarding(created.locationId, { submitOwnerSetup: true, locationIds: ids }),
      repository.updateInternalLocationOnboarding(created.locationId, { submitOwnerSetup: true, locationIds: ids })
    ]);
    expect(concurrent?.submittedForReviewAt).toBe(result?.submittedForReviewAt);
    expect(result?.ownerSetupCompletedAt).toBeDefined();
    expect(result?.submittedForReviewAt).toBeDefined();
    const second = await repository.getInternalLocationOnboarding(extra);
    expect(second?.submittedForReviewAt).toBe(result?.submittedForReviewAt);
    expect(second?.ownerSetupCompletedAt).toBe(result?.ownerSetupCompletedAt);
    expect((await repository.updateInternalLocationOnboarding(created.locationId, { submitOwnerSetup: true, locationIds: ids }))?.submittedForReviewAt).toBe(result?.submittedForReviewAt);
    expect(result?.appIdentity?.readiness.ready).toBe(false);
  });
  it("does not accept provisioning defaults as input and persists owner data atomically", async () => {
    const created = await repository.createInternalClient({ clientName: "Provisioned placeholder", locationName: "Location 1", marketLabel: "Test", ownerEmail: "owner-input-pg@example.test" });
    const profile = { ownerName: "Test Owner", brandName: "Business Company", customerFacingName: "Customer Coffee" };
    const details = { locationName: "Downtown", address: "123 Test Street", timezone: "America/New_York", hours: "Mon–Fri 8 AM–5 PM; weekends closed", taxRateBasisPoints: 625 };
    const before = await repository.getInternalLocationOnboarding(created.locationId);
    expect(before?.ownerProfile).toBeUndefined();
    expect(before?.ownerDetailsConfirmedAt).toBeUndefined();
    await expect(repository.updateInternalLocationOnboarding(created.locationId, { ownerLocationDetails: details })).rejects.toThrow("your name");
    await repository.updateInternalLocationOnboarding(created.locationId, { ownerProfile: profile });
    expect((await repository.getInternalLocationOnboarding(created.locationId))?.ownerProfile).toEqual(profile);
    expect((await repository.getAppConfig(created.locationId))?.brand.brandName).toBe(profile.customerFacingName);
    expect((await repository.getMobileBrandBootstrap(before!.brandId))?.brand.displayName).toBe(profile.customerFacingName);
    await sql`CREATE FUNCTION fail_owner_input() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.owner_details_confirmed_at IS NOT NULL THEN RAISE EXCEPTION 'intentional owner input failure'; END IF; RETURN NEW; END $$`.execute(db!);
    await sql`CREATE TRIGGER fail_owner_input BEFORE UPDATE ON catalog_client_locations FOR EACH ROW EXECUTE FUNCTION fail_owner_input()`.execute(db!);
    const storeBefore = await repository.getAdminStoreConfig(created.locationId);
    try {
      await expect(repository.updateInternalLocationOnboarding(created.locationId, { ownerLocationDetails: details })).rejects.toThrow("intentional owner input failure");
      expect(await repository.getAdminStoreConfig(created.locationId)).toEqual(storeBefore);
      expect((await repository.getInternalLocationOnboarding(created.locationId))?.ownerDetailsConfirmedAt).toBeUndefined();
    } finally {
      await sql`DROP TRIGGER fail_owner_input ON catalog_client_locations`.execute(db!);
      await sql`DROP FUNCTION fail_owner_input()`.execute(db!);
    }
    await repository.updateInternalLocationOnboarding(created.locationId, { ownerLocationDetails: details });
    const saved = await repository.getInternalLocationOnboarding(created.locationId);
    expect(saved?.ownerLocationDetails).toEqual(details);
    expect(saved?.ownerDetailsConfirmedAt).toBeDefined();
    await expect(db!.transaction().execute(async (transaction) => {
      await ownerInputMigration.down(transaction as never);
      await ownerInputMigration.up(transaction as never);
      await sql`SELECT 1 / 0`.execute(transaction);
    })).rejects.toThrow();
    expect((await repository.getInternalLocationOnboarding(created.locationId))?.ownerProfile).toEqual(profile);
    expect((await repository.getInternalLocationOnboarding(created.locationId))?.ownerLocationDetails).toEqual(details);
    expect(await repository.getAdminStoreConfig(created.locationId)).toMatchObject({ locationName: details.locationName, timezone: details.timezone, hours: details.hours, taxRateBasisPoints: 625, storeName: profile.customerFacingName });
    expect(await repository.getStoreConfig(created.locationId)).toMatchObject({ hoursText: details.hours, taxRateBasisPoints: 625 });
    const other = await repository.createInternalClient({ clientName: "Other", locationName: "Other", marketLabel: "Test", ownerEmail: "other-owner-pg@example.test" });
    expect((await repository.getInternalLocationOnboarding(other.locationId))?.ownerProfile).toBeUndefined();
  });
  it("rolls back invalid completion, persists once, and applies across all brand locations", async () => {
    const created = await repository.createInternalClient({ clientName: "New Setup Coffee", locationName: "Main", marketLabel: "Test", ownerEmail: "new-setup@example.test", hours: "Daily", pickupInstructions: "Counter" });
    await expect(repository.updateInternalLocationOnboarding(created.locationId, { completeOwnerSetup: true })).rejects.toThrow("Complete");
    expect((await repository.getInternalLocationOnboarding(created.locationId))?.ownerSetupCompletedAt).toBeUndefined();
    await repository.updateInternalLocationOnboarding(created.locationId, { businessProfileComplete: true, storeOperationsComplete: true });
    await repository.updateOperatorLocationAppIdentity(created.locationId, { appName: "Setup Coffee", displayName: "Setup Coffee" });
    await expect(repository.updateInternalLocationOnboarding(created.locationId, { completeOwnerSetup: true })).rejects.toThrow("owner-entered");
    await repository.updateInternalLocationOnboarding(created.locationId, { ownerProfile: { ownerName: "Owner", brandName: "Setup Coffee", customerFacingName: "Setup Coffee" } });
    await repository.updateInternalLocationOnboarding(created.locationId, { ownerLocationDetails: { locationName: "Main", address: "123 Test Street", timezone: "America/Detroit", hours: "Daily", taxRateBasisPoints: 600 } });
    const [first, second] = await Promise.all([
      repository.updateInternalLocationOnboarding(created.locationId, { completeOwnerSetup: true }),
      repository.updateInternalLocationOnboarding(created.locationId, { completeOwnerSetup: true })
    ]);
    expect(first?.ownerSetupCompletedAt).toBeDefined();
    expect(second?.ownerSetupCompletedAt).toBe(first?.ownerSetupCompletedAt);
    expect(first?.readyForReview).toBe(false);
    expect(first?.ownerSetupRequired).toBe(false);
    const client = await db!.selectFrom("catalog_clients").selectAll().where("tenant_id", "=", created.tenantId).executeTakeFirstOrThrow();
    const extra = "owner-setup-second-location";
    await repository.bootstrapInternalLocation({ brandId: client.brand_id, brandName: client.client_name, locationId: extra, locationName: "Second", marketLabel: "Test" });
    await db!.insertInto("catalog_client_locations").values({ tenant_id: client.tenant_id, brand_id: client.brand_id, location_id: extra, location_name: "Second", market_label: "Test", primary_location: false }).execute();
    await db!.insertInto("catalog_onboarding_progress").values({ tenant_id: client.tenant_id, location_id: extra, status: "draft", owner_invited: false, owner_activated: false, business_profile_complete: false, store_operations_complete: false, menu_ready: false, team_configured_or_skipped: false, test_order_completed: false, admin_launch_approved: false, submitted_for_review_at: null, approved_at: null, live_at: null, blocked_reason: null, notes: null }).execute();
    expect((await repository.getInternalLocationOnboarding(extra))?.ownerSetupCompletedAt).toBe(first?.ownerSetupCompletedAt);
    await repository.updateInternalLocationOnboarding(created.locationId, { businessProfileComplete: false, blockedReason: "Release delayed" });
    expect((await repository.getInternalLocationOnboarding(created.locationId))?.ownerSetupRequired).toBe(false);
  });
  it("backfills configured legacy brands but leaves unfinished brands eligible, with transactional rollback", async () => {
    const configured = await repository.createInternalClient({ clientName: "Legacy Configured", locationName: "Main", marketLabel: "Test", ownerEmail: "legacy-configured@example.test" });
    const fresh = await repository.createInternalClient({ clientName: "Legacy Unfinished", locationName: "Main", marketLabel: "Test", ownerEmail: "legacy-unfinished@example.test" });
    await repository.updateInternalLocationOnboarding(configured.locationId, { businessProfileComplete: true, storeOperationsComplete: true });
    await db!.transaction().execute(async (transaction) => { await migration.down(transaction as never); await migration.up(transaction as never); });
    const completed = await repository.getInternalLocationOnboarding(configured.locationId);
    expect(completed?.ownerSetupCompletedAt).toBeDefined();
    expect((await repository.getInternalLocationOnboarding(fresh.locationId))?.ownerSetupRequired).toBe(true);
    await expect(db!.transaction().execute(async (transaction) => {
      await migration.down(transaction as never);
      await migration.up(transaction as never);
      await sql`SELECT 1 / 0`.execute(transaction);
    })).rejects.toThrow();
    expect((await repository.getInternalLocationOnboarding(configured.locationId))?.ownerSetupCompletedAt).toBe(completed?.ownerSetupCompletedAt);
    await runMigrations(db!);
    expect((await getMigrationProvenance(db!)).pendingCount).toBe(0);
  });
});
}
