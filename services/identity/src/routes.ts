import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { randomUUID } from "node:crypto";
import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse
} from "@simplewebauthn/server";
import {
  appleExchangeRequestSchema,
  logoutRequestSchema,
  magicLinkRequestSchema,
  magicLinkVerifySchema,
  meResponseSchema,
  passkeyChallengeRequestSchema,
  passkeyChallengeResponseSchema,
  passkeyVerifyRequestSchema,
  refreshRequestSchema
} from "@gazelle/contracts-auth";
import { apiErrorSchema, authSessionSchema } from "@gazelle/contracts-core";
import { createIdentityRepository, type IdentityRepository } from "./repository.js";

const payloadSchema = z.object({
  id: z.string().uuid().optional()
});

const authHeaderSchema = z.object({
  authorization: z.string().startsWith("Bearer ").optional()
});

const clientDataSchema = z.object({
  challenge: z.string()
});
const passkeyTransportSchema = z.enum(["ble", "cable", "hybrid", "internal", "nfc", "smart-card", "usb"]);

const defaultUserId = "123e4567-e89b-12d3-a456-426614174000";
const defaultPasskeyRpId = "localhost";
const defaultPasskeyRpName = "Gazelle";
const defaultPasskeyTimeoutMs = 60_000;
const defaultRateLimitWindowMs = 60_000;
const defaultAppleExchangeRateLimitMax = 60;
const defaultMagicLinkRequestRateLimitMax = 20;
const defaultMagicLinkVerifyRateLimitMax = 30;
const defaultRefreshRateLimitMax = 90;
const passkeyVerifyRateLimit = { max: 12, timeWindow: 60_000 };
const passkeyChallengeRateLimit = { max: 24, timeWindow: 60_000 };

function parseCommaSeparatedEnv(value: string | undefined) {
  return (value ?? "")
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
}

function toPositiveInteger(value: string | undefined, fallback: number) {
  const parsed = Number.parseInt(value ?? "", 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }

  return parsed;
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

function buildSession(seed: string, userId: string) {
  const tokenSuffix = `${seed}-${randomUUID()}`;
  return authSessionSchema.parse({
    accessToken: `access-${tokenSuffix}`,
    refreshToken: `refresh-${tokenSuffix}`,
    expiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
    userId
  });
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
  userId?: string;
  authMethod: "apple" | "passkey-register" | "passkey-auth" | "magic-link" | "refresh";
}) {
  const session = buildSession(params.seed, params.userId ?? defaultUserId);
  await params.repository.saveSession(session, params.authMethod);
  return session;
}

function buildApiError(requestId: string, code: string, message: string) {
  return apiErrorSchema.parse({
    code,
    message,
    requestId
  });
}

export async function registerRoutes(app: FastifyInstance) {
  const repository = await createIdentityRepository(app.log);
  const passkeyConfig = loadPasskeyConfig();
  const identityRateLimitWindowMs = toPositiveInteger(process.env.IDENTITY_RATE_LIMIT_WINDOW_MS, defaultRateLimitWindowMs);
  const appleExchangeRateLimit = {
    max: toPositiveInteger(process.env.IDENTITY_RATE_LIMIT_APPLE_EXCHANGE_MAX, defaultAppleExchangeRateLimitMax),
    timeWindow: identityRateLimitWindowMs
  };
  const magicLinkRequestRateLimit = {
    max: toPositiveInteger(
      process.env.IDENTITY_RATE_LIMIT_MAGIC_LINK_REQUEST_MAX,
      defaultMagicLinkRequestRateLimitMax
    ),
    timeWindow: identityRateLimitWindowMs
  };
  const magicLinkVerifyRateLimit = {
    max: toPositiveInteger(process.env.IDENTITY_RATE_LIMIT_MAGIC_LINK_VERIFY_MAX, defaultMagicLinkVerifyRateLimitMax),
    timeWindow: identityRateLimitWindowMs
  };
  const refreshRateLimit = {
    max: toPositiveInteger(process.env.IDENTITY_RATE_LIMIT_REFRESH_MAX, defaultRefreshRateLimitMax),
    timeWindow: identityRateLimitWindowMs
  };

  app.addHook("onClose", async () => {
    await repository.close();
  });

  app.get("/health", async () => ({ status: "ok", service: "identity" }));
  app.get("/ready", async () => ({ status: "ready", service: "identity", persistence: repository.backend }));

  app.post(
    "/v1/auth/apple/exchange",
    {
      preHandler: app.rateLimit(appleExchangeRateLimit)
    },
    async (request) => {
      const input = appleExchangeRequestSchema.parse(request.body);
      return issueSession({
        repository,
        seed: input.nonce,
        authMethod: "apple"
      });
    }
  );

  app.post("/v1/auth/passkey/register/challenge", async (request) => {
    const input = passkeyChallengeRequestSchema.parse(request.body ?? {});
    const userId = input.userId ?? defaultUserId;
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
  });

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

        const userId = challenge.userId ?? defaultUserId;
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
        app.log.warn({ error }, "passkey register verify failed");
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
        app.log.warn({ error }, "passkey auth verify failed");
        return reply
          .status(401)
          .send(buildApiError(request.id, "PASSKEY_VERIFICATION_FAILED", "Passkey authentication verification failed"));
      }
    }
  );

  app.post(
    "/v1/auth/magic-link/request",
    {
      preHandler: app.rateLimit(magicLinkRequestRateLimit)
    },
    async (request) => {
      const input = magicLinkRequestSchema.parse(request.body);
      app.log.info({ email: input.email }, "magic link requested");
      return { success: true as const };
    }
  );

  app.post(
    "/v1/auth/magic-link/verify",
    {
      preHandler: app.rateLimit(magicLinkVerifyRateLimit)
    },
    async (request) => {
      const input = magicLinkVerifySchema.parse(request.body);
      return issueSession({
        repository,
        seed: input.token,
        authMethod: "magic-link"
      });
    }
  );

  app.post(
    "/v1/auth/refresh",
    {
      preHandler: app.rateLimit(refreshRateLimit)
    },
    async (request, reply) => {
      const input = refreshRequestSchema.parse(request.body);
      const currentSession = await repository.getSessionByRefreshToken(input.refreshToken);
      if (!currentSession) {
        return reply.status(401).send(
          apiErrorSchema.parse({
            code: "INVALID_REFRESH_TOKEN",
            message: "Refresh token is invalid or expired",
            requestId: request.id
          })
        );
      }

      await repository.revokeByRefreshToken(input.refreshToken);
      return issueSession({
        repository,
        seed: input.refreshToken,
        authMethod: "refresh"
      });
    }
  );

  app.post("/v1/auth/logout", async (request) => {
    const input = logoutRequestSchema.parse(request.body);
    await repository.revokeByRefreshToken(input.refreshToken);
    return { success: true as const };
  });

  app.get("/v1/auth/me", async (request, reply) => {
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
