import { randomUUID } from "node:crypto";
import Fastify from "fastify";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createPostgresDb, runMigrations, type PersistenceDb } from "@lattelink/persistence";
import { appConfigSchema } from "@lattelink/contracts-catalog";
import { buildApp } from "../src/app.js";
import { createCatalogRepository, type CatalogRepository } from "../src/repository.js";
import { isCustomerLocationLaunchable } from "../src/mobile-brand-bootstrap.js";
import { readPublicLocationSnapshot } from "../src/public-location-snapshot.js";

const databaseUrl = process.env.PERSISTENCE_TEST_DATABASE_URL;

describe.skipIf(!databaseUrl)("public configuration snapshot (PostgreSQL)", () => {
  const schema = `test_public_snapshot_${randomUUID().replaceAll("-", "")}`;
  const originalDatabaseUrl = process.env.DATABASE_URL;
  let db: PersistenceDb;
  let baseDb: PersistenceDb;
  let repository: CatalogRepository;
  let app: Awaited<ReturnType<typeof buildApp>>;
  let brandId: string;
  let locationId: string;

  beforeAll(async () => {
    baseDb = createPostgresDb(databaseUrl!);
    await baseDb.schema.createSchema(schema).execute();
    const scoped = new URL(databaseUrl!);
    scoped.searchParams.set("options", `-c search_path=${schema}`);
    process.env.DATABASE_URL = scoped.toString();
    db = createPostgresDb(scoped.toString());
    // Kysely's migration-table discovery spans schemas; initialize these explicitly
    // so concurrent PostgreSQL suites cannot mistake another test schema for ours.
    await db.schema.createTable("kysely_migration")
      .addColumn("name", "varchar(255)", (column) => column.primaryKey())
      .addColumn("timestamp", "varchar(255)", (column) => column.notNull()).execute();
    await db.schema.createTable("kysely_migration_lock")
      .addColumn("id", "varchar(255)", (column) => column.primaryKey())
      .addColumn("is_locked", "integer", (column) => column.notNull().defaultTo(0)).execute();
    await db.insertInto("kysely_migration_lock").values({ id: "migration_lock", is_locked: 0 }).execute();
    await runMigrations(db);
    repository = await createCatalogRepository(Fastify({ logger: false }).log);
    const created = await repository.createInternalClient({
      clientName: "Snapshot Coffee", locationName: "Main", marketLabel: "Test",
      ownerEmail: "snapshot@example.test"
    });
    brandId = created.onboarding.brandId;
    locationId = created.locationId;
    await repository.updateInternalLocationPaymentProfile(locationId, {
      locationId, stripeAccountId: "acct_snapshot", stripeAccountType: "express",
      stripeOnboardingStatus: "completed", stripeDetailsSubmitted: true,
      stripeChargesEnabled: true, stripePayoutsEnabled: true
    });
    await db.updateTable("catalog_onboarding_progress").set({
      owner_invited: true, owner_activated: true, business_profile_complete: true,
      store_operations_complete: true, menu_ready: false, team_configured_or_skipped: true,
      test_order_completed: true, admin_launch_approved: true, live_at: new Date().toISOString()
    }).where("location_id", "=", locationId).execute();
    await db.updateTable("catalog_app_identity_profiles").set({ admin_override_ready: true })
      .where("location_id", "=", locationId).execute();
    await db.updateTable("catalog_mobile_release_profiles").set({ status: "ready_for_launch" })
      .where("location_id", "=", locationId).execute();
    app = await buildApp();
  }, 30_000);

  afterAll(async () => {
    await app?.close();
    await repository?.close();
    await db?.destroy();
    await baseDb?.schema.dropSchema(schema).cascade().execute();
    await baseDb?.destroy();
    if (originalDatabaseUrl === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = originalDatabaseUrl;
  });

  async function legacyDecision() {
    const client = await db.selectFrom("catalog_clients").selectAll().where("brand_id", "=", brandId).executeTakeFirstOrThrow();
    const location = await db.selectFrom("catalog_client_locations").selectAll().where("location_id", "=", locationId).executeTakeFirstOrThrow();
    return isCustomerLocationLaunchable({
      brand: { tenantId: client.tenant_id, brandId, displayName: client.client_name },
      membership: { tenantId: location.tenant_id, brandId: location.brand_id, locationId,
        locationName: location.location_name, marketLabel: location.market_label,
        timezone: location.timezone, primaryLocation: location.primary_location },
      onboarding: await repository.getInternalLocationOnboarding(locationId),
      locationSummary: await repository.getInternalLocationSummary(locationId),
      appConfig: await repository.getAppConfig(locationId), storeConfig: await repository.getStoreConfig(locationId)
    });
  }

  it("reads readiness inputs in one query without loading full menu/modifier definitions", async () => {
    const execute = vi.spyOn(db.getExecutor(), "executeQuery");
    try {
      const snapshot = await readPublicLocationSnapshot(db, brandId, locationId);
      expect(execute).toHaveBeenCalledTimes(1);
      expect(snapshot?.has_visible_menu_items).toBe(true);
      expect(snapshot?.client.brand_id).toBe(brandId);
      expect(snapshot?.location.location_id).toBe(locationId);
      expect(snapshot).not.toHaveProperty("menu");
    } finally { execute.mockRestore(); }
  });

  it("matches existing launch semantics and returns the same authoritative app/payment configuration", async () => {
    expect(await legacyDecision()).toBe(true);
    const context = await repository.getPublicCustomerLocation!(brandId, locationId);
    expect(context?.appConfig).toEqual(await repository.getAppConfig(locationId));
    expect(context?.storeConfig).toEqual(await repository.getStoreConfig(locationId));
    const response = await app.inject(`/v1/app-config?brandId=${brandId}&locationId=${locationId}`);
    expect(response.statusCode).toBe(200);
    expect(appConfigSchema.parse(response.json())).toEqual(context?.appConfig);
    expect((await repository.getMobileBrandBootstrap(brandId))?.status).toBe("ready");
  });

  it("fails closed for cross-brand, unknown, and malformed location requests", async () => {
    expect(await repository.getPublicCustomerLocation!("other-brand", locationId)).toBeUndefined();
    expect(await repository.getPublicCustomerLocation!(brandId, "missing-location")).toBeUndefined();
    expect((await app.inject(`/v1/app-config?brandId=other-brand&locationId=${locationId}`)).statusCode).toBe(404);
    expect((await app.inject(`/v1/app-config?locationId=${locationId}`)).statusCode).toBe(400);
  });

  it("rechecks every mutable progress gate immediately, without stale authorization", async () => {
    const flags = ["owner_invited", "owner_activated", "business_profile_complete", "store_operations_complete",
      "team_configured_or_skipped", "test_order_completed", "admin_launch_approved"] as const;
    for (const flag of flags) {
      await db.updateTable("catalog_onboarding_progress").set({ [flag]: false }).where("location_id", "=", locationId).execute();
      try {
        expect(await legacyDecision()).toBe(false);
        expect(await repository.getPublicCustomerLocation!(brandId, locationId)).toBeUndefined();
      } finally {
        await db.updateTable("catalog_onboarding_progress").set({ [flag]: true }).where("location_id", "=", locationId).execute();
      }
    }
    await db.updateTable("catalog_onboarding_progress").set({ blocked_reason: "Paused" }).where("location_id", "=", locationId).execute();
    try {
      expect(await legacyDecision()).toBe(false);
      expect((await app.inject(`/v1/app-config?brandId=${brandId}&locationId=${locationId}`)).statusCode).toBe(404);
    } finally {
      await db.updateTable("catalog_onboarding_progress").set({ blocked_reason: null }).where("location_id", "=", locationId).execute();
    }
  });

  it("preserves category visibility and the explicit menu-readiness override", async () => {
    await db.updateTable("catalog_menu_categories").set({ visible: false }).where("location_id", "=", locationId).execute();
    try {
      expect(await legacyDecision()).toBe(false);
      expect(await repository.getPublicCustomerLocation!(brandId, locationId)).toBeUndefined();
      await db.updateTable("catalog_onboarding_progress").set({ menu_ready: true }).where("location_id", "=", locationId).execute();
      expect(await legacyDecision()).toBe(true);
      expect(await repository.getPublicCustomerLocation!(brandId, locationId)).toBeDefined();
    } finally {
      await db.updateTable("catalog_onboarding_progress").set({ menu_ready: false }).where("location_id", "=", locationId).execute();
      await db.updateTable("catalog_menu_categories").set({ visible: true }).where("location_id", "=", locationId).execute();
    }
  });

  it("preserves identity, release, payment, live-state, and fulfillment gates", async () => {
    const changes: Array<() => Promise<() => Promise<unknown>>> = [
      async () => {
        await db.updateTable("catalog_app_identity_profiles").set({ admin_override_ready: false }).where("location_id", "=", locationId).execute();
        return () => db.updateTable("catalog_app_identity_profiles").set({ admin_override_ready: true }).where("location_id", "=", locationId).execute();
      },
      async () => {
        await db.updateTable("catalog_mobile_release_profiles").set({ status: "not_started" }).where("location_id", "=", locationId).execute();
        return () => db.updateTable("catalog_mobile_release_profiles").set({ status: "ready_for_launch" }).where("location_id", "=", locationId).execute();
      },
      async () => {
        const row = await db.selectFrom("catalog_payment_profiles").selectAll().where("location_id", "=", locationId).executeTakeFirstOrThrow();
        await db.deleteFrom("catalog_payment_profiles").where("location_id", "=", locationId).execute();
        return () => db.insertInto("catalog_payment_profiles").values(row).execute();
      },
      async () => {
        const row = await db.selectFrom("catalog_onboarding_progress").select("live_at").where("location_id", "=", locationId).executeTakeFirstOrThrow();
        await db.updateTable("catalog_onboarding_progress").set({ live_at: null }).where("location_id", "=", locationId).execute();
        return () => db.updateTable("catalog_onboarding_progress").set({ live_at: row.live_at }).where("location_id", "=", locationId).execute();
      },
      async () => {
        const row = await db.selectFrom("catalog_app_configs").select("app_config_json").where("location_id", "=", locationId).executeTakeFirstOrThrow();
        const config = appConfigSchema.parse(row.app_config_json);
        const changed = appConfigSchema.parse({ ...config, storeCapabilities: {
          ...config.storeCapabilities, operations: { ...config.storeCapabilities.operations, fulfillmentMode: "time_based" }
        } });
        await db.updateTable("catalog_app_configs").set({ app_config_json: changed }).where("location_id", "=", locationId).execute();
        return () => db.updateTable("catalog_app_configs").set({ app_config_json: row.app_config_json }).where("location_id", "=", locationId).execute();
      }
    ];
    for (const change of changes) {
      const restore = await change();
      try {
        expect(await legacyDecision()).toBe(false);
        expect(await repository.getPublicCustomerLocation!(brandId, locationId)).toBeUndefined();
      } finally { await restore(); }
    }
    expect(await repository.getPublicCustomerLocation!(brandId, locationId)).toBeDefined();
  });

  it("measures successful local HTTP-handler latency without a cached access decision", async () => {
    const durations: number[] = [];
    for (let index = 0; index < 20; index += 1) {
      const started = performance.now();
      expect((await app.inject(`/v1/app-config?brandId=${brandId}&locationId=${locationId}`)).statusCode).toBe(200);
      durations.push(performance.now() - started);
    }
    durations.sort((a, b) => a - b);
    console.info("Local PostgreSQL configuration handler (20 requests)", {
      p50Ms: Math.round(durations[9]!), p95Ms: Math.round(durations[18]!), maxMs: Math.round(durations[19]!)
    });
  });
});
