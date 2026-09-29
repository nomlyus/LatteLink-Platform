import { useEffect, useMemo } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { mergeOrderIntoHistory, normalizeOrderHistory, orderHistoryQueryKey, type OrderHistoryEntry } from "../account/data";
import { apiClient } from "../api/client";
import { useLocationContext } from "../location/LocationProvider";

export function useOrdersRealtimeSync(isAuthenticated: boolean) {
  const queryClient = useQueryClient();
  const { brandId, isReady } = useLocationContext();
  const queryKey = useMemo(() => orderHistoryQueryKey(brandId), [brandId]);

  useEffect(() => {
    if (!isAuthenticated || !isReady || !brandId) {
      return;
    }

    return apiClient.subscribeToOrders(
      (event) => {
        if (event.type === "snapshot") {
          queryClient.setQueryData<OrderHistoryEntry[] | undefined>(
            queryKey,
            normalizeOrderHistory(event.orders as OrderHistoryEntry[])
          );
          return;
        }

        queryClient.setQueryData<OrderHistoryEntry[] | undefined>(queryKey, (currentOrders) =>
          mergeOrderIntoHistory(currentOrders, event.order as OrderHistoryEntry)
        );
      },
      (error) => {
        if (__DEV__) {
          console.warn("Orders realtime sync failed", error);
        }
      }
    );
  }, [brandId, isAuthenticated, isReady, queryClient, queryKey]);
}
