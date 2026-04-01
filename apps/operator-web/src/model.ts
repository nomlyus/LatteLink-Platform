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
  adminMenuItemCreateSchema,
  adminMenuItemUpdateSchema,
  adminStoreConfigUpdateSchema,
  appConfigSchema,
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
export type DashboardSection = "overview" | "orders" | "menu" | "store" | "team";
export type OperatorCapability = z.output<typeof operatorCapabilitySchema>;
export type OperatorUser = z.output<typeof operatorUserSchema>;
export type OperatorMenuCategory = z.output<typeof adminMenuCategorySchema>;

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
};

export type OperatorUserUpdateFormInput = {
  displayName?: string;
  email?: string;
  role?: string;
  active?: boolean | string;
};

export type OperatorMenuItemUpdate = z.output<typeof adminMenuItemUpdateSchema>;
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
  appConfig: Pick<AppConfig, "featureFlags"> | null | undefined
) {
  const sections: DashboardSection[] = ["overview"];

  if (canAccessCapability(operator, "orders:read") && appConfig?.featureFlags.orderTracking !== false) {
    sections.push("orders");
  }
  if (canAccessCapability(operator, "menu:read")) {
    sections.push("menu");
  }
  if (canAccessCapability(operator, "store:read")) {
    sections.push("store");
  }
  if (canAccessCapability(operator, "staff:read")) {
    sections.push("team");
  }

  return sections;
}

export function canManageOrderStatus(config: Pick<AppConfig, "fulfillment"> | null | undefined) {
  return config?.fulfillment.mode === "staff";
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
  if (config.loyaltyEnabled) {
    labels.push("Loyalty");
  }

  labels.push(config.fulfillment.mode === "staff" ? "Staff fulfillment" : "Time-based fulfillment");

  const featureLabels: Array<[keyof AppConfig["featureFlags"], string]> = [
    ["orderTracking", "Order tracking"],
    ["pushNotifications", "Push notifications"],
    ["staffDashboard", "Staff dashboard"],
    ["menuEditing", "Menu editing"],
    ["loyalty", "Loyalty features"],
    ["refunds", "Refunds"]
  ];
  for (const [key, label] of featureLabels) {
    if (config.featureFlags[key]) {
      labels.push(label);
    }
  }

  for (const tab of config.enabledTabs) {
    labels.push(`${tab} tab`);
  }

  return Array.from(new Set(labels));
}

export function normalizeMenuItemForm(input: OperatorMenuItemFormInput | unknown): OperatorMenuItemUpdate {
  const value = toRecord(input);

  return adminMenuItemUpdateSchema.parse({
    name: normalizeText(value.name),
    priceCents: normalizeCents(value.priceCents),
    visible: normalizeBoolean(value.visible)
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
    role: normalizeText(value.role)
  });
}

export function normalizeOperatorUserUpdateForm(input: OperatorUserUpdateFormInput | unknown) {
  const value = toRecord(input);

  return operatorUserUpdateSchema.parse({
    ...(normalizeOptionalText(value.displayName) ? { displayName: normalizeOptionalText(value.displayName) } : {}),
    ...(normalizeOptionalText(value.email) ? { email: normalizeOptionalText(value.email) } : {}),
    ...(normalizeOptionalText(value.role) ? { role: normalizeOptionalText(value.role) } : {}),
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
