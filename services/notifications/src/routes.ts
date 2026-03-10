import type { FastifyInstance } from "fastify";
import {
  orderStateDispatchResponseSchema,
  orderStateNotificationSchema,
  pushTokenUpsertResponseSchema,
  pushTokenUpsertSchema
} from "@gazelle/contracts-notifications";
import { z } from "zod";

const payloadSchema = z.object({
  id: z.string().uuid().optional()
});

const userHeadersSchema = z.object({
  "x-user-id": z.string().uuid().optional()
});

const defaultUserId = "123e4567-e89b-12d3-a456-426614174000";

type RegisteredPushToken = z.output<typeof pushTokenUpsertSchema> & {
  userId: string;
  createdAt: string;
  updatedAt: string;
};

const pushTokensByUserId = new Map<string, Map<string, RegisteredPushToken>>();
const dispatchedOrderStates = new Set<string>();

function resolveUserId(headers: unknown) {
  const parsed = userHeadersSchema.safeParse(headers);
  if (!parsed.success) {
    return undefined;
  }

  return parsed.data["x-user-id"] ?? defaultUserId;
}

export async function registerRoutes(app: FastifyInstance) {
  app.get("/health", async () => ({ status: "ok", service: "notifications" }));
  app.get("/ready", async () => ({ status: "ready", service: "notifications" }));

  app.put("/v1/devices/push-token", async (request, reply) => {
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
    const now = new Date().toISOString();
    const userTokens = pushTokensByUserId.get(userId) ?? new Map<string, RegisteredPushToken>();
    const existing = userTokens.get(input.deviceId);

    userTokens.set(input.deviceId, {
      ...input,
      userId,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now
    });
    pushTokensByUserId.set(userId, userTokens);

    return pushTokenUpsertResponseSchema.parse({ success: true });
  });

  app.post("/v1/notifications/internal/order-state", async (request) => {
    const input = orderStateNotificationSchema.parse(request.body);
    const dispatchKey = `${input.userId}:${input.orderId}:${input.status}`;

    if (dispatchedOrderStates.has(dispatchKey)) {
      return orderStateDispatchResponseSchema.parse({
        accepted: true,
        enqueued: 0,
        deduplicated: true
      });
    }

    dispatchedOrderStates.add(dispatchKey);

    const recipients = pushTokensByUserId.get(input.userId)?.size ?? 0;
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
  });

  app.post("/v1/notifications/internal/ping", async (request) => {
    const parsed = payloadSchema.parse(request.body ?? {});

    return {
      service: "notifications",
      accepted: true,
      payload: parsed
    };
  });
}
