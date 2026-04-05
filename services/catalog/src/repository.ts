import { randomUUID } from "node:crypto";
import type { FastifyBaseLogger } from "fastify";
import {
  adminMenuItemCreateSchema,
  adminMenuItemSchema,
  internalLocationBootstrapSchema,
  internalLocationSummarySchema,
  adminStoreConfigSchema,
  adminMutationSuccessSchema,
  appConfigSchema,
  type AdminStoreConfig,
  type AppConfig,
  type AppConfigStoreCapabilities,
  type InternalLocationBootstrap,
  type InternalLocationSummary,
  homeNewsCardCreateSchema,
  homeNewsCardSchema,
  homeNewsCardUpdateSchema,
  homeNewsCardVisibilityUpdateSchema,
  homeNewsCardsResponseSchema,
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

const defaultHomeNewsCardsPayload = homeNewsCardsResponseSchema.parse({
  locationId: DEFAULT_LOCATION_ID,
  cards: [
    {
      cardId: "honey-cardamom-cold-brew",
      label: "NEW DRINK",
      title: "Honey Cardamom Cold Brew",
      body: "Placeholder feature card for a seasonal drink launch with oat foam and orange peel.",
      note: "Available this week only.",
      sortOrder: 0,
      visible: true
    },
    {
      cardId: "afternoon-promo",
      label: "DISCOUNT",
      title: "20% Off After 3 PM",
      body: "Placeholder promo card for an afternoon pickup offer on any handcrafted drink.",
      note: "Weekdays only. In-store pickup.",
      sortOrder: 1,
      visible: true
    },
    {
      cardId: "memorial-day-hours",
      label: "HOLIDAY HOURS",
      title: "Adjusted Hours For Memorial Day",
      body: "Placeholder notice for holiday operations so guests can check changes before arriving.",
      note: "Open 8:00 AM to 2:00 PM.",
      sortOrder: 2,
      visible: true
    },
    {
      cardId: "mobile-orders-resume",
      label: "STORE UPDATE",
      title: "Mobile Orders Resume At 7 AM",
      body: "Placeholder operations card for service changes, maintenance windows, or staffing updates.",
      note: "Thanks for your patience.",
      sortOrder: 3,
      visible: true
    }
  ]
});

const defaultStoreConfigRecord: StoreConfigRecord = {
  locationId: DEFAULT_LOCATION_ID,
  hoursText: DEFAULT_STORE_HOURS,
  prepEtaMinutes: 12,
  taxRateBasisPoints: 600,
  pickupInstructions: "Pickup at the flagship order counter."
};

type MenuResponse = z.output<typeof menuResponseSchema>;
type HomeNewsCard = z.output<typeof homeNewsCardSchema>;
type HomeNewsCardsResponse = z.output<typeof homeNewsCardsResponseSchema>;
type StoreConfigResponse = z.output<typeof storeConfigResponseSchema>;
type MenuItem = z.output<typeof menuItemSchema>;
const homeNewsCardCreateWithDefaultsSchema = homeNewsCardCreateSchema;
const homeNewsCardUpdateWithDefaultsSchema = homeNewsCardUpdateSchema;
const homeNewsCardVisibilityUpdateWithDefaultsSchema = homeNewsCardVisibilityUpdateSchema;
const adminMenuItemWithCustomizationsSchema = adminMenuItemSchema.extend({
  customizationGroups: z.array(menuItemCustomizationGroupSchema).default([])
});
const adminMenuCategoryWithCustomizationsSchema = z.object({
  categoryId: z.string().min(1),
  title: z.string().min(1),
  items: z.array(adminMenuItemWithCustomizationsSchema)
});
const adminMenuResponseWithCustomizationsSchema = z.object({
  locationId: z.string().min(1),
  categories: z.array(adminMenuCategoryWithCustomizationsSchema)
});
type AdminMenuItemWithCustomizations = z.output<typeof adminMenuItemWithCustomizationsSchema>;
type AdminMenuResponseWithCustomizations = z.output<typeof adminMenuResponseWithCustomizationsSchema>;
const homeNewsCardWithDefaultsSchema = homeNewsCardSchema;
const homeNewsCardsResponseWithDefaultsSchema = homeNewsCardsResponseSchema;
type AdminHomeNewsCard = z.output<typeof homeNewsCardWithDefaultsSchema>;
type AdminHomeNewsCardsResponse = z.output<typeof homeNewsCardsResponseWithDefaultsSchema>;

type CatalogRepository = {
  backend: "memory" | "postgres";
  getAppConfig(): Promise<AppConfig>;
  listInternalLocations(): Promise<InternalLocationSummary[]>;
  getInternalLocationSummary(locationId: string): Promise<InternalLocationSummary | undefined>;
  bootstrapInternalLocation(input: InternalLocationBootstrap): Promise<InternalLocationSummary>;
  getAdminMenu(): Promise<AdminMenuResponseWithCustomizations>;
  getHomeNewsCards(): Promise<HomeNewsCardsResponse>;
  getAdminHomeNewsCards(): Promise<AdminHomeNewsCardsResponse>;
  createAdminHomeNewsCard(input: z.output<typeof homeNewsCardCreateWithDefaultsSchema>): Promise<AdminHomeNewsCard>;
  updateAdminHomeNewsCard(input: {
    cardId: string;
    label: string;
    title: string;
    body: string;
    note?: string;
    visible: boolean;
    sortOrder: number;
  }): Promise<AdminHomeNewsCard | undefined>;
  updateAdminHomeNewsCardVisibility(input: {
    cardId: string;
    visible: boolean;
  }): Promise<AdminHomeNewsCard | undefined>;
  deleteAdminHomeNewsCard(cardId: string): Promise<z.output<typeof adminMutationSuccessSchema>>;
  createAdminMenuItem(input: z.output<typeof adminMenuItemCreateSchema>): Promise<AdminMenuItemWithCustomizations | undefined>;
  updateAdminMenuItem(input: {
    itemId: string;
    name: string;
    priceCents: number;
    visible: boolean;
    customizationGroups?: unknown[];
  }): Promise<AdminMenuItemWithCustomizations | undefined>;
  updateAdminMenuItemVisibility(input: {
    itemId: string;
    visible: boolean;
  }): Promise<AdminMenuItemWithCustomizations | undefined>;
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

function toHomeNewsCard(input: {
  cardId: string;
  label: string;
  title: string;
  body: string;
  note?: string | null;
  sortOrder: number;
  visible: boolean;
}) {
  return homeNewsCardWithDefaultsSchema.parse({
    cardId: input.cardId,
    label: input.label,
    title: input.title,
    body: input.body,
    note: input.note === undefined || input.note === null ? undefined : input.note,
    sortOrder: input.sortOrder,
    visible: input.visible
  });
}

function buildHomeNewsCardsResponse(params: {
  locationId: string;
  cards: AdminHomeNewsCard[];
}) {
  return homeNewsCardsResponseWithDefaultsSchema.parse({
    locationId: params.locationId,
    cards: params.cards
  });
}

function createHomeNewsCardId(title: string) {
  const slug = title
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return `${slug.length > 0 ? slug : "card"}-${randomUUID().slice(0, 8)}`;
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
  customizationGroups?: unknown;
}) {
  const { customizationGroups, ...adminFields } = input;
  return adminMenuItemWithCustomizationsSchema.parse({
    ...adminMenuItemSchema.parse(adminFields),
    customizationGroups: customizationGroups === undefined ? [] : toCustomizationGroups(customizationGroups)
  });
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
    items: AdminMenuItemWithCustomizations[];
  }>;
}) {
  return adminMenuResponseWithCustomizationsSchema.parse({
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

const defaultStoreTimeZone = "America/Detroit";

type StoreConfigRecord = {
  locationId: string;
  hoursText: string;
  prepEtaMinutes: number;
  taxRateBasisPoints: number;
  pickupInstructions: string;
};

const weekdayIndexByLabel = new Map<string, number>([
  ["sun", 0],
  ["sunday", 0],
  ["mon", 1],
  ["monday", 1],
  ["tue", 2],
  ["tues", 2],
  ["tuesday", 2],
  ["wed", 3],
  ["weds", 3],
  ["wednesday", 3],
  ["thu", 4],
  ["thur", 4],
  ["thurs", 4],
  ["thursday", 4],
  ["fri", 5],
  ["friday", 5],
  ["sat", 6],
  ["saturday", 6]
]);

function resolveStoreTimeZone() {
  return process.env.STORE_TIME_ZONE?.trim() || defaultStoreTimeZone;
}

function parseClockTime(value: string) {
  const match = value.trim().match(/^(\d{1,2})(?::(\d{2}))?\s*([ap]m)$/i);
  if (!match) {
    return undefined;
  }

  const hour = Number.parseInt(match[1] ?? "", 10);
  const minute = Number.parseInt(match[2] ?? "0", 10);
  const period = match[3]?.toUpperCase();
  if (!Number.isInteger(hour) || !Number.isInteger(minute) || hour < 1 || hour > 12 || minute < 0 || minute > 59) {
    return undefined;
  }

  const normalizedHour = hour % 12;
  return (period === "PM" ? normalizedHour + 12 : normalizedHour) * 60 + minute;
}

function resolveDaySet(dayLabel: string) {
  const normalized = dayLabel.trim().toLowerCase();
  if (!normalized) {
    return undefined;
  }

  if (normalized === "daily" || normalized === "every day" || normalized === "everyday") {
    return new Set([0, 1, 2, 3, 4, 5, 6]);
  }

  if (normalized === "weekdays") {
    return new Set([1, 2, 3, 4, 5]);
  }

  if (normalized === "weekends") {
    return new Set([0, 6]);
  }

  const days = new Set<number>();
  const tokens = normalized.split(/(?:,|\/|&|\band\b)/).map((token) => token.trim()).filter(Boolean);
  for (const token of tokens) {
    const rangeParts = token.split("-").map((part) => part.trim()).filter(Boolean);
    if (rangeParts.length === 2) {
      const startDay = weekdayIndexByLabel.get(rangeParts[0] ?? "");
      const endDay = weekdayIndexByLabel.get(rangeParts[1] ?? "");
      if (startDay === undefined || endDay === undefined) {
        return undefined;
      }

      let current = startDay;
      while (true) {
        days.add(current);
        if (current === endDay) {
          break;
        }
        current = (current + 1) % 7;
      }
      continue;
    }

    const dayIndex = weekdayIndexByLabel.get(token);
    if (dayIndex === undefined) {
      return undefined;
    }

    days.add(dayIndex);
  }

  return days.size > 0 ? days : undefined;
}

function resolveZonedDateParts(now: Date, timeZone: string) {
  try {
    const formatter = new Intl.DateTimeFormat("en-US", {
      timeZone,
      weekday: "short",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23"
    });
    const parts = formatter.formatToParts(now);
    const weekdayLabel = parts.find((part) => part.type === "weekday")?.value?.toLowerCase();
    const hour = Number.parseInt(parts.find((part) => part.type === "hour")?.value ?? "", 10);
    const minute = Number.parseInt(parts.find((part) => part.type === "minute")?.value ?? "", 10);
    const weekday = weekdayLabel ? weekdayIndexByLabel.get(weekdayLabel) : undefined;

    if (weekday === undefined || !Number.isFinite(hour) || !Number.isFinite(minute)) {
      return undefined;
    }

    return {
      weekday,
      minutes: hour * 60 + minute
    };
  } catch {
    return undefined;
  }
}

function isStoreOpenAt(hoursText: string, now = new Date()) {
  const [dayLabel, timeLabel] = hoursText.split(/\s*·\s*/);
  if (!dayLabel || !timeLabel) {
    return false;
  }

  const daySet = resolveDaySet(dayLabel);
  if (!daySet) {
    return false;
  }

  const timeParts = timeLabel.split(/\s*[-–—]\s*/).filter(Boolean);
  if (timeParts.length !== 2) {
    return false;
  }

  const startMinutes = parseClockTime(timeParts[0] ?? "");
  const endMinutes = parseClockTime(timeParts[1] ?? "");
  if (startMinutes === undefined || endMinutes === undefined) {
    return false;
  }

  if (startMinutes === endMinutes) {
    return true;
  }

  const zonedDateParts = resolveZonedDateParts(now, resolveStoreTimeZone());
  if (!zonedDateParts) {
    return false;
  }

  if (startMinutes < endMinutes) {
    return daySet.has(zonedDateParts.weekday) && zonedDateParts.minutes >= startMinutes && zonedDateParts.minutes < endMinutes;
  }

  const previousWeekday = (zonedDateParts.weekday + 6) % 7;
  return (
    (daySet.has(zonedDateParts.weekday) && zonedDateParts.minutes >= startMinutes) ||
    (daySet.has(previousWeekday) && zonedDateParts.minutes < endMinutes)
  );
}

function buildStoreConfigResponse(input: StoreConfigRecord) {
  return storeConfigResponseSchema.parse({
    locationId: input.locationId,
    hoursText: input.hoursText,
    isOpen: isStoreOpenAt(input.hoursText),
    prepEtaMinutes: input.prepEtaMinutes,
    taxRateBasisPoints: input.taxRateBasisPoints,
    pickupInstructions: input.pickupInstructions
  });
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

function applyRuntimeFulfillmentMode(appConfig: AppConfig) {
  return appConfigSchema.parse(appConfig);
}

function createInMemoryRepository(): CatalogRepository {
  const defaultAppConfig = structuredClone(resolveDefaultAppConfigPayload());
  const appConfigsByLocation = new Map<string, AppConfig>([[DEFAULT_LOCATION_ID, defaultAppConfig]]);
  const menusByLocation = new Map<string, MenuResponse>([[DEFAULT_LOCATION_ID, structuredClone(defaultMenuPayload)]]);
  const homeNewsCardsByLocation = new Map<string, HomeNewsCardsResponse>([
    [DEFAULT_LOCATION_ID, structuredClone(defaultHomeNewsCardsPayload)]
  ]);
  const storeConfigsByLocation = new Map<string, StoreConfigRecord>([
    [DEFAULT_LOCATION_ID, structuredClone(defaultStoreConfigRecord)]
  ]);
  const adminStoreConfigsByLocation = new Map<string, AdminStoreConfig>([
    [
      DEFAULT_LOCATION_ID,
      buildAdminStoreConfig({
        locationId: DEFAULT_LOCATION_ID,
        storeName: DEFAULT_LOCATION_NAME,
        hours: DEFAULT_STORE_HOURS,
        pickupInstructions: defaultStoreConfigRecord.pickupInstructions,
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
        pickupInstructions: input.pickupInstructions ?? defaultStoreConfigRecord.pickupInstructions,
        capabilities: nextAppConfig.storeCapabilities
      });
      const nextStoreConfig: StoreConfigRecord = {
        locationId: input.locationId,
        hoursText: nextAdminStoreConfig.hours,
        prepEtaMinutes: defaultStoreConfigRecord.prepEtaMinutes,
        taxRateBasisPoints: defaultStoreConfigRecord.taxRateBasisPoints,
        pickupInstructions: nextAdminStoreConfig.pickupInstructions
      };

      appConfigsByLocation.set(input.locationId, nextAppConfig);
      adminStoreConfigsByLocation.set(input.locationId, nextAdminStoreConfig);
      storeConfigsByLocation.set(input.locationId, nextStoreConfig);
      if (!menusByLocation.has(input.locationId)) {
        menusByLocation.set(input.locationId, buildProvisionedMenuPayload(input.locationId));
      }
      if (!homeNewsCardsByLocation.has(input.locationId)) {
        homeNewsCardsByLocation.set(
          input.locationId,
          buildHomeNewsCardsResponse({
            locationId: input.locationId,
            cards: structuredClone(defaultHomeNewsCardsPayload.cards).map((card) => ({
              ...card,
              visible: card.visible
            }))
          })
        );
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
              sortOrder: index,
              customizationGroups: item.customizationGroups
            })
          )
        }))
      });
    },
    async getHomeNewsCards() {
      const cards = homeNewsCardsByLocation.get(DEFAULT_LOCATION_ID) ?? defaultHomeNewsCardsPayload;
      return buildHomeNewsCardsResponse({
        locationId: cards.locationId,
        cards: cards.cards.filter((card) => card.visible)
      });
    },
    async getAdminHomeNewsCards() {
      return homeNewsCardsByLocation.get(DEFAULT_LOCATION_ID) ?? defaultHomeNewsCardsPayload;
    },
    async createAdminHomeNewsCard(input) {
      const currentCards = homeNewsCardsByLocation.get(DEFAULT_LOCATION_ID) ?? defaultHomeNewsCardsPayload;
      const nextSortOrder =
        input.sortOrder ?? Math.max(0, ...currentCards.cards.map((card) => card.sortOrder)) + 1;
      const nextCard = toHomeNewsCard({
        cardId: createHomeNewsCardId(input.title),
        label: input.label,
        title: input.title,
        body: input.body,
        note: input.note,
        sortOrder: nextSortOrder,
        visible: input.visible
      });
      const nextCards = homeNewsCardsResponseWithDefaultsSchema.parse({
        ...currentCards,
        cards: [...currentCards.cards, nextCard].sort(
          (left, right) => left.sortOrder - right.sortOrder || left.cardId.localeCompare(right.cardId)
        )
      });

      homeNewsCardsByLocation.set(DEFAULT_LOCATION_ID, nextCards);
      return nextCard;
    },
    async updateAdminHomeNewsCard(input) {
      const currentCards = homeNewsCardsByLocation.get(DEFAULT_LOCATION_ID) ?? defaultHomeNewsCardsPayload;
      let updatedCard: AdminHomeNewsCard | undefined;
      const nextCards = homeNewsCardsResponseWithDefaultsSchema.parse({
        ...currentCards,
        cards: currentCards.cards.map((card) => {
          if (card.cardId !== input.cardId) {
            return card;
          }

          updatedCard = toHomeNewsCard({
            cardId: card.cardId,
            label: input.label,
            title: input.title,
            body: input.body,
            note: input.note,
            sortOrder: input.sortOrder,
            visible: input.visible
          });

          return updatedCard;
        })
      });

      if (updatedCard) {
        homeNewsCardsByLocation.set(DEFAULT_LOCATION_ID, nextCards);
      }

      return updatedCard;
    },
    async updateAdminHomeNewsCardVisibility(input) {
      const currentCards = homeNewsCardsByLocation.get(DEFAULT_LOCATION_ID) ?? defaultHomeNewsCardsPayload;
      let updatedCard: AdminHomeNewsCard | undefined;
      const nextCards = homeNewsCardsResponseWithDefaultsSchema.parse({
        ...currentCards,
        cards: currentCards.cards.map((card) => {
          if (card.cardId !== input.cardId) {
            return card;
          }

          updatedCard = toHomeNewsCard({
            cardId: card.cardId,
            label: card.label,
            title: card.title,
            body: card.body,
            note: card.note,
            sortOrder: card.sortOrder,
            visible: input.visible
          });

          return updatedCard;
        })
      });

      if (updatedCard) {
        homeNewsCardsByLocation.set(DEFAULT_LOCATION_ID, nextCards);
      }

      return updatedCard;
    },
    async deleteAdminHomeNewsCard(cardId) {
      const currentCards = homeNewsCardsByLocation.get(DEFAULT_LOCATION_ID) ?? defaultHomeNewsCardsPayload;
      const nextCards = homeNewsCardsResponseWithDefaultsSchema.parse({
        ...currentCards,
        cards: currentCards.cards.filter((card) => card.cardId !== cardId)
      });
      homeNewsCardsByLocation.set(DEFAULT_LOCATION_ID, nextCards);

      return { success: true };
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
        sortOrder: category.items.length,
        customizationGroups: nextItem.customizationGroups
      });
    },
    async updateAdminMenuItem(input) {
      let menu = menusByLocation.get(DEFAULT_LOCATION_ID) ?? defaultMenuPayload;
      let updatedItem: AdminMenuItemWithCustomizations | undefined;
      menu = menuResponseSchema.parse({
        ...menu,
        categories: menu.categories.map((category) => ({
          ...category,
          items: category.items.map((item, index) => {
            if (item.id !== input.itemId) {
              return item;
            }
            const customizationGroups =
              input.customizationGroups === undefined
                ? item.customizationGroups
                : toCustomizationGroups(input.customizationGroups);

            updatedItem = toAdminMenuItem({
              itemId: item.id,
              categoryId: category.id,
              categoryTitle: category.title,
              name: input.name,
              description: item.description,
              priceCents: input.priceCents,
              visible: input.visible,
              sortOrder: index,
              customizationGroups
            });

            return {
              ...item,
              name: input.name,
              priceCents: input.priceCents,
              visible: input.visible,
              customizationGroups
            };
          })
        }))
      });
      menusByLocation.set(DEFAULT_LOCATION_ID, menu);

      return updatedItem;
    },
    async updateAdminMenuItemVisibility(input) {
      let menu = menusByLocation.get(DEFAULT_LOCATION_ID) ?? defaultMenuPayload;
      let updatedItem: AdminMenuItemWithCustomizations | undefined;
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
              sortOrder: index,
              customizationGroups: item.customizationGroups
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
      const currentStoreConfig = storeConfigsByLocation.get(DEFAULT_LOCATION_ID) ?? defaultStoreConfigRecord;
      const nextAdminStoreConfig = buildAdminStoreConfig({
        locationId: DEFAULT_LOCATION_ID,
        storeName: input.storeName,
        hours: input.hours,
        pickupInstructions: input.pickupInstructions,
        capabilities: input.capabilities ?? currentAppConfig.storeCapabilities
      });
      const nextStoreConfig: StoreConfigRecord = {
        ...currentStoreConfig,
        hoursText: input.hours,
        pickupInstructions: input.pickupInstructions
      };
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
      return buildStoreConfigResponse(storeConfigsByLocation.get(DEFAULT_LOCATION_ID) ?? defaultStoreConfigRecord);
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

      await trx
        .insertInto("catalog_home_news_cards")
        .values(
          defaultHomeNewsCardsPayload.cards.map((card) => ({
            brand_id: DEFAULT_BRAND_ID,
            location_id: defaultHomeNewsCardsPayload.locationId,
            card_id: card.cardId,
            label: card.label,
            title: card.title,
            body: card.body,
            note: card.note ?? null,
            visible: card.visible,
            sort_order: card.sortOrder
          }))
        )
        .onConflict((oc) => oc.columns(["location_id", "card_id"]).doNothing())
        .execute();
    });
  }

  await db
    .insertInto("catalog_home_news_cards")
    .values(
      defaultHomeNewsCardsPayload.cards.map((card) => ({
        brand_id: DEFAULT_BRAND_ID,
        location_id: defaultHomeNewsCardsPayload.locationId,
        card_id: card.cardId,
        label: card.label,
        title: card.title,
        body: card.body,
        note: card.note ?? null,
        visible: card.visible,
        sort_order: card.sortOrder
      }))
    )
    .onConflict((oc) => oc.columns(["location_id", "card_id"]).doNothing())
    .execute();

  await db
    .insertInto("catalog_store_configs")
    .values({
      brand_id: DEFAULT_BRAND_ID,
      location_id: defaultStoreConfigRecord.locationId,
      store_name: DEFAULT_LOCATION_NAME,
      hours_text: DEFAULT_STORE_HOURS,
      prep_eta_minutes: defaultStoreConfigRecord.prepEtaMinutes,
      tax_rate_basis_points: defaultStoreConfigRecord.taxRateBasisPoints,
      pickup_instructions: defaultStoreConfigRecord.pickupInstructions
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
      const pickupInstructions = input.pickupInstructions ?? defaultStoreConfigRecord.pickupInstructions;
      const seededMenu = buildProvisionedMenuPayload(input.locationId);

      await db.transaction().execute(async (trx) => {
        await trx
          .insertInto("catalog_store_configs")
          .values({
            brand_id: persistedBrandId,
            location_id: input.locationId,
            store_name: storeName,
            hours_text: hours,
            prep_eta_minutes: existingStoreConfigRow?.prep_eta_minutes ?? defaultStoreConfigRecord.prepEtaMinutes,
            tax_rate_basis_points:
              existingStoreConfigRow?.tax_rate_basis_points ?? defaultStoreConfigRecord.taxRateBasisPoints,
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

        await trx
          .insertInto("catalog_home_news_cards")
          .values(
            defaultHomeNewsCardsPayload.cards.map((card) => ({
              brand_id: persistedBrandId,
              location_id: input.locationId,
              card_id: card.cardId,
              label: card.label,
              title: card.title,
              body: card.body,
              note: card.note ?? null,
              visible: card.visible,
              sort_order: card.sortOrder
            }))
          )
          .onConflict((oc) => oc.columns(["location_id", "card_id"]).doNothing())
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

      const itemsByCategory = new Map<string, AdminMenuItemWithCustomizations[]>();
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
            sortOrder: item.sort_order,
            customizationGroups: item.customization_groups_json
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
    async getHomeNewsCards() {
      const cards = await db
        .selectFrom("catalog_home_news_cards")
        .selectAll()
        .where("brand_id", "=", DEFAULT_BRAND_ID)
        .where("location_id", "=", defaultHomeNewsCardsPayload.locationId)
        .where("visible", "=", true)
        .orderBy("sort_order", "asc")
        .execute();

      return buildHomeNewsCardsResponse({
        locationId: defaultHomeNewsCardsPayload.locationId,
        cards: cards.map((card) =>
          toHomeNewsCard({
            cardId: card.card_id,
            label: card.label,
            title: card.title,
            body: card.body,
            note: card.note,
            sortOrder: card.sort_order,
            visible: card.visible
          })
        )
      });
    },
    async getAdminHomeNewsCards() {
      const cards = await db
        .selectFrom("catalog_home_news_cards")
        .selectAll()
        .where("brand_id", "=", DEFAULT_BRAND_ID)
        .where("location_id", "=", defaultHomeNewsCardsPayload.locationId)
        .orderBy("sort_order", "asc")
        .execute();

      return buildHomeNewsCardsResponse({
        locationId: defaultHomeNewsCardsPayload.locationId,
        cards: cards.map((card) =>
          toHomeNewsCard({
            cardId: card.card_id,
            label: card.label,
            title: card.title,
            body: card.body,
            note: card.note,
            sortOrder: card.sort_order,
            visible: card.visible
          })
        )
      });
    },
    async createAdminHomeNewsCard(input) {
      const nextSortOrderResult = await db
        .selectFrom("catalog_home_news_cards")
        .select((eb) => eb.fn.max<number>("sort_order").as("max_sort_order"))
        .where("brand_id", "=", DEFAULT_BRAND_ID)
        .where("location_id", "=", defaultHomeNewsCardsPayload.locationId)
        .executeTakeFirst();
      const nextSortOrder = input.sortOrder ?? (nextSortOrderResult?.max_sort_order ?? -1) + 1;
      const cardId = createHomeNewsCardId(input.title);

      await db
        .insertInto("catalog_home_news_cards")
        .values({
          brand_id: DEFAULT_BRAND_ID,
          location_id: defaultHomeNewsCardsPayload.locationId,
          card_id: cardId,
          label: input.label,
          title: input.title,
          body: input.body,
          note: input.note ?? null,
          visible: input.visible,
          sort_order: nextSortOrder
        })
        .execute();

      return toHomeNewsCard({
        cardId,
        label: input.label,
        title: input.title,
        body: input.body,
        note: input.note,
        sortOrder: nextSortOrder,
        visible: input.visible
      });
    },
    async updateAdminHomeNewsCard(input) {
      const existingRow = await db
        .selectFrom("catalog_home_news_cards")
        .selectAll()
        .where("brand_id", "=", DEFAULT_BRAND_ID)
        .where("location_id", "=", defaultHomeNewsCardsPayload.locationId)
        .where("card_id", "=", input.cardId)
        .executeTakeFirst();

      if (!existingRow) {
        return undefined;
      }

      await db
        .updateTable("catalog_home_news_cards")
        .set({
          label: input.label,
          title: input.title,
          body: input.body,
          note: input.note ?? null,
          visible: input.visible,
          sort_order: input.sortOrder
        })
        .where("brand_id", "=", DEFAULT_BRAND_ID)
        .where("location_id", "=", defaultHomeNewsCardsPayload.locationId)
        .where("card_id", "=", input.cardId)
        .executeTakeFirst();

      return toHomeNewsCard({
        cardId: existingRow.card_id,
        label: input.label,
        title: input.title,
        body: input.body,
        note: input.note,
        sortOrder: input.sortOrder,
        visible: input.visible
      });
    },
    async updateAdminHomeNewsCardVisibility(input) {
      const existingRow = await db
        .selectFrom("catalog_home_news_cards")
        .selectAll()
        .where("brand_id", "=", DEFAULT_BRAND_ID)
        .where("location_id", "=", defaultHomeNewsCardsPayload.locationId)
        .where("card_id", "=", input.cardId)
        .executeTakeFirst();

      if (!existingRow) {
        return undefined;
      }

      await db
        .updateTable("catalog_home_news_cards")
        .set({
          visible: input.visible
        })
        .where("brand_id", "=", DEFAULT_BRAND_ID)
        .where("location_id", "=", defaultHomeNewsCardsPayload.locationId)
        .where("card_id", "=", input.cardId)
        .executeTakeFirst();

      return toHomeNewsCard({
        cardId: existingRow.card_id,
        label: existingRow.label,
        title: existingRow.title,
        body: existingRow.body,
        note: existingRow.note,
        sortOrder: existingRow.sort_order,
        visible: input.visible
      });
    },
    async deleteAdminHomeNewsCard(cardId) {
      await db
        .deleteFrom("catalog_home_news_cards")
        .where("brand_id", "=", DEFAULT_BRAND_ID)
        .where("location_id", "=", defaultHomeNewsCardsPayload.locationId)
        .where("card_id", "=", cardId)
        .executeTakeFirst();

      return { success: true };
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
        sortOrder: nextSortOrder,
        customizationGroups: []
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
      const customizationGroups =
        input.customizationGroups === undefined
          ? toCustomizationGroups(existingRow.customization_groups_json)
          : toCustomizationGroups(input.customizationGroups);

      await db
        .updateTable("catalog_menu_items")
        .set({
          name: input.name,
          price_cents: input.priceCents,
          visible: input.visible,
          customization_groups_json: JSON.stringify(customizationGroups)
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
        sortOrder: existingRow.sort_order,
        customizationGroups
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
        sortOrder: existingRow.sort_order,
        customizationGroups: existingRow.customization_groups_json
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
        .where("location_id", "=", defaultStoreConfigRecord.locationId)
        .executeTakeFirst();

      if (!row) {
        return buildAdminStoreConfig({
          locationId: DEFAULT_LOCATION_ID,
          storeName: DEFAULT_LOCATION_NAME,
          hours: DEFAULT_STORE_HOURS,
          pickupInstructions: defaultStoreConfigRecord.pickupInstructions,
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
          location_id: defaultStoreConfigRecord.locationId,
          store_name: input.storeName,
          hours_text: input.hours,
          prep_eta_minutes: existingStoreConfigRow?.prep_eta_minutes ?? defaultStoreConfigRecord.prepEtaMinutes,
          tax_rate_basis_points:
            existingStoreConfigRow?.tax_rate_basis_points ?? defaultStoreConfigRecord.taxRateBasisPoints,
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
        .where("location_id", "=", defaultStoreConfigRecord.locationId)
        .executeTakeFirst();

      if (!row) {
        return buildStoreConfigResponse(defaultStoreConfigRecord);
      }

      return buildStoreConfigResponse({
        locationId: row.location_id,
        hoursText: row.hours_text,
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
