import { useMutation } from "@tanstack/react-query";
import { apiClient } from "../api/client";

export function useAppleExchangeMutation() {
  return useMutation({
    mutationFn: (input: { identityToken: string; authorizationCode: string; nonce: string }) =>
      apiClient.appleExchange(input),
    onSuccess: (session) => {
      apiClient.setAccessToken(session.accessToken);
    }
  });
}

export function useMagicLinkRequestMutation() {
  return useMutation({
    mutationFn: (input: { email: string }) => apiClient.requestMagicLink(input)
  });
}

export function useMeQueryMutation() {
  return useMutation({
    mutationFn: () => apiClient.me()
  });
}
