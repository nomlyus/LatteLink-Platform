import { useQuery } from "@tanstack/react-query";
import { apiClient } from "../api/client";

export const customerProfileQueryKey = ["account", "identity"] as const;

export type CustomerProfile = Awaited<ReturnType<typeof apiClient.me>>;

export function isCustomerProfileComplete(profile: CustomerProfile | null | undefined) {
  return Boolean(profile?.profileCompleted);
}

export function useCustomerProfileQuery(enabled = true) {
  return useQuery({
    queryKey: customerProfileQueryKey,
    enabled,
    queryFn: async (): Promise<CustomerProfile> => apiClient.me()
  });
}
