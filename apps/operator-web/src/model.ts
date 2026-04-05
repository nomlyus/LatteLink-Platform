import { z } from "zod";
import {
  operatorCapabilitySchema,
  operatorRoleSchema,
  operatorUserCreateSchema,
  operatorUserSchema,
  operatorUserUpdateSchema
} from "@gazelle/contracts-auth";
import {
  adminMenuCategorySchema,
  adminMenuItemSchema,
  adminMenuItemCreateSchema,
  adminMenuItemUpdateSchema,
  adminStoreConfigUpdateSchema,
  appConfigSchema,
  homeNewsCardSchema,
  isLoyaltyVisible,
  isOrderTrackingEnabled,
  isPlatformManagedMenu,
  menuItemCustomizationGroupSchema,
  isStaffDashboardEnabled,
  resolveAppConfigFulfillmentMode,
  type AppConfig
} from "@gazelle/contracts-catalog";
import { orderSchema, orderStatusSchema } from "@gazelle/contracts-orders";

const operatorCustomerSchema = z.object({
  name: z.string().min(1).optional(),
  email: z.string().email().optional(),
  phone: z.string().min(1).optional()
});

const operatorOrderSchema = orderSchema.extend({
  customer: operatorCustomerSchema.optional()
});

export type OperatorOrder = z.output<typeof operatorOrderSchema>;
export type OperatorOrderStatus = z.output<typeof orderStatusSchema>;
export type OperatorOrderFilter = "all" | "active" | "completed";
export type DashboardSection = "overview" | "orders" | "menu" | "cards" | "store" | "team";
export type OperatorCapability = z.output<typeof operatorCapabilitySchema>;
export type OperatorUser = z.output<typeof operatorUserSchema>;
export const operatorMenuItemSchema = adminMenuItemSchema.extend({
  customizationGroups: z.array(menuItemCustomizationGroupSchema).default([])
});
export const operatorMenuCategorySchema = adminMenuCategorySchema.extend({
  items: z.array(operatorMenuItemSchema)
});
export const operatorMenuResponseSchema = z.object({
  locationId: z.string().min(1),
  categories: z.array(operatorMenuCategorySchema)
});
export const operatorMenuItemUpdateSchema = adminMenuItemUpdateSchema.extend({
  customizationGroups: z.array(menuItemCustomizationGroupSchema).optional()
});
export const operatorNewsCardSchema = homeNewsCardSchema;
export type OperatorMenuItem = z.output<typeof operatorMenuItemSchema>;
export type OperatorMenuCategory = z.output<typeof operatorMenuCategorySchema>;
export type OperatorMenuResponse = z.output<typeof operatorMenuResponseSchema>;
export type OperatorNewsCard = z.output<typeof operatorNewsCardSchema>;

export type OperatorOrderAction = {
  status: "IN_PREP" | "READY" | "COMPLETED";
  label: string;
  tone: "primary" | "secondary" | "danger";
  note?: string;
};

export type OperatorMenuItemFormInput = {
  name?: string;
  priceCents?: string | number;
  visible?: boolean | string;
  customizationGroups?: unknown;
};

export type OperatorMenuItemCreateFormInput = {
  categoryId?: string;
  name?: string;
  description?: string;
  priceCents?: string | number;
  visible?: boolean | string;
};

export type OperatorStoreConfigFormInput = {
  storeName?: string;
  hours?: string;
  pickupInstructions?: string;
};

export type OperatorUserCreateFormInput = {
  displayName?: string;
  email?: string;
  role?: string;
  password?: string;
};

export type OperatorUserUpdateFormInput = {
  displayName?: string;
  email?: string;
  role?: string;
  active?: boolean | string;
  password?: string;
};

export type OperatorMenuItemUpdate = z.output<typeof operatorMenuItemUpdateSchema>;
export type OperatorMenuItemCreate = z.output<typeof adminMenuItemCreateSchema>;
export type OperatorStoreConfigUpdate = z.output<typeof adminStoreConfigUpdateSchema>;
export type OperatorAppConfig = AppConfig;

function normalizeText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeOptionalText(value: unknown) {
  const next = normalizeText(value);
  return next.length > 0 ? next : undefined;
}

function normalizeCents(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.max(0, Math.trunc(value));
  }

  if (typeof value === "string") {
    const parsed = Number(value.trim());
    if (Number.isFinite(parsed)) {
      return Math.max(0, Math.trunc(parsed));
    }
  }

  return 0;
}

function normalizeBoolean(value: unknown) {
  if (typeof value === "boolean") {
    return value;
  }

  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (normalized === "true" || normalized === "1" || normalized === "yes" || normalized === "on") {
      return true;
    }
    if (normalized === "false" || normalized === "0" || normalized === "no" || normalized === "off") {
      return false;
    }
  }

  return Boolean(value);
}

function toRecord(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function isTerminalOrderStatus(status: OperatorOrderStatus) {
  return status === "COMPLETED" || status === "CANCELED";
}

export function formatOrderStatus(status: OperatorOrderStatus) {
  return status.replaceAll("_", " ");
}

export function getOperatorRoleLabel(role: z.output<typeof operatorRoleSchema>) {
  switch (role) {
    case "owner":
      return "Store owner";
    case "manager":
      return "Manager";
    case "staff":
    default:
      return "Staff";
  }
}

export function canAccessCapability(
  operator: Pick<OperatorUser, "capabilities"> | null | undefined,
  capability: OperatorCapability
) {
  return operator?.capabilities.includes(capability) ?? false;
}

export function getAvailableSections(
  operator: Pick<OperatorUser, "capabilities"> | null | undefined,
  appConfig: Pick<AppConfig, "featureFlags" | "storeCapabilities" | "loyaltyEnabled" | "fulfillment"> | null | undefined
) {
  const sections: DashboardSection[] = ["overview"];

  if (
    canAccessCapability(operator, "orders:read") &&
    isStaffDashboardEnabled(appConfig) &&
    isOrderTrackingEnabled(appConfig)
  ) {
    sections.push("orders");
  }
  if (canAccessCapability(operator, "menu:read") && isPlatformManagedMenu(appConfig)) {
    sections.push("menu");
  }
  if (canAccessCapability(operator, "menu:read")) {
    sections.push("cards");
  }
  if (canAccessCapability(operator, "store:read")) {
    sections.push("store");
  }
  if (canAccessCapability(operator, "staff:read")) {
    sections.push("team");
  }

  return sections;
}

export function canManageOrderStatus(
  config: Pick<AppConfig, "storeCapabilities" | "featureFlags" | "loyaltyEnabled" | "fulfillment"> | null | undefined
) {
  return isStaffDashboardEnabled(config) && isOrderTrackingEnabled(config) && resolveAppConfigFulfillmentMode(config) === "staff";
}

export function canAdvanceOrderStatus(
  operator: Pick<OperatorUser, "capabilities"> | null | undefined,
  config: Pick<AppConfig, "storeCapabilities" | "featureFlags" | "loyaltyEnabled" | "fulfillment"> | null | undefined
) {
  return canAccessCapability(operator, "orders:write") && canManageOrderStatus(config);
}

export function canCancelOrder(
  operator: Pick<OperatorUser, "capabilities"> | null | undefined,
  config: Pick<AppConfig, "storeCapabilities" | "featureFlags" | "loyaltyEnabled" | "fulfillment"> | null | undefined,
  order: Pick<OperatorOrder, "status"> | null | undefined
) {
  if (!order || isTerminalOrderStatus(order.status)) {
    return false;
  }

  if (!canAccessCapability(operator, "orders:write")) {
    return false;
  }

  return order.status === "PENDING_PAYMENT" || canManageOrderStatus(config);
}

export function getOrderControlUnavailableMessage(
  operator: Pick<OperatorUser, "capabilities"> | null | undefined,
  config: Pick<AppConfig, "storeCapabilities" | "featureFlags" | "loyaltyEnabled" | "fulfillment"> | null | undefined
) {
  if (!isStaffDashboardEnabled(config) || !isOrderTrackingEnabled(config)) {
    return "Live order tracking is disabled for this store.";
  }

  if (!canAccessCapability(operator, "orders:write")) {
    return "You have read-only access to live orders for this store.";
  }

  if (resolveAppConfigFulfillmentMode(config) !== "staff") {
    return "Time-based fulfillment is active, so manual order controls are disabled.";
  }

  return null;
}

export function getOrderCancelUnavailableMessage(
  operator: Pick<OperatorUser, "capabilities"> | null | undefined,
  config: Pick<AppConfig, "storeCapabilities" | "featureFlags" | "loyaltyEnabled" | "fulfillment"> | null | undefined,
  order: Pick<OperatorOrder, "status"> | null | undefined
) {
  if (!order || isTerminalOrderStatus(order.status)) {
    return null;
  }

  if (!canAccessCapability(operator, "orders:write")) {
    return "You have read-only access to live orders for this store.";
  }

  if (order.status === "PENDING_PAYMENT") {
    return null;
  }

  return getOrderControlUnavailableMessage(operator, config);
}

export function canCreateMenuItems(
  operator: Pick<OperatorUser, "capabilities"> | null | undefined,
  config: Pick<AppConfig, "storeCapabilities" | "featureFlags" | "loyaltyEnabled" | "fulfillment"> | null | undefined
) {
  return isPlatformManagedMenu(config) && canAccessCapability(operator, "menu:write");
}

export function canToggleMenuItemVisibility(
  operator: Pick<OperatorUser, "capabilities"> | null | undefined,
  config: Pick<AppConfig, "storeCapabilities" | "featureFlags" | "loyaltyEnabled" | "fulfillment"> | null | undefined
) {
  return isPlatformManagedMenu(config) && canAccessCapability(operator, "menu:visibility");
}

export function canUpdateStoreSettings(operator: Pick<OperatorUser, "capabilities"> | null | undefined) {
  return canAccessCapability(operator, "store:write");
}

export function canManageTeamMembers(operator: Pick<OperatorUser, "capabilities"> | null | undefined) {
  return canAccessCapability(operator, "staff:write");
}

export function getOrderActions(
  order: OperatorOrder,
  fulfillmentMode: AppConfig["fulfillment"]["mode"] = "staff"
): OperatorOrderAction[] {
  if (fulfillmentMode !== "staff") {
    return [];
  }

  switch (order.status) {
    case "PENDING_PAYMENT":
      return [];
    case "PAID":
      return [
        {
          status: "IN_PREP",
          label: "Start prep",
          tone: "primary",
          note: "Kitchen has started work on the order."
        }
      ];
    case "IN_PREP":
      return [
        {
          status: "READY",
          label: "Mark ready",
          tone: "primary",
          note: "Order is ready at the pickup counter."
        }
      ];
    case "READY":
      return [
        {
          status: "COMPLETED",
          label: "Complete",
          tone: "primary",
          note: "Order was handed off to the customer."
        }
      ];
    case "COMPLETED":
    case "CANCELED":
      return [];
    default:
      return [];
  }
}

export function isActiveOrder(order: OperatorOrder) {
  return !isTerminalOrderStatus(order.status);
}

export function filterActiveOrders(orders: readonly OperatorOrder[]) {
  return orders.filter(isActiveOrder);
}

export function filterOrdersByView(orders: readonly OperatorOrder[], filter: OperatorOrderFilter) {
  switch (filter) {
    case "active":
      return filterActiveOrders(orders);
    case "completed":
      return orders.filter((order) => !isActiveOrder(order));
    case "all":
    default:
      return [...orders];
  }
}

export function getOrderCustomerLabel(order: OperatorOrder) {
  const parts = [order.customer?.name, order.customer?.email, order.customer?.phone].filter(
    (part): part is string => Boolean(part)
  );

  return parts.length > 0 ? parts.join(" · ") : "Customer details unavailable";
}

export function getAppConfigCapabilityLabels(config: AppConfig) {
  const labels: string[] = [];

  if (config.paymentCapabilities.applePay) {
    labels.push("Apple Pay");
  }
  if (config.paymentCapabilities.card) {
    labels.push("Card");
  }
  if (config.paymentCapabilities.cash) {
    labels.push("Cash");
  }
  if (config.paymentCapabilities.refunds) {
    labels.push("Refunds");
  }
  if (config.paymentCapabilities.clover.enabled) {
    labels.push("Clover");
  }
  if (isLoyaltyVisible(config)) {
    labels.push("Loyalty");
  }

  labels.push(resolveAppConfigFulfillmentMode(config) === "staff" ? "Staff fulfillment" : "Time-based fulfillment");
  labels.push(isPlatformManagedMenu(config) ? "Platform-managed menu" : "External menu sync");

  if (isOrderTrackingEnabled(config)) {
    labels.push("Order tracking");
  }
  if (config.featureFlags.pushNotifications) {
    labels.push("Push notifications");
  }
  if (isStaffDashboardEnabled(config)) {
    labels.push("Staff dashboard");
  }
  if (isPlatformManagedMenu(config)) {
    labels.push("Menu editing");
  }
  if (isLoyaltyVisible(config)) {
    labels.push("Loyalty features");
  }
  if (config.featureFlags.refunds) {
    labels.push("Refunds");
  }

  for (const tab of config.enabledTabs) {
    labels.push(`${tab} tab`);
  }

  return Array.from(new Set(labels));
}

export function normalizeMenuItemForm(input: OperatorMenuItemFormInput | unknown): OperatorMenuItemUpdate {
  const value = toRecord(input);
  const customizationGroups =
    value.customizationGroups === undefined ? undefined : z.array(menuItemCustomizationGroupSchema).parse(value.customizationGroups);

  return operatorMenuItemUpdateSchema.parse({
    name: normalizeText(value.name),
    priceCents: normalizeCents(value.priceCents),
    visible: normalizeBoolean(value.visible),
    ...(customizationGroups === undefined ? {} : { customizationGroups })
  });
}

export function normalizeMenuItemCreateForm(input: OperatorMenuItemCreateFormInput | unknown): OperatorMenuItemCreate {
  const value = toRecord(input);

  return adminMenuItemCreateSchema.parse({
    categoryId: normalizeText(value.categoryId),
    name: normalizeText(value.name),
    description: normalizeOptionalText(value.description),
    priceCents: normalizeCents(value.priceCents),
    visible: normalizeBoolean(value.visible)
  });
}

export function normalizeStoreConfigForm(
  input: OperatorStoreConfigFormInput | unknown
): OperatorStoreConfigUpdate {
  const value = toRecord(input);

  return adminStoreConfigUpdateSchema.parse({
    storeName: normalizeText(value.storeName),
    hours: normalizeText(value.hours),
    pickupInstructions: normalizeText(value.pickupInstructions)
  });
}

export function normalizeOperatorUserCreateForm(input: OperatorUserCreateFormInput | unknown) {
  const value = toRecord(input);

  return operatorUserCreateSchema.parse({
    displayName: normalizeText(value.displayName),
    email: normalizeText(value.email),
    role: normalizeText(value.role),
    password: normalizeText(value.password)
  });
}

export function normalizeOperatorUserUpdateForm(input: OperatorUserUpdateFormInput | unknown) {
  const value = toRecord(input);

  return operatorUserUpdateSchema.parse({
    ...(normalizeOptionalText(value.displayName) ? { displayName: normalizeOptionalText(value.displayName) } : {}),
    ...(normalizeOptionalText(value.email) ? { email: normalizeOptionalText(value.email) } : {}),
    ...(normalizeOptionalText(value.role) ? { role: normalizeOptionalText(value.role) } : {}),
    ...(normalizeOptionalText(value.password) ? { password: normalizeOptionalText(value.password) } : {}),
    ...(value.active !== undefined ? { active: normalizeBoolean(value.active) } : {})
  });
}

export function resolveAppConfig(input: unknown): AppConfig {
  return appConfigSchema.parse(input);
}

export function resolveOrder(input: unknown): OperatorOrder {
  return operatorOrderSchema.parse(input);
}

export function countVisibleMenuItems(categories: readonly OperatorMenuCategory[]) {
  return categories.reduce((count, category) => count + category.items.filter((item) => item.visible).length, 0);
}

export function countHiddenMenuItems(categories: readonly OperatorMenuCategory[]) {
  return categories.reduce((count, category) => count + category.items.filter((item) => !item.visible).length, 0);
}

export function sessionNeedsRefresh(expiresAt: string, bufferMs = 60_000) {
  return Date.parse(expiresAt) - Date.now() <= bufferMs;
}
