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

export const discountCodeTypeSchema = z.enum(["percent", "fixed_cents"]);
export const discountCodeEligibilitySchema = z.enum(["everyone", "first_order_only", "existing_customers_only"]);
export const discountRedemptionStatusSchema = z.enum(["RESERVED", "REDEEMED", "RELEASED"]);

export const normalizedDiscountCodeSchema = z
  .string()
  .trim()
  .min(3)
  .max(32)
  .regex(/^[A-Za-z0-9_-]+$/)
  .transform((value) => value.toUpperCase());

export const orderDiscountBreakdownSchema = z.object({
  type: z.enum(["discount_code", "loyalty"]),
  code: z.string().optional(),
  label: z.string().min(1),
  amount: moneySchema
});

export const appliedDiscountCodeSchema = z.object({
  discountCodeId: z.string().uuid(),
  code: z.string().min(1),
  name: z.string().min(1),
  discountCents: z.number().int().nonnegative()
});

export const orderQuoteSchema = z.object({
  quoteId: z.string().uuid(),
  locationId: z.string(),
  items: z.array(orderItemSchema),
  subtotal: moneySchema,
  discount: moneySchema,
  discounts: z.array(orderDiscountBreakdownSchema).default([]),
  appliedDiscountCode: appliedDiscountCodeSchema.optional(),
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

export const orderCustomerSchema = z.object({
  name: z.string().min(1).optional(),
  email: z.string().email().optional(),
  phone: z.string().min(1).optional()
});

export const orderSchema = z.object({
  id: z.string().uuid(),
  locationId: z.string(),
  status: orderStatusSchema,
  items: z.array(orderItemSchema),
  total: moneySchema,
  pickupCode: z.string(),
  timeline: z.array(orderTimelineEntrySchema),
  customer: orderCustomerSchema.optional()
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
  pointsToRedeem: z.number().int().nonnegative().default(0),
  discountCode: normalizedDiscountCodeSchema.optional()
});

export const createOrderRequestSchema = z.object({
  quoteId: z.string().uuid(),
  quoteHash: z.string().min(1)
});

export const checkoutDraftStatusSchema = z.enum(["OPEN", "CONVERTED", "EXPIRED"]);

export const checkoutDraftSchema = z.object({
  checkoutId: z.string().uuid(),
  quoteId: z.string().uuid(),
  quoteHash: z.string().min(1),
  locationId: z.string().min(1),
  status: checkoutDraftStatusSchema,
  items: z.array(orderItemSchema),
  total: moneySchema,
  expiresAt: z.string().datetime(),
  orderId: z.string().uuid().optional()
});

export const createCheckoutDraftRequestSchema = createOrderRequestSchema;

const stripeMobileCheckoutReferenceSchema = z.union([
  z.object({ checkoutId: z.string().uuid() }).strict(),
  z.object({ orderId: z.string().uuid() }).strict()
]);

export const stripeMobilePaymentSessionRequestSchema = stripeMobileCheckoutReferenceSchema;

export const stripeMobilePaymentFinalizeRequestSchema = z.union([
  z.object({ checkoutId: z.string().uuid(), paymentIntentId: z.string().min(1) }).strict(),
  z.object({ orderId: z.string().uuid(), paymentIntentId: z.string().min(1) }).strict()
]);

const stripeMobilePaymentSessionBaseSchema = z.object({
  paymentIntentId: z.string().min(1),
  paymentIntentClientSecret: z.string().min(1),
  publishableKey: z.string().min(1),
  stripeAccountId: z.string().min(1),
  merchantDisplayName: z.string().min(1),
  merchantCountryCode: z.literal("US"),
  amountCents: z.number().int().positive(),
  currency: z.literal("USD"),
  applePayEnabled: z.boolean(),
  cardEnabled: z.boolean()
});

export const stripeMobilePaymentSessionResponseSchema = z.union([
  stripeMobilePaymentSessionBaseSchema.extend({ checkoutId: z.string().uuid() }),
  stripeMobilePaymentSessionBaseSchema.extend({ orderId: z.string().uuid() })
]);

const stripeMobilePaymentFinalizeBaseSchema = z.object({
  paymentIntentId: z.string().min(1),
  accepted: z.literal(true),
  applied: z.boolean(),
  note: z.string().optional()
});

export const stripeMobilePaymentFinalizeResponseSchema = z.union([
  stripeMobilePaymentFinalizeBaseSchema.extend({ checkoutId: z.string().uuid(), order: orderSchema }),
  stripeMobilePaymentFinalizeBaseSchema.extend({ orderId: z.string().uuid(), orderStatus: orderStatusSchema })
]);

export const checkoutPaymentContextSchema = z.object({
  checkoutId: z.string().uuid(),
  locationId: z.string().min(1),
  status: checkoutDraftStatusSchema,
  total: moneySchema,
  expiresAt: z.string().datetime()
});

export const checkoutPaymentConfirmationSchema = z.object({
  eventId: z.string().min(1).optional(),
  checkoutId: z.string().uuid(),
  paymentId: z.string().min(1),
  occurredAt: z.string().datetime(),
  amountCents: z.number().int().positive(),
  currency: z.literal("USD")
});

export const checkoutPaymentConfirmationResponseSchema = z.object({
  accepted: z.literal(true),
  applied: z.boolean(),
  order: orderSchema
});

export const orderPaymentContextSchema = z.object({
  orderId: z.string().uuid(),
  locationId: z.string().min(1),
  status: orderStatusSchema,
  total: moneySchema
});

const optionalMoneyInputCentsSchema = z.number().int().positive().optional();
const discountCodeRuleFieldsSchema = z.object({
  name: z.string().trim().min(1).max(80),
  type: discountCodeTypeSchema,
  value: z.number().int().positive(),
  maxDiscountCents: optionalMoneyInputCentsSchema,
  minSubtotalCents: z.number().int().nonnegative().default(0),
  eligibility: discountCodeEligibilitySchema.default("everyone"),
  oncePerCustomer: z.boolean().default(false),
  maxTotalRedemptions: z.number().int().positive().optional(),
  active: z.boolean().default(true),
  startsAt: z.string().datetime().optional(),
  expiresAt: z.string().datetime().optional()
});

function validateDiscountCodeRuleFields(
  value: z.infer<typeof discountCodeRuleFieldsSchema>,
  ctx: z.RefinementCtx
) {
  if (value.type === "percent" && value.value > 100) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["value"], message: "percent discount cannot exceed 100" });
  }

  if (value.type === "fixed_cents" && value.maxDiscountCents !== undefined) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["maxDiscountCents"],
      message: "maxDiscountCents only applies to percent discounts"
    });
  }

  if (value.startsAt && value.expiresAt && Date.parse(value.expiresAt) <= Date.parse(value.startsAt)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["expiresAt"], message: "expiresAt must be after startsAt" });
  }
}

export const discountCodeSchema = z.object({
  discountCodeId: z.string().uuid(),
  locationId: z.string().min(1),
  code: normalizedDiscountCodeSchema,
  name: z.string().trim().min(1).max(80),
  type: discountCodeTypeSchema,
  value: z.number().int().positive(),
  maxDiscountCents: optionalMoneyInputCentsSchema,
  minSubtotalCents: z.number().int().nonnegative(),
  eligibility: discountCodeEligibilitySchema,
  oncePerCustomer: z.boolean(),
  maxTotalRedemptions: z.number().int().positive().optional(),
  active: z.boolean(),
  startsAt: z.string().datetime().optional(),
  expiresAt: z.string().datetime().optional(),
  redeemedCount: z.number().int().nonnegative(),
  reservedCount: z.number().int().nonnegative(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime()
});

export const createDiscountCodeRequestSchema = z
  .object({
    locationId: z.string().min(1),
    code: normalizedDiscountCodeSchema,
    ...discountCodeRuleFieldsSchema.shape
  })
  .superRefine(validateDiscountCodeRuleFields);

export const updateDiscountCodeRequestSchema = discountCodeRuleFieldsSchema
  .partial()
  .extend({
    locationId: z.string().min(1),
    maxDiscountCents: optionalMoneyInputCentsSchema.nullable(),
    maxTotalRedemptions: z.number().int().positive().nullable().optional(),
    startsAt: z.string().datetime().nullable().optional(),
    expiresAt: z.string().datetime().nullable().optional()
  })
  .superRefine((value, ctx) => {
    if (value.type === "percent" && value.value !== undefined && value.value > 100) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["value"], message: "percent discount cannot exceed 100" });
    }

    if (value.type === "fixed_cents" && value.maxDiscountCents != null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["maxDiscountCents"],
        message: "maxDiscountCents only applies to percent discounts"
      });
    }

    if (value.startsAt && value.expiresAt && Date.parse(value.expiresAt) <= Date.parse(value.startsAt)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["expiresAt"], message: "expiresAt must be after startsAt" });
    }
  });

export const discountCodeListResponseSchema = z.object({
  discountCodes: z.array(discountCodeSchema)
});

export const discountCodeRedemptionSchema = z.object({
  redemptionId: z.string().uuid(),
  discountCodeId: z.string().uuid(),
  locationId: z.string().min(1),
  code: z.string().min(1),
  orderId: z.string().uuid(),
  userId: z.string().uuid(),
  discountCents: z.number().int().nonnegative(),
  status: discountRedemptionStatusSchema,
  reservedAt: z.string().datetime(),
  redeemedAt: z.string().datetime().optional(),
  releasedAt: z.string().datetime().optional()
});

export const discountCodeRedemptionsResponseSchema = z.object({
  redemptions: z.array(discountCodeRedemptionSchema)
});

export type OrderStatus = z.output<typeof orderStatusSchema>;
export type OrderCustomer = z.output<typeof orderCustomerSchema>;
export type OrderItemCustomizationSelectionSnapshot = z.output<typeof orderItemCustomizationSelectionSnapshotSchema>;
export type OrderItemCustomizationSnapshot = z.output<typeof orderItemCustomizationSnapshotSchema>;
export type OrderItem = z.output<typeof orderItemSchema>;
export type OrderDiscountBreakdown = z.output<typeof orderDiscountBreakdownSchema>;
export type AppliedDiscountCode = z.output<typeof appliedDiscountCodeSchema>;
export type OrderQuote = z.output<typeof orderQuoteSchema>;
export type OrderTimelineEntry = z.output<typeof orderTimelineEntrySchema>;
export type Order = z.output<typeof orderSchema>;
export type CheckoutDraft = z.output<typeof checkoutDraftSchema>;
export type DiscountCode = z.output<typeof discountCodeSchema>;
export type DiscountCodeRedemption = z.output<typeof discountCodeRedemptionSchema>;
export type StripeMobilePaymentSessionRequest = z.output<typeof stripeMobilePaymentSessionRequestSchema>;
export type StripeMobilePaymentSessionResponse = z.output<typeof stripeMobilePaymentSessionResponseSchema>;
export type StripeMobilePaymentFinalizeRequest = z.output<typeof stripeMobilePaymentFinalizeRequestSchema>;
export type StripeMobilePaymentFinalizeResponse = z.output<typeof stripeMobilePaymentFinalizeResponseSchema>;
export type OrderPaymentContext = z.output<typeof orderPaymentContextSchema>;
export type CheckoutPaymentContext = z.output<typeof checkoutPaymentContextSchema>;
export type CheckoutPaymentConfirmation = z.output<typeof checkoutPaymentConfirmationSchema>;

export const paymentReconciliationProviderSchema = z.enum(["CLOVER", "STRIPE"]);

export const paymentChargeReconciliationSchema = z.object({
  eventId: z.string().min(1).optional(),
  provider: paymentReconciliationProviderSchema,
  kind: z.literal("CHARGE"),
  orderId: z.string().uuid(),
  paymentId: z.string().min(1),
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
  paymentId: z.string().min(1),
  refundId: z.string().min(1).optional(),
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
    createCheckout: {
      method: "POST",
      path: "/checkouts",
      request: createCheckoutDraftRequestSchema,
      response: checkoutDraftSchema
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
