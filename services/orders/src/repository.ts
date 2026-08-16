import { randomUUID } from "node:crypto";
import type { FastifyBaseLogger } from "fastify";
import { normalizeCustomizationGroups, type MenuItemCustomizationGroup } from "@lattelink/contracts-catalog";
import {
  checkoutDraftSchema,
  discountCodeRedemptionSchema,
  discountCodeSchema,
  orderCustomerSchema,
  orderQuoteSchema,
  orderSchema
} from "@lattelink/contracts-orders";
import {
  allowsInMemoryPersistence,
  buildPersistenceStartupError,
  createPostgresDb,
  getDatabaseUrl,
  runMigrations,
  sql,
  writeAuditLog,
  type AuditLogEntry
} from "@lattelink/persistence";
import { z } from "zod";

type OrderQuote = z.output<typeof orderQuoteSchema>;
type Order = z.output<typeof orderSchema>;
type OrderCustomer = z.output<typeof orderCustomerSchema>;
export type CheckoutDraft = z.output<typeof checkoutDraftSchema> & { userId: string };
export type DiscountCode = z.output<typeof discountCodeSchema>;
export type DiscountCodeRedemption = z.output<typeof discountCodeRedemptionSchema>;

export type CreateDiscountCodeInput = {
  locationId: string;
  code: string;
  name: string;
  type: "percent" | "fixed_cents";
  value: number;
  maxDiscountCents?: number;
  minSubtotalCents: number;
  eligibility: "everyone" | "first_order_only" | "existing_customers_only";
  oncePerCustomer: boolean;
  maxTotalRedemptions?: number;
  active: boolean;
  startsAt?: string;
  expiresAt?: string;
};

export type UpdateDiscountCodeInput = Partial<
  Omit<CreateDiscountCodeInput, "locationId" | "code" | "maxDiscountCents" | "maxTotalRedemptions" | "startsAt" | "expiresAt">
> & {
  discountCodeId: string;
  locationId: string;
  maxDiscountCents?: number | null;
  maxTotalRedemptions?: number | null;
  startsAt?: string | null;
  expiresAt?: string | null;
};

export type DiscountUsage = {
  reserved: number;
  redeemed: number;
};

export type ReserveDiscountInput = {
  discountCodeId: string;
  locationId: string;
  code: string;
  orderId: string;
  userId: string;
  discountCents: number;
};

type StoredOrderRecord = {
  order: Order;
  quoteId: string;
  userId: string;
  paymentId?: string;
  successfulCharge?: unknown;
  successfulRefund?: unknown;
};

type PersistedCheckoutDraftRow = {
  checkout_id: string;
  user_id: string;
  quote_id: string;
  quote_hash: string;
  status: "OPEN" | "CONVERTED" | "EXPIRED";
  order_id: string | null;
  expires_at: string | Date;
};

function toCheckoutDraft(row: PersistedCheckoutDraftRow, quote: OrderQuote): CheckoutDraft {
  return {
    ...checkoutDraftSchema.parse({
      checkoutId: row.checkout_id,
      quoteId: row.quote_id,
      quoteHash: row.quote_hash,
      locationId: quote.locationId,
      status: row.status,
      items: quote.items,
      total: quote.total,
      expiresAt: new Date(row.expires_at).toISOString(),
      orderId: row.order_id ?? undefined
    }),
    userId: row.user_id
  };
}

type PersistedOrderRow = {
  order_id: string;
  user_id: string;
  quote_id: string;
  order_json: unknown;
  payment_id: string | null;
  successful_charge_json: unknown;
  successful_refund_json: unknown;
  created_at?: string | Date;
  updated_at?: string | Date;
};

type PersistedQuoteRow = {
  quote_id: string;
  quote_hash: string;
  quote_json: unknown;
};

export type SupportAuditLogEntry = {
  logId: string;
  locationId: string;
  actorId: string;
  actorType: string;
  action: string;
  targetId?: string;
  targetType?: string;
  payload?: unknown;
  occurredAt: string;
};

export type SupportOrderLookupResult = {
  order: Order;
  customer?: OrderCustomer;
  userId?: string;
  paymentId?: string;
  paymentStatus?: string;
  paymentProvider?: string;
  paymentIntentId?: string;
  successfulCharge?: unknown;
  successfulRefund?: unknown;
  createdAt?: string;
  updatedAt?: string;
  auditLog: SupportAuditLogEntry[];
};

export type SupportCheckoutLookupResult = {
  checkout: CheckoutDraft;
  userId: string;
  paymentStatus?: string;
  paymentProvider?: string;
  paymentIntentId?: string;
  createdAt?: string;
  updatedAt?: string;
  auditLog: SupportAuditLogEntry[];
};

const defaultTaxRateBasisPoints = 600;

function trimToUndefined(value: string | null | undefined) {
  const next = value?.trim();
  return next && next.length > 0 ? next : undefined;
}

function normalizeSearchText(value: string | null | undefined) {
  return value?.trim().toLowerCase() ?? "";
}

function normalizePhoneDigits(value: string | null | undefined) {
  return value?.replace(/\D/g, "") ?? "";
}

function textMatchesSupportQuery(value: string | null | undefined, query: string) {
  return normalizeSearchText(value).includes(query);
}

function phoneMatchesSupportQuery(value: string | null | undefined, queryDigits: string) {
  return queryDigits.length >= 4 && normalizePhoneDigits(value).includes(queryDigits);
}

function parseIsoDate(value: unknown) {
  if (value instanceof Date) {
    return value.toISOString();
  }

  return new Date(String(value)).toISOString();
}

function optionalIsoDate(value: string | Date | null | undefined) {
  return value ? parseIsoDate(value) : undefined;
}

function toDiscountCode(input: {
  discount_code_id: string;
  location_id: string;
  code: string;
  name: string;
  type: "percent" | "fixed_cents";
  value: number;
  max_discount_cents: number | null;
  min_subtotal_cents: number;
  eligibility: "everyone" | "first_order_only" | "existing_customers_only";
  once_per_customer: boolean;
  max_total_redemptions: number | null;
  active: boolean;
  starts_at: string | Date | null;
  expires_at: string | Date | null;
  created_at: string | Date;
  updated_at: string | Date;
  redeemed_count?: number | string | bigint | null;
  reserved_count?: number | string | bigint | null;
}): DiscountCode {
  return discountCodeSchema.parse({
    discountCodeId: input.discount_code_id,
    locationId: input.location_id,
    code: input.code,
    name: input.name,
    type: input.type,
    value: input.value,
    maxDiscountCents: input.max_discount_cents ?? undefined,
    minSubtotalCents: input.min_subtotal_cents,
    eligibility: input.eligibility,
    oncePerCustomer: input.once_per_customer,
    maxTotalRedemptions: input.max_total_redemptions ?? undefined,
    active: input.active,
    startsAt: optionalIsoDate(input.starts_at),
    expiresAt: optionalIsoDate(input.expires_at),
    redeemedCount: Number(input.redeemed_count ?? 0),
    reservedCount: Number(input.reserved_count ?? 0),
    createdAt: parseIsoDate(input.created_at),
    updatedAt: parseIsoDate(input.updated_at)
  });
}

function toDiscountCodeRedemption(input: {
  redemption_id: string;
  discount_code_id: string;
  location_id: string;
  code: string;
  order_id: string;
  user_id: string;
  discount_cents: number;
  status: "RESERVED" | "REDEEMED" | "RELEASED";
  reserved_at: string | Date;
  redeemed_at: string | Date | null;
  released_at: string | Date | null;
}): DiscountCodeRedemption {
  return discountCodeRedemptionSchema.parse({
    redemptionId: input.redemption_id,
    discountCodeId: input.discount_code_id,
    locationId: input.location_id,
    code: input.code,
    orderId: input.order_id,
    userId: input.user_id,
    discountCents: input.discount_cents,
    status: input.status,
    reservedAt: parseIsoDate(input.reserved_at),
    redeemedAt: optionalIsoDate(input.redeemed_at),
    releasedAt: optionalIsoDate(input.released_at)
  });
}

export type QuoteCatalogItem = {
  itemId: string;
  itemName: string;
  basePriceCents: number;
  customizationGroups: MenuItemCustomizationGroup[];
};

export type OrdersRepository = {
  backend: "memory" | "postgres";
  saveQuote(quote: OrderQuote): Promise<void>;
  getQuote(quoteId: string): Promise<OrderQuote | undefined>;
  createCheckoutDraft(input: CheckoutDraft): Promise<CheckoutDraft>;
  getCheckoutDraft(checkoutId: string): Promise<CheckoutDraft | undefined>;
  getCheckoutDraftForQuote(input: { quoteId: string; quoteHash: string; userId: string }): Promise<CheckoutDraft | undefined>;
  listOpenCheckoutDraftsByUser(userId: string): Promise<CheckoutDraft[]>;
  expireCheckoutDraft(checkoutId: string): Promise<void>;
  promoteCheckoutDraft(input: { checkoutId: string; order: Order; quoteId: string; userId: string }): Promise<{ order: Order; created: boolean }>;
  createOrder(input: { order: Order; quoteId: string; userId: string }): Promise<void>;
  getOrder(orderId: string): Promise<Order | undefined>;
  listOrders(): Promise<Order[]>;
  listOrdersByUser(userId: string): Promise<Order[]>;
  listOrdersByLocation(locationId: string): Promise<Order[]>;
  getOrderForCreateIdempotency(quoteId: string, quoteHash: string): Promise<Order | undefined>;
  saveCreateOrderIdempotency(quoteId: string, quoteHash: string, orderId: string): Promise<void>;
  getPaymentOrderByIdempotency(orderId: string, idempotencyKey: string): Promise<Order | undefined>;
  savePaymentIdempotency(orderId: string, idempotencyKey: string): Promise<void>;
  getOrderQuote(orderId: string): Promise<OrderQuote | undefined>;
  getOrderUserId(orderId: string): Promise<string | undefined>;
  getOrderCustomer(orderId: string): Promise<OrderCustomer | undefined>;
  listOrderCustomers(orderIds: readonly string[]): Promise<Map<string, OrderCustomer>>;
  setOrderUserId(orderId: string, userId: string): Promise<void>;
  setPaymentId(orderId: string, paymentId: string): Promise<void>;
  getPaymentId(orderId: string): Promise<string | undefined>;
  setSuccessfulCharge(orderId: string, payload: unknown): Promise<void>;
  getSuccessfulCharge(orderId: string): Promise<unknown | undefined>;
  setSuccessfulRefund(orderId: string, payload: unknown): Promise<void>;
  getSuccessfulRefund(orderId: string): Promise<unknown | undefined>;
  updateOrder(orderId: string, order: Order): Promise<Order>;
  writeAuditLog(entry: AuditLogEntry): Promise<void>;
  lookupSupportOrders(input: { query: string; locationId?: string; limit?: number }): Promise<SupportOrderLookupResult[]>;
  lookupSupportCheckoutDrafts(input: { query: string; locationId?: string; limit?: number }): Promise<SupportCheckoutLookupResult[]>;
  listDiscountCodes(locationId: string): Promise<DiscountCode[]>;
  getDiscountCode(locationId: string, code: string): Promise<DiscountCode | undefined>;
  getDiscountCodeById(locationId: string, discountCodeId: string): Promise<DiscountCode | undefined>;
  createDiscountCode(input: CreateDiscountCodeInput): Promise<DiscountCode>;
  updateDiscountCode(input: UpdateDiscountCodeInput): Promise<DiscountCode | undefined>;
  getDiscountUsage(discountCodeId: string): Promise<DiscountUsage>;
  getCustomerDiscountUsage(discountCodeId: string, userId: string): Promise<DiscountUsage>;
  getCustomerPaidOrderCount(locationId: string, userId: string): Promise<number>;
  reserveDiscountForOrder(input: ReserveDiscountInput): Promise<boolean>;
  redeemDiscountForOrder(orderId: string): Promise<void>;
  releaseDiscountForOrder(orderId: string): Promise<void>;
  getOrderDiscountRedemption(orderId: string): Promise<DiscountCodeRedemption | undefined>;
  listDiscountRedemptions(input: { locationId: string; discountCodeId: string; limit?: number }): Promise<DiscountCodeRedemption[]>;
  getCatalogItemsForQuote(locationId: string, itemIds: string[]): Promise<Map<string, QuoteCatalogItem>>;
  getTaxRateBasisPoints(locationId: string): Promise<number>;
  pingDb(): Promise<void>;
  close(): Promise<void>;
};

function sortOrdersDescendingByCreatedAt(orders: Order[]) {
  return [...orders].sort((left, right) => {
    const leftCreatedAt = Date.parse(left.timeline[0]?.occurredAt ?? "1970-01-01T00:00:00.000Z");
    const rightCreatedAt = Date.parse(right.timeline[0]?.occurredAt ?? "1970-01-01T00:00:00.000Z");
    return rightCreatedAt - leftCreatedAt;
  });
}

function toSupportAuditLogEntry(row: {
  log_id: string;
  location_id: string;
  actor_id: string;
  actor_type: string;
  action: string;
  target_id: string | null;
  target_type: string | null;
  payload: unknown;
  occurred_at: string | Date;
}): SupportAuditLogEntry {
  return {
    logId: row.log_id,
    locationId: row.location_id,
    actorId: row.actor_id,
    actorType: row.actor_type,
    action: row.action,
    targetId: trimToUndefined(row.target_id),
    targetType: trimToUndefined(row.target_type),
    payload: row.payload ?? undefined,
    occurredAt: parseIsoDate(row.occurred_at)
  };
}

const fallbackCatalogItems = new Map<string, QuoteCatalogItem>([
  [
    "latte",
    {
      itemId: "latte",
      itemName: "Honey Oat Latte",
      basePriceCents: 675,
      customizationGroups: normalizeCustomizationGroups([
        {
          id: "size",
          sourceGroupId: "core:size",
          label: "Size",
          selectionType: "single",
          required: true,
          minSelections: 1,
          maxSelections: 1,
          sortOrder: 0,
          options: [
            { id: "regular", label: "Regular", priceDeltaCents: 0, default: true, sortOrder: 0, available: true },
            { id: "large", label: "Large", priceDeltaCents: 100, sortOrder: 1, available: true }
          ]
        },
        {
          id: "milk",
          sourceGroupId: "core:milk",
          label: "Milk",
          selectionType: "single",
          required: true,
          minSelections: 1,
          maxSelections: 1,
          sortOrder: 1,
          options: [
            { id: "whole", label: "Whole milk", priceDeltaCents: 0, default: true, sortOrder: 0, available: true },
            { id: "oat", label: "Oat milk", priceDeltaCents: 75, sortOrder: 1, available: true }
          ]
        },
        {
          id: "extras",
          label: "Extras",
          selectionType: "multiple",
          required: false,
          minSelections: 0,
          maxSelections: 2,
          sortOrder: 2,
          options: [{ id: "extra-shot", label: "Extra shot", priceDeltaCents: 125, sortOrder: 0, available: true }]
        }
      ])
    }
  ],
  [
    "matcha",
    {
      itemId: "matcha",
      itemName: "Ceremonial Matcha",
      basePriceCents: 725,
      customizationGroups: normalizeCustomizationGroups([
        {
          id: "size",
          sourceGroupId: "core:size",
          label: "Size",
          selectionType: "single",
          required: true,
          minSelections: 1,
          maxSelections: 1,
          sortOrder: 0,
          options: [
            { id: "regular", label: "Regular", priceDeltaCents: 0, default: true, sortOrder: 0, available: true },
            { id: "large", label: "Large", priceDeltaCents: 100, sortOrder: 1, available: true }
          ]
        },
        {
          id: "milk",
          sourceGroupId: "core:milk",
          label: "Milk",
          selectionType: "single",
          required: true,
          minSelections: 1,
          maxSelections: 1,
          sortOrder: 1,
          options: [
            { id: "whole", label: "Whole milk", priceDeltaCents: 0, default: true, sortOrder: 0, available: true },
            { id: "oat", label: "Oat milk", priceDeltaCents: 75, sortOrder: 1, available: true }
          ]
        },
        {
          id: "sweetness",
          sourceGroupId: "core:sweetness",
          label: "Sweetness",
          selectionType: "single",
          required: true,
          minSelections: 1,
          maxSelections: 1,
          sortOrder: 2,
          options: [
            { id: "full", label: "Full sweet", priceDeltaCents: 0, default: true, sortOrder: 0, available: true },
            { id: "half", label: "Half sweet", priceDeltaCents: 0, sortOrder: 1, available: true },
            { id: "unsweetened", label: "Unsweetened", priceDeltaCents: 0, sortOrder: 2, available: true }
          ]
        }
      ])
    }
  ],
  [
    "croissant",
    {
      itemId: "croissant",
      itemName: "Butter Croissant",
      basePriceCents: 425,
      customizationGroups: []
    }
  ]
]);

function createInMemoryRepository(): OrdersRepository {
  const quotesById = new Map<string, OrderQuote>();
  const checkoutDraftsById = new Map<string, CheckoutDraft>();
  const ordersById = new Map<string, StoredOrderRecord>();
  const createOrderIdempotency = new Map<string, string>();
  const paymentIdempotency = new Map<string, string>();
  const auditLog: SupportAuditLogEntry[] = [];
  const discountCodesById = new Map<string, DiscountCode>();
  const discountCodeRedemptionsByOrderId = new Map<string, DiscountCodeRedemption>();

  function discountUsage(discountCodeId: string): DiscountUsage {
    const redemptions = [...discountCodeRedemptionsByOrderId.values()].filter(
      (redemption) => redemption.discountCodeId === discountCodeId
    );
    return {
      reserved: redemptions.filter((redemption) => redemption.status === "RESERVED").length,
      redeemed: redemptions.filter((redemption) => redemption.status === "REDEEMED").length
    };
  }

  function attachDiscountUsage(discountCode: DiscountCode): DiscountCode {
    const usage = discountUsage(discountCode.discountCodeId);
    return {
      ...discountCode,
      reservedCount: usage.reserved,
      redeemedCount: usage.redeemed
    };
  }

  return {
    backend: "memory",
    async saveQuote(quote) {
      quotesById.set(quote.quoteId, quote);
    },
    async getQuote(quoteId) {
      return quotesById.get(quoteId);
    },
    async createCheckoutDraft(draft) {
      const existing = [...checkoutDraftsById.values()].find(
        (candidate) =>
          candidate.status === "OPEN" &&
          candidate.quoteId === draft.quoteId &&
          candidate.quoteHash === draft.quoteHash &&
          candidate.userId === draft.userId
      );
      if (existing) {
        return existing;
      }
      checkoutDraftsById.set(draft.checkoutId, draft);
      return draft;
    },
    async getCheckoutDraft(checkoutId) {
      return checkoutDraftsById.get(checkoutId);
    },
    async getCheckoutDraftForQuote({ quoteId, quoteHash, userId }) {
      return [...checkoutDraftsById.values()]
        .filter((draft) => draft.quoteId === quoteId && draft.quoteHash === quoteHash && draft.userId === userId)
        .sort((left, right) => Date.parse(right.expiresAt) - Date.parse(left.expiresAt))[0];
    },
    async listOpenCheckoutDraftsByUser(userId) {
      return [...checkoutDraftsById.values()].filter((draft) => draft.userId === userId && draft.status === "OPEN");
    },
    async expireCheckoutDraft(checkoutId) {
      const draft = checkoutDraftsById.get(checkoutId);
      if (draft?.status === "OPEN") {
        checkoutDraftsById.set(checkoutId, { ...draft, status: "EXPIRED" });
      }
    },
    async promoteCheckoutDraft({ checkoutId, order, quoteId, userId }) {
      const existing = ordersById.get(checkoutId)?.order;
      if (existing) {
        return { order: existing, created: false };
      }
      ordersById.set(checkoutId, { order, quoteId, userId });
      const draft = checkoutDraftsById.get(checkoutId);
      if (draft) {
        checkoutDraftsById.set(checkoutId, { ...draft, status: "CONVERTED", orderId: checkoutId });
      }
      return { order, created: true };
    },
    async createOrder({ order, quoteId, userId }) {
      ordersById.set(order.id, {
        order,
        quoteId,
        userId
      });
    },
    async getOrder(orderId) {
      return ordersById.get(orderId)?.order;
    },
    async listOrders() {
      const orders = [...ordersById.values()].map((entry) => entry.order);
      return sortOrdersDescendingByCreatedAt(orders);
    },
    async listOrdersByUser(userId) {
      const orders = [...ordersById.values()]
        .filter((entry) => entry.userId === userId)
        .map((entry) => entry.order);
      return sortOrdersDescendingByCreatedAt(orders);
    },
    async listOrdersByLocation(locationId) {
      const orders = [...ordersById.values()]
        .filter((entry) => entry.order.locationId === locationId)
        .map((entry) => entry.order);
      return sortOrdersDescendingByCreatedAt(orders);
    },
    async getOrderForCreateIdempotency(quoteId, quoteHash) {
      const orderId = createOrderIdempotency.get(`${quoteId}:${quoteHash}`);
      if (!orderId) {
        return undefined;
      }
      return ordersById.get(orderId)?.order;
    },
    async saveCreateOrderIdempotency(quoteId, quoteHash, orderId) {
      createOrderIdempotency.set(`${quoteId}:${quoteHash}`, orderId);
    },
    async getPaymentOrderByIdempotency(orderId, idempotencyKey) {
      const resolvedOrderId = paymentIdempotency.get(`${orderId}:${idempotencyKey}`);
      if (!resolvedOrderId) {
        return undefined;
      }
      return ordersById.get(resolvedOrderId)?.order;
    },
    async savePaymentIdempotency(orderId, idempotencyKey) {
      paymentIdempotency.set(`${orderId}:${idempotencyKey}`, orderId);
    },
    async getOrderQuote(orderId) {
      const record = ordersById.get(orderId);
      if (!record) {
        return undefined;
      }
      return quotesById.get(record.quoteId);
    },
    async getOrderUserId(orderId) {
      return ordersById.get(orderId)?.userId;
    },
    async getOrderCustomer() {
      return undefined;
    },
    async listOrderCustomers() {
      return new Map();
    },
    async setOrderUserId(orderId, userId) {
      const record = ordersById.get(orderId);
      if (!record) {
        return;
      }
      ordersById.set(orderId, {
        ...record,
        userId
      });
    },
    async setPaymentId(orderId, paymentId) {
      const record = ordersById.get(orderId);
      if (!record) {
        return;
      }
      ordersById.set(orderId, {
        ...record,
        paymentId
      });
    },
    async getPaymentId(orderId) {
      return ordersById.get(orderId)?.paymentId;
    },
    async setSuccessfulCharge(orderId, payload) {
      const record = ordersById.get(orderId);
      if (!record) {
        return;
      }
      ordersById.set(orderId, {
        ...record,
        successfulCharge: payload
      });
    },
    async getSuccessfulCharge(orderId) {
      return ordersById.get(orderId)?.successfulCharge;
    },
    async setSuccessfulRefund(orderId, payload) {
      const record = ordersById.get(orderId);
      if (!record) {
        return;
      }
      ordersById.set(orderId, {
        ...record,
        successfulRefund: payload
      });
    },
    async getSuccessfulRefund(orderId) {
      return ordersById.get(orderId)?.successfulRefund;
    },
    async updateOrder(orderId, order) {
      const record = ordersById.get(orderId);
      if (!record) {
        throw new Error("order not found while updating");
      }
      ordersById.set(orderId, {
        ...record,
        order
      });
      return order;
    },
    async writeAuditLog(entry) {
      auditLog.unshift({
        logId: randomUUID(),
        locationId: entry.locationId,
        actorId: entry.actorId,
        actorType: entry.actorType,
        action: entry.action,
        targetId: entry.targetId,
        targetType: entry.targetType,
        payload: entry.payload,
        occurredAt: entry.occurredAt ?? new Date().toISOString()
      });
    },
    async lookupSupportOrders(input) {
      const query = input.query.trim().toLowerCase();
      const queryDigits = normalizePhoneDigits(query);
      const matches = [...ordersById.values()]
        .filter((record) => {
          if (input.locationId && record.order.locationId !== input.locationId) {
            return false;
          }

          const customer = record.order.customer;
          return (
            textMatchesSupportQuery(record.order.id, query) ||
            textMatchesSupportQuery(record.order.pickupCode, query) ||
            textMatchesSupportQuery(record.userId, query) ||
            textMatchesSupportQuery(record.paymentId, query) ||
            textMatchesSupportQuery(customer?.name, query) ||
            textMatchesSupportQuery(customer?.email, query) ||
            textMatchesSupportQuery(customer?.phone, query) ||
            phoneMatchesSupportQuery(customer?.phone, queryDigits)
          );
        })
        .slice(0, input.limit ?? 25);

      return matches.map((record) => ({
        order: record.order,
        customer: record.order.customer,
        userId: record.userId,
        paymentId: record.paymentId,
        successfulCharge: record.successfulCharge,
        successfulRefund: record.successfulRefund,
        auditLog: auditLog.filter((entry) => entry.targetType === "order" && entry.targetId === record.order.id)
      }));
    },
    async lookupSupportCheckoutDrafts(input) {
      const query = input.query.trim().toLowerCase();
      const matches = [...checkoutDraftsById.values()]
        .filter((draft) => {
          if (input.locationId && draft.locationId !== input.locationId) {
            return false;
          }

          return (
            textMatchesSupportQuery(draft.checkoutId, query) ||
            textMatchesSupportQuery(draft.quoteId, query) ||
            textMatchesSupportQuery(draft.orderId, query) ||
            textMatchesSupportQuery(draft.userId, query) ||
            textMatchesSupportQuery(draft.status, query)
          );
        })
        .slice(0, input.limit ?? 25);

      return matches.map((checkout) => ({
        checkout,
        userId: checkout.userId,
        auditLog: auditLog.filter((entry) => entry.targetType === "checkout" && entry.targetId === checkout.checkoutId)
      }));
    },
    async listDiscountCodes(locationId) {
      return [...discountCodesById.values()]
        .filter((discountCode) => discountCode.locationId === locationId)
        .map(attachDiscountUsage)
        .sort((left, right) => left.code.localeCompare(right.code));
    },
    async getDiscountCode(locationId, code) {
      const discountCode = [...discountCodesById.values()].find(
        (entry) => entry.locationId === locationId && entry.code === code
      );
      return discountCode ? attachDiscountUsage(discountCode) : undefined;
    },
    async getDiscountCodeById(locationId, discountCodeId) {
      const discountCode = discountCodesById.get(discountCodeId);
      return discountCode && discountCode.locationId === locationId ? attachDiscountUsage(discountCode) : undefined;
    },
    async createDiscountCode(input) {
      const existing = [...discountCodesById.values()].find(
        (entry) => entry.locationId === input.locationId && entry.code === input.code
      );
      if (existing) {
        throw new Error("discount code already exists for location");
      }

      const now = new Date().toISOString();
      const discountCode = discountCodeSchema.parse({
        discountCodeId: randomUUID(),
        locationId: input.locationId,
        code: input.code,
        name: input.name,
        type: input.type,
        value: input.value,
        maxDiscountCents: input.maxDiscountCents,
        minSubtotalCents: input.minSubtotalCents,
        eligibility: input.eligibility,
        oncePerCustomer: input.oncePerCustomer,
        maxTotalRedemptions: input.maxTotalRedemptions,
        active: input.active,
        startsAt: input.startsAt,
        expiresAt: input.expiresAt,
        redeemedCount: 0,
        reservedCount: 0,
        createdAt: now,
        updatedAt: now
      });
      discountCodesById.set(discountCode.discountCodeId, discountCode);
      return discountCode;
    },
    async updateDiscountCode(input) {
      const existing = discountCodesById.get(input.discountCodeId);
      if (!existing || existing.locationId !== input.locationId) {
        return undefined;
      }

      const updated = discountCodeSchema.parse({
        ...existing,
        name: input.name ?? existing.name,
        type: input.type ?? existing.type,
        value: input.value ?? existing.value,
        maxDiscountCents: input.maxDiscountCents !== undefined ? (input.maxDiscountCents ?? undefined) : existing.maxDiscountCents,
        minSubtotalCents: input.minSubtotalCents ?? existing.minSubtotalCents,
        eligibility: input.eligibility ?? existing.eligibility,
        oncePerCustomer: input.oncePerCustomer ?? existing.oncePerCustomer,
        maxTotalRedemptions:
          input.maxTotalRedemptions !== undefined ? (input.maxTotalRedemptions ?? undefined) : existing.maxTotalRedemptions,
        active: input.active ?? existing.active,
        startsAt: input.startsAt !== undefined ? (input.startsAt ?? undefined) : existing.startsAt,
        expiresAt: input.expiresAt !== undefined ? (input.expiresAt ?? undefined) : existing.expiresAt,
        updatedAt: new Date().toISOString()
      });
      discountCodesById.set(updated.discountCodeId, updated);
      return attachDiscountUsage(updated);
    },
    async getDiscountUsage(discountCodeId) {
      return discountUsage(discountCodeId);
    },
    async getCustomerDiscountUsage(discountCodeId, userId) {
      const redemptions = [...discountCodeRedemptionsByOrderId.values()].filter(
        (redemption) => redemption.discountCodeId === discountCodeId && redemption.userId === userId
      );
      return {
        reserved: redemptions.filter((redemption) => redemption.status === "RESERVED").length,
        redeemed: redemptions.filter((redemption) => redemption.status === "REDEEMED").length
      };
    },
    async getCustomerPaidOrderCount(locationId, userId) {
      return [...ordersById.values()].filter(
        (record) => record.userId === userId && record.order.locationId === locationId && record.order.status !== "PENDING_PAYMENT"
      ).length;
    },
    async reserveDiscountForOrder(input) {
      const existing = discountCodeRedemptionsByOrderId.get(input.orderId);
      if (existing) {
        return true;
      }

      const discountCode = discountCodesById.get(input.discountCodeId);
      if (!discountCode || discountCode.locationId !== input.locationId) {
        return false;
      }

      const usage = discountUsage(input.discountCodeId);
      if (
        discountCode.maxTotalRedemptions !== undefined &&
        usage.reserved + usage.redeemed >= discountCode.maxTotalRedemptions
      ) {
        return false;
      }

      if (discountCode.oncePerCustomer) {
        const customerUsage = [...discountCodeRedemptionsByOrderId.values()].filter(
          (redemption) =>
            redemption.discountCodeId === input.discountCodeId &&
            redemption.userId === input.userId &&
            (redemption.status === "RESERVED" || redemption.status === "REDEEMED")
        );
        if (customerUsage.length > 0) {
          return false;
        }
      }

      const now = new Date().toISOString();
      discountCodeRedemptionsByOrderId.set(
        input.orderId,
        discountCodeRedemptionSchema.parse({
          redemptionId: randomUUID(),
          discountCodeId: input.discountCodeId,
          locationId: input.locationId,
          code: input.code,
          orderId: input.orderId,
          userId: input.userId,
          discountCents: input.discountCents,
          status: "RESERVED",
          reservedAt: now
        })
      );
      return true;
    },
    async redeemDiscountForOrder(orderId) {
      const existing = discountCodeRedemptionsByOrderId.get(orderId);
      if (!existing || existing.status === "REDEEMED") {
        return;
      }

      discountCodeRedemptionsByOrderId.set(orderId, {
        ...existing,
        status: "REDEEMED",
        redeemedAt: new Date().toISOString()
      });
    },
    async releaseDiscountForOrder(orderId) {
      const existing = discountCodeRedemptionsByOrderId.get(orderId);
      if (!existing || existing.status === "RELEASED" || existing.status === "REDEEMED") {
        return;
      }

      discountCodeRedemptionsByOrderId.set(orderId, {
        ...existing,
        status: "RELEASED",
        releasedAt: new Date().toISOString()
      });
    },
    async getOrderDiscountRedemption(orderId) {
      return discountCodeRedemptionsByOrderId.get(orderId);
    },
    async listDiscountRedemptions(input) {
      return [...discountCodeRedemptionsByOrderId.values()]
        .filter(
          (redemption) =>
            redemption.locationId === input.locationId && redemption.discountCodeId === input.discountCodeId
        )
        .slice(0, input.limit ?? 100);
    },
    async getCatalogItemsForQuote(_locationId, itemIds) {
      const items = new Map<string, QuoteCatalogItem>();
      for (const itemId of itemIds) {
        const item = fallbackCatalogItems.get(itemId);
        if (item) {
          items.set(itemId, item);
        }
      }
      return items;
    },
    async getTaxRateBasisPoints() {
      return defaultTaxRateBasisPoints;
    },
    async pingDb() {
      // no-op for in-memory
    },
    async close() {
      // no-op
    }
  };
}

async function createPostgresRepository(
  connectionString: string,
  logger: FastifyBaseLogger
): Promise<OrdersRepository> {
  const db = createPostgresDb(connectionString);
  await runMigrations(db);

  async function getPersistedOrder(orderId: string): Promise<PersistedOrderRow | undefined> {
    const row = await db.selectFrom("orders").selectAll().where("order_id", "=", orderId).executeTakeFirst();
    return row as PersistedOrderRow | undefined;
  }

  function parseOrder(payload: unknown): Order {
    return orderSchema.parse(payload);
  }

  function parseOrderCustomer(payload: unknown): OrderCustomer | undefined {
    if (!payload || typeof payload !== "object") {
      return undefined;
    }

    const parsed = orderCustomerSchema.safeParse(payload);
    return parsed.success ? parsed.data : undefined;
  }

  function toOrderCustomerFromIdentityUser(row: {
    name: string | null;
    display_name: string | null;
    email: string | null;
    phone_number: string | null;
  }): OrderCustomer | undefined {
    return parseOrderCustomer({
      name: trimToUndefined(row.display_name) ?? trimToUndefined(row.name),
      email: trimToUndefined(row.email),
      phone: trimToUndefined(row.phone_number)
    });
  }

  function parseQuote(payload: unknown): OrderQuote {
    return orderQuoteSchema.parse(payload);
  }

  function parseCustomizationGroups(payload: unknown) {
    return normalizeCustomizationGroups(typeof payload === "string" ? JSON.parse(payload) : payload);
  }

  async function getDiscountUsageById(discountCodeId: string): Promise<DiscountUsage> {
    const rows = await db
      .selectFrom("discount_code_redemptions")
      .select(["status", sql<number>`count(*)::int`.as("count")])
      .where("discount_code_id", "=", discountCodeId)
      .where("status", "in", ["RESERVED", "REDEEMED"])
      .groupBy("status")
      .execute();

    return {
      reserved: Number(rows.find((row) => row.status === "RESERVED")?.count ?? 0),
      redeemed: Number(rows.find((row) => row.status === "REDEEMED")?.count ?? 0)
    };
  }

  async function getDiscountCodeByRowId(locationId: string, discountCodeId: string): Promise<DiscountCode | undefined> {
    const row = await db
      .selectFrom("discount_codes")
      .selectAll()
      .where("location_id", "=", locationId)
      .where("discount_code_id", "=", discountCodeId)
      .executeTakeFirst();

    if (!row) {
      return undefined;
    }

    const usage = await getDiscountUsageById(row.discount_code_id);
    return toDiscountCode({
      ...row,
      reserved_count: usage.reserved,
      redeemed_count: usage.redeemed
    });
  }

  async function getQuoteById(quoteId: string): Promise<OrderQuote | undefined> {
    const row = await db.selectFrom("orders_quotes").selectAll().where("quote_id", "=", quoteId).executeTakeFirst();
    if (!row) {
      return undefined;
    }
    return parseQuote((row as PersistedQuoteRow).quote_json);
  }

  async function getOrderById(orderId: string): Promise<Order | undefined> {
    const row = await getPersistedOrder(orderId);
    if (!row) {
      return undefined;
    }
    return parseOrder(row.order_json);
  }

  return {
    backend: "postgres",
    async saveQuote(quote) {
      try {
        await db
          .insertInto("orders_quotes")
          .values({
            quote_id: quote.quoteId,
            quote_hash: quote.quoteHash,
            quote_json: quote
          })
          .execute();
        return;
      } catch {
        await db
          .updateTable("orders_quotes")
          .set({
            quote_hash: quote.quoteHash,
            quote_json: quote
          })
          .where("quote_id", "=", quote.quoteId)
          .execute();
      }
    },
    async getQuote(quoteId) {
      return getQuoteById(quoteId);
    },
    async createCheckoutDraft(draft) {
      try {
        await db
          .insertInto("order_checkout_drafts")
          .values({
            checkout_id: draft.checkoutId,
            user_id: draft.userId,
            quote_id: draft.quoteId,
            quote_hash: draft.quoteHash,
            status: draft.status,
            order_id: draft.orderId ?? null,
            expires_at: draft.expiresAt
          })
          .execute();
      } catch (error) {
        const existing = await db
          .selectFrom("order_checkout_drafts")
          .selectAll()
          .where("quote_id", "=", draft.quoteId)
          .where("quote_hash", "=", draft.quoteHash)
          .where("user_id", "=", draft.userId)
          .where("status", "=", "OPEN")
          .executeTakeFirst();
        if (!existing) throw error;
        const quote = await getQuoteById(existing.quote_id);
        if (!quote) throw error;
        return toCheckoutDraft(existing as PersistedCheckoutDraftRow, quote);
      }
      const persisted = await db
        .selectFrom("order_checkout_drafts")
        .selectAll()
        .where("checkout_id", "=", draft.checkoutId)
        .executeTakeFirstOrThrow();
      const quote = await getQuoteById(persisted.quote_id);
      if (!quote) {
        throw new Error("Checkout draft quote is missing");
      }
      return toCheckoutDraft(persisted as PersistedCheckoutDraftRow, quote);
    },
    async getCheckoutDraft(checkoutId) {
      const row = await db.selectFrom("order_checkout_drafts").selectAll().where("checkout_id", "=", checkoutId).executeTakeFirst();
      if (!row) return undefined;
      const quote = await getQuoteById(row.quote_id);
      return quote ? toCheckoutDraft(row as PersistedCheckoutDraftRow, quote) : undefined;
    },
    async getCheckoutDraftForQuote({ quoteId, quoteHash, userId }) {
      const row = await db
        .selectFrom("order_checkout_drafts")
        .selectAll()
        .where("quote_id", "=", quoteId)
        .where("quote_hash", "=", quoteHash)
        .where("user_id", "=", userId)
        .orderBy("created_at", "desc")
        .executeTakeFirst();
      if (!row) return undefined;
      const quote = await getQuoteById(row.quote_id);
      return quote ? toCheckoutDraft(row as PersistedCheckoutDraftRow, quote) : undefined;
    },
    async listOpenCheckoutDraftsByUser(userId) {
      const rows = await db
        .selectFrom("order_checkout_drafts")
        .selectAll()
        .where("user_id", "=", userId)
        .where("status", "=", "OPEN")
        .execute();
      const drafts = await Promise.all(rows.map(async (row) => {
        const quote = await getQuoteById(row.quote_id);
        return quote ? toCheckoutDraft(row as PersistedCheckoutDraftRow, quote) : undefined;
      }));
      return drafts.filter((draft): draft is CheckoutDraft => Boolean(draft));
    },
    async expireCheckoutDraft(checkoutId) {
      await db
        .updateTable("order_checkout_drafts")
        .set({ status: "EXPIRED", updated_at: new Date().toISOString() })
        .where("checkout_id", "=", checkoutId)
        .where("status", "=", "OPEN")
        .execute();
    },
    async promoteCheckoutDraft({ checkoutId, order, quoteId, userId }) {
      const existing = await getOrderById(checkoutId);
      if (existing) return { order: existing, created: false };
      let created = false;
      await db.transaction().execute(async (trx) => {
        const inserted = await trx
          .insertInto("orders")
          .values({ order_id: checkoutId, user_id: userId, quote_id: quoteId, order_json: order })
          .onConflict((conflict) => conflict.column("order_id").doNothing())
          .returning("order_id")
          .executeTakeFirst();
        created = Boolean(inserted);
        await trx
          .updateTable("order_checkout_drafts")
          .set({ status: "CONVERTED", order_id: checkoutId, updated_at: new Date().toISOString() })
          .where("checkout_id", "=", checkoutId)
          .execute();
      });
      const persistedOrder = await getOrderById(checkoutId);
      if (!persistedOrder) throw new Error("Checkout promotion did not create an order");
      return { order: persistedOrder, created };
    },
    async createOrder({ order, quoteId, userId }) {
      await db
        .insertInto("orders")
        .values({
          order_id: order.id,
          user_id: userId,
          quote_id: quoteId,
          order_json: order
        })
        .execute();
    },
    async getOrder(orderId) {
      return getOrderById(orderId);
    },
    async listOrders() {
      const rows = await db.selectFrom("orders").selectAll().orderBy("created_at", "desc").execute();
      return rows.map((row) => parseOrder((row as PersistedOrderRow).order_json));
    },
    async listOrdersByUser(userId) {
      const rows = await db
        .selectFrom("orders")
        .selectAll()
        .where("user_id", "=", userId)
        .orderBy("created_at", "desc")
        .execute();
      return rows.map((row) => parseOrder((row as PersistedOrderRow).order_json));
    },
    async listOrdersByLocation(locationId) {
      const rows = await db
        .selectFrom("orders")
        .selectAll()
        .where(sql`order_json->>'locationId'`, "=", locationId)
        .orderBy("created_at", "desc")
        .execute();
      return rows.map((row) => parseOrder((row as PersistedOrderRow).order_json));
    },
    async getOrderForCreateIdempotency(quoteId, quoteHash) {
      const row = await db
        .selectFrom("orders_create_idempotency")
        .selectAll()
        .where("quote_id", "=", quoteId)
        .where("quote_hash", "=", quoteHash)
        .executeTakeFirst();

      if (!row) {
        return undefined;
      }

      return getOrderById(row.order_id);
    },
    async saveCreateOrderIdempotency(quoteId, quoteHash, orderId) {
      try {
        await db
          .insertInto("orders_create_idempotency")
          .values({
            quote_id: quoteId,
            quote_hash: quoteHash,
            order_id: orderId
          })
          .execute();
      } catch {
        // ignore duplicate key races
      }
    },
    async getPaymentOrderByIdempotency(orderId, idempotencyKey) {
      const row = await db
        .selectFrom("orders_payment_idempotency")
        .selectAll()
        .where("order_id", "=", orderId)
        .where("idempotency_key", "=", idempotencyKey)
        .executeTakeFirst();

      if (!row) {
        return undefined;
      }

      return getOrderById(row.order_id);
    },
    async savePaymentIdempotency(orderId, idempotencyKey) {
      try {
        await db
          .insertInto("orders_payment_idempotency")
          .values({
            order_id: orderId,
            idempotency_key: idempotencyKey
          })
          .execute();
      } catch {
        // ignore duplicate key races
      }
    },
    async getOrderQuote(orderId) {
      const orderRow = await getPersistedOrder(orderId);
      if (!orderRow) {
        return undefined;
      }
      return getQuoteById(orderRow.quote_id);
    },
    async getOrderUserId(orderId) {
      const row = await getPersistedOrder(orderId);
      return row?.user_id;
    },
    async getOrderCustomer(orderId) {
      const row = await db
        .selectFrom("orders")
        .innerJoin("identity_users", "identity_users.user_id", "orders.user_id")
        .select([
          "identity_users.name",
          "identity_users.display_name",
          "identity_users.email",
          "identity_users.phone_number"
        ])
        .where("orders.order_id", "=", orderId)
        .executeTakeFirst();

      return row ? toOrderCustomerFromIdentityUser(row) : undefined;
    },
    async listOrderCustomers(orderIds) {
      if (orderIds.length === 0) {
        return new Map();
      }

      const rows = await db
        .selectFrom("orders")
        .innerJoin("identity_users", "identity_users.user_id", "orders.user_id")
        .select([
          "orders.order_id",
          "identity_users.name",
          "identity_users.display_name",
          "identity_users.email",
          "identity_users.phone_number"
        ])
        .where("orders.order_id", "in", [...orderIds])
        .execute();

      return new Map(
        rows
          .map((row) => {
            const customer = toOrderCustomerFromIdentityUser(row);
            return customer ? ([row.order_id, customer] as const) : null;
          })
          .filter((entry): entry is readonly [string, OrderCustomer] => entry !== null)
      );
    },
    async setOrderUserId(orderId, userId) {
      await db
        .updateTable("orders")
        .set({
          user_id: userId,
          updated_at: new Date().toISOString()
        })
        .where("order_id", "=", orderId)
        .execute();
    },
    async setPaymentId(orderId, paymentId) {
      await db
        .updateTable("orders")
        .set({
          payment_id: paymentId,
          updated_at: new Date().toISOString()
        })
        .where("order_id", "=", orderId)
        .execute();
    },
    async getPaymentId(orderId) {
      const row = await getPersistedOrder(orderId);
      return row?.payment_id ?? undefined;
    },
    async setSuccessfulCharge(orderId, payload) {
      await db
        .updateTable("orders")
        .set({
          successful_charge_json: payload,
          updated_at: new Date().toISOString()
        })
        .where("order_id", "=", orderId)
        .execute();
    },
    async getSuccessfulCharge(orderId) {
      const row = await getPersistedOrder(orderId);
      return row?.successful_charge_json === null ? undefined : row?.successful_charge_json;
    },
    async setSuccessfulRefund(orderId, payload) {
      await db
        .updateTable("orders")
        .set({
          successful_refund_json: payload,
          updated_at: new Date().toISOString()
        })
        .where("order_id", "=", orderId)
        .execute();
    },
    async getSuccessfulRefund(orderId) {
      const row = await getPersistedOrder(orderId);
      return row?.successful_refund_json === null ? undefined : row?.successful_refund_json;
    },
    async updateOrder(orderId, order) {
      const updated = await db
        .updateTable("orders")
        .set({
          order_json: order,
          updated_at: new Date().toISOString()
        })
        .where("order_id", "=", orderId)
        .executeTakeFirst();

      if (Number(updated.numUpdatedRows ?? 0) === 0) {
        throw new Error("order not found while updating");
      }

      return order;
    },
    async writeAuditLog(entry) {
      await writeAuditLog(db, entry);
    },
    async lookupSupportOrders(input) {
      const query = input.query.trim();
      if (!query) {
        return [];
      }

      const normalizedQuery = query.toLowerCase();
      const likeQuery = `%${normalizedQuery}%`;
      const queryDigits = normalizePhoneDigits(query);
      const phoneLikeQuery = `%${queryDigits}%`;
      const limit = Math.min(Math.max(input.limit ?? 25, 1), 50);
      let rowsQuery = db
        .selectFrom("orders")
        .leftJoin("identity_users", "identity_users.user_id", "orders.user_id")
        .leftJoin("payments_stripe_payment_intents", (join) =>
          join.on(sql<string>`payments_stripe_payment_intents.order_id`, "=", sql<string>`orders.order_id::text`)
        )
        .select([
          "orders.order_id as order_id",
          "orders.user_id as user_id",
          "orders.order_json as order_json",
          "orders.payment_id as payment_id",
          "orders.successful_charge_json as successful_charge_json",
          "orders.successful_refund_json as successful_refund_json",
          "orders.created_at as created_at",
          "orders.updated_at as updated_at",
          "identity_users.name as customer_name",
          "identity_users.display_name as customer_display_name",
          "identity_users.email as customer_email",
          "identity_users.phone_number as customer_phone_number",
          "payments_stripe_payment_intents.payment_intent_id as payment_intent_id",
          "payments_stripe_payment_intents.status as stripe_payment_status"
        ])
        .where((eb) =>
          eb.or([
            eb(sql<string>`orders.order_id::text`, "ilike", likeQuery),
            eb(sql<string>`orders.user_id::text`, "ilike", likeQuery),
            eb(sql<string>`COALESCE(orders.payment_id, '')`, "ilike", likeQuery),
            eb(sql<string>`COALESCE(payments_stripe_payment_intents.payment_intent_id, '')`, "ilike", likeQuery),
            eb(sql<string>`COALESCE(orders.order_json->>'pickupCode', '')`, "ilike", likeQuery),
            eb(sql<string>`COALESCE(identity_users.email, '')`, "ilike", likeQuery),
            eb(sql<string>`COALESCE(identity_users.name, '')`, "ilike", likeQuery),
            eb(sql<string>`COALESCE(identity_users.display_name, '')`, "ilike", likeQuery),
            eb(sql<string>`COALESCE(identity_users.phone_number, '')`, "ilike", likeQuery),
            eb(sql<string>`COALESCE(orders.order_json->'customer'->>'email', '')`, "ilike", likeQuery),
            eb(sql<string>`COALESCE(orders.order_json->'customer'->>'name', '')`, "ilike", likeQuery),
            eb(sql<string>`COALESCE(orders.order_json->'customer'->>'phone', '')`, "ilike", likeQuery),
            ...(queryDigits.length >= 4
              ? [
                  eb(
                    sql<string>`regexp_replace(COALESCE(identity_users.phone_number, ''), '\\D', '', 'g')`,
                    "like",
                    phoneLikeQuery
                  ),
                  eb(
                    sql<string>`regexp_replace(COALESCE(orders.order_json->'customer'->>'phone', ''), '\\D', '', 'g')`,
                    "like",
                    phoneLikeQuery
                  )
                ]
              : [])
          ])
        )
        .orderBy("orders.created_at", "desc")
        .limit(limit);

      if (input.locationId) {
        rowsQuery = rowsQuery.where(sql`orders.order_json->>'locationId'`, "=", input.locationId);
      }

      const rows = await rowsQuery.execute();
      const orderIds = rows.map((row) => row.order_id);
      const auditRows =
        orderIds.length === 0
          ? []
          : await db
              .selectFrom("audit_log")
              .selectAll()
              .where("target_type", "=", "order")
              .where("target_id", "in", orderIds)
              .orderBy("occurred_at", "desc")
              .limit(250)
              .execute();
      const auditByOrderId = new Map<string, SupportAuditLogEntry[]>();
      for (const row of auditRows) {
        const auditEntry = toSupportAuditLogEntry(row);
        const entries = auditByOrderId.get(auditEntry.targetId ?? "") ?? [];
        entries.push(auditEntry);
        if (auditEntry.targetId) {
          auditByOrderId.set(auditEntry.targetId, entries);
        }
      }

      return rows.map((row) => {
        const order = orderSchema.parse(row.order_json);
        const customer = toOrderCustomerFromIdentityUser({
          name: row.customer_name,
          display_name: row.customer_display_name,
          email: row.customer_email,
          phone_number: row.customer_phone_number
        });

        return {
          order,
          customer: customer ?? order.customer,
          userId: row.user_id,
          paymentId: row.payment_id ?? undefined,
          paymentProvider: row.payment_intent_id ? "STRIPE" : row.payment_id ? "CLOVER" : undefined,
          paymentStatus: row.stripe_payment_status ?? undefined,
          paymentIntentId: row.payment_intent_id ?? undefined,
          successfulCharge: row.successful_charge_json ?? undefined,
          successfulRefund: row.successful_refund_json ?? undefined,
          createdAt: row.created_at ? parseIsoDate(row.created_at) : undefined,
          updatedAt: row.updated_at ? parseIsoDate(row.updated_at) : undefined,
          auditLog: auditByOrderId.get(order.id) ?? []
        };
      });
    },
    async lookupSupportCheckoutDrafts(input) {
      const query = input.query.trim();
      if (!query) {
        return [];
      }

      const normalizedQuery = query.toLowerCase();
      const likeQuery = `%${normalizedQuery}%`;
      const limit = Math.min(Math.max(input.limit ?? 25, 1), 50);
      let rowsQuery = db
        .selectFrom("order_checkout_drafts")
        .innerJoin("orders_quotes", "orders_quotes.quote_id", "order_checkout_drafts.quote_id")
        .leftJoin("payments_stripe_payment_intents", (join) =>
          join.on(sql<string>`payments_stripe_payment_intents.order_id`, "=", sql<string>`order_checkout_drafts.checkout_id::text`)
        )
        .select([
          "order_checkout_drafts.checkout_id as checkout_id",
          "order_checkout_drafts.user_id as user_id",
          "order_checkout_drafts.quote_id as quote_id",
          "order_checkout_drafts.quote_hash as quote_hash",
          "order_checkout_drafts.status as status",
          "order_checkout_drafts.order_id as order_id",
          "order_checkout_drafts.expires_at as expires_at",
          "order_checkout_drafts.created_at as created_at",
          "order_checkout_drafts.updated_at as updated_at",
          "orders_quotes.quote_json as quote_json",
          "payments_stripe_payment_intents.payment_intent_id as payment_intent_id",
          "payments_stripe_payment_intents.status as stripe_payment_status"
        ])
        .where((eb) =>
          eb.or([
            eb(sql<string>`order_checkout_drafts.checkout_id::text`, "ilike", likeQuery),
            eb(sql<string>`order_checkout_drafts.quote_id::text`, "ilike", likeQuery),
            eb(sql<string>`order_checkout_drafts.user_id::text`, "ilike", likeQuery),
            eb(sql<string>`COALESCE(order_checkout_drafts.order_id::text, '')`, "ilike", likeQuery),
            eb(sql<string>`order_checkout_drafts.status::text`, "ilike", likeQuery),
            eb(sql<string>`COALESCE(payments_stripe_payment_intents.payment_intent_id, '')`, "ilike", likeQuery)
          ])
        )
        .orderBy("order_checkout_drafts.created_at", "desc")
        .limit(limit);

      if (input.locationId) {
        rowsQuery = rowsQuery.where(sql`orders_quotes.quote_json->>'locationId'`, "=", input.locationId);
      }

      const rows = await rowsQuery.execute();
      const checkoutIds = rows.map((row) => row.checkout_id);
      const auditRows =
        checkoutIds.length === 0
          ? []
          : await db
              .selectFrom("audit_log")
              .selectAll()
              .where("target_type", "=", "checkout")
              .where("target_id", "in", checkoutIds)
              .orderBy("occurred_at", "desc")
              .limit(250)
              .execute();
      const auditByCheckoutId = new Map<string, SupportAuditLogEntry[]>();
      for (const row of auditRows) {
        const auditEntry = toSupportAuditLogEntry(row);
        const entries = auditByCheckoutId.get(auditEntry.targetId ?? "") ?? [];
        entries.push(auditEntry);
        if (auditEntry.targetId) {
          auditByCheckoutId.set(auditEntry.targetId, entries);
        }
      }

      return rows.map((row) => {
        const quote = orderQuoteSchema.parse(row.quote_json);
        const checkout = toCheckoutDraft(row as PersistedCheckoutDraftRow, quote);

        return {
          checkout,
          userId: row.user_id,
          paymentProvider: row.payment_intent_id ? "STRIPE" : undefined,
          paymentStatus: row.stripe_payment_status ?? undefined,
          paymentIntentId: row.payment_intent_id ?? undefined,
          createdAt: row.created_at ? parseIsoDate(row.created_at) : undefined,
          updatedAt: row.updated_at ? parseIsoDate(row.updated_at) : undefined,
          auditLog: auditByCheckoutId.get(checkout.checkoutId) ?? []
        };
      });
    },
    async listDiscountCodes(locationId) {
      const rows = await db
        .selectFrom("discount_codes")
        .selectAll()
        .where("location_id", "=", locationId)
        .orderBy("code", "asc")
        .execute();

      const discountCodes: DiscountCode[] = [];
      for (const row of rows) {
        const usage = await getDiscountUsageById(row.discount_code_id);
        discountCodes.push(
          toDiscountCode({
            ...row,
            reserved_count: usage.reserved,
            redeemed_count: usage.redeemed
          })
        );
      }

      return discountCodes;
    },
    async getDiscountCode(locationId, code) {
      const row = await db
        .selectFrom("discount_codes")
        .selectAll()
        .where("location_id", "=", locationId)
        .where("code", "=", code)
        .executeTakeFirst();

      if (!row) {
        return undefined;
      }

      const usage = await getDiscountUsageById(row.discount_code_id);
      return toDiscountCode({
        ...row,
        reserved_count: usage.reserved,
        redeemed_count: usage.redeemed
      });
    },
    async getDiscountCodeById(locationId, discountCodeId) {
      return getDiscountCodeByRowId(locationId, discountCodeId);
    },
    async createDiscountCode(input) {
      await db
        .insertInto("discount_codes")
        .values({
          location_id: input.locationId,
          code: input.code,
          name: input.name,
          type: input.type,
          value: input.value,
          max_discount_cents: input.maxDiscountCents ?? null,
          min_subtotal_cents: input.minSubtotalCents,
          eligibility: input.eligibility,
          once_per_customer: input.oncePerCustomer,
          max_total_redemptions: input.maxTotalRedemptions ?? null,
          active: input.active,
          starts_at: input.startsAt ?? null,
          expires_at: input.expiresAt ?? null
        })
        .execute();

      const created = await db
        .selectFrom("discount_codes")
        .selectAll()
        .where("location_id", "=", input.locationId)
        .where("code", "=", input.code)
        .executeTakeFirst();
      if (!created) {
        throw new Error("discount code was not found after creation");
      }
      return toDiscountCode({
        ...created,
        reserved_count: 0,
        redeemed_count: 0
      });
    },
    async updateDiscountCode(input) {
      await db
        .updateTable("discount_codes")
        .set({
          ...(input.name !== undefined ? { name: input.name } : {}),
          ...(input.type !== undefined ? { type: input.type } : {}),
          ...(input.value !== undefined ? { value: input.value } : {}),
          ...(input.maxDiscountCents !== undefined ? { max_discount_cents: input.maxDiscountCents } : {}),
          ...(input.minSubtotalCents !== undefined ? { min_subtotal_cents: input.minSubtotalCents } : {}),
          ...(input.eligibility !== undefined ? { eligibility: input.eligibility } : {}),
          ...(input.oncePerCustomer !== undefined ? { once_per_customer: input.oncePerCustomer } : {}),
          ...(input.maxTotalRedemptions !== undefined ? { max_total_redemptions: input.maxTotalRedemptions } : {}),
          ...(input.active !== undefined ? { active: input.active } : {}),
          ...(input.startsAt !== undefined ? { starts_at: input.startsAt } : {}),
          ...(input.expiresAt !== undefined ? { expires_at: input.expiresAt } : {}),
          updated_at: new Date().toISOString()
        })
        .where("discount_code_id", "=", input.discountCodeId)
        .where("location_id", "=", input.locationId)
        .execute();

      return getDiscountCodeByRowId(input.locationId, input.discountCodeId);
    },
    async getDiscountUsage(discountCodeId) {
      return getDiscountUsageById(discountCodeId);
    },
    async getCustomerDiscountUsage(discountCodeId, userId) {
      const rows = await db
        .selectFrom("discount_code_redemptions")
        .select(["status", sql<number>`count(*)::int`.as("count")])
        .where("discount_code_id", "=", discountCodeId)
        .where("user_id", "=", userId)
        .where("status", "in", ["RESERVED", "REDEEMED"])
        .groupBy("status")
        .execute();

      return {
        reserved: Number(rows.find((row) => row.status === "RESERVED")?.count ?? 0),
        redeemed: Number(rows.find((row) => row.status === "REDEEMED")?.count ?? 0)
      };
    },
    async getCustomerPaidOrderCount(locationId, userId) {
      const row = await db
        .selectFrom("orders")
        .select(sql<number>`count(*)::int`.as("count"))
        .where("user_id", "=", userId)
        .where(sql`orders.order_json->>'locationId'`, "=", locationId)
        .where(sql`orders.order_json->>'status'`, "in", ["PAID", "IN_PREP", "READY", "COMPLETED"])
        .executeTakeFirst();

      return Number(row?.count ?? 0);
    },
    async reserveDiscountForOrder(input) {
      const existing = await db
        .selectFrom("discount_code_redemptions")
        .select("redemption_id")
        .where("order_id", "=", input.orderId)
        .executeTakeFirst();
      if (existing) {
        return true;
      }

      return db.transaction().execute(async (trx) => {
        const discountCode = await trx
          .selectFrom("discount_codes")
          .select(["discount_code_id", "max_total_redemptions", "once_per_customer"])
          .where("discount_code_id", "=", input.discountCodeId)
          .where("location_id", "=", input.locationId)
          .forUpdate()
          .executeTakeFirst();

        if (!discountCode) {
          return false;
        }

        const usage = await trx
          .selectFrom("discount_code_redemptions")
          .select(sql<number>`count(*)::int`.as("count"))
          .where("discount_code_id", "=", input.discountCodeId)
          .where("status", "in", ["RESERVED", "REDEEMED"])
          .executeTakeFirst();

        if (
          discountCode.max_total_redemptions !== null &&
          Number(usage?.count ?? 0) >= discountCode.max_total_redemptions
        ) {
          return false;
        }

        if (discountCode.once_per_customer) {
          const customerUsage = await trx
            .selectFrom("discount_code_redemptions")
            .select("redemption_id")
            .where("discount_code_id", "=", input.discountCodeId)
            .where("user_id", "=", input.userId)
            .where("status", "in", ["RESERVED", "REDEEMED"])
            .executeTakeFirst();

          if (customerUsage) {
            return false;
          }
        }

        const inserted = await trx
          .insertInto("discount_code_redemptions")
          .values({
            discount_code_id: input.discountCodeId,
            location_id: input.locationId,
            code: input.code,
            order_id: input.orderId,
            user_id: input.userId,
            discount_cents: input.discountCents,
            status: "RESERVED"
          })
          .onConflict((oc) => oc.column("order_id").doNothing())
          .returning("redemption_id")
          .executeTakeFirst();

        return Boolean(inserted);
      });
    },
    async redeemDiscountForOrder(orderId) {
      await db
        .updateTable("discount_code_redemptions")
        .set({
          status: "REDEEMED",
          redeemed_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
        .where("order_id", "=", orderId)
        .where("status", "=", "RESERVED")
        .execute();
    },
    async releaseDiscountForOrder(orderId) {
      await db
        .updateTable("discount_code_redemptions")
        .set({
          status: "RELEASED",
          released_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
        .where("order_id", "=", orderId)
        .where("status", "=", "RESERVED")
        .execute();
    },
    async getOrderDiscountRedemption(orderId) {
      const row = await db
        .selectFrom("discount_code_redemptions")
        .selectAll()
        .where("order_id", "=", orderId)
        .executeTakeFirst();
      return row ? toDiscountCodeRedemption(row) : undefined;
    },
    async listDiscountRedemptions(input) {
      const rows = await db
        .selectFrom("discount_code_redemptions")
        .selectAll()
        .where("location_id", "=", input.locationId)
        .where("discount_code_id", "=", input.discountCodeId)
        .orderBy("created_at", "desc")
        .limit(Math.min(Math.max(input.limit ?? 100, 1), 250))
        .execute();

      return rows.map(toDiscountCodeRedemption);
    },
    async getCatalogItemsForQuote(locationId, itemIds) {
      if (itemIds.length === 0) {
        return new Map<string, QuoteCatalogItem>();
      }

      const rows = await db
        .selectFrom("catalog_menu_items")
        .select(["item_id", "name", "price_cents", "customization_groups_json", "visible"])
        .where("location_id", "=", locationId)
        .where("item_id", "in", itemIds)
        .where("visible", "=", true)
        .execute();

      const items = new Map<string, QuoteCatalogItem>();
      for (const row of rows) {
        items.set(row.item_id, {
          itemId: row.item_id,
          itemName: row.name,
          basePriceCents: row.price_cents,
          customizationGroups: parseCustomizationGroups(row.customization_groups_json)
        });
      }

      return items;
    },
    async getTaxRateBasisPoints(locationId) {
      const row = await db
        .selectFrom("catalog_store_configs")
        .select("tax_rate_basis_points")
        .where("location_id", "=", locationId)
        .executeTakeFirst();

      if (!row) {
        logger.warn(
          {
            locationId,
            fallbackTaxRateBasisPoints: defaultTaxRateBasisPoints
          },
          "catalog store config tax rate missing for location; using default"
        );
        return defaultTaxRateBasisPoints;
      }

      return row.tax_rate_basis_points;
    },
    async pingDb() {
      await sql`SELECT 1`.execute(db);
    },
    async close() {
      await db.destroy();
    }
  };
}

export async function createOrdersRepository(logger: FastifyBaseLogger): Promise<OrdersRepository> {
  const databaseUrl = getDatabaseUrl();
  const allowInMemory = allowsInMemoryPersistence();
  if (!databaseUrl) {
    if (!allowInMemory) {
      throw buildPersistenceStartupError({
        service: "orders",
        reason: "missing_database_url"
      });
    }

    logger.warn({ backend: "memory" }, "orders persistence backend selected with explicit in-memory mode");
    return createInMemoryRepository();
  }

  try {
    const repository = await createPostgresRepository(databaseUrl, logger);
    logger.info({ backend: "postgres" }, "orders persistence backend selected");
    return repository;
  } catch (error) {
    if (!allowInMemory) {
      logger.error({ error }, "failed to initialize postgres persistence");
      throw buildPersistenceStartupError({
        service: "orders",
        reason: "postgres_initialization_failed"
      });
    }

    logger.error({ error }, "failed to initialize postgres persistence; using explicit in-memory fallback");
    return createInMemoryRepository();
  }
}
