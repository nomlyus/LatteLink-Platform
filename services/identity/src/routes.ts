import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse
} from "@simplewebauthn/server";
import {
  appleExchangeRequestSchema,
  googleOAuthStartRequestSchema,
  googleOAuthStartResponseSchema,
  internalOwnerProvisionParamsSchema,
  internalOwnerProvisionRequestSchema,
  internalOwnerProvisionResponseSchema,
  logoutRequestSchema,
  magicLinkRequestSchema,
  magicLinkVerifySchema,
  meResponseSchema,
  operatorAuthProvidersSchema,
  operatorDevAccessRequestSchema,
  operatorGoogleExchangeRequestSchema,
  operatorMeResponseSchema,
  operatorPasswordSignInSchema,
  operatorSessionSchema,
  operatorUserCreateSchema,
  operatorUserListResponseSchema,
  operatorUserParamsSchema,
  operatorUserUpdateSchema,
  passkeyChallengeRequestSchema,
  passkeyChallengeResponseSchema,
  passkeyVerifyRequestSchema,
  refreshRequestSchema
} from "@gazelle/contracts-auth";
import { apiErrorSchema, authSessionSchema } from "@gazelle/contracts-core";
import { createIdentityRepository, type IdentityRepository } from "./repository.js";
import { createMailSender, type MailSender } from "./mail.js";
import { provisionOwnerAccess } from "./provisioning.js";

const payloadSchema = z.object({
  id: z.string().uuid().optional()
});

const authHeaderSchema = z.object({
  authorization: z.string().startsWith("Bearer ").optional()
});

const gatewayHeadersSchema = z.object({
  "x-gateway-token": z.string().optional()
});

const clientDataSchema = z.object({
  challenge: z.string()
});
const passkeyTransportSchema = z.enum(["ble", "cable", "hybrid", "internal", "nfc", "smart-card", "usb"]);

const defaultPasskeyRpId = "localhost";
const defaultPasskeyRpName = "Gazelle";
const defaultPasskeyTimeoutMs = 60_000;
const defaultRateLimitWindowMs = 60_000;
const defaultAuthWriteRateLimitMax = 24;
const defaultAuthReadRateLimitMax = 120;
const defaultPasskeyVerifyRateLimitMax = 12;
const defaultPasskeyChallengeRateLimitMax = 24;
const defaultAccessTokenTtlMs = 30 * 60 * 1000;
const defaultOperatorLocationId = "flagship-01";
const defaultGoogleOAuthStateTtlMs = 10 * 60 * 1000;
// Successful refresh rotation extends the session's idle lifetime by issuing a new refresh token.
// We intentionally keep this as an idle timeout for now; absolute session caps are a future policy choice.
const defaultRefreshSessionTtlMs = 30 * 24 * 60 * 60 * 1000;

function parseCommaSeparatedEnv(value: string | undefined) {
  return (value ?? "")
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
}

function toPositiveInteger(value: string | undefined, fallback: number) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }

  return Math.floor(parsed);
}

function extractAppleTokenClaims(identityToken: string): { sub?: string; email?: string } {
  try {
    const parts = identityToken.split(".");
    if (parts.length !== 3 || !parts[1]) {
      return {};
    }

    const payload = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8")) as Record<string, unknown>;

    return {
      sub: typeof payload.sub === "string" ? payload.sub : undefined,
      email: typeof payload.email === "string" ? payload.email : undefined
    };
  } catch {
    return {};
  }
}

function buildMagicLinkUrl(baseUrl: string, token: string) {
  const url = new URL("/auth/magic-link", baseUrl);
  url.searchParams.set("token", token);
  return url.toString();
}

function buildOperatorMagicLinkUrl(baseUrl: string, token: string) {
  const url = new URL("/", baseUrl);
  url.searchParams.set("operator_token", token);
  return url.toString();
}

function secretsMatch(expected: string, provided: string) {
  const expectedBuffer = Buffer.from(expected, "utf8");
  const providedBuffer = Buffer.from(provided, "utf8");
  if (expectedBuffer.length !== providedBuffer.length) {
    return false;
  }

  return timingSafeEqual(expectedBuffer, providedBuffer);
}

const googleTokenResponseSchema = z.object({
  access_token: z.string().min(1),
  token_type: z.string().min(1).optional(),
  scope: z.string().min(1).optional()
});

const googleUserInfoSchema = z.object({
  sub: z.string().min(1),
  email: z.string().email().optional(),
  email_verified: z.union([z.boolean(), z.string()]).optional(),
  name: z.string().min(1).optional()
});

type GoogleOAuthConfig = {
  clientId: string;
  clientSecret: string;
  stateSecret: string;
  allowedRedirectUris: string[];
  authorizeEndpoint: string;
  tokenEndpoint: string;
  userInfoEndpoint: string;
  stateTtlMs: number;
};

function loadGoogleOperatorConfig(): GoogleOAuthConfig | undefined {
  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID?.trim();
  const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET?.trim();
  const stateSecret =
    process.env.GOOGLE_OAUTH_STATE_SECRET?.trim() || process.env.JWT_SECRET?.trim() || undefined;

  if (!clientId || !clientSecret || !stateSecret) {
    return undefined;
  }

  return {
    clientId,
    clientSecret,
    stateSecret,
    allowedRedirectUris: parseCommaSeparatedEnv(process.env.GOOGLE_OAUTH_ALLOWED_REDIRECT_URIS),
    authorizeEndpoint: process.env.GOOGLE_OAUTH_AUTHORIZE_ENDPOINT?.trim() || "https://accounts.google.com/o/oauth2/v2/auth",
    tokenEndpoint: process.env.GOOGLE_OAUTH_TOKEN_ENDPOINT?.trim() || "https://oauth2.googleapis.com/token",
    userInfoEndpoint:
      process.env.GOOGLE_OAUTH_USERINFO_ENDPOINT?.trim() || "https://openidconnect.googleapis.com/v1/userinfo",
    stateTtlMs: toPositiveInteger(process.env.GOOGLE_OAUTH_STATE_TTL_MS, defaultGoogleOAuthStateTtlMs)
  };
}

function isAllowedGoogleRedirectUri(config: GoogleOAuthConfig, redirectUri: string) {
  return config.allowedRedirectUris.length === 0 || config.allowedRedirectUris.includes(redirectUri);
}

function buildGoogleOAuthState(input: { redirectUri: string; stateSecret: string }) {
  const payload = Buffer.from(
    JSON.stringify({
      redirectUri: input.redirectUri,
      issuedAt: Date.now()
    }),
    "utf8"
  ).toString("base64url");
  const signature = createHmac("sha256", input.stateSecret).update(payload).digest("base64url");

  return `${payload}.${signature}`;
}

function parseGoogleOAuthState(input: {
  state: string;
  stateSecret: string;
  maxAgeMs: number;
}): { redirectUri: string } | undefined {
  const [payload, signature] = input.state.split(".");
  if (!payload || !signature) {
    return undefined;
  }

  const expectedSignature = createHmac("sha256", input.stateSecret).update(payload).digest("base64url");
  if (signature !== expectedSignature) {
    return undefined;
  }

  try {
    const parsed = z
      .object({
        redirectUri: z.string().url(),
        issuedAt: z.number().int().nonnegative()
      })
      .parse(JSON.parse(Buffer.from(payload, "base64url").toString("utf8")));

    if (Date.now() - parsed.issuedAt > input.maxAgeMs) {
      return undefined;
    }

    return {
      redirectUri: parsed.redirectUri
    };
  } catch {
    return undefined;
  }
}

function buildGoogleAuthorizeUrl(input: { config: GoogleOAuthConfig; redirectUri: string; state: string }) {
  const url = new URL(input.config.authorizeEndpoint);
  url.searchParams.set("client_id", input.config.clientId);
  url.searchParams.set("redirect_uri", input.redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", "openid email profile");
  url.searchParams.set("state", input.state);
  url.searchParams.set("prompt", "select_account");

  return url.toString();
}

function normalizeGoogleEmailVerified(value: boolean | string | undefined) {
  if (typeof value === "boolean") {
    return value;
  }

  return typeof value === "string" ? value.toLowerCase() === "true" : false;
}

function isOperatorEmailConflictError(error: unknown) {
  return error instanceof Error && error.message === "OPERATOR_EMAIL_ALREADY_EXISTS";
}

function parseJsonSafely(rawValue: string) {
  if (!rawValue) {
    return undefined;
  }

  try {
    return JSON.parse(rawValue) as unknown;
  } catch {
    return rawValue;
  }
}

function loadJwtSecret() {
  const secret = process.env.JWT_SECRET?.trim();
  return secret && secret.length > 0 ? secret : undefined;
}

function buildJwtAccessToken(userId: string, expiresAt: string, secret: string): string {
  const issuedAtSeconds = Math.floor(Date.now() / 1000);
  const expiresAtSeconds = Math.floor(Date.parse(expiresAt) / 1000);
  const encodedHeader = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" }), "utf8").toString("base64url");
  const encodedPayload = Buffer.from(
    JSON.stringify({
      sub: userId,
      exp: expiresAtSeconds,
      iat: issuedAtSeconds,
      jti: randomUUID()
    }),
    "utf8"
  ).toString("base64url");
  const signingInput = `${encodedHeader}.${encodedPayload}`;
  const signature = createHmac("sha256", secret).update(signingInput).digest("base64url");

  return `${signingInput}.${signature}`;
}

function loadPasskeyConfig() {
  const rpId = process.env.PASSKEY_RP_ID?.trim() || defaultPasskeyRpId;
  const rpName = process.env.PASSKEY_RP_NAME?.trim() || defaultPasskeyRpName;
  const timeoutMsRaw = Number(process.env.PASSKEY_TIMEOUT_MS ?? defaultPasskeyTimeoutMs);
  const timeoutMs = Number.isFinite(timeoutMsRaw) && timeoutMsRaw > 0 ? timeoutMsRaw : defaultPasskeyTimeoutMs;
  const expectedOrigins =
    parseCommaSeparatedEnv(process.env.PASSKEY_EXPECTED_ORIGINS).length > 0
      ? parseCommaSeparatedEnv(process.env.PASSKEY_EXPECTED_ORIGINS)
      : [`https://${rpId}`];

  return {
    rpId,
    rpName,
    timeoutMs,
    expectedOrigins
  };
}

function buildStoredSession(seed: string, userId: string) {
  const tokenSuffix = `${seed}-${randomUUID()}`;
  const accessExpiresAt = new Date(Date.now() + defaultAccessTokenTtlMs).toISOString();
  const refreshExpiresAt = new Date(Date.now() + defaultRefreshSessionTtlMs).toISOString();
  const jwtSecret = loadJwtSecret();
  // JWT access tokens are opt-in for rollout compatibility. Refresh/logout semantics remain DB-backed
  // either way because the refresh token and session record are still persisted. The opaque path stays
  // until every identity+gateway deployment shares JWT_SECRET.
  const accessToken = jwtSecret ? buildJwtAccessToken(userId, accessExpiresAt, jwtSecret) : `access-${tokenSuffix}`;

  return {
    ...authSessionSchema.parse({
      accessToken,
      refreshToken: `refresh-${tokenSuffix}`,
      expiresAt: accessExpiresAt,
      userId
    }),
    refreshExpiresAt
  };
}

function buildStoredOperatorSession(seed: string, operatorUserId: string) {
  const tokenSuffix = `${seed}-${randomUUID()}`;
  const accessExpiresAt = new Date(Date.now() + defaultAccessTokenTtlMs).toISOString();
  const refreshExpiresAt = new Date(Date.now() + defaultRefreshSessionTtlMs).toISOString();

  return {
    accessToken: `operator-access-${tokenSuffix}`,
    refreshToken: `operator-refresh-${tokenSuffix}`,
    operatorUserId,
    expiresAt: accessExpiresAt,
    refreshExpiresAt
  };
}

function extractChallengeFromClientData(clientDataJSON: string) {
  try {
    const decodedClientData = Buffer.from(clientDataJSON, "base64url").toString("utf8");
    const parsed = clientDataSchema.parse(JSON.parse(decodedClientData));
    return parsed.challenge;
  } catch {
    return undefined;
  }
}

function toPasskeyTransports(transports: string[] | undefined) {
  if (!transports) {
    return undefined;
  }

  const parsed: z.infer<typeof passkeyTransportSchema>[] = [];
  for (const transport of transports) {
    const result = passkeyTransportSchema.safeParse(transport);
    if (result.success) {
      parsed.push(result.data);
    }
  }

  return parsed;
}

async function issueSession(params: {
  repository: IdentityRepository;
  seed: string;
  userId: string;
  authMethod: "apple" | "passkey-register" | "passkey-auth" | "magic-link" | "refresh";
}) {
  const session = buildStoredSession(params.seed, params.userId);
  await params.repository.saveSession(session, params.authMethod);
  return authSessionSchema.parse(session);
}

async function issueOperatorSession(params: {
  repository: IdentityRepository;
  seed: string;
  operatorUserId: string;
  authMethod: "magic-link" | "password" | "google" | "refresh";
}) {
  const session = buildStoredOperatorSession(params.seed, params.operatorUserId);
  await params.repository.saveOperatorSession(session, params.authMethod);
  const operator = await params.repository.getOperatorUserById(params.operatorUserId);
  if (!operator || !operator.active) {
    throw new Error("Operator user is not active");
  }

  return operatorSessionSchema.parse({
    accessToken: session.accessToken,
    refreshToken: session.refreshToken,
    expiresAt: session.expiresAt,
    operator
  });
}

function buildApiError(requestId: string, code: string, message: string) {
  return apiErrorSchema.parse({
    code,
    message,
    requestId
  });
}

function authorizeGatewayRequest(
  request: { headers: unknown; id: string },
  gatewayToken: string | undefined
) {
  if (!gatewayToken) {
    return {
      ok: false as const,
      statusCode: 503,
      body: buildApiError(
        request.id,
        "GATEWAY_ACCESS_NOT_CONFIGURED",
        "GATEWAY_INTERNAL_API_TOKEN must be configured before accepting gateway requests"
      )
    };
  }

  const parsedHeaders = gatewayHeadersSchema.safeParse(request.headers);
  const providedToken = parsedHeaders.success ? parsedHeaders.data["x-gateway-token"] : undefined;
  if (providedToken && secretsMatch(gatewayToken, providedToken)) {
    return { ok: true as const };
  }

  return {
    ok: false as const,
    statusCode: 401,
    body: buildApiError(request.id, "UNAUTHORIZED_GATEWAY_REQUEST", "Gateway token is invalid")
  };
}

function logIdentityMutation(
  request: { id: string; log: { info(payload: Record<string, unknown>, message: string): void } },
  message: string,
  details: Record<string, unknown>
) {
  request.log.info(
    {
      requestId: request.id,
      ...details
    },
    message
  );
}

async function resolveOperatorFromBearer(params: {
  repository: IdentityRepository;
  authorizationHeader: string | undefined;
}) {
  if (!params.authorizationHeader?.startsWith("Bearer ")) {
    return undefined;
  }

  const accessToken = params.authorizationHeader.slice("Bearer ".length);
  const session = await params.repository.getOperatorSessionByAccessToken(accessToken);
  if (!session) {
    return undefined;
  }

  const operator = await params.repository.getOperatorUserById(session.operatorUserId);
  if (!operator || !operator.active) {
    return undefined;
  }

  return operator;
}

export type RegisterRoutesOptions = {
  allowDevOperatorAccess?: boolean;
  mailSender?: MailSender;
  repository?: IdentityRepository;
};

export async function registerRoutes(app: FastifyInstance, options: RegisterRoutesOptions = {}) {
  const repository = options.repository ?? (await createIdentityRepository(app.log));
  const mailSender = options.mailSender ?? createMailSender({ logger: app.log });
  const gatewayApiToken = process.env.GATEWAY_INTERNAL_API_TOKEN?.trim() || undefined;
  const passkeyConfig = loadPasskeyConfig();
  const rateLimitWindowMs = toPositiveInteger(process.env.IDENTITY_RATE_LIMIT_WINDOW_MS, defaultRateLimitWindowMs);
  const magicLinkExpiryMinutes = toPositiveInteger(process.env.MAGIC_LINK_EXPIRY_MINUTES, 15);
  const magicLinkBaseUrl = process.env.MAGIC_LINK_BASE_URL?.trim() || "http://localhost:8080";
  const operatorMagicLinkBaseUrl = process.env.OPERATOR_MAGIC_LINK_BASE_URL?.trim() || "http://localhost:5173";
  const allowDevOperatorAccess =
    options.allowDevOperatorAccess ??
    (process.env.ALLOW_DEV_OPERATOR_LOGIN === "true" || process.env.NODE_ENV !== "production");
  const appleSignInVerificationEnabled = process.env.APPLE_SIGN_IN_VERIFY === "true";
  const authWriteRateLimit = {
    max: toPositiveInteger(process.env.IDENTITY_RATE_LIMIT_AUTH_WRITE_MAX, defaultAuthWriteRateLimitMax),
    timeWindow: rateLimitWindowMs
  };
  const authReadRateLimit = {
    max: toPositiveInteger(process.env.IDENTITY_RATE_LIMIT_AUTH_READ_MAX, defaultAuthReadRateLimitMax),
    timeWindow: rateLimitWindowMs
  };
  const passkeyChallengeRateLimit = {
    max: toPositiveInteger(
      process.env.IDENTITY_RATE_LIMIT_PASSKEY_CHALLENGE_MAX,
      defaultPasskeyChallengeRateLimitMax
    ),
    timeWindow: rateLimitWindowMs
  };
  const passkeyVerifyRateLimit = {
    max: toPositiveInteger(process.env.IDENTITY_RATE_LIMIT_PASSKEY_VERIFY_MAX, defaultPasskeyVerifyRateLimitMax),
    timeWindow: rateLimitWindowMs
  };

  app.addHook("onClose", async () => {
    await repository.close();
  });

  app.get("/health", async () => ({ status: "ok", service: "identity" }));
  app.get("/ready", async (_request, reply) => {
    try {
      await repository.pingDb();
      return { status: "ready", service: "identity", persistence: repository.backend };
    } catch {
      reply.status(503);
      return { status: "unavailable", service: "identity", error: "Database unavailable" };
    }
  });

  app.post(
    "/v1/auth/apple/exchange",
    {
      preHandler: app.rateLimit(authWriteRateLimit)
    },
    async (request, reply) => {
      const input = appleExchangeRequestSchema.parse(request.body);

      if (appleSignInVerificationEnabled) {
        // Apple verification is intentionally fail-closed when explicitly enabled. Until full JWKS
        // signature verification exists, we reject these requests instead of accepting unverifiable tokens.
        app.log.warn(
          {
            requestId: request.id
          },
          "Apple Sign-In verification is enabled, but full JWT verification has not been implemented yet"
        );
        return reply.status(503).send(
          buildApiError(
            request.id,
            "APPLE_VERIFICATION_UNAVAILABLE",
            "Apple Sign-In verification is enabled but not yet implemented"
          )
        );
      }

      if (input.identityToken) {
        const claims = extractAppleTokenClaims(input.identityToken);
        if (claims.sub) {
          const userId = await repository.findOrCreateUserByAppleSub(claims.sub, claims.email);
          return issueSession({
            repository,
            seed: input.nonce,
            userId,
            authMethod: "apple"
          });
        }

        app.log.warn(
          {
            requestId: request.id
          },
          "Apple Sign-In token was present but did not contain a usable sub claim"
        );
        return reply.status(401).send(
          buildApiError(
            request.id,
            "INVALID_APPLE_IDENTITY",
            "Apple Sign-In token is invalid or missing a required subject claim"
          )
        );
      } else {
        app.log.warn(
          {
            requestId: request.id
          },
          "Apple Sign-In request omitted identityToken"
        );
        return reply
          .status(401)
          .send(buildApiError(request.id, "INVALID_APPLE_IDENTITY", "Apple Sign-In identity token is required"));
      }
    }
  );

  app.post(
    "/v1/auth/passkey/register/challenge",
    {
      preHandler: app.rateLimit(passkeyChallengeRateLimit)
    },
    async (request, reply) => {
      const input = passkeyChallengeRequestSchema.parse(request.body ?? {});
      if (!input.userId) {
        return reply
          .status(400)
          .send(buildApiError(request.id, "INVALID_USER_CONTEXT", "userId is required for passkey registration"));
      }

      const userId = input.userId;
      const existingCredentials = await repository.listPasskeyCredentialsForUser(userId);
      const options = await generateRegistrationOptions({
        rpID: passkeyConfig.rpId,
        rpName: passkeyConfig.rpName,
        userID: Buffer.from(userId, "utf8"),
        userName: `${userId}@gazelle.local`,
        timeout: passkeyConfig.timeoutMs,
        attestationType: "none",
        authenticatorSelection: {
          residentKey: "preferred",
          userVerification: "preferred"
        },
        excludeCredentials: existingCredentials.map((credential) => ({
          id: credential.credentialId,
          transports: toPasskeyTransports(credential.transports)
        }))
      });
      const challenge = passkeyChallengeResponseSchema.parse({
        challenge: options.challenge,
        rpId: passkeyConfig.rpId,
        timeoutMs: passkeyConfig.timeoutMs
      });

      await repository.savePasskeyChallenge({
        challenge: challenge.challenge,
        flow: "register",
        userId,
        rpId: challenge.rpId,
        timeoutMs: challenge.timeoutMs,
        expiresAt: new Date(Date.now() + challenge.timeoutMs).toISOString()
      });
      return challenge;
    }
  );

  // lgtm [js/missing-rate-limiting] - Fastify route-level preHandler rate limiting is applied.
  app.post(
    "/v1/auth/passkey/register/verify",
    {
      preHandler: app.rateLimit(passkeyVerifyRateLimit)
    },
    async (request, reply) => {
      const input = passkeyVerifyRequestSchema.parse(request.body);
      if (!input.response.attestationObject) {
        return reply.status(400).send(
          buildApiError(
            request.id,
            "INVALID_PASSKEY_PAYLOAD",
            "Register verification requires attestationObject in passkey response"
          )
        );
      }

      const challengeValue = extractChallengeFromClientData(input.response.clientDataJSON);
      if (!challengeValue) {
        return reply
          .status(400)
          .send(buildApiError(request.id, "INVALID_PASSKEY_PAYLOAD", "Unable to parse challenge from clientDataJSON"));
      }

      const challenge = await repository.getPasskeyChallenge("register", challengeValue);
      if (!challenge) {
        return reply
          .status(401)
          .send(buildApiError(request.id, "INVALID_PASSKEY_CHALLENGE", "Passkey challenge is invalid or expired"));
      }

      try {
        const verifiedRegistration = await verifyRegistrationResponse({
          response: {
            id: input.id,
            rawId: input.rawId,
            type: input.type,
            response: {
              clientDataJSON: input.response.clientDataJSON,
              attestationObject: input.response.attestationObject,
              transports: toPasskeyTransports(input.response.transports)
            },
            clientExtensionResults: input.clientExtensionResults ?? {}
          },
          expectedChallenge: challenge.challenge,
          expectedOrigin:
            passkeyConfig.expectedOrigins.length === 1 ? passkeyConfig.expectedOrigins[0] : passkeyConfig.expectedOrigins,
          expectedRPID: challenge.rpId,
          requireUserVerification: false
        });

        if (!verifiedRegistration.verified || !verifiedRegistration.registrationInfo) {
          return reply
            .status(401)
            .send(buildApiError(request.id, "PASSKEY_VERIFICATION_FAILED", "Passkey registration verification failed"));
        }

        if (!challenge.userId) {
          return reply
            .status(409)
            .send(
              buildApiError(
                request.id,
                "PASSKEY_USER_CONTEXT_MISSING",
                "Passkey registration challenge is missing user context"
              )
            );
        }

        const userId = challenge.userId;
        await repository.savePasskeyCredential({
          credentialId: verifiedRegistration.registrationInfo.credential.id,
          userId,
          webauthnUserId: userId,
          publicKey: Buffer.from(verifiedRegistration.registrationInfo.credential.publicKey).toString("base64url"),
          counter: verifiedRegistration.registrationInfo.credential.counter,
          transports: toPasskeyTransports(input.response.transports) ?? [],
          deviceType: verifiedRegistration.registrationInfo.credentialDeviceType,
          backedUp: verifiedRegistration.registrationInfo.credentialBackedUp
        });
        await repository.markPasskeyChallengeConsumed(challenge.challenge);

        return issueSession({
          repository,
          seed: `passkey-register-${verifiedRegistration.registrationInfo.credential.id}`,
          userId,
          authMethod: "passkey-register"
        });
      } catch (error) {
        app.log.warn({ error, requestId: request.id }, "passkey register verify failed");
        return reply
          .status(401)
          .send(buildApiError(request.id, "PASSKEY_VERIFICATION_FAILED", "Passkey registration verification failed"));
      }
    }
  );

  // lgtm [js/missing-rate-limiting] - Fastify route-level preHandler rate limiting is applied.
  app.post(
    "/v1/auth/passkey/auth/challenge",
    {
      preHandler: app.rateLimit(passkeyChallengeRateLimit)
    },
    async (request) => {
      const input = passkeyChallengeRequestSchema.parse(request.body ?? {});
      const credentials = input.userId ? await repository.listPasskeyCredentialsForUser(input.userId) : [];
      const options = await generateAuthenticationOptions({
        rpID: passkeyConfig.rpId,
        timeout: passkeyConfig.timeoutMs,
        userVerification: "preferred",
        allowCredentials:
          credentials.length > 0
            ? credentials.map((credential) => ({
                id: credential.credentialId,
                transports: toPasskeyTransports(credential.transports)
              }))
            : undefined
      });
      const challenge = passkeyChallengeResponseSchema.parse({
        challenge: options.challenge,
        rpId: passkeyConfig.rpId,
        timeoutMs: passkeyConfig.timeoutMs
      });

      await repository.savePasskeyChallenge({
        challenge: challenge.challenge,
        flow: "auth",
        userId: input.userId,
        rpId: challenge.rpId,
        timeoutMs: challenge.timeoutMs,
        expiresAt: new Date(Date.now() + challenge.timeoutMs).toISOString()
      });
      return challenge;
    }
  );

  // lgtm [js/missing-rate-limiting] - Fastify route-level preHandler rate limiting is applied.
  app.post(
    "/v1/auth/passkey/auth/verify",
    {
      preHandler: app.rateLimit(passkeyVerifyRateLimit)
    },
    async (request, reply) => {
      const input = passkeyVerifyRequestSchema.parse(request.body);
      if (!input.response.authenticatorData || !input.response.signature) {
        return reply.status(400).send(
          buildApiError(
            request.id,
            "INVALID_PASSKEY_PAYLOAD",
            "Authentication verification requires authenticatorData and signature"
          )
        );
      }

      const challengeValue = extractChallengeFromClientData(input.response.clientDataJSON);
      if (!challengeValue) {
        return reply
          .status(400)
          .send(buildApiError(request.id, "INVALID_PASSKEY_PAYLOAD", "Unable to parse challenge from clientDataJSON"));
      }

      const challenge = await repository.getPasskeyChallenge("auth", challengeValue);
      if (!challenge) {
        return reply
          .status(401)
          .send(buildApiError(request.id, "INVALID_PASSKEY_CHALLENGE", "Passkey challenge is invalid or expired"));
      }

      const credential = await repository.getPasskeyCredential(input.id);
      if (!credential) {
        return reply
          .status(401)
          .send(buildApiError(request.id, "UNKNOWN_PASSKEY_CREDENTIAL", "Passkey credential is not registered"));
      }

      if (challenge.userId && challenge.userId !== credential.userId) {
        return reply
          .status(401)
          .send(buildApiError(request.id, "INVALID_PASSKEY_CREDENTIAL", "Passkey credential does not match user"));
      }

      try {
        const verifiedAuthentication = await verifyAuthenticationResponse({
          response: {
            id: input.id,
            rawId: input.rawId,
            type: input.type,
            response: {
              clientDataJSON: input.response.clientDataJSON,
              authenticatorData: input.response.authenticatorData,
              signature: input.response.signature,
              userHandle: input.response.userHandle ?? undefined
            },
            clientExtensionResults: input.clientExtensionResults ?? {}
          },
          expectedChallenge: challenge.challenge,
          expectedOrigin:
            passkeyConfig.expectedOrigins.length === 1 ? passkeyConfig.expectedOrigins[0] : passkeyConfig.expectedOrigins,
          expectedRPID: challenge.rpId,
          credential: {
            id: credential.credentialId,
            publicKey: Buffer.from(credential.publicKey, "base64url"),
            counter: credential.counter,
            transports: toPasskeyTransports(credential.transports)
          },
          requireUserVerification: false
        });

        if (!verifiedAuthentication.verified || !verifiedAuthentication.authenticationInfo) {
          return reply
            .status(401)
            .send(buildApiError(request.id, "PASSKEY_VERIFICATION_FAILED", "Passkey authentication verification failed"));
        }

        await repository.updatePasskeyCredentialCounter(
          credential.credentialId,
          verifiedAuthentication.authenticationInfo.newCounter
        );
        await repository.markPasskeyChallengeConsumed(challenge.challenge);

        return issueSession({
          repository,
          seed: `passkey-auth-${credential.credentialId}`,
          userId: credential.userId,
          authMethod: "passkey-auth"
        });
      } catch (error) {
        app.log.warn({ error, requestId: request.id }, "passkey auth verify failed");
        return reply
          .status(401)
          .send(buildApiError(request.id, "PASSKEY_VERIFICATION_FAILED", "Passkey authentication verification failed"));
      }
    }
  );

  app.post(
    "/v1/auth/magic-link/request",
    {
      preHandler: app.rateLimit(authWriteRateLimit)
    },
    async (request, reply) => {
      const input = magicLinkRequestSchema.parse(request.body);
      const token = randomUUID();
      const expiresAt = new Date(Date.now() + magicLinkExpiryMinutes * 60 * 1000).toISOString();
      const magicLinkUrl = buildMagicLinkUrl(magicLinkBaseUrl, token);

      await repository.saveMagicLink({
        token,
        email: input.email,
        expiresAt
      });

      try {
        await mailSender.sendMagicLink({
          to: input.email,
          magicLinkUrl
        });
      } catch (error) {
        app.log.error({ error, email: input.email, requestId: request.id }, "magic link delivery failed");
        return reply.status(503).send(
          buildApiError(
            request.id,
            "MAGIC_LINK_DELIVERY_FAILED",
            "Unable to deliver magic link at this time"
          )
        );
      }

      return { success: true as const };
    }
  );

  app.post(
    "/v1/auth/magic-link/verify",
    {
      preHandler: app.rateLimit(authWriteRateLimit)
    },
    async (request, reply) => {
      const input = magicLinkVerifySchema.parse(request.body);

      const magicLink = await repository.getMagicLink(input.token);
      if (!magicLink) {
        return reply
          .status(401)
          .send(buildApiError(request.id, "INVALID_MAGIC_LINK", "Magic link is invalid or unavailable"));
      }

      if (magicLink.consumedAt || Date.parse(magicLink.expiresAt) <= Date.now()) {
        return reply
          .status(401)
          .send(buildApiError(request.id, "MAGIC_LINK_EXPIRED", "Magic link has expired or was already used"));
      }

      const userId = magicLink.userId ?? (await repository.findOrCreateUserByEmail(magicLink.email));
      await repository.consumeMagicLink(input.token, userId);

      return issueSession({
        repository,
        seed: input.token,
        userId,
        authMethod: "magic-link"
      });
    }
  );

  app.post(
    "/v1/auth/refresh",
    {
      preHandler: app.rateLimit(authWriteRateLimit)
    },
    async (request, reply) => {
      const input = refreshRequestSchema.parse(request.body);
      const rotatedSession = await repository.rotateRefreshSession(
        input.refreshToken,
        (userId) => buildStoredSession(input.refreshToken, userId),
        "refresh"
      );
      if (!rotatedSession) {
        return reply.status(401).send(
          apiErrorSchema.parse({
            code: "INVALID_REFRESH_TOKEN",
            message: "Refresh token is invalid or expired",
            requestId: request.id
          })
        );
      }

      logIdentityMutation(request, "customer session rotated", {
        userId: rotatedSession.userId
      });
      return rotatedSession;
    }
  );

  app.post(
    "/v1/auth/logout",
    {
      preHandler: app.rateLimit(authWriteRateLimit)
    },
    async (request) => {
      const input = logoutRequestSchema.parse(request.body);
      await repository.revokeByRefreshToken(input.refreshToken);
      logIdentityMutation(request, "customer session revoked", {});
      return { success: true as const };
    }
  );

  app.get(
    "/v1/auth/me",
    {
      preHandler: app.rateLimit(authReadRateLimit)
    },
    async (request, reply) => {
      const parsed = authHeaderSchema.safeParse(request.headers);

      if (!parsed.success || !parsed.data.authorization) {
        return reply.status(401).send(
          apiErrorSchema.parse({
            code: "UNAUTHORIZED",
            message: "Missing or invalid auth token",
            requestId: request.id
          })
        );
      }

      const accessToken = parsed.data.authorization.slice("Bearer ".length);
      const session = await repository.getSessionByAccessToken(accessToken);
      if (!session) {
        return reply.status(401).send(
          apiErrorSchema.parse({
            code: "UNAUTHORIZED",
            message: "Missing or invalid auth token",
            requestId: request.id
          })
        );
      }

      return meResponseSchema.parse({
        userId: session.userId,
        email: "owner@gazellecoffee.com",
        methods: ["apple", "passkey", "magic-link"]
      });
    }
  );

  app.post(
    "/v1/operator/auth/sign-in",
    {
      preHandler: app.rateLimit(authWriteRateLimit)
    },
    async (request, reply) => {
      const input = operatorPasswordSignInSchema.parse(request.body);
      const operator = await repository.verifyOperatorPassword(input.email, input.password);

      if (!operator) {
        return reply
          .status(401)
          .send(buildApiError(request.id, "INVALID_OPERATOR_CREDENTIALS", "Email or password is incorrect"));
      }

      const session = await issueOperatorSession({
        repository,
        seed: `password:${operator.operatorUserId}:${Date.now()}`,
        operatorUserId: operator.operatorUserId,
        authMethod: "password"
      });
      logIdentityMutation(request, "operator session issued", {
        operatorUserId: session.operator.operatorUserId,
        email: session.operator.email,
        role: session.operator.role,
        locationId: session.operator.locationId,
        authMethod: "password"
      });
      return session;
    }
  );

  app.get(
    "/v1/operator/auth/providers",
    {
      preHandler: app.rateLimit(authReadRateLimit)
    },
    async () => {
      return operatorAuthProvidersSchema.parse({
        google: {
          configured: Boolean(loadGoogleOperatorConfig())
        }
      });
    }
  );

  app.get(
    "/v1/operator/auth/google/start",
    {
      preHandler: app.rateLimit(authReadRateLimit)
    },
    async (request, reply) => {
      const config = loadGoogleOperatorConfig();
      if (!config) {
        return reply
          .status(503)
          .send(buildApiError(request.id, "GOOGLE_SSO_NOT_CONFIGURED", "Google Sign-In is not configured"));
      }

      const input = googleOAuthStartRequestSchema.parse(request.query);
      if (!isAllowedGoogleRedirectUri(config, input.redirectUri)) {
        return reply
          .status(400)
          .send(buildApiError(request.id, "INVALID_REDIRECT_URI", "Google redirect URI is not allowed"));
      }

      const state = buildGoogleOAuthState({
        redirectUri: input.redirectUri,
        stateSecret: config.stateSecret
      });

      return googleOAuthStartResponseSchema.parse({
        authorizeUrl: buildGoogleAuthorizeUrl({
          config,
          redirectUri: input.redirectUri,
          state
        }),
        stateExpiresAt: new Date(Date.now() + config.stateTtlMs).toISOString()
      });
    }
  );

  app.post(
    "/v1/operator/auth/google/exchange",
    {
      preHandler: app.rateLimit(authWriteRateLimit)
    },
    async (request, reply) => {
      const config = loadGoogleOperatorConfig();
      if (!config) {
        return reply
          .status(503)
          .send(buildApiError(request.id, "GOOGLE_SSO_NOT_CONFIGURED", "Google Sign-In is not configured"));
      }

      const input = operatorGoogleExchangeRequestSchema.parse(request.body);
      if (!isAllowedGoogleRedirectUri(config, input.redirectUri)) {
        return reply
          .status(400)
          .send(buildApiError(request.id, "INVALID_REDIRECT_URI", "Google redirect URI is not allowed"));
      }

      const parsedState = parseGoogleOAuthState({
        state: input.state,
        stateSecret: config.stateSecret,
        maxAgeMs: config.stateTtlMs
      });
      if (!parsedState || parsedState.redirectUri !== input.redirectUri) {
        return reply
          .status(401)
          .send(buildApiError(request.id, "INVALID_GOOGLE_STATE", "Google Sign-In state is invalid or expired"));
      }

      let tokenResponse: Response;
      try {
        tokenResponse = await fetch(config.tokenEndpoint, {
          method: "POST",
          headers: {
            "content-type": "application/x-www-form-urlencoded"
          },
          body: new URLSearchParams({
            code: input.code,
            client_id: config.clientId,
            client_secret: config.clientSecret,
            redirect_uri: input.redirectUri,
            grant_type: "authorization_code"
          })
        });
      } catch (error) {
        request.log.error({ error, requestId: request.id }, "Google token exchange failed before response");
        return reply
          .status(502)
          .send(buildApiError(request.id, "GOOGLE_TOKEN_EXCHANGE_FAILED", "Google token exchange failed"));
      }

      const parsedTokenBody = parseJsonSafely(await tokenResponse.text());
      if (!tokenResponse.ok) {
        return reply.status(502).send(
          buildApiError(request.id, "GOOGLE_TOKEN_EXCHANGE_FAILED", "Google token exchange failed")
        );
      }

      const parsedToken = googleTokenResponseSchema.safeParse(parsedTokenBody);
      if (!parsedToken.success) {
        return reply
          .status(502)
          .send(buildApiError(request.id, "GOOGLE_TOKEN_INVALID", "Google token response was invalid"));
      }

      let userInfoResponse: Response;
      try {
        userInfoResponse = await fetch(config.userInfoEndpoint, {
          method: "GET",
          headers: {
            authorization: `Bearer ${parsedToken.data.access_token}`
          }
        });
      } catch (error) {
        request.log.error({ error, requestId: request.id }, "Google userinfo request failed before response");
        return reply
          .status(502)
          .send(buildApiError(request.id, "GOOGLE_USERINFO_FAILED", "Google user info lookup failed"));
      }

      const parsedUserInfoBody = parseJsonSafely(await userInfoResponse.text());
      if (!userInfoResponse.ok) {
        return reply
          .status(502)
          .send(buildApiError(request.id, "GOOGLE_USERINFO_FAILED", "Google user info lookup failed"));
      }

      const parsedUserInfo = googleUserInfoSchema.safeParse(parsedUserInfoBody);
      if (!parsedUserInfo.success) {
        return reply
          .status(502)
          .send(buildApiError(request.id, "GOOGLE_USERINFO_INVALID", "Google user info response was invalid"));
      }

      const operator = await repository.resolveOperatorUserForGoogleSignIn({
        googleSub: parsedUserInfo.data.sub,
        email: parsedUserInfo.data.email,
        emailVerified: normalizeGoogleEmailVerified(parsedUserInfo.data.email_verified)
      });
      if (!operator || !operator.active) {
        return reply
          .status(404)
          .send(buildApiError(request.id, "OPERATOR_ACCESS_NOT_GRANTED", "No client dashboard access exists for this Google account"));
      }

      const session = await issueOperatorSession({
        repository,
        seed: `google:${parsedUserInfo.data.sub}:${Date.now()}`,
        operatorUserId: operator.operatorUserId,
        authMethod: "google"
      });
      logIdentityMutation(request, "operator session issued", {
        operatorUserId: session.operator.operatorUserId,
        email: session.operator.email,
        role: session.operator.role,
        locationId: session.operator.locationId,
        authMethod: "google"
      });
      return session;
    }
  );

  app.post(
    "/v1/operator/auth/magic-link/request",
    {
      preHandler: app.rateLimit(authWriteRateLimit)
    },
    async (request, reply) => {
      const input = magicLinkRequestSchema.parse(request.body);
      const operator = await repository.getOperatorUserByEmail(input.email);
      if (!operator || !operator.active) {
        return reply.status(404).send(
          buildApiError(request.id, "OPERATOR_ACCESS_NOT_GRANTED", "No operator access exists for that email address")
        );
      }

      const token = randomUUID();
      const expiresAt = new Date(Date.now() + magicLinkExpiryMinutes * 60 * 1000).toISOString();
      const magicLinkUrl = buildOperatorMagicLinkUrl(operatorMagicLinkBaseUrl, token);

      await repository.saveOperatorMagicLink({
        token,
        email: operator.email,
        expiresAt
      });

      try {
        await mailSender.sendMagicLink({
          to: operator.email,
          magicLinkUrl
        });
      } catch (error) {
        app.log.error({ error, email: operator.email, requestId: request.id }, "operator magic link delivery failed");
        return reply
          .status(503)
          .send(buildApiError(request.id, "MAGIC_LINK_DELIVERY_FAILED", "Unable to deliver magic link at this time"));
      }

      return { success: true as const };
    }
  );

  app.post(
    "/v1/operator/auth/magic-link/verify",
    {
      preHandler: app.rateLimit(authWriteRateLimit)
    },
    async (request, reply) => {
      const input = magicLinkVerifySchema.parse(request.body);
      const magicLink = await repository.getOperatorMagicLink(input.token);

      if (!magicLink) {
        return reply
          .status(401)
          .send(buildApiError(request.id, "INVALID_MAGIC_LINK", "Magic link is invalid or unavailable"));
      }

      if (magicLink.consumedAt || Date.parse(magicLink.expiresAt) <= Date.now()) {
        return reply
          .status(401)
          .send(buildApiError(request.id, "MAGIC_LINK_EXPIRED", "Magic link has expired or was already used"));
      }

      const operator = magicLink.operatorUserId
        ? await repository.getOperatorUserById(magicLink.operatorUserId)
        : await repository.getOperatorUserByEmail(magicLink.email);

      if (!operator || !operator.active) {
        return reply
          .status(404)
          .send(buildApiError(request.id, "OPERATOR_ACCESS_NOT_GRANTED", "Operator access is not active"));
      }

      await repository.consumeOperatorMagicLink(input.token, operator.operatorUserId);
      return issueOperatorSession({
        repository,
        seed: input.token,
        operatorUserId: operator.operatorUserId,
        authMethod: "magic-link"
      });
    }
  );

  app.post(
    "/v1/operator/auth/dev-access",
    {
      preHandler: app.rateLimit(authWriteRateLimit)
    },
    async (request, reply) => {
      if (!allowDevOperatorAccess) {
        return reply
          .status(404)
          .send(buildApiError(request.id, "DEV_OPERATOR_ACCESS_DISABLED", "Dev operator access is disabled"));
      }

      const input = operatorDevAccessRequestSchema.parse(request.body);
      const operator = await repository.getOperatorUserByEmail(input.email);

      if (!operator || !operator.active) {
        return reply.status(404).send(
          buildApiError(request.id, "OPERATOR_ACCESS_NOT_GRANTED", "No operator access exists for that email address")
        );
      }

      const session = await issueOperatorSession({
        repository,
        seed: `dev-access:${operator.email}:${Date.now()}`,
        operatorUserId: operator.operatorUserId,
        authMethod: "password"
      });
      logIdentityMutation(request, "operator session issued", {
        operatorUserId: session.operator.operatorUserId,
        email: session.operator.email,
        role: session.operator.role,
        locationId: session.operator.locationId,
        authMethod: "dev-access"
      });
      return session;
    }
  );

  app.post(
    "/v1/operator/auth/refresh",
    {
      preHandler: app.rateLimit(authWriteRateLimit)
    },
    async (request, reply) => {
      const input = refreshRequestSchema.parse(request.body);
      const rotatedSession = await repository.rotateOperatorRefreshSession(
        input.refreshToken,
        (operatorUserId) => buildStoredOperatorSession(input.refreshToken, operatorUserId),
        "refresh"
      );

      if (!rotatedSession) {
        return reply
          .status(401)
          .send(buildApiError(request.id, "INVALID_REFRESH_TOKEN", "Refresh token is invalid or expired"));
      }

      const operator = await repository.getOperatorUserById(rotatedSession.operatorUserId);
      if (!operator || !operator.active) {
        return reply
          .status(401)
          .send(buildApiError(request.id, "OPERATOR_ACCESS_NOT_GRANTED", "Operator access is not active"));
      }

      const session = operatorSessionSchema.parse({
        accessToken: rotatedSession.accessToken,
        refreshToken: rotatedSession.refreshToken,
        expiresAt: rotatedSession.expiresAt,
        operator
      });
      logIdentityMutation(request, "operator session rotated", {
        operatorUserId: session.operator.operatorUserId,
        email: session.operator.email,
        role: session.operator.role,
        locationId: session.operator.locationId
      });
      return session;
    }
  );

  app.post(
    "/v1/operator/auth/logout",
    {
      preHandler: app.rateLimit(authWriteRateLimit)
    },
    async (request) => {
      const input = logoutRequestSchema.parse(request.body);
      await repository.revokeOperatorByRefreshToken(input.refreshToken);
      logIdentityMutation(request, "operator session revoked", {});
      return { success: true as const };
    }
  );

  app.get(
    "/v1/operator/auth/me",
    {
      preHandler: app.rateLimit(authReadRateLimit)
    },
    async (request, reply) => {
      const parsed = authHeaderSchema.safeParse(request.headers);
      const operator = await resolveOperatorFromBearer({
        repository,
        authorizationHeader: parsed.success ? parsed.data.authorization : undefined
      });

      if (!operator) {
        return reply.status(401).send(buildApiError(request.id, "UNAUTHORIZED", "Missing or invalid auth token"));
      }

      return operatorMeResponseSchema.parse(operator);
    }
  );

  app.get(
    "/v1/operator/users",
    {
      preHandler: app.rateLimit(authReadRateLimit)
    },
    async (request, reply) => {
      const parsed = authHeaderSchema.safeParse(request.headers);
      const operator = await resolveOperatorFromBearer({
        repository,
        authorizationHeader: parsed.success ? parsed.data.authorization : undefined
      });

      if (!operator) {
        return reply.status(401).send(buildApiError(request.id, "UNAUTHORIZED", "Missing or invalid auth token"));
      }

      if (!operator.capabilities.includes("staff:read")) {
        return reply.status(403).send(buildApiError(request.id, "FORBIDDEN", "Operator is missing required capability"));
      }

      return operatorUserListResponseSchema.parse({
        users: await repository.listOperatorUsers(operator.locationId)
      });
    }
  );

  app.post(
    "/v1/operator/users",
    {
      preHandler: app.rateLimit(authWriteRateLimit)
    },
    async (request, reply) => {
      const parsed = authHeaderSchema.safeParse(request.headers);
      const operator = await resolveOperatorFromBearer({
        repository,
        authorizationHeader: parsed.success ? parsed.data.authorization : undefined
      });

      if (!operator) {
        return reply.status(401).send(buildApiError(request.id, "UNAUTHORIZED", "Missing or invalid auth token"));
      }

      if (!operator.capabilities.includes("staff:write")) {
        return reply.status(403).send(buildApiError(request.id, "FORBIDDEN", "Operator is missing required capability"));
      }

      const input = operatorUserCreateSchema.parse(request.body);
      const existing = await repository.getOperatorUserByEmail(input.email);
      if (existing) {
        return reply
          .status(409)
          .send(buildApiError(request.id, "OPERATOR_EMAIL_ALREADY_EXISTS", "A team member with that email already exists"));
      }

      const created = await repository.createOperatorUser({
        ...input,
        locationId: operator.locationId || defaultOperatorLocationId
      });
      logIdentityMutation(request, "operator user created", {
        actorOperatorUserId: operator.operatorUserId,
        targetOperatorUserId: created.operatorUserId,
        targetRole: created.role,
        locationId: created.locationId
      });
      return created;
    }
  );

  app.patch(
    "/v1/operator/users/:operatorUserId",
    {
      preHandler: app.rateLimit(authWriteRateLimit)
    },
    async (request, reply) => {
      const parsed = authHeaderSchema.safeParse(request.headers);
      const operator = await resolveOperatorFromBearer({
        repository,
        authorizationHeader: parsed.success ? parsed.data.authorization : undefined
      });

      if (!operator) {
        return reply.status(401).send(buildApiError(request.id, "UNAUTHORIZED", "Missing or invalid auth token"));
      }

      if (!operator.capabilities.includes("staff:write")) {
        return reply.status(403).send(buildApiError(request.id, "FORBIDDEN", "Operator is missing required capability"));
      }

      const { operatorUserId } = operatorUserParamsSchema.parse(request.params);
      const input = operatorUserUpdateSchema.parse(request.body);
      if (operator.operatorUserId === operatorUserId && input.active === false) {
        return reply.status(400).send(buildApiError(request.id, "INVALID_OPERATOR_UPDATE", "You cannot deactivate your own account"));
      }

      let updated;
      try {
        updated = await repository.updateOperatorUser(operatorUserId, input);
      } catch (error) {
        if (isOperatorEmailConflictError(error)) {
          return reply
            .status(409)
            .send(buildApiError(request.id, "OPERATOR_EMAIL_ALREADY_EXISTS", "A team member with that email already exists"));
        }

        throw error;
      }

      if (!updated) {
        return reply.status(404).send(buildApiError(request.id, "OPERATOR_NOT_FOUND", "Operator user was not found"));
      }

      logIdentityMutation(request, "operator user updated", {
        actorOperatorUserId: operator.operatorUserId,
        targetOperatorUserId: updated.operatorUserId,
        updatedFields: Object.keys(input),
        locationId: updated.locationId
      });
      return updated;
    }
  );

  app.post("/v1/identity/internal/locations/:locationId/owner/provision", async (request, reply) => {
    const authorization = authorizeGatewayRequest(request, gatewayApiToken);
    if (!authorization.ok) {
      return reply.status(authorization.statusCode).send(authorization.body);
    }

    const { locationId } = internalOwnerProvisionParamsSchema.parse(request.params);
    const input = internalOwnerProvisionRequestSchema.parse(request.body);
    const result = await provisionOwnerAccess(repository, {
      ...input,
      locationId,
      allowInMemory: false
    });

    logIdentityMutation(request, "internal owner provisioned", {
      targetOperatorUserId: result.operator.operatorUserId,
      targetEmail: result.operator.email,
      locationId,
      action: result.action
    });

    return internalOwnerProvisionResponseSchema.parse(result);
  });

  app.post("/v1/auth/internal/ping", async (request) => {
    const parsed = payloadSchema.parse(request.body ?? {});

    return {
      service: "identity",
      accepted: true,
      payload: parsed
    };
  });
}
