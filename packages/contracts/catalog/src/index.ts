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

export const storeConfigResponseSchema = z.object({
  locationId: z.string().min(1),
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
  visible: z.boolean()
});

export const adminMenuItemCreateSchema = z.object({
  categoryId: z.string().min(1),
  name: z.string().min(1),
  description: z.string().optional(),
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
  hours: z.string().min(1),
  pickupInstructions: z.string().min(1),
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
        fulfillmentMode: "time_based",
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
  clover: z.object({
    enabled: z.boolean(),
    merchantRef: z.string().min(1).optional()
  })
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
  mode: "time_based",
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
  enabledTabs: Array<z.output<z.ZodEnum<["home", "menu", "orders", "account"]>>>;
  featureFlags: z.output<typeof appConfigFeatureFlagsSchema>;
  loyaltyEnabled: boolean;
  paymentCapabilities: z.output<typeof appConfigPaymentCapabilitiesSchema>;
  fulfillment: z.output<typeof appConfigFulfillmentSchema>;
  storeCapabilities?: z.output<typeof appConfigStoreCapabilitiesSchema>;
}) {
  const storeCapabilities = resolveAppConfigStoreCapabilities(input);

  return {
    ...input,
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
  hours: z.string().min(1),
  pickupInstructions: z.string().min(1),
  capabilities: appConfigStoreCapabilitiesSchema.optional()
});

export const internalLocationParamsSchema = z.object({
  locationId: z.string().trim().min(1)
});

export const internalLocationBootstrapSchema = z.object({
  brandId: z.string().trim().min(1),
  brandName: z.string().trim().min(1),
  locationId: z.string().trim().min(1),
  locationName: z.string().trim().min(1),
  marketLabel: z.string().trim().min(1),
  storeName: z.string().trim().min(1).optional(),
  hours: z.string().trim().min(1).optional(),
  pickupInstructions: z.string().trim().min(1).optional(),
  capabilities: appConfigStoreCapabilitiesSchema.optional()
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
  capabilities: appConfigStoreCapabilitiesSchema,
  action: z.enum(["created", "updated"]).optional()
});

export const internalLocationListResponseSchema = z.object({
  locations: z.array(internalLocationSummarySchema)
});

export type MenuItemCustomizationOption = z.output<typeof menuItemCustomizationOptionSchema>;
export type MenuItemCustomizationGroup = z.output<typeof menuItemCustomizationGroupSchema>;
export type MenuItemCustomizationSelection = z.output<typeof menuItemCustomizationSelectionSchema>;
export type MenuItemCustomizationInput = z.output<typeof menuItemCustomizationInputSchema>;
export type MenuItem = z.output<typeof menuItemSchema>;
export type MenuCategory = z.output<typeof menuCategorySchema>;
export type MenuResponse = z.output<typeof menuResponseSchema>;
export type StoreConfigResponse = z.output<typeof storeConfigResponseSchema>;
export type AdminMenuItem = z.output<typeof adminMenuItemSchema>;
export type AdminMenuCategory = z.output<typeof adminMenuCategorySchema>;
export type AdminMenuResponse = z.output<typeof adminMenuResponseSchema>;
export type AdminStoreConfig = z.output<typeof adminStoreConfigSchema>;
export type AdminMenuItemCreate = z.output<typeof adminMenuItemCreateSchema>;
export type AdminMenuItemVisibilityUpdate = z.output<typeof adminMenuItemVisibilityUpdateSchema>;
export type AppConfigTheme = z.output<typeof appConfigThemeSchema>;
export type AppConfigBrand = z.output<typeof appConfigBrandSchema>;
export type AppConfigFeatureFlags = z.output<typeof appConfigFeatureFlagsSchema>;
export type AppConfigPaymentCapabilities = z.output<typeof appConfigPaymentCapabilitiesSchema>;
export type AppConfigFulfillmentMode = z.output<typeof appConfigFulfillmentModeSchema>;
export type AppConfigFulfillmentSchedule = z.output<typeof appConfigFulfillmentScheduleSchema>;
export type AppConfigFulfillment = z.output<typeof appConfigFulfillmentSchema>;
export type AppConfigMenuSource = z.output<typeof appConfigMenuSourceSchema>;
export type AppConfigStoreCapabilities = z.output<typeof appConfigStoreCapabilitiesSchema>;
export type AppConfig = z.output<typeof appConfigSchema>;
export type InternalLocationBootstrap = z.output<typeof internalLocationBootstrapSchema>;
export type InternalLocationSummary = z.output<typeof internalLocationSummarySchema>;
export type InternalLocationListResponse = z.output<typeof internalLocationListResponseSchema>;

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
