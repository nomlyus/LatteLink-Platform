import { z } from "zod";

export const notificationOrderStatusSchema = z.enum([
  "PENDING_PAYMENT",
  "PAID",
  "IN_PREP",
  "READY",
  "COMPLETED",
  "CANCELED",
  "REFUNDED"
]);

export const pushTokenUpsertSchema = z.object({
  deviceId: z.string().min(1),
  platform: z.enum(["ios", "android"]),
  expoPushToken: z.string().startsWith("ExponentPushToken[")
});

export const pushTokenUpsertResponseSchema = z.object({
  success: z.literal(true)
});

export const orderStateNotificationSchema = z.object({
  userId: z.string().uuid(),
  orderId: z.string().uuid(),
  status: notificationOrderStatusSchema,
  pickupCode: z.string().min(1),
  locationId: z.string().min(1),
  occurredAt: z.string().datetime(),
  note: z.string().optional()
});

export const orderStateDispatchResponseSchema = z.object({
  accepted: z.literal(true),
  enqueued: z.number().int().nonnegative(),
  deduplicated: z.boolean()
});

export const notificationsContract = {
  basePath: "/devices",
  routes: {
    upsertPushToken: {
      method: "PUT",
      path: "/push-token",
      request: pushTokenUpsertSchema,
      response: pushTokenUpsertResponseSchema
    }
  }
} as const;
