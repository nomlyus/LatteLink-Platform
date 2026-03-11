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

const passkeyCredentialResponseSchema = z
  .object({
    clientDataJSON: z.string().min(1),
    attestationObject: z.string().min(1).optional(),
    authenticatorData: z.string().min(1).optional(),
    signature: z.string().min(1).optional(),
    userHandle: z.string().nullable().optional(),
    transports: z.array(z.string().min(1)).optional()
  })
  .superRefine((input, context) => {
    const hasRegistrationPayload = input.attestationObject !== undefined;
    const hasAuthenticationPayload = input.authenticatorData !== undefined && input.signature !== undefined;

    if (!hasRegistrationPayload && !hasAuthenticationPayload) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          "response must include attestationObject (register verify) or authenticatorData + signature (auth verify)"
      });
    }
  });

export const passkeyVerifyRequestSchema = z.object({
  id: z.string().min(1),
  rawId: z.string().min(1),
  type: z.literal("public-key"),
  authenticatorAttachment: z.enum(["platform", "cross-platform"]).optional(),
  response: passkeyCredentialResponseSchema,
  clientExtensionResults: z.record(z.unknown()).optional()
});

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
