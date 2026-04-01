import { z } from "zod";
import { authSessionSchema } from "@gazelle/contracts-core";

export const appleExchangeRequestSchema = z.object({
  identityToken: z.string().min(1).optional(),
  authorizationCode: z.string().min(1).optional(),
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
  email: z.string().trim().email()
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

export const operatorRoleSchema = z.enum(["owner", "manager", "staff"]);
export const operatorCapabilitySchema = z.enum([
  "orders:read",
  "orders:write",
  "menu:read",
  "menu:write",
  "menu:visibility",
  "store:read",
  "store:write",
  "staff:read",
  "staff:write"
]);

export const operatorCapabilitiesByRole = {
  owner: [
    "orders:read",
    "orders:write",
    "menu:read",
    "menu:write",
    "menu:visibility",
    "store:read",
    "store:write",
    "staff:read",
    "staff:write"
  ],
  manager: [
    "orders:read",
    "orders:write",
    "menu:read",
    "menu:write",
    "menu:visibility",
    "store:read",
    "staff:read"
  ],
  staff: ["orders:read", "orders:write", "menu:read", "menu:visibility", "store:read"]
} as const satisfies Record<z.infer<typeof operatorRoleSchema>, readonly z.infer<typeof operatorCapabilitySchema>[]>;

export function resolveOperatorCapabilities(role: z.infer<typeof operatorRoleSchema>) {
  return [...operatorCapabilitiesByRole[role]];
}

export const operatorUserSchema = z.object({
  operatorUserId: z.string().uuid(),
  displayName: z.string().min(1),
  email: z.string().trim().email(),
  role: operatorRoleSchema,
  locationId: z.string().min(1),
  active: z.boolean(),
  capabilities: z.array(operatorCapabilitySchema),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime()
});

export const operatorSessionSchema = z.object({
  accessToken: z.string().min(1),
  refreshToken: z.string().min(1),
  expiresAt: z.string().datetime(),
  operator: operatorUserSchema
});

export const operatorMeResponseSchema = operatorUserSchema;

export const operatorUserListResponseSchema = z.object({
  users: z.array(operatorUserSchema)
});

export const operatorPasswordSchema = z.string().min(8).max(128);

export const operatorUserCreateSchema = z.object({
  displayName: z.string().trim().min(1),
  email: z.string().trim().email(),
  role: operatorRoleSchema,
  password: operatorPasswordSchema
});

export const operatorUserUpdateSchema = z
  .object({
    displayName: z.string().trim().min(1).optional(),
    email: z.string().trim().email().optional(),
    role: operatorRoleSchema.optional(),
    active: z.boolean().optional(),
    password: operatorPasswordSchema.optional()
  })
  .refine((value) => Object.values(value).some((entry) => entry !== undefined), {
    message: "At least one operator user field must be provided"
  });

export const operatorUserParamsSchema = z.object({
  operatorUserId: z.string().uuid()
});

export const operatorPasswordSignInSchema = z.object({
  email: z.string().trim().email(),
  password: operatorPasswordSchema
});

export const operatorDevAccessRequestSchema = z.object({
  email: z.string().trim().email()
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

export const operatorAuthContract = {
  basePath: "/operator/auth",
  routes: {
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
      response: operatorSessionSchema
    },
    signIn: {
      method: "POST",
      path: "/sign-in",
      request: operatorPasswordSignInSchema,
      response: operatorSessionSchema
    },
    devAccess: {
      method: "POST",
      path: "/dev-access",
      request: operatorDevAccessRequestSchema,
      response: operatorSessionSchema
    },
    refresh: {
      method: "POST",
      path: "/refresh",
      request: refreshRequestSchema,
      response: operatorSessionSchema
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
      response: operatorMeResponseSchema
    }
  }
} as const;

export type OperatorRole = z.output<typeof operatorRoleSchema>;
export type OperatorCapability = z.output<typeof operatorCapabilitySchema>;
export type OperatorUser = z.output<typeof operatorUserSchema>;
export type OperatorSession = z.output<typeof operatorSessionSchema>;
