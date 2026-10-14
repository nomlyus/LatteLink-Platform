import { clientPaymentProfileSchema } from "@lattelink/contracts-catalog";
import type { PersistenceDb } from "@lattelink/persistence";
import { assertOwnerSubmissionReady, assertOwnerSubmissionLocationSet } from "./owner-submission.js";

export async function submitOwnerSetupPostgres(db: PersistenceDb, locationId: string, requestedIds: string[]) {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      await attemptOwnerSubmission(db, locationId, requestedIds);
      return;
    } catch (error) {
      // Only replay PostgreSQL serialization conflicts: this transaction has no
      // provider calls/notification side effects and PostgreSQL rolled it back.
      if (attempt === 2 || !error || typeof error !== "object" || !("code" in error) || error.code !== "40001") throw error;
    }
  }
}

async function attemptOwnerSubmission(db: PersistenceDb, locationId: string, requestedIds: string[]) {
  // Serializable validation prevents a concurrent provisioning/configuration
  // change from committing a submission against a partially observed brand.
  await db.transaction().setIsolationLevel("serializable").execute(async (transaction) => {
    const membership = await transaction.selectFrom("catalog_client_locations").selectAll().where("location_id", "=", locationId).executeTakeFirst();
    if (!membership) return;
    const client = await transaction.selectFrom("catalog_clients").selectAll().where("tenant_id", "=", membership.tenant_id).forUpdate().executeTakeFirstOrThrow();
    const locations = await transaction.selectFrom("catalog_client_locations").selectAll().where("tenant_id", "=", client.tenant_id).orderBy("location_id").execute();
    const ids = locations.map((location) => location.location_id);
    assertOwnerSubmissionLocationSet(ids, requestedIds);
    const progress = await transaction.selectFrom("catalog_onboarding_progress").selectAll().where("tenant_id", "=", client.tenant_id).orderBy("location_id").forUpdate().execute();
    // A confirmed submission is idempotent; old basic-completion markers alone
    // do not bypass the new requirements.
    if (client.owner_setup_completed_at && progress.length === ids.length && progress.every((row) => row.submitted_for_review_at)) return;
    const stores = await transaction.selectFrom("catalog_store_configs").selectAll().where("location_id", "in", ids).execute();
    const payments = await transaction.selectFrom("catalog_payment_profiles").selectAll().where("location_id", "in", ids).execute();
    assertOwnerSubmissionReady(locations.map((location) => {
      const store = stores.find((row) => row.location_id === location.location_id);
      const payment = payments.find((row) => row.location_id === location.location_id);
      return {
        locationId: location.location_id,
        locationName: location.location_name,
        ownerDetailsConfirmedAt: location.owner_details_confirmed_at ? new Date(location.owner_details_confirmed_at).toISOString() : undefined,
        address: location.owner_address_text ?? undefined,
        timezone: location.timezone,
        storeName: store?.store_name,
        hours: store?.hours_text,
        taxRateBasisPoints: store?.tax_rate_basis_points,
        teamConfiguredOrSkipped: progress.find((row) => row.location_id === location.location_id)?.team_configured_or_skipped ?? false,
        paymentProfile: payment ? clientPaymentProfileSchema.parse(payment.payment_profile_json) : undefined
      };
    }), requestedIds, client.owner_profile_json);
    if (progress.length !== ids.length) throw new Error("A provisioned location is missing its onboarding record. Contact Nomly.");
    const now = new Date().toISOString();
    for (const row of progress) {
      await transaction.updateTable("catalog_onboarding_progress").set({
        business_profile_complete: true, store_operations_complete: true,
        submitted_for_review_at: row.submitted_for_review_at ?? now,
        status: row.status === "live" || row.status === "approved" ? row.status : "ready_for_review",
        updated_at: now
      }).where("location_id", "=", row.location_id).execute();
    }
    await transaction.updateTable("catalog_clients").set({
      owner_setup_completed_at: client.owner_setup_completed_at ?? now,
      status: client.status === "live" || client.status === "approved" ? client.status : "ready_for_review",
      updated_at: now
    }).where("tenant_id", "=", client.tenant_id).execute();
  });
}
