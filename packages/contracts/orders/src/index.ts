import { z } from "zod";
import { moneySchema } from "@gazelle/contracts-core";

export const orderStatusSchema = z.enum([
  "PENDING_PAYMENT",
  "PAID",
  "IN_PREP",
  "READY",
  "COMPLETED",
  "CANCELED"
]);

export const orderItemSchema = z.object({
  itemId: z.string(),
  quantity: z.number().int().positive(),
  unitPriceCents: z.number().int().nonnegative()
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
  note: z.string().optional()
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

export const quoteRequestSchema = z.object({
  locationId: z.string(),
  items: z.array(z.object({ itemId: z.string(), quantity: z.number().int().positive() })),
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
  applePayToken: z.string().min(1).optional(),
  applePayWallet: applePayWalletSchema.optional(),
  idempotencyKey: z.string().min(1)
}).superRefine((input, context) => {
  const hasToken = Boolean(input.applePayToken);
  const hasWallet = Boolean(input.applePayWallet);

  if (!hasToken && !hasWallet) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["applePayToken"],
      message: "Either applePayToken or applePayWallet is required."
    });
  }

  if (hasToken && hasWallet) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["applePayWallet"],
      message: "Provide either applePayToken or applePayWallet, but not both."
    });
  }
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
