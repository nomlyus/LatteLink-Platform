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

type PasskeyVerifyPayload = {
  id: string;
  rawId: string;
  type: "public-key";
  authenticatorAttachment?: "platform" | "cross-platform";
  response: {
    clientDataJSON: string;
    attestationObject?: string;
    authenticatorData?: string;
    signature?: string;
    userHandle?: string | null;
    transports?: string[];
  };
  clientExtensionResults?: Record<string, unknown>;
};

export function usePasskeyRegisterVerifyMutation() {
  const { signIn } = useAuthSession();

  return useMutation({
    mutationFn: (input: PasskeyVerifyPayload) => apiClient.passkeyRegisterVerify(input),
    onSuccess: async (session) => {
      await signIn(session);
    }
  });
}

export function usePasskeyAuthVerifyMutation() {
  const { signIn } = useAuthSession();

  return useMutation({
    mutationFn: (input: PasskeyVerifyPayload) => apiClient.passkeyAuthVerify(input),
    onSuccess: async (session) => {
      await signIn(session);
    }
  });
}

export function useMagicLinkRequestMutation() {
  return useMutation({
    mutationFn: (input: { email: string }) => apiClient.requestMagicLink(input)
  });
}

export function useMagicLinkVerifyMutation() {
  const { signIn } = useAuthSession();

  return useMutation({
    mutationFn: (input: { token: string }) => apiClient.verifyMagicLink(input),
    onSuccess: async (session) => {
      await signIn(session);
    }
  });
}

export function useMeQueryMutation() {
  return useMutation({
    mutationFn: () => apiClient.me()
  });
}
