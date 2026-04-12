import { z } from "zod";
import { moneySchema } from "@lattelink/contracts-core";
import { menuItemCustomizationInputSchema } from "@lattelink/contracts-catalog";

export const orderStatusSchema = z.enum([
  "PENDING_PAYMENT",
  "PAID",
  "IN_PREP",
  "READY",
  "COMPLETED",
  "CANCELED"
]);

export const orderItemCustomizationSelectionSnapshotSchema = z.object({
  groupId: z.string(),
  groupLabel: z.string(),
  optionId: z.string(),
  optionLabel: z.string(),
  priceDeltaCents: z.number().int()
});

export const orderItemCustomizationSnapshotSchema = z.object({
  notes: z.string().default(""),
  selectedOptions: z.array(orderItemCustomizationSelectionSnapshotSchema).default([])
});

export const orderItemSchema = z.object({
  itemId: z.string(),
  itemName: z.string().min(1).optional(),
  quantity: z.number().int().positive(),
  unitPriceCents: z.number().int().nonnegative(),
  lineTotalCents: z.number().int().nonnegative().optional(),
  customization: orderItemCustomizationSnapshotSchema.optional()
});

export const orderQuoteSchema = z.object({
  quoteId: z.string().uuid(),
  locationId: z.string(),
  items: z.array(orderItemSchema),
  subtotal: moneySchema,
  discount: moneySchema,
  tax: moneySchema,
  total: moneySchema,
  pointsToRedeem: z.number().int().nonnegative(),
  quoteHash: z.string().min(1)
});

export const orderTimelineEntrySchema = z.object({
  status: orderStatusSchema,
  occurredAt: z.string().datetime(),
  note: z.string().optional(),
  source: z.enum(["system", "staff", "webhook", "customer"]).optional()
});

export const orderSchema = z.object({
  id: z.string().uuid(),
  locationId: z.string(),
  status: orderStatusSchema,
  items: z.array(orderItemSchema),
  total: moneySchema,
  pickupCode: z.string(),
  timeline: z.array(orderTimelineEntrySchema)
});

export const quoteRequestItemSchema = z.object({
  itemId: z.string(),
  quantity: z.number().int().positive(),
  customization: menuItemCustomizationInputSchema.default({
    selectedOptions: [],
    notes: ""
  })
});

export const quoteRequestSchema = z.object({
  locationId: z.string(),
  items: z.array(quoteRequestItemSchema),
  pointsToRedeem: z.number().int().nonnegative().default(0)
});

export const createOrderRequestSchema = z.object({
  quoteId: z.string().uuid(),
  quoteHash: z.string().min(1)
});

export const applePayWalletHeaderSchema = z.object({
  ephemeralPublicKey: z.string().min(1),
  publicKeyHash: z.string().min(1),
  transactionId: z.string().min(1),
  applicationData: z.string().min(1).optional()
});

export const applePayWalletSchema = z.object({
  version: z.string().min(1),
  data: z.string().min(1),
  signature: z.string().min(1),
  header: applePayWalletHeaderSchema
});

export const payOrderRequestSchema = z.object({
  paymentSourceToken: z.string().min(1).optional(),
  applePayToken: z.string().min(1).optional(),
  applePayWallet: applePayWalletSchema.optional(),
  idempotencyKey: z.string().min(1)
}).superRefine((input, context) => {
  const hasPaymentSourceToken = Boolean(input.paymentSourceToken);
  const hasToken = Boolean(input.applePayToken);
  const hasWallet = Boolean(input.applePayWallet);
  const methodCount = [hasPaymentSourceToken, hasToken, hasWallet].filter(Boolean).length;

  if (methodCount === 0) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["paymentSourceToken"],
      message: "Provide exactly one payment method."
    });
  }

  if (methodCount > 1) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["applePayWallet"],
      message: "Provide exactly one payment method."
    });
  }
});

export type OrderStatus = z.output<typeof orderStatusSchema>;
export type OrderItemCustomizationSelectionSnapshot = z.output<typeof orderItemCustomizationSelectionSnapshotSchema>;
export type OrderItemCustomizationSnapshot = z.output<typeof orderItemCustomizationSnapshotSchema>;
export type OrderItem = z.output<typeof orderItemSchema>;
export type OrderQuote = z.output<typeof orderQuoteSchema>;
export type OrderTimelineEntry = z.output<typeof orderTimelineEntrySchema>;
export type Order = z.output<typeof orderSchema>;

export const paymentReconciliationProviderSchema = z.literal("CLOVER");

export const paymentChargeReconciliationSchema = z.object({
  eventId: z.string().min(1).optional(),
  provider: paymentReconciliationProviderSchema,
  kind: z.literal("CHARGE"),
  orderId: z.string().uuid(),
  paymentId: z.string().uuid(),
  status: z.enum(["SUCCEEDED", "DECLINED", "TIMEOUT"]),
  occurredAt: z.string().datetime(),
  message: z.string().optional(),
  declineCode: z.string().optional(),
  amountCents: z.number().int().positive().optional(),
  currency: z.literal("USD").optional()
});

export const paymentRefundReconciliationSchema = z.object({
  eventId: z.string().min(1).optional(),
  provider: paymentReconciliationProviderSchema,
  kind: z.literal("REFUND"),
  orderId: z.string().uuid(),
  paymentId: z.string().uuid(),
  refundId: z.string().uuid().optional(),
  status: z.enum(["REFUNDED", "REJECTED"]),
  occurredAt: z.string().datetime(),
  message: z.string().optional(),
  amountCents: z.number().int().positive().optional(),
  currency: z.literal("USD").optional()
});

export const ordersPaymentReconciliationSchema = z.union([
  paymentChargeReconciliationSchema,
  paymentRefundReconciliationSchema
]);

export const ordersPaymentReconciliationResultSchema = z.object({
  accepted: z.literal(true),
  applied: z.boolean(),
  orderStatus: orderStatusSchema.optional(),
  note: z.string().optional()
});

export const ordersContract = {
  basePath: "/orders",
  routes: {
    quote: {
      method: "POST",
      path: "/quote",
      request: quoteRequestSchema,
      response: orderQuoteSchema
    },
    create: {
      method: "POST",
      path: "/",
      request: createOrderRequestSchema,
      response: orderSchema
    },
    pay: {
      method: "POST",
      path: "/:orderId/pay",
      request: payOrderRequestSchema,
      response: orderSchema
    },
    list: {
      method: "GET",
      path: "/",
      request: z.undefined(),
      response: z.array(orderSchema)
    },
    get: {
      method: "GET",
      path: "/:orderId",
      request: z.undefined(),
      response: orderSchema
    },
    cancel: {
      method: "POST",
      path: "/:orderId/cancel",
      request: z.object({ reason: z.string().min(1) }),
      response: orderSchema
    }
  }
} as const;
