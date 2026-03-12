import { useMutation, useQuery } from "@tanstack/react-query";
import { z } from "zod";
import { apiClient } from "../api/client";

const orderStatusSchema = z.enum(["PENDING_PAYMENT", "PAID", "IN_PREP", "READY", "COMPLETED", "CANCELED"]);
const orderSchema = z.object({
  id: z.string().uuid(),
  status: orderStatusSchema,
  pickupCode: z.string().min(1),
  total: z.object({
    currency: z.literal("USD"),
    amountCents: z.number().int().nonnegative()
  }),
  timeline: z.array(
    z.object({
      status: orderStatusSchema,
      occurredAt: z.string().datetime(),
      note: z.string().optional()
    })
  )
});
const loyaltyBalanceSchema = z.object({
  userId: z.string().uuid(),
  availablePoints: z.number().int().nonnegative(),
  pendingPoints: z.number().int().nonnegative(),
  lifetimeEarned: z.number().int().nonnegative()
});
const loyaltyLedgerEntrySchema = z.object({
  id: z.string().uuid(),
  type: z.enum(["EARN", "REDEEM", "REFUND", "ADJUSTMENT"]),
  points: z.number().int(),
  orderId: z.string().uuid().optional(),
  createdAt: z.string().datetime()
});
const pushTokenUpsertSchema = z.object({
  deviceId: z.string().min(1),
  platform: z.enum(["ios", "android"]),
  expoPushToken: z.string().startsWith("ExponentPushToken[")
});
const pushTokenUpsertResponseSchema = z.object({
  success: z.literal(true)
});

const orderListSchema = z.array(orderSchema);
const loyaltyLedgerSchema = z.array(loyaltyLedgerEntrySchema);
const activeOrderStatusSchema = orderStatusSchema.exclude(["CANCELED", "COMPLETED"]);

export type OrderHistoryEntry = z.output<typeof orderSchema>;
export type LoyaltyBalance = z.output<typeof loyaltyBalanceSchema>;
export type LoyaltyLedgerEntry = z.output<typeof loyaltyLedgerEntrySchema>;
export type ActiveOrderStatus = z.output<typeof activeOrderStatusSchema>;

export function useOrderHistoryQuery(enabled = true) {
  return useQuery({
    queryKey: ["account", "orders"],
    enabled,
    queryFn: async (): Promise<OrderHistoryEntry[]> => {
      const orders = orderListSchema.parse(await apiClient.listOrders());
      return [...orders].sort((left, right) => {
        const leftOccurredAt = left.timeline[left.timeline.length - 1]?.occurredAt ?? "";
        const rightOccurredAt = right.timeline[right.timeline.length - 1]?.occurredAt ?? "";
        return Date.parse(rightOccurredAt) - Date.parse(leftOccurredAt);
      });
    }
  });
}

export function useLoyaltyBalanceQuery(enabled = true) {
  return useQuery({
    queryKey: ["account", "loyalty", "balance"],
    enabled,
    queryFn: async (): Promise<LoyaltyBalance> => loyaltyBalanceSchema.parse(await apiClient.get("/loyalty/balance"))
  });
}

export function useLoyaltyLedgerQuery(enabled = true) {
  return useQuery({
    queryKey: ["account", "loyalty", "ledger"],
    enabled,
    queryFn: async (): Promise<LoyaltyLedgerEntry[]> =>
      loyaltyLedgerSchema.parse(await apiClient.get("/loyalty/ledger"))
  });
}

export function usePushTokenRegistrationMutation() {
  return useMutation({
    mutationFn: async (input: z.input<typeof pushTokenUpsertSchema>) => {
      const request = pushTokenUpsertSchema.parse(input);
      const response = await apiClient.put("/devices/push-token", request);
      return pushTokenUpsertResponseSchema.parse(response);
    }
  });
}

export function findActiveOrder(orders: OrderHistoryEntry[]) {
  return orders.find((order) => activeOrderStatusSchema.safeParse(order.status).success);
}
