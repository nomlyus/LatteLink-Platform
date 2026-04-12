import { timingSafeEqual } from "node:crypto";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import {
  orderStateDispatchResponseSchema,
  orderStateNotificationSchema,
  pushTokenUpsertResponseSchema,
  pushTokenUpsertSchema
} from "@lattelink/contracts-notifications";
import { z } from "zod";
import { createNotificationsRepository, type OutboxEntry } from "./repository.js";

const payloadSchema = z.object({
  id: z.string().uuid().optional()
});

const userHeadersSchema = z.object({
  "x-user-id": z.string().uuid().optional()
});

const gatewayHeadersSchema = z.object({
  "x-gateway-token": z.string().optional()
});

const internalHeadersSchema = z.object({
  "x-internal-token": z.string().optional()
});

const serviceErrorSchema = z.object({
  code: z.string(),
  message: z.string(),
  requestId: z.string(),
  details: z.record(z.unknown()).optional()
});

const defaultRateLimitWindowMs = 60_000;
const defaultNotificationsDeviceWriteRateLimitMax = 120;
const defaultNotificationsInternalDispatchRateLimitMax = 180;
const defaultNotificationsInternalOutboxProcessRateLimitMax = 240;
const outboxBatchMax = 200;
const outboxDefaultBatch = 50;
const outboxMaxAttempts = 3;
const outboxRetryBaseMs = 1_000;

const outboxProcessRequestSchema = z.object({
  batchSize: z.number().int().positive().max(outboxBatchMax).optional(),
  nowIso: z.string().datetime().optional()
});

const outboxProcessResponseSchema = z.object({
  processed: z.number().int().nonnegative(),
  dispatched: z.number().int().nonnegative(),
  retried: z.number().int().nonnegative(),
  failed: z.number().int().nonnegative()
});

function resolveUserId(request: FastifyRequest, reply: FastifyReply) {
  const parsed = userHeadersSchema.safeParse(request.headers);
  if (!parsed.success) {
    sendError(reply, {
      statusCode: 400,
      code: "INVALID_USER_CONTEXT",
      message: "x-user-id header must be a UUID when provided",
      requestId: request.id,
      details: parsed.error.flatten()
    });
    return undefined;
  }

  if (!parsed.data["x-user-id"]) {
    sendError(reply, {
      statusCode: 400,
      code: "INVALID_USER_CONTEXT",
      message: "x-user-id header is required",
      requestId: request.id
    });
    return undefined;
  }

  return parsed.data["x-user-id"];
}

function trimToUndefined(value: string | undefined) {
  const next = value?.trim();
  return next && next.length > 0 ? next : undefined;
}

function sendError(
  reply: FastifyReply,
  input: {
    statusCode: number;
    code: string;
    message: string;
    requestId: string;
    details?: Record<string, unknown>;
  }
) {
  return reply.status(input.statusCode).send(
    serviceErrorSchema.parse({
      code: input.code,
      message: input.message,
      requestId: input.requestId,
      details: input.details
    })
  );
}

function secretsMatch(expected: string, provided: string) {
  const expectedBuffer = Buffer.from(expected, "utf8");
  const providedBuffer = Buffer.from(provided, "utf8");
  if (expectedBuffer.length !== providedBuffer.length) {
    return false;
  }

  return timingSafeEqual(expectedBuffer, providedBuffer);
}

function authorizeGatewayRequest(request: FastifyRequest, reply: FastifyReply, gatewayToken: string | undefined) {
  if (!gatewayToken) {
    sendError(reply, {
      statusCode: 503,
      code: "GATEWAY_ACCESS_NOT_CONFIGURED",
      message: "GATEWAY_INTERNAL_API_TOKEN must be configured before accepting gateway requests",
      requestId: request.id
    });
    return false;
  }

  const parsedHeaders = gatewayHeadersSchema.safeParse(request.headers);
  const providedToken = parsedHeaders.success ? parsedHeaders.data["x-gateway-token"] : undefined;
  if (providedToken && secretsMatch(gatewayToken, providedToken)) {
    return true;
  }

  sendError(reply, {
    statusCode: 401,
    code: "UNAUTHORIZED_GATEWAY_REQUEST",
    message: "Gateway token is invalid",
    requestId: request.id
  });
  return false;
}

function authorizeInternalRequest(request: FastifyRequest, reply: FastifyReply, internalToken: string | undefined) {
  if (!internalToken) {
    sendError(reply, {
      statusCode: 503,
      code: "INTERNAL_ACCESS_NOT_CONFIGURED",
      message: "NOTIFICATIONS_INTERNAL_API_TOKEN must be configured before accepting internal notifications requests",
      requestId: request.id
    });
    return false;
  }

  const parsedHeaders = internalHeadersSchema.safeParse(request.headers);
  const providedToken = parsedHeaders.success ? parsedHeaders.data["x-internal-token"] : undefined;
  if (providedToken && secretsMatch(internalToken, providedToken)) {
    return true;
  }

  sendError(reply, {
    statusCode: 401,
    code: "UNAUTHORIZED_INTERNAL_REQUEST",
    message: "Internal notifications token is invalid",
    requestId: request.id
  });
  return false;
}

function computeRetryDelayMs(nextAttempt: number) {
  return outboxRetryBaseMs * 2 ** Math.max(nextAttempt - 1, 0);
}

function toPositiveInteger(value: string | undefined, fallback: number) {
  const parsed = Number.parseInt(value ?? "", 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }

  return parsed;
}

function simulatePushDispatch(entry: OutboxEntry) {
  const token = entry.expoPushToken.toLowerCase();
  if (token.includes("fail")) {
    throw new Error("simulated push provider failure");
  }
}

export async function registerRoutes(app: FastifyInstance) {
  const gatewayApiToken = trimToUndefined(process.env.GATEWAY_INTERNAL_API_TOKEN);
  const notificationsInternalApiToken = trimToUndefined(process.env.NOTIFICATIONS_INTERNAL_API_TOKEN);
  const repository = await createNotificationsRepository(app.log);
  const notificationsRateLimitWindowMs = toPositiveInteger(
    process.env.NOTIFICATIONS_RATE_LIMIT_WINDOW_MS,
    defaultRateLimitWindowMs
  );
  const notificationsDeviceWriteRateLimit = {
    max: toPositiveInteger(
      process.env.NOTIFICATIONS_RATE_LIMIT_DEVICE_WRITE_MAX,
      defaultNotificationsDeviceWriteRateLimitMax
    ),
    timeWindow: notificationsRateLimitWindowMs
  };
  const notificationsInternalDispatchRateLimit = {
    max: toPositiveInteger(
      process.env.NOTIFICATIONS_RATE_LIMIT_INTERNAL_DISPATCH_MAX,
      defaultNotificationsInternalDispatchRateLimitMax
    ),
    timeWindow: notificationsRateLimitWindowMs
  };
  const notificationsInternalOutboxProcessRateLimit = {
    max: toPositiveInteger(
      process.env.NOTIFICATIONS_RATE_LIMIT_INTERNAL_OUTBOX_PROCESS_MAX,
      defaultNotificationsInternalOutboxProcessRateLimitMax
    ),
    timeWindow: notificationsRateLimitWindowMs
  };

  app.addHook("onClose", async () => {
    await repository.close();
  });

  app.get("/health", async () => ({ status: "ok", service: "notifications" }));
  app.get("/ready", async (_request, reply) => {
    try {
      await repository.pingDb();
      return {
        status: "ready",
        service: "notifications",
        persistence: repository.backend
      };
    } catch {
      reply.status(503);
      return { status: "unavailable", service: "notifications", error: "Database unavailable" };
    }
  });

  app.put(
    "/v1/devices/push-token",
    {
      preHandler: app.rateLimit(notificationsDeviceWriteRateLimit)
    },
    async (request, reply) => {
      if (!authorizeGatewayRequest(request, reply, gatewayApiToken)) {
        return;
      }

      const userId = resolveUserId(request, reply);
      if (!userId) {
        return;
      }

      const input = pushTokenUpsertSchema.parse(request.body);
      await repository.upsertPushToken(userId, input);
      request.log.info(
        {
          requestId: request.id,
          userId,
          deviceId: input.deviceId,
          platform: input.platform
        },
        "push token upserted"
      );

      return pushTokenUpsertResponseSchema.parse({ success: true });
    }
  );

  app.post(
    "/v1/notifications/internal/order-state",
    {
      preHandler: app.rateLimit(notificationsInternalDispatchRateLimit)
    },
    async (request, reply) => {
      if (!authorizeInternalRequest(request, reply, notificationsInternalApiToken)) {
        return;
      }

      const input = orderStateNotificationSchema.parse(request.body);
      const dispatchKey = `${input.userId}:${input.orderId}:${input.status}`;

      const isNewDispatch = await repository.markOrderStateDispatchIfNew({
        dispatchKey,
        payload: input
      });

      if (!isNewDispatch) {
        return orderStateDispatchResponseSchema.parse({
          accepted: true,
          enqueued: 0,
          deduplicated: true
        });
      }

      const recipients = await repository.enqueueOrderStateOutbox(input);
      request.log.info(
        {
          requestId: request.id,
          orderId: input.orderId,
          userId: input.userId,
          status: input.status,
          recipients
        },
        "order-state notification accepted"
      );

      return orderStateDispatchResponseSchema.parse({
        accepted: true,
        enqueued: recipients,
        deduplicated: false
      });
    }
  );

  app.post(
    "/v1/notifications/internal/outbox/process",
    {
      preHandler: app.rateLimit(notificationsInternalOutboxProcessRateLimit)
    },
    async (request, reply) => {
      if (!authorizeInternalRequest(request, reply, notificationsInternalApiToken)) {
        return;
      }

      const input = outboxProcessRequestSchema.parse(request.body ?? {});
      const batchSize = input.batchSize ?? outboxDefaultBatch;
      const nowIso = input.nowIso ?? new Date().toISOString();
      const cycleNowMs = Date.parse(nowIso);
      const entries = await repository.listPendingOutbox(batchSize, nowIso);

      let dispatched = 0;
      let retried = 0;
      let failed = 0;

      for (const entry of entries) {
        try {
          simulatePushDispatch(entry);
          await repository.markOutboxDispatched(entry.id);
          dispatched += 1;
        } catch (error) {
          const normalizedError = error instanceof Error ? error.message : "unknown push dispatch error";
          const nextAttempt = entry.attempts + 1;

          if (nextAttempt >= outboxMaxAttempts) {
            await repository.markOutboxFailed(entry.id, normalizedError);
            failed += 1;
            continue;
          }

          const retryAtIso = new Date(cycleNowMs + computeRetryDelayMs(nextAttempt)).toISOString();
          await repository.markOutboxRetry(entry.id, {
            retryAtIso,
            error: normalizedError
          });
          retried += 1;
        }
      }

      return outboxProcessResponseSchema.parse({
        processed: entries.length,
        dispatched,
        retried,
        failed
      });
    }
  );

  app.post("/v1/notifications/internal/ping", async (request, reply) => {
    if (!authorizeInternalRequest(request, reply, notificationsInternalApiToken)) {
      return;
    }

    const parsed = payloadSchema.parse(request.body ?? {});

    return {
      service: "notifications",
      accepted: true,
      payload: parsed
    };
  });
}
