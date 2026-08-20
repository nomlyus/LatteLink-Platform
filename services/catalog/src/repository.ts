import { randomUUID } from "node:crypto";
import type { FastifyBaseLogger } from "fastify";
import {
  adminClientCreateRequestSchema,
  adminMenuItemCreateSchema,
  adminMenuItemSchema,
  appIdentityProfileSchema,
  internalAppIdentityProfileUpdateSchema,
  clientPaymentProfileSchema,
  homeNewsCardCreateSchema,
  homeNewsCardSchema,
  homeNewsCardsResponseSchema,
  internalLocationPaymentProfileUpdateSchema,
  internalOwnerOnboardingUpdateSchema,
  internalLocationBootstrapSchema,
  internalClientDetailSchema,
  internalClientListResponseSchema,
  internalClientSummarySchema,
  launchApprovalRequestSchema,
  mobileExperienceDocumentSchema,
  mobileExperienceDraftResponseSchema,
  mobileExperienceVersionsResponseSchema,
  mobileReleaseBuildJobApprovalSchema,
  mobileReleaseBuildJobCreateSchema,
  mobileReleaseBuildJobListResponseSchema,
  mobileReleaseBuildJobSchema,
  mobileReleaseBuildJobUpdateSchema,
  mobileReleaseProfileSchema,
  mobileReleaseProfileUpdateSchema,
  onboardingSummarySchema,
  operatorAppIdentityProfileUpdateSchema,
  operatorOnboardingUpdateSchema,
  paymentReadinessSchema,
  internalLocationSummarySchema,
  adminStoreConfigSchema,
  adminMutationSuccessSchema,
  appConfigSchema,
  type AdminClientCreateRequest,
  type AdminClientCreateResponse,
  type AdminStoreConfig,
  type AppConfig,
  type AppConfigStoreCapabilities,
  type AppIdentityProfile,
  type ClientPaymentProfile,
  type InternalAppIdentityProfileUpdate,
  type InternalClientDetail,
  type InternalClientListResponse,
  type InternalLocationBootstrap,
  type InternalLocationCapabilitiesUpdate,
  type InternalLocationPaymentProfileUpdate,
  type InternalLocationSummary,
  type InternalOwnerOnboardingUpdate,
  type LaunchApprovalRequest,
  type MobileExperienceDocument,
  type MobileExperienceDraftResponse,
  type MobileExperienceSaveDraftRequest,
  type MobileExperienceVersionsResponse,
  type MobileReleaseBuildJob,
  type MobileReleaseBuildJobApproval,
  type MobileReleaseBuildJobCreate,
  type MobileReleaseBuildJobListResponse,
  type MobileReleaseBuildJobUpdate,
  type MobileReleaseProfile,
  type MobileReleaseProfileUpdate,
  type OnboardingStatus,
  type OnboardingSummary,
  type OperatorOnboardingUpdate,
  type OperatorAppIdentityProfileUpdate,
  menuItemCustomizationGroupSchema,
  menuItemSchema,
  menuResponseSchema,
  storeConfigResponseSchema
} from "@lattelink/contracts-catalog";
import {
  allowsInMemoryPersistence,
  buildPersistenceStartupError,
  createPostgresDb,
  getDatabaseUrl,
  runMigrations,
  sql,
  writeAuditLog,
  type AuditLogEntry,
  type PersistenceDb
} from "@lattelink/persistence";
import { z } from "zod";
import {
  DEFAULT_BRAND_ID,
  DEFAULT_BRAND_NAME,
  DEFAULT_LOCATION_ID,
  DEFAULT_STORE_HOURS,
  resolveDefaultLocationId,
  resolveDefaultAppConfigPayload,
  resolveProvisionedAppConfigPayload
} from "./tenant.js";
import { resolveStoreHoursState } from "./store-hours.js";

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

const defaultStoreConfigRecord: StoreConfigRecord = {
  locationId: DEFAULT_LOCATION_ID,
  hoursText: DEFAULT_STORE_HOURS,
  prepEtaMinutes: 12,
  taxRateBasisPoints: 600,
  pickupInstructions: "Pickup at the flagship order counter."
};

type CatalogTimestamp = string | Date | null | undefined;

export function serializeCatalogTimestamp(value: CatalogTimestamp) {
  if (value === null || value === undefined) {
    return undefined;
  }

  return value instanceof Date ? value.toISOString() : value;
}

function mobileReleaseBuildStatusUpdate(status: MobileReleaseBuildJob["status"], errorMessage?: string) {
  if (status === "succeeded") {
    return { status: "submitted_for_review" as const, statusLabel: "Submitted for review", blockedReason: undefined };
  }
  if (status === "awaiting_approval") {
    return { status: "build_ready" as const, statusLabel: "Awaiting submission approval", blockedReason: undefined };
  }
  if (status === "submitting") {
    return { status: "submitted_for_review" as const, statusLabel: "Submitting for review", blockedReason: undefined };
  }
  if (status === "failed" || status === "canceled") {
    return {
      status: "blocked" as const,
      statusLabel: status === "failed" ? "Build failed" : "Build canceled",
      blockedReason: errorMessage ?? `Mobile release build ${status}`
    };
  }
  return { status: "build_configuring" as const, statusLabel: "Build in progress", blockedReason: undefined };
}

function generateInternalId(prefix: "brd" | "loc" | "ten") {
  return `${prefix}_${randomUUID().replaceAll("-", "").slice(0, 16)}`;
}

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

type MenuResponse = z.output<typeof menuResponseSchema>;
type StoreConfigResponse = z.output<typeof storeConfigResponseSchema>;
type MenuItem = z.output<typeof menuItemSchema>;
type HomeNewsCardsResponse = z.output<typeof homeNewsCardsResponseSchema>;
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
type AdminHomeNewsCard = z.output<typeof homeNewsCardSchema>;
type AdminHomeNewsCardsResponse = z.output<typeof homeNewsCardsResponseSchema>;

type CatalogRepository = {
  backend: "memory" | "postgres";
  createInternalClient(input: AdminClientCreateRequest): Promise<AdminClientCreateResponse>;
  listInternalClients(): Promise<InternalClientListResponse>;
  getInternalClient(tenantId: string): Promise<InternalClientDetail | undefined>;
  getAppConfig(locationId: string): Promise<AppConfig | undefined>;
  listInternalLocations(): Promise<InternalLocationSummary[]>;
  getInternalLocationSummary(locationId: string): Promise<InternalLocationSummary | undefined>;
  bootstrapInternalLocation(input: InternalLocationBootstrap): Promise<InternalLocationSummary>;
  updateInternalLocationCapabilities(
    locationId: string,
    input: InternalLocationCapabilitiesUpdate
  ): Promise<InternalLocationSummary | undefined>;
  getInternalLocationOnboarding(locationId: string): Promise<OnboardingSummary | undefined>;
  updateInternalLocationOnboarding(
    locationId: string,
    input: OperatorOnboardingUpdate
  ): Promise<OnboardingSummary | undefined>;
  updateInternalLocationOwnerOnboarding(
    locationId: string,
    input: InternalOwnerOnboardingUpdate
  ): Promise<OnboardingSummary | undefined>;
  updateOperatorLocationAppIdentity(
    locationId: string,
    input: OperatorAppIdentityProfileUpdate
  ): Promise<OnboardingSummary | undefined>;
  updateInternalLocationAppIdentity(
    locationId: string,
    input: InternalAppIdentityProfileUpdate
  ): Promise<OnboardingSummary | undefined>;
  approveInternalLocationLaunch(locationId: string, input: LaunchApprovalRequest): Promise<OnboardingSummary | undefined>;
  updateInternalLocationMobileRelease(
    locationId: string,
    input: MobileReleaseProfileUpdate
  ): Promise<OnboardingSummary | undefined>;
  createInternalLocationMobileReleaseBuildJob(
    locationId: string,
    input: MobileReleaseBuildJobCreate
  ): Promise<MobileReleaseBuildJob | undefined>;
  listInternalLocationMobileReleaseBuildJobs(locationId: string): Promise<MobileReleaseBuildJobListResponse>;
  claimNextMobileReleaseBuildJob(): Promise<MobileReleaseBuildJob | undefined>;
  updateMobileReleaseBuildJob(jobId: string, input: MobileReleaseBuildJobUpdate): Promise<MobileReleaseBuildJob | undefined>;
  approveMobileReleaseBuildJob(jobId: string, input: MobileReleaseBuildJobApproval): Promise<MobileReleaseBuildJob | undefined>;
  replaceInternalLocationMenu(locationId: string, input: MenuResponse): Promise<MenuResponse>;
  getInternalLocationPaymentProfile(locationId: string): Promise<ClientPaymentProfile | undefined>;
  updateInternalLocationPaymentProfile(
    locationId: string,
    input: InternalLocationPaymentProfileUpdate
  ): Promise<ClientPaymentProfile>;
  getAdminMenu(locationId: string): Promise<AdminMenuResponseWithCustomizations>;
  getHomeNewsCards(locationId: string): Promise<HomeNewsCardsResponse>;
  getAdminHomeNewsCards(locationId: string): Promise<AdminHomeNewsCardsResponse>;
  replaceAdminHomeNewsCards(locationId: string, input: HomeNewsCardsResponse): Promise<AdminHomeNewsCardsResponse>;
  createAdminHomeNewsCard(locationId: string, input: z.output<typeof homeNewsCardCreateSchema>): Promise<AdminHomeNewsCard>;
  updateAdminHomeNewsCard(locationId: string, input: {
    cardId: string;
    label: string;
    title: string;
    body: string;
    note?: string;
    visible: boolean;
    sortOrder: number;
  }): Promise<AdminHomeNewsCard | undefined>;
  updateAdminHomeNewsCardVisibility(locationId: string, input: {
    cardId: string;
    visible: boolean;
  }): Promise<AdminHomeNewsCard | undefined>;
  deleteAdminHomeNewsCard(locationId: string, cardId: string): Promise<z.output<typeof adminMutationSuccessSchema>>;
  createAdminMenuItem(locationId: string, input: z.output<typeof adminMenuItemCreateSchema>): Promise<AdminMenuItemWithCustomizations | undefined>;
  updateAdminMenuItem(locationId: string, input: {
    itemId: string;
    name: string;
    priceCents: number;
    visible: boolean;
    imageUrl?: string | null;
    customizationGroups?: unknown[];
  }): Promise<AdminMenuItemWithCustomizations | undefined>;
  updateAdminMenuItemVisibility(locationId: string, input: {
    itemId: string;
    visible: boolean;
  }): Promise<AdminMenuItemWithCustomizations | undefined>;
  deleteAdminMenuItem(locationId: string, itemId: string): Promise<z.output<typeof adminMutationSuccessSchema>>;
  getAdminStoreConfig(locationId: string): Promise<AdminStoreConfig>;
  updateAdminStoreConfig(locationId: string, input: {
    storeName: string;
    locationName: string;
    hours: string;
    pickupInstructions: string;
    taxRateBasisPoints?: number;
    capabilities?: AppConfigStoreCapabilities;
  }): Promise<AdminStoreConfig>;
  getPublishedMobileExperience(locationId: string): Promise<MobileExperienceDocument>;
  getAdminMobileExperience(locationId: string): Promise<MobileExperienceDraftResponse>;
  saveAdminMobileExperienceDraft(locationId: string, input: MobileExperienceSaveDraftRequest): Promise<MobileExperienceDraftResponse>;
  publishAdminMobileExperience(locationId: string, draftVersionId?: string): Promise<MobileExperienceDocument>;
  rollbackAdminMobileExperience(locationId: string, versionId: string): Promise<MobileExperienceDocument>;
  listAdminMobileExperienceVersions(locationId: string): Promise<MobileExperienceVersionsResponse>;
  getMenu(locationId: string): Promise<MenuResponse>;
  getStoreConfig(locationId: string): Promise<StoreConfigResponse | undefined>;
  writeAuditLog(entry: AuditLogEntry): Promise<void>;
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
  return homeNewsCardSchema.parse({
    cardId: input.cardId,
    label: input.label,
    title: input.title,
    body: input.body,
    note: input.note === undefined || input.note === null ? undefined : input.note,
    sortOrder: input.sortOrder,
    visible: input.visible
  });
}

function sortHomeNewsCards(cards: AdminHomeNewsCard[]) {
  return [...cards].sort((left, right) => left.sortOrder - right.sortOrder || left.cardId.localeCompare(right.cardId));
}

function buildHomeNewsCardsResponse(params: {
  locationId: string;
  cards: AdminHomeNewsCard[];
}) {
  return homeNewsCardsResponseSchema.parse({
    locationId: params.locationId,
    cards: sortHomeNewsCards(params.cards)
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
  imageUrl?: string;
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
  locationName: string;
  hours: string;
  pickupInstructions: string;
  taxRateBasisPoints: number;
  capabilities: AppConfigStoreCapabilities;
}) {
  return adminStoreConfigSchema.parse(input);
}

type StoreConfigRecord = {
  locationId: string;
  hoursText: string;
  prepEtaMinutes: number;
  taxRateBasisPoints: number;
  pickupInstructions: string;
};

function buildStoreConfigResponse(input: StoreConfigRecord) {
  const { isOpen, nextOpenAt } = resolveStoreHoursState(input.hoursText);
  return storeConfigResponseSchema.parse({
    locationId: input.locationId,
    hoursText: input.hoursText,
    isOpen,
    nextOpenAt,
    prepEtaMinutes: input.prepEtaMinutes,
    taxRateBasisPoints: input.taxRateBasisPoints,
    pickupInstructions: input.pickupInstructions
  });
}

function createMobileExperienceVersionId() {
  return `mex_${Date.now()}_${randomUUID().slice(0, 8)}`;
}

function buildDefaultMobileExperience(input: {
  locationId: string;
  appConfig?: AppConfig;
  published?: boolean;
}): MobileExperienceDocument {
  const now = new Date().toISOString();
  const appConfig = input.appConfig ?? resolveDefaultAppConfigPayload();
  return mobileExperienceDocumentSchema.parse({
    locationId: input.locationId,
    versionId: "default",
    status: input.published ? "published" : "draft",
    templateId: "coffee_standard",
    theme: {
      accentColor: appConfig.theme.accent,
      backgroundColor: appConfig.theme.background,
      foregroundColor: appConfig.theme.foreground
    },
    protectedNavigation: ["home", "menu", "orders", "account"],
    screens: [
      {
        id: "home",
        title: appConfig.brand.brandName,
        sections: [
          {
            id: "hero",
            type: "hero",
            visible: true,
            title: appConfig.brand.brandName,
            subtitle: appConfig.brand.locationName,
            action: "open_menu",
            actionLabel: "Order now"
          },
          {
            id: "quick-actions",
            type: "quick_actions",
            visible: true,
            title: "Quick actions",
            actions: ["open_menu", "open_orders", "open_account"]
          },
          {
            id: "featured-menu",
            type: "featured_menu",
            visible: true,
            title: "Popular today",
            itemLimit: 4
          },
          {
            id: "news-cards",
            type: "news_cards",
            visible: true,
            title: "Latest",
            cardLimit: 4
          }
        ]
      }
    ],
    createdAt: now,
    updatedAt: now,
    publishedAt: input.published ? now : undefined
  });
}

function buildMobileExperienceDraft(input: {
  locationId: string;
  appConfig?: AppConfig;
  draft?: MobileExperienceDocument;
  published?: MobileExperienceDocument;
}): MobileExperienceDraftResponse {
  const draft = input.draft ?? buildDefaultMobileExperience({ locationId: input.locationId, appConfig: input.appConfig });
  return mobileExperienceDraftResponseSchema.parse({
    locationId: input.locationId,
    draft,
    published: input.published
  });
}

function buildPaymentProfile(input: InternalLocationPaymentProfileUpdate & { createdAt?: string; updatedAt?: string }) {
  return clientPaymentProfileSchema.parse(input);
}

function buildPaymentReadiness(profile: ClientPaymentProfile | undefined) {
  if (!profile) {
    return paymentReadinessSchema.parse({
      ready: false,
      onboardingState: "unconfigured",
      missingRequiredFields: ["stripeAccountId", "stripeChargesEnabled", "stripePayoutsEnabled"]
    });
  }

  const missingRequiredFields: string[] = [];
  if (!profile.stripeAccountId) {
    missingRequiredFields.push("stripeAccountId");
  }
  if (!profile.stripeChargesEnabled) {
    missingRequiredFields.push("stripeChargesEnabled");
  }
  if (!profile.stripePayoutsEnabled) {
    missingRequiredFields.push("stripePayoutsEnabled");
  }

  return paymentReadinessSchema.parse({
    ready: missingRequiredFields.length === 0 && profile.stripeOnboardingStatus === "completed",
    onboardingState: profile.stripeOnboardingStatus,
    missingRequiredFields
  });
}

type ClientRecord = {
  tenantId: string;
  brandId: string;
  clientName: string;
  ownerEmail?: string;
  status: OnboardingStatus;
  createdAt?: string;
  updatedAt?: string;
};

type ClientLocationRecord = {
  tenantId: string;
  brandId: string;
  locationId: string;
  locationName: string;
  marketLabel: string;
  primaryLocation: boolean;
  createdAt?: string;
  updatedAt?: string;
};

type OnboardingProgressRecord = {
  tenantId: string;
  locationId: string;
  status: OnboardingStatus;
  ownerInvited: boolean;
  ownerActivated: boolean;
  businessProfileComplete: boolean;
  storeOperationsComplete: boolean;
  menuReady: boolean;
  teamConfiguredOrSkipped: boolean;
  testOrderCompleted: boolean;
  adminLaunchApproved: boolean;
  submittedForReviewAt?: string;
  approvedAt?: string;
  liveAt?: string;
  blockedReason?: string;
  notes?: string;
  updatedAt?: string;
};

function isMobileReleaseReady(profile: MobileReleaseProfile | undefined) {
  return profile ? ["approved", "ready_for_launch", "live"].includes(profile.status) : false;
}

type AppIdentityProfileInput = Omit<AppIdentityProfile, "readiness">;

const appIdentityRequiredFields: Array<{ key: keyof AppIdentityProfileInput; label: string }> = [
  { key: "appName", label: "app name" },
  { key: "displayName", label: "display name" },
  { key: "bundleIdentifier", label: "bundle identifier" },
  { key: "sku", label: "SKU" },
  { key: "subtitle", label: "subtitle" },
  { key: "description", label: "description" },
  { key: "supportUrl", label: "support URL" },
  { key: "privacyPolicyUrl", label: "privacy policy URL" }
];

function buildAppIdentityReadiness(profile: AppIdentityProfileInput | undefined) {
  if (!profile) {
    return {
      ready: false,
      missingRequiredFields: ["app identity profile"]
    };
  }

  const missingRequiredFields = appIdentityRequiredFields
    .filter((field) => {
      const value = profile[field.key];
      return typeof value !== "string" || value.trim().length === 0;
    })
    .map((field) => field.label);

  if (profile.assetMode === "provided") {
    if (!profile.iconAssetUrl) missingRequiredFields.push("app icon");
    if (!profile.splashAssetUrl) missingRequiredFields.push("splash asset");
    if (profile.screenshotAssetUrls.length === 0) missingRequiredFields.push("App Store screenshots");
  }

  if (profile.targetLocationIds.length === 0) {
    missingRequiredFields.push("target location");
  }

  const ready = profile.adminOverrideReady || missingRequiredFields.length === 0;
  return {
    ready,
    missingRequiredFields: ready ? [] : missingRequiredFields
  };
}

function buildAppIdentityProfile(input: AppIdentityProfileInput): AppIdentityProfile {
  const profile = appIdentityProfileSchema
    .omit({ readiness: true })
    .parse({
      ...input,
      targetLocationIds: input.targetLocationIds.length > 0 ? input.targetLocationIds : [input.locationId]
    });

  return appIdentityProfileSchema.parse({
    ...profile,
    readiness: buildAppIdentityReadiness(profile)
  });
}

function menuHasVisibleItems(menu: MenuResponse | undefined) {
  return Boolean(menu?.categories.some((category) => category.items.some((item) => item.visible)));
}

function buildChecklist(input: {
  progress: OnboardingProgressRecord;
  paymentProfile?: ClientPaymentProfile;
  menu?: MenuResponse;
  appIdentity?: AppIdentityProfile;
  mobileRelease?: MobileReleaseProfile;
}) {
  const paymentReadiness = buildPaymentReadiness(input.paymentProfile);
  const menuReady = menuHasVisibleItems(input.menu) || input.progress.menuReady;
  const appIdentityReadiness = input.appIdentity?.readiness ?? buildAppIdentityReadiness(undefined);
  const mobileReleaseReady = isMobileReleaseReady(input.mobileRelease);

  return [
    {
      id: "owner_invited",
      label: "Owner invited",
      status: input.progress.ownerInvited ? "complete" : "pending",
      passed: input.progress.ownerInvited
    },
    {
      id: "owner_activated",
      label: "Owner activated",
      status: input.progress.ownerActivated ? "complete" : "pending",
      passed: input.progress.ownerActivated
    },
    {
      id: "business_profile_complete",
      label: "Business profile complete",
      status: input.progress.businessProfileComplete ? "complete" : "pending",
      passed: input.progress.businessProfileComplete
    },
    {
      id: "store_operations_complete",
      label: "Store operations complete",
      status: input.progress.storeOperationsComplete ? "complete" : "pending",
      passed: input.progress.storeOperationsComplete
    },
    {
      id: "app_identity_ready",
      label: "App identity ready",
      status: appIdentityReadiness.ready ? "complete" : "pending",
      passed: appIdentityReadiness.ready,
      detail: appIdentityReadiness.ready
        ? undefined
        : `Missing ${appIdentityReadiness.missingRequiredFields.join(", ")}`
    },
    {
      id: "payments_connected",
      label: "Payments connected",
      status: paymentReadiness.ready ? "complete" : "pending",
      passed: paymentReadiness.ready,
      detail: paymentReadiness.ready
        ? undefined
        : `Missing ${paymentReadiness.missingRequiredFields.join(", ") || "completed Stripe onboarding"}`
    },
    {
      id: "menu_ready",
      label: "Menu ready",
      status: menuReady ? "complete" : "pending",
      passed: menuReady
    },
    {
      id: "team_configured_or_skipped",
      label: "Team configured or skipped",
      status: input.progress.teamConfiguredOrSkipped ? "complete" : "pending",
      passed: input.progress.teamConfiguredOrSkipped
    },
    {
      id: "test_order_completed",
      label: "Test order completed",
      status: input.progress.testOrderCompleted ? "complete" : "pending",
      passed: input.progress.testOrderCompleted
    },
    {
      id: "mobile_release_ready",
      label: "Mobile release ready",
      status: mobileReleaseReady ? "complete" : input.mobileRelease?.status === "blocked" ? "blocked" : "pending",
      passed: mobileReleaseReady,
      manual: true,
      detail: input.mobileRelease?.blockedReason
    },
    {
      id: "admin_launch_approved",
      label: "Admin launch approved",
      status: input.progress.adminLaunchApproved ? "complete" : "pending",
      passed: input.progress.adminLaunchApproved,
      manual: true
    }
  ] as const;
}

function deriveOnboardingStatus(progress: OnboardingProgressRecord, readyForReview: boolean): OnboardingStatus {
  if (progress.blockedReason) return "blocked";
  if (progress.liveAt) return "live";
  if (progress.adminLaunchApproved || progress.approvedAt) return "approved";
  if (readyForReview || progress.submittedForReviewAt) return "ready_for_review";
  if (progress.ownerActivated || progress.businessProfileComplete || progress.storeOperationsComplete) return "in_progress";
  if (progress.ownerInvited) return "invited";
  return progress.status;
}

function buildOnboardingSummary(input: {
  client: ClientRecord;
  location: ClientLocationRecord;
  locationSummary: InternalLocationSummary;
  progress: OnboardingProgressRecord;
  paymentProfile?: ClientPaymentProfile;
  menu?: MenuResponse;
  appIdentity?: AppIdentityProfile;
  mobileRelease?: MobileReleaseProfile;
}) {
  const checklist = buildChecklist(input);
  const launchBlockingIds = new Set(["owner_invited", "owner_activated", "mobile_release_ready", "admin_launch_approved"]);
  const readyForReview = checklist.every((item) => item.passed || launchBlockingIds.has(item.id));
  const status = deriveOnboardingStatus(input.progress, readyForReview);

  return onboardingSummarySchema.parse({
    tenantId: input.client.tenantId,
    brandId: input.client.brandId,
    brandName: input.locationSummary.brandName,
    locationId: input.location.locationId,
    locationName: input.location.locationName,
    marketLabel: input.location.marketLabel,
    status,
    readyForReview,
    checklist,
    paymentReadiness: buildPaymentReadiness(input.paymentProfile),
    appIdentity: input.appIdentity,
    mobileRelease: input.mobileRelease,
    submittedForReviewAt: input.progress.submittedForReviewAt,
    approvedAt: input.progress.approvedAt,
    liveAt: input.progress.liveAt,
    blockedReason: input.progress.blockedReason,
    updatedAt: input.progress.updatedAt
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
  taxRateBasisPoints: number;
  capabilities: AppConfigStoreCapabilities;
  paymentProfile?: ClientPaymentProfile;
  action?: "created" | "updated";
}) {
  return internalLocationSummarySchema.parse({
    ...input,
    paymentReadiness: buildPaymentReadiness(input.paymentProfile)
  });
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

function applyPaymentProfileToAppConfig(appConfig: AppConfig, profile?: ClientPaymentProfile) {
  if (!profile) {
    return appConfigSchema.parse(appConfig);
  }

  const readiness = buildPaymentReadiness(profile);

  return appConfigSchema.parse({
    ...appConfig,
    paymentCapabilities: {
      ...appConfig.paymentCapabilities,
      applePay: profile.applePayEnabled,
      card: profile.cardEnabled,
      refunds: profile.refundsEnabled,
      stripe: {
        enabled: Boolean(profile.stripeAccountId),
        onboarded: readiness.ready,
        dashboardEnabled: Boolean(profile.stripeDashboardEnabled && profile.stripeAccountId)
      }
    }
  });
}

function createInMemoryRepository(): CatalogRepository {
  const defaultAppConfig = structuredClone(resolveDefaultAppConfigPayload());
  const appConfigsByLocation = new Map<string, AppConfig>([[DEFAULT_LOCATION_ID, defaultAppConfig]]);
  const menusByLocation = new Map<string, MenuResponse>([[DEFAULT_LOCATION_ID, structuredClone(defaultMenuPayload)]]);
  const storeConfigsByLocation = new Map<string, StoreConfigRecord>([
    [DEFAULT_LOCATION_ID, structuredClone(defaultStoreConfigRecord)]
  ]);
  const homeNewsCardsByLocation = new Map<string, HomeNewsCardsResponse>([
    [DEFAULT_LOCATION_ID, structuredClone(defaultHomeNewsCardsPayload)]
  ]);
  const adminStoreConfigsByLocation = new Map<string, AdminStoreConfig>([
    [
      DEFAULT_LOCATION_ID,
      buildAdminStoreConfig({
        locationId: DEFAULT_LOCATION_ID,
        storeName: DEFAULT_BRAND_NAME,
        locationName: defaultAppConfig.brand.locationName,
        hours: DEFAULT_STORE_HOURS,
        pickupInstructions: defaultStoreConfigRecord.pickupInstructions,
        taxRateBasisPoints: defaultStoreConfigRecord.taxRateBasisPoints,
        capabilities: defaultAppConfig.storeCapabilities
      })
    ]
  ]);
  const paymentProfilesByLocation = new Map<string, ClientPaymentProfile>();
  const clientsByTenant = new Map<string, ClientRecord>();
  const clientLocationsByLocation = new Map<string, ClientLocationRecord>();
  const onboardingProgressByLocation = new Map<string, OnboardingProgressRecord>();
  const mobileReleaseProfilesByLocation = new Map<string, MobileReleaseProfile>();
  const mobileReleaseBuildJobsByLocation = new Map<string, MobileReleaseBuildJob[]>();
  const appIdentityProfilesByLocation = new Map<string, AppIdentityProfile>();
  const mobileExperienceDraftsByLocation = new Map<string, MobileExperienceDocument>();
  const mobileExperienceVersionsByLocation = new Map<string, MobileExperienceDocument[]>();

  async function buildMemoryOnboarding(locationId: string) {
    const location = clientLocationsByLocation.get(locationId);
    if (!location) {
      return undefined;
    }
    const client = clientsByTenant.get(location.tenantId);
    const locationSummary = await memoryRepository.getInternalLocationSummary(locationId);
    const progress = onboardingProgressByLocation.get(locationId);
    if (!client || !locationSummary || !progress) {
      return undefined;
    }

    return buildOnboardingSummary({
      client,
      location,
      locationSummary,
      progress,
      paymentProfile: paymentProfilesByLocation.get(locationId),
      menu: menusByLocation.get(locationId),
      appIdentity: appIdentityProfilesByLocation.get(locationId),
      mobileRelease: mobileReleaseProfilesByLocation.get(locationId)
    });
  }

  const memoryRepository: CatalogRepository = {
    backend: "memory",
    async createInternalClient(rawInput) {
      const input = adminClientCreateRequestSchema.parse(rawInput);
      const ownerEmail = input.ownerEmail.trim().toLowerCase();
      for (const client of clientsByTenant.values()) {
        if (client.ownerEmail === ownerEmail) {
          const location = Array.from(clientLocationsByLocation.values())
            .filter((candidate) => candidate.tenantId === client.tenantId)
            .sort((left, right) => Number(right.primaryLocation) - Number(left.primaryLocation))[0];
          if (location) {
            const onboarding = await buildMemoryOnboarding(location.locationId);
            if (onboarding) {
              return { tenantId: client.tenantId, locationId: location.locationId, onboarding };
            }
          }
        }
      }
      let tenantId = generateInternalId("ten");
      while (clientsByTenant.has(tenantId)) {
        tenantId = generateInternalId("ten");
      }
      let locationId = generateInternalId("loc");
      while (adminStoreConfigsByLocation.has(locationId) || clientLocationsByLocation.has(locationId)) {
        locationId = generateInternalId("loc");
      }
      const brandId = generateInternalId("brd");
      const now = new Date().toISOString();
      const locationSummary = await this.bootstrapInternalLocation({
        brandId,
        brandName: input.clientName,
        locationId,
        locationName: input.locationName,
        marketLabel: input.marketLabel,
        storeName: input.storeName ?? input.clientName,
        hours: input.hours,
        pickupInstructions: input.pickupInstructions,
        taxRateBasisPoints: input.taxRateBasisPoints,
        capabilities: input.capabilities
      });
      const client: ClientRecord = {
        tenantId,
        brandId,
        clientName: input.clientName,
        ownerEmail,
        status: "draft",
        createdAt: now,
        updatedAt: now
      };
      const location: ClientLocationRecord = {
        tenantId,
        brandId,
        locationId,
        locationName: input.locationName,
        marketLabel: input.marketLabel,
        primaryLocation: true,
        createdAt: now,
        updatedAt: now
      };
      const progress: OnboardingProgressRecord = {
        tenantId,
        locationId,
        status: "draft",
        ownerInvited: false,
        ownerActivated: false,
        businessProfileComplete: false,
        storeOperationsComplete: false,
        menuReady: false,
        teamConfiguredOrSkipped: false,
        testOrderCompleted: false,
        adminLaunchApproved: false,
        updatedAt: now
      };
      const mobileRelease = mobileReleaseProfileSchema.parse({
        locationId,
        status: "not_started",
        updatedAt: now
      });
      const appIdentity = buildAppIdentityProfile({
        locationId,
        appName: input.clientName,
        displayName: input.clientName.slice(0, 30),
        primaryCategory: "Food & Drink",
        keywords: [],
        screenshotAssetUrls: [],
        targetLocationIds: [locationId],
        assetMode: "placeholder",
        adminOverrideReady: false,
        updatedAt: now
      });

      clientsByTenant.set(tenantId, client);
      clientLocationsByLocation.set(locationId, location);
      onboardingProgressByLocation.set(locationId, progress);
      mobileReleaseProfilesByLocation.set(locationId, mobileRelease);
      appIdentityProfilesByLocation.set(locationId, appIdentity);

      return {
        tenantId,
        locationId,
        onboarding: buildOnboardingSummary({
          client,
          location,
          locationSummary,
          progress,
          paymentProfile: paymentProfilesByLocation.get(locationId),
          menu: menusByLocation.get(locationId),
          appIdentity,
          mobileRelease
        })
      };
    },
    async listInternalClients() {
      return internalClientListResponseSchema.parse({
        clients: Array.from(clientsByTenant.values())
          .map((client) => {
            const locations = Array.from(clientLocationsByLocation.values()).filter(
              (location) => location.tenantId === client.tenantId
            );
            const primaryLocation = locations.find((location) => location.primaryLocation) ?? locations[0];
            return internalClientSummarySchema.parse({
              tenantId: client.tenantId,
              brandId: client.brandId,
              clientName: client.clientName,
              status: client.status,
              primaryLocationId: primaryLocation?.locationId,
              locationCount: locations.length,
              createdAt: client.createdAt,
              updatedAt: client.updatedAt
            });
          })
          .sort((left, right) => left.clientName.localeCompare(right.clientName) || left.tenantId.localeCompare(right.tenantId))
      });
    },
    async getInternalClient(tenantId) {
      const client = clientsByTenant.get(tenantId);
      if (!client) {
        return undefined;
      }
      const locations = Array.from(clientLocationsByLocation.values()).filter((location) => location.tenantId === tenantId);
      const primaryLocation = locations.find((location) => location.primaryLocation) ?? locations[0];
      return internalClientDetailSchema.parse({
        tenantId: client.tenantId,
        brandId: client.brandId,
        clientName: client.clientName,
        status: client.status,
        primaryLocationId: primaryLocation?.locationId,
        locationCount: locations.length,
        createdAt: client.createdAt,
        updatedAt: client.updatedAt,
        locations,
        onboarding: primaryLocation ? await buildMemoryOnboarding(primaryLocation.locationId) : undefined
      });
    },
    async getAppConfig(locationId) {
      const appConfig = appConfigsByLocation.get(locationId);
      if (!appConfig) {
        return undefined;
      }

      return applyPaymentProfileToAppConfig(
        applyRuntimeFulfillmentMode(appConfig),
        paymentProfilesByLocation.get(locationId)
      );
    },
    async listInternalLocations() {
      return Array.from(adminStoreConfigsByLocation.entries())
        .flatMap(([locationId, adminStoreConfig]) => {
          const appConfig = appConfigsByLocation.get(locationId);
          const storeConfig = storeConfigsByLocation.get(locationId);
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
              taxRateBasisPoints: storeConfig?.taxRateBasisPoints ?? defaultStoreConfigRecord.taxRateBasisPoints,
              capabilities: appConfig.storeCapabilities,
              paymentProfile: paymentProfilesByLocation.get(locationId)
            })
          ];
        })
        .sort(compareInternalLocationSummaries);
    },
    async getInternalLocationSummary(locationId) {
      const adminStoreConfig = adminStoreConfigsByLocation.get(locationId);
      const appConfig = appConfigsByLocation.get(locationId);
      const storeConfig = storeConfigsByLocation.get(locationId);
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
        taxRateBasisPoints: storeConfig?.taxRateBasisPoints ?? defaultStoreConfigRecord.taxRateBasisPoints,
        capabilities: appConfig.storeCapabilities,
        paymentProfile: paymentProfilesByLocation.get(locationId)
      });
    },
    async bootstrapInternalLocation(rawInput) {
      const input = internalLocationBootstrapSchema.parse(rawInput);
      let locationId = input.locationId ?? generateInternalId("loc");
      while (!input.locationId && adminStoreConfigsByLocation.has(locationId)) {
        locationId = generateInternalId("loc");
      }
      const existingAppConfig = appConfigsByLocation.get(locationId);
      const brandId = existingAppConfig?.brand.brandId ?? input.brandId ?? generateInternalId("brd");
      const existing = adminStoreConfigsByLocation.get(locationId);
      const existingStoreConfig = storeConfigsByLocation.get(locationId);
      const taxRateBasisPoints =
        input.taxRateBasisPoints ?? existingStoreConfig?.taxRateBasisPoints ?? defaultStoreConfigRecord.taxRateBasisPoints;
      const nextAppConfig = existingAppConfig
        ? appConfigSchema.parse({
            ...existingAppConfig,
            brand: {
              ...existingAppConfig.brand,
              brandId,
              brandName: input.brandName,
              locationId,
              locationName: input.locationName,
              marketLabel: input.marketLabel
            },
            storeCapabilities: input.capabilities ?? existingAppConfig.storeCapabilities
          })
        : resolveProvisionedAppConfigPayload({
            brandId,
            brandName: input.brandName,
            locationId,
            locationName: input.locationName,
            marketLabel: input.marketLabel,
            capabilities: input.capabilities
          });
      const nextAdminStoreConfig = buildAdminStoreConfig({
        locationId,
        storeName: input.storeName ?? input.locationName,
        locationName: nextAppConfig.brand.locationName,
        hours: input.hours ?? DEFAULT_STORE_HOURS,
        pickupInstructions: input.pickupInstructions ?? defaultStoreConfigRecord.pickupInstructions,
        taxRateBasisPoints,
        capabilities: nextAppConfig.storeCapabilities
      });
      const nextStoreConfig: StoreConfigRecord = {
        locationId,
        hoursText: nextAdminStoreConfig.hours,
        prepEtaMinutes: existingStoreConfig?.prepEtaMinutes ?? defaultStoreConfigRecord.prepEtaMinutes,
        taxRateBasisPoints,
        pickupInstructions: nextAdminStoreConfig.pickupInstructions
      };

      appConfigsByLocation.set(locationId, nextAppConfig);
      adminStoreConfigsByLocation.set(locationId, nextAdminStoreConfig);
      storeConfigsByLocation.set(locationId, nextStoreConfig);
      if (input.paymentProfile) {
        paymentProfilesByLocation.set(
          locationId,
          buildPaymentProfile({
            ...input.paymentProfile,
            locationId,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
          })
        );
      }
      if (!existing && !menusByLocation.has(locationId)) {
        menusByLocation.set(locationId, buildProvisionedMenuPayload(locationId));
      }

      return buildInternalLocationSummary({
        brandId: nextAppConfig.brand.brandId,
        brandName: nextAppConfig.brand.brandName,
        locationId,
        locationName: nextAppConfig.brand.locationName,
        marketLabel: nextAppConfig.brand.marketLabel,
        storeName: nextAdminStoreConfig.storeName,
        hours: nextAdminStoreConfig.hours,
        pickupInstructions: nextAdminStoreConfig.pickupInstructions,
        taxRateBasisPoints: nextStoreConfig.taxRateBasisPoints,
        capabilities: nextAppConfig.storeCapabilities,
        paymentProfile: paymentProfilesByLocation.get(locationId),
        action: existing ? "updated" : "created"
      });
    },
    async updateInternalLocationCapabilities(locationId, input) {
      const appConfig = appConfigsByLocation.get(locationId);
      const adminStoreConfig = adminStoreConfigsByLocation.get(locationId);
      const storeConfig = storeConfigsByLocation.get(locationId);
      if (!appConfig || !adminStoreConfig || !storeConfig) {
        return undefined;
      }

      const nextAppConfig = appConfigSchema.parse({
        ...appConfig,
        storeCapabilities: input.capabilities
      });
      appConfigsByLocation.set(locationId, nextAppConfig);

      return buildInternalLocationSummary({
        brandId: nextAppConfig.brand.brandId,
        brandName: nextAppConfig.brand.brandName,
        locationId,
        locationName: nextAppConfig.brand.locationName,
        marketLabel: nextAppConfig.brand.marketLabel,
        storeName: adminStoreConfig.storeName,
        hours: adminStoreConfig.hours,
        pickupInstructions: adminStoreConfig.pickupInstructions,
        taxRateBasisPoints: storeConfig.taxRateBasisPoints,
        capabilities: nextAppConfig.storeCapabilities,
        paymentProfile: paymentProfilesByLocation.get(locationId),
        action: "updated"
      });
    },
    async getInternalLocationOnboarding(locationId) {
      return buildMemoryOnboarding(locationId);
    },
    async updateInternalLocationOnboarding(locationId, rawInput) {
      const input = operatorOnboardingUpdateSchema.parse(rawInput);
      const existing = onboardingProgressByLocation.get(locationId);
      if (!existing) {
        return undefined;
      }
      const now = new Date().toISOString();
      const next: OnboardingProgressRecord = {
        ...existing,
        businessProfileComplete: input.businessProfileComplete ?? existing.businessProfileComplete,
        storeOperationsComplete: input.storeOperationsComplete ?? existing.storeOperationsComplete,
        menuReady: input.menuReady ?? existing.menuReady,
        teamConfiguredOrSkipped: input.teamConfiguredOrSkipped ?? existing.teamConfiguredOrSkipped,
        testOrderCompleted: input.testOrderCompleted ?? existing.testOrderCompleted,
        blockedReason: input.blockedReason === null ? undefined : input.blockedReason ?? existing.blockedReason,
        notes: input.notes ?? existing.notes,
        status: input.readyForReview ? "ready_for_review" : existing.status,
        submittedForReviewAt: input.readyForReview ? existing.submittedForReviewAt ?? now : existing.submittedForReviewAt,
        updatedAt: now
      };
      onboardingProgressByLocation.set(locationId, next);
      const client = clientsByTenant.get(next.tenantId);
      if (client) {
        clientsByTenant.set(next.tenantId, {
          ...client,
          status: deriveOnboardingStatus(next, input.readyForReview ?? false),
          updatedAt: now
        });
      }
      return buildMemoryOnboarding(locationId);
    },
    async updateInternalLocationOwnerOnboarding(locationId, rawInput) {
      const input = internalOwnerOnboardingUpdateSchema.parse(rawInput);
      const existing = onboardingProgressByLocation.get(locationId);
      if (!existing) {
        return undefined;
      }
      const now = new Date().toISOString();
      const next: OnboardingProgressRecord = {
        ...existing,
        ownerInvited: input.ownerInvited ?? existing.ownerInvited,
        ownerActivated: input.ownerActivated ?? existing.ownerActivated,
        updatedAt: now
      };
      onboardingProgressByLocation.set(locationId, next);
      const client = clientsByTenant.get(next.tenantId);
      if (client) {
        clientsByTenant.set(next.tenantId, {
          ...client,
          status: deriveOnboardingStatus(next, false),
          updatedAt: now
        });
      }
      return buildMemoryOnboarding(locationId);
    },
    async updateOperatorLocationAppIdentity(locationId, rawInput) {
      const input = operatorAppIdentityProfileUpdateSchema.parse(rawInput);
      const existing = appIdentityProfilesByLocation.get(locationId);
      const location = clientLocationsByLocation.get(locationId);
      if (!existing || !location) {
        return undefined;
      }
      const next = buildAppIdentityProfile({
        ...existing,
        ...input,
        locationId,
        updatedAt: new Date().toISOString()
      });
      appIdentityProfilesByLocation.set(locationId, next);
      return buildMemoryOnboarding(locationId);
    },
    async updateInternalLocationAppIdentity(locationId, rawInput) {
      const input = internalAppIdentityProfileUpdateSchema.parse(rawInput);
      const existing = appIdentityProfilesByLocation.get(locationId);
      const location = clientLocationsByLocation.get(locationId);
      if (!existing || !location) {
        return undefined;
      }
      const next = buildAppIdentityProfile({
        ...existing,
        ...input,
        locationId,
        updatedAt: new Date().toISOString()
      });
      appIdentityProfilesByLocation.set(locationId, next);
      return buildMemoryOnboarding(locationId);
    },
    async approveInternalLocationLaunch(locationId, rawInput) {
      const input = launchApprovalRequestSchema.parse(rawInput);
      const existing = onboardingProgressByLocation.get(locationId);
      if (!existing) {
        return undefined;
      }
      const now = new Date().toISOString();
      const status = input.approved ? (input.live ? "live" : "approved") : "in_progress";
      const next: OnboardingProgressRecord = {
        ...existing,
        adminLaunchApproved: input.approved,
        status,
        approvedAt: input.approved ? existing.approvedAt ?? now : undefined,
        liveAt: input.approved && input.live ? existing.liveAt ?? now : undefined,
        notes: input.note ?? existing.notes,
        updatedAt: now
      };
      onboardingProgressByLocation.set(locationId, next);
      const client = clientsByTenant.get(next.tenantId);
      if (client) {
        clientsByTenant.set(next.tenantId, {
          ...client,
          status: next.status,
          updatedAt: now
        });
      }
      return buildMemoryOnboarding(locationId);
    },
    async updateInternalLocationMobileRelease(locationId, rawInput) {
      const input = mobileReleaseProfileUpdateSchema.parse(rawInput);
      const existing = mobileReleaseProfilesByLocation.get(locationId);
      const location = clientLocationsByLocation.get(locationId);
      if (!existing || !location) {
        return undefined;
      }
      const next = mobileReleaseProfileSchema.parse({
        ...existing,
        ...input,
        locationId,
        updatedAt: new Date().toISOString()
      });
      mobileReleaseProfilesByLocation.set(locationId, next);
      return buildMemoryOnboarding(locationId);
    },
    async createInternalLocationMobileReleaseBuildJob(locationId, rawInput) {
      const input = mobileReleaseBuildJobCreateSchema.parse(rawInput);
      const existingRelease = mobileReleaseProfilesByLocation.get(locationId);
      const location = clientLocationsByLocation.get(locationId);
      if (!existingRelease || !location) {
        return undefined;
      }
      const now = new Date().toISOString();
      const job = mobileReleaseBuildJobSchema.parse({
        jobId: randomUUID(),
        locationId,
        status: "queued",
        profile: input.profile,
        buildProfile: input.buildProfile,
        sourceCommitSha: input.sourceCommitSha,
        configHash: input.configHash,
        approvalRequired: true,
        appStoreReviewNotes: input.appStoreReviewNotes,
        requestedBy: input.requestedBy,
        createdAt: now,
        updatedAt: now
      });
      const jobs = mobileReleaseBuildJobsByLocation.get(locationId) ?? [];
      mobileReleaseBuildJobsByLocation.set(locationId, [job, ...jobs]);
      mobileReleaseProfilesByLocation.set(
        locationId,
        mobileReleaseProfileSchema.parse({
          ...existingRelease,
          status: "build_configuring",
          statusLabel: "Build job queued",
          buildProfile: input.buildProfile,
          sourceCommitSha: input.sourceCommitSha,
          configHash: input.configHash,
          appStoreReviewNotes: input.appStoreReviewNotes ?? existingRelease.appStoreReviewNotes,
          updatedAt: now
        })
      );
      return job;
    },
    async listInternalLocationMobileReleaseBuildJobs(locationId) {
      return mobileReleaseBuildJobListResponseSchema.parse({
        jobs: mobileReleaseBuildJobsByLocation.get(locationId) ?? []
      });
    },
    async claimNextMobileReleaseBuildJob() {
      for (const jobs of mobileReleaseBuildJobsByLocation.values()) {
        const queuedJob = jobs.find((job) => job.status === "queued");
        if (!queuedJob) {
          continue;
        }

        const now = new Date().toISOString();
        const runningJob = mobileReleaseBuildJobSchema.parse({
          ...queuedJob,
          status: "running",
          startedAt: now,
          updatedAt: now
        });
        const nextJobs = jobs.map((job) => (job.jobId === runningJob.jobId ? runningJob : job));
        mobileReleaseBuildJobsByLocation.set(runningJob.locationId, nextJobs);
        return runningJob;
      }

      return undefined;
    },
    async updateMobileReleaseBuildJob(jobId, rawInput) {
      const input = mobileReleaseBuildJobUpdateSchema.parse(rawInput);
      for (const [locationId, jobs] of mobileReleaseBuildJobsByLocation.entries()) {
        const current = jobs.find((job) => job.jobId === jobId);
        if (!current) {
          continue;
        }

        const now = new Date().toISOString();
        const terminal = input.status === "succeeded" || input.status === "failed" || input.status === "canceled";
        const updated = mobileReleaseBuildJobSchema.parse({
          ...current,
          status: input.status,
          easBuildId: input.easBuildId ?? current.easBuildId,
          easSubmissionId: input.easSubmissionId ?? current.easSubmissionId,
          approvedAt: input.approvedAt ?? current.approvedAt,
          approvedBy: input.approvedBy ?? current.approvedBy,
          errorMessage: input.errorMessage,
          updatedAt: now,
          ...(terminal ? { finishedAt: now } : {})
        });
        mobileReleaseBuildJobsByLocation.set(
          locationId,
          jobs.map((job) => (job.jobId === jobId ? updated : job))
        );
        const existingRelease = mobileReleaseProfilesByLocation.get(locationId);
        if (existingRelease) {
          const releaseUpdate = mobileReleaseBuildStatusUpdate(input.status, input.errorMessage);
          mobileReleaseProfilesByLocation.set(
            locationId,
            mobileReleaseProfileSchema.parse({
              ...existingRelease,
              ...releaseUpdate,
              locationId,
              updatedAt: now
            })
          );
        }
        return updated;
      }

      return undefined;
    },
    async approveMobileReleaseBuildJob(jobId, rawInput) {
      const input = mobileReleaseBuildJobApprovalSchema.parse(rawInput);
      for (const jobs of mobileReleaseBuildJobsByLocation.values()) {
        const current = jobs.find((job) => job.jobId === jobId);
        if (!current || current.status !== "awaiting_approval") continue;
        return this.updateMobileReleaseBuildJob(jobId, {
          status: "queued",
          approvedAt: new Date().toISOString(),
          approvedBy: input.approvedBy
        });
      }
      return undefined;
    },
    async getInternalLocationPaymentProfile(locationId) {
      return paymentProfilesByLocation.get(locationId);
    },
    async updateInternalLocationPaymentProfile(locationId, rawInput) {
      const input = internalLocationPaymentProfileUpdateSchema.parse({
        ...rawInput,
        locationId
      });
      const existing = paymentProfilesByLocation.get(locationId);
      const next = buildPaymentProfile({
        ...input,
        createdAt: existing?.createdAt ?? new Date().toISOString(),
        updatedAt: new Date().toISOString()
      });
      paymentProfilesByLocation.set(locationId, next);
      return next;
    },
    async replaceInternalLocationMenu(locationId, input) {
      const nextMenu = menuResponseSchema.parse({
        ...input,
        locationId
      });
      menusByLocation.set(locationId, nextMenu);
      return nextMenu;
    },
    async getAdminMenu(locationId) {
      const menu = menusByLocation.get(locationId) ?? defaultMenuPayload;
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
              imageUrl: item.imageUrl,
              priceCents: item.priceCents,
              visible: item.visible,
              sortOrder: index,
              customizationGroups: item.customizationGroups
            })
          )
        }))
      });
    },
    async getHomeNewsCards(locationId) {
      return homeNewsCardsByLocation.get(locationId) ?? buildHomeNewsCardsResponse({
        locationId,
        cards: []
      });
    },
    async getAdminHomeNewsCards(locationId) {
      return homeNewsCardsByLocation.get(locationId) ?? buildHomeNewsCardsResponse({
        locationId,
        cards: []
      });
    },
    async replaceAdminHomeNewsCards(locationId, input) {
      const nextCards = buildHomeNewsCardsResponse({
        locationId: input.locationId,
        cards: input.cards.map((card) =>
          toHomeNewsCard({
            cardId: card.cardId,
            label: card.label,
            title: card.title,
            body: card.body,
            note: card.note,
            sortOrder: card.sortOrder,
            visible: card.visible
          })
        )
      });

      homeNewsCardsByLocation.set(input.locationId, nextCards);
      return nextCards;
    },
    async createAdminHomeNewsCard(locationId, input) {
      const currentCards = homeNewsCardsByLocation.get(locationId)?.cards ?? defaultHomeNewsCardsPayload.cards;
      const nextSortOrder = input.sortOrder ?? (currentCards.reduce((max, card) => Math.max(max, card.sortOrder), -1) + 1);
      const cardId = createHomeNewsCardId(input.title);
      const nextCards = buildHomeNewsCardsResponse({
        locationId,
        cards: [
          ...currentCards,
          toHomeNewsCard({
            cardId,
            label: input.label,
            title: input.title,
            body: input.body,
            note: input.note,
            sortOrder: nextSortOrder,
            visible: input.visible
          })
        ]
      });

      homeNewsCardsByLocation.set(locationId, nextCards);
      return nextCards.cards.find((card) => card.cardId === cardId)!;
    },
    async updateAdminHomeNewsCard(locationId, input) {
      const existingCards = homeNewsCardsByLocation.get(locationId)?.cards ?? defaultHomeNewsCardsPayload.cards;
      const existingCard = existingCards.find((card) => card.cardId === input.cardId);
      if (!existingCard) {
        return undefined;
      }

      const nextCards = buildHomeNewsCardsResponse({
        locationId,
        cards: existingCards.map((card) =>
          card.cardId === input.cardId
            ? toHomeNewsCard({
                cardId: card.cardId,
                label: input.label,
                title: input.title,
                body: input.body,
                note: input.note,
                sortOrder: input.sortOrder,
                visible: input.visible
              })
            : card
        )
      });

      homeNewsCardsByLocation.set(locationId, nextCards);
      return nextCards.cards.find((card) => card.cardId === input.cardId);
    },
    async updateAdminHomeNewsCardVisibility(locationId, input) {
      const existingCards = homeNewsCardsByLocation.get(locationId)?.cards ?? defaultHomeNewsCardsPayload.cards;
      const existingCard = existingCards.find((card) => card.cardId === input.cardId);
      if (!existingCard) {
        return undefined;
      }

      const nextCards = buildHomeNewsCardsResponse({
        locationId,
        cards: existingCards.map((card) =>
          card.cardId === input.cardId ? { ...card, visible: input.visible } : card
        )
      });

      homeNewsCardsByLocation.set(locationId, nextCards);
      return nextCards.cards.find((card) => card.cardId === input.cardId);
    },
    async deleteAdminHomeNewsCard(locationId, cardId) {
      const existingCards = homeNewsCardsByLocation.get(locationId)?.cards ?? defaultHomeNewsCardsPayload.cards;
      const nextCards = buildHomeNewsCardsResponse({
        locationId,
        cards: existingCards.filter((card) => card.cardId !== cardId)
      });

      homeNewsCardsByLocation.set(locationId, nextCards);
      return { success: true };
    },
    async createAdminMenuItem(locationId, input) {
      const currentMenu = menusByLocation.get(locationId) ?? defaultMenuPayload;
      let menu = currentMenu;
      const category = menu.categories.find((entry) => entry.id === input.categoryId);
      if (!category) {
        return undefined;
      }

      const nextItem = {
        id: createMenuItemId(input.name),
        name: input.name,
        description: input.description ?? "",
        imageUrl: input.imageUrl ?? undefined,
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
      menusByLocation.set(locationId, menu);

      return toAdminMenuItem({
        itemId: nextItem.id,
        categoryId: category.id,
        categoryTitle: category.title,
        name: nextItem.name,
        description: nextItem.description,
        imageUrl: nextItem.imageUrl,
        priceCents: nextItem.priceCents,
        visible: nextItem.visible,
        sortOrder: category.items.length,
        customizationGroups: nextItem.customizationGroups
      });
    },
    async updateAdminMenuItem(locationId, input) {
      let menu = menusByLocation.get(locationId) ?? defaultMenuPayload;
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
              imageUrl: input.imageUrl === undefined ? item.imageUrl : input.imageUrl ?? undefined,
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
              imageUrl: input.imageUrl === undefined ? item.imageUrl : input.imageUrl ?? undefined,
              customizationGroups
            };
          })
        }))
      });
      menusByLocation.set(locationId, menu);

      return updatedItem;
    },
    async updateAdminMenuItemVisibility(locationId, input) {
      let menu = menusByLocation.get(locationId) ?? defaultMenuPayload;
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
              imageUrl: item.imageUrl,
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
      menusByLocation.set(locationId, menu);

      return updatedItem;
    },
    async deleteAdminMenuItem(locationId, itemId) {
      let menu = menusByLocation.get(locationId) ?? defaultMenuPayload;
      menu = menuResponseSchema.parse({
        ...menu,
        categories: menu.categories.map((category) => ({
          ...category,
          items: category.items.filter((item) => item.id !== itemId)
        }))
      });
      menusByLocation.set(locationId, menu);

      return { success: true };
    },
    async getAdminStoreConfig(locationId) {
      return adminStoreConfigsByLocation.get(locationId) ?? adminStoreConfigsByLocation.get(DEFAULT_LOCATION_ID)!;
    },
    async updateAdminStoreConfig(locationId, input) {
      const currentAppConfig = appConfigsByLocation.get(locationId) ?? defaultAppConfig;
      const currentStoreConfig = storeConfigsByLocation.get(locationId) ?? defaultStoreConfigRecord;
      const taxRateBasisPoints = input.taxRateBasisPoints ?? currentStoreConfig.taxRateBasisPoints;
      const nextAdminStoreConfig = buildAdminStoreConfig({
        locationId,
        storeName: input.storeName,
        locationName: input.locationName,
        hours: input.hours,
        pickupInstructions: input.pickupInstructions,
        taxRateBasisPoints,
        capabilities: input.capabilities ?? currentAppConfig.storeCapabilities
      });
      const nextStoreConfig: StoreConfigRecord = {
        ...currentStoreConfig,
        hoursText: input.hours,
        taxRateBasisPoints,
        pickupInstructions: input.pickupInstructions
      };
      const nextAppConfig = appConfigSchema.parse({
        ...currentAppConfig,
        brand: {
          ...currentAppConfig.brand,
          brandName: input.storeName,
          locationName: input.locationName
        },
        storeCapabilities: input.capabilities ?? currentAppConfig.storeCapabilities
      });
      adminStoreConfigsByLocation.set(locationId, nextAdminStoreConfig);
      storeConfigsByLocation.set(locationId, nextStoreConfig);
      appConfigsByLocation.set(locationId, nextAppConfig);

      return nextAdminStoreConfig;
    },
    async getPublishedMobileExperience(locationId) {
      const versions = mobileExperienceVersionsByLocation.get(locationId) ?? [];
      const latest = versions[0];
      if (latest) {
        return mobileExperienceDocumentSchema.parse(latest);
      }

      return buildDefaultMobileExperience({
        locationId,
        appConfig: appConfigsByLocation.get(locationId) ?? defaultAppConfig,
        published: true
      });
    },
    async getAdminMobileExperience(locationId) {
      return buildMobileExperienceDraft({
        locationId,
        appConfig: appConfigsByLocation.get(locationId) ?? defaultAppConfig,
        draft: mobileExperienceDraftsByLocation.get(locationId),
        published: mobileExperienceVersionsByLocation.get(locationId)?.[0]
      });
    },
    async saveAdminMobileExperienceDraft(locationId, input) {
      const existing = mobileExperienceDraftsByLocation.get(locationId);
      const now = new Date().toISOString();
      const draft = mobileExperienceDocumentSchema.parse({
        ...input,
        locationId,
        versionId: input.versionId ?? existing?.versionId ?? createMobileExperienceVersionId(),
        status: "draft",
        createdAt: existing?.createdAt ?? now,
        updatedAt: now
      });
      mobileExperienceDraftsByLocation.set(locationId, draft);

      return this.getAdminMobileExperience(locationId);
    },
    async publishAdminMobileExperience(locationId, draftVersionId) {
      const draft = mobileExperienceDraftsByLocation.get(locationId) ??
        buildDefaultMobileExperience({
          locationId,
          appConfig: appConfigsByLocation.get(locationId) ?? defaultAppConfig
        });
      if (draftVersionId && draft.versionId !== draftVersionId) {
        throw new Error("Draft version no longer matches the latest saved draft.");
      }
      const now = new Date().toISOString();
      const published = mobileExperienceDocumentSchema.parse({
        ...draft,
        locationId,
        versionId: createMobileExperienceVersionId(),
        status: "published",
        createdAt: now,
        updatedAt: now,
        publishedAt: now
      });
      mobileExperienceVersionsByLocation.set(locationId, [
        published,
        ...(mobileExperienceVersionsByLocation.get(locationId) ?? [])
      ]);
      mobileExperienceDraftsByLocation.set(locationId, mobileExperienceDocumentSchema.parse({
        ...published,
        status: "draft",
        publishedAt: undefined
      }));
      return published;
    },
    async rollbackAdminMobileExperience(locationId, versionId) {
      const source = (mobileExperienceVersionsByLocation.get(locationId) ?? []).find(
        (version) => version.versionId === versionId
      );
      if (!source) {
        throw new Error("Mobile experience version was not found.");
      }

      const now = new Date().toISOString();
      const published = mobileExperienceDocumentSchema.parse({
        ...source,
        locationId,
        versionId: createMobileExperienceVersionId(),
        status: "published",
        createdAt: now,
        updatedAt: now,
        publishedAt: now
      });
      mobileExperienceVersionsByLocation.set(locationId, [
        published,
        ...(mobileExperienceVersionsByLocation.get(locationId) ?? [])
      ]);
      mobileExperienceDraftsByLocation.set(locationId, mobileExperienceDocumentSchema.parse({
        ...published,
        status: "draft",
        publishedAt: undefined
      }));
      return published;
    },
    async listAdminMobileExperienceVersions(locationId) {
      return mobileExperienceVersionsResponseSchema.parse({
        locationId,
        versions: mobileExperienceVersionsByLocation.get(locationId) ?? []
      });
    },
    async getMenu(locationId) {
      return menusByLocation.get(locationId) ?? menuResponseSchema.parse({
        locationId,
        currency: defaultMenuPayload.currency,
        categories: []
      });
    },
    async getStoreConfig(locationId) {
      const storeConfig = storeConfigsByLocation.get(locationId);
      return storeConfig ? buildStoreConfigResponse(storeConfig) : undefined;
    },
    async writeAuditLog() {
      // In-memory mode is for local tests; audit persistence is covered by the Postgres repository.
    },
    async pingDb() {
      // no-op for in-memory
    },
    async close() {
      // no-op
    }
  };

  return memoryRepository;
}

async function seedCatalogDefaults(db: PersistenceDb) {
  const defaultAppConfigPayload = resolveDefaultAppConfigPayload();
  const seedMenuPayload = buildProvisionedMenuPayload(defaultAppConfigPayload.brand.locationId);
  const seedStoreConfigRecord: StoreConfigRecord = {
    ...defaultStoreConfigRecord,
    locationId: defaultAppConfigPayload.brand.locationId
  };
  const existingCategory = await db
    .selectFrom("catalog_menu_categories")
    .select("category_id")
    .where("brand_id", "=", defaultAppConfigPayload.brand.brandId)
    .where("location_id", "=", seedMenuPayload.locationId)
    .executeTakeFirst();

  if (!existingCategory) {
    await db.transaction().execute(async (trx) => {
      await trx
        .insertInto("catalog_menu_categories")
        .values(
          seedMenuPayload.categories.map((category, index) => ({
            brand_id: defaultAppConfigPayload.brand.brandId,
            location_id: seedMenuPayload.locationId,
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
          seedMenuPayload.categories.flatMap((category) =>
            category.items.map((item, index) => ({
              brand_id: defaultAppConfigPayload.brand.brandId,
              location_id: seedMenuPayload.locationId,
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

  const existingHomeNewsCard = await db
    .selectFrom("catalog_home_news_cards")
    .select("card_id")
    .where("brand_id", "=", defaultAppConfigPayload.brand.brandId)
    .where("location_id", "=", defaultAppConfigPayload.brand.locationId)
    .executeTakeFirst();

  if (!existingHomeNewsCard) {
    await db
      .insertInto("catalog_home_news_cards")
      .values(
        defaultHomeNewsCardsPayload.cards.map((card) => ({
          brand_id: defaultAppConfigPayload.brand.brandId,
          location_id: defaultAppConfigPayload.brand.locationId,
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
  }

  await db
    .insertInto("catalog_store_configs")
    .values({
      brand_id: defaultAppConfigPayload.brand.brandId,
      location_id: seedStoreConfigRecord.locationId,
      store_name: defaultAppConfigPayload.brand.brandName,
      hours_text: DEFAULT_STORE_HOURS,
      prep_eta_minutes: seedStoreConfigRecord.prepEtaMinutes,
      tax_rate_basis_points: seedStoreConfigRecord.taxRateBasisPoints,
      pickup_instructions: seedStoreConfigRecord.pickupInstructions
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

async function getBrandIdForLocation(db: PersistenceDb, locationId: string): Promise<string> {
  const row = await db
    .selectFrom("catalog_app_configs")
    .select("brand_id")
    .where("location_id", "=", locationId)
    .executeTakeFirst();
  return row?.brand_id ?? DEFAULT_BRAND_ID;
}

function toClientRecord(row: {
  tenant_id: string;
  brand_id: string;
  client_name: string;
  owner_email?: string | null;
  status: OnboardingStatus;
  created_at?: CatalogTimestamp;
  updated_at?: CatalogTimestamp;
}): ClientRecord {
  return {
    tenantId: row.tenant_id,
    brandId: row.brand_id,
    clientName: row.client_name,
    ownerEmail: row.owner_email ?? undefined,
    status: row.status,
    createdAt: serializeCatalogTimestamp(row.created_at),
    updatedAt: serializeCatalogTimestamp(row.updated_at)
  };
}

function toClientLocationRecord(row: {
  tenant_id: string;
  brand_id: string;
  location_id: string;
  location_name: string;
  market_label: string;
  primary_location: boolean;
  created_at?: CatalogTimestamp;
  updated_at?: CatalogTimestamp;
}): ClientLocationRecord {
  return {
    tenantId: row.tenant_id,
    brandId: row.brand_id,
    locationId: row.location_id,
    locationName: row.location_name,
    marketLabel: row.market_label,
    primaryLocation: row.primary_location,
    createdAt: serializeCatalogTimestamp(row.created_at),
    updatedAt: serializeCatalogTimestamp(row.updated_at)
  };
}

function toOnboardingProgressRecord(row: {
  tenant_id: string;
  location_id: string;
  status: OnboardingStatus;
  owner_invited: boolean;
  owner_activated: boolean;
  business_profile_complete: boolean;
  store_operations_complete: boolean;
  menu_ready: boolean;
  team_configured_or_skipped: boolean;
  test_order_completed: boolean;
  admin_launch_approved: boolean;
  submitted_for_review_at: CatalogTimestamp;
  approved_at: CatalogTimestamp;
  live_at: CatalogTimestamp;
  blocked_reason: string | null;
  notes: string | null;
  updated_at?: CatalogTimestamp;
}): OnboardingProgressRecord {
  return {
    tenantId: row.tenant_id,
    locationId: row.location_id,
    status: row.status,
    ownerInvited: row.owner_invited,
    ownerActivated: row.owner_activated,
    businessProfileComplete: row.business_profile_complete,
    storeOperationsComplete: row.store_operations_complete,
    menuReady: row.menu_ready,
    teamConfiguredOrSkipped: row.team_configured_or_skipped,
    testOrderCompleted: row.test_order_completed,
    adminLaunchApproved: row.admin_launch_approved,
    submittedForReviewAt: serializeCatalogTimestamp(row.submitted_for_review_at),
    approvedAt: serializeCatalogTimestamp(row.approved_at),
    liveAt: serializeCatalogTimestamp(row.live_at),
    blockedReason: row.blocked_reason ?? undefined,
    notes: row.notes ?? undefined,
    updatedAt: serializeCatalogTimestamp(row.updated_at)
  };
}

function toMobileReleaseProfile(row: {
  location_id: string;
  status: MobileReleaseProfile["status"];
  status_label: string | null;
  app_store_url: string | null;
  test_flight_url: string | null;
  build_number: string | null;
  build_profile: string | null;
  source_commit_sha: string | null;
  config_hash: string | null;
  app_store_review_notes: string | null;
  submitted_at: CatalogTimestamp;
  approved_at: CatalogTimestamp;
  live_at: CatalogTimestamp;
  blocked_reason: string | null;
  notes: string | null;
  updated_at?: CatalogTimestamp;
}): MobileReleaseProfile {
  return mobileReleaseProfileSchema.parse({
    locationId: row.location_id,
    status: row.status,
    statusLabel: row.status_label ?? undefined,
    appStoreUrl: row.app_store_url ?? undefined,
    testFlightUrl: row.test_flight_url ?? undefined,
    buildNumber: row.build_number ?? undefined,
    buildProfile: row.build_profile ?? undefined,
    sourceCommitSha: row.source_commit_sha ?? undefined,
    configHash: row.config_hash ?? undefined,
    appStoreReviewNotes: row.app_store_review_notes ?? undefined,
    submittedAt: serializeCatalogTimestamp(row.submitted_at),
    approvedAt: serializeCatalogTimestamp(row.approved_at),
    liveAt: serializeCatalogTimestamp(row.live_at),
    blockedReason: row.blocked_reason ?? undefined,
    notes: row.notes ?? undefined,
    updatedAt: serializeCatalogTimestamp(row.updated_at)
  });
}

function toMobileReleaseBuildJob(row: {
  job_id: string;
  location_id: string;
  status: MobileReleaseBuildJob["status"];
  profile: MobileReleaseBuildJob["profile"];
  build_profile: string;
  source_commit_sha: string;
  config_hash: string;
  approval_required: boolean;
  approved_at: CatalogTimestamp;
  approved_by: string | null;
  app_store_review_notes: string | null;
  requested_by: string | null;
  eas_build_id: string | null;
  eas_submission_id: string | null;
  error_message: string | null;
  created_at: CatalogTimestamp;
  updated_at: CatalogTimestamp;
  started_at: CatalogTimestamp;
  finished_at: CatalogTimestamp;
}): MobileReleaseBuildJob {
  return mobileReleaseBuildJobSchema.parse({
    jobId: row.job_id,
    locationId: row.location_id,
    status: row.status,
    profile: row.profile,
    buildProfile: row.build_profile,
    sourceCommitSha: row.source_commit_sha,
    configHash: row.config_hash,
    approvalRequired: row.approval_required,
    approvedAt: serializeCatalogTimestamp(row.approved_at),
    approvedBy: row.approved_by ?? undefined,
    appStoreReviewNotes: row.app_store_review_notes ?? undefined,
    requestedBy: row.requested_by ?? undefined,
    easBuildId: row.eas_build_id ?? undefined,
    easSubmissionId: row.eas_submission_id ?? undefined,
    errorMessage: row.error_message ?? undefined,
    createdAt: serializeCatalogTimestamp(row.created_at),
    updatedAt: serializeCatalogTimestamp(row.updated_at),
    startedAt: serializeCatalogTimestamp(row.started_at),
    finishedAt: serializeCatalogTimestamp(row.finished_at)
  });
}

function toAppIdentityProfile(row: {
  location_id: string;
  app_name: string | null;
  display_name: string | null;
  bundle_identifier: string | null;
  sku: string | null;
  primary_category: string;
  subtitle: string | null;
  description: string | null;
  keywords: string[];
  support_url: string | null;
  privacy_policy_url: string | null;
  marketing_url: string | null;
  icon_asset_url: string | null;
  splash_asset_url: string | null;
  screenshot_asset_urls: string[];
  target_location_ids: string[];
  asset_mode: AppIdentityProfile["assetMode"];
  admin_override_ready: boolean;
  admin_override_reason: string | null;
  updated_at?: CatalogTimestamp;
}): AppIdentityProfile {
  return buildAppIdentityProfile({
    locationId: row.location_id,
    appName: row.app_name ?? undefined,
    displayName: row.display_name ?? undefined,
    bundleIdentifier: row.bundle_identifier ?? undefined,
    sku: row.sku ?? undefined,
    primaryCategory: row.primary_category,
    subtitle: row.subtitle ?? undefined,
    description: row.description ?? undefined,
    keywords: row.keywords,
    supportUrl: row.support_url ?? undefined,
    privacyPolicyUrl: row.privacy_policy_url ?? undefined,
    marketingUrl: row.marketing_url ?? undefined,
    iconAssetUrl: row.icon_asset_url ?? undefined,
    splashAssetUrl: row.splash_asset_url ?? undefined,
    screenshotAssetUrls: row.screenshot_asset_urls,
    targetLocationIds: row.target_location_ids,
    assetMode: row.asset_mode,
    adminOverrideReady: row.admin_override_ready,
    adminOverrideReason: row.admin_override_reason ?? undefined,
    updatedAt: serializeCatalogTimestamp(row.updated_at)
  });
}

async function createPostgresRepository(connectionString: string): Promise<CatalogRepository> {
  const db = createPostgresDb(connectionString);
  const defaultAppConfigPayload = resolveDefaultAppConfigPayload();
  await runMigrations(db);
  if (resolveDefaultLocationId()) {
    await seedCatalogDefaults(db);
  }

  async function buildPostgresOnboarding(locationId: string) {
    const locationRow = await db
      .selectFrom("catalog_client_locations")
      .selectAll()
      .where("location_id", "=", locationId)
      .executeTakeFirst();
    if (!locationRow) {
      return undefined;
    }
    const clientRow = await db
      .selectFrom("catalog_clients")
      .selectAll()
      .where("tenant_id", "=", locationRow.tenant_id)
      .executeTakeFirst();
    const progressRow = await db
      .selectFrom("catalog_onboarding_progress")
      .selectAll()
      .where("location_id", "=", locationId)
      .executeTakeFirst();
    const locationSummary = await postgresRepository.getInternalLocationSummary(locationId);
    if (!clientRow || !progressRow || !locationSummary) {
      return undefined;
    }
    const paymentProfile = await postgresRepository.getInternalLocationPaymentProfile(locationId);
    const mobileReleaseRow = await db
      .selectFrom("catalog_mobile_release_profiles")
      .selectAll()
      .where("location_id", "=", locationId)
      .executeTakeFirst();
    const appIdentityRow = await db
      .selectFrom("catalog_app_identity_profiles")
      .selectAll()
      .where("location_id", "=", locationId)
      .executeTakeFirst();

    return buildOnboardingSummary({
      client: toClientRecord(clientRow),
      location: toClientLocationRecord(locationRow),
      locationSummary,
      progress: toOnboardingProgressRecord(progressRow),
      paymentProfile,
      menu: await postgresRepository.getMenu(locationId),
      appIdentity: appIdentityRow ? toAppIdentityProfile(appIdentityRow) : undefined,
      mobileRelease: mobileReleaseRow ? toMobileReleaseProfile(mobileReleaseRow) : undefined
    });
  }

  const postgresRepository: CatalogRepository = {
    backend: "postgres",
    async createInternalClient(rawInput) {
      const input = adminClientCreateRequestSchema.parse(rawInput);
      const ownerEmail = input.ownerEmail.trim().toLowerCase();
      const existingClientRow = await db
        .selectFrom("catalog_clients")
        .selectAll()
        .where(sql<boolean>`lower(owner_email) = ${ownerEmail}`)
        .executeTakeFirst();
      if (existingClientRow) {
        const existingLocationRow = await db
          .selectFrom("catalog_client_locations")
          .selectAll()
          .where("tenant_id", "=", existingClientRow.tenant_id)
          .orderBy("primary_location", "desc")
          .orderBy("created_at", "asc")
          .executeTakeFirst();
        if (existingLocationRow) {
          const onboarding = await buildPostgresOnboarding(existingLocationRow.location_id);
          if (onboarding) {
            return {
              tenantId: existingClientRow.tenant_id,
              locationId: existingLocationRow.location_id,
              onboarding
            };
          }
        }
      }
      let tenantId = generateInternalId("ten");
      while (await db.selectFrom("catalog_clients").select("tenant_id").where("tenant_id", "=", tenantId).executeTakeFirst()) {
        tenantId = generateInternalId("ten");
      }
      let locationId = generateInternalId("loc");
      while (await db.selectFrom("catalog_store_configs").select("location_id").where("location_id", "=", locationId).executeTakeFirst()) {
        locationId = generateInternalId("loc");
      }
      const brandId = generateInternalId("brd");
      const now = new Date().toISOString();
      const locationSummary = await this.bootstrapInternalLocation({
        brandId,
        brandName: input.clientName,
        locationId,
        locationName: input.locationName,
        marketLabel: input.marketLabel,
        storeName: input.storeName ?? input.clientName,
        hours: input.hours,
        pickupInstructions: input.pickupInstructions,
        taxRateBasisPoints: input.taxRateBasisPoints,
        capabilities: input.capabilities
      });

      await db.transaction().execute(async (trx) => {
        await trx
          .insertInto("catalog_clients")
          .values({
            tenant_id: tenantId,
            brand_id: brandId,
            client_name: input.clientName,
            owner_email: ownerEmail,
            status: "draft"
          })
          .execute();
        await trx
          .insertInto("catalog_client_locations")
          .values({
            tenant_id: tenantId,
            brand_id: brandId,
            location_id: locationId,
            location_name: input.locationName,
            market_label: input.marketLabel,
            primary_location: true
          })
          .execute();
        await trx
          .insertInto("catalog_onboarding_progress")
          .values({
            tenant_id: tenantId,
            location_id: locationId,
            status: "draft",
            owner_invited: false,
            owner_activated: false,
            business_profile_complete: false,
            store_operations_complete: false,
            menu_ready: false,
            team_configured_or_skipped: false,
            test_order_completed: false,
            admin_launch_approved: false
          })
          .execute();
        await trx
          .insertInto("catalog_mobile_release_profiles")
          .values({
            tenant_id: tenantId,
            location_id: locationId,
            status: "not_started"
          })
          .execute();
        await trx
          .insertInto("catalog_app_identity_profiles")
          .values({
            tenant_id: tenantId,
            location_id: locationId,
            app_name: input.clientName,
            display_name: input.clientName.slice(0, 30),
            primary_category: "Food & Drink",
            keywords: [],
            screenshot_asset_urls: [],
            target_location_ids: [locationId],
            asset_mode: "placeholder",
            admin_override_ready: false
          })
          .execute();
      });

      const onboarding = await buildPostgresOnboarding(locationId);
      return {
        tenantId,
        locationId,
        onboarding:
          onboarding ??
          buildOnboardingSummary({
            client: {
              tenantId,
              brandId,
              clientName: input.clientName,
              ownerEmail,
              status: "draft",
              createdAt: now,
              updatedAt: now
            },
            location: {
              tenantId,
              brandId,
              locationId,
              locationName: input.locationName,
              marketLabel: input.marketLabel,
              primaryLocation: true,
              createdAt: now,
              updatedAt: now
            },
            locationSummary,
            progress: {
              tenantId,
              locationId,
              status: "draft",
              ownerInvited: false,
              ownerActivated: false,
              businessProfileComplete: false,
              storeOperationsComplete: false,
              menuReady: false,
              teamConfiguredOrSkipped: false,
              testOrderCompleted: false,
              adminLaunchApproved: false,
              updatedAt: now
            },
            menu: await this.getMenu(locationId),
            appIdentity: buildAppIdentityProfile({
              locationId,
              appName: input.clientName,
              displayName: input.clientName.slice(0, 30),
              primaryCategory: "Food & Drink",
              keywords: [],
              screenshotAssetUrls: [],
              targetLocationIds: [locationId],
              assetMode: "placeholder",
              adminOverrideReady: false,
              updatedAt: now
            }),
            mobileRelease: mobileReleaseProfileSchema.parse({ locationId, status: "not_started", updatedAt: now })
          })
      };
    },
    async listInternalClients() {
      const clients = await db.selectFrom("catalog_clients").selectAll().orderBy("client_name", "asc").execute();
      const locations = await db.selectFrom("catalog_client_locations").selectAll().execute();
      return internalClientListResponseSchema.parse({
        clients: clients.map((clientRow) => {
          const clientLocations = locations.filter((location) => location.tenant_id === clientRow.tenant_id);
          const primaryLocation = clientLocations.find((location) => location.primary_location) ?? clientLocations[0];
          return internalClientSummarySchema.parse({
            tenantId: clientRow.tenant_id,
            brandId: clientRow.brand_id,
            clientName: clientRow.client_name,
            status: clientRow.status,
            primaryLocationId: primaryLocation?.location_id,
            locationCount: clientLocations.length,
            createdAt: serializeCatalogTimestamp(clientRow.created_at),
            updatedAt: serializeCatalogTimestamp(clientRow.updated_at)
          });
        })
      });
    },
    async getInternalClient(tenantId) {
      const clientRow = await db
        .selectFrom("catalog_clients")
        .selectAll()
        .where("tenant_id", "=", tenantId)
        .executeTakeFirst();
      if (!clientRow) {
        return undefined;
      }
      const locationRows = await db
        .selectFrom("catalog_client_locations")
        .selectAll()
        .where("tenant_id", "=", tenantId)
        .orderBy("primary_location", "desc")
        .orderBy("created_at", "asc")
        .execute();
      const primaryLocation = locationRows.find((location) => location.primary_location) ?? locationRows[0];
      return internalClientDetailSchema.parse({
        tenantId: clientRow.tenant_id,
        brandId: clientRow.brand_id,
        clientName: clientRow.client_name,
        status: clientRow.status,
        primaryLocationId: primaryLocation?.location_id,
        locationCount: locationRows.length,
        createdAt: serializeCatalogTimestamp(clientRow.created_at),
        updatedAt: serializeCatalogTimestamp(clientRow.updated_at),
        locations: locationRows.map(toClientLocationRecord),
        onboarding: primaryLocation ? await buildPostgresOnboarding(primaryLocation.location_id) : undefined
      });
    },
    async getAppConfig(locationId) {
      const row = await db
        .selectFrom("catalog_app_configs")
        .selectAll()
        .where("location_id", "=", locationId)
        .executeTakeFirst();
      if (!row) {
        return undefined;
      }

      const paymentProfileRow = await db
        .selectFrom("catalog_payment_profiles")
        .select("payment_profile_json")
        .where("location_id", "=", locationId)
        .executeTakeFirst();

      const appConfig = appConfigSchema.parse(row.app_config_json);
      const paymentProfile = paymentProfileRow
        ? clientPaymentProfileSchema.parse(paymentProfileRow.payment_profile_json)
        : undefined;

      return applyPaymentProfileToAppConfig(applyRuntimeFulfillmentMode(appConfig), paymentProfile);
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
      const paymentProfileRows = await db
        .selectFrom("catalog_payment_profiles")
        .select(["location_id", "payment_profile_json"])
        .execute();
      const paymentProfileByLocation = new Map(
        paymentProfileRows.map((row) => [row.location_id, clientPaymentProfileSchema.parse(row.payment_profile_json)] as const)
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
              taxRateBasisPoints: storeRow.tax_rate_basis_points,
              capabilities: appConfig.storeCapabilities,
              paymentProfile: paymentProfileByLocation.get(storeRow.location_id)
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
      const paymentProfileRow = await db
        .selectFrom("catalog_payment_profiles")
        .select("payment_profile_json")
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
        taxRateBasisPoints: storeRow.tax_rate_basis_points,
        capabilities: appConfig.storeCapabilities,
        paymentProfile: paymentProfileRow ? clientPaymentProfileSchema.parse(paymentProfileRow.payment_profile_json) : undefined
      });
    },
    async bootstrapInternalLocation(rawInput) {
      const input = internalLocationBootstrapSchema.parse(rawInput);
      let locationId = input.locationId ?? generateInternalId("loc");
      while (!input.locationId) {
        const existingGeneratedStoreConfigRow = await db
          .selectFrom("catalog_store_configs")
          .select("location_id")
          .where("location_id", "=", locationId)
          .executeTakeFirst();
        if (!existingGeneratedStoreConfigRow) {
          break;
        }
        locationId = generateInternalId("loc");
      }
      const existingStoreConfigRow = await db
        .selectFrom("catalog_store_configs")
        .select(["prep_eta_minutes", "tax_rate_basis_points"])
        .where("location_id", "=", locationId)
        .executeTakeFirst();
      const existingAppConfigRow = await db
        .selectFrom("catalog_app_configs")
        .select(["brand_id", "app_config_json"])
        .where("location_id", "=", locationId)
        .executeTakeFirst();

      const persistedBrandId = existingAppConfigRow?.brand_id ?? input.brandId ?? generateInternalId("brd");
      const existingAppConfig = existingAppConfigRow ? appConfigSchema.parse(existingAppConfigRow.app_config_json) : undefined;
      const nextAppConfig = existingAppConfig
        ? appConfigSchema.parse({
            ...existingAppConfig,
            brand: {
              ...existingAppConfig.brand,
              brandId: persistedBrandId,
              brandName: input.brandName,
              locationId,
              locationName: input.locationName,
              marketLabel: input.marketLabel
            },
            storeCapabilities: input.capabilities ?? existingAppConfig.storeCapabilities
          })
        : resolveProvisionedAppConfigPayload({
            brandId: persistedBrandId,
            brandName: input.brandName,
            locationId,
            locationName: input.locationName,
            marketLabel: input.marketLabel,
            capabilities: input.capabilities
          });
      const storeName = input.storeName ?? input.locationName;
      const hours = input.hours ?? DEFAULT_STORE_HOURS;
      const pickupInstructions = input.pickupInstructions ?? defaultStoreConfigRecord.pickupInstructions;
      const taxRateBasisPoints = input.taxRateBasisPoints ?? existingStoreConfigRow?.tax_rate_basis_points ?? defaultStoreConfigRecord.taxRateBasisPoints;
      const seededMenu = buildProvisionedMenuPayload(locationId);

      await db.transaction().execute(async (trx) => {
        await trx
          .insertInto("catalog_store_configs")
          .values({
            brand_id: persistedBrandId,
            location_id: locationId,
            store_name: storeName,
            hours_text: hours,
            prep_eta_minutes: existingStoreConfigRow?.prep_eta_minutes ?? defaultStoreConfigRecord.prepEtaMinutes,
            tax_rate_basis_points: taxRateBasisPoints,
            pickup_instructions: pickupInstructions
          })
          .onConflict((oc) =>
            oc.column("location_id").doUpdateSet({
              brand_id: persistedBrandId,
              store_name: storeName,
              hours_text: hours,
              tax_rate_basis_points: taxRateBasisPoints,
              pickup_instructions: pickupInstructions
            })
          )
          .execute();

        await trx
          .insertInto("catalog_app_configs")
          .values({
            brand_id: persistedBrandId,
            location_id: locationId,
            app_config_json: nextAppConfig
          })
          .onConflict((oc) =>
            oc.columns(["brand_id", "location_id"]).doUpdateSet({
              app_config_json: nextAppConfig
            })
          )
          .execute();

        if (input.paymentProfile) {
          const now = new Date().toISOString();
          const paymentProfile = buildPaymentProfile({
            ...input.paymentProfile,
            locationId,
            createdAt: now,
            updatedAt: now
          });
          await trx
            .insertInto("catalog_payment_profiles")
            .values({
              brand_id: persistedBrandId,
              location_id: locationId,
              payment_profile_json: paymentProfile
            })
            .onConflict((oc) =>
              oc.column("location_id").doUpdateSet({
                brand_id: persistedBrandId,
                payment_profile_json: paymentProfile
              })
            )
            .execute();
        }

        if (!existingStoreConfigRow && !existingAppConfigRow) {
          await trx
            .insertInto("catalog_menu_categories")
            .values(
              seededMenu.categories.map((category, index) => ({
                brand_id: persistedBrandId,
                location_id: locationId,
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
                  location_id: locationId,
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
        }

      });

      return buildInternalLocationSummary({
        brandId: nextAppConfig.brand.brandId,
        brandName: nextAppConfig.brand.brandName,
        locationId,
        locationName: nextAppConfig.brand.locationName,
        marketLabel: nextAppConfig.brand.marketLabel,
        storeName,
        hours,
        pickupInstructions,
        taxRateBasisPoints,
        capabilities: nextAppConfig.storeCapabilities,
        paymentProfile: input.paymentProfile
          ? buildPaymentProfile({
              ...input.paymentProfile,
              locationId,
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString()
            })
          : undefined,
        action: existingStoreConfigRow ? "updated" : "created"
      });
    },
    async updateInternalLocationCapabilities(locationId, input) {
      const appConfigRow = await db
        .selectFrom("catalog_app_configs")
        .select(["brand_id", "app_config_json"])
        .where("location_id", "=", locationId)
        .executeTakeFirst();
      const storeRow = await db
        .selectFrom("catalog_store_configs")
        .selectAll()
        .where("location_id", "=", locationId)
        .executeTakeFirst();
      if (!appConfigRow || !storeRow) {
        return undefined;
      }

      const nextAppConfig = appConfigSchema.parse({
        ...appConfigSchema.parse(appConfigRow.app_config_json),
        storeCapabilities: input.capabilities
      });
      await db
        .updateTable("catalog_app_configs")
        .set({ app_config_json: nextAppConfig })
        .where("location_id", "=", locationId)
        .execute();

      const paymentProfileRow = await db
        .selectFrom("catalog_payment_profiles")
        .select("payment_profile_json")
        .where("location_id", "=", locationId)
        .executeTakeFirst();

      return buildInternalLocationSummary({
        brandId: nextAppConfig.brand.brandId,
        brandName: nextAppConfig.brand.brandName,
        locationId,
        locationName: nextAppConfig.brand.locationName,
        marketLabel: nextAppConfig.brand.marketLabel,
        storeName: storeRow.store_name,
        hours: storeRow.hours_text,
        pickupInstructions: storeRow.pickup_instructions,
        taxRateBasisPoints: storeRow.tax_rate_basis_points,
        capabilities: nextAppConfig.storeCapabilities,
        paymentProfile: paymentProfileRow
          ? clientPaymentProfileSchema.parse(paymentProfileRow.payment_profile_json)
          : undefined,
        action: "updated"
      });
    },
    async getInternalLocationOnboarding(locationId) {
      return buildPostgresOnboarding(locationId);
    },
    async updateInternalLocationOnboarding(locationId, rawInput) {
      const input = operatorOnboardingUpdateSchema.parse(rawInput);
      const existing = await db
        .selectFrom("catalog_onboarding_progress")
        .selectAll()
        .where("location_id", "=", locationId)
        .executeTakeFirst();
      if (!existing) {
        return undefined;
      }
      const now = new Date().toISOString();
      const blockedReason = input.blockedReason === null ? null : input.blockedReason ?? existing.blocked_reason;
      const status = blockedReason ? "blocked" : input.readyForReview ? "ready_for_review" : existing.status;
      await db
        .updateTable("catalog_onboarding_progress")
        .set({
          business_profile_complete: input.businessProfileComplete ?? existing.business_profile_complete,
          store_operations_complete: input.storeOperationsComplete ?? existing.store_operations_complete,
          menu_ready: input.menuReady ?? existing.menu_ready,
          team_configured_or_skipped: input.teamConfiguredOrSkipped ?? existing.team_configured_or_skipped,
          test_order_completed: input.testOrderCompleted ?? existing.test_order_completed,
          status,
          submitted_for_review_at: input.readyForReview ? existing.submitted_for_review_at ?? now : existing.submitted_for_review_at,
          blocked_reason: blockedReason,
          notes: input.notes ?? existing.notes,
          updated_at: now
        })
        .where("location_id", "=", locationId)
        .execute();
      await db
        .updateTable("catalog_clients")
        .set({ status, updated_at: now })
        .where("tenant_id", "=", existing.tenant_id)
        .execute();
      return buildPostgresOnboarding(locationId);
    },
    async updateInternalLocationOwnerOnboarding(locationId, rawInput) {
      const input = internalOwnerOnboardingUpdateSchema.parse(rawInput);
      const existing = await db
        .selectFrom("catalog_onboarding_progress")
        .selectAll()
        .where("location_id", "=", locationId)
        .executeTakeFirst();
      if (!existing) {
        return undefined;
      }
      const now = new Date().toISOString();
      const ownerInvited = input.ownerInvited ?? existing.owner_invited;
      const ownerActivated = input.ownerActivated ?? existing.owner_activated;
      const status =
        existing.blocked_reason
          ? "blocked"
          : ownerActivated
            ? existing.status === "draft" || existing.status === "invited"
              ? "in_progress"
              : existing.status
            : ownerInvited
              ? "invited"
              : existing.status;
      await db
        .updateTable("catalog_onboarding_progress")
        .set({
          owner_invited: ownerInvited,
          owner_activated: ownerActivated,
          status,
          updated_at: now
        })
        .where("location_id", "=", locationId)
        .execute();
      await db
        .updateTable("catalog_clients")
        .set({ status, updated_at: now })
        .where("tenant_id", "=", existing.tenant_id)
        .execute();
      return buildPostgresOnboarding(locationId);
    },
    async updateOperatorLocationAppIdentity(locationId, rawInput) {
      const input = operatorAppIdentityProfileUpdateSchema.parse(rawInput);
      const existing = await db
        .selectFrom("catalog_app_identity_profiles")
        .selectAll()
        .where("location_id", "=", locationId)
        .executeTakeFirst();
      const location = await db
        .selectFrom("catalog_client_locations")
        .selectAll()
        .where("location_id", "=", locationId)
        .executeTakeFirst();
      if (!location) {
        return undefined;
      }
      const now = new Date().toISOString();
      const base = existing
        ? toAppIdentityProfile(existing)
        : buildAppIdentityProfile({
            locationId,
            primaryCategory: "Food & Drink",
            keywords: [],
            screenshotAssetUrls: [],
            targetLocationIds: [locationId],
            assetMode: "placeholder",
            adminOverrideReady: false,
            updatedAt: now
          });
      const next = buildAppIdentityProfile({
        ...base,
        ...input,
        locationId,
        updatedAt: now
      });
      await db
        .insertInto("catalog_app_identity_profiles")
        .values({
          tenant_id: location.tenant_id,
          location_id: locationId,
          app_name: next.appName ?? null,
          display_name: next.displayName ?? null,
          bundle_identifier: next.bundleIdentifier ?? null,
          sku: next.sku ?? null,
          primary_category: next.primaryCategory,
          subtitle: next.subtitle ?? null,
          description: next.description ?? null,
          keywords: next.keywords,
          support_url: next.supportUrl ?? null,
          privacy_policy_url: next.privacyPolicyUrl ?? null,
          marketing_url: next.marketingUrl ?? null,
          icon_asset_url: next.iconAssetUrl ?? null,
          splash_asset_url: next.splashAssetUrl ?? null,
          screenshot_asset_urls: next.screenshotAssetUrls,
          target_location_ids: next.targetLocationIds,
          asset_mode: next.assetMode,
          admin_override_ready: next.adminOverrideReady,
          admin_override_reason: next.adminOverrideReason ?? null,
          updated_at: now
        })
        .onConflict((oc) =>
          oc.column("location_id").doUpdateSet({
            app_name: next.appName ?? null,
            display_name: next.displayName ?? null,
            bundle_identifier: next.bundleIdentifier ?? null,
            sku: next.sku ?? null,
            primary_category: next.primaryCategory,
            subtitle: next.subtitle ?? null,
            description: next.description ?? null,
            keywords: next.keywords,
            support_url: next.supportUrl ?? null,
            privacy_policy_url: next.privacyPolicyUrl ?? null,
            marketing_url: next.marketingUrl ?? null,
            icon_asset_url: next.iconAssetUrl ?? null,
            splash_asset_url: next.splashAssetUrl ?? null,
            screenshot_asset_urls: next.screenshotAssetUrls,
            target_location_ids: next.targetLocationIds,
            asset_mode: next.assetMode,
            updated_at: now
          })
        )
        .execute();
      return buildPostgresOnboarding(locationId);
    },
    async updateInternalLocationAppIdentity(locationId, rawInput) {
      const input = internalAppIdentityProfileUpdateSchema.parse(rawInput);
      const existing = await db
        .selectFrom("catalog_app_identity_profiles")
        .selectAll()
        .where("location_id", "=", locationId)
        .executeTakeFirst();
      const location = await db
        .selectFrom("catalog_client_locations")
        .selectAll()
        .where("location_id", "=", locationId)
        .executeTakeFirst();
      if (!location) {
        return undefined;
      }
      const now = new Date().toISOString();
      const base = existing
        ? toAppIdentityProfile(existing)
        : buildAppIdentityProfile({
            locationId,
            primaryCategory: "Food & Drink",
            keywords: [],
            screenshotAssetUrls: [],
            targetLocationIds: [locationId],
            assetMode: "placeholder",
            adminOverrideReady: false,
            updatedAt: now
          });
      const next = buildAppIdentityProfile({
        ...base,
        ...input,
        locationId,
        updatedAt: now
      });
      await db
        .insertInto("catalog_app_identity_profiles")
        .values({
          tenant_id: location.tenant_id,
          location_id: locationId,
          app_name: next.appName ?? null,
          display_name: next.displayName ?? null,
          bundle_identifier: next.bundleIdentifier ?? null,
          sku: next.sku ?? null,
          primary_category: next.primaryCategory,
          subtitle: next.subtitle ?? null,
          description: next.description ?? null,
          keywords: next.keywords,
          support_url: next.supportUrl ?? null,
          privacy_policy_url: next.privacyPolicyUrl ?? null,
          marketing_url: next.marketingUrl ?? null,
          icon_asset_url: next.iconAssetUrl ?? null,
          splash_asset_url: next.splashAssetUrl ?? null,
          screenshot_asset_urls: next.screenshotAssetUrls,
          target_location_ids: next.targetLocationIds,
          asset_mode: next.assetMode,
          admin_override_ready: next.adminOverrideReady,
          admin_override_reason: next.adminOverrideReason ?? null,
          updated_at: now
        })
        .onConflict((oc) =>
          oc.column("location_id").doUpdateSet({
            app_name: next.appName ?? null,
            display_name: next.displayName ?? null,
            bundle_identifier: next.bundleIdentifier ?? null,
            sku: next.sku ?? null,
            primary_category: next.primaryCategory,
            subtitle: next.subtitle ?? null,
            description: next.description ?? null,
            keywords: next.keywords,
            support_url: next.supportUrl ?? null,
            privacy_policy_url: next.privacyPolicyUrl ?? null,
            marketing_url: next.marketingUrl ?? null,
            icon_asset_url: next.iconAssetUrl ?? null,
            splash_asset_url: next.splashAssetUrl ?? null,
            screenshot_asset_urls: next.screenshotAssetUrls,
            target_location_ids: next.targetLocationIds,
            asset_mode: next.assetMode,
            admin_override_ready: next.adminOverrideReady,
            admin_override_reason: next.adminOverrideReason ?? null,
            updated_at: now
          })
        )
        .execute();
      return buildPostgresOnboarding(locationId);
    },
    async approveInternalLocationLaunch(locationId, rawInput) {
      const input = launchApprovalRequestSchema.parse(rawInput);
      const existing = await db
        .selectFrom("catalog_onboarding_progress")
        .selectAll()
        .where("location_id", "=", locationId)
        .executeTakeFirst();
      if (!existing) {
        return undefined;
      }
      const now = new Date().toISOString();
      const status = input.approved ? (input.live ? "live" : "approved") : "in_progress";
      await db
        .updateTable("catalog_onboarding_progress")
        .set({
          admin_launch_approved: input.approved,
          status,
          approved_at: input.approved ? existing.approved_at ?? now : null,
          live_at: input.approved && input.live ? existing.live_at ?? now : null,
          notes: input.note ?? existing.notes,
          updated_at: now
        })
        .where("location_id", "=", locationId)
        .execute();
      await db
        .updateTable("catalog_clients")
        .set({ status, updated_at: now })
        .where("tenant_id", "=", existing.tenant_id)
        .execute();
      return buildPostgresOnboarding(locationId);
    },
    async updateInternalLocationMobileRelease(locationId, rawInput) {
      const input = mobileReleaseProfileUpdateSchema.parse(rawInput);
      const existing = await db
        .selectFrom("catalog_mobile_release_profiles")
        .selectAll()
        .where("location_id", "=", locationId)
        .executeTakeFirst();
      if (!existing) {
        return undefined;
      }
      await db
        .updateTable("catalog_mobile_release_profiles")
        .set({
          status: input.status ?? existing.status,
          status_label: input.statusLabel ?? existing.status_label,
          app_store_url: input.appStoreUrl ?? existing.app_store_url,
          test_flight_url: input.testFlightUrl ?? existing.test_flight_url,
          build_number: input.buildNumber ?? existing.build_number,
          build_profile: input.buildProfile ?? existing.build_profile,
          source_commit_sha: input.sourceCommitSha ?? existing.source_commit_sha,
          config_hash: input.configHash ?? existing.config_hash,
          app_store_review_notes: input.appStoreReviewNotes ?? existing.app_store_review_notes,
          submitted_at: input.submittedAt ?? existing.submitted_at,
          approved_at: input.approvedAt ?? existing.approved_at,
          live_at: input.liveAt ?? existing.live_at,
          blocked_reason: input.blockedReason ?? existing.blocked_reason,
          notes: input.notes ?? existing.notes,
          updated_at: new Date().toISOString()
        })
        .where("location_id", "=", locationId)
        .execute();
      return buildPostgresOnboarding(locationId);
    },
    async createInternalLocationMobileReleaseBuildJob(locationId, rawInput) {
      const input = mobileReleaseBuildJobCreateSchema.parse(rawInput);
      const existing = await db
        .selectFrom("catalog_mobile_release_profiles")
        .selectAll()
        .where("location_id", "=", locationId)
        .executeTakeFirst();
      if (!existing) {
        return undefined;
      }
      const now = new Date().toISOString();
      const jobId = randomUUID();
      const row = await db
        .insertInto("catalog_mobile_release_build_jobs")
        .values({
          job_id: jobId,
          location_id: locationId,
          tenant_id: existing.tenant_id,
          status: "queued",
          profile: input.profile,
          build_profile: input.buildProfile,
          source_commit_sha: input.sourceCommitSha,
          config_hash: input.configHash,
          approval_required: true,
          app_store_review_notes: input.appStoreReviewNotes ?? null,
          requested_by: input.requestedBy ?? null,
          request_json: input,
          created_at: now,
          updated_at: now
        })
        .returningAll()
        .executeTakeFirstOrThrow();
      await db
        .updateTable("catalog_mobile_release_profiles")
        .set({
          status: "build_configuring",
          status_label: "Build job queued",
          build_profile: input.buildProfile,
          source_commit_sha: input.sourceCommitSha,
          config_hash: input.configHash,
          app_store_review_notes: input.appStoreReviewNotes ?? existing.app_store_review_notes,
          updated_at: now
        })
        .where("location_id", "=", locationId)
        .execute();
      return toMobileReleaseBuildJob(row);
    },
    async listInternalLocationMobileReleaseBuildJobs(locationId) {
      const rows = await db
        .selectFrom("catalog_mobile_release_build_jobs")
        .selectAll()
        .where("location_id", "=", locationId)
        .orderBy("created_at", "desc")
        .limit(25)
        .execute();
      return mobileReleaseBuildJobListResponseSchema.parse({
        jobs: rows.map(toMobileReleaseBuildJob)
      });
    },
    async claimNextMobileReleaseBuildJob() {
      const now = new Date().toISOString();
      const row = await db.transaction().execute(async (transaction) => {
        const candidate = await transaction
          .selectFrom("catalog_mobile_release_build_jobs")
          .selectAll()
          .where("status", "=", "queued")
          .orderBy("created_at", "asc")
          .limit(1)
          .forUpdate()
          .skipLocked()
          .executeTakeFirst();

        if (!candidate) {
          return undefined;
        }

        return transaction
          .updateTable("catalog_mobile_release_build_jobs")
          .set({
            status: "running",
            started_at: now,
            updated_at: now
          })
          .where("job_id", "=", candidate.job_id)
          .where("status", "=", "queued")
          .returningAll()
          .executeTakeFirst();
      });

      return row ? toMobileReleaseBuildJob(row) : undefined;
    },
    async updateMobileReleaseBuildJob(jobId, rawInput) {
      const input = mobileReleaseBuildJobUpdateSchema.parse(rawInput);
      const now = new Date().toISOString();
      const terminal = input.status === "succeeded" || input.status === "failed" || input.status === "canceled";
      const existing = await db
        .selectFrom("catalog_mobile_release_build_jobs")
        .select(["eas_build_id", "eas_submission_id", "approved_at", "approved_by"])
        .where("job_id", "=", jobId)
        .executeTakeFirst();
      const row = await db
        .updateTable("catalog_mobile_release_build_jobs")
        .set({
          status: input.status,
          eas_build_id: input.easBuildId ?? existing?.eas_build_id ?? null,
          eas_submission_id: input.easSubmissionId ?? existing?.eas_submission_id ?? null,
          approved_at: input.approvedAt ?? existing?.approved_at ?? null,
          approved_by: input.approvedBy ?? existing?.approved_by ?? null,
          error_message: input.errorMessage ?? null,
          updated_at: now,
          ...(terminal ? { finished_at: now } : {})
        })
        .where("job_id", "=", jobId)
        .returningAll()
        .executeTakeFirst();

      if (row) {
        const releaseUpdate = mobileReleaseBuildStatusUpdate(input.status, input.errorMessage);
        await db
          .updateTable("catalog_mobile_release_profiles")
          .set({
            status: releaseUpdate.status,
            status_label: releaseUpdate.statusLabel,
            blocked_reason: releaseUpdate.blockedReason ?? null,
            updated_at: now
          })
          .where("location_id", "=", row.location_id)
          .execute();
      }

      return row ? toMobileReleaseBuildJob(row) : undefined;
    },
    async approveMobileReleaseBuildJob(jobId, rawInput) {
      const input = mobileReleaseBuildJobApprovalSchema.parse(rawInput);
      const existing = await db
        .selectFrom("catalog_mobile_release_build_jobs")
        .select(["status"])
        .where("job_id", "=", jobId)
        .executeTakeFirst();
      if (!existing || existing.status !== "awaiting_approval") {
        return undefined;
      }
      const now = new Date().toISOString();
      const row = await db
        .updateTable("catalog_mobile_release_build_jobs")
        .set({
          status: "queued",
          approved_at: now,
          approved_by: input.approvedBy,
          updated_at: now
        })
        .where("job_id", "=", jobId)
        .where("status", "=", "awaiting_approval")
        .returningAll()
        .executeTakeFirst();
      return row ? toMobileReleaseBuildJob(row) : undefined;
    },
    async getInternalLocationPaymentProfile(locationId) {
      const row = await db
        .selectFrom("catalog_payment_profiles")
        .select("payment_profile_json")
        .where("location_id", "=", locationId)
        .executeTakeFirst();
      return row ? clientPaymentProfileSchema.parse(row.payment_profile_json) : undefined;
    },
    async updateInternalLocationPaymentProfile(locationId, rawInput) {
      const input = internalLocationPaymentProfileUpdateSchema.parse({
        ...rawInput,
        locationId
      });
      const existing = await db
        .selectFrom("catalog_payment_profiles")
        .select(["brand_id", "payment_profile_json"])
        .where("location_id", "=", locationId)
        .executeTakeFirst();
      const appConfigRow = await db
        .selectFrom("catalog_app_configs")
        .select("brand_id")
        .where("location_id", "=", locationId)
        .executeTakeFirst();
      const existingProfile = existing ? clientPaymentProfileSchema.parse(existing.payment_profile_json) : undefined;
      const next = buildPaymentProfile({
        ...input,
        createdAt: existingProfile?.createdAt ?? new Date().toISOString(),
        updatedAt: new Date().toISOString()
      });

      await db
        .insertInto("catalog_payment_profiles")
        .values({
          brand_id: existing?.brand_id ?? appConfigRow?.brand_id ?? DEFAULT_BRAND_ID,
          location_id: locationId,
          payment_profile_json: next
        })
        .onConflict((oc) =>
          oc.column("location_id").doUpdateSet({
            brand_id: existing?.brand_id ?? appConfigRow?.brand_id ?? DEFAULT_BRAND_ID,
            payment_profile_json: next
          })
        )
        .execute();

      return next;
    },
    async replaceInternalLocationMenu(locationId, input) {
      const nextMenu = menuResponseSchema.parse({
        ...input,
        locationId
      });
      const appConfigRow = await db
        .selectFrom("catalog_app_configs")
        .select("brand_id")
        .where("location_id", "=", locationId)
        .executeTakeFirst();
      const existingCategoryRow = await db
        .selectFrom("catalog_menu_categories")
        .select("brand_id")
        .where("location_id", "=", locationId)
        .executeTakeFirst();
      const brandId = appConfigRow?.brand_id ?? existingCategoryRow?.brand_id ?? DEFAULT_BRAND_ID;

      await db.transaction().execute(async (trx) => {
        await trx
          .deleteFrom("catalog_menu_items")
          .where("brand_id", "=", brandId)
          .where("location_id", "=", locationId)
          .execute();

        await trx
          .deleteFrom("catalog_menu_categories")
          .where("brand_id", "=", brandId)
          .where("location_id", "=", locationId)
          .execute();

        if (nextMenu.categories.length > 0) {
          await trx
            .insertInto("catalog_menu_categories")
            .values(
              nextMenu.categories.map((category, categoryIndex) => ({
                brand_id: brandId,
                location_id: locationId,
                category_id: category.id,
                title: category.title,
                sort_order: categoryIndex
              }))
            )
            .execute();

          const menuItems = nextMenu.categories.flatMap((category) =>
            category.items.map((item, itemIndex) => ({
              brand_id: brandId,
              location_id: locationId,
              item_id: item.id,
              category_id: category.id,
              name: item.name,
              description: item.description,
              image_url: item.imageUrl ?? null,
              price_cents: item.priceCents,
              badge_codes_json: JSON.stringify(item.badgeCodes ?? []),
              customization_groups_json: JSON.stringify(item.customizationGroups ?? []),
              visible: item.visible,
              sort_order: itemIndex
            }))
          );

          if (menuItems.length > 0) {
            await trx
              .insertInto("catalog_menu_items")
              .values(menuItems)
              .execute();
          }
        }
      });

      return nextMenu;
    },
    async getAdminMenu(locationId) {
      const categories = await db
        .selectFrom("catalog_menu_categories")
        .selectAll()
        .where("location_id", "=", locationId)
        .orderBy("sort_order", "asc")
        .execute();

      const items = await db
        .selectFrom("catalog_menu_items")
        .selectAll()
        .where("location_id", "=", locationId)
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
            imageUrl: item.image_url ?? undefined,
            priceCents: item.price_cents,
            visible: item.visible,
            sortOrder: item.sort_order,
            customizationGroups: item.customization_groups_json
          })
        );
        itemsByCategory.set(item.category_id, existing);
      }

      return buildAdminMenuResponse({
        locationId,
        categories: categories.map((category) => ({
          categoryId: category.category_id,
          title: category.title,
          items: itemsByCategory.get(category.category_id) ?? []
        }))
      });
    },
    async getHomeNewsCards(locationId) {
      return buildHomeNewsCardsResponse({
        locationId,
        cards: await db
          .selectFrom("catalog_home_news_cards")
          .selectAll()
          .where("location_id", "=", locationId)
          .orderBy("sort_order", "asc")
          .orderBy("card_id", "asc")
          .execute()
          .then((rows) =>
            rows.map((row) =>
              toHomeNewsCard({
                cardId: row.card_id,
                label: row.label,
                title: row.title,
                body: row.body,
                note: row.note,
                sortOrder: row.sort_order,
                visible: row.visible
              })
            )
          )
      });
    },
    async getAdminHomeNewsCards(locationId) {
      return buildHomeNewsCardsResponse({
        locationId,
        cards: await db
          .selectFrom("catalog_home_news_cards")
          .selectAll()
          .where("location_id", "=", locationId)
          .orderBy("sort_order", "asc")
          .orderBy("card_id", "asc")
          .execute()
          .then((rows) =>
            rows.map((row) =>
              toHomeNewsCard({
                cardId: row.card_id,
                label: row.label,
                title: row.title,
                body: row.body,
                note: row.note,
                sortOrder: row.sort_order,
                visible: row.visible
              })
            )
          )
      });
    },
    async replaceAdminHomeNewsCards(locationId, input) {
      const brandId = await getBrandIdForLocation(db, locationId);
      const cards = input.cards.map((card) =>
        toHomeNewsCard({
          cardId: card.cardId,
          label: card.label,
          title: card.title,
          body: card.body,
          note: card.note,
          sortOrder: card.sortOrder,
          visible: card.visible
        })
      );

      await db.transaction().execute(async (trx) => {
        await trx
          .deleteFrom("catalog_home_news_cards")
          .where("location_id", "=", locationId)
          .execute();

        if (cards.length > 0) {
          await trx
            .insertInto("catalog_home_news_cards")
            .values(
              cards.map((card) => ({
                brand_id: brandId,
                location_id: locationId,
                card_id: card.cardId,
                label: card.label,
                title: card.title,
                body: card.body,
                note: card.note ?? null,
                visible: card.visible,
                sort_order: card.sortOrder
              }))
            )
            .execute();
        }
      });

      return buildHomeNewsCardsResponse({
        locationId,
        cards
      });
    },
    async createAdminHomeNewsCard(locationId, input) {
      const brandId = await getBrandIdForLocation(db, locationId);
      const nextSortOrderResult = await db
        .selectFrom("catalog_home_news_cards")
        .select((eb) => eb.fn.max<number>("sort_order").as("max_sort_order"))
        .where("location_id", "=", locationId)
        .executeTakeFirst();
      const nextSortOrder = input.sortOrder ?? (nextSortOrderResult?.max_sort_order ?? -1) + 1;
      const cardId = createHomeNewsCardId(input.title);

      await db
        .insertInto("catalog_home_news_cards")
        .values({
          brand_id: brandId,
          location_id: locationId,
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
    async updateAdminHomeNewsCard(locationId, input) {
      const existingRow = await db
        .selectFrom("catalog_home_news_cards")
        .selectAll()
        .where("location_id", "=", locationId)
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
        .where("location_id", "=", locationId)
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
    async updateAdminHomeNewsCardVisibility(locationId, input) {
      const existingRow = await db
        .selectFrom("catalog_home_news_cards")
        .selectAll()
        .where("location_id", "=", locationId)
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
        .where("location_id", "=", locationId)
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
    async deleteAdminHomeNewsCard(locationId, cardId) {
      await db
        .deleteFrom("catalog_home_news_cards")
        .where("location_id", "=", locationId)
        .where("card_id", "=", cardId)
        .executeTakeFirst();

      return { success: true };
    },
    async createAdminMenuItem(locationId, input) {
      const brandId = await getBrandIdForLocation(db, locationId);
      const category = await db
        .selectFrom("catalog_menu_categories")
        .selectAll()
        .where("location_id", "=", locationId)
        .where("category_id", "=", input.categoryId)
        .executeTakeFirst();

      if (!category) {
        return undefined;
      }

      const nextSortOrderResult = await db
        .selectFrom("catalog_menu_items")
        .select((eb) => eb.fn.max<number>("sort_order").as("max_sort_order"))
        .where("location_id", "=", locationId)
        .where("category_id", "=", input.categoryId)
        .executeTakeFirst();
      const nextSortOrder = (nextSortOrderResult?.max_sort_order ?? -1) + 1;
      const itemId = createMenuItemId(input.name);

      await db
        .insertInto("catalog_menu_items")
        .values({
          brand_id: brandId,
          location_id: locationId,
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
        imageUrl: input.imageUrl ?? undefined,
        priceCents: input.priceCents,
        visible: input.visible,
        sortOrder: nextSortOrder,
        customizationGroups: []
      });
    },
    async updateAdminMenuItem(locationId, input) {
      const existingRow = await db
        .selectFrom("catalog_menu_items")
        .selectAll()
        .where("location_id", "=", locationId)
        .where("item_id", "=", input.itemId)
        .executeTakeFirst();

      if (!existingRow) {
        return undefined;
      }
      const customizationGroups =
        input.customizationGroups === undefined
          ? toCustomizationGroups(existingRow.customization_groups_json)
          : toCustomizationGroups(input.customizationGroups);
      const nextImageUrl = input.imageUrl === undefined ? existingRow.image_url : input.imageUrl;

      await db
        .updateTable("catalog_menu_items")
        .set({
          name: input.name,
          image_url: nextImageUrl,
          price_cents: input.priceCents,
          visible: input.visible,
          customization_groups_json: JSON.stringify(customizationGroups)
        })
        .where("location_id", "=", locationId)
        .where("item_id", "=", input.itemId)
        .executeTakeFirst();

      const category = await db
        .selectFrom("catalog_menu_categories")
        .selectAll()
        .where("location_id", "=", locationId)
        .where("category_id", "=", existingRow.category_id)
        .executeTakeFirst();

      return toAdminMenuItem({
        itemId: existingRow.item_id,
        categoryId: existingRow.category_id,
        categoryTitle: category?.title ?? existingRow.category_id,
        name: input.name,
        description: existingRow.description,
        imageUrl: nextImageUrl ?? undefined,
        priceCents: input.priceCents,
        visible: input.visible,
        sortOrder: existingRow.sort_order,
        customizationGroups
      });
    },
    async updateAdminMenuItemVisibility(locationId, input) {
      const existingRow = await db
        .selectFrom("catalog_menu_items")
        .selectAll()
        .where("location_id", "=", locationId)
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
        .where("location_id", "=", locationId)
        .where("item_id", "=", input.itemId)
        .executeTakeFirst();

      const category = await db
        .selectFrom("catalog_menu_categories")
        .selectAll()
        .where("location_id", "=", locationId)
        .where("category_id", "=", existingRow.category_id)
        .executeTakeFirst();

      return toAdminMenuItem({
        itemId: existingRow.item_id,
        categoryId: existingRow.category_id,
        categoryTitle: category?.title ?? existingRow.category_id,
        name: existingRow.name,
        description: existingRow.description,
        imageUrl: existingRow.image_url ?? undefined,
        priceCents: existingRow.price_cents,
        visible: input.visible,
        sortOrder: existingRow.sort_order,
        customizationGroups: existingRow.customization_groups_json
      });
    },
    async deleteAdminMenuItem(locationId, itemId) {
      await db
        .deleteFrom("catalog_menu_items")
        .where("location_id", "=", locationId)
        .where("item_id", "=", itemId)
        .executeTakeFirst();

      return { success: true };
    },
    async getMenu(locationId) {
      const categories = await db
        .selectFrom("catalog_menu_categories")
        .selectAll()
        .where("location_id", "=", locationId)
        .orderBy("sort_order", "asc")
        .execute();

      if (categories.length === 0) {
        return menuResponseSchema.parse({
          locationId,
          currency: defaultMenuPayload.currency,
          categories: []
        });
      }

      const items = await db
        .selectFrom("catalog_menu_items")
        .selectAll()
        .where("location_id", "=", locationId)
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
        locationId,
        currency: defaultMenuPayload.currency,
        categories: categories.map((category) => ({
          id: category.category_id,
          title: category.title,
          items: itemsByCategory.get(category.category_id) ?? []
        }))
      });
    },
    async getAdminStoreConfig(locationId) {
      const row = await db
        .selectFrom("catalog_store_configs")
        .selectAll()
        .where("location_id", "=", locationId)
        .executeTakeFirst();

      if (!row) {
        return buildAdminStoreConfig({
          locationId,
          storeName: DEFAULT_BRAND_NAME,
          locationName: defaultAppConfigPayload.brand.locationName,
          hours: DEFAULT_STORE_HOURS,
          pickupInstructions: defaultStoreConfigRecord.pickupInstructions,
          taxRateBasisPoints: defaultStoreConfigRecord.taxRateBasisPoints,
          capabilities: defaultAppConfigPayload.storeCapabilities
        });
      }

      const appConfigRow = await db
        .selectFrom("catalog_app_configs")
        .select("app_config_json")
        .where("location_id", "=", locationId)
        .executeTakeFirst();
      const appConfig = appConfigSchema.parse(appConfigRow?.app_config_json ?? defaultAppConfigPayload);

      return buildAdminStoreConfig({
        locationId: row.location_id,
        storeName: row.store_name,
        locationName: appConfig.brand.locationName,
        hours: row.hours_text,
        pickupInstructions: row.pickup_instructions,
        taxRateBasisPoints: row.tax_rate_basis_points,
        capabilities: appConfig.storeCapabilities
      });
    },
    async updateAdminStoreConfig(locationId, input) {
      const brandId = await getBrandIdForLocation(db, locationId);
      const existingAppConfigRow = await db
        .selectFrom("catalog_app_configs")
        .select("app_config_json")
        .where("location_id", "=", locationId)
        .executeTakeFirst();
      const existingStoreConfigRow = await db
        .selectFrom("catalog_store_configs")
        .select(["prep_eta_minutes", "tax_rate_basis_points"])
        .where("location_id", "=", locationId)
        .executeTakeFirst();

      const currentAppConfig = appConfigSchema.parse(existingAppConfigRow?.app_config_json ?? defaultAppConfigPayload);
      const taxRateBasisPoints = input.taxRateBasisPoints ?? existingStoreConfigRow?.tax_rate_basis_points ?? defaultStoreConfigRecord.taxRateBasisPoints;
      const nextAppConfig = appConfigSchema.parse({
        ...currentAppConfig,
        brand: {
          ...currentAppConfig.brand,
          brandName: input.storeName,
          locationName: input.locationName
        },
        storeCapabilities: input.capabilities ?? currentAppConfig.storeCapabilities
      });
      await db.transaction().execute(async (trx) => {
        await trx
          .insertInto("catalog_store_configs")
          .values({
            brand_id: brandId,
            location_id: locationId,
            store_name: input.storeName,
            hours_text: input.hours,
            prep_eta_minutes: existingStoreConfigRow?.prep_eta_minutes ?? defaultStoreConfigRecord.prepEtaMinutes,
            tax_rate_basis_points: taxRateBasisPoints,
            pickup_instructions: input.pickupInstructions
          })
          .onConflict((oc) =>
            oc.column("location_id").doUpdateSet({
              brand_id: brandId,
              store_name: input.storeName,
              hours_text: input.hours,
              tax_rate_basis_points: taxRateBasisPoints,
              pickup_instructions: input.pickupInstructions
            })
          )
          .execute();

        await trx
          .insertInto("catalog_app_configs")
          .values({
            brand_id: brandId,
            location_id: locationId,
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
        locationId,
        storeName: input.storeName,
        locationName: input.locationName,
        hours: input.hours,
        pickupInstructions: input.pickupInstructions,
        taxRateBasisPoints,
        capabilities: nextAppConfig.storeCapabilities
      });
    },
    async getPublishedMobileExperience(locationId) {
      const row = await db
        .selectFrom("catalog_mobile_experience_versions")
        .select("experience_json")
        .where("location_id", "=", locationId)
        .orderBy("published_at", "desc")
        .executeTakeFirst();
      if (row) {
        return mobileExperienceDocumentSchema.parse(row.experience_json);
      }

      return buildDefaultMobileExperience({
        locationId,
        appConfig: await this.getAppConfig(locationId),
        published: true
      });
    },
    async getAdminMobileExperience(locationId) {
      const [draftRow, published] = await Promise.all([
        db
          .selectFrom("catalog_mobile_experience_drafts")
          .select("experience_json")
          .where("location_id", "=", locationId)
          .executeTakeFirst(),
        this.getPublishedMobileExperience(locationId)
      ]);

      return buildMobileExperienceDraft({
        locationId,
        appConfig: await this.getAppConfig(locationId),
        draft: draftRow ? mobileExperienceDocumentSchema.parse(draftRow.experience_json) : undefined,
        published
      });
    },
    async saveAdminMobileExperienceDraft(locationId, input) {
      const existing = await db
        .selectFrom("catalog_mobile_experience_drafts")
        .select("experience_json")
        .where("location_id", "=", locationId)
        .executeTakeFirst();
      const existingDraft = existing ? mobileExperienceDocumentSchema.parse(existing.experience_json) : undefined;
      const now = new Date().toISOString();
      const draft = mobileExperienceDocumentSchema.parse({
        ...input,
        locationId,
        versionId: input.versionId ?? existingDraft?.versionId ?? createMobileExperienceVersionId(),
        status: "draft",
        createdAt: existingDraft?.createdAt ?? now,
        updatedAt: now
      });

      await db
        .insertInto("catalog_mobile_experience_drafts")
        .values({
          location_id: locationId,
          experience_json: draft
        })
        .onConflict((oc) =>
          oc.column("location_id").doUpdateSet({
            experience_json: draft,
            updated_at: now
          })
        )
        .execute();

      return this.getAdminMobileExperience(locationId);
    },
    async publishAdminMobileExperience(locationId, draftVersionId) {
      const draftRow = await db
        .selectFrom("catalog_mobile_experience_drafts")
        .select("experience_json")
        .where("location_id", "=", locationId)
        .executeTakeFirst();
      const draft = draftRow
        ? mobileExperienceDocumentSchema.parse(draftRow.experience_json)
        : buildDefaultMobileExperience({
            locationId,
            appConfig: await this.getAppConfig(locationId)
          });
      if (draftVersionId && draft.versionId !== draftVersionId) {
        throw new Error("Draft version no longer matches the latest saved draft.");
      }

      const now = new Date().toISOString();
      const published = mobileExperienceDocumentSchema.parse({
        ...draft,
        locationId,
        versionId: createMobileExperienceVersionId(),
        status: "published",
        createdAt: now,
        updatedAt: now,
        publishedAt: now
      });

      await db.transaction().execute(async (trx) => {
        await trx
          .insertInto("catalog_mobile_experience_versions")
          .values({
            version_id: published.versionId,
            location_id: locationId,
            experience_json: published,
            published_at: now
          })
          .execute();

        await trx
          .insertInto("catalog_mobile_experience_drafts")
          .values({
            location_id: locationId,
            experience_json: mobileExperienceDocumentSchema.parse({
              ...published,
              status: "draft",
              publishedAt: undefined
            })
          })
          .onConflict((oc) =>
            oc.column("location_id").doUpdateSet({
              experience_json: mobileExperienceDocumentSchema.parse({
                ...published,
                status: "draft",
                publishedAt: undefined
              }),
              updated_at: now
            })
          )
          .execute();
      });

      return published;
    },
    async rollbackAdminMobileExperience(locationId, versionId) {
      const sourceRow = await db
        .selectFrom("catalog_mobile_experience_versions")
        .select("experience_json")
        .where("location_id", "=", locationId)
        .where("version_id", "=", versionId)
        .executeTakeFirst();

      if (!sourceRow) {
        throw new Error("Mobile experience version was not found.");
      }

      const source = mobileExperienceDocumentSchema.parse(sourceRow.experience_json);
      const now = new Date().toISOString();
      const published = mobileExperienceDocumentSchema.parse({
        ...source,
        locationId,
        versionId: createMobileExperienceVersionId(),
        status: "published",
        createdAt: now,
        updatedAt: now,
        publishedAt: now
      });
      const draft = mobileExperienceDocumentSchema.parse({
        ...published,
        status: "draft",
        publishedAt: undefined
      });

      await db.transaction().execute(async (trx) => {
        await trx
          .insertInto("catalog_mobile_experience_versions")
          .values({
            version_id: published.versionId,
            location_id: locationId,
            experience_json: published,
            published_at: now
          })
          .execute();

        await trx
          .insertInto("catalog_mobile_experience_drafts")
          .values({
            location_id: locationId,
            experience_json: draft
          })
          .onConflict((oc) =>
            oc.column("location_id").doUpdateSet({
              experience_json: draft,
              updated_at: now
            })
          )
          .execute();
      });

      return published;
    },
    async listAdminMobileExperienceVersions(locationId) {
      const rows = await db
        .selectFrom("catalog_mobile_experience_versions")
        .select("experience_json")
        .where("location_id", "=", locationId)
        .orderBy("published_at", "desc")
        .execute();

      return mobileExperienceVersionsResponseSchema.parse({
        locationId,
        versions: rows.map((row) => mobileExperienceDocumentSchema.parse(row.experience_json))
      });
    },
    async getStoreConfig(locationId) {
      const row = await db
        .selectFrom("catalog_store_configs")
        .selectAll()
        .where("location_id", "=", locationId)
        .executeTakeFirst();

      if (!row) {
        return undefined;
      }

      return buildStoreConfigResponse({
        locationId: row.location_id,
        hoursText: row.hours_text,
        prepEtaMinutes: row.prep_eta_minutes,
        taxRateBasisPoints: row.tax_rate_basis_points,
        pickupInstructions: row.pickup_instructions
      });
    },
    async writeAuditLog(entry) {
      await writeAuditLog(db, entry);
    },
    async pingDb() {
      await sql`SELECT 1`.execute(db);
    },
    async close() {
      await db.destroy();
    }
  };

  return postgresRepository;
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
