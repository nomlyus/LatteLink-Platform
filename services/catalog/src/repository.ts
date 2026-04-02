import { randomUUID } from "node:crypto";
import type { FastifyBaseLogger } from "fastify";
import {
  adminMenuItemCreateSchema,
  adminMenuItemSchema,
  adminMenuItemVisibilityUpdateSchema,
  adminMenuResponseSchema,
  internalLocationBootstrapSchema,
  internalLocationSummarySchema,
  adminStoreConfigSchema,
  adminMutationSuccessSchema,
  appConfigSchema,
  type AdminMenuItem,
  type AdminMenuResponse,
  type AdminStoreConfig,
  type AppConfig,
  type AppConfigStoreCapabilities,
  type InternalLocationBootstrap,
  type InternalLocationSummary,
  menuItemCustomizationGroupSchema,
  menuItemSchema,
  menuResponseSchema,
  storeConfigResponseSchema
} from "@gazelle/contracts-catalog";
import {
  allowsInMemoryPersistence,
  buildPersistenceStartupError,
  createPostgresDb,
  getDatabaseUrl,
  runMigrations,
  sql,
  type PersistenceDb
} from "@gazelle/persistence";
import { z } from "zod";
import {
  DEFAULT_BRAND_ID,
  DEFAULT_LOCATION_NAME,
  DEFAULT_LOCATION_ID,
  DEFAULT_STORE_HOURS,
  resolveDefaultAppConfigPayload,
  resolveProvisionedAppConfigPayload
} from "./tenant.js";

const espressoCustomizationGroups = [
  {
    id: "size",
    sourceGroupId: "core:size",
    label: "Size",
    description: "Choose the cup that fits the order.",
    selectionType: "single" as const,
    required: true,
    minSelections: 1,
    maxSelections: 1,
    sortOrder: 0,
    displayStyle: "chips" as const,
    options: [
      { id: "regular", label: "Regular", priceDeltaCents: 0, default: true, sortOrder: 0, available: true },
      { id: "large", label: "Large", priceDeltaCents: 100, sortOrder: 1, available: true }
    ]
  },
  {
    id: "milk",
    sourceGroupId: "core:milk",
    label: "Milk",
    description: "Keep it classic or switch the texture.",
    selectionType: "single" as const,
    required: true,
    minSelections: 1,
    maxSelections: 1,
    sortOrder: 1,
    displayStyle: "chips" as const,
    options: [
      { id: "whole", label: "Whole milk", priceDeltaCents: 0, default: true, sortOrder: 0, available: true },
      { id: "oat", label: "Oat milk", priceDeltaCents: 75, sortOrder: 1, available: true },
      { id: "almond", label: "Almond milk", priceDeltaCents: 75, sortOrder: 2, available: true }
    ]
  },
  {
    id: "espresso-extras",
    label: "Extras",
    description: "Add a little more structure or finish.",
    selectionType: "multiple" as const,
    required: false,
    minSelections: 0,
    maxSelections: 2,
    sortOrder: 2,
    displayStyle: "chips" as const,
    options: [
      { id: "extra-shot", label: "Extra shot", priceDeltaCents: 125, sortOrder: 0, available: true },
      { id: "vanilla", label: "Vanilla", priceDeltaCents: 75, sortOrder: 1, available: true }
    ]
  }
];

const matchaCustomizationGroups = [
  {
    id: "size",
    sourceGroupId: "core:size",
    label: "Size",
    description: "Choose the pour size for this drink.",
    selectionType: "single" as const,
    required: true,
    minSelections: 1,
    maxSelections: 1,
    sortOrder: 0,
    displayStyle: "chips" as const,
    options: [
      { id: "regular", label: "Regular", priceDeltaCents: 0, default: true, sortOrder: 0, available: true },
      { id: "large", label: "Large", priceDeltaCents: 100, sortOrder: 1, available: true }
    ]
  },
  {
    id: "milk",
    sourceGroupId: "core:milk",
    label: "Milk",
    description: "Choose the milk that will be whisked into the matcha.",
    selectionType: "single" as const,
    required: true,
    minSelections: 1,
    maxSelections: 1,
    sortOrder: 1,
    displayStyle: "chips" as const,
    options: [
      { id: "whole", label: "Whole milk", priceDeltaCents: 0, default: true, sortOrder: 0, available: true },
      { id: "oat", label: "Oat milk", priceDeltaCents: 75, sortOrder: 1, available: true },
      { id: "almond", label: "Almond milk", priceDeltaCents: 75, sortOrder: 2, available: true }
    ]
  },
  {
    id: "sweetness",
    sourceGroupId: "core:sweetness",
    label: "Sweetness",
    description: "Control how much sweetness is whisked in.",
    selectionType: "single" as const,
    required: true,
    minSelections: 1,
    maxSelections: 1,
    sortOrder: 2,
    displayStyle: "chips" as const,
    options: [
      { id: "full", label: "Full sweet", priceDeltaCents: 0, default: true, sortOrder: 0, available: true },
      { id: "half", label: "Half sweet", priceDeltaCents: 0, sortOrder: 1, available: true },
      { id: "unsweetened", label: "Unsweetened", priceDeltaCents: 0, sortOrder: 2, available: true }
    ]
  },
  {
    id: "matcha-finish",
    label: "Finish",
    description: "Choose the final matcha texture.",
    selectionType: "multiple" as const,
    required: false,
    minSelections: 0,
    maxSelections: 1,
    sortOrder: 3,
    displayStyle: "chips" as const,
    options: [
      { id: "strawberry-cold-foam", label: "Strawberry cold foam", priceDeltaCents: 150, sortOrder: 0, available: true }
    ]
  }
];

const defaultMenuPayload = menuResponseSchema.parse({
  locationId: DEFAULT_LOCATION_ID,
  currency: "USD",
  categories: [
    {
      id: "espresso",
      title: "Espresso Bar",
      items: [
        {
          id: "latte",
          name: "Honey Oat Latte",
          description: "Espresso with steamed oat milk and a warm honey finish.",
          priceCents: 675,
          badgeCodes: ["popular"],
          visible: true,
          customizationGroups: espressoCustomizationGroups
        }
      ]
    },
    {
      id: "matcha",
      title: "Matcha",
      items: [
        {
          id: "matcha",
          name: "Ceremonial Matcha",
          description: "Stone-ground matcha whisked to order with milk of your choice.",
          priceCents: 725,
          badgeCodes: ["new"],
          visible: true,
          customizationGroups: matchaCustomizationGroups
        }
      ]
    },
    {
      id: "pastry",
      title: "Pastries",
      items: [
        {
          id: "croissant",
          name: "Butter Croissant",
          description: "Flaky, laminated, and baked fresh each morning.",
          priceCents: 425,
          badgeCodes: [],
          visible: true,
          customizationGroups: []
        }
      ]
    }
  ]
});

const defaultStoreConfigPayload = storeConfigResponseSchema.parse({
  locationId: DEFAULT_LOCATION_ID,
  prepEtaMinutes: 12,
  taxRateBasisPoints: 600,
  pickupInstructions: "Pickup at the flagship order counter."
});

type MenuResponse = z.output<typeof menuResponseSchema>;
type StoreConfigResponse = z.output<typeof storeConfigResponseSchema>;
type MenuItem = z.output<typeof menuItemSchema>;

type CatalogRepository = {
  backend: "memory" | "postgres";
  getAppConfig(): Promise<AppConfig>;
  listInternalLocations(): Promise<InternalLocationSummary[]>;
  getInternalLocationSummary(locationId: string): Promise<InternalLocationSummary | undefined>;
  bootstrapInternalLocation(input: InternalLocationBootstrap): Promise<InternalLocationSummary>;
  getAdminMenu(): Promise<AdminMenuResponse>;
  createAdminMenuItem(input: z.output<typeof adminMenuItemCreateSchema>): Promise<AdminMenuItem | undefined>;
  updateAdminMenuItem(input: {
    itemId: string;
    name: string;
    priceCents: number;
    visible: boolean;
  }): Promise<AdminMenuItem | undefined>;
  updateAdminMenuItemVisibility(input: {
    itemId: string;
    visible: boolean;
  }): Promise<AdminMenuItem | undefined>;
  deleteAdminMenuItem(itemId: string): Promise<z.output<typeof adminMutationSuccessSchema>>;
  getAdminStoreConfig(): Promise<AdminStoreConfig>;
  updateAdminStoreConfig(input: {
    storeName: string;
    hours: string;
    pickupInstructions: string;
    capabilities?: AppConfigStoreCapabilities;
  }): Promise<AdminStoreConfig>;
  getMenu(): Promise<MenuResponse>;
  getStoreConfig(): Promise<StoreConfigResponse>;
  pingDb(): Promise<void>;
  close(): Promise<void>;
};

function parseJsonValue<TSchema extends z.ZodTypeAny>(schema: TSchema, value: unknown): z.output<TSchema> {
  const parsedValue = typeof value === "string" ? JSON.parse(value) : value;
  return schema.parse(parsedValue);
}

function toBadgeCodes(value: unknown) {
  return parseJsonValue(z.array(z.string()), value);
}

function toCustomizationGroups(value: unknown) {
  return parseJsonValue(z.array(menuItemCustomizationGroupSchema), value);
}

function toAdminMenuItem(input: {
  itemId: string;
  categoryId: string;
  categoryTitle: string;
  name: string;
  description?: string;
  priceCents: number;
  visible: boolean;
  sortOrder: number;
}) {
  return adminMenuItemSchema.parse(input);
}

function slugifyMenuItemName(name: string) {
  const slug = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return slug.length > 0 ? slug : "item";
}

function createMenuItemId(name: string) {
  return `${slugifyMenuItemName(name)}-${randomUUID().slice(0, 8)}`;
}

function buildAdminMenuResponse(params: {
  locationId: string;
  categories: Array<{
    categoryId: string;
    title: string;
    items: AdminMenuItem[];
  }>;
}) {
  return adminMenuResponseSchema.parse({
    locationId: params.locationId,
    categories: params.categories.map((category) => ({
      categoryId: category.categoryId,
      title: category.title,
      items: category.items
    }))
  });
}

function buildAdminStoreConfig(input: {
  locationId: string;
  storeName: string;
  hours: string;
  pickupInstructions: string;
  capabilities: AppConfigStoreCapabilities;
}) {
  return adminStoreConfigSchema.parse(input);
}

function buildInternalLocationSummary(input: {
  brandId: string;
  brandName: string;
  locationId: string;
  locationName: string;
  marketLabel: string;
  storeName: string;
  hours: string;
  pickupInstructions: string;
  capabilities: AppConfigStoreCapabilities;
  action?: "created" | "updated";
}) {
  return internalLocationSummarySchema.parse(input);
}

function buildProvisionedMenuPayload(locationId: string) {
  return menuResponseSchema.parse({
    ...defaultMenuPayload,
    locationId
  });
}

function compareInternalLocationSummaries(left: InternalLocationSummary, right: InternalLocationSummary) {
  return (
    left.brandName.localeCompare(right.brandName) ||
    left.locationName.localeCompare(right.locationName) ||
    left.locationId.localeCompare(right.locationId)
  );
}

function isDefaultSeedLocation(input: { brandId: string; locationId: string }) {
  return input.brandId === DEFAULT_BRAND_ID && input.locationId === DEFAULT_LOCATION_ID;
}

function applyRuntimeFulfillmentMode(appConfig: AppConfig) {
  return appConfigSchema.parse(appConfig);
}

function createInMemoryRepository(): CatalogRepository {
  const defaultAppConfig = structuredClone(resolveDefaultAppConfigPayload());
  const appConfigsByLocation = new Map<string, AppConfig>([[DEFAULT_LOCATION_ID, defaultAppConfig]]);
  const menusByLocation = new Map<string, MenuResponse>([[DEFAULT_LOCATION_ID, structuredClone(defaultMenuPayload)]]);
  const storeConfigsByLocation = new Map<string, StoreConfigResponse>([
    [DEFAULT_LOCATION_ID, structuredClone(defaultStoreConfigPayload)]
  ]);
  const adminStoreConfigsByLocation = new Map<string, AdminStoreConfig>([
    [
      DEFAULT_LOCATION_ID,
      buildAdminStoreConfig({
        locationId: DEFAULT_LOCATION_ID,
        storeName: DEFAULT_LOCATION_NAME,
        hours: DEFAULT_STORE_HOURS,
        pickupInstructions: defaultStoreConfigPayload.pickupInstructions,
        capabilities: defaultAppConfig.storeCapabilities
      })
    ]
  ]);

  return {
    backend: "memory",
    async getAppConfig() {
      return applyRuntimeFulfillmentMode(appConfigsByLocation.get(DEFAULT_LOCATION_ID) ?? defaultAppConfig);
    },
    async listInternalLocations() {
      return Array.from(adminStoreConfigsByLocation.entries())
        .flatMap(([locationId, adminStoreConfig]) => {
          const appConfig = appConfigsByLocation.get(locationId);
          if (!appConfig) {
            return [];
          }

          return [
            buildInternalLocationSummary({
              brandId: appConfig.brand.brandId,
              brandName: appConfig.brand.brandName,
              locationId,
              locationName: appConfig.brand.locationName,
              marketLabel: appConfig.brand.marketLabel,
              storeName: adminStoreConfig.storeName,
              hours: adminStoreConfig.hours,
              pickupInstructions: adminStoreConfig.pickupInstructions,
              capabilities: appConfig.storeCapabilities
            })
          ];
        })
        .sort(compareInternalLocationSummaries);
    },
    async getInternalLocationSummary(locationId) {
      const adminStoreConfig = adminStoreConfigsByLocation.get(locationId);
      const appConfig = appConfigsByLocation.get(locationId);
      if (!adminStoreConfig || !appConfig) {
        return undefined;
      }

      return buildInternalLocationSummary({
        brandId: appConfig.brand.brandId,
        brandName: appConfig.brand.brandName,
        locationId,
        locationName: appConfig.brand.locationName,
        marketLabel: appConfig.brand.marketLabel,
        storeName: adminStoreConfig.storeName,
        hours: adminStoreConfig.hours,
        pickupInstructions: adminStoreConfig.pickupInstructions,
        capabilities: appConfig.storeCapabilities
      });
    },
    async bootstrapInternalLocation(rawInput) {
      const input = internalLocationBootstrapSchema.parse(rawInput);
      const existing = adminStoreConfigsByLocation.get(input.locationId);
      const nextAppConfig = resolveProvisionedAppConfigPayload({
        brandId: input.brandId,
        brandName: input.brandName,
        locationId: input.locationId,
        locationName: input.locationName,
        marketLabel: input.marketLabel,
        capabilities: input.capabilities
      });
      const nextAdminStoreConfig = buildAdminStoreConfig({
        locationId: input.locationId,
        storeName: input.storeName ?? input.locationName,
        hours: input.hours ?? DEFAULT_STORE_HOURS,
        pickupInstructions: input.pickupInstructions ?? defaultStoreConfigPayload.pickupInstructions,
        capabilities: nextAppConfig.storeCapabilities
      });
      const nextStoreConfig = storeConfigResponseSchema.parse({
        ...defaultStoreConfigPayload,
        locationId: input.locationId,
        pickupInstructions: nextAdminStoreConfig.pickupInstructions
      });

      appConfigsByLocation.set(input.locationId, nextAppConfig);
      adminStoreConfigsByLocation.set(input.locationId, nextAdminStoreConfig);
      storeConfigsByLocation.set(input.locationId, nextStoreConfig);
      if (!menusByLocation.has(input.locationId)) {
        menusByLocation.set(input.locationId, buildProvisionedMenuPayload(input.locationId));
      }

      return buildInternalLocationSummary({
        brandId: nextAppConfig.brand.brandId,
        brandName: nextAppConfig.brand.brandName,
        locationId: input.locationId,
        locationName: nextAppConfig.brand.locationName,
        marketLabel: nextAppConfig.brand.marketLabel,
        storeName: nextAdminStoreConfig.storeName,
        hours: nextAdminStoreConfig.hours,
        pickupInstructions: nextAdminStoreConfig.pickupInstructions,
        capabilities: nextAppConfig.storeCapabilities,
        action: existing ? "updated" : "created"
      });
    },
    async getAdminMenu() {
      const menu = menusByLocation.get(DEFAULT_LOCATION_ID) ?? defaultMenuPayload;
      return buildAdminMenuResponse({
        locationId: menu.locationId,
        categories: menu.categories.map((category) => ({
          categoryId: category.id,
          title: category.title,
          items: category.items.map((item, index) =>
            toAdminMenuItem({
              itemId: item.id,
              categoryId: category.id,
              categoryTitle: category.title,
              name: item.name,
              description: item.description,
              priceCents: item.priceCents,
              visible: item.visible,
              sortOrder: index
            })
          )
        }))
      });
    },
    async createAdminMenuItem(input) {
      const currentMenu = menusByLocation.get(DEFAULT_LOCATION_ID) ?? defaultMenuPayload;
      let menu = currentMenu;
      const category = menu.categories.find((entry) => entry.id === input.categoryId);
      if (!category) {
        return undefined;
      }

      const nextItem = {
        id: createMenuItemId(input.name),
        name: input.name,
        description: input.description ?? "",
        priceCents: input.priceCents,
        badgeCodes: [],
        visible: input.visible,
        customizationGroups: []
      };

      menu = menuResponseSchema.parse({
        ...menu,
        categories: menu.categories.map((entry) =>
          entry.id === input.categoryId
            ? {
                ...entry,
                items: [...entry.items, nextItem]
              }
            : entry
        )
      });
      menusByLocation.set(DEFAULT_LOCATION_ID, menu);

      return toAdminMenuItem({
        itemId: nextItem.id,
        categoryId: category.id,
        categoryTitle: category.title,
        name: nextItem.name,
        description: nextItem.description,
        priceCents: nextItem.priceCents,
        visible: nextItem.visible,
        sortOrder: category.items.length
      });
    },
    async updateAdminMenuItem(input) {
      let menu = menusByLocation.get(DEFAULT_LOCATION_ID) ?? defaultMenuPayload;
      let updatedItem: AdminMenuItem | undefined;
      menu = menuResponseSchema.parse({
        ...menu,
        categories: menu.categories.map((category) => ({
          ...category,
          items: category.items.map((item, index) => {
            if (item.id !== input.itemId) {
              return item;
            }

            updatedItem = toAdminMenuItem({
              itemId: item.id,
              categoryId: category.id,
              categoryTitle: category.title,
              name: input.name,
              description: item.description,
              priceCents: input.priceCents,
              visible: input.visible,
              sortOrder: index
            });

            return {
              ...item,
              name: input.name,
              priceCents: input.priceCents,
              visible: input.visible
            };
          })
        }))
      });
      menusByLocation.set(DEFAULT_LOCATION_ID, menu);

      return updatedItem;
    },
    async updateAdminMenuItemVisibility(input) {
      let menu = menusByLocation.get(DEFAULT_LOCATION_ID) ?? defaultMenuPayload;
      let updatedItem: AdminMenuItem | undefined;
      menu = menuResponseSchema.parse({
        ...menu,
        categories: menu.categories.map((category) => ({
          ...category,
          items: category.items.map((item, index) => {
            if (item.id !== input.itemId) {
              return item;
            }

            updatedItem = toAdminMenuItem({
              itemId: item.id,
              categoryId: category.id,
              categoryTitle: category.title,
              name: item.name,
              description: item.description,
              priceCents: item.priceCents,
              visible: input.visible,
              sortOrder: index
            });

            return {
              ...item,
              visible: input.visible
            };
          })
        }))
      });
      menusByLocation.set(DEFAULT_LOCATION_ID, menu);

      return updatedItem;
    },
    async deleteAdminMenuItem(itemId) {
      let menu = menusByLocation.get(DEFAULT_LOCATION_ID) ?? defaultMenuPayload;
      menu = menuResponseSchema.parse({
        ...menu,
        categories: menu.categories.map((category) => ({
          ...category,
          items: category.items.filter((item) => item.id !== itemId)
        }))
      });
      menusByLocation.set(DEFAULT_LOCATION_ID, menu);

      return { success: true };
    },
    async getAdminStoreConfig() {
      return adminStoreConfigsByLocation.get(DEFAULT_LOCATION_ID)!;
    },
    async updateAdminStoreConfig(input) {
      const currentAppConfig = appConfigsByLocation.get(DEFAULT_LOCATION_ID) ?? defaultAppConfig;
      const nextAdminStoreConfig = buildAdminStoreConfig({
        locationId: DEFAULT_LOCATION_ID,
        storeName: input.storeName,
        hours: input.hours,
        pickupInstructions: input.pickupInstructions,
        capabilities: input.capabilities ?? currentAppConfig.storeCapabilities
      });
      const nextStoreConfig = storeConfigResponseSchema.parse({
        ...(storeConfigsByLocation.get(DEFAULT_LOCATION_ID) ?? defaultStoreConfigPayload),
        pickupInstructions: input.pickupInstructions
      });
      const nextAppConfig = appConfigSchema.parse({
        ...currentAppConfig,
        brand: {
          ...currentAppConfig.brand,
          locationName: input.storeName
        },
        storeCapabilities: input.capabilities ?? currentAppConfig.storeCapabilities
      });
      adminStoreConfigsByLocation.set(DEFAULT_LOCATION_ID, nextAdminStoreConfig);
      storeConfigsByLocation.set(DEFAULT_LOCATION_ID, nextStoreConfig);
      appConfigsByLocation.set(DEFAULT_LOCATION_ID, nextAppConfig);

      return nextAdminStoreConfig;
    },
    async getMenu() {
      return menusByLocation.get(DEFAULT_LOCATION_ID) ?? defaultMenuPayload;
    },
    async getStoreConfig() {
      return storeConfigsByLocation.get(DEFAULT_LOCATION_ID) ?? defaultStoreConfigPayload;
    },
    async pingDb() {
      // no-op for in-memory
    },
    async close() {
      // no-op
    }
  };
}

async function seedCatalogDefaults(db: PersistenceDb) {
  const defaultAppConfigPayload = resolveDefaultAppConfigPayload();
  const existingCategory = await db
    .selectFrom("catalog_menu_categories")
    .select("category_id")
    .where("brand_id", "=", DEFAULT_BRAND_ID)
    .where("location_id", "=", defaultMenuPayload.locationId)
    .executeTakeFirst();

  if (!existingCategory) {
    await db.transaction().execute(async (trx) => {
      await trx
        .insertInto("catalog_menu_categories")
        .values(
          defaultMenuPayload.categories.map((category, index) => ({
            brand_id: DEFAULT_BRAND_ID,
            location_id: defaultMenuPayload.locationId,
            category_id: category.id,
            title: category.title,
            sort_order: index
          }))
        )
        .onConflict((oc) => oc.columns(["location_id", "category_id"]).doNothing())
        .execute();

      await trx
        .insertInto("catalog_menu_items")
        .values(
          defaultMenuPayload.categories.flatMap((category) =>
            category.items.map((item, index) => ({
              brand_id: DEFAULT_BRAND_ID,
              location_id: defaultMenuPayload.locationId,
              item_id: item.id,
              category_id: category.id,
              name: item.name,
              description: item.description,
              image_url: item.imageUrl ?? null,
              price_cents: item.priceCents,
              badge_codes_json: JSON.stringify(item.badgeCodes),
              customization_groups_json: JSON.stringify(item.customizationGroups ?? []),
              visible: item.visible,
              sort_order: index
            }))
          )
        )
        .onConflict((oc) => oc.columns(["location_id", "item_id"]).doNothing())
        .execute();
    });
  }

  await db
    .insertInto("catalog_store_configs")
    .values({
      brand_id: DEFAULT_BRAND_ID,
      location_id: defaultStoreConfigPayload.locationId,
      store_name: DEFAULT_LOCATION_NAME,
      hours_text: DEFAULT_STORE_HOURS,
      prep_eta_minutes: defaultStoreConfigPayload.prepEtaMinutes,
      tax_rate_basis_points: defaultStoreConfigPayload.taxRateBasisPoints,
      pickup_instructions: defaultStoreConfigPayload.pickupInstructions
    })
    .onConflict((oc) => oc.column("location_id").doNothing())
    .execute();

  await db
    .insertInto("catalog_app_configs")
    .values({
      brand_id: DEFAULT_BRAND_ID,
      location_id: defaultAppConfigPayload.brand.locationId,
      app_config_json: defaultAppConfigPayload
    })
    .onConflict((oc) => oc.columns(["brand_id", "location_id"]).doNothing())
    .execute();
}

async function createPostgresRepository(connectionString: string): Promise<CatalogRepository> {
  const db = createPostgresDb(connectionString);
  const defaultAppConfigPayload = resolveDefaultAppConfigPayload();
  await runMigrations(db);
  await seedCatalogDefaults(db);

  return {
    backend: "postgres",
    async getAppConfig() {
      const row = await db
        .selectFrom("catalog_app_configs")
        .selectAll()
        .where("brand_id", "=", DEFAULT_BRAND_ID)
        .where("location_id", "=", DEFAULT_LOCATION_ID)
        .executeTakeFirst();

      if (!row) {
        return applyRuntimeFulfillmentMode(defaultAppConfigPayload);
      }

      return applyRuntimeFulfillmentMode(appConfigSchema.parse(row.app_config_json));
    },
    async listInternalLocations() {
      const storeRows = await db.selectFrom("catalog_store_configs").selectAll().execute();
      if (storeRows.length === 0) {
        return [];
      }

      const appConfigRows = await db
        .selectFrom("catalog_app_configs")
        .select(["location_id", "app_config_json"])
        .execute();
      const appConfigByLocation = new Map(
        appConfigRows.map((row) => [row.location_id, appConfigSchema.parse(row.app_config_json)] as const)
      );

      return storeRows
        .flatMap((storeRow) => {
          const appConfig = appConfigByLocation.get(storeRow.location_id);
          if (!appConfig) {
            return [];
          }

          return [
            buildInternalLocationSummary({
              brandId: appConfig.brand.brandId,
              brandName: appConfig.brand.brandName,
              locationId: storeRow.location_id,
              locationName: appConfig.brand.locationName,
              marketLabel: appConfig.brand.marketLabel,
              storeName: storeRow.store_name,
              hours: storeRow.hours_text,
              pickupInstructions: storeRow.pickup_instructions,
              capabilities: appConfig.storeCapabilities
            })
          ];
        })
        .sort(compareInternalLocationSummaries);
    },
    async getInternalLocationSummary(locationId) {
      const storeRow = await db
        .selectFrom("catalog_store_configs")
        .selectAll()
        .where("location_id", "=", locationId)
        .executeTakeFirst();

      if (!storeRow) {
        return undefined;
      }

      const appConfigRow = await db
        .selectFrom("catalog_app_configs")
        .select("app_config_json")
        .where("location_id", "=", locationId)
        .executeTakeFirst();

      const appConfig = appConfigSchema.parse(appConfigRow?.app_config_json ?? defaultAppConfigPayload);

      return buildInternalLocationSummary({
        brandId: appConfig.brand.brandId,
        brandName: appConfig.brand.brandName,
        locationId: storeRow.location_id,
        locationName: appConfig.brand.locationName,
        marketLabel: appConfig.brand.marketLabel,
        storeName: storeRow.store_name,
        hours: storeRow.hours_text,
        pickupInstructions: storeRow.pickup_instructions,
        capabilities: appConfig.storeCapabilities
      });
    },
    async bootstrapInternalLocation(rawInput) {
      const input = internalLocationBootstrapSchema.parse(rawInput);
      const existingStoreConfigRow = await db
        .selectFrom("catalog_store_configs")
        .select(["prep_eta_minutes", "tax_rate_basis_points"])
        .where("location_id", "=", input.locationId)
        .executeTakeFirst();
      const existingAppConfigRow = await db
        .selectFrom("catalog_app_configs")
        .select(["brand_id"])
        .where("location_id", "=", input.locationId)
        .executeTakeFirst();

      const persistedBrandId = existingAppConfigRow?.brand_id ?? input.brandId;
      const nextAppConfig = resolveProvisionedAppConfigPayload({
        brandId: persistedBrandId,
        brandName: input.brandName,
        locationId: input.locationId,
        locationName: input.locationName,
        marketLabel: input.marketLabel,
        capabilities: input.capabilities
      });
      const storeName = input.storeName ?? input.locationName;
      const hours = input.hours ?? DEFAULT_STORE_HOURS;
      const pickupInstructions = input.pickupInstructions ?? defaultStoreConfigPayload.pickupInstructions;
      const seededMenu = buildProvisionedMenuPayload(input.locationId);

      await db.transaction().execute(async (trx) => {
        await trx
          .insertInto("catalog_store_configs")
          .values({
            brand_id: persistedBrandId,
            location_id: input.locationId,
            store_name: storeName,
            hours_text: hours,
            prep_eta_minutes: existingStoreConfigRow?.prep_eta_minutes ?? defaultStoreConfigPayload.prepEtaMinutes,
            tax_rate_basis_points:
              existingStoreConfigRow?.tax_rate_basis_points ?? defaultStoreConfigPayload.taxRateBasisPoints,
            pickup_instructions: pickupInstructions
          })
          .onConflict((oc) =>
            oc.column("location_id").doUpdateSet({
              brand_id: persistedBrandId,
              store_name: storeName,
              hours_text: hours,
              pickup_instructions: pickupInstructions
            })
          )
          .execute();

        await trx
          .insertInto("catalog_app_configs")
          .values({
            brand_id: persistedBrandId,
            location_id: input.locationId,
            app_config_json: nextAppConfig
          })
          .onConflict((oc) =>
            oc.columns(["brand_id", "location_id"]).doUpdateSet({
              app_config_json: nextAppConfig
            })
          )
          .execute();

        await trx
          .insertInto("catalog_menu_categories")
          .values(
            seededMenu.categories.map((category, index) => ({
              brand_id: persistedBrandId,
              location_id: input.locationId,
              category_id: category.id,
              title: category.title,
              sort_order: index
            }))
          )
          .onConflict((oc) => oc.columns(["location_id", "category_id"]).doNothing())
          .execute();

        await trx
          .insertInto("catalog_menu_items")
          .values(
            seededMenu.categories.flatMap((category) =>
              category.items.map((item, index) => ({
                brand_id: persistedBrandId,
                location_id: input.locationId,
                item_id: item.id,
                category_id: category.id,
                name: item.name,
                description: item.description,
                image_url: item.imageUrl ?? null,
                price_cents: item.priceCents,
                badge_codes_json: JSON.stringify(item.badgeCodes),
                customization_groups_json: JSON.stringify(item.customizationGroups ?? []),
                visible: item.visible,
                sort_order: index
              }))
            )
          )
          .onConflict((oc) => oc.columns(["location_id", "item_id"]).doNothing())
          .execute();
      });

      return buildInternalLocationSummary({
        brandId: nextAppConfig.brand.brandId,
        brandName: nextAppConfig.brand.brandName,
        locationId: input.locationId,
        locationName: nextAppConfig.brand.locationName,
        marketLabel: nextAppConfig.brand.marketLabel,
        storeName,
        hours,
        pickupInstructions,
        capabilities: nextAppConfig.storeCapabilities,
        action: existingStoreConfigRow ? "updated" : "created"
      });
    },
    async getAdminMenu() {
      const categories = await db
        .selectFrom("catalog_menu_categories")
        .selectAll()
        .where("brand_id", "=", DEFAULT_BRAND_ID)
        .where("location_id", "=", defaultMenuPayload.locationId)
        .orderBy("sort_order", "asc")
        .execute();

      const items = await db
        .selectFrom("catalog_menu_items")
        .selectAll()
        .where("brand_id", "=", DEFAULT_BRAND_ID)
        .where("location_id", "=", defaultMenuPayload.locationId)
        .orderBy("category_id", "asc")
        .orderBy("sort_order", "asc")
        .execute();

      const itemsByCategory = new Map<string, AdminMenuItem[]>();
      const categoryTitles = new Map(categories.map((category) => [category.category_id, category.title]));
      for (const item of items) {
        const existing = itemsByCategory.get(item.category_id) ?? [];
        existing.push(
          toAdminMenuItem({
            itemId: item.item_id,
            categoryId: item.category_id,
            categoryTitle: categoryTitles.get(item.category_id) ?? item.category_id,
            name: item.name,
            description: item.description,
            priceCents: item.price_cents,
            visible: item.visible,
            sortOrder: item.sort_order
          })
        );
        itemsByCategory.set(item.category_id, existing);
      }

      return buildAdminMenuResponse({
        locationId: defaultMenuPayload.locationId,
        categories: categories.map((category) => ({
          categoryId: category.category_id,
          title: category.title,
          items: itemsByCategory.get(category.category_id) ?? []
        }))
      });
    },
    async createAdminMenuItem(input) {
      const category = await db
        .selectFrom("catalog_menu_categories")
        .selectAll()
        .where("brand_id", "=", DEFAULT_BRAND_ID)
        .where("location_id", "=", defaultMenuPayload.locationId)
        .where("category_id", "=", input.categoryId)
        .executeTakeFirst();

      if (!category) {
        return undefined;
      }

      const nextSortOrderResult = await db
        .selectFrom("catalog_menu_items")
        .select((eb) => eb.fn.max<number>("sort_order").as("max_sort_order"))
        .where("brand_id", "=", DEFAULT_BRAND_ID)
        .where("location_id", "=", defaultMenuPayload.locationId)
        .where("category_id", "=", input.categoryId)
        .executeTakeFirst();
      const nextSortOrder = (nextSortOrderResult?.max_sort_order ?? -1) + 1;
      const itemId = createMenuItemId(input.name);

      await db
        .insertInto("catalog_menu_items")
        .values({
          brand_id: DEFAULT_BRAND_ID,
          location_id: defaultMenuPayload.locationId,
          item_id: itemId,
          category_id: input.categoryId,
          name: input.name,
          description: input.description ?? "",
          image_url: null,
          price_cents: input.priceCents,
          badge_codes_json: JSON.stringify([]),
          customization_groups_json: JSON.stringify([]),
          visible: input.visible,
          sort_order: nextSortOrder
        })
        .execute();

      return toAdminMenuItem({
        itemId,
        categoryId: input.categoryId,
        categoryTitle: category.title,
        name: input.name,
        description: input.description ?? "",
        priceCents: input.priceCents,
        visible: input.visible,
        sortOrder: nextSortOrder
      });
    },
    async updateAdminMenuItem(input) {
      const existingRow = await db
        .selectFrom("catalog_menu_items")
        .selectAll()
        .where("brand_id", "=", DEFAULT_BRAND_ID)
        .where("location_id", "=", defaultMenuPayload.locationId)
        .where("item_id", "=", input.itemId)
        .executeTakeFirst();

      if (!existingRow) {
        return undefined;
      }

      await db
        .updateTable("catalog_menu_items")
        .set({
          name: input.name,
          price_cents: input.priceCents,
          visible: input.visible
        })
        .where("brand_id", "=", DEFAULT_BRAND_ID)
        .where("location_id", "=", defaultMenuPayload.locationId)
        .where("item_id", "=", input.itemId)
        .executeTakeFirst();

      const category = await db
        .selectFrom("catalog_menu_categories")
        .selectAll()
        .where("brand_id", "=", DEFAULT_BRAND_ID)
        .where("location_id", "=", defaultMenuPayload.locationId)
        .where("category_id", "=", existingRow.category_id)
        .executeTakeFirst();

      return toAdminMenuItem({
        itemId: existingRow.item_id,
        categoryId: existingRow.category_id,
        categoryTitle: category?.title ?? existingRow.category_id,
        name: input.name,
        description: existingRow.description,
        priceCents: input.priceCents,
        visible: input.visible,
        sortOrder: existingRow.sort_order
      });
    },
    async updateAdminMenuItemVisibility(input) {
      const existingRow = await db
        .selectFrom("catalog_menu_items")
        .selectAll()
        .where("brand_id", "=", DEFAULT_BRAND_ID)
        .where("location_id", "=", defaultMenuPayload.locationId)
        .where("item_id", "=", input.itemId)
        .executeTakeFirst();

      if (!existingRow) {
        return undefined;
      }

      await db
        .updateTable("catalog_menu_items")
        .set({
          visible: input.visible
        })
        .where("brand_id", "=", DEFAULT_BRAND_ID)
        .where("location_id", "=", defaultMenuPayload.locationId)
        .where("item_id", "=", input.itemId)
        .executeTakeFirst();

      const category = await db
        .selectFrom("catalog_menu_categories")
        .selectAll()
        .where("brand_id", "=", DEFAULT_BRAND_ID)
        .where("location_id", "=", defaultMenuPayload.locationId)
        .where("category_id", "=", existingRow.category_id)
        .executeTakeFirst();

      return toAdminMenuItem({
        itemId: existingRow.item_id,
        categoryId: existingRow.category_id,
        categoryTitle: category?.title ?? existingRow.category_id,
        name: existingRow.name,
        description: existingRow.description,
        priceCents: existingRow.price_cents,
        visible: input.visible,
        sortOrder: existingRow.sort_order
      });
    },
    async deleteAdminMenuItem(itemId) {
      await db
        .deleteFrom("catalog_menu_items")
        .where("brand_id", "=", DEFAULT_BRAND_ID)
        .where("location_id", "=", defaultMenuPayload.locationId)
        .where("item_id", "=", itemId)
        .executeTakeFirst();

      return { success: true };
    },
    async getMenu() {
      const categories = await db
        .selectFrom("catalog_menu_categories")
        .selectAll()
        .where("brand_id", "=", DEFAULT_BRAND_ID)
        .where("location_id", "=", defaultMenuPayload.locationId)
        .orderBy("sort_order", "asc")
        .execute();

      if (categories.length === 0) {
        return defaultMenuPayload;
      }

      const items = await db
        .selectFrom("catalog_menu_items")
        .selectAll()
        .where("brand_id", "=", DEFAULT_BRAND_ID)
        .where("location_id", "=", defaultMenuPayload.locationId)
        .orderBy("category_id", "asc")
        .orderBy("sort_order", "asc")
        .execute();

      const itemsByCategory = new Map<string, MenuItem[]>();
      for (const item of items) {
        const existing = itemsByCategory.get(item.category_id) ?? [];
        existing.push({
          id: item.item_id,
          name: item.name,
          description: item.description,
          imageUrl: item.image_url ?? undefined,
          priceCents: item.price_cents,
          badgeCodes: toBadgeCodes(item.badge_codes_json),
          visible: item.visible,
          customizationGroups: toCustomizationGroups(item.customization_groups_json)
        });
        itemsByCategory.set(item.category_id, existing);
      }

      return menuResponseSchema.parse({
        locationId: defaultMenuPayload.locationId,
        currency: defaultMenuPayload.currency,
        categories: categories.map((category) => ({
          id: category.category_id,
          title: category.title,
          items: itemsByCategory.get(category.category_id) ?? []
        }))
      });
    },
    async getAdminStoreConfig() {
      const row = await db
        .selectFrom("catalog_store_configs")
        .selectAll()
        .where("brand_id", "=", DEFAULT_BRAND_ID)
        .where("location_id", "=", defaultStoreConfigPayload.locationId)
        .executeTakeFirst();

      if (!row) {
        return buildAdminStoreConfig({
          locationId: DEFAULT_LOCATION_ID,
          storeName: DEFAULT_LOCATION_NAME,
          hours: DEFAULT_STORE_HOURS,
          pickupInstructions: defaultStoreConfigPayload.pickupInstructions,
          capabilities: defaultAppConfigPayload.storeCapabilities
        });
      }

      const appConfigRow = await db
        .selectFrom("catalog_app_configs")
        .select("app_config_json")
        .where("brand_id", "=", DEFAULT_BRAND_ID)
        .where("location_id", "=", DEFAULT_LOCATION_ID)
        .executeTakeFirst();
      const appConfig = appConfigSchema.parse(appConfigRow?.app_config_json ?? defaultAppConfigPayload);

      return buildAdminStoreConfig({
        locationId: row.location_id,
        storeName: row.store_name,
        hours: row.hours_text,
        pickupInstructions: row.pickup_instructions,
        capabilities: appConfig.storeCapabilities
      });
    },
    async updateAdminStoreConfig(input) {
      const existingAppConfigRow = await db
        .selectFrom("catalog_app_configs")
        .select("app_config_json")
        .where("brand_id", "=", DEFAULT_BRAND_ID)
        .where("location_id", "=", DEFAULT_LOCATION_ID)
        .executeTakeFirst();
      const existingStoreConfigRow = await db
        .selectFrom("catalog_store_configs")
        .select(["prep_eta_minutes", "tax_rate_basis_points"])
        .where("brand_id", "=", DEFAULT_BRAND_ID)
        .where("location_id", "=", DEFAULT_LOCATION_ID)
        .executeTakeFirst();

      const currentAppConfig = appConfigSchema.parse(existingAppConfigRow?.app_config_json ?? defaultAppConfigPayload);
      const nextAppConfig = appConfigSchema.parse({
        ...currentAppConfig,
        brand: {
          ...currentAppConfig.brand,
          locationName: input.storeName
        },
        storeCapabilities: input.capabilities ?? currentAppConfig.storeCapabilities
      });

      await db.transaction().execute(async (trx) => {
        await trx
          .insertInto("catalog_store_configs")
          .values({
            brand_id: DEFAULT_BRAND_ID,
            location_id: defaultStoreConfigPayload.locationId,
            store_name: input.storeName,
            hours_text: input.hours,
            prep_eta_minutes: existingStoreConfigRow?.prep_eta_minutes ?? defaultStoreConfigPayload.prepEtaMinutes,
            tax_rate_basis_points:
              existingStoreConfigRow?.tax_rate_basis_points ?? defaultStoreConfigPayload.taxRateBasisPoints,
            pickup_instructions: input.pickupInstructions
          })
          .onConflict((oc) =>
            oc.column("location_id").doUpdateSet({
              brand_id: DEFAULT_BRAND_ID,
              store_name: input.storeName,
              hours_text: input.hours,
              pickup_instructions: input.pickupInstructions
            })
          )
          .execute();

        await trx
          .insertInto("catalog_app_configs")
          .values({
            brand_id: DEFAULT_BRAND_ID,
            location_id: DEFAULT_LOCATION_ID,
            app_config_json: nextAppConfig
          })
          .onConflict((oc) =>
            oc.columns(["brand_id", "location_id"]).doUpdateSet({
              app_config_json: nextAppConfig
            })
          )
          .execute();
      });

      return buildAdminStoreConfig({
        locationId: DEFAULT_LOCATION_ID,
        storeName: input.storeName,
        hours: input.hours,
        pickupInstructions: input.pickupInstructions,
        capabilities: nextAppConfig.storeCapabilities
      });
    },
    async getStoreConfig() {
      const row = await db
        .selectFrom("catalog_store_configs")
        .selectAll()
        .where("brand_id", "=", DEFAULT_BRAND_ID)
        .where("location_id", "=", defaultStoreConfigPayload.locationId)
        .executeTakeFirst();

      if (!row) {
        return defaultStoreConfigPayload;
      }

      return storeConfigResponseSchema.parse({
        locationId: row.location_id,
        prepEtaMinutes: row.prep_eta_minutes,
        taxRateBasisPoints: row.tax_rate_basis_points,
        pickupInstructions: row.pickup_instructions
      });
    },
    async pingDb() {
      await sql`SELECT 1`.execute(db);
    },
    async close() {
      await db.destroy();
  }
};
}

export async function createCatalogRepository(logger: FastifyBaseLogger): Promise<CatalogRepository> {
  const databaseUrl = getDatabaseUrl();
  const allowInMemory = allowsInMemoryPersistence();
  if (!databaseUrl) {
    if (!allowInMemory) {
      throw buildPersistenceStartupError({
        service: "catalog",
        reason: "missing_database_url"
      });
    }

    logger.warn({ backend: "memory" }, "catalog persistence backend selected with explicit in-memory mode");
    return createInMemoryRepository();
  }

  try {
    const repository = await createPostgresRepository(databaseUrl);
    logger.info({ backend: "postgres" }, "catalog persistence backend selected");
    return repository;
  } catch (error) {
    if (!allowInMemory) {
      logger.error({ error }, "failed to initialize postgres persistence");
      throw buildPersistenceStartupError({
        service: "catalog",
        reason: "postgres_initialization_failed"
      });
    }

    logger.error({ error }, "failed to initialize postgres persistence; using explicit in-memory fallback");
    return createInMemoryRepository();
  }
}

export type { CatalogRepository };
