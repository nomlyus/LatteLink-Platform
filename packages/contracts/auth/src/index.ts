import { z } from "zod";
import { authSessionSchema } from "@lattelink/contracts-core";

export const appleExchangeRequestSchema = z.object({
  identityToken: z.string().min(1),
  authorizationCode: z.string().min(1),
  nonce: z.string().min(1)
});

export const googleOAuthStartRequestSchema = z.object({
  redirectUri: z.string().url()
});

export const googleOAuthStartResponseSchema = z.object({
  authorizeUrl: z.string().url(),
  stateExpiresAt: z.string().datetime()
});

export const operatorGoogleExchangeRequestSchema = z.object({
  code: z.string().min(1),
  state: z.string().min(1),
  redirectUri: z.string().url()
});

export const operatorAuthProvidersSchema = z.object({
  google: z.object({
    configured: z.boolean()
  })
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

export const customerDevAccessRequestSchema = z.object({
  email: z.string().trim().email(),
  name: z.string().trim().min(1).optional()
});

export const refreshRequestSchema = z.object({
  refreshToken: z.string().min(1)
});

export const logoutRequestSchema = z.object({
  refreshToken: z.string().min(1)
});

export const authSuccessSchema = z.object({
  success: z.literal(true)
});

export const customerProfileRequestSchema = z.object({
  name: z.string().trim().min(1),
  phoneNumber: z.string().trim().min(1).optional(),
  birthday: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional()
});

export const meResponseSchema = z.object({
  userId: z.string().uuid(),
  email: z.string().email().optional(),
  name: z.string().trim().min(1).optional(),
  displayName: z.string().trim().min(1).optional(),
  phoneNumber: z.string().trim().min(1).optional(),
  birthday: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  profileCompleted: z.boolean(),
  memberSince: z.string().datetime().optional(),
  createdAt: z.string().datetime().optional(),
  updatedAt: z.string().datetime().optional(),
  methods: z.array(z.enum(["apple", "passkey"]))
});

export const operatorRoleSchema = z.enum(["owner", "manager", "store"]);
export const operatorCapabilitySchema = z.enum([
  "orders:read",
  "orders:write",
  "menu:read",
  "menu:write",
  "menu:visibility",
  "store:read",
  "store:write",
  "team:read",
  "team:write"
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
    "team:read",
    "team:write"
  ],
  manager: [
    "orders:read",
    "orders:write",
    "menu:read",
    "menu:write",
    "menu:visibility",
    "store:read",
    "team:read"
  ],
  store: ["orders:read", "orders:write"]
} as const satisfies Record<z.infer<typeof operatorRoleSchema>, readonly z.infer<typeof operatorCapabilitySchema>[]>;

export function resolveOperatorCapabilities(role: z.infer<typeof operatorRoleSchema>) {
  return [...operatorCapabilitiesByRole[role]];
}

export const internalAdminRoleSchema = z.enum(["platform_owner", "platform_operator", "support_readonly"]);
export const internalAdminCapabilitySchema = z.enum([
  "clients:read",
  "clients:write",
  "owners:read",
  "owners:write",
  "internal-admin-users:read",
  "internal-admin-users:write"
]);

export const internalAdminCapabilitiesByRole = {
  platform_owner: [
    "clients:read",
    "clients:write",
    "owners:read",
    "owners:write",
    "internal-admin-users:read",
    "internal-admin-users:write"
  ],
  platform_operator: ["clients:read", "clients:write", "owners:read", "owners:write"],
  support_readonly: ["clients:read", "owners:read", "internal-admin-users:read"]
} as const satisfies Record<
  z.infer<typeof internalAdminRoleSchema>,
  readonly z.infer<typeof internalAdminCapabilitySchema>[]
>;

export function resolveInternalAdminCapabilities(role: z.infer<typeof internalAdminRoleSchema>) {
  return [...internalAdminCapabilitiesByRole[role]];
}

const operatorUserSchemaBase = z.object({
  operatorUserId: z.string().uuid(),
  displayName: z.string().min(1),
  email: z.string().trim().email(),
  role: operatorRoleSchema,
  locationId: z.string().min(1),
  locationIds: z.array(z.string().min(1)).optional(),
  active: z.boolean(),
  capabilities: z.array(operatorCapabilitySchema),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime()
});

export const operatorUserSchema = operatorUserSchemaBase.transform((value) => ({
  ...value,
  locationIds: Array.from(new Set([value.locationId, ...(value.locationIds ?? [])]))
}));

export const operatorSessionSchema = z.object({
  accessToken: z.string().min(1),
  refreshToken: z.string().min(1),
  expiresAt: z.string().datetime(),
  operator: operatorUserSchema
});

export const internalAdminUserSchema = z.object({
  internalAdminUserId: z.string().uuid(),
  displayName: z.string().min(1),
  email: z.string().trim().email(),
  role: internalAdminRoleSchema,
  active: z.boolean(),
  capabilities: z.array(internalAdminCapabilitySchema),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime()
});

export const internalAdminSessionSchema = z.object({
  accessToken: z.string().min(1),
  refreshToken: z.string().min(1),
  expiresAt: z.string().datetime(),
  admin: internalAdminUserSchema
});

export const operatorMeResponseSchema = operatorUserSchema;
export const internalAdminMeResponseSchema = internalAdminUserSchema;

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

export const internalOwnerProvisionParamsSchema = z.object({
  locationId: z.string().trim().min(1)
});

export const internalOwnerProvisionRequestSchema = z.object({
  displayName: z.string().trim().min(1),
  email: z.string().trim().email(),
  password: operatorPasswordSchema.optional(),
  dashboardUrl: z.string().trim().url().optional()
});

export const internalOwnerProvisionResponseSchema = z.object({
  operator: operatorUserSchema,
  temporaryPassword: operatorPasswordSchema,
  action: z.enum(["created", "updated"])
});

export const internalOwnerSummarySchema = z.object({
  locationId: z.string().trim().min(1),
  owner: operatorUserSchema.nullable()
});

export const operatorPasswordSignInSchema = z.object({
  email: z.string().trim().email(),
  password: operatorPasswordSchema
});

export const internalAdminPasswordSignInSchema = z.object({
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
    devAccess: {
      method: "POST",
      path: "/dev-access",
      request: customerDevAccessRequestSchema,
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
      response: authSuccessSchema
    },
    deleteAccount: {
      method: "DELETE",
      path: "/account",
      request: z.undefined(),
      response: authSuccessSchema
    },
    me: {
      method: "GET",
      path: "/me",
      request: z.undefined(),
      response: meResponseSchema
    },
    profile: {
      method: "POST",
      path: "/profile",
      request: customerProfileRequestSchema,
      response: meResponseSchema
    }
  }
} as const;

export const operatorAuthContract = {
  basePath: "/operator/auth",
  routes: {
    providers: {
      method: "GET",
      path: "/providers",
      request: z.undefined(),
      response: operatorAuthProvidersSchema
    },
    googleStart: {
      method: "GET",
      path: "/google/start",
      request: googleOAuthStartRequestSchema,
      response: googleOAuthStartResponseSchema
    },
    googleExchange: {
      method: "POST",
      path: "/google/exchange",
      request: operatorGoogleExchangeRequestSchema,
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

export const internalAdminAuthContract = {
  basePath: "/internal-admin/auth",
  routes: {
    signIn: {
      method: "POST",
      path: "/sign-in",
      request: internalAdminPasswordSignInSchema,
      response: internalAdminSessionSchema
    },
    refresh: {
      method: "POST",
      path: "/refresh",
      request: refreshRequestSchema,
      response: internalAdminSessionSchema
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
      response: internalAdminMeResponseSchema
    }
  }
} as const;

export type OperatorRole = z.output<typeof operatorRoleSchema>;
export type OperatorCapability = z.output<typeof operatorCapabilitySchema>;
export type OperatorUser = z.output<typeof operatorUserSchema>;
export type InternalAdminRole = z.output<typeof internalAdminRoleSchema>;
export type InternalAdminCapability = z.output<typeof internalAdminCapabilitySchema>;
export type InternalAdminUser = z.output<typeof internalAdminUserSchema>;
export type InternalAdminSession = z.output<typeof internalAdminSessionSchema>;
export type InternalOwnerProvisionRequest = z.output<typeof internalOwnerProvisionRequestSchema>;
export type InternalOwnerProvisionResponse = z.output<typeof internalOwnerProvisionResponseSchema>;
export type InternalOwnerSummary = z.output<typeof internalOwnerSummarySchema>;
export type OperatorSession = z.output<typeof operatorSessionSchema>;
