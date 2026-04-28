import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { MOBILE_LOCATION_ID, apiClient } from "../api/client";

const orderStatusSchema = z.enum(["PENDING_PAYMENT", "PAID", "IN_PREP", "READY", "COMPLETED", "CANCELED"]);
const orderItemSchema = z.object({
  itemId: z.string(),
  itemName: z.string().min(1).optional(),
  quantity: z.number().int().positive(),
  unitPriceCents: z.number().int().nonnegative(),
  lineTotalCents: z.number().int().nonnegative().optional(),
  customization: z
    .object({
      notes: z.string().default(""),
      selectedOptions: z
        .array(
          z.object({
            groupId: z.string(),
            groupLabel: z.string(),
            optionId: z.string(),
            optionLabel: z.string(),
            priceDeltaCents: z.number().int()
          })
        )
        .default([])
    })
    .optional()
});
const orderSchema = z.object({
  id: z.string().uuid(),
  status: orderStatusSchema,
  items: z.array(orderItemSchema),
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
const activeOrderStatusSchema = orderStatusSchema.exclude(["CANCELED", "COMPLETED", "PENDING_PAYMENT"]);
export const orderHistoryQueryKey = ["account", "orders"] as const;

export type OrderHistoryEntry = z.output<typeof orderSchema>;
export type LoyaltyBalance = z.output<typeof loyaltyBalanceSchema>;
export type LoyaltyLedgerEntry = z.output<typeof loyaltyLedgerEntrySchema>;
export type ActiveOrderStatus = z.output<typeof activeOrderStatusSchema>;

type CancelOrderInput = {
  orderId: string;
  reason: string;
};

export function sortOrdersByLatestActivity(orders: OrderHistoryEntry[]) {
  return [...orders].sort((left, right) => {
    const leftOccurredAt = left.timeline[left.timeline.length - 1]?.occurredAt ?? "";
    const rightOccurredAt = right.timeline[right.timeline.length - 1]?.occurredAt ?? "";
    return Date.parse(rightOccurredAt) - Date.parse(leftOccurredAt);
  });
}

export function isAbortedCheckoutOrder(order: OrderHistoryEntry) {
  if (order.status !== "CANCELED") {
    return false;
  }

  return !order.timeline.some(
    (entry) =>
      entry.status === "PAID" ||
      entry.status === "IN_PREP" ||
      entry.status === "READY" ||
      entry.status === "COMPLETED"
  );
}

function filterVisibleOrderHistory(orders: OrderHistoryEntry[]) {
  return orders.filter((order) => order.status !== "PENDING_PAYMENT" && !isAbortedCheckoutOrder(order));
}

export function normalizeOrderHistory(orders: OrderHistoryEntry[]) {
  return sortOrdersByLatestActivity(filterVisibleOrderHistory(orders));
}

export function mergeOrderIntoHistory(
  currentOrders: OrderHistoryEntry[] | undefined,
  order: OrderHistoryEntry
) {
  const baseOrders = currentOrders ?? [];
  const hasExistingOrder = baseOrders.some((entry) => entry.id === order.id);
  const nextOrders = hasExistingOrder
    ? baseOrders.map((entry) => (entry.id === order.id ? order : entry))
    : [order, ...baseOrders];

  return normalizeOrderHistory(nextOrders);
}

export function useOrderHistoryQuery(enabled = true) {
  return useQuery({
    queryKey: orderHistoryQueryKey,
    enabled,
    queryFn: async (): Promise<OrderHistoryEntry[]> =>
      normalizeOrderHistory(orderListSchema.parse(await apiClient.listOrders()))
  });
}

export function useCancelOrderMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: CancelOrderInput) =>
      orderSchema.parse(await apiClient.cancelOrder(input.orderId, { reason: input.reason })),
    onSuccess: async (order) => {
      queryClient.setQueryData<OrderHistoryEntry[] | undefined>(orderHistoryQueryKey, (currentOrders) =>
        mergeOrderIntoHistory(currentOrders, order)
      );

      await Promise.allSettled([
        queryClient.invalidateQueries({ queryKey: orderHistoryQueryKey }),
        queryClient.invalidateQueries({ queryKey: ["account", "loyalty", "balance"] }),
        queryClient.invalidateQueries({ queryKey: ["account", "loyalty", "ledger"] })
      ]);
    }
  });
}

export function useLoyaltyBalanceQuery(enabled = true) {
  return useQuery({
    queryKey: ["account", "loyalty", "balance", MOBILE_LOCATION_ID],
    enabled,
    queryFn: async (): Promise<LoyaltyBalance> => {
      if (!MOBILE_LOCATION_ID) {
        throw new Error("EXPO_PUBLIC_LOCATION_ID is required for loyalty balance reads.");
      }

      return loyaltyBalanceSchema.parse(
        await apiClient.get(`/loyalty/balance?locationId=${encodeURIComponent(MOBILE_LOCATION_ID)}`)
      );
    }
  });
}

export function useLoyaltyLedgerQuery(enabled = true) {
  return useQuery({
    queryKey: ["account", "loyalty", "ledger", MOBILE_LOCATION_ID],
    enabled,
    queryFn: async (): Promise<LoyaltyLedgerEntry[]> => {
      if (!MOBILE_LOCATION_ID) {
        throw new Error("EXPO_PUBLIC_LOCATION_ID is required for loyalty ledger reads.");
      }

      return loyaltyLedgerSchema.parse(
        await apiClient.get(`/loyalty/ledger?locationId=${encodeURIComponent(MOBILE_LOCATION_ID)}`)
      );
    }
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
