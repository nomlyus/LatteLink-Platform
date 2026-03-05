import { z } from "zod";
import { authSessionSchema } from "@gazelle/contracts-core";

export const appleExchangeRequestSchema = z.object({
  identityToken: z.string().min(1),
  authorizationCode: z.string().min(1),
  nonce: z.string().min(1)
});

export const passkeyChallengeRequestSchema = z.object({
  userId: z.string().uuid().optional()
});

export const passkeyChallengeResponseSchema = z.object({
  challenge: z.string(),
  rpId: z.string(),
  timeoutMs: z.number().int().positive()
});

export const passkeyVerifyRequestSchema = z.record(z.unknown());

export const magicLinkRequestSchema = z.object({
  email: z.string().email()
});

export const magicLinkVerifySchema = z.object({
  token: z.string().min(1)
});

export const refreshRequestSchema = z.object({
  refreshToken: z.string().min(1)
});

export const logoutRequestSchema = z.object({
  refreshToken: z.string().min(1)
});

export const meResponseSchema = z.object({
  userId: z.string().uuid(),
  email: z.string().email().optional(),
  methods: z.array(z.enum(["apple", "passkey", "magic-link"]))
});

export const authContract = {
  basePath: "/auth",
  routes: {
    appleExchange: {
      method: "POST",
      path: "/apple/exchange",
      request: appleExchangeRequestSchema,
      response: authSessionSchema
    },
    passkeyRegisterChallenge: {
      method: "POST",
      path: "/passkey/register/challenge",
      request: passkeyChallengeRequestSchema,
      response: passkeyChallengeResponseSchema
    },
    passkeyRegisterVerify: {
      method: "POST",
      path: "/passkey/register/verify",
      request: passkeyVerifyRequestSchema,
      response: authSessionSchema
    },
    passkeyAuthChallenge: {
      method: "POST",
      path: "/passkey/auth/challenge",
      request: passkeyChallengeRequestSchema,
      response: passkeyChallengeResponseSchema
    },
    passkeyAuthVerify: {
      method: "POST",
      path: "/passkey/auth/verify",
      request: passkeyVerifyRequestSchema,
      response: authSessionSchema
    },
    magicLinkRequest: {
      method: "POST",
      path: "/magic-link/request",
      request: magicLinkRequestSchema,
      response: z.object({ success: z.literal(true) })
    },
    magicLinkVerify: {
      method: "POST",
      path: "/magic-link/verify",
      request: magicLinkVerifySchema,
      response: authSessionSchema
    },
    refresh: {
      method: "POST",
      path: "/refresh",
      request: refreshRequestSchema,
      response: authSessionSchema
    },
    logout: {
      method: "POST",
      path: "/logout",
      request: logoutRequestSchema,
      response: z.object({ success: z.literal(true) })
    },
    me: {
      method: "GET",
      path: "/me",
      request: z.undefined(),
      response: meResponseSchema
    }
  }
} as const;
