import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { loyaltyBalanceSchema, loyaltyLedgerEntrySchema } from "@lattelink/contracts-loyalty";
import { API_BASE_URL, apiClient } from "../api/client";
import { useLocationContext } from "../location/LocationProvider";
import { withCriticalDataLoadSentry } from "../observability/criticalDataLoad";

const orderStatusSchema = z.enum([
  "PENDING_PAYMENT",
  "PAID",
  "IN_PREP",
  "READY",
  "COMPLETED",
  "CANCELED",
  "REFUNDED",
  "PARTIALLY_REFUNDED"
]);
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
  refundSummary: z.object({
    state: z.enum(["NONE", "PARTIAL", "FULL"]),
    settledAmountCents: z.number().int().nonnegative(),
    remainingPaidAmountCents: z.number().int().nonnegative(),
    settledRefundCount: z.number().int().nonnegative(),
    allocationQuality: z.enum(["NONE", "COMPLETE", "UNALLOCATED"]),
    unverifiedRefundCount: z.number().int().nonnegative()
  }).optional(),
  timeline: z.array(
    z.object({
      status: orderStatusSchema,
      occurredAt: z.string().datetime(),
      note: z.string().optional()
    })
  )
});
const pushTokenUpsertSchema = z.object({
  brandId: z.string().trim().min(1).max(160),
  deviceId: z.string().min(1),
  platform: z.enum(["ios", "android"]),
  expoPushToken: z.string().startsWith("ExponentPushToken[")
});
const pushTokenUpsertResponseSchema = z.object({
  success: z.literal(true)
});

const orderListSchema = z.array(orderSchema);
const loyaltyLedgerSchema = z.array(loyaltyLedgerEntrySchema);
const activeOrderStatusSchema = orderStatusSchema.exclude([
  "CANCELED",
  "COMPLETED",
  "REFUNDED",
  "PARTIALLY_REFUNDED",
  "PENDING_PAYMENT"
]);
export const orderHistoryQueryKey = (brandId: string) => ["account", "orders", brandId] as const;

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
  const { brandId, isReady } = useLocationContext();
  const queryKey = orderHistoryQueryKey(brandId);
  return useQuery({
    queryKey,
    enabled: enabled && isReady && Boolean(brandId),
    queryFn: async (): Promise<OrderHistoryEntry[]> =>
      normalizeOrderHistory(orderListSchema.parse(await apiClient.listOrders()))
  });
}

export function useCancelOrderMutation() {
  const queryClient = useQueryClient();
  const { brandId, isReady } = useLocationContext();
  const queryKey = orderHistoryQueryKey(brandId);

  return useMutation({
    mutationFn: async (input: CancelOrderInput) => {
      if (!isReady || !brandId) throw new Error("A configured brand is required to update an order.");
      return orderSchema.parse(await apiClient.cancelOrder(input.orderId, { reason: input.reason }));
    },
    onSuccess: async (order) => {
      queryClient.setQueryData<OrderHistoryEntry[] | undefined>(queryKey, (currentOrders) =>
        mergeOrderIntoHistory(currentOrders, order)
      );

      await Promise.allSettled([
        queryClient.invalidateQueries({ queryKey }),
        queryClient.invalidateQueries({ queryKey: ["account", "loyalty", "balance"] }),
        queryClient.invalidateQueries({ queryKey: ["account", "loyalty", "ledger"] })
      ]);
    }
  });
}

export function useLoyaltyBalanceQuery(enabled = true) {
  const { brandId, selectedLocationId, isReady } = useLocationContext();
  return useQuery({
    queryKey: ["account", "loyalty", "balance", brandId],
    enabled: enabled && isReady && Boolean(selectedLocationId),
    queryFn: async ({ signal }): Promise<LoyaltyBalance> =>
      withCriticalDataLoadSentry(
        {
          feature: "account",
          operation: "load_loyalty_balance",
          endpoint: "/loyalty/balance",
          apiBaseUrl: API_BASE_URL,
          locationId: selectedLocationId ?? ""
        },
        async () => {
          if (!selectedLocationId) {
            throw new Error("A selected location is required for loyalty balance reads.");
          }

          return loyaltyBalanceSchema.parse(
            await apiClient.forLocation(selectedLocationId).get(`/loyalty/balance?brandId=${encodeURIComponent(brandId)}&locationId=${encodeURIComponent(selectedLocationId)}`, { signal })
          );
        }
      )
  });
}

export function useLoyaltyLedgerQuery(enabled = true) {
  const { brandId, selectedLocationId, isReady } = useLocationContext();
  return useQuery({
    queryKey: ["account", "loyalty", "ledger", brandId],
    enabled: enabled && isReady && Boolean(selectedLocationId),
    queryFn: async ({ signal }): Promise<LoyaltyLedgerEntry[]> =>
      withCriticalDataLoadSentry(
        {
          feature: "rewards_activity",
          operation: "load_loyalty_ledger",
          endpoint: "/loyalty/ledger",
          apiBaseUrl: API_BASE_URL,
          locationId: selectedLocationId ?? ""
        },
        async () => {
          if (!selectedLocationId) {
            throw new Error("A selected location is required for loyalty ledger reads.");
          }

          return loyaltyLedgerSchema.parse(
            await apiClient.forLocation(selectedLocationId).get(`/loyalty/ledger?brandId=${encodeURIComponent(brandId)}&locationId=${encodeURIComponent(selectedLocationId)}`, { signal })
          );
        }
      )
  });
}

export function getLoyaltyQueryErrorMessage(error: unknown) {
  if (error instanceof Error && error.message.startsWith("Request failed (401)")) {
    return "Your session expired. Sign in again to reload rewards.";
  }

  if (error instanceof Error && error.message.startsWith("Request failed")) {
    return "Rewards could not be loaded from the backend.";
  }

  return "Rewards could not be loaded.";
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
