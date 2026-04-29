import { createHash, randomUUID } from "node:crypto";
import type { FastifyBaseLogger } from "fastify";
import { publishOrderEvent, type OrderEvent } from "@lattelink/event-bus";
import type { Redis } from "ioredis";
import {
  priceMenuItemCustomization,
  storeConfigResponseSchema,
  type AppConfigFulfillment,
  type CustomizationGroupSelectionSnapshot,
  type StoreConfigResponse
} from "@lattelink/contracts-catalog";
import {
  createOrderRequestSchema,
  ordersPaymentReconciliationResultSchema,
  ordersPaymentReconciliationSchema,
  orderQuoteSchema,
  orderSchema,
  orderTimelineEntrySchema,
  quoteRequestSchema
} from "@lattelink/contracts-orders";
import { z } from "zod";
import { reconcileOrderFulfillmentState } from "./fulfillment.js";
import {
  createOrderTimelineEntry,
  isTerminalOrderStatus,
  OrderTransitionError,
  transitionOrderStatus
} from "./lifecycle.js";
import { type OrdersRepository, type QuoteCatalogItem } from "./repository.js";

const notificationOrderStatusSchema = z.enum([
  "PENDING_PAYMENT",
  "PAID",
  "IN_PREP",
  "READY",
  "COMPLETED",
  "CANCELED"
]);

const orderStateNotificationSchema = z.object({
  userId: z.string().uuid(),
  orderId: z.string().uuid(),
  status: notificationOrderStatusSchema,
  pickupCode: z.string().min(1),
  locationId: z.string().min(1),
  occurredAt: z.string().datetime(),
  note: z.string().optional()
});

const orderStateDispatchResponseSchema = z.object({
  accepted: z.literal(true),
  enqueued: z.number().int().nonnegative(),
  deduplicated: z.boolean()
});

const paymentsChargeStatusSchema = z.enum(["SUCCEEDED", "DECLINED", "TIMEOUT"]);
const paymentsProviderSchema = z.enum(["CLOVER", "STRIPE"]);

const paymentsChargeResponseSchema = z.object({
  paymentId: z.string().min(1),
  provider: paymentsProviderSchema,
  orderId: z.string().uuid(),
  status: paymentsChargeStatusSchema,
  approved: z.boolean(),
  amountCents: z.number().int().positive(),
  currency: z.literal("USD"),
  occurredAt: z.string().datetime(),
  declineCode: z.string().optional(),
  message: z.string().optional()
});

const paymentsRefundRequestSchema = z.object({
  orderId: z.string().uuid(),
  paymentId: z.string().min(1),
  amountCents: z.number().int().positive(),
  currency: z.literal("USD"),
  reason: z.string().min(1),
  idempotencyKey: z.string().min(1),
  locationId: z.string().min(1).optional()
});

const paymentsRefundResponseSchema = z.object({
  refundId: z.string().min(1),
  provider: paymentsProviderSchema,
  orderId: z.string().uuid(),
  paymentId: z.string().min(1),
  status: z.enum(["REFUNDED", "REJECTED"]),
  amountCents: z.number().int().positive(),
  currency: z.literal("USD"),
  occurredAt: z.string().datetime(),
  message: z.string().optional()
});

const loyaltyBalanceSchema = z.object({
  userId: z.string().uuid(),
  locationId: z.string().min(1),
  availablePoints: z.number().int().nonnegative(),
  pendingPoints: z.number().int().nonnegative(),
  lifetimeEarned: z.number().int().nonnegative()
});

const loyaltyLedgerEntrySchema = z.object({
  id: z.string().uuid(),
  type: z.enum(["EARN", "REDEEM", "REFUND", "ADJUSTMENT"]),
  points: z.number().int(),
  orderId: z.string().uuid().optional(),
  locationId: z.string().min(1),
  createdAt: z.string().datetime()
});

const loyaltyMutationBaseSchema = z.object({
  userId: z.string().uuid(),
  locationId: z.string().min(1),
  orderId: z.string().uuid(),
  idempotencyKey: z.string().min(1)
});

const loyaltyMutationRequestSchema = z.union([
  loyaltyMutationBaseSchema.extend({
    type: z.literal("EARN"),
    amountCents: z.number().int().positive()
  }),
  loyaltyMutationBaseSchema.extend({
    type: z.literal("REDEEM"),
    amountCents: z.number().int().positive()
  }),
  loyaltyMutationBaseSchema.extend({
    type: z.literal("REFUND"),
    amountCents: z.number().int().positive()
  }),
  loyaltyMutationBaseSchema.extend({
    type: z.literal("ADJUSTMENT"),
    points: z.number().int().refine((value) => value !== 0, {
      message: "adjustment points cannot be zero"
    })
  })
]);

const loyaltyMutationResponseSchema = z.object({
  entry: loyaltyLedgerEntrySchema,
  balance: loyaltyBalanceSchema
});

export type OrderQuote = z.output<typeof orderQuoteSchema>;
export type Order = z.output<typeof orderSchema>;
export type ServiceError = {
  statusCode: number;
  code: string;
  message: string;
  details?: Record<string, unknown>;
};

export type RequestUserContext = {
  userId?: string;
  error?: ServiceError;
};

export type PosAdapter = {
  submitOrder(order: Order): Promise<void>;
};

export type OrderServiceDeps = {
  repository: OrdersRepository;
  catalogBaseUrl: string;
  paymentsBaseUrl: string;
  paymentsInternalToken?: string;
  loyaltyBaseUrl: string;
  loyaltyInternalToken?: string;
  notificationsBaseUrl: string;
  notificationsInternalToken?: string;
  eventBusPublisher?: Redis;
  posAdapter?: PosAdapter;
  getFulfillmentConfig(locationId?: string): Promise<AppConfigFulfillment>;
  logger: FastifyBaseLogger;
};

export type CancelOrderSource = "customer" | "staff" | "system";
export type OrderStatusUpdateInput = {
  status: "IN_PREP" | "READY" | "COMPLETED";
  note?: string;
};

type QuoteRequest = z.output<typeof quoteRequestSchema>;
type CreateOrderRequest = z.output<typeof createOrderRequestSchema>;
type OrdersPaymentReconciliationInput = z.output<typeof ordersPaymentReconciliationSchema>;
type OrdersPaymentReconciliationResult = z.output<typeof ordersPaymentReconciliationResultSchema>;
type PaymentsRefundResponse = z.output<typeof paymentsRefundResponseSchema>;
type RefundRequestResult =
  | { response: PaymentsRefundResponse }
  | { error: ServiceError; snapshot?: PaymentsRefundResponse };
type StoreConfigLookupResult = StoreConfigResponse | ServiceError;
type StoreAvailabilityResult = { storeConfig: StoreConfigResponse } | { error: ServiceError };

export function isServiceError(value: unknown): value is ServiceError {
  return (
    typeof value === "object" &&
    value !== null &&
    "statusCode" in value &&
    "code" in value &&
    "message" in value
  );
}

function buildServiceError(input: ServiceError): ServiceError {
  return input;
}

function buildMissingRequestUserContextError() {
  return buildServiceError({
    statusCode: 400,
    code: "INVALID_USER_CONTEXT",
    message: "x-user-id header is required for this operation"
  });
}

function buildMissingOrderUserContextError(orderId: string) {
  return buildServiceError({
    statusCode: 409,
    code: "ORDER_USER_CONTEXT_MISSING",
    message: "Order user context is missing",
    details: { orderId }
  });
}

async function hydrateOrderCustomer(params: {
  order: Order;
  deps: OrderServiceDeps;
}): Promise<Order> {
  const customer = await params.deps.repository.getOrderCustomer(params.order.id);
  return customer ? orderSchema.parse({ ...params.order, customer }) : params.order;
}

async function hydrateOrderCustomers(params: {
  orders: readonly Order[];
  deps: OrderServiceDeps;
}): Promise<Order[]> {
  const customersByOrderId = await params.deps.repository.listOrderCustomers(params.orders.map((order) => order.id));
  return params.orders.map((order) => {
    const customer = customersByOrderId.get(order.id);
    return customer ? orderSchema.parse({ ...order, customer }) : order;
  });
}

function buildActiveOrderExistsError(order: Order) {
  return buildServiceError({
    statusCode: 409,
    code: "ACTIVE_ORDER_EXISTS",
    message: "You already have an active order. Complete or cancel it before starting a new one.",
    details: {
      orderId: order.id,
      status: order.status,
      pickupCode: order.pickupCode
    }
  });
}

function buildStoreClosedError(storeConfig: StoreConfigResponse) {
  return buildServiceError({
    statusCode: 409,
    code: "STORE_CLOSED",
    message: "The store is currently closed",
    details: {
      locationId: storeConfig.locationId,
      hoursText: storeConfig.hoursText,
      nextOpenAt: storeConfig.nextOpenAt
    }
  });
}

function buildStoreConfigUnavailableError(details?: Record<string, unknown>) {
  return buildServiceError({
    statusCode: 502,
    code: "STORE_CONFIG_UNAVAILABLE",
    message: "Store hours are temporarily unavailable",
    details
  });
}

function parseJsonSafely(rawBody: string): unknown {
  if (!rawBody) {
    return undefined;
  }

  try {
    return JSON.parse(rawBody) as unknown;
  } catch {
    return rawBody;
  }
}

function toRefundIdempotencyKey(orderId: string, reason: string) {
  const normalizedReason = reason.trim().toLowerCase();
  const reasonFingerprint = createHash("sha256").update(normalizedReason).digest("hex").slice(0, 16);
  return `cancel:${orderId}:${reasonFingerprint}`;
}

function toLoyaltyIdempotencyKey(orderId: string, action: string) {
  return `order:${orderId}:loyalty:${action}`;
}

function parsePersistedRefundSnapshot(payload: unknown | undefined) {
  if (payload === undefined) {
    return undefined;
  }

  const parsed = paymentsRefundResponseSchema.safeParse(payload);
  return parsed.success ? parsed.data : undefined;
}

function resolveRequestUserId(context: RequestUserContext | undefined) {
  if (context?.error) {
    return context.error;
  }

  return context?.userId ?? buildMissingRequestUserContextError();
}

async function fetchStoreConfig(deps: OrderServiceDeps, locationId: string): Promise<StoreConfigLookupResult> {
  let storeConfigResponse: Response;
  try {
    const storeConfigUrl = new URL("/v1/store/config", deps.catalogBaseUrl);
    storeConfigUrl.searchParams.set("locationId", locationId);
    storeConfigResponse = await fetch(storeConfigUrl.toString(), {
      headers: {
        "content-type": "application/json"
      }
    });
  } catch (error) {
    deps.logger.warn({ error }, "catalog store config request failed before response");
    return buildStoreConfigUnavailableError();
  }

  const parsedBody = parseJsonSafely(await storeConfigResponse.text());
  if (!storeConfigResponse.ok) {
    return buildStoreConfigUnavailableError({
      upstreamStatus: storeConfigResponse.status,
      upstreamBody: parsedBody
    });
  }

  const parsedStoreConfig = storeConfigResponseSchema.safeParse(parsedBody);
  if (!parsedStoreConfig.success) {
    return buildStoreConfigUnavailableError({
      upstreamBody: parsedBody,
      validation: parsedStoreConfig.error.flatten()
    });
  }

  return parsedStoreConfig.data;
}

async function ensureStoreIsOpen(deps: OrderServiceDeps, locationId: string): Promise<StoreAvailabilityResult> {
  const storeConfig = await fetchStoreConfig(deps, locationId);
  if (isServiceError(storeConfig)) {
    return { error: storeConfig };
  }

  if (!storeConfig.isOpen) {
    return {
      error: buildStoreClosedError(storeConfig)
    };
  }

  return { storeConfig };
}

async function applyLoyaltyMutation(params: {
  requestId: string;
  deps: OrderServiceDeps;
  mutation: z.output<typeof loyaltyMutationRequestSchema>;
  failureCode: string;
  failureMessage: string;
}) {
  const { requestId, deps, mutation, failureCode, failureMessage } = params;
  const headers: Record<string, string> = {
    "content-type": "application/json",
    "x-request-id": requestId
  };
  if (deps.loyaltyInternalToken) {
    headers["x-internal-token"] = deps.loyaltyInternalToken;
  }

  let loyaltyResponse: Response;
  try {
    loyaltyResponse = await fetch(`${deps.loyaltyBaseUrl}/v1/loyalty/internal/ledger/apply`, {
      method: "POST",
      headers,
      body: JSON.stringify(mutation)
    });
  } catch (error) {
    deps.logger.warn(
      {
        error,
        requestId,
        orderId: mutation.orderId,
        userId: mutation.userId,
        locationId: mutation.locationId,
        mutationType: mutation.type
      },
      "loyalty service request failed before response"
    );
    return buildServiceError({
      statusCode: 502,
      code: failureCode,
      message: failureMessage
    });
  }

  const parsedLoyaltyBody = parseJsonSafely(await loyaltyResponse.text());
  if (!loyaltyResponse.ok) {
    return buildServiceError({
      statusCode: 502,
      code: failureCode,
      message: `${failureMessage} (status ${loyaltyResponse.status})`,
      details: {
        upstreamStatus: loyaltyResponse.status,
        upstreamBody: parsedLoyaltyBody
      }
    });
  }

  const parsedLoyaltyMutation = loyaltyMutationResponseSchema.safeParse(parsedLoyaltyBody);
  if (!parsedLoyaltyMutation.success) {
    return buildServiceError({
      statusCode: 502,
      code: "LOYALTY_INVALID_RESPONSE",
      message: "Loyalty service returned an invalid mutation response",
      details: parsedLoyaltyMutation.error.flatten()
    });
  }

  return parsedLoyaltyMutation.data;
}

async function sendOrderStateNotification(params: {
  requestId: string;
  deps: OrderServiceDeps;
  userId: string;
  order: Order;
  timelineEntry?: z.output<typeof orderTimelineEntrySchema>;
}) {
  const { requestId, deps, userId, order } = params;
  const latestTimelineEntry = params.timelineEntry ?? order.timeline[order.timeline.length - 1];
  const payload = orderStateNotificationSchema.parse({
    userId,
    orderId: order.id,
    status: latestTimelineEntry?.status ?? order.status,
    pickupCode: order.pickupCode,
    locationId: order.locationId,
    occurredAt: latestTimelineEntry?.occurredAt ?? new Date().toISOString(),
    note: latestTimelineEntry?.note
  });

  if (deps.eventBusPublisher) {
    const event: OrderEvent = {
      userId,
      order
    };
    try {
      await publishOrderEvent(deps.eventBusPublisher, event);
    } catch (error) {
      deps.logger.warn(
        { error, orderId: order.id, status: order.status, userId, requestId },
        "event bus unavailable while publishing order-state event"
      );
    }
  }

  const headers: Record<string, string> = {
    "content-type": "application/json",
    "x-request-id": requestId
  };
  if (deps.notificationsInternalToken) {
    headers["x-internal-token"] = deps.notificationsInternalToken;
  }

  let response: Response;
  try {
    response = await fetch(`${deps.notificationsBaseUrl}/v1/notifications/internal/order-state`, {
      method: "POST",
      headers,
      body: JSON.stringify(payload)
    });
  } catch (error) {
    deps.logger.warn(
      { error, orderId: order.id, status: order.status, userId, requestId },
      "notifications service unavailable while dispatching order-state event"
    );
    return;
  }

  const parsedBody = parseJsonSafely(await response.text());
  if (!response.ok) {
    deps.logger.warn(
      {
        orderId: order.id,
        status: order.status,
        userId,
        requestId,
        upstreamStatus: response.status,
        upstreamBody: parsedBody
      },
      "notifications service rejected order-state event"
    );
    return;
  }

  const parsedDispatch = orderStateDispatchResponseSchema.safeParse(parsedBody);
  if (!parsedDispatch.success) {
    deps.logger.warn(
      {
        orderId: order.id,
        status: order.status,
        userId,
        requestId,
        upstreamBody: parsedBody,
        details: parsedDispatch.error.flatten()
      },
      "notifications service returned invalid order-state response"
    );
  }
}

async function sendOrderStateNotifications(params: {
  requestId: string;
  deps: OrderServiceDeps;
  userId: string;
  order: Order;
  timelineEntries: Array<z.output<typeof orderTimelineEntrySchema>>;
}) {
  for (const timelineEntry of params.timelineEntries) {
    await sendOrderStateNotification({
      requestId: params.requestId,
      deps: params.deps,
      userId: params.userId,
      order: params.order,
      timelineEntry
    });
  }
}

async function resolveStoredOrderUserId(params: {
  orderId: string;
  repository: OrdersRepository;
}) {
  const { orderId, repository } = params;
  const existingUserId = await repository.getOrderUserId(orderId);
  if (existingUserId) {
    return existingUserId;
  }

  return buildMissingOrderUserContextError(orderId);
}

async function resolveOrderUserId(params: {
  orderId: string;
  requestUserContext?: RequestUserContext;
  repository: OrdersRepository;
}) {
  const { orderId, repository, requestUserContext } = params;
  const existingUserId = await repository.getOrderUserId(orderId);
  if (existingUserId) {
    return existingUserId;
  }

  if (requestUserContext?.error) {
    return requestUserContext.error;
  }

  if (!requestUserContext?.userId) {
    return buildMissingOrderUserContextError(orderId);
  }

  await repository.setOrderUserId(orderId, requestUserContext.userId);
  return requestUserContext.userId;
}

function buildQuoteHash(input: {
  locationId: string;
  items: Array<{
    itemId: string;
    quantity: number;
    unitPriceCents: number;
    lineTotalCents?: number;
    customization?: {
      notes: string;
      selectedOptions: Array<{
        groupId: string;
        optionId: string;
      }>;
    };
  }>;
  pointsToRedeem: number;
  subtotalCents: number;
  discountCents: number;
  taxCents: number;
  totalCents: number;
}) {
  const sortedItems = [...input.items].sort((left, right) => {
    const leftKey = `${left.itemId}:${left.quantity}:${left.unitPriceCents}:${JSON.stringify(left.customization ?? {})}`;
    const rightKey = `${right.itemId}:${right.quantity}:${right.unitPriceCents}:${JSON.stringify(
      right.customization ?? {}
    )}`;
    return leftKey.localeCompare(rightKey);
  });
  const hashPayload = JSON.stringify({
    locationId: input.locationId,
    pointsToRedeem: input.pointsToRedeem,
    subtotalCents: input.subtotalCents,
    discountCents: input.discountCents,
    taxCents: input.taxCents,
    totalCents: input.totalCents,
    items: sortedItems
  });

  return createHash("sha256").update(hashPayload).digest("hex");
}

class QuotePreparationError extends Error {
  readonly statusCode: number;
  readonly code: string;
  readonly details?: Record<string, unknown>;

  constructor(input: {
    statusCode: number;
    code: string;
    message: string;
    details?: Record<string, unknown>;
  }) {
    super(input.message);
    this.name = "QuotePreparationError";
    this.statusCode = input.statusCode;
    this.code = input.code;
    this.details = input.details;
  }
}

function flattenCustomizationSnapshots(groupSelections: CustomizationGroupSelectionSnapshot[]) {
  return groupSelections.flatMap((group) =>
    group.selectedOptions.map((option) => ({
      groupId: group.groupId,
      groupLabel: group.groupLabel,
      optionId: option.optionId,
      optionLabel: option.optionLabel,
      priceDeltaCents: option.priceDeltaCents
    }))
  );
}

function buildQuotedItem(item: QuoteRequest["items"][number], catalogItem: QuoteCatalogItem) {
  const priced = priceMenuItemCustomization({
    basePriceCents: catalogItem.basePriceCents,
    quantity: item.quantity,
    groups: catalogItem.customizationGroups,
    selection: item.customization
  });

  if (!priced.valid) {
    throw new QuotePreparationError({
      statusCode: 400,
      code: "INVALID_CUSTOMIZATION",
      message: `Customization for "${catalogItem.itemName}" is invalid.`,
      details: {
        itemId: item.itemId,
        issues: priced.issues
      }
    });
  }

  return {
    itemId: item.itemId,
    itemName: catalogItem.itemName,
    quantity: item.quantity,
    unitPriceCents: priced.unitPriceCents,
    lineTotalCents: priced.lineTotalCents,
    customization: {
      notes: priced.input.notes,
      selectedOptions: flattenCustomizationSnapshots(priced.groupSelections)
    }
  };
}

async function buildQuote(input: QuoteRequest, repository: OrdersRepository): Promise<OrderQuote> {
  const uniqueItemIds = [...new Set(input.items.map((item) => item.itemId))];
  const catalogItems = await repository.getCatalogItemsForQuote(input.locationId, uniqueItemIds);
  const quotedItems = input.items.map((item) => {
    const catalogItem = catalogItems.get(item.itemId);
    if (!catalogItem) {
      throw new QuotePreparationError({
        statusCode: 404,
        code: "MENU_ITEM_NOT_FOUND",
        message: `Menu item "${item.itemId}" is unavailable for quoting.`,
        details: {
          itemId: item.itemId,
          locationId: input.locationId
        }
      });
    }

    return buildQuotedItem(item, catalogItem);
  });

  const subtotalCents = quotedItems.reduce((sum, item) => sum + item.unitPriceCents * item.quantity, 0);
  const appliedPoints = Math.min(input.pointsToRedeem, subtotalCents);
  const taxBaseCents = subtotalCents - appliedPoints;
  const taxRateBasisPoints = await repository.getTaxRateBasisPoints(input.locationId);
  const taxCents = Math.round((taxBaseCents * taxRateBasisPoints) / 10_000);
  const totalCents = taxBaseCents + taxCents;

  return orderQuoteSchema.parse({
    quoteId: randomUUID(),
    locationId: input.locationId,
    items: quotedItems,
    subtotal: { currency: "USD", amountCents: subtotalCents },
    discount: { currency: "USD", amountCents: appliedPoints },
    tax: { currency: "USD", amountCents: taxCents },
    total: { currency: "USD", amountCents: totalCents },
    pointsToRedeem: appliedPoints,
    quoteHash: buildQuoteHash({
      locationId: input.locationId,
      items: quotedItems,
      pointsToRedeem: appliedPoints,
      subtotalCents,
      discountCents: appliedPoints,
      taxCents,
      totalCents
    })
  });
}

function buildPickupCode(seed: string) {
  return createHash("sha256").update(seed).digest("hex").slice(0, 6).toUpperCase();
}

function createOrderFromQuote(quote: OrderQuote): Order {
  const orderId = randomUUID();

  return orderSchema.parse({
    id: orderId,
    locationId: quote.locationId,
    status: "PENDING_PAYMENT",
    items: quote.items,
    total: quote.total,
    pickupCode: buildPickupCode(orderId),
    timeline: [
      createOrderTimelineEntry({
        status: "PENDING_PAYMENT",
        note: "Order created from quote",
        source: "customer"
      })
    ]
  });
}

async function reconcilePersistedOrderFulfillmentState(params: {
  order: Order;
  requestId: string;
  deps: OrderServiceDeps;
}) {
  const { order, requestId, deps } = params;
  const fulfillmentConfig = await deps.getFulfillmentConfig(order.locationId);

  const reconciliation = reconcileOrderFulfillmentState(order, {
    now: new Date(),
    fulfillment: fulfillmentConfig
  });
  if (!reconciliation.changed) {
    return order;
  }

  const reconciledOrder = await deps.repository.updateOrder(order.id, reconciliation.order);
  const appliedTimelineEntries = reconciledOrder.timeline.slice(-reconciliation.appendedStatuses.length);
  const orderUserId = await resolveStoredOrderUserId({ orderId: order.id, repository: deps.repository });
  if (isServiceError(orderUserId)) {
    deps.logger.warn(
      {
        orderId: order.id,
        requestId,
        errorCode: orderUserId.code
      },
      "skipping order-state notifications because order user context is missing"
    );
    return reconciledOrder;
  }
  await sendOrderStateNotifications({
    requestId,
    deps,
    userId: orderUserId,
    order: reconciledOrder,
    timelineEntries: appliedTimelineEntries
  });
  deps.logger.info(
    {
      orderId: order.id,
      fromStatus: order.status,
      toStatus: reconciledOrder.status,
      fulfillmentMode: fulfillmentConfig.mode,
      appendedStatuses: reconciliation.appendedStatuses,
      requestId
    },
    "reconciled configured fulfillment state on order read"
  );
  return reconciledOrder;
}

async function findActiveOrderForUser(params: {
  userId: string;
  requestId: string;
  deps: OrderServiceDeps;
}) {
  const orders = await params.deps.repository.listOrdersByUser(params.userId);

  for (const order of orders) {
    const reconciledOrder = await reconcilePersistedOrderFulfillmentState({
      order,
      requestId: params.requestId,
      deps: params.deps
    });

    if (!isTerminalOrderStatus(reconciledOrder.status)) {
      return reconciledOrder;
    }
  }

  return undefined;
}

async function requestSuccessfulRefund(params: {
  orderId: string;
  reason: string;
  order: Order;
  paymentId: string;
  requestId: string;
  deps: OrderServiceDeps;
}): Promise<RefundRequestResult> {
  const refundPayload = paymentsRefundRequestSchema.parse({
    orderId: params.orderId,
    paymentId: params.paymentId,
    amountCents: params.order.total.amountCents,
    currency: params.order.total.currency,
    reason: params.reason,
    idempotencyKey: toRefundIdempotencyKey(params.orderId, params.reason),
    locationId: params.order.locationId
  });
  const headers: Record<string, string> = {
    "content-type": "application/json",
    "x-request-id": params.requestId
  };
  if (params.deps.paymentsInternalToken) {
    headers["x-internal-token"] = params.deps.paymentsInternalToken;
  }

  let refundResponse: Response;
  try {
    refundResponse = await fetch(`${params.deps.paymentsBaseUrl}/v1/payments/refunds`, {
      method: "POST",
      headers,
      body: JSON.stringify(refundPayload)
    });
  } catch (error) {
    params.deps.logger.warn(
      {
        error,
        requestId: params.requestId,
        orderId: params.orderId,
        paymentId: params.paymentId
      },
      "payments refund request failed before response"
    );
    return {
      error: buildServiceError({
        statusCode: 502,
        code: "PAYMENTS_UNAVAILABLE",
        message: "Payments service is unavailable"
      })
    };
  }

  const parsedRefundBody = parseJsonSafely(await refundResponse.text());
  if (!refundResponse.ok) {
    return {
      error: buildServiceError({
        statusCode: 502,
        code: "REFUND_REQUEST_FAILED",
        message: `Payments refund request failed with status ${refundResponse.status}`,
        details: { upstreamBody: parsedRefundBody }
      })
    };
  }

  const parsedRefund = paymentsRefundResponseSchema.safeParse(parsedRefundBody);
  if (!parsedRefund.success) {
    return {
      error: buildServiceError({
        statusCode: 502,
        code: "PAYMENTS_INVALID_RESPONSE",
        message: "Payments service returned an invalid refund response",
        details: parsedRefund.error.flatten()
      })
    };
  }

  if (parsedRefund.data.status === "REJECTED") {
    return {
      error: buildServiceError({
        statusCode: 409,
        code: "REFUND_REJECTED",
        message: parsedRefund.data.message ?? "Clover rejected the refund",
        details: {
          paymentId: parsedRefund.data.paymentId,
          refundId: parsedRefund.data.refundId,
          provider: parsedRefund.data.provider
        }
      }),
      snapshot: parsedRefund.data
    };
  }

  return { response: parsedRefund.data };
}

export async function createQuote(params: {
  input: QuoteRequest;
  deps: OrderServiceDeps;
}): Promise<{ quote: OrderQuote } | { error: ServiceError }> {
  try {
    const storeAvailability = await ensureStoreIsOpen(params.deps, params.input.locationId);
    if ("error" in storeAvailability) {
      return storeAvailability;
    }

    const quote = await buildQuote(params.input, params.deps.repository);
    return { quote };
  } catch (error) {
    if (error instanceof QuotePreparationError) {
      return {
        error: buildServiceError({
          statusCode: error.statusCode,
          code: error.code,
          message: error.message,
          details: error.details
        })
      };
    }

    throw error;
  }
}

export async function createOrder(params: {
  input: CreateOrderRequest;
  requestId: string;
  requestUserContext?: RequestUserContext;
  deps: OrderServiceDeps;
}): Promise<{ order: Order } | { error: ServiceError }> {
  const { input, requestId, requestUserContext, deps } = params;
  const quote = await deps.repository.getQuote(input.quoteId);

  if (!quote) {
    return {
      error: buildServiceError({
        statusCode: 404,
        code: "QUOTE_NOT_FOUND",
        message: "Quote not found",
        details: { quoteId: input.quoteId }
      })
    };
  }

  if (quote.quoteHash !== input.quoteHash) {
    return {
      error: buildServiceError({
        statusCode: 409,
        code: "QUOTE_HASH_MISMATCH",
        message: "Quote hash does not match current quote",
        details: { quoteId: input.quoteId }
      })
    };
  }

  const requestUserId = resolveRequestUserId(requestUserContext);
  if (isServiceError(requestUserId)) {
    return { error: requestUserId };
  }

  const existingOrder = await deps.repository.getOrderForCreateIdempotency(input.quoteId, input.quoteHash);
  if (existingOrder) {
    return { order: existingOrder };
  }

  const activeOrder = await findActiveOrderForUser({
    userId: requestUserId,
    requestId,
    deps
  });
  if (activeOrder) {
    if (activeOrder.status === "PENDING_PAYMENT") {
      // The customer started a checkout but never completed payment (e.g. app was
      // force-closed). Silently cancel the stale record so they can check out again.
      // No notification is sent — the order was never confirmed to the customer.
      const staleCancellation = transitionOrderStatus(activeOrder, "CANCELED", {
        note: "Superseded by a new checkout attempt.",
        source: "customer"
      });
      await deps.repository.updateOrder(activeOrder.id, staleCancellation.order);
    } else {
      return {
        error: buildActiveOrderExistsError(activeOrder)
      };
    }
  }

  const storeAvailability = await ensureStoreIsOpen(deps, quote.locationId);
  if ("error" in storeAvailability) {
    return storeAvailability;
  }

  const order = createOrderFromQuote(quote);
  await deps.repository.createOrder({
    order,
    quoteId: quote.quoteId,
    userId: requestUserId
  });
  await deps.repository.saveCreateOrderIdempotency(input.quoteId, input.quoteHash, order.id);
  await sendOrderStateNotification({
    requestId,
    deps,
    userId: requestUserId,
    order
  });

  return { order };
}

export async function listOrdersForRead(params: {
  requestId: string;
  requestUserId?: string;
  locationId?: string;
  deps: OrderServiceDeps;
}): Promise<{ orders: Order[] }> {
  const orders = params.locationId
    ? await params.deps.repository.listOrdersByLocation(params.locationId)
    : params.requestUserId
      ? await params.deps.repository.listOrdersByUser(params.requestUserId)
      : await params.deps.repository.listOrders();

  const reconciledOrders = await Promise.all(
    orders.map((order) =>
      reconcilePersistedOrderFulfillmentState({
        order,
        requestId: params.requestId,
        deps: params.deps
      })
    )
  );

  const hydratedOrders = await hydrateOrderCustomers({
    orders: reconciledOrders,
    deps: params.deps
  });

  return { orders: z.array(orderSchema).parse(hydratedOrders) };
}

export async function getOrderForRead(params: {
  orderId: string;
  locationId?: string;
  requestId: string;
  deps: OrderServiceDeps;
}): Promise<{ order: Order } | { error: ServiceError }> {
  const order = await params.deps.repository.getOrder(params.orderId);

  if (!order) {
    return {
      error: buildServiceError({
        statusCode: 404,
        code: "ORDER_NOT_FOUND",
        message: "Order not found",
        details: { orderId: params.orderId }
      })
    };
  }

  if (params.locationId && order.locationId !== params.locationId) {
    return {
      error: buildServiceError({
        statusCode: 404,
        code: "ORDER_NOT_FOUND",
        message: "Order not found",
        details: { orderId: params.orderId, locationId: params.locationId }
      })
    };
  }

  const reconciledOrder = await reconcilePersistedOrderFulfillmentState({
    order,
    requestId: params.requestId,
    deps: params.deps
  });
  const hydratedOrder = await hydrateOrderCustomer({
    order: reconciledOrder,
    deps: params.deps
  });
  return { order: orderSchema.parse(hydratedOrder) };
}

export async function cancelOrder(params: {
  orderId: string;
  input: { reason: string };
  cancelSource: CancelOrderSource;
  locationId?: string;
  requestId: string;
  requestUserContext?: RequestUserContext;
  deps: OrderServiceDeps;
}): Promise<{ order: Order } | { error: ServiceError }> {
  const { orderId, input, cancelSource, locationId, requestId, requestUserContext, deps } = params;
  const existingOrder = await deps.repository.getOrder(orderId);

  if (!existingOrder) {
    return {
      error: buildServiceError({
        statusCode: 404,
        code: "ORDER_NOT_FOUND",
        message: "Order not found",
        details: { orderId }
      })
    };
  }

  if (locationId && existingOrder.locationId !== locationId) {
    return {
      error: buildServiceError({
        statusCode: 404,
        code: "ORDER_NOT_FOUND",
        message: "Order not found",
        details: { orderId, locationId }
      })
    };
  }

  if (existingOrder.status === "COMPLETED") {
    return {
      error: buildServiceError({
        statusCode: 409,
        code: "ORDER_NOT_CANCELABLE",
        message: "Completed orders cannot be canceled",
        details: { orderId, status: existingOrder.status }
      })
    };
  }

  if (existingOrder.status === "CANCELED") {
    return { order: existingOrder };
  }

  const fulfillmentConfig = await deps.getFulfillmentConfig(existingOrder.locationId);
  if (cancelSource === "staff" && existingOrder.status !== "PENDING_PAYMENT" && fulfillmentConfig.mode !== "staff") {
    return {
      error: buildServiceError({
        statusCode: 409,
        code: "STAFF_FULFILLMENT_DISABLED",
        message: "Staff-driven order status changes are only allowed when fulfillment mode is staff",
        details: {
          fulfillmentMode: fulfillmentConfig.mode
        }
      })
    };
  }

  const cancelActorLabel = cancelSource === "staff" ? "staff" : cancelSource === "system" ? "system" : "customer";
  let refundNote = "";

  if (existingOrder.status !== "PENDING_PAYMENT") {
    const paymentId = await deps.repository.getPaymentId(orderId);
    if (!paymentId) {
      return {
        error: buildServiceError({
          statusCode: 409,
          code: "REFUND_REFERENCE_MISSING",
          message: "Unable to locate payment reference for refund",
          details: { orderId }
        })
      };
    }

    const orderQuote = await deps.repository.getOrderQuote(orderId);
    if (!orderQuote) {
      return {
        error: buildServiceError({
          statusCode: 409,
          code: "ORDER_CONTEXT_MISSING",
          message: "Order quote context is missing",
          details: { orderId }
        })
      };
    }

    const orderUserId = await resolveOrderUserId({
      orderId,
      requestUserContext,
      repository: deps.repository
    });
    if (isServiceError(orderUserId)) {
      return { error: orderUserId };
    }

  const persistedRefund = await deps.repository.getSuccessfulRefund(orderId);
    let successfulRefund: PaymentsRefundResponse | undefined;
    const parsedPersistedRefund = parsePersistedRefundSnapshot(persistedRefund);
    if (parsedPersistedRefund?.status === "REFUNDED") {
      successfulRefund = parsedPersistedRefund;
    }

    if (!successfulRefund) {
      const requestedRefund = await requestSuccessfulRefund({
        orderId,
        reason: input.reason,
        order: existingOrder,
        paymentId,
        requestId,
        deps
      });
      if ("error" in requestedRefund) {
        if (requestedRefund.snapshot) {
          await deps.repository.setSuccessfulRefund(orderId, requestedRefund.snapshot);
        }

        return { error: requestedRefund.error };
      }

      successfulRefund = requestedRefund.response;
      await deps.repository.setSuccessfulRefund(orderId, requestedRefund.response);
    }

    const reverseEarnMutation = loyaltyMutationRequestSchema.parse({
      type: "ADJUSTMENT",
      userId: orderUserId,
      locationId: existingOrder.locationId,
      orderId,
      points: -existingOrder.total.amountCents,
      idempotencyKey: toLoyaltyIdempotencyKey(orderId, "reverse-earn")
    });
    const reverseEarnResult = await applyLoyaltyMutation({
      requestId,
      deps,
      mutation: reverseEarnMutation,
      failureCode: "LOYALTY_REVERSAL_FAILED",
      failureMessage: "Loyalty earn reversal failed"
    });
    if (isServiceError(reverseEarnResult)) {
      return { error: reverseEarnResult };
    }

    if (orderQuote.pointsToRedeem > 0) {
      const refundRedeemMutation = loyaltyMutationRequestSchema.parse({
        type: "REFUND",
        userId: orderUserId,
        locationId: existingOrder.locationId,
        orderId,
        amountCents: orderQuote.pointsToRedeem,
        idempotencyKey: toLoyaltyIdempotencyKey(orderId, "refund-redeem")
      });
      const refundRedeemResult = await applyLoyaltyMutation({
        requestId,
        deps,
        mutation: refundRedeemMutation,
        failureCode: "LOYALTY_REVERSAL_FAILED",
        failureMessage: "Loyalty redeem refund failed"
      });
      if (isServiceError(refundRedeemResult)) {
        return { error: refundRedeemResult };
      }
    }

    const loyaltyReversalParts = [
      `reversed ${existingOrder.total.amountCents} earned points`,
      orderQuote.pointsToRedeem > 0 ? `refunded ${orderQuote.pointsToRedeem} redeemed points` : undefined
    ].filter((value): value is string => Boolean(value));

    refundNote = ` Refund submitted: ${successfulRefund.refundId}. Loyalty updated: ${loyaltyReversalParts.join(
      "; "
    )}.`;
  }

  const canceledTransition = transitionOrderStatus(existingOrder, "CANCELED", {
    note: `Canceled by ${cancelActorLabel}: ${input.reason}.${refundNote}`,
    source: cancelSource
  });
  await deps.repository.updateOrder(orderId, canceledTransition.order);

  const notificationUserId = await resolveOrderUserId({
    orderId,
    requestUserContext,
    repository: deps.repository
  });
  if (isServiceError(notificationUserId)) {
    if ((cancelSource === "staff" || cancelSource === "system") && notificationUserId.code === "ORDER_USER_CONTEXT_MISSING") {
      deps.logger.warn(
        {
          orderId,
          requestId,
          cancelSource
        },
        "skipping cancellation notification because order user context is missing"
      );
      return { order: canceledTransition.order };
    }

    return { error: notificationUserId };
  }

  await sendOrderStateNotification({
    requestId,
    deps,
    userId: notificationUserId,
    order: canceledTransition.order,
    timelineEntry: canceledTransition.appliedTransitions[0]?.timelineEntry
  });

  return { order: canceledTransition.order };
}

export async function reconcilePaymentWebhook(params: {
  input: OrdersPaymentReconciliationInput;
  requestId: string;
  deps: OrderServiceDeps;
}): Promise<{ result: OrdersPaymentReconciliationResult } | { error: ServiceError }> {
  const { input, requestId, deps } = params;
  const existingOrder = await deps.repository.getOrder(input.orderId);
  if (!existingOrder) {
    return {
      error: buildServiceError({
        statusCode: 404,
        code: "ORDER_NOT_FOUND",
        message: "Order not found",
        details: { orderId: input.orderId }
      })
    };
  }

  await deps.repository.setPaymentId(input.orderId, input.paymentId);

  if (input.kind === "CHARGE") {
    const chargeSnapshot = paymentsChargeResponseSchema.parse({
      paymentId: input.paymentId,
      provider: input.provider,
      orderId: input.orderId,
      status: input.status,
      approved: input.status === "SUCCEEDED",
      amountCents: input.amountCents ?? existingOrder.total.amountCents,
      currency: input.currency ?? existingOrder.total.currency,
      occurredAt: input.occurredAt,
      declineCode: input.declineCode,
      message: input.message
    });
    await deps.repository.setSuccessfulCharge(input.orderId, chargeSnapshot);

    if (input.status !== "SUCCEEDED") {
      return {
        result: ordersPaymentReconciliationResultSchema.parse({
          accepted: true,
          applied: false,
          orderStatus: existingOrder.status,
          note: `Charge status ${input.status} does not transition order state`
        })
      };
    }

    if (existingOrder.status !== "PENDING_PAYMENT") {
      return {
        result: ordersPaymentReconciliationResultSchema.parse({
          accepted: true,
          applied: false,
          orderStatus: existingOrder.status,
          note: "Order is already settled for payment reconciliation"
        })
      };
    }

    const orderQuote = await deps.repository.getOrderQuote(input.orderId);
    if (!orderQuote) {
      return {
        error: buildServiceError({
          statusCode: 409,
          code: "ORDER_CONTEXT_MISSING",
          message: "Order quote context is missing",
          details: { orderId: input.orderId }
        })
      };
    }

    const orderUserId = await resolveStoredOrderUserId({ orderId: input.orderId, repository: deps.repository });
    if (isServiceError(orderUserId)) {
      return { error: orderUserId };
    }
    if (orderQuote.pointsToRedeem > 0) {
      const redeemMutation = loyaltyMutationRequestSchema.parse({
        type: "REDEEM",
        userId: orderUserId,
        locationId: existingOrder.locationId,
        orderId: input.orderId,
        amountCents: orderQuote.pointsToRedeem,
        idempotencyKey: toLoyaltyIdempotencyKey(input.orderId, "redeem")
      });
      const redeemResult = await applyLoyaltyMutation({
        requestId,
        deps,
        mutation: redeemMutation,
        failureCode: "LOYALTY_REDEEM_FAILED",
        failureMessage: "Loyalty redeem mutation failed"
      });
      if (isServiceError(redeemResult)) {
        return { error: redeemResult };
      }
    }

    const earnMutation = loyaltyMutationRequestSchema.parse({
      type: "EARN",
      userId: orderUserId,
      locationId: existingOrder.locationId,
      orderId: input.orderId,
      amountCents: existingOrder.total.amountCents,
      idempotencyKey: toLoyaltyIdempotencyKey(input.orderId, "earn")
    });
    const earnResult = await applyLoyaltyMutation({
      requestId,
      deps,
      mutation: earnMutation,
      failureCode: "LOYALTY_EARN_FAILED",
      failureMessage: "Loyalty earn mutation failed"
    });
    if (isServiceError(earnResult)) {
      return { error: earnResult };
    }

    const loyaltyParts = [
      orderQuote.pointsToRedeem > 0 ? `redeemed ${orderQuote.pointsToRedeem} loyalty points` : undefined,
      `Earned ${existingOrder.total.amountCents} loyalty points`
    ].filter((value): value is string => Boolean(value));
    const paidTransition = transitionOrderStatus(existingOrder, "PAID", {
      note: `${loyaltyParts.join("; ")}.`,
      source: "webhook"
    });
    await deps.repository.updateOrder(input.orderId, paidTransition.order);
    await sendOrderStateNotifications({
      requestId,
      deps,
      userId: orderUserId,
      order: paidTransition.order,
      timelineEntries: paidTransition.appliedTransitions.map((transition) => transition.timelineEntry)
    });

    return {
      result: ordersPaymentReconciliationResultSchema.parse({
        accepted: true,
        applied: true,
        orderStatus: paidTransition.order.status
      })
    };
  }

  const existingPersistedRefund = await deps.repository.getSuccessfulRefund(input.orderId);
  const parsedPersistedRefund =
    existingPersistedRefund === undefined ? undefined : paymentsRefundResponseSchema.safeParse(existingPersistedRefund);
  const refundIdFromStore = parsedPersistedRefund?.success ? parsedPersistedRefund.data.refundId : undefined;
  const refundSnapshot = paymentsRefundResponseSchema.parse({
    refundId: input.refundId ?? refundIdFromStore ?? randomUUID(),
    provider: input.provider,
    orderId: input.orderId,
    paymentId: input.paymentId,
    status: input.status,
    amountCents: input.amountCents ?? existingOrder.total.amountCents,
    currency: input.currency ?? existingOrder.total.currency,
    occurredAt: input.occurredAt,
    message: input.message
  });
  await deps.repository.setSuccessfulRefund(input.orderId, refundSnapshot);

  if (input.status !== "REFUNDED") {
    return {
      result: ordersPaymentReconciliationResultSchema.parse({
        accepted: true,
        applied: false,
        orderStatus: existingOrder.status,
        note: `Refund status ${input.status} does not transition order state`
      })
    };
  }

  if (existingOrder.status === "PENDING_PAYMENT") {
    return {
      result: ordersPaymentReconciliationResultSchema.parse({
        accepted: true,
        applied: false,
        orderStatus: existingOrder.status,
        note: "Order is not in a refund-eligible state"
      })
    };
  }

  if (existingOrder.status === "CANCELED") {
    return {
      result: ordersPaymentReconciliationResultSchema.parse({
        accepted: true,
        applied: false,
        orderStatus: existingOrder.status,
        note: "Order is already canceled"
      })
    };
  }

  if (existingOrder.status === "COMPLETED") {
    return {
      result: ordersPaymentReconciliationResultSchema.parse({
        accepted: true,
        applied: false,
        orderStatus: existingOrder.status,
        note: "Completed orders require manual refund review and do not auto-transition"
      })
    };
  }

  const orderQuote = await deps.repository.getOrderQuote(input.orderId);
  if (!orderQuote) {
    return {
      error: buildServiceError({
        statusCode: 409,
        code: "ORDER_CONTEXT_MISSING",
        message: "Order quote context is missing",
        details: { orderId: input.orderId }
      })
    };
  }

  const orderUserId = await resolveStoredOrderUserId({ orderId: input.orderId, repository: deps.repository });
  if (isServiceError(orderUserId)) {
    return { error: orderUserId };
  }
  const reverseEarnMutation = loyaltyMutationRequestSchema.parse({
    type: "ADJUSTMENT",
    userId: orderUserId,
    locationId: existingOrder.locationId,
    orderId: input.orderId,
    points: -existingOrder.total.amountCents,
    idempotencyKey: toLoyaltyIdempotencyKey(input.orderId, "reverse-earn")
  });
  const reverseEarnResult = await applyLoyaltyMutation({
    requestId,
    deps,
    mutation: reverseEarnMutation,
    failureCode: "LOYALTY_REVERSAL_FAILED",
    failureMessage: "Loyalty earn reversal failed"
  });
  if (isServiceError(reverseEarnResult)) {
    return { error: reverseEarnResult };
  }

  if (orderQuote.pointsToRedeem > 0) {
    const refundRedeemMutation = loyaltyMutationRequestSchema.parse({
      type: "REFUND",
      userId: orderUserId,
      locationId: existingOrder.locationId,
      orderId: input.orderId,
      amountCents: orderQuote.pointsToRedeem,
      idempotencyKey: toLoyaltyIdempotencyKey(input.orderId, "refund-redeem")
    });
    const refundRedeemResult = await applyLoyaltyMutation({
      requestId,
      deps,
      mutation: refundRedeemMutation,
      failureCode: "LOYALTY_REVERSAL_FAILED",
      failureMessage: "Loyalty redeem refund failed"
    });
    if (isServiceError(refundRedeemResult)) {
      return { error: refundRedeemResult };
    }
  }

  const reversalParts = [
    `reversed ${existingOrder.total.amountCents} earned points`,
    orderQuote.pointsToRedeem > 0 ? `refunded ${orderQuote.pointsToRedeem} redeemed points` : undefined
  ].filter((value): value is string => Boolean(value));
  const eventNote = input.eventId ? `event ${input.eventId}` : "webhook event";
  const canceledTransition = transitionOrderStatus(existingOrder, "CANCELED", {
    note: `Refund reconciled from ${input.provider} ${eventNote}; ${reversalParts.join("; ")}.`,
    source: "webhook"
  });
  await deps.repository.updateOrder(input.orderId, canceledTransition.order);
  await sendOrderStateNotification({
    requestId,
    deps,
    userId: orderUserId,
    order: canceledTransition.order,
    timelineEntry: canceledTransition.appliedTransitions[0]?.timelineEntry
  });

  return {
    result: ordersPaymentReconciliationResultSchema.parse({
      accepted: true,
      applied: true,
      orderStatus: canceledTransition.order.status
    })
  };
}

export async function advanceOrderStatus(params: {
  orderId: string;
  input: OrderStatusUpdateInput;
  locationId?: string;
  requestId: string;
  deps: OrderServiceDeps;
}): Promise<{ order: Order } | { error: ServiceError }> {
  const { orderId, input, locationId, requestId, deps } = params;
  const existingOrder = await deps.repository.getOrder(orderId);

  if (!existingOrder) {
    return {
      error: buildServiceError({
        statusCode: 404,
        code: "ORDER_NOT_FOUND",
        message: "Order not found",
        details: { orderId }
      })
    };
  }

  if (locationId && existingOrder.locationId !== locationId) {
    return {
      error: buildServiceError({
        statusCode: 404,
        code: "ORDER_NOT_FOUND",
        message: "Order not found",
        details: { orderId, locationId }
      })
    };
  }

  const fulfillmentConfig = await deps.getFulfillmentConfig(existingOrder.locationId);
  if (fulfillmentConfig.mode !== "staff") {
    return {
      error: buildServiceError({
        statusCode: 409,
        code: "STAFF_FULFILLMENT_DISABLED",
        message: "Staff-driven order status changes are only allowed when fulfillment mode is staff",
        details: {
          fulfillmentMode: fulfillmentConfig.mode
        }
      })
    };
  }

  let transitionResult: ReturnType<typeof transitionOrderStatus>;
  try {
    transitionResult = transitionOrderStatus(existingOrder, input.status, {
      note: input.note,
      source: "staff"
    });
  } catch (error) {
    if (error instanceof OrderTransitionError) {
      return {
        error: buildServiceError({
          statusCode: error.statusCode,
          code: error.code,
          message: error.message,
          details: error.details
        })
      };
    }

    throw error;
  }

  if (!transitionResult.changed) {
    return { order: existingOrder };
  }

  await deps.repository.updateOrder(orderId, transitionResult.order);
  const orderUserId = await resolveStoredOrderUserId({ orderId, repository: deps.repository });
  if (isServiceError(orderUserId)) {
    deps.logger.warn(
      {
        orderId,
        requestId,
        errorCode: orderUserId.code
      },
      "skipping order-state notification because order user context is missing"
    );
    return { order: transitionResult.order };
  }
  await sendOrderStateNotification({
    requestId,
    deps,
    userId: orderUserId,
    order: transitionResult.order,
    timelineEntry: transitionResult.appliedTransitions[0]?.timelineEntry
  });

  return { order: transitionResult.order };
}
