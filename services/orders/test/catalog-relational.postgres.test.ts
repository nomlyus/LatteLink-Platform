import { randomUUID } from "node:crypto";
import type { FastifyBaseLogger } from "fastify";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { DEFAULT_APP_CONFIG_FULFILLMENT } from "@lattelink/contracts-catalog";
import { createPostgresDb, runMigrations } from "@lattelink/persistence";
import { createOrder, createQuote, type OrderServiceDeps } from "../src/service.js";
import { createOrdersRepository, type OrdersRepository } from "../src/repository.js";

const databaseUrl = process.env.PERSISTENCE_TEST_DATABASE_URL;
const describeWithPostgres = databaseUrl ? describe : describe.skip;

const locationId = "orders-relational-location";
const brandId = "orders-relational-brand";
const itemId = "relational-espresso";
const hiddenItemId = "relational-hidden";
const unavailableItemId = "relational-unavailable";
const staleJsonItemId = "relational-stale-json";
const userId = "123e4567-e89b-12d3-a456-426614174100";
const secondUserId = "123e4567-e89b-12d3-a456-426614174101";

function createLoggerMock(): FastifyBaseLogger {
  const logger = {
    level: "info",
    fatal: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
    trace: vi.fn(),
    silent: vi.fn(),
    child: vi.fn()
  } as unknown as FastifyBaseLogger;
  (logger.child as unknown as ReturnType<typeof vi.fn>).mockReturnValue(logger);
  return logger;
}

function openStoreConfig(location: string) {
  return {
    locationId: location,
    hoursText: "Daily · 7:00 AM - 6:00 PM",
    isOpen: true,
    nextOpenAt: null,
    prepEtaMinutes: 12,
    taxRateBasisPoints: 600,
    pickupInstructions: "Pickup at the order counter."
  };
}

describeWithPostgres("Orders against the relational catalog (PostgreSQL)", () => {
  const schema = `test_orders_relational_${randomUUID().replaceAll("-", "")}`;
  const baseDb = databaseUrl ? createPostgresDb(databaseUrl) : undefined;
  const schemaDatabaseUrl = databaseUrl ? new URL(databaseUrl) : undefined;
  if (schemaDatabaseUrl) {
    schemaDatabaseUrl.search = `?options=${encodeURIComponent(`-c search_path=${schema}`)}`;
  }
  const db = schemaDatabaseUrl ? createPostgresDb(schemaDatabaseUrl.toString()) : undefined;
  const originalDatabaseUrl = process.env.DATABASE_URL;
  let repository: OrdersRepository;
  let deps: OrderServiceDeps;

  beforeAll(async () => {
    await baseDb!.schema.createSchema(schema).execute();
    await db!.executeQuery({
      sql: `
        CREATE TABLE kysely_migration (name VARCHAR(255) NOT NULL PRIMARY KEY, timestamp VARCHAR(255) NOT NULL);
        CREATE TABLE kysely_migration_lock (id VARCHAR(255) NOT NULL PRIMARY KEY, is_locked INTEGER NOT NULL DEFAULT 0);
        INSERT INTO kysely_migration_lock (id, is_locked) VALUES ('migration_lock', 0);
      `,
      parameters: []
    } as never);
    await runMigrations(db!);

    await db.insertInto("catalog_menu_categories").values({
      brand_id: brandId,
      location_id: locationId,
      category_id: "relational-category",
      title: "Drinks",
      description: "",
      visible: true,
      sort_order: 0
    }).execute();

    const staleGroups = [{
      id: "stale",
      label: "Stale group",
      selectionType: "single",
      required: true,
      minSelections: 1,
      maxSelections: 1,
      options: [{ id: "stale-option", label: "Stale", priceDeltaCents: 900 }]
    }];

    await db.insertInto("catalog_menu_items").values([
      {
        brand_id: brandId,
        location_id: locationId,
        item_id: itemId,
        category_id: "relational-category",
        name: "Relational Espresso",
        description: "",
        image_url: null,
        price_cents: 500,
        badge_codes_json: JSON.stringify([]),
        customization_groups_json: JSON.stringify([]),
        visible: true,
        available: true,
        featured: false,
        sort_order: 0
      },
      {
        brand_id: brandId,
        location_id: locationId,
        item_id: hiddenItemId,
        category_id: "relational-category",
        name: "Hidden Espresso",
        description: "",
        image_url: null,
        price_cents: 700,
        badge_codes_json: JSON.stringify([]),
        customization_groups_json: JSON.stringify([]),
        visible: false,
        available: true,
        featured: false,
        sort_order: 1
      },
      {
        brand_id: brandId,
        location_id: locationId,
        item_id: unavailableItemId,
        category_id: "relational-category",
        name: "Unavailable Espresso",
        description: "",
        image_url: null,
        price_cents: 800,
        badge_codes_json: JSON.stringify([]),
        customization_groups_json: JSON.stringify([]),
        visible: true,
        available: false,
        featured: false,
        sort_order: 2
      },
      {
        brand_id: brandId,
        location_id: locationId,
        item_id: staleJsonItemId,
        category_id: "relational-category",
        name: "Relational No Modifiers",
        description: "",
        image_url: null,
        price_cents: 300,
        badge_codes_json: JSON.stringify([]),
        customization_groups_json: JSON.stringify(staleGroups),
        visible: true,
        available: true,
        featured: false,
        sort_order: 3
      }
    ]).execute();

    await db.insertInto("catalog_menu_category_items").values([
      { brand_id: brandId, location_id: locationId, category_id: "relational-category", item_id: itemId, sort_order: 0 },
      { brand_id: brandId, location_id: locationId, category_id: "relational-category", item_id: hiddenItemId, sort_order: 1 },
      { brand_id: brandId, location_id: locationId, category_id: "relational-category", item_id: unavailableItemId, sort_order: 2 },
      { brand_id: brandId, location_id: locationId, category_id: "relational-category", item_id: staleJsonItemId, sort_order: 3 }
    ]).execute();

    await db.insertInto("catalog_modifier_groups").values([
      {
        brand_id: brandId,
        location_id: locationId,
        modifier_group_id: "size",
        label: "Size",
        description: "",
        source_group_id: null,
        display_style: null,
        selection_type: "single",
        required: true,
        min_selections: 1,
        max_selections: 1,
        sort_order: 0
      },
      {
        brand_id: brandId,
        location_id: locationId,
        modifier_group_id: "extras",
        label: "Extras",
        description: "",
        source_group_id: null,
        display_style: null,
        selection_type: "multiple",
        required: false,
        min_selections: 1,
        max_selections: 2,
        sort_order: 1
      }
    ]).execute();

    await db.insertInto("catalog_modifier_options").values([
      { brand_id: brandId, location_id: locationId, modifier_group_id: "size", option_id: "regular", label: "Regular", description: "", price_delta_cents: 0, is_default: true, available: true, display_style: null, sort_order: 0 },
      { brand_id: brandId, location_id: locationId, modifier_group_id: "size", option_id: "large", label: "Large", description: "", price_delta_cents: 100, is_default: false, available: true, display_style: null, sort_order: 1 },
      { brand_id: brandId, location_id: locationId, modifier_group_id: "extras", option_id: "light", label: "Light", description: "", price_delta_cents: -25, is_default: false, available: true, display_style: null, sort_order: 0 },
      { brand_id: brandId, location_id: locationId, modifier_group_id: "extras", option_id: "vanilla", label: "Vanilla", description: "", price_delta_cents: 50, is_default: true, available: true, display_style: null, sort_order: 1 },
      { brand_id: brandId, location_id: locationId, modifier_group_id: "extras", option_id: "syrup", label: "Syrup", description: "", price_delta_cents: 0, is_default: false, available: true, display_style: null, sort_order: 2 },
      { brand_id: brandId, location_id: locationId, modifier_group_id: "extras", option_id: "cocoa", label: "Cocoa", description: "", price_delta_cents: 20, is_default: false, available: false, display_style: null, sort_order: 3 }
    ]).execute();

    await db.insertInto("catalog_item_modifier_groups").values([
      { brand_id: brandId, location_id: locationId, item_id: itemId, modifier_group_id: "size", sort_order: 0, required_override: null, min_selections_override: null, max_selections_override: null },
      { brand_id: brandId, location_id: locationId, item_id: itemId, modifier_group_id: "extras", sort_order: 1, required_override: null, min_selections_override: null, max_selections_override: null }
    ]).execute();

    process.env.DATABASE_URL = schemaDatabaseUrl.toString();
    repository = await createOrdersRepository(createLoggerMock());
    const fetchMock = vi.fn<typeof fetch>().mockImplementation(async (input) => {
      const url = new URL(typeof input === "string" ? input : input.toString());
      if (url.pathname === "/v1/store/config") {
        return new Response(JSON.stringify(openStoreConfig(locationId)), { status: 200, headers: { "content-type": "application/json" } });
      }
      if (url.pathname === "/v1/notifications/internal/order-state") {
        return new Response("{}", { status: 200, headers: { "content-type": "application/json" } });
      }
      return new Response("{}", { status: 404, headers: { "content-type": "application/json" } });
    });
    vi.stubGlobal("fetch", fetchMock);

    deps = {
      repository,
      catalogBaseUrl: "http://catalog.test",
      paymentsBaseUrl: "http://payments.test",
      loyaltyBaseUrl: "http://loyalty.test",
      notificationsBaseUrl: "http://notifications.test",
      getFulfillmentConfig: async () => ({ ...DEFAULT_APP_CONFIG_FULFILLMENT }),
      logger: createLoggerMock()
    };
  });

  afterAll(async () => {
    await repository.close();
    await db.destroy();
    await baseDb.schema.dropSchema(schema).cascade().execute();
    await baseDb.destroy();
    if (originalDatabaseUrl === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = originalDatabaseUrl;
    vi.unstubAllGlobals();
  });

  const validCustomization = {
    selectedOptions: [
      { groupId: "size", optionId: "regular" },
      { groupId: "extras", optionId: "light" }
    ],
    notes: ""
  };

  async function quote(input: { itemId: string; quantity?: number; customization?: typeof validCustomization }) {
    return createQuote({
      input: {
        locationId,
        pointsToRedeem: 0,
        items: [{ itemId: input.itemId, quantity: input.quantity ?? 1, customization: input.customization ?? { selectedOptions: [], notes: "" } }]
      },
      deps
    });
  }

  it("uses relational catalog state for authoritative quote validation and pricing", async () => {
    const priced = await quote({ itemId, quantity: 2, customization: validCustomization });
    expect("error" in priced).toBe(false);
    if ("error" in priced) throw new Error(priced.error.code);
    expect(priced.quote.items[0]).toMatchObject({ itemId, unitPriceCents: 475, lineTotalCents: 950 });
    expect(priced.quote.subtotal.amountCents).toBe(950);
    expect(priced.quote.tax.amountCents).toBe(57);
    expect(priced.quote.total.amountCents).toBe(1007);

    const defaulted = await quote({ itemId, customization: { selectedOptions: [{ groupId: "size", optionId: "regular" }, { groupId: "extras", optionId: "vanilla" }], notes: "" } });
    expect("error" in defaulted).toBe(false);

    const rejected = async (customization: typeof validCustomization, code = "INVALID_CUSTOMIZATION") => {
      const result = await quote({ itemId, customization });
      expect(result).toMatchObject({ error: { code } });
    };
    await rejected({ selectedOptions: [] });
    await rejected({ selectedOptions: [{ groupId: "missing", optionId: "regular" }] });
    await rejected({ selectedOptions: [{ groupId: "size", optionId: "regular" }, { groupId: "extras", optionId: "missing" }] });
    await rejected({ selectedOptions: [{ groupId: "size", optionId: "regular" }, { groupId: "extras", optionId: "cocoa" }] });
    await rejected({ selectedOptions: [{ groupId: "size", optionId: "regular" }] });
    await rejected({ selectedOptions: [{ groupId: "size", optionId: "regular" }, { groupId: "extras", optionId: "light" }, { groupId: "extras", optionId: "vanilla" }, { groupId: "extras", optionId: "syrup" }] });
    await rejected({ selectedOptions: [{ groupId: "size", optionId: "regular" }, { groupId: "size", optionId: "large" }, { groupId: "extras", optionId: "light" }] });

    expect(await quote({ itemId: hiddenItemId })).toMatchObject({ error: { code: "MENU_ITEM_NOT_FOUND" } });
    expect(await quote({ itemId: unavailableItemId })).toMatchObject({ error: { code: "MENU_ITEM_UNAVAILABLE" } });
    expect(await quote({ itemId: staleJsonItemId, customization: { selectedOptions: [{ groupId: "stale", optionId: "stale-option" }], notes: "" } })).toMatchObject({ error: { code: "INVALID_CUSTOMIZATION" } });
    const staleCatalog = await repository.getCatalogItemsForQuote(locationId, [staleJsonItemId]);
    expect(staleCatalog.get(staleJsonItemId)?.customizationGroups).toEqual([]);
  });

  it("keeps historical quote and order snapshots after catalog edits", async () => {
    const initial = await quote({ itemId, quantity: 2, customization: validCustomization });
    expect("error" in initial).toBe(false);
    if ("error" in initial) throw new Error(initial.error.code);
    await repository.saveQuote(initial.quote);
    const created = await createOrder({
      input: { quoteId: initial.quote.quoteId, quoteHash: initial.quote.quoteHash },
      requestId: "relational-catalog-order",
      requestUserContext: { userId },
      deps
    });
    expect("error" in created).toBe(false);
    if ("error" in created) throw new Error(created.error.code);

    await db.updateTable("catalog_menu_items").set({ name: "Renamed Espresso", price_cents: 900 }).where("location_id", "=", locationId).where("item_id", "=", itemId).execute();
    await db.updateTable("catalog_modifier_options").set({ price_delta_cents: 125 }).where("location_id", "=", locationId).where("modifier_group_id", "=", "extras").where("option_id", "=", "light").execute();

    const current = await quote({ itemId, quantity: 1, customization: validCustomization });
    expect("error" in current).toBe(false);
    if ("error" in current) throw new Error(current.error.code);
    expect(current.quote.items[0]).toMatchObject({ itemName: "Renamed Espresso", unitPriceCents: 1025 });

    const historical = await repository.getOrder(created.order.id);
    expect(historical?.items[0]).toMatchObject({
      itemName: "Relational Espresso",
      unitPriceCents: 475,
      lineTotalCents: 950,
      customization: {
        selectedOptions: expect.arrayContaining([
          expect.objectContaining({ optionId: "regular", priceDeltaCents: 0 }),
          expect.objectContaining({ optionId: "light", priceDeltaCents: -25 })
        ])
      }
    });
    expect(await repository.getOrderUserId(created.order.id)).toBe(userId);

    const second = await quote({ itemId, customization: { selectedOptions: [{ groupId: "size", optionId: "large" }, { groupId: "extras", optionId: "vanilla" }], notes: "" } });
    expect("error" in second).toBe(false);
    if ("error" in second) throw new Error(second.error.code);
    await repository.saveQuote(second.quote);
    const secondOrder = await createOrder({
      input: { quoteId: second.quote.quoteId, quoteHash: second.quote.quoteHash },
      requestId: "relational-catalog-order-2",
      requestUserContext: { userId: secondUserId },
      deps
    });
    expect("error" in secondOrder).toBe(false);
  });
});
