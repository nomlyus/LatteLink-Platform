import { useMutation } from "@tanstack/react-query";
import { apiClient } from "../api/client";
import { useAuthSession } from "./session";

export function useAppleExchangeMutation() {
  const { signIn } = useAuthSession();

  return useMutation({
    mutationFn: (input: { identityToken: string; authorizationCode: string; nonce: string }) =>
      apiClient.appleExchange(input),
    onSuccess: async (session) => {
      await signIn(session);
    }
  });
}

export function useDevAccessMutation() {
  const { signIn } = useAuthSession();

  return useMutation({
    mutationFn: (input: { email: string; name?: string }) => apiClient.devAccess(input),
    onSuccess: async (session) => {
      await signIn(session);
    }
  });
}
