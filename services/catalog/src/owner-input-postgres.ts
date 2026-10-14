import { appConfigSchema, ownerOnboardingProfileSchema, type OperatorOnboardingUpdate } from "@lattelink/contracts-catalog";
import type { PersistenceDb } from "@lattelink/persistence";
import { OwnerSetupIncompleteError } from "./owner-setup.js";

export async function saveOwnerInputPostgres(db: PersistenceDb, locationId: string, input: OperatorOnboardingUpdate) {
  await db.transaction().execute(async (trx) => {
    const membership = await trx.selectFrom("catalog_client_locations").selectAll().where("location_id", "=", locationId).executeTakeFirstOrThrow();
    const client = await trx.selectFrom("catalog_clients").selectAll().where("tenant_id", "=", membership.tenant_id).forUpdate().executeTakeFirstOrThrow();
    const now = new Date().toISOString();
    if (input.ownerProfile) {
      const profile = input.ownerProfile;
      const locations = await trx.selectFrom("catalog_client_locations").select("location_id").where("tenant_id", "=", client.tenant_id).execute();
      const ids = locations.map((row) => row.location_id);
      const stores = await trx.selectFrom("catalog_store_configs").select("location_id").where("location_id", "in", ids).forUpdate().execute();
      const configs = await trx.selectFrom("catalog_app_configs").selectAll().where("location_id", "in", ids).forUpdate().execute();
      if (configs.length !== ids.length || stores.length !== ids.length) throw new OwnerSetupIncompleteError(["provisioned store and app configuration"]);
      await trx.updateTable("catalog_clients").set({ client_name: profile.brandName, owner_profile_json: JSON.stringify(profile), updated_at: now }).where("tenant_id", "=", client.tenant_id).execute();
      await trx.updateTable("catalog_store_configs").set({ store_name: profile.customerFacingName, updated_at: now }).where("location_id", "in", ids).execute();
      for (const row of configs) {
        const config = appConfigSchema.parse(row.app_config_json);
        await trx.updateTable("catalog_app_configs").set({ app_config_json: JSON.stringify({ ...config, brand: { ...config.brand, brandName: profile.customerFacingName } }), updated_at: now }).where("location_id", "=", row.location_id).execute();
      }
      return;
    }
    if (!input.ownerLocationDetails) return;
    const profile = ownerOnboardingProfileSchema.safeParse(client.owner_profile_json);
    if (!profile.success) throw new OwnerSetupIncompleteError(["your name and brand details"]);
    const details = input.ownerLocationDetails;
    await trx.selectFrom("catalog_store_configs").select("location_id").where("location_id", "=", locationId).forUpdate().executeTakeFirstOrThrow();
    const row = await trx.selectFrom("catalog_app_configs").selectAll().where("location_id", "=", locationId).forUpdate().executeTakeFirstOrThrow();
    const config = appConfigSchema.parse(row.app_config_json);
    await trx.updateTable("catalog_store_configs").set({ store_name: profile.data.customerFacingName, hours_text: details.hours, tax_rate_basis_points: details.taxRateBasisPoints, updated_at: now }).where("location_id", "=", locationId).executeTakeFirstOrThrow();
    await trx.updateTable("catalog_app_configs").set({ app_config_json: JSON.stringify({ ...config, brand: { ...config.brand, brandName: profile.data.customerFacingName, locationName: details.locationName } }), updated_at: now }).where("location_id", "=", locationId).execute();
    await trx.updateTable("catalog_client_locations").set({ location_name: details.locationName, timezone: details.timezone, owner_address_text: details.address, owner_details_confirmed_at: now, updated_at: now }).where("location_id", "=", locationId).execute();
  });
}
