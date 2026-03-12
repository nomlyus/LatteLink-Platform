import type { FastifyInstance } from "fastify";
import {
  orderStateDispatchResponseSchema,
  orderStateNotificationSchema,
  pushTokenUpsertResponseSchema,
  pushTokenUpsertSchema
} from "@gazelle/contracts-notifications";
import { z } from "zod";
import { createNotificationsRepository, type OutboxEntry } from "./repository.js";

const payloadSchema = z.object({
  id: z.string().uuid().optional()
});

const userHeadersSchema = z.object({
  "x-user-id": z.string().uuid().optional()
});

const defaultUserId = "123e4567-e89b-12d3-a456-426614174000";
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

function resolveUserId(headers: unknown) {
  const parsed = userHeadersSchema.safeParse(headers);
  if (!parsed.success) {
    return undefined;
  }

  return parsed.data["x-user-id"] ?? defaultUserId;
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
  app.get("/ready", async () => ({
    status: "ready",
    service: "notifications",
    persistence: repository.backend
  }));

  app.put(
    "/v1/devices/push-token",
    {
      preHandler: app.rateLimit(notificationsDeviceWriteRateLimit)
    },
    async (request, reply) => {
      const userId = resolveUserId(request.headers);
      if (!userId) {
        request.log.warn({ requestId: request.id }, "invalid x-user-id header");
        return reply.status(400).send({
          code: "INVALID_USER_CONTEXT",
          message: "x-user-id header must be a UUID when provided",
          requestId: request.id
        });
      }

      const input = pushTokenUpsertSchema.parse(request.body);
      await repository.upsertPushToken(userId, input);

      return pushTokenUpsertResponseSchema.parse({ success: true });
    }
  );

  app.post(
    "/v1/notifications/internal/order-state",
    {
      preHandler: app.rateLimit(notificationsInternalDispatchRateLimit)
    },
    async (request) => {
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
    async (request) => {
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

  app.post("/v1/notifications/internal/ping", async (request) => {
    const parsed = payloadSchema.parse(request.body ?? {});

    return {
      service: "notifications",
      accepted: true,
      payload: parsed
    };
  });
}
