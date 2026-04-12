import { randomUUID } from "node:crypto";
import type { FastifyBaseLogger } from "fastify";
import { orderStateNotificationSchema, pushTokenUpsertSchema } from "@lattelink/contracts-notifications";
import {
  allowsInMemoryPersistence,
  buildPersistenceStartupError,
  createPostgresDb,
  getDatabaseUrl,
  runMigrations,
  sql
} from "@lattelink/persistence";
import { z } from "zod";

type PushTokenInput = z.output<typeof pushTokenUpsertSchema>;
type OrderStateNotification = z.output<typeof orderStateNotificationSchema>;

export type OutboxEntry = {
  id: string;
  userId: string;
  deviceId: string;
  platform: "ios" | "android";
  expoPushToken: string;
  payload: OrderStateNotification;
  status: "PENDING" | "DISPATCHED" | "FAILED";
  attempts: number;
  availableAt: string;
  createdAt: string;
};

type PersistedOutboxRow = {
  id: string;
  user_id: string;
  device_id: string;
  platform: "ios" | "android";
  expo_push_token: string;
  payload_json: unknown;
  status: "PENDING" | "DISPATCHED" | "FAILED";
  attempts: number;
  available_at: string | Date;
  created_at: string | Date;
};

type PersistedPushTokenRow = {
  user_id: string;
  device_id: string;
  platform: "ios" | "android";
  expo_push_token: string;
};

export type NotificationsRepository = {
  backend: "memory" | "postgres";
  upsertPushToken(userId: string, input: PushTokenInput): Promise<void>;
  markOrderStateDispatchIfNew(input: { dispatchKey: string; payload: OrderStateNotification }): Promise<boolean>;
  enqueueOrderStateOutbox(payload: OrderStateNotification): Promise<number>;
  listPendingOutbox(batchSize: number, nowIso: string): Promise<OutboxEntry[]>;
  markOutboxDispatched(id: string): Promise<void>;
  markOutboxRetry(id: string, input: { retryAtIso: string; error: string }): Promise<void>;
  markOutboxFailed(id: string, error: string): Promise<void>;
  pingDb(): Promise<void>;
  close(): Promise<void>;
};

function parseIsoDate(value: unknown) {
  if (value instanceof Date) {
    return value.toISOString();
  }

  return new Date(String(value)).toISOString();
}

function createInMemoryRepository(): NotificationsRepository {
  const pushTokensByUserId = new Map<string, Map<string, PushTokenInput>>();
  const dispatchedOrderStates = new Set<string>();
  const outbox = new Map<string, OutboxEntry>();

  return {
    backend: "memory",
    async upsertPushToken(userId, input) {
      const userTokens = pushTokensByUserId.get(userId) ?? new Map<string, PushTokenInput>();
      userTokens.set(input.deviceId, input);
      pushTokensByUserId.set(userId, userTokens);
    },
    async markOrderStateDispatchIfNew({ dispatchKey }) {
      if (dispatchedOrderStates.has(dispatchKey)) {
        return false;
      }

      dispatchedOrderStates.add(dispatchKey);
      return true;
    },
    async enqueueOrderStateOutbox(payload) {
      const recipients = [...(pushTokensByUserId.get(payload.userId)?.entries() ?? [])];
      for (const [deviceId, token] of recipients) {
        const id = randomUUID();
        outbox.set(id, {
          id,
          userId: payload.userId,
          deviceId,
          platform: token.platform,
          expoPushToken: token.expoPushToken,
          payload,
          status: "PENDING",
          attempts: 0,
          availableAt: new Date().toISOString(),
          createdAt: new Date().toISOString()
        });
      }
      return recipients.length;
    },
    async listPendingOutbox(batchSize, nowIso) {
      const nowMs = Date.parse(nowIso);
      return [...outbox.values()]
        .filter((entry) => entry.status === "PENDING" && Date.parse(entry.availableAt) <= nowMs)
        .sort((left, right) => Date.parse(left.createdAt) - Date.parse(right.createdAt))
        .slice(0, batchSize);
    },
    async markOutboxDispatched(id) {
      const existing = outbox.get(id);
      if (!existing) {
        return;
      }

      outbox.set(id, {
        ...existing,
        status: "DISPATCHED",
        attempts: existing.attempts + 1
      });
    },
    async markOutboxRetry(id, input) {
      const existing = outbox.get(id);
      if (!existing) {
        return;
      }

      outbox.set(id, {
        ...existing,
        status: "PENDING",
        attempts: existing.attempts + 1,
        availableAt: input.retryAtIso
      });
    },
    async markOutboxFailed(id) {
      const existing = outbox.get(id);
      if (!existing) {
        return;
      }

      outbox.set(id, {
        ...existing,
        status: "FAILED",
        attempts: existing.attempts + 1
      });
    },
    async pingDb() {
      // no-op for in-memory
    },
    async close() {
      // no-op
    }
  };
}

async function createPostgresRepository(connectionString: string): Promise<NotificationsRepository> {
  const db = createPostgresDb(connectionString);
  await runMigrations(db);

  async function getAttempts(id: string) {
    const row = await db
      .selectFrom("notifications_outbox")
      .select("attempts")
      .where("id", "=", id)
      .executeTakeFirst();
    return Number(row?.attempts ?? 0);
  }

  return {
    backend: "postgres",
    async upsertPushToken(userId, input) {
      const updated = await db
        .updateTable("notifications_push_tokens")
        .set({
          platform: input.platform,
          expo_push_token: input.expoPushToken,
          updated_at: new Date().toISOString()
        })
        .where("user_id", "=", userId)
        .where("device_id", "=", input.deviceId)
        .executeTakeFirst();

      if (Number(updated.numUpdatedRows ?? 0) > 0) {
        return;
      }

      try {
        await db
          .insertInto("notifications_push_tokens")
          .values({
            user_id: userId,
            device_id: input.deviceId,
            platform: input.platform,
            expo_push_token: input.expoPushToken
          })
          .execute();
      } catch {
        await db
          .updateTable("notifications_push_tokens")
          .set({
            platform: input.platform,
            expo_push_token: input.expoPushToken,
            updated_at: new Date().toISOString()
          })
          .where("user_id", "=", userId)
          .where("device_id", "=", input.deviceId)
          .execute();
      }
    },
    async markOrderStateDispatchIfNew({ dispatchKey, payload }) {
      try {
        await db
          .insertInto("notifications_order_state_dispatches")
          .values({
            dispatch_key: dispatchKey,
            user_id: payload.userId,
            order_id: payload.orderId,
            status: payload.status,
            occurred_at: payload.occurredAt
          })
          .execute();
        return true;
      } catch {
        return false;
      }
    },
    async enqueueOrderStateOutbox(payload) {
      const recipients = (await db
        .selectFrom("notifications_push_tokens")
        .selectAll()
        .where("user_id", "=", payload.userId)
        .execute()) as PersistedPushTokenRow[];

      if (recipients.length === 0) {
        return 0;
      }

      let enqueued = 0;
      for (const recipient of recipients) {
        await db
          .insertInto("notifications_outbox")
          .values({
            id: randomUUID(),
            user_id: payload.userId,
            device_id: recipient.device_id,
            platform: recipient.platform,
            expo_push_token: recipient.expo_push_token,
            payload_json: payload,
            status: "PENDING",
            attempts: 0,
            available_at: new Date().toISOString(),
            dispatched_at: null,
            last_error: null
          })
          .execute();
        enqueued += 1;
      }

      return enqueued;
    },
    async listPendingOutbox(batchSize, nowIso) {
      const rows = (await db
        .selectFrom("notifications_outbox")
        .selectAll()
        .where("status", "=", "PENDING")
        .where("available_at", "<=", nowIso)
        .orderBy("created_at", "asc")
        .limit(batchSize)
        .execute()) as PersistedOutboxRow[];

      return rows.map((row) => ({
        id: row.id,
        userId: row.user_id,
        deviceId: row.device_id,
        platform: row.platform,
        expoPushToken: row.expo_push_token,
        payload: orderStateNotificationSchema.parse(row.payload_json),
        status: row.status,
        attempts: row.attempts,
        availableAt: parseIsoDate(row.available_at),
        createdAt: parseIsoDate(row.created_at)
      }));
    },
    async markOutboxDispatched(id) {
      const now = new Date().toISOString();
      const nextAttempts = (await getAttempts(id)) + 1;
      await db
        .updateTable("notifications_outbox")
        .set({
          status: "DISPATCHED",
          attempts: nextAttempts,
          dispatched_at: now,
          updated_at: now
        })
        .where("id", "=", id)
        .execute();
    },
    async markOutboxRetry(id, input) {
      const nextAttempts = (await getAttempts(id)) + 1;
      await db
        .updateTable("notifications_outbox")
        .set({
          status: "PENDING",
          attempts: nextAttempts,
          available_at: input.retryAtIso,
          last_error: input.error,
          updated_at: new Date().toISOString()
        })
        .where("id", "=", id)
        .execute();
    },
    async markOutboxFailed(id, error) {
      const nextAttempts = (await getAttempts(id)) + 1;
      await db
        .updateTable("notifications_outbox")
        .set({
          status: "FAILED",
          attempts: nextAttempts,
          last_error: error,
          updated_at: new Date().toISOString()
        })
        .where("id", "=", id)
        .execute();
    },
    async pingDb() {
      await sql`SELECT 1`.execute(db);
    },
    async close() {
      await db.destroy();
    }
  };
}

export async function createNotificationsRepository(logger: FastifyBaseLogger): Promise<NotificationsRepository> {
  const databaseUrl = getDatabaseUrl();
  const allowInMemory = allowsInMemoryPersistence();
  if (!databaseUrl) {
    if (!allowInMemory) {
      throw buildPersistenceStartupError({
        service: "notifications",
        reason: "missing_database_url"
      });
    }

    logger.warn({ backend: "memory" }, "notifications persistence backend selected with explicit in-memory mode");
    return createInMemoryRepository();
  }

  try {
    const repository = await createPostgresRepository(databaseUrl);
    logger.info({ backend: "postgres" }, "notifications persistence backend selected");
    return repository;
  } catch (error) {
    if (!allowInMemory) {
      logger.error({ error }, "failed to initialize postgres persistence");
      throw buildPersistenceStartupError({
        service: "notifications",
        reason: "postgres_initialization_failed"
      });
    }

    logger.error({ error }, "failed to initialize postgres persistence; using explicit in-memory fallback");
    return createInMemoryRepository();
  }
}
