import { z } from "zod";

const customizationSelectionTypeInputSchema = z.enum(["single", "multi", "multiple", "boolean"]);
const customizationDisplayStyleSchema = z.enum(["chips", "list", "toggle"]).optional();
const customizationOptionDisplayStyleSchema = z.enum(["default", "emphasis"]).optional();

type CustomizationSelectionTypeInput = z.output<typeof customizationSelectionTypeInputSchema>;
type CustomizationSelectionType = "single" | "multiple";

type RawCustomizationOption = {
  id: string;
  label: string;
  description?: string;
  priceDeltaCents: number;
  default?: boolean;
  sortOrder?: number;
  available?: boolean;
  displayStyle?: z.output<typeof customizationOptionDisplayStyleSchema>;
};

type RawCustomizationGroup = {
  id: string;
  sourceGroupId?: string;
  label: string;
  description?: string;
  selectionType: CustomizationSelectionTypeInput;
  required?: boolean;
  minSelections?: number;
  maxSelections?: number;
  sortOrder?: number;
  displayStyle?: z.output<typeof customizationDisplayStyleSchema>;
  options: RawCustomizationOption[];
};

type RawCustomizationInput = {
  selectedOptions?: Array<{
    groupId: string;
    optionId: string;
  }>;
  notes?: string;
};

function compareBySortOrder(
  left: { sortOrder: number; label: string; id: string },
  right: { sortOrder: number; label: string; id: string }
) {
  return left.sortOrder - right.sortOrder || left.label.localeCompare(right.label) || left.id.localeCompare(right.id);
}

function trimToUndefined(value: string | undefined) {
  const next = value?.trim();
  return next && next.length > 0 ? next : undefined;
}

function normalizeSelectionType(selectionType: CustomizationSelectionTypeInput): CustomizationSelectionType {
  return selectionType === "single" ? "single" : "multiple";
}

function dedupeById<TValue extends { id: string }>(values: TValue[]): TValue[] {
  const map = new Map<string, TValue>();
  for (const value of values) {
    map.set(value.id, value);
  }
  return Array.from(map.values());
}

function dedupeSelections(
  selections: Array<{
    groupId: string;
    optionId: string;
  }>
) {
  const map = new Map<string, { groupId: string; optionId: string }>();
  for (const selection of selections) {
    map.set(`${selection.groupId}:${selection.optionId}`, selection);
  }

  return Array.from(map.values()).sort(
    (left, right) => left.groupId.localeCompare(right.groupId) || left.optionId.localeCompare(right.optionId)
  );
}

function normalizeCustomizationOption(input: RawCustomizationOption) {
  return {
    id: input.id,
    label: input.label,
    description: trimToUndefined(input.description),
    priceDeltaCents: input.priceDeltaCents,
    default: input.default ?? false,
    sortOrder: input.sortOrder ?? 0,
    available: input.available ?? true,
    displayStyle: input.displayStyle
  };
}

function normalizeCustomizationGroup(input: RawCustomizationGroup) {
  const selectionType = normalizeSelectionType(input.selectionType);
  const options = dedupeById(input.options.map(normalizeCustomizationOption)).sort(compareBySortOrder);
  const required = input.required ?? false;
  const availableOptionCount = options.filter((option) => option.available).length || options.length;

  let minSelections = input.minSelections ?? (required ? 1 : 0);
  let maxSelections =
    input.maxSelections ??
    (selectionType === "single" ? 1 : input.selectionType === "boolean" ? 1 : Math.max(availableOptionCount, 1));

  if (selectionType === "single") {
    minSelections = required ? 1 : 0;
    maxSelections = 1;
  } else {
    minSelections = Math.max(0, Math.min(minSelections, options.length));
    maxSelections = Math.max(minSelections, Math.min(maxSelections, Math.max(options.length, 1)));
  }

  return {
    id: input.id,
    sourceGroupId: trimToUndefined(input.sourceGroupId),
    label: input.label,
    description: trimToUndefined(input.description),
    selectionType,
    required,
    minSelections,
    maxSelections,
    sortOrder: input.sortOrder ?? 0,
    displayStyle: input.displayStyle,
    options
  };
}

function normalizeCustomizationInputValue(input: RawCustomizationInput) {
  return {
    selectedOptions: dedupeSelections(input.selectedOptions ?? []),
    notes: input.notes?.trim() ?? ""
  };
}

export const menuItemCustomizationOptionSchema = z
  .object({
    id: z.string().min(1),
    label: z.string().min(1),
    description: z.string().optional(),
    priceDeltaCents: z.number().int(),
    default: z.boolean().optional(),
    sortOrder: z.number().int().optional(),
    available: z.boolean().optional(),
    displayStyle: customizationOptionDisplayStyleSchema
  })
  .transform((value) => normalizeCustomizationOption(value));

export const menuItemCustomizationGroupSchema = z
  .object({
    id: z.string().min(1),
    sourceGroupId: z.string().min(1).optional(),
    label: z.string().min(1),
    description: z.string().optional(),
    selectionType: customizationSelectionTypeInputSchema,
    required: z.boolean().optional(),
    minSelections: z.number().int().nonnegative().optional(),
    maxSelections: z.number().int().positive().optional(),
    sortOrder: z.number().int().optional(),
    displayStyle: customizationDisplayStyleSchema,
    options: z.array(menuItemCustomizationOptionSchema).min(1)
  })
  .superRefine((value, context) => {
    const optionIds = new Set<string>();
    for (const option of value.options) {
      if (optionIds.has(option.id)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["options"],
          message: `Duplicate option id "${option.id}" in customization group "${value.id}".`
        });
      }
      optionIds.add(option.id);
    }

    if ((value.selectionType === "single" || value.selectionType === "boolean") && value.maxSelections && value.maxSelections > 1) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["maxSelections"],
        message: `Customization group "${value.id}" cannot select more than one option.`
      });
    }

    if (
      typeof value.minSelections === "number" &&
      typeof value.maxSelections === "number" &&
      value.minSelections > value.maxSelections
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["minSelections"],
        message: `Customization group "${value.id}" has minSelections greater than maxSelections.`
      });
    }
  })
  .transform((value) => normalizeCustomizationGroup(value));

export const menuItemCustomizationSelectionSchema = z.object({
  groupId: z.string().min(1),
  optionId: z.string().min(1)
});

export const menuItemCustomizationInputSchema = z
  .object({
    selectedOptions: z.array(menuItemCustomizationSelectionSchema).default([]),
    notes: z.string().optional()
  })
  .transform((value) => normalizeCustomizationInputValue(value));

export const menuItemSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  description: z.string(),
  imageUrl: z.string().min(1).optional(),
  priceCents: z.number().int().nonnegative(),
  badgeCodes: z.array(z.string()).default([]),
  visible: z.boolean(),
  customizationGroups: z.array(menuItemCustomizationGroupSchema).default([])
});

export const menuCategorySchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  items: z.array(menuItemSchema)
});

export const menuResponseSchema = z.object({
  locationId: z.string().min(1),
  currency: z.literal("USD"),
  categories: z.array(menuCategorySchema)
});

export const homeNewsCardSchema = z.object({
  cardId: z.string().min(1),
  label: z.string().min(1),
  title: z.string().min(1),
  body: z.string().min(1),
  note: z.string().min(1).optional(),
  sortOrder: z.number().int().nonnegative(),
  visible: z.boolean()
});

export const homeNewsCardsResponseSchema = z.object({
  locationId: z.string().min(1),
  cards: z.array(homeNewsCardSchema)
});

export const adminMenuItemImageUploadRequestSchema = z.object({
  fileName: z.string().min(1),
  contentType: z.string().min(1).regex(/^image\//, "Menu uploads must be image files."),
  sizeBytes: z.number().int().positive()
});

export const adminMenuItemImageVariantUploadSchema = z.object({
  variant: z.enum(["mobile-list", "mobile-hero"]),
  uploadMethod: z.literal("PUT"),
  uploadUrl: z.string().url(),
  uploadHeaders: z.record(z.string(), z.string()).default({}),
  assetUrl: z.string().url(),
  contentType: z.literal("image/jpeg"),
  width: z.number().int().positive(),
  quality: z.number().positive().max(1)
});

export const adminMenuItemImageUploadResponseSchema = z.object({
  uploadMethod: z.literal("PUT"),
  uploadUrl: z.string().url(),
  uploadHeaders: z.record(z.string(), z.string()).default({}),
  assetUrl: z.string().url(),
  variantUploads: z.array(adminMenuItemImageVariantUploadSchema).default([]),
  expiresAt: z.string().datetime()
});

export const homeNewsCardCreateSchema = z.object({
  label: z.string().min(1),
  title: z.string().min(1),
  body: z.string().min(1),
  note: z.string().min(1).optional(),
  visible: z.boolean(),
  sortOrder: z.number().int().nonnegative().optional()
});

export const homeNewsCardUpdateSchema = z.object({
  label: z.string().min(1),
  title: z.string().min(1),
  body: z.string().min(1),
  note: z.string().min(1).optional(),
  visible: z.boolean(),
  sortOrder: z.number().int().nonnegative()
});

export const homeNewsCardVisibilityUpdateSchema = z.object({
  visible: z.boolean()
});

export const storeConfigResponseSchema = z.object({
  locationId: z.string().min(1),
  hoursText: z.string().min(1),
  isOpen: z.boolean(),
  nextOpenAt: z.string().datetime().nullable(),
  prepEtaMinutes: z.number().int().positive(),
  taxRateBasisPoints: z.number().int().min(0).max(10_000),
  pickupInstructions: z.string()
});

export const adminMenuItemSchema = z.object({
  itemId: z.string().min(1),
  categoryId: z.string().min(1),
  categoryTitle: z.string().min(1),
  name: z.string().min(1),
  description: z.string().optional(),
  imageUrl: z.string().min(1).optional(),
  priceCents: z.number().int().nonnegative(),
  visible: z.boolean(),
  sortOrder: z.number().int().nonnegative()
});

export const adminMenuCategorySchema = z.object({
  categoryId: z.string().min(1),
  title: z.string().min(1),
  items: z.array(adminMenuItemSchema)
});

export const adminMenuResponseSchema = z.object({
  locationId: z.string().min(1),
  categories: z.array(adminMenuCategorySchema)
});

export const adminMenuItemUpdateSchema = z.object({
  name: z.string().min(1),
  priceCents: z.number().int().nonnegative(),
  visible: z.boolean(),
  imageUrl: z.string().url().nullable().optional()
});

export const adminMenuItemCreateSchema = z.object({
  categoryId: z.string().min(1),
  name: z.string().min(1),
  description: z.string().optional(),
  imageUrl: z.string().url().nullable().optional(),
  priceCents: z.number().int().nonnegative(),
  visible: z.boolean()
});

export const adminMenuItemVisibilityUpdateSchema = z.object({
  visible: z.boolean()
});

export const adminMutationSuccessSchema = z.object({
  success: z.literal(true)
});

export const adminStoreConfigSchema = z.object({
  locationId: z.string().min(1),
  storeName: z.string().min(1),
  locationName: z.string().min(1),
  hours: z.string().min(1),
  pickupInstructions: z.string().min(1),
  taxRateBasisPoints: z.number().int().min(0).max(10000),
  capabilities: z
    .object({
      menu: z.object({
        source: z.enum(["platform_managed", "external_sync"])
      }),
      operations: z.object({
        fulfillmentMode: z.enum(["staff", "time_based"]),
        liveOrderTrackingEnabled: z.boolean(),
        dashboardEnabled: z.boolean()
      }),
      loyalty: z.object({
        visible: z.boolean()
      })
    })
    .default({
      menu: {
        source: "platform_managed"
      },
      operations: {
        fulfillmentMode: "staff",
        liveOrderTrackingEnabled: true,
        dashboardEnabled: true
      },
      loyalty: {
        visible: true
      }
    })
});

export const appConfigThemeSchema = z.object({
  background: z.string().min(1),
  backgroundAlt: z.string().min(1),
  surface: z.string().min(1),
  surfaceMuted: z.string().min(1),
  foreground: z.string().min(1),
  foregroundMuted: z.string().min(1),
  muted: z.string().min(1),
  border: z.string().min(1),
  primary: z.string().min(1),
  accent: z.string().min(1),
  fontFamily: z.string().min(1).optional(),
  displayFontFamily: z.string().min(1).optional()
});

export const appConfigHeaderSchema = z.object({
  background: z.string().min(1),
  foreground: z.string().min(1).optional()
});

export const appConfigBrandSchema = z.object({
  brandId: z.string().min(1),
  brandName: z.string().min(1),
  locationId: z.string().min(1),
  locationName: z.string().min(1),
  marketLabel: z.string().min(1)
});

export const appConfigFeatureFlagsSchema = z.object({
  loyalty: z.boolean(),
  pushNotifications: z.boolean(),
  refunds: z.boolean(),
  orderTracking: z.boolean(),
  staffDashboard: z.boolean(),
  menuEditing: z.boolean()
});

export const appConfigPaymentCapabilitiesSchema = z.object({
  applePay: z.boolean(),
  card: z.boolean(),
  cash: z.boolean(),
  refunds: z.boolean(),
  stripe: z
    .object({
      enabled: z.boolean(),
      onboarded: z.boolean(),
      dashboardEnabled: z.boolean()
    })
    .default({
      enabled: false,
      onboarded: false,
      dashboardEnabled: false
    }),
});

export const appConfigFulfillmentModeSchema = z.enum(["staff", "time_based"]);

export const appConfigFulfillmentScheduleSchema = z
  .object({
    inPrep: z.number().int().nonnegative(),
    ready: z.number().int().nonnegative(),
    completed: z.number().int().nonnegative()
  })
  .superRefine((value, context) => {
    if (value.ready <= value.inPrep) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["ready"],
        message: "ready must be greater than inPrep for time-based fulfillment."
      });
    }

    if (value.completed <= value.ready) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["completed"],
        message: "completed must be greater than ready for time-based fulfillment."
      });
    }
  });

export const appConfigFulfillmentSchema = z.object({
  mode: appConfigFulfillmentModeSchema,
  timeBasedScheduleMinutes: appConfigFulfillmentScheduleSchema
});

export const DEFAULT_APP_CONFIG_FULFILLMENT = appConfigFulfillmentSchema.parse({
  mode: "staff",
  timeBasedScheduleMinutes: {
    inPrep: 5,
    ready: 10,
    completed: 15
  }
});

export const appConfigMenuSourceSchema = z.enum(["platform_managed", "external_sync"]);

export const appConfigStoreCapabilitiesSchema = z.object({
  menu: z.object({
    source: appConfigMenuSourceSchema
  }),
  operations: z.object({
    fulfillmentMode: appConfigFulfillmentModeSchema,
    liveOrderTrackingEnabled: z.boolean(),
    dashboardEnabled: z.boolean()
  }),
  loyalty: z.object({
    visible: z.boolean()
  })
});

export const DEFAULT_APP_CONFIG_STORE_CAPABILITIES = appConfigStoreCapabilitiesSchema.parse({
  menu: {
    source: "platform_managed"
  },
  operations: {
    fulfillmentMode: DEFAULT_APP_CONFIG_FULFILLMENT.mode,
    liveOrderTrackingEnabled: true,
    dashboardEnabled: true
  },
  loyalty: {
    visible: true
  }
});

type AppConfigCapabilityInput = Partial<
  z.output<
    z.ZodObject<{
      featureFlags: typeof appConfigFeatureFlagsSchema;
      loyaltyEnabled: z.ZodBoolean;
      fulfillment: typeof appConfigFulfillmentSchema;
      storeCapabilities: z.ZodOptional<typeof appConfigStoreCapabilitiesSchema>;
    }>
  >
>;

function deriveStoreCapabilitiesFromLegacyAppConfig(input: AppConfigCapabilityInput) {
  const platformManagedMenu =
    input.featureFlags?.menuEditing ??
    (input.storeCapabilities ? input.storeCapabilities.menu.source === "platform_managed" : true);

  return appConfigStoreCapabilitiesSchema.parse({
    menu: {
      source: platformManagedMenu ? "platform_managed" : "external_sync"
    },
    operations: {
      fulfillmentMode: input.fulfillment?.mode ?? DEFAULT_APP_CONFIG_STORE_CAPABILITIES.operations.fulfillmentMode,
      liveOrderTrackingEnabled:
        input.featureFlags?.orderTracking ?? DEFAULT_APP_CONFIG_STORE_CAPABILITIES.operations.liveOrderTrackingEnabled,
      dashboardEnabled:
        input.featureFlags?.staffDashboard ?? DEFAULT_APP_CONFIG_STORE_CAPABILITIES.operations.dashboardEnabled
    },
    loyalty: {
      visible: input.loyaltyEnabled ?? input.featureFlags?.loyalty ?? DEFAULT_APP_CONFIG_STORE_CAPABILITIES.loyalty.visible
    }
  });
}

export function resolveAppConfigStoreCapabilities(input: AppConfigCapabilityInput | null | undefined) {
  if (!input) {
    return DEFAULT_APP_CONFIG_STORE_CAPABILITIES;
  }

  return input.storeCapabilities
    ? appConfigStoreCapabilitiesSchema.parse(input.storeCapabilities)
    : deriveStoreCapabilitiesFromLegacyAppConfig(input);
}

function normalizeAppConfig(input: {
  brand: z.output<typeof appConfigBrandSchema>;
  theme: z.output<typeof appConfigThemeSchema>;
  header?: z.output<typeof appConfigHeaderSchema>;
  enabledTabs: Array<z.output<z.ZodEnum<["home", "menu", "orders", "account"]>>>;
  featureFlags: z.output<typeof appConfigFeatureFlagsSchema>;
  loyaltyEnabled: boolean;
  paymentCapabilities: z.output<typeof appConfigPaymentCapabilitiesSchema>;
  fulfillment: z.output<typeof appConfigFulfillmentSchema>;
  storeCapabilities?: z.output<typeof appConfigStoreCapabilitiesSchema>;
}) {
  const storeCapabilities = resolveAppConfigStoreCapabilities(input);
  const header = appConfigHeaderSchema.parse({
    background: input.header?.background ?? input.theme.backgroundAlt,
    foreground: input.header?.foreground ?? input.theme.foreground
  });

  return {
    ...input,
    header,
    storeCapabilities,
    featureFlags: {
      ...input.featureFlags,
      loyalty: storeCapabilities.loyalty.visible,
      orderTracking: storeCapabilities.operations.liveOrderTrackingEnabled,
      staffDashboard: storeCapabilities.operations.dashboardEnabled,
      menuEditing: storeCapabilities.menu.source === "platform_managed"
    },
    loyaltyEnabled: storeCapabilities.loyalty.visible,
    fulfillment: {
      ...input.fulfillment,
      mode: storeCapabilities.operations.fulfillmentMode
    }
  };
}

export function isPlatformManagedMenu(config: AppConfigCapabilityInput | null | undefined) {
  return resolveAppConfigStoreCapabilities(config).menu.source === "platform_managed";
}

export function isStaffDashboardEnabled(config: AppConfigCapabilityInput | null | undefined) {
  return resolveAppConfigStoreCapabilities(config).operations.dashboardEnabled;
}

export function isOrderTrackingEnabled(config: AppConfigCapabilityInput | null | undefined) {
  return resolveAppConfigStoreCapabilities(config).operations.liveOrderTrackingEnabled;
}

export function isLoyaltyVisible(config: AppConfigCapabilityInput | null | undefined) {
  return resolveAppConfigStoreCapabilities(config).loyalty.visible;
}

export function resolveAppConfigFulfillmentMode(config: AppConfigCapabilityInput | null | undefined) {
  return resolveAppConfigStoreCapabilities(config).operations.fulfillmentMode;
}

const appConfigSchemaBase = z.object({
  brand: appConfigBrandSchema,
  theme: appConfigThemeSchema,
  header: appConfigHeaderSchema.optional(),
  enabledTabs: z.array(z.enum(["home", "menu", "orders", "account"])).min(1),
  featureFlags: appConfigFeatureFlagsSchema,
  loyaltyEnabled: z.boolean(),
  paymentCapabilities: appConfigPaymentCapabilitiesSchema,
  fulfillment: appConfigFulfillmentSchema.default(DEFAULT_APP_CONFIG_FULFILLMENT),
  storeCapabilities: appConfigStoreCapabilitiesSchema.optional()
});

export const appConfigSchema = appConfigSchemaBase.transform((value) => normalizeAppConfig(value));

export const adminStoreConfigUpdateSchema = z.object({
  storeName: z.string().min(1),
  locationName: z.string().min(1),
  hours: z.string().min(1),
  pickupInstructions: z.string().min(1),
  taxRateBasisPoints: z.number().int().min(0).max(10000).optional(),
  capabilities: appConfigStoreCapabilitiesSchema.optional()
});

export const internalLocationParamsSchema = z.object({
  locationId: z.string().trim().min(1)
});

const clientPaymentProfileSchemaBase = z.object({
  locationId: z.string().trim().min(1),
  stripeAccountId: z.string().trim().regex(/^acct_[A-Za-z0-9]+$/).optional(),
  stripeAccountType: z.literal("express").default("express"),
  stripeOnboardingStatus: z.enum(["unconfigured", "pending", "restricted", "completed"]).default("unconfigured"),
  stripeDetailsSubmitted: z.boolean().default(false),
  stripeChargesEnabled: z.boolean().default(false),
  stripePayoutsEnabled: z.boolean().default(false),
  stripeDashboardEnabled: z.boolean().default(false),
  country: z.literal("US").default("US"),
  currency: z.literal("USD").default("USD"),
  cardEnabled: z.boolean().default(true),
  applePayEnabled: z.boolean().default(true),
  refundsEnabled: z.boolean().default(true),
  cloverPosEnabled: z.boolean().default(false),
  createdAt: z.string().datetime().optional(),
  updatedAt: z.string().datetime().optional()
});

export const clientPaymentProfileSchema = clientPaymentProfileSchemaBase;

export const internalLocationBootstrapSchema = z.object({
  brandId: z.string().trim().min(1).optional(),
  brandName: z.string().trim().min(1),
  locationId: z.string().trim().min(1).optional(),
  locationName: z.string().trim().min(1),
  marketLabel: z.string().trim().min(1),
  storeName: z.string().trim().min(1).optional(),
  hours: z.string().trim().min(1).optional(),
  pickupInstructions: z.string().trim().min(1).optional(),
  taxRateBasisPoints: z.number().int().min(0).max(10000).optional(),
  capabilities: appConfigStoreCapabilitiesSchema.optional(),
  paymentProfile: clientPaymentProfileSchema.optional()
});

export const internalLocationPaymentProfileUpdateSchema = clientPaymentProfileSchema.omit({
  createdAt: true,
  updatedAt: true
});

export const paymentReadinessSchema = z.object({
  ready: z.boolean(),
  onboardingState: clientPaymentProfileSchema.shape.stripeOnboardingStatus,
  missingRequiredFields: z.array(z.string())
});

export const onboardingStatusSchema = z.enum([
  "draft",
  "invited",
  "in_progress",
  "ready_for_review",
  "approved",
  "live",
  "blocked"
]);

export const onboardingChecklistItemIdSchema = z.enum([
  "owner_invited",
  "owner_activated",
  "business_profile_complete",
  "store_operations_complete",
  "payments_connected",
  "menu_ready",
  "team_configured_or_skipped",
  "test_order_completed",
  "mobile_release_ready",
  "admin_launch_approved"
]);

export const onboardingChecklistItemStatusSchema = z.enum(["pending", "complete", "blocked", "skipped"]);

export const onboardingChecklistItemSchema = z.object({
  id: onboardingChecklistItemIdSchema,
  label: z.string().trim().min(1),
  status: onboardingChecklistItemStatusSchema.default("pending"),
  passed: z.boolean(),
  required: z.boolean().default(true),
  manual: z.boolean().default(false),
  detail: z.string().trim().min(1).optional(),
  updatedAt: z.string().datetime().optional()
});

export const mobileReleaseStatusSchema = z.enum([
  "not_started",
  "metadata_pending",
  "metadata_ready",
  "build_configuring",
  "build_ready",
  "submitted_for_review",
  "approved",
  "ready_for_launch",
  "live",
  "blocked"
]);

export const mobileReleaseProfileSchema = z.object({
  locationId: z.string().trim().min(1),
  status: mobileReleaseStatusSchema.default("not_started"),
  statusLabel: z.string().trim().min(1).optional(),
  appStoreUrl: z.string().trim().url().optional(),
  testFlightUrl: z.string().trim().url().optional(),
  buildNumber: z.string().trim().min(1).optional(),
  submittedAt: z.string().datetime().optional(),
  approvedAt: z.string().datetime().optional(),
  liveAt: z.string().datetime().optional(),
  blockedReason: z.string().trim().min(1).optional(),
  notes: z.string().trim().min(1).optional(),
  updatedAt: z.string().datetime().optional()
});

export const adminClientCreateRequestSchema = z.object({
  clientName: z.string().trim().min(1),
  locationName: z.string().trim().min(1),
  marketLabel: z.string().trim().min(1),
  ownerEmail: z.string().trim().email(),
  ownerName: z.string().trim().min(1).optional(),
  storeName: z.string().trim().min(1).optional(),
  hours: z.string().trim().min(1).optional(),
  pickupInstructions: z.string().trim().min(1).optional(),
  taxRateBasisPoints: z.number().int().min(0).max(10000).optional(),
  capabilities: appConfigStoreCapabilitiesSchema.optional()
}).strict();

export const onboardingSummarySchema = z.object({
  tenantId: z.string().trim().min(1),
  brandId: z.string().trim().min(1),
  brandName: z.string().trim().min(1),
  locationId: z.string().trim().min(1),
  locationName: z.string().trim().min(1),
  marketLabel: z.string().trim().min(1),
  status: onboardingStatusSchema,
  readyForReview: z.boolean(),
  checklist: z.array(onboardingChecklistItemSchema),
  paymentReadiness: paymentReadinessSchema.optional(),
  mobileRelease: mobileReleaseProfileSchema.optional(),
  submittedForReviewAt: z.string().datetime().optional(),
  approvedAt: z.string().datetime().optional(),
  liveAt: z.string().datetime().optional(),
  blockedReason: z.string().trim().min(1).optional(),
  updatedAt: z.string().datetime().optional()
});

export const adminClientCreateResponseSchema = z.object({
  tenantId: z.string().trim().min(1),
  locationId: z.string().trim().min(1),
  onboarding: onboardingSummarySchema
});

export const internalClientLocationSchema = z.object({
  tenantId: z.string().trim().min(1),
  brandId: z.string().trim().min(1),
  locationId: z.string().trim().min(1),
  locationName: z.string().trim().min(1),
  marketLabel: z.string().trim().min(1),
  primaryLocation: z.boolean(),
  createdAt: z.string().datetime().optional(),
  updatedAt: z.string().datetime().optional()
});

export const internalClientSummarySchema = z.object({
  tenantId: z.string().trim().min(1),
  brandId: z.string().trim().min(1),
  clientName: z.string().trim().min(1),
  status: onboardingStatusSchema,
  primaryLocationId: z.string().trim().min(1).optional(),
  locationCount: z.number().int().nonnegative(),
  createdAt: z.string().datetime().optional(),
  updatedAt: z.string().datetime().optional()
});

export const internalClientDetailSchema = internalClientSummarySchema.extend({
  locations: z.array(internalClientLocationSchema),
  onboarding: onboardingSummarySchema.optional()
});

export const internalClientListResponseSchema = z.object({
  clients: z.array(internalClientSummarySchema)
});

export const operatorOnboardingUpdateSchema = z.object({
  businessProfileComplete: z.boolean().optional(),
  storeOperationsComplete: z.boolean().optional(),
  menuReady: z.boolean().optional(),
  teamConfiguredOrSkipped: z.boolean().optional(),
  testOrderCompleted: z.boolean().optional(),
  readyForReview: z.boolean().optional(),
  blockedReason: z.string().trim().min(1).nullable().optional(),
  notes: z.string().trim().min(1).optional()
});

export const launchApprovalRequestSchema = z.object({
  approved: z.boolean(),
  live: z.boolean().optional(),
  note: z.string().trim().min(1).optional()
});

export const mobileReleaseProfileUpdateSchema = mobileReleaseProfileSchema
  .omit({
    locationId: true,
    updatedAt: true
  })
  .partial()
  .extend({
    status: mobileReleaseStatusSchema.optional()
  });

export const stripeConnectOnboardingLinkRequestSchema = z.object({
  locationId: z.string().trim().min(1),
  returnUrl: z.string().trim().url(),
  refreshUrl: z.string().trim().url()
});

export const stripeConnectDashboardLinkRequestSchema = z.object({
  locationId: z.string().trim().min(1)
});

export const stripeConnectLinkResponseSchema = z.object({
  locationId: z.string().trim().min(1),
  stripeAccountId: z.string().trim().regex(/^acct_[A-Za-z0-9]+$/),
  url: z.string().trim().url(),
  expiresAt: z.string().datetime().optional(),
  paymentProfile: clientPaymentProfileSchema,
  paymentReadiness: paymentReadinessSchema
});

export const internalLocationSummarySchema = z.object({
  brandId: z.string().min(1),
  brandName: z.string().min(1),
  locationId: z.string().min(1),
  locationName: z.string().min(1),
  marketLabel: z.string().min(1),
  storeName: z.string().min(1),
  hours: z.string().min(1),
  pickupInstructions: z.string().min(1),
  taxRateBasisPoints: z.number().int().min(0).max(10000),
  capabilities: appConfigStoreCapabilitiesSchema,
  paymentProfile: clientPaymentProfileSchema.optional(),
  paymentReadiness: paymentReadinessSchema.optional(),
  action: z.enum(["created", "updated"]).optional()
});

export const internalLocationListResponseSchema = z.object({
  locations: z.array(internalLocationSummarySchema)
});

export const launchReadinessCheckSchema = z.object({
  id: z.enum([
    "owner_provisioned",
    "stripe_onboarded",
    "menu_has_items",
    "fulfillment_mode_set",
    "hours_configured",
    "tax_configured",
    "test_order_confirmed"
  ]),
  label: z.string().min(1),
  passed: z.boolean(),
  manual: z.boolean().default(false),
  detail: z.string().min(1).optional()
});

export const launchReadinessResponseSchema = z.object({
  locationId: z.string().min(1),
  ready: z.boolean(),
  passedCount: z.number().int().min(0),
  totalCount: z.number().int().min(0),
  checks: z.array(launchReadinessCheckSchema)
});

export type MenuItemCustomizationOption = z.output<typeof menuItemCustomizationOptionSchema>;
export type MenuItemCustomizationGroup = z.output<typeof menuItemCustomizationGroupSchema>;
export type MenuItemCustomizationSelection = z.output<typeof menuItemCustomizationSelectionSchema>;
export type MenuItemCustomizationInput = z.output<typeof menuItemCustomizationInputSchema>;
export type MenuItem = z.output<typeof menuItemSchema>;
export type HomeNewsCard = z.output<typeof homeNewsCardSchema>;
export type HomeNewsCardsResponse = z.output<typeof homeNewsCardsResponseSchema>;
export type HomeNewsCardCreate = z.output<typeof homeNewsCardCreateSchema>;
export type HomeNewsCardUpdate = z.output<typeof homeNewsCardUpdateSchema>;
export type HomeNewsCardVisibilityUpdate = z.output<typeof homeNewsCardVisibilityUpdateSchema>;
export type AdminMenuItemImageUploadRequest = z.output<typeof adminMenuItemImageUploadRequestSchema>;
export type AdminMenuItemImageVariantUpload = z.output<typeof adminMenuItemImageVariantUploadSchema>;
export type AdminMenuItemImageUploadResponse = z.output<typeof adminMenuItemImageUploadResponseSchema>;
export type MenuCategory = z.output<typeof menuCategorySchema>;
export type MenuResponse = z.output<typeof menuResponseSchema>;
export type StoreConfigResponse = z.output<typeof storeConfigResponseSchema>;
export type AdminMenuItem = z.output<typeof adminMenuItemSchema>;
export type AdminMenuCategory = z.output<typeof adminMenuCategorySchema>;
export type AdminMenuResponse = z.output<typeof adminMenuResponseSchema>;
export type AdminStoreConfig = z.output<typeof adminStoreConfigSchema>;
export type AdminMenuItemUpdate = z.output<typeof adminMenuItemUpdateSchema>;
export type AdminMenuItemCreate = z.output<typeof adminMenuItemCreateSchema>;
export type AdminMenuItemVisibilityUpdate = z.output<typeof adminMenuItemVisibilityUpdateSchema>;
export type AppConfigTheme = z.output<typeof appConfigThemeSchema>;
export type AppConfigHeader = z.output<typeof appConfigHeaderSchema>;
export type AppConfigBrand = z.output<typeof appConfigBrandSchema>;
export type AppConfigFeatureFlags = z.output<typeof appConfigFeatureFlagsSchema>;
export type AppConfigPaymentCapabilities = z.output<typeof appConfigPaymentCapabilitiesSchema>;
export type AppConfigFulfillmentMode = z.output<typeof appConfigFulfillmentModeSchema>;
export type AppConfigFulfillmentSchedule = z.output<typeof appConfigFulfillmentScheduleSchema>;
export type AppConfigFulfillment = z.output<typeof appConfigFulfillmentSchema>;
export type AppConfigMenuSource = z.output<typeof appConfigMenuSourceSchema>;
export type AppConfigStoreCapabilities = z.output<typeof appConfigStoreCapabilitiesSchema>;
export type AppConfig = z.output<typeof appConfigSchema>;
export type ClientPaymentProfile = z.output<typeof clientPaymentProfileSchema>;
export type InternalLocationPaymentProfileUpdate = z.output<typeof internalLocationPaymentProfileUpdateSchema>;
export type PaymentReadiness = z.output<typeof paymentReadinessSchema>;
export type OnboardingStatus = z.output<typeof onboardingStatusSchema>;
export type OnboardingChecklistItemId = z.output<typeof onboardingChecklistItemIdSchema>;
export type OnboardingChecklistItemStatus = z.output<typeof onboardingChecklistItemStatusSchema>;
export type OnboardingChecklistItem = z.output<typeof onboardingChecklistItemSchema>;
export type MobileReleaseStatus = z.output<typeof mobileReleaseStatusSchema>;
export type MobileReleaseProfile = z.output<typeof mobileReleaseProfileSchema>;
export type MobileReleaseProfileUpdate = z.output<typeof mobileReleaseProfileUpdateSchema>;
export type AdminClientCreateRequest = z.output<typeof adminClientCreateRequestSchema>;
export type AdminClientCreateResponse = z.output<typeof adminClientCreateResponseSchema>;
export type InternalClientLocation = z.output<typeof internalClientLocationSchema>;
export type InternalClientSummary = z.output<typeof internalClientSummarySchema>;
export type InternalClientDetail = z.output<typeof internalClientDetailSchema>;
export type InternalClientListResponse = z.output<typeof internalClientListResponseSchema>;
export type OnboardingSummary = z.output<typeof onboardingSummarySchema>;
export type OperatorOnboardingUpdate = z.output<typeof operatorOnboardingUpdateSchema>;
export type LaunchApprovalRequest = z.output<typeof launchApprovalRequestSchema>;
export type StripeConnectOnboardingLinkRequest = z.output<typeof stripeConnectOnboardingLinkRequestSchema>;
export type StripeConnectDashboardLinkRequest = z.output<typeof stripeConnectDashboardLinkRequestSchema>;
export type StripeConnectLinkResponse = z.output<typeof stripeConnectLinkResponseSchema>;
export type InternalLocationBootstrap = z.output<typeof internalLocationBootstrapSchema>;
export type InternalLocationSummary = z.output<typeof internalLocationSummarySchema>;
export type InternalLocationListResponse = z.output<typeof internalLocationListResponseSchema>;
export type LaunchReadinessCheck = z.output<typeof launchReadinessCheckSchema>;
export type LaunchReadinessResponse = z.output<typeof launchReadinessResponseSchema>;

export type CustomizationValidationIssueCode =
  | "unknown_group"
  | "unknown_option"
  | "option_unavailable"
  | "group_missing_required"
  | "group_below_min"
  | "group_above_max"
  | "group_single_violation";

export type CustomizationValidationIssue = {
  code: CustomizationValidationIssueCode;
  groupId: string;
  optionId?: string;
  message: string;
};

export type CustomizationOptionSnapshot = {
  optionId: string;
  optionLabel: string;
  optionDescription?: string;
  priceDeltaCents: number;
};

export type CustomizationGroupSelectionSnapshot = {
  groupId: string;
  groupLabel: string;
  groupDescription?: string;
  selectionType: CustomizationSelectionType;
  required: boolean;
  minSelections: number;
  maxSelections: number;
  selectedOptions: CustomizationOptionSnapshot[];
};

export type ResolvedMenuItemCustomization = {
  groups: MenuItemCustomizationGroup[];
  input: MenuItemCustomizationInput;
  groupSelections: CustomizationGroupSelectionSnapshot[];
  issues: CustomizationValidationIssue[];
  valid: boolean;
  customizationDeltaCents: number;
};

export type PricedMenuItemCustomization = ResolvedMenuItemCustomization & {
  basePriceCents: number;
  quantity: number;
  unitPriceCents: number;
  lineTotalCents: number;
};

export const EMPTY_MENU_ITEM_CUSTOMIZATION: MenuItemCustomizationInput = menuItemCustomizationInputSchema.parse({});

export function normalizeCustomizationGroups(groups: readonly unknown[] | undefined): MenuItemCustomizationGroup[] {
  return z.array(menuItemCustomizationGroupSchema).parse(groups ?? []).sort(compareBySortOrder);
}

export function normalizeCustomizationInput(input: unknown): MenuItemCustomizationInput {
  return menuItemCustomizationInputSchema.parse(input ?? {});
}

function selectDefaultOptionsForGroup(group: MenuItemCustomizationGroup) {
  const defaultOptions = group.options.filter((option) => option.available && option.default);
  if (group.selectionType === "single") {
    const defaultOption =
      defaultOptions[0] ?? (group.minSelections > 0 ? group.options.find((option) => option.available) ?? group.options[0] : undefined);
    return defaultOption ? [defaultOption] : [];
  }

  if (defaultOptions.length > 0) {
    return defaultOptions.slice(0, group.maxSelections);
  }

  if (group.minSelections <= 0) {
    return [];
  }

  return group.options.filter((option) => option.available).slice(0, group.minSelections);
}

export function buildDefaultCustomizationInput(groupsInput: readonly unknown[]): MenuItemCustomizationInput {
  const groups = normalizeCustomizationGroups(groupsInput);
  return normalizeCustomizationInput({
    selectedOptions: groups.flatMap((group) =>
      selectDefaultOptionsForGroup(group).map((option) => ({
        groupId: group.id,
        optionId: option.id
      }))
    )
  });
}

function createIssue(input: {
  code: CustomizationValidationIssueCode;
  groupId: string;
  optionId?: string;
  message: string;
}): CustomizationValidationIssue {
  return input;
}

export function resolveMenuItemCustomization(input: {
  groups: readonly unknown[];
  selection?: unknown;
}): ResolvedMenuItemCustomization {
  const groups = normalizeCustomizationGroups(input.groups);
  const selection = normalizeCustomizationInput(input.selection);
  const groupById = new Map(groups.map((group) => [group.id, group] as const));
  const selectedOptionIdsByGroup = new Map<string, Set<string>>();
  const issues: CustomizationValidationIssue[] = [];

  for (const selectedOption of selection.selectedOptions) {
    const group = groupById.get(selectedOption.groupId);
    if (!group) {
      issues.push(
        createIssue({
          code: "unknown_group",
          groupId: selectedOption.groupId,
          optionId: selectedOption.optionId,
          message: `Unknown customization group "${selectedOption.groupId}".`
        })
      );
      continue;
    }

    const option = group.options.find((candidate) => candidate.id === selectedOption.optionId);
    if (!option) {
      issues.push(
        createIssue({
          code: "unknown_option",
          groupId: group.id,
          optionId: selectedOption.optionId,
          message: `Unknown customization option "${selectedOption.optionId}" for group "${group.id}".`
        })
      );
      continue;
    }

    if (!option.available) {
      issues.push(
        createIssue({
          code: "option_unavailable",
          groupId: group.id,
          optionId: option.id,
          message: `Customization option "${option.id}" is unavailable.`
        })
      );
      continue;
    }

    const existing = selectedOptionIdsByGroup.get(group.id) ?? new Set<string>();
    existing.add(option.id);
    selectedOptionIdsByGroup.set(group.id, existing);
  }

  const groupSelections: CustomizationGroupSelectionSnapshot[] = groups.map((group) => {
    const selectedOptionIds = selectedOptionIdsByGroup.get(group.id) ?? new Set<string>();
    const selectedOptions = group.options
      .filter((option) => selectedOptionIds.has(option.id))
      .sort(compareBySortOrder)
      .map<CustomizationOptionSnapshot>((option) => ({
        optionId: option.id,
        optionLabel: option.label,
        optionDescription: option.description,
        priceDeltaCents: option.priceDeltaCents
      }));

    if (group.selectionType === "single" && selectedOptions.length > 1) {
      issues.push(
        createIssue({
          code: "group_single_violation",
          groupId: group.id,
          message: `Customization group "${group.label}" can only have one selected option.`
        })
      );
    }

    if (selectedOptions.length > group.maxSelections) {
      issues.push(
        createIssue({
          code: "group_above_max",
          groupId: group.id,
          message: `Customization group "${group.label}" allows at most ${group.maxSelections} selection${group.maxSelections === 1 ? "" : "s"}.`
        })
      );
    }

    if (group.required && selectedOptions.length === 0) {
      issues.push(
        createIssue({
          code: "group_missing_required",
          groupId: group.id,
          message: `Customization group "${group.label}" is required.`
        })
      );
    } else if (selectedOptions.length < group.minSelections) {
      issues.push(
        createIssue({
          code: "group_below_min",
          groupId: group.id,
          message: `Customization group "${group.label}" requires at least ${group.minSelections} selection${group.minSelections === 1 ? "" : "s"}.`
        })
      );
    }

    return {
      groupId: group.id,
      groupLabel: group.label,
      groupDescription: group.description,
      selectionType: group.selectionType,
      required: group.required,
      minSelections: group.minSelections,
      maxSelections: group.maxSelections,
      selectedOptions
    };
  });

  const customizationDeltaCents = groupSelections.reduce(
    (sum, group) => sum + group.selectedOptions.reduce((groupSum, option) => groupSum + option.priceDeltaCents, 0),
    0
  );

  return {
    groups,
    input: selection,
    groupSelections,
    issues,
    valid: issues.length === 0,
    customizationDeltaCents
  };
}

export function priceMenuItemCustomization(input: {
  basePriceCents: number;
  quantity?: number;
  groups: readonly unknown[];
  selection?: unknown;
}): PricedMenuItemCustomization {
  const resolved = resolveMenuItemCustomization({
    groups: input.groups,
    selection: input.selection
  });
  const quantity = Math.max(1, input.quantity ?? 1);
  const unitPriceCents = input.basePriceCents + resolved.customizationDeltaCents;

  return {
    ...resolved,
    basePriceCents: input.basePriceCents,
    quantity,
    unitPriceCents,
    lineTotalCents: unitPriceCents * quantity
  };
}

export function describeCustomizationSelection(input: {
  selection: Pick<MenuItemCustomizationInput, "notes">;
  groupSelections: CustomizationGroupSelectionSnapshot[];
  groupOrder?: readonly string[];
  includeNotes?: boolean;
  fallback?: string;
}) {
  const groupRank = new Map((input.groupOrder ?? []).map((groupId, index) => [groupId, index] as const));
  const orderedGroups = [...input.groupSelections].sort((left, right) => {
    const leftRank = groupRank.get(left.groupId);
    const rightRank = groupRank.get(right.groupId);

    if (typeof leftRank === "number" || typeof rightRank === "number") {
      return (leftRank ?? Number.MAX_SAFE_INTEGER) - (rightRank ?? Number.MAX_SAFE_INTEGER);
    }

    return 0;
  });

  const parts = orderedGroups
    .filter((group) => group.selectedOptions.length > 0)
    .map((group) => group.selectedOptions.map((option) => option.optionLabel).join(", "));

  if (input.includeNotes !== false && input.selection.notes) {
    parts.push(`note: ${input.selection.notes}`);
  }

  return parts.length > 0 ? parts.join(" · ") : (input.fallback ?? "Standard");
}

export const catalogContract = {
  basePath: "",
  routes: {
    appConfig: {
      method: "GET",
      path: "/app-config",
      request: z.undefined(),
      response: appConfigSchema
    },
    menu: {
      method: "GET",
      path: "/menu",
      request: z.undefined(),
      response: menuResponseSchema
    },
    cards: {
      method: "GET",
      path: "/cards",
      request: z.undefined(),
      response: homeNewsCardsResponseSchema
    },
    storeCards: {
      method: "GET",
      path: "/store/cards",
      request: z.undefined(),
      response: homeNewsCardsResponseSchema
    },
    storeConfig: {
      method: "GET",
      path: "/store/config",
      request: z.undefined(),
      response: storeConfigResponseSchema
    },
    adminMenu: {
      method: "GET",
      path: "/admin/menu",
      request: z.undefined(),
      response: adminMenuResponseSchema
    },
    adminMenuUpdate: {
      method: "PUT",
      path: "/admin/menu/:itemId",
      request: adminMenuItemUpdateSchema,
      response: adminMenuItemSchema
    },
    adminMenuItemImageUpload: {
      method: "POST",
      path: "/admin/menu/:itemId/image-upload",
      request: adminMenuItemImageUploadRequestSchema,
      response: adminMenuItemImageUploadResponseSchema
    },
    adminCards: {
      method: "GET",
      path: "/admin/cards",
      request: z.undefined(),
      response: homeNewsCardsResponseSchema
    },
    adminCardsUpdate: {
      method: "PUT",
      path: "/admin/cards",
      request: homeNewsCardsResponseSchema,
      response: homeNewsCardsResponseSchema
    },
    adminCardCreate: {
      method: "POST",
      path: "/admin/cards",
      request: homeNewsCardCreateSchema,
      response: homeNewsCardSchema
    },
    adminCardUpdate: {
      method: "PUT",
      path: "/admin/cards/:cardId",
      request: homeNewsCardUpdateSchema,
      response: homeNewsCardSchema
    },
    adminCardVisibility: {
      method: "PATCH",
      path: "/admin/cards/:cardId/visibility",
      request: homeNewsCardVisibilityUpdateSchema,
      response: homeNewsCardSchema
    },
    adminCardDelete: {
      method: "DELETE",
      path: "/admin/cards/:cardId",
      request: z.undefined(),
      response: adminMutationSuccessSchema
    },
    adminStoreConfig: {
      method: "GET",
      path: "/admin/store/config",
      request: z.undefined(),
      response: adminStoreConfigSchema
    },
    adminStoreConfigUpdate: {
      method: "PUT",
      path: "/admin/store/config",
      request: adminStoreConfigUpdateSchema,
      response: adminStoreConfigSchema
    }
  }
} as const;
