import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  buildDefaultCustomizationInput,
  menuResponseSchema,
  normalizeCustomizationGroups,
  priceMenuItemCustomization,
  type MenuItemCustomizationGroup,
  type MenuResponse
} from "@lattelink/contracts-catalog";
import { createPostgresDb, runMigrations, sql, type PersistenceDb } from "@lattelink/persistence";
import * as catalogRelationalMigration from "../../../packages/persistence/src/migrations/0053_catalog_relational_model.js";
import * as catalogModifierMetadataMigration from "../../../packages/persistence/src/migrations/0054_catalog_modifier_metadata.js";
import {
  deleteRelationalCategory,
  deleteRelationalModifierGroup,
  getRelationalAdminMenu,
  getRelationalPublicMenu,
  reorderRelationalCategories,
  replaceRelationalMenuFromExternal
} from "../src/menu-relational.js";
import { createCatalogRepository } from "../src/repository.js";

const databaseUrl = process.env.PERSISTENCE_TEST_DATABASE_URL;
const describeWithPostgres = databaseUrl ? describe : describe.skip;

type LegacyItemFixture = {
  itemId: string;
  categoryId: string;
  name: string;
  description: string;
  imageUrl: string | null;
  priceCents: number;
  badgeCodes: string[];
  visible: boolean;
  sortOrder: number;
  groups: unknown[];
};

const locationId = "catalog-migration-location";
const brandId = "catalog-migration-brand";

function legacyGroup(input: Record<string, unknown>) {
  return input;
}

const sharedMilk = legacyGroup({
  id: "milk",
  label: "Milk",
  description: "Choose a milk.",
  sourceGroupId: "legacy:milk",
  displayStyle: "chips",
  selectionType: "single",
  required: true,
  minSelections: 1,
  maxSelections: 1,
  sortOrder: 0,
  options: [
    { id: "whole", label: "Whole", description: "Whole milk", priceDeltaCents: 0, default: true, available: true, displayStyle: "default", sortOrder: 0 },
    { id: "oat", label: "Oat", priceDeltaCents: -75, default: false, available: false, displayStyle: "emphasis", sortOrder: 1 },
    { id: "almond", label: "Almond", priceDeltaCents: 0, default: false, available: true, sortOrder: 2 }
  ]
});

const sharedExtras = legacyGroup({
  id: "extras",
  label: "Extras",
  selectionType: "multi",
  required: false,
  minSelections: 1,
  maxSelections: 2,
  sortOrder: 1,
  options: [
    { id: "vanilla", label: "Vanilla", priceDeltaCents: 75, default: true, available: true, sortOrder: 0 },
    { id: "syrup", label: "Syrup", priceDeltaCents: 0, default: true, available: true, sortOrder: 1 },
    { id: "light", label: "Light", priceDeltaCents: -25, default: false, available: true, sortOrder: 2 },
    { id: "cocoa", label: "Cocoa", priceDeltaCents: 20, default: false, available: false, sortOrder: 3 }
  ]
});

const legacyBooleanGroup = legacyGroup({
  id: "lid",
  label: "Add a lid?",
  selectionType: "boolean",
  required: true,
  options: [
    { id: "yes", label: "Yes", priceDeltaCents: 0, default: true, available: true },
    { id: "no", label: "No", priceDeltaCents: 0, available: true, sortOrder: 1 }
  ]
});

const conflictingChoiceA = legacyGroup({
  id: "choice",
  label: "Milk Choice",
  selectionType: "single",
  required: false,
  options: [
    { id: "whole", label: "Whole", priceDeltaCents: 0, default: true, available: true }
  ]
});

const conflictingChoiceB = legacyGroup({
  id: "choice",
  label: "Size Choice",
  selectionType: "single",
  required: false,
  options: [
    { id: "small", label: "Small", priceDeltaCents: 0, default: true, available: true },
    { id: "large", label: "Large", priceDeltaCents: 100, available: true, sortOrder: 1 }
  ]
});

const legacyItems: LegacyItemFixture[] = [
  {
    itemId: "item-latte-a",
    categoryId: "category-drinks",
    name: "Duplicate Latte",
    description: "The visible duplicate-name item.",
    imageUrl: "https://assets.example.test/latte-a.jpg",
    priceCents: 650,
    badgeCodes: ["popular", "seasonal"],
    visible: true,
    sortOrder: 5,
    groups: [sharedMilk, sharedExtras, legacyBooleanGroup, conflictingChoiceA]
  },
  {
    itemId: "item-latte-b",
    categoryId: "category-drinks",
    name: "Duplicate Latte",
    description: "The hidden duplicate-name item.",
    imageUrl: null,
    priceCents: 700,
    badgeCodes: ["new"],
    visible: false,
    sortOrder: 2,
    groups: [sharedMilk, sharedExtras, conflictingChoiceB]
  },
  {
    itemId: "item-pastry",
    categoryId: "category-pastry",
    name: "Butter Croissant",
    description: "A pastry with no customization groups.",
    imageUrl: "https://assets.example.test/croissant.png",
    priceCents: 425,
    badgeCodes: [],
    visible: true,
    sortOrder: 1,
    groups: []
  },
  {
    itemId: "item-unusual",
    categoryId: "category-drinks",
    name: "Duplicate Latte",
    description: "An unusual but schema-valid legacy payload.",
    imageUrl: null,
    priceCents: 525,
    badgeCodes: ["limited"],
    visible: true,
    sortOrder: 9,
    groups: [
      legacyGroup({
        id: "seasoning",
        label: "Seasoning",
        selectionType: "multiple",
        options: [
          { id: "cinnamon", label: "Cinnamon", priceDeltaCents: 0, available: true },
          { id: "nutmeg", label: "Nutmeg", priceDeltaCents: 15, available: true, sortOrder: 1 }
        ]
      })
    ]
  }
];

function comparableGroup(group: MenuItemCustomizationGroup) {
  return {
    id: group.id,
    label: group.label,
    description: group.description ?? "",
    sourceGroupId: group.sourceGroupId,
    displayStyle: group.displayStyle,
    selectionType: group.selectionType,
    required: group.required ?? false,
    minSelections: group.minSelections ?? 0,
    maxSelections: group.maxSelections ?? 1,
    sortOrder: group.sortOrder ?? 0,
    options: group.options.map((option) => ({
      id: option.id,
      label: option.label,
      description: option.description ?? "",
      priceDeltaCents: option.priceDeltaCents,
      default: option.default ?? false,
      available: option.available ?? true,
      displayStyle: option.displayStyle,
      sortOrder: option.sortOrder ?? 0
    }))
  };
}

function comparableGroupWithoutId(group: MenuItemCustomizationGroup) {
  return Object.fromEntries(Object.entries(comparableGroup(group)).filter(([key]) => key !== "id"));
}

function buildExternalMenu(input: {
  groupLabel?: string;
  optionPriceCents?: number;
  includeCoconut?: boolean;
  removeOat?: boolean;
  includeGroup?: boolean;
  includeItemA?: boolean;
  includeItemB?: boolean;
  collisionGroups?: boolean;
} = {}): MenuResponse {
  const group = {
    id: "milk",
    sourceGroupId: "provider:milk",
    label: input.groupLabel ?? "Milk",
    displayStyle: "chips" as const,
    selectionType: "single" as const,
    required: true,
    minSelections: 1,
    maxSelections: 1,
    sortOrder: 0,
    options: [
      { id: "whole", label: "Whole", priceDeltaCents: 0, default: true, available: true, displayStyle: "default" as const, sortOrder: 0 },
      ...(input.removeOat ? [] : [{ id: "oat", label: "Oat", priceDeltaCents: input.optionPriceCents ?? 75, available: true, displayStyle: "emphasis" as const, sortOrder: 1 }]),
      ...(input.includeCoconut ? [{ id: "coconut", label: "Coconut", priceDeltaCents: 95, available: true, displayStyle: "default" as const, sortOrder: 2 }] : [])
    ]
  };

  const collisionA = {
    id: "collision-a",
    label: "Choice",
    selectionType: "single" as const,
    required: false,
    minSelections: 0,
    maxSelections: 1,
    sortOrder: 0,
    options: [{ id: "one", label: "One", priceDeltaCents: 0, available: true, sortOrder: 0 }]
  };
  const collisionB = {
    id: "collision-b",
    label: "Choice",
    selectionType: "single" as const,
    required: false,
    minSelections: 0,
    maxSelections: 1,
    sortOrder: 0,
    options: [
      { id: "two", label: "Two", priceDeltaCents: 25, available: true, sortOrder: 0 },
      { id: "three", label: "Three", priceDeltaCents: 50, available: true, sortOrder: 1 }
    ]
  };

  const categories = [
    {
      id: "sync-drinks",
      title: "Drinks",
      sortOrder: 0,
      items: [
        ...(input.includeItemA === false ? [] : [{
          id: "sync-item-a",
          name: "Synced Latte A",
          description: "A",
          priceCents: 600,
          badgeCodes: [],
          visible: true,
          available: true,
          featured: false,
          customizationGroups: input.includeGroup === false ? [] : [group]
        }]),
        ...(input.includeItemB === false ? [] : [{
          id: "sync-item-b",
          name: "Synced Latte B",
          description: "B",
          priceCents: 625,
          badgeCodes: [],
          visible: true,
          available: true,
          featured: true,
          customizationGroups: input.collisionGroups ? [collisionB] : input.includeGroup === false ? [] : [group]
        }])
      ]
    },
    {
      id: "sync-pastry",
      title: "Pastry",
      sortOrder: 1,
      items: [{
        id: "sync-collision-a",
        name: "Collision A",
        description: "A",
        priceCents: 300,
        badgeCodes: [],
        visible: true,
        available: true,
        featured: false,
        customizationGroups: input.collisionGroups ? [collisionA] : []
      }]
    }
  ];

  return menuResponseSchema.parse({ locationId: "sync-location", currency: "USD", categories });
}

describeWithPostgres("relational catalog migration and integrity (PostgreSQL)", () => {
  const schema = `test_catalog_relational_${randomUUID().replaceAll("-", "")}`;
  const baseDb = databaseUrl ? createPostgresDb(databaseUrl) : undefined;
  const schemaDatabaseUrl = databaseUrl ? new URL(databaseUrl) : undefined;
  if (schemaDatabaseUrl) {
    schemaDatabaseUrl.search = `?options=${encodeURIComponent(`-c search_path=${schema}`)}`;
  }
  const db = schemaDatabaseUrl ? createPostgresDb(schemaDatabaseUrl.toString()) : undefined;

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
    await catalogModifierMetadataMigration.down(db as never);
    await db!.deleteFrom("kysely_migration").where("name", "=", "0054_catalog_modifier_metadata").execute();
    await catalogRelationalMigration.down(db as never);
    await db!.deleteFrom("kysely_migration").where("name", "=", "0053_catalog_relational_model").execute();

    await db!.executeQuery({
      sql: `
      INSERT INTO catalog_menu_categories (brand_id, location_id, category_id, title, sort_order)
      VALUES
        ($1, $2, 'category-drinks', 'Drinks', 5),
        ($1, $2, 'category-pastry', 'Pastry', 1)
      `,
      parameters: [brandId, locationId]
    } as never);

    for (const item of legacyItems) {
      await db.executeQuery({
        sql: `
        INSERT INTO catalog_menu_items (
          brand_id, location_id, item_id, category_id, name, description, image_url,
          price_cents, badge_codes_json, visible, sort_order, customization_groups_json
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10, $11, $12::jsonb)
        `,
        parameters: [
        brandId,
        locationId,
        item.itemId,
        item.categoryId,
        item.name,
        item.description,
        item.imageUrl,
        item.priceCents,
        JSON.stringify(item.badgeCodes),
        item.visible,
        item.sortOrder,
        JSON.stringify(item.groups)
        ]
      } as never);
    }

    await catalogRelationalMigration.up(db as never);
    await catalogModifierMetadataMigration.up(db as never);
  });

  afterAll(async () => {
    await db.destroy();
    await baseDb.schema.dropSchema(schema).cascade().execute();
    await baseDb.destroy();
  });

  it("migrates legacy rows with semantic customization parity and stable conflict handling", async () => {
    const adminMenu = await getRelationalAdminMenu(db, locationId);
    const adminItems = new Map(adminMenu.categories.flatMap((category) => category.items).map((item) => [item.itemId, item]));
    const relationalGroups = await db.selectFrom("catalog_modifier_groups").selectAll().where("location_id", "=", locationId).execute();
    const relationalOptions = await db.selectFrom("catalog_modifier_options").selectAll().where("location_id", "=", locationId).execute();
    const assignments = await db.selectFrom("catalog_item_modifier_groups").selectAll().where("location_id", "=", locationId).execute();

    expect(adminItems.size).toBe(legacyItems.length);
    expect(relationalGroups).toHaveLength(6);
    expect(relationalOptions.length).toBeGreaterThan(10);
    expect(assignments.length).toBe(legacyItems.reduce((count, item) => count + item.groups.length, 0));

    for (const legacyItem of legacyItems) {
      const actualItem = adminItems.get(legacyItem.itemId);
      expect(actualItem).toBeDefined();
      expect(actualItem).toMatchObject({
        name: legacyItem.name,
        description: legacyItem.description,
        imageUrl: legacyItem.imageUrl ?? undefined,
        priceCents: legacyItem.priceCents,
        badgeCodes: legacyItem.badgeCodes,
        visible: legacyItem.visible,
        sortOrder: legacyItem.sortOrder
      });

      const expectedGroups = normalizeCustomizationGroups(legacyItem.groups);
      const actualGroups = actualItem!.customizationGroups;
      expect(actualGroups.map(comparableGroupWithoutId)).toEqual(expectedGroups.map(comparableGroupWithoutId));

      for (const expectedGroup of expectedGroups) {
        const actualGroup = actualGroups.find((candidate) => candidate.label === expectedGroup.label);
        expect(actualGroup).toBeDefined();
        if (expectedGroup.id === "milk" || expectedGroup.id === "extras" || expectedGroup.id === "lid" || expectedGroup.id === "seasoning") {
          expect(actualGroup!.id).toBe(expectedGroup.id);
        }
        if (expectedGroup.id === "choice") {
          expect(actualGroup!.id).toMatch(/^legacy_/);
        }
      }
    }

    const conflictIds = relationalGroups.filter((group) => group.label.endsWith("Choice")).map((group) => group.modifier_group_id);
    expect(new Set(conflictIds).size).toBe(2);
    expect(relationalOptions.some((option) => option.price_delta_cents === -75)).toBe(true);
    expect(relationalOptions.some((option) => option.price_delta_cents === 0)).toBe(true);
  });

  it("preserves category placement and ordering, and category deletion never destroys items", async () => {
    const membershipRows = await db
      .selectFrom("catalog_menu_category_items")
      .select(["category_id", "item_id", "sort_order"])
      .where("location_id", "=", locationId)
      .orderBy("category_id")
      .orderBy("sort_order")
      .execute();

    expect(membershipRows).toEqual([
      { category_id: "category-drinks", item_id: "item-latte-b", sort_order: 2 },
      { category_id: "category-drinks", item_id: "item-latte-a", sort_order: 5 },
      { category_id: "category-drinks", item_id: "item-unusual", sort_order: 9 },
      { category_id: "category-pastry", item_id: "item-pastry", sort_order: 1 }
    ]);

    await db.insertInto("catalog_menu_categories").values({
      brand_id: brandId,
      location_id: locationId,
      category_id: "category-secondary",
      title: "Secondary",
      description: "",
      visible: true,
      sort_order: 10
    }).execute();
    await db.insertInto("catalog_menu_category_items").values({
      brand_id: brandId,
      location_id: locationId,
      category_id: "category-secondary",
      item_id: "item-pastry",
      sort_order: 0
    }).execute();

    await expect(deleteRelationalCategory(db, locationId, "category-secondary")).resolves.toBe(true);
    expect(await db.selectFrom("catalog_menu_items").select("item_id").where("location_id", "=", locationId).where("item_id", "=", "item-pastry").executeTakeFirst()).toBeDefined();

    await db.insertInto("catalog_menu_categories").values({
      brand_id: brandId,
      location_id: locationId,
      category_id: "category-orphan",
      title: "Orphan",
      description: "",
      visible: true,
      sort_order: 11
    }).execute();
    await db.insertInto("catalog_menu_items").values({
      brand_id: brandId,
      location_id: locationId,
      item_id: "item-orphan",
      category_id: "category-orphan",
      name: "Orphan Test Item",
      description: "",
      image_url: null,
      price_cents: 100,
      badge_codes_json: JSON.stringify([]),
      customization_groups_json: JSON.stringify([]),
      visible: true,
      available: true,
      featured: false,
      sort_order: 0
    }).execute();
    await db.insertInto("catalog_menu_category_items").values({
      brand_id: brandId,
      location_id: locationId,
      category_id: "category-orphan",
      item_id: "item-orphan",
      sort_order: 0
    }).execute();
    await db.insertInto("catalog_menu_category_items").values({
      brand_id: brandId,
      location_id: locationId,
      category_id: "category-drinks",
      item_id: "item-pastry",
      sort_order: 12
    }).execute();
    await expect(deleteRelationalCategory(db, locationId, "category-orphan")).rejects.toMatchObject({ code: "CATEGORY_HAS_ORPHANED_ITEMS" });

    await db.deleteFrom("catalog_menu_category_items").where("location_id", "=", locationId).where("category_id", "=", "category-orphan").where("item_id", "=", "item-orphan").execute();
    await db.insertInto("catalog_menu_category_items").values({
      brand_id: brandId,
      location_id: locationId,
      category_id: "category-drinks",
      item_id: "item-orphan",
      sort_order: 12
    }).onConflict((conflict) => conflict.columns(["location_id", "category_id", "item_id"]).doUpdateSet({ sort_order: 12 })).execute();
    await db.updateTable("catalog_menu_items").set({ category_id: "category-drinks", sort_order: 12 }).where("location_id", "=", locationId).where("item_id", "=", "item-orphan").execute();
    await expect(deleteRelationalCategory(db, locationId, "category-orphan")).resolves.toBe(true);
    await expect(deleteRelationalCategory(db, locationId, "category-pastry")).resolves.toBe(true);
    expect(await db.selectFrom("catalog_menu_items").select("item_id").where("location_id", "=", locationId).where("item_id", "=", "item-pastry").executeTakeFirst()).toBeDefined();
  });

  it("keeps pricing, defaults, and validation semantics equivalent", async () => {
    const adminMenu = await getRelationalAdminMenu(db, locationId);
    const actual = adminMenu.categories.flatMap((category) => category.items).find((item) => item.itemId === "item-latte-a")!;
    const expected = normalizeCustomizationGroups(legacyItems.find((item) => item.itemId === "item-latte-a")!.groups);

    const expectedDefault = priceMenuItemCustomization({ basePriceCents: 650, quantity: 3, groups: expected, selection: buildDefaultCustomizationInput(expected) });
    const actualDefault = priceMenuItemCustomization({ basePriceCents: 650, quantity: 3, groups: actual.customizationGroups, selection: buildDefaultCustomizationInput(actual.customizationGroups) });
    expect(actualDefault.valid).toBe(expectedDefault.valid);
    expect(actualDefault.customizationDeltaCents).toBe(expectedDefault.customizationDeltaCents);
    expect(actualDefault.unitPriceCents).toBe(expectedDefault.unitPriceCents);
    expect(actualDefault.lineTotalCents).toBe(expectedDefault.lineTotalCents);

    const cases = [
      { name: "missing required", selection: { selectedOptions: [] } },
      { name: "unavailable option", selection: { selectedOptions: [{ groupId: "milk", optionId: "oat" }] } },
      { name: "below minimum", selection: { selectedOptions: [{ groupId: "milk", optionId: "whole" }] } },
      { name: "above maximum", selection: { selectedOptions: [{ groupId: "milk", optionId: "whole" }, { groupId: "extras", optionId: "vanilla" }, { groupId: "extras", optionId: "syrup" }, { groupId: "extras", optionId: "light" }] } },
      { name: "unknown option", selection: { selectedOptions: [{ groupId: "milk", optionId: "unknown" }] } },
      { name: "unknown group", selection: { selectedOptions: [{ groupId: "missing", optionId: "unknown" }] } },
      { name: "single violation", selection: { selectedOptions: [{ groupId: "lid", optionId: "yes" }, { groupId: "lid", optionId: "no" }] } }
    ];

    for (const testCase of cases) {
      const before = priceMenuItemCustomization({ basePriceCents: 650, groups: expected, selection: testCase.selection });
      const after = priceMenuItemCustomization({ basePriceCents: 650, groups: actual.customizationGroups, selection: testCase.selection });
      expect(after.valid, testCase.name).toBe(before.valid);
      expect(after.customizationDeltaCents, testCase.name).toBe(before.customizationDeltaCents);
      expect(after.issues.map((issue) => issue.code), testCase.name).toEqual(before.issues.map((issue) => issue.code));
    }

    const negativeDelta = priceMenuItemCustomization({
      basePriceCents: 650,
      quantity: 3,
      groups: actual.customizationGroups,
      selection: { selectedOptions: [{ groupId: "milk", optionId: "whole" }, { groupId: "extras", optionId: "light" }, { groupId: "lid", optionId: "yes" }] }
    });
    expect(negativeDelta.valid).toBe(true);
    expect(negativeDelta.customizationDeltaCents).toBe(-25);
    expect(negativeDelta.unitPriceCents).toBe(625);
    expect(negativeDelta.lineTotalCents).toBe(1875);
  });

  it("excludes hidden items server-side while preserving visible unavailable items", async () => {
    await db.updateTable("catalog_menu_items").set({ available: false }).where("location_id", "=", locationId).where("item_id", "=", "item-latte-a").execute();
    const publicMenu = await getRelationalPublicMenu(db, locationId);
    const publicItems = publicMenu.categories.flatMap((category) => category.items);
    expect(publicItems.some((item) => item.id === "item-latte-b")).toBe(false);
    expect(publicItems.find((item) => item.id === "item-latte-a")).toMatchObject({ visible: true, available: false });
    expect(menuResponseSchema.parse(publicMenu)).toEqual(publicMenu);
  });

  it("reconciles external menus deterministically without unsafe label merging", async () => {
    const externalDb = db;
    const first = buildExternalMenu();
    await replaceRelationalMenuFromExternal(externalDb, "sync-location", first);
    const firstCounts = await externalCounts(externalDb);
    expect(await externalDb.selectFrom("catalog_modifier_groups").select(["source_group_id", "display_style"]).where("location_id", "=", "sync-location").where("modifier_group_id", "=", "milk").executeTakeFirst()).toEqual({ source_group_id: "provider:milk", display_style: "chips" });
    expect(await externalDb.selectFrom("catalog_modifier_options").select(["option_id", "display_style"]).where("location_id", "=", "sync-location").where("option_id", "=", "oat").executeTakeFirst()).toEqual({ option_id: "oat", display_style: "emphasis" });
    expect((await getRelationalPublicMenu(externalDb, "sync-location")).categories[0]?.items[0]?.customizationGroups[0]).toMatchObject({ sourceGroupId: "provider:milk", displayStyle: "chips" });
    expect((await getRelationalAdminMenu(externalDb, "sync-location")).modifierGroups.find((group) => group.id === "milk")).toMatchObject({ sourceGroupId: "provider:milk", displayStyle: "chips" });
    await replaceRelationalMenuFromExternal(externalDb, "sync-location", first);
    expect(await externalCounts(externalDb)).toEqual(firstCounts);

    await replaceRelationalMenuFromExternal(externalDb, "sync-location", buildExternalMenu({ optionPriceCents: 100 }));
    const changedPrice = await externalDb.selectFrom("catalog_modifier_options").selectAll().where("location_id", "=", "sync-location").where("option_id", "=", "oat").executeTakeFirst();
    expect(changedPrice).toMatchObject({ price_delta_cents: 100 });
    await replaceRelationalMenuFromExternal(externalDb, "sync-location", buildExternalMenu({ groupLabel: "Milk Choice", includeCoconut: true, removeOat: true }));
    const changedOption = await externalDb.selectFrom("catalog_modifier_options").selectAll().where("location_id", "=", "sync-location").where("option_id", "=", "coconut").executeTakeFirst();
    expect(changedOption).toMatchObject({ price_delta_cents: 95 });
    expect(await externalDb.selectFrom("catalog_modifier_groups").select("modifier_group_id").where("location_id", "=", "sync-location").execute()).toHaveLength(1);
    expect((await externalDb.selectFrom("catalog_modifier_groups").select("label").where("location_id", "=", "sync-location").execute())[0]?.label).toBe("Milk Choice");
    expect(await externalDb.selectFrom("catalog_modifier_options").select("option_id").where("location_id", "=", "sync-location").where("modifier_group_id", "=", "milk").execute()).toEqual(expect.arrayContaining([{ option_id: "coconut" }, { option_id: "whole" }]));
    expect(await externalDb.selectFrom("catalog_modifier_options").select("option_id").where("location_id", "=", "sync-location").where("option_id", "=", "oat").execute()).toHaveLength(0);

    await replaceRelationalMenuFromExternal(externalDb, "sync-location", buildExternalMenu({ includeGroup: false }));
    expect(await externalDb.selectFrom("catalog_modifier_groups").select("modifier_group_id").where("location_id", "=", "sync-location").execute()).toHaveLength(0);
    expect(await externalDb.selectFrom("catalog_item_modifier_groups").select("item_id").where("location_id", "=", "sync-location").execute()).toHaveLength(0);

    await replaceRelationalMenuFromExternal(externalDb, "sync-location", buildExternalMenu({ collisionGroups: true }));
    const collisionGroups = await externalDb.selectFrom("catalog_modifier_groups").selectAll().where("location_id", "=", "sync-location").execute();
    expect(collisionGroups.filter((group) => group.label === "Choice")).toHaveLength(2);
    expect(new Set(collisionGroups.filter((group) => group.label === "Choice").map((group) => group.modifier_group_id)).size).toBe(2);
    const collisionPublic = await getRelationalPublicMenu(externalDb, "sync-location");
    const collisionGroup = collisionPublic.categories.flatMap((category) => category.items).find((item) => item.id === "sync-collision-a")?.customizationGroups[0];
    expect(collisionGroup).toMatchObject({ sourceGroupId: undefined, displayStyle: undefined });
    expect(collisionGroup?.options[0]).toMatchObject({ displayStyle: undefined });

    await replaceRelationalMenuFromExternal(externalDb, "sync-location", buildExternalMenu({ includeItemA: false, collisionGroups: false }));
    expect(await externalDb.selectFrom("catalog_menu_items").select("item_id").where("location_id", "=", "sync-location").execute()).toEqual(expect.arrayContaining([{ item_id: "sync-item-b" }, { item_id: "sync-collision-a" }]));
    expect(await externalDb.selectFrom("catalog_menu_items").select("item_id").where("location_id", "=", "sync-location").where("item_id", "=", "sync-item-a").execute()).toHaveLength(0);
    expect(await externalDb.selectFrom("catalog_item_modifier_groups").select("item_id").where("location_id", "=", "sync-location").where("modifier_group_id", "=", "milk").execute()).toEqual([{ item_id: "sync-item-b" }]);
  });

  it("protects shared modifier groups from accidental deletion", async () => {
    await replaceRelationalMenuFromExternal(db, "delete-location", buildExternalMenu());
    await db.deleteFrom("catalog_item_modifier_groups").where("location_id", "=", "delete-location").where("item_id", "=", "sync-item-a").execute();
    await db.deleteFrom("catalog_menu_items").where("location_id", "=", "delete-location").where("item_id", "=", "sync-item-a").execute();
    expect(await db.selectFrom("catalog_modifier_groups").select("modifier_group_id").where("location_id", "=", "delete-location").where("modifier_group_id", "=", "milk").execute()).toHaveLength(1);
    await expect(deleteRelationalModifierGroup(db, "delete-location", "milk")).rejects.toMatchObject({ code: "MODIFIER_GROUP_IN_USE" });
    await db.deleteFrom("catalog_item_modifier_groups").where("location_id", "=", "delete-location").where("item_id", "=", "sync-item-b").execute();
    await expect(deleteRelationalModifierGroup(db, "delete-location", "milk")).resolves.toBe(true);
    expect(await db.selectFrom("catalog_modifier_options").select("option_id").where("location_id", "=", "delete-location").where("modifier_group_id", "=", "milk").execute()).toHaveLength(0);
  });

  it("materializes relational rows when a new location is bootstrapped", async () => {
    const previousDatabaseUrl = process.env.DATABASE_URL;
    process.env.DATABASE_URL = schemaDatabaseUrl.toString();
    const logger = {
      info: () => undefined,
      warn: () => undefined,
      error: () => undefined,
      child: () => logger
    } as never;
    const repository = await createCatalogRepository(logger);
    try {
      await repository.bootstrapInternalLocation({
        brandId: "bootstrap-brand",
        brandName: "Bootstrap Brand",
        locationId: "bootstrap-location",
        locationName: "Bootstrap Location",
        marketLabel: "Test Market"
      });
      const memberships = await db.selectFrom("catalog_menu_category_items").select("item_id").where("location_id", "=", "bootstrap-location").execute();
      const assignments = await db.selectFrom("catalog_item_modifier_groups").select("item_id").where("location_id", "=", "bootstrap-location").execute();
      expect(memberships.length).toBeGreaterThan(0);
      expect(assignments.length).toBeGreaterThan(0);
      expect((await repository.getMenu("bootstrap-location")).categories.length).toBeGreaterThan(0);
    } finally {
      await repository.close();
      if (previousDatabaseUrl === undefined) delete process.env.DATABASE_URL;
      else process.env.DATABASE_URL = previousDatabaseUrl;
    }
  });

  it("rolls back bootstrap catalog state and retries without duplication", async () => {
    const previousDatabaseUrl = process.env.DATABASE_URL;
    process.env.DATABASE_URL = schemaDatabaseUrl.toString();
    const logger = { info: () => undefined, warn: () => undefined, error: () => undefined, child: () => logger } as never;
    const repository = await createCatalogRepository(logger);
    const input = {
      brandId: "bootstrap-retry-brand",
      brandName: "Bootstrap Retry Brand",
      locationId: "bootstrap-retry-location",
      locationName: "Bootstrap Retry Location",
      marketLabel: "Test Market"
    };
    try {
      await db.executeQuery({
        sql: `
          CREATE OR REPLACE FUNCTION fail_bootstrap_modifier_insert() RETURNS trigger
          LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'intentional bootstrap failure'; END; $$;
          CREATE TRIGGER fail_bootstrap_modifier_insert
          BEFORE INSERT ON catalog_modifier_groups
          FOR EACH ROW EXECUTE FUNCTION fail_bootstrap_modifier_insert();
        `,
        parameters: []
      } as never);

      await expect(repository.bootstrapInternalLocation(input)).rejects.toThrow("intentional bootstrap failure");
      const failedCounts = await Promise.all([
        db.selectFrom("catalog_store_configs").select("location_id").where("location_id", "=", input.locationId).execute(),
        db.selectFrom("catalog_app_configs").select("location_id").where("location_id", "=", input.locationId).execute(),
        db.selectFrom("catalog_menu_categories").select("category_id").where("location_id", "=", input.locationId).execute(),
        db.selectFrom("catalog_menu_items").select("item_id").where("location_id", "=", input.locationId).execute(),
        db.selectFrom("catalog_menu_category_items").select("item_id").where("location_id", "=", input.locationId).execute(),
        db.selectFrom("catalog_modifier_groups").select("modifier_group_id").where("location_id", "=", input.locationId).execute(),
        db.selectFrom("catalog_modifier_options").select("option_id").where("location_id", "=", input.locationId).execute(),
        db.selectFrom("catalog_item_modifier_groups").select("item_id").where("location_id", "=", input.locationId).execute()
      ]);
      expect(failedCounts.every((rows) => rows.length === 0)).toBe(true);

      await db.executeQuery({
        sql: "DROP TRIGGER fail_bootstrap_modifier_insert ON catalog_modifier_groups; DROP FUNCTION fail_bootstrap_modifier_insert();",
        parameters: []
      } as never);

      await repository.bootstrapInternalLocation(input);
      const retryCounts = await Promise.all([
        db.selectFrom("catalog_menu_categories").select("category_id").where("location_id", "=", input.locationId).execute(),
        db.selectFrom("catalog_menu_items").select("item_id").where("location_id", "=", input.locationId).execute(),
        db.selectFrom("catalog_menu_category_items").select("item_id").where("location_id", "=", input.locationId).execute(),
        db.selectFrom("catalog_modifier_groups").select("modifier_group_id").where("location_id", "=", input.locationId).execute(),
        db.selectFrom("catalog_modifier_options").select("option_id").where("location_id", "=", input.locationId).execute(),
        db.selectFrom("catalog_item_modifier_groups").select("item_id").where("location_id", "=", input.locationId).execute()
      ]);
      expect(retryCounts.every((rows) => rows.length > 0)).toBe(true);

      await repository.bootstrapInternalLocation({ ...input, locationId: "bootstrap-clean-location", brandId: "bootstrap-clean-brand" });
      const cleanCounts = await Promise.all([
        db.selectFrom("catalog_menu_categories").select("category_id").where("location_id", "=", "bootstrap-clean-location").execute(),
        db.selectFrom("catalog_menu_items").select("item_id").where("location_id", "=", "bootstrap-clean-location").execute(),
        db.selectFrom("catalog_menu_category_items").select("item_id").where("location_id", "=", "bootstrap-clean-location").execute(),
        db.selectFrom("catalog_modifier_groups").select("modifier_group_id").where("location_id", "=", "bootstrap-clean-location").execute(),
        db.selectFrom("catalog_modifier_options").select("option_id").where("location_id", "=", "bootstrap-clean-location").execute(),
        db.selectFrom("catalog_item_modifier_groups").select("item_id").where("location_id", "=", "bootstrap-clean-location").execute()
      ]);
      expect(retryCounts.map((rows) => rows.length)).toEqual(cleanCounts.map((rows) => rows.length));
      expect(await repository.getMenu(input.locationId)).toEqual(expect.objectContaining({ locationId: input.locationId }));
    } finally {
      await repository.close();
      if (previousDatabaseUrl === undefined) delete process.env.DATABASE_URL;
      else process.env.DATABASE_URL = previousDatabaseUrl;
    }
  });

  it("rolls back item fields when embedded modifier reconciliation fails", async () => {
    const previousDatabaseUrl = process.env.DATABASE_URL;
    process.env.DATABASE_URL = schemaDatabaseUrl.toString();
    const logger = { info: () => undefined, warn: () => undefined, error: () => undefined, child: () => logger } as never;
    const repository = await createCatalogRepository(logger);
    const location = "atomic-item-location";
    try {
      await repository.bootstrapInternalLocation({ brandId: "atomic-brand", brandName: "Atomic Brand", locationId: location, locationName: "Atomic Location", marketLabel: "Test Market" });
      const before = await db.selectFrom("catalog_menu_items").selectAll().where("location_id", "=", location).where("item_id", "=", "latte").executeTakeFirstOrThrow();
      const beforeAssignments = await db.selectFrom("catalog_item_modifier_groups").selectAll().where("location_id", "=", location).where("item_id", "=", "latte").execute();
      const customizationGroups = buildExternalMenu().categories[0]!.items[0]!.customizationGroups;

      await db.executeQuery({
        sql: `
          CREATE OR REPLACE FUNCTION fail_atomic_modifier_insert() RETURNS trigger
          LANGUAGE plpgsql AS $$ BEGIN IF NEW.location_id = 'atomic-item-location' THEN RAISE EXCEPTION 'intentional modifier reconciliation failure'; END IF; RETURN NEW; END; $$;
          CREATE TRIGGER fail_atomic_modifier_insert
          BEFORE INSERT ON catalog_modifier_groups
          FOR EACH ROW EXECUTE FUNCTION fail_atomic_modifier_insert();
        `,
        parameters: []
      } as never);

      await expect(repository.updateAdminMenuItem(location, {
        itemId: "latte",
        name: "Should Roll Back",
        description: "Should Roll Back",
        priceCents: 9999,
        visible: false,
        available: false,
        featured: true,
        badgeCodes: ["should-not-persist"],
        customizationGroups
      })).rejects.toThrow("intentional modifier reconciliation failure");

      const afterFailure = await db.selectFrom("catalog_menu_items").selectAll().where("location_id", "=", location).where("item_id", "=", "latte").executeTakeFirstOrThrow();
      expect(afterFailure).toMatchObject({
        name: before.name,
        description: before.description,
        price_cents: before.price_cents,
        visible: before.visible,
        available: before.available,
        featured: before.featured,
        badge_codes_json: before.badge_codes_json,
        customization_groups_json: before.customization_groups_json
      });
      expect(await db.selectFrom("catalog_item_modifier_groups").selectAll().where("location_id", "=", location).where("item_id", "=", "latte").execute()).toEqual(beforeAssignments);

      await db.executeQuery({
        sql: "DROP TRIGGER fail_atomic_modifier_insert ON catalog_modifier_groups; DROP FUNCTION fail_atomic_modifier_insert();",
        parameters: []
      } as never);
      await repository.updateAdminMenuItem(location, {
        itemId: "latte",
        name: "Committed Update",
        description: "Committed Description",
        priceCents: 9999,
        visible: false,
        available: false,
        featured: true,
        badgeCodes: ["committed"],
        customizationGroups
      });
      expect(await db.selectFrom("catalog_menu_items").select(["name", "description", "price_cents", "visible", "available", "featured"]).where("location_id", "=", location).where("item_id", "=", "latte").executeTakeFirst()).toEqual({ name: "Committed Update", description: "Committed Description", price_cents: 9999, visible: false, available: false, featured: true });
      expect(await db.selectFrom("catalog_item_modifier_groups").select("item_id").where("location_id", "=", location).where("item_id", "=", "latte").execute()).toHaveLength(customizationGroups.length);
    } finally {
      await repository.close();
      if (previousDatabaseUrl === undefined) delete process.env.DATABASE_URL;
      else process.env.DATABASE_URL = previousDatabaseUrl;
    }
  });

  it("keeps concurrent catalog mutations transactionally consistent", async () => {
    await db.insertInto("catalog_menu_categories").values([
      { brand_id: brandId, location_id: "concurrency-location", category_id: "a", title: "A", description: "", visible: true, sort_order: 0 },
      { brand_id: brandId, location_id: "concurrency-location", category_id: "b", title: "B", description: "", visible: true, sort_order: 1 }
    ]).execute();
    await db.insertInto("catalog_menu_items").values({
      brand_id: brandId,
      location_id: "concurrency-location",
      item_id: "concurrent-item",
      category_id: "a",
      name: "Concurrent Item",
      description: "",
      image_url: null,
      price_cents: 100,
      badge_codes_json: JSON.stringify([]),
      customization_groups_json: JSON.stringify([]),
      visible: true,
      available: true,
      featured: false,
      sort_order: 0
    }).execute();
    await db.insertInto("catalog_menu_category_items").values([
      { brand_id: brandId, location_id: "concurrency-location", category_id: "a", item_id: "concurrent-item", sort_order: 0 }
    ]).execute();

    await Promise.all([
      reorderRelationalCategories(db, "concurrency-location", ["a", "b"]),
      reorderRelationalCategories(db, "concurrency-location", ["b", "a"])
    ]);
    const reordered = await db.selectFrom("catalog_menu_categories").select(["category_id", "sort_order"]).where("location_id", "=", "concurrency-location").orderBy("sort_order").execute();
    expect(reordered.map((row) => row.sort_order)).toEqual([0, 1]);
    expect(new Set(reordered.map((row) => row.category_id))).toEqual(new Set(["a", "b"]));

    await Promise.all([
      db.transaction().execute((trx) => trx.updateTable("catalog_menu_items").set({ name: "Concurrent Rename" }).where("location_id", "=", "concurrency-location").where("item_id", "=", "concurrent-item").execute()),
      db.transaction().execute((trx) => trx.updateTable("catalog_menu_items").set({ price_cents: 125 }).where("location_id", "=", "concurrency-location").where("item_id", "=", "concurrent-item").execute())
    ]);
    expect(await db.selectFrom("catalog_menu_items").select(["name", "price_cents"]).where("location_id", "=", "concurrency-location").where("item_id", "=", "concurrent-item").executeTakeFirst()).toEqual({ name: "Concurrent Rename", price_cents: 125 });

    await replaceRelationalMenuFromExternal(db, "concurrency-sync", buildExternalMenu());
    await Promise.allSettled([
      replaceRelationalMenuFromExternal(db, "concurrency-sync", buildExternalMenu({ includeCoconut: true })),
      db.transaction().execute((trx) => trx.updateTable("catalog_menu_items").set({ name: "Operator Race" }).where("location_id", "=", "concurrency-sync").where("item_id", "=", "sync-item-a").execute())
    ]);
    const invalidMemberships = await sql<{ count: string }>`
      SELECT COUNT(*)::text AS count
      FROM catalog_menu_category_items AS memberships
      LEFT JOIN catalog_menu_categories AS categories
        ON categories.location_id = memberships.location_id AND categories.category_id = memberships.category_id
      LEFT JOIN catalog_menu_items AS items
        ON items.location_id = memberships.location_id AND items.item_id = memberships.item_id
      WHERE categories.category_id IS NULL OR items.item_id IS NULL
    `.execute(db);
    expect(invalidMemberships.rows).toEqual([{ count: "0" }]);
  });

  it("rejects operator mutation of an external-sync catalog", async () => {
    await db.insertInto("catalog_app_configs").values({
      brand_id: brandId,
      location_id: "external-location",
      app_config_json: JSON.stringify({ storeCapabilities: { menu: { source: "external_sync" } } })
    }).execute();
    await expect(deleteRelationalCategory(db, "external-location", "missing")).rejects.toMatchObject({ code: "CATALOG_EXTERNAL_SYNC_READ_ONLY" });
  });

  it("rolls back 0053 partial work and succeeds on retry after the bad legacy row is corrected", async () => {
    const danglingLegacyCategories = await sql<{ item_id: string; category_id: string }>`
      SELECT menu_items.item_id, menu_items.category_id
      FROM catalog_menu_items AS menu_items
      LEFT JOIN catalog_menu_categories AS categories
        ON categories.location_id = menu_items.location_id
       AND categories.category_id = menu_items.category_id
      WHERE categories.category_id IS NULL
    `.execute(db);
    expect(danglingLegacyCategories.rows).toEqual([]);

    await catalogModifierMetadataMigration.down(db as never);
    await catalogRelationalMigration.down(db as never);
    await db.deleteFrom("kysely_migration").where("name", "=", "0053_catalog_relational_model").execute();
    await db.executeQuery({
      sql: `
        INSERT INTO catalog_menu_categories (brand_id, location_id, category_id, title, sort_order)
        VALUES ('brand', 'rollback-location', 'category', 'Category', 0);
        INSERT INTO catalog_menu_items (
          brand_id, location_id, item_id, category_id, name, description, price_cents,
          badge_codes_json, visible, sort_order, customization_groups_json
        ) VALUES (
          'brand', 'rollback-location', 'item', 'category', 'Item', '', 100,
          '[]'::jsonb, TRUE, 0,
          '[{"id":"bad","label":"Bad","selectionType":"single","maxSelections":2,"options":[{"id":"one","label":"One","priceDeltaCents":0}]}]'::jsonb
        );
      `,
      parameters: []
    } as never);

    await expect(db.transaction().execute(async (trx) => {
      await catalogRelationalMigration.up(trx as never);
    })).rejects.toThrow();
    const rolledBackTable = await sql<{ table_name: string | null }>`SELECT to_regclass(${`${schema}.catalog_modifier_groups`}) AS table_name`.execute(db);
    expect(rolledBackTable.rows).toEqual([{ table_name: null }]);
    const rolledBackColumn = await sql<{ column_name: string }>`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_schema = ${schema}
        AND table_name = 'catalog_menu_items'
        AND column_name = 'available'
    `.execute(db);
    expect(rolledBackColumn.rows).toEqual([]);

    await db.executeQuery({
      sql: "UPDATE catalog_menu_items SET customization_groups_json = '[]'::jsonb WHERE location_id = 'rollback-location' AND item_id = 'item'",
      parameters: []
    } as never);
    await catalogRelationalMigration.up(db as never);
    await catalogModifierMetadataMigration.up(db as never);
    const retriedTable = await sql<{ table_name: string | null }>`SELECT to_regclass(${`${schema}.catalog_modifier_groups`}) AS table_name`.execute(db);
    expect(retriedTable.rows[0]?.table_name).toContain("catalog_modifier_groups");
  });
});

async function externalCounts(db: PersistenceDb) {
  const [categories, items, memberships, groups, options, assignments] = await Promise.all([
    db.selectFrom("catalog_menu_categories").select("category_id").where("location_id", "=", "sync-location").execute(),
    db.selectFrom("catalog_menu_items").select("item_id").where("location_id", "=", "sync-location").execute(),
    db.selectFrom("catalog_menu_category_items").select(["category_id", "item_id"]).where("location_id", "=", "sync-location").execute(),
    db.selectFrom("catalog_modifier_groups").select("modifier_group_id").where("location_id", "=", "sync-location").execute(),
    db.selectFrom("catalog_modifier_options").select(["modifier_group_id", "option_id"]).where("location_id", "=", "sync-location").execute(),
    db.selectFrom("catalog_item_modifier_groups").select(["item_id", "modifier_group_id"]).where("location_id", "=", "sync-location").execute()
  ]);
  return { categories, items, memberships, groups, options, assignments };
}
