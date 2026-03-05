import type { FastifyInstance } from "fastify";
import { z } from "zod";
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

const payloadSchema = z.object({
  id: z.string().uuid().optional()
});

const authHeaderSchema = z.object({
  authorization: z.string().startsWith("Bearer ").optional()
});

const defaultUserId = "123e4567-e89b-12d3-a456-426614174000";

function buildSession(seed: string) {
  return authSessionSchema.parse({
    accessToken: `access-${seed}`,
    refreshToken: `refresh-${seed}`,
    expiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
    userId: defaultUserId
  });
}

function buildPasskeyChallenge() {
  return passkeyChallengeResponseSchema.parse({
    challenge: crypto.randomUUID(),
    rpId: process.env.PASSKEY_RP_ID ?? "gazellecoffee.com",
    timeoutMs: 60_000
  });
}

export async function registerRoutes(app: FastifyInstance) {
  app.get("/health", async () => ({ status: "ok", service: "identity" }));
  app.get("/ready", async () => ({ status: "ready", service: "identity" }));

  app.post("/v1/auth/apple/exchange", async (request) => {
    const input = appleExchangeRequestSchema.parse(request.body);
    return buildSession(input.nonce);
  });

  app.post("/v1/auth/passkey/register/challenge", async (request) => {
    passkeyChallengeRequestSchema.parse(request.body ?? {});
    return buildPasskeyChallenge();
  });

  app.post("/v1/auth/passkey/register/verify", async (request) => {
    passkeyVerifyRequestSchema.parse(request.body);
    return buildSession("passkey-register");
  });

  app.post("/v1/auth/passkey/auth/challenge", async (request) => {
    passkeyChallengeRequestSchema.parse(request.body ?? {});
    return buildPasskeyChallenge();
  });

  app.post("/v1/auth/passkey/auth/verify", async (request) => {
    passkeyVerifyRequestSchema.parse(request.body);
    return buildSession("passkey-auth");
  });

  app.post("/v1/auth/magic-link/request", async (request) => {
    const input = magicLinkRequestSchema.parse(request.body);
    app.log.info({ email: input.email }, "magic link requested");
    return { success: true as const };
  });

  app.post("/v1/auth/magic-link/verify", async (request) => {
    const input = magicLinkVerifySchema.parse(request.body);
    return buildSession(input.token);
  });

  app.post("/v1/auth/refresh", async (request) => {
    const input = refreshRequestSchema.parse(request.body);
    return buildSession(input.refreshToken);
  });

  app.post("/v1/auth/logout", async (request) => {
    logoutRequestSchema.parse(request.body);
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

    return meResponseSchema.parse({
      userId: defaultUserId,
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
