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
  status: "PENDING" | "PROCESSING" | "SUBMITTED" | "DISPATCHED" | "FAILED" | "EXPIRED";
  attempts: number;
  availableAt: string;
  createdAt: string;
  receiptId?: string;
  receiptDueAt?: string;
  receiptExpiresAt?: string;
  providerAcceptedAt?: string;
  failureCode?: string;
  lastError?: string;
  environment?: string;
  dispatchClaimToken?: string;
  dispatchLeaseExpiresAt?: string;
  receiptClaimToken?: string;
  receiptLeaseExpiresAt?: string;
};

type PersistedOutboxRow = {
  id: string;
  user_id: string;
  device_id: string;
  platform: "ios" | "android";
  expo_push_token: string;
  payload_json: unknown;
  status: OutboxEntry["status"];
  attempts: number;
  available_at: string | Date;
  created_at: string | Date;
  receipt_id: string | null;
  receipt_due_at: string | Date | null;
  receipt_expires_at: string | Date | null;
  provider_accepted_at: string | Date | null;
  failure_code: string | null;
  last_error: string | null;
  environment: string;
  dispatch_claim_token: string | null;
  dispatch_lease_expires_at: string | Date | null;
  receipt_claim_token: string | null;
  receipt_lease_expires_at: string | Date | null;
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
  claimPendingOutbox(batchSize: number, input: { nowIso: string; leaseExpiresAtIso: string; claimToken: string }): Promise<OutboxEntry[]>;
  claimDueReceipts(batchSize: number, input: { nowIso: string; leaseExpiresAtIso: string; claimToken: string }): Promise<OutboxEntry[]>;
  markOutboxSubmitted(id: string, claimToken: string, input: { receiptId: string; dueAtIso: string; expiresAtIso: string }): Promise<void>;
  markOutboxSimulated(id: string, claimToken: string): Promise<void>;
  markReceiptPending(id: string, claimToken: string, dueAtIso: string): Promise<void>;
  markReceiptProviderAccepted(id: string, claimToken: string): Promise<void>;
  markReceiptFailed(id: string, claimToken: string, input: { code: string; message: string; expired?: boolean }): Promise<void>;
  retirePushToken(entry: OutboxEntry): Promise<void>;
  getDeliveryHealth(nowIso: string): Promise<DeliveryHealth>;
  markOutboxRetry(id: string, claimToken: string, input: { retryAtIso: string; error: string }): Promise<void>;
  markOutboxFailed(id: string, claimToken: string, error: string, code?: string): Promise<void>;
  pingDb(): Promise<void>;
  close(): Promise<void>;
};

export type DeliveryHealth = {
  pending: number;
  processing: number;
  oldestProcessingAgeSeconds: number | null;
  submitted: number;
  oldestSubmittedAgeSeconds: number | null;
  outcomes: Array<{ merchantId: string; environment: string; notificationType: string; providerAccepted: number; unverified: number; failed: number; expired: number }>;
};

function environmentName() {
  return process.env.NOTIFICATIONS_ENVIRONMENT?.trim() || process.env.DEPLOY_ENV?.trim() || process.env.NODE_ENV?.trim() || "unknown";
}

function toOutboxEntry(row: PersistedOutboxRow): OutboxEntry {
  return {
    id: row.id, userId: row.user_id, deviceId: row.device_id, platform: row.platform,
    expoPushToken: row.expo_push_token, payload: orderStateNotificationSchema.parse(row.payload_json),
    status: row.status, attempts: row.attempts, availableAt: parseIsoDate(row.available_at),
    createdAt: parseIsoDate(row.created_at), receiptId: row.receipt_id ?? undefined,
    receiptDueAt: row.receipt_due_at ? parseIsoDate(row.receipt_due_at) : undefined,
    receiptExpiresAt: row.receipt_expires_at ? parseIsoDate(row.receipt_expires_at) : undefined,
    providerAcceptedAt: row.provider_accepted_at ? parseIsoDate(row.provider_accepted_at) : undefined,
    failureCode: row.failure_code ?? undefined, lastError: row.last_error ?? undefined,
    environment: row.environment, dispatchClaimToken: row.dispatch_claim_token ?? undefined,
    dispatchLeaseExpiresAt: row.dispatch_lease_expires_at ? parseIsoDate(row.dispatch_lease_expires_at) : undefined,
    receiptClaimToken: row.receipt_claim_token ?? undefined,
    receiptLeaseExpiresAt: row.receipt_lease_expires_at ? parseIsoDate(row.receipt_lease_expires_at) : undefined
  };
}

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
          createdAt: new Date().toISOString(),
          environment: environmentName()
        });
      }
      return recipients.length;
    },
    async claimPendingOutbox(batchSize, input) {
      return [...outbox.values()]
        .filter((entry) => (entry.status === "PENDING" && Date.parse(entry.availableAt) <= Date.parse(input.nowIso)) ||
          (entry.status === "PROCESSING" && Date.parse(entry.dispatchLeaseExpiresAt ?? "") <= Date.parse(input.nowIso)))
        .sort((left, right) => Date.parse(left.createdAt) - Date.parse(right.createdAt))
        .slice(0, batchSize)
        .map((entry) => {
          const claimed = { ...entry, status: "PROCESSING" as const, attempts: entry.attempts + 1,
            dispatchClaimToken: input.claimToken, dispatchLeaseExpiresAt: input.leaseExpiresAtIso };
          outbox.set(entry.id, claimed);
          return claimed;
        });
    },
    async claimDueReceipts(batchSize, input) {
      return [...outbox.values()].filter((entry) => entry.status === "SUBMITTED" &&
        Date.parse(entry.receiptDueAt ?? "") <= Date.parse(input.nowIso) &&
        (!entry.receiptClaimToken || !entry.receiptLeaseExpiresAt ||
          Date.parse(entry.receiptLeaseExpiresAt) <= Date.parse(input.nowIso)))
        .sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt)).slice(0, batchSize)
        .map((entry) => {
          const claimed = { ...entry, receiptClaimToken: input.claimToken, receiptLeaseExpiresAt: input.leaseExpiresAtIso };
          outbox.set(entry.id, claimed);
          return claimed;
        });
    },
    async markOutboxSubmitted(id, claimToken, input) {
      const entry = outbox.get(id);
      if (!entry || entry.status !== "PROCESSING" || entry.dispatchClaimToken !== claimToken) {
        throw new Error("notification outbox claim was lost before receipt persistence");
      }
      outbox.set(id, { ...entry, status: "SUBMITTED", dispatchClaimToken: undefined, dispatchLeaseExpiresAt: undefined,
        receiptId: input.receiptId, receiptDueAt: input.dueAtIso, receiptExpiresAt: input.expiresAtIso });
    },
    async markOutboxSimulated(id, claimToken) {
      const entry = outbox.get(id);
      if (!entry || entry.status !== "PROCESSING" || entry.dispatchClaimToken !== claimToken) {
        throw new Error("notification outbox claim was lost before dispatch completion");
      }
      outbox.set(id, { ...entry, status: "DISPATCHED", dispatchClaimToken: undefined, dispatchLeaseExpiresAt: undefined });
    },
    async markReceiptPending(id, claimToken, dueAtIso) {
      const entry = outbox.get(id);
      if (!entry || entry.status !== "SUBMITTED" || entry.receiptClaimToken !== claimToken) {
        throw new Error("notification receipt claim was lost before rescheduling");
      }
      outbox.set(id, { ...entry, receiptDueAt: dueAtIso, receiptClaimToken: undefined, receiptLeaseExpiresAt: undefined });
    },
    async markReceiptProviderAccepted(id, claimToken) {
      const entry = outbox.get(id);
      if (!entry || entry.status !== "SUBMITTED" || entry.receiptClaimToken !== claimToken) {
        throw new Error("notification receipt claim was lost before acceptance persistence");
      }
      outbox.set(id, { ...entry, status: "DISPATCHED", providerAcceptedAt: new Date().toISOString(),
        receiptClaimToken: undefined, receiptLeaseExpiresAt: undefined });
    },
    async markReceiptFailed(id, claimToken, input) {
      const entry = outbox.get(id);
      if (!entry || entry.status !== "SUBMITTED" || entry.receiptClaimToken !== claimToken) {
        throw new Error("notification receipt claim was lost before failure persistence");
      }
      outbox.set(id, { ...entry, status: input.expired ? "EXPIRED" : "FAILED",
        failureCode: input.code, lastError: input.message, receiptClaimToken: undefined, receiptLeaseExpiresAt: undefined });
    },
    async retirePushToken(entry) {
      const token = pushTokensByUserId.get(entry.userId)?.get(entry.deviceId);
      if (token?.expoPushToken === entry.expoPushToken) pushTokensByUserId.get(entry.userId)?.delete(entry.deviceId);
    },
    async getDeliveryHealth(nowIso) {
      const rows = [...outbox.values()];
      const processing = rows.filter((entry) => entry.status === "PROCESSING");
      const submitted = rows.filter((entry) => entry.status === "SUBMITTED");
      const grouped = new Map<string, DeliveryHealth["outcomes"][number]>();
      for (const entry of rows) {
        if (!["DISPATCHED", "FAILED", "EXPIRED"].includes(entry.status)) continue;
        const merchantId = entry.payload.locationId;
        const environment = entry.environment ?? environmentName();
        const notificationType = entry.payload.status;
        const key = JSON.stringify([merchantId, environment, notificationType]);
        const group = grouped.get(key) ?? { merchantId, environment, notificationType, providerAccepted: 0, unverified: 0, failed: 0, expired: 0 };
        if (entry.status === "DISPATCHED" && entry.providerAcceptedAt) group.providerAccepted++;
        if (entry.status === "DISPATCHED" && !entry.providerAcceptedAt) group.unverified++;
        if (entry.status === "FAILED") group.failed++;
        if (entry.status === "EXPIRED") group.expired++;
        grouped.set(key, group);
      }
      return { pending: rows.filter((entry) => entry.status === "PENDING").length, processing: processing.length,
        oldestProcessingAgeSeconds: processing.length ? Math.max(0, Math.floor((Date.parse(nowIso) -
          Math.min(...processing.map((entry) => Date.parse(entry.createdAt)))) / 1000)) : null,
        submitted: submitted.length,
        oldestSubmittedAgeSeconds: submitted.length ? Math.max(0, Math.floor((Date.parse(nowIso) -
          Math.min(...submitted.map((entry) => Date.parse(entry.createdAt)))) / 1000)) : null,
        outcomes: [...grouped.values()] };
    },
    async markOutboxRetry(id, claimToken, input) {
      const existing = outbox.get(id);
      if (!existing || existing.status !== "PROCESSING" || existing.dispatchClaimToken !== claimToken) {
        throw new Error("notification outbox claim was lost before retry scheduling");
      }

      outbox.set(id, {
        ...existing,
        status: "PENDING",
        availableAt: input.retryAtIso,
        lastError: input.error,
        dispatchClaimToken: undefined,
        dispatchLeaseExpiresAt: undefined
      });
    },
    async markOutboxFailed(id, claimToken, error, code) {
      const existing = outbox.get(id);
      if (!existing || existing.status !== "PROCESSING" || existing.dispatchClaimToken !== claimToken) {
        throw new Error("notification outbox claim was lost before failure persistence");
      }

      outbox.set(id, {
        ...existing,
        status: "FAILED",
        lastError: error,
        failureCode: code,
        dispatchClaimToken: undefined,
        dispatchLeaseExpiresAt: undefined
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
            last_error: null,
            receipt_id: null,
            receipt_due_at: null,
            receipt_expires_at: null,
            provider_accepted_at: null,
            failure_code: null,
            environment: environmentName(),
            dispatch_claim_token: null,
            dispatch_lease_expires_at: null,
            receipt_claim_token: null,
            receipt_lease_expires_at: null
          })
          .execute();
        enqueued += 1;
      }

      return enqueued;
    },
    async claimPendingOutbox(batchSize, input) {
      const result = await sql<PersistedOutboxRow>`
        WITH eligible AS (
          SELECT id
          FROM notifications_outbox
          WHERE (status = 'PENDING' AND available_at <= ${input.nowIso})
             OR (status = 'PROCESSING' AND dispatch_lease_expires_at <= ${input.nowIso})
          ORDER BY created_at ASC
          LIMIT ${batchSize}
          FOR UPDATE SKIP LOCKED
        )
        UPDATE notifications_outbox AS outbox
        SET status = 'PROCESSING', dispatch_claim_token = ${input.claimToken},
            dispatch_lease_expires_at = ${input.leaseExpiresAtIso},
            attempts = outbox.attempts + 1, updated_at = ${input.nowIso}
        FROM eligible
        WHERE outbox.id = eligible.id
        RETURNING outbox.*
      `.execute(db);
      return result.rows.map(toOutboxEntry);
    },
    async claimDueReceipts(batchSize, input) {
      const result = await sql<PersistedOutboxRow>`
        WITH eligible AS (
          SELECT id
          FROM notifications_outbox
          WHERE status = 'SUBMITTED'
            AND receipt_due_at <= ${input.nowIso}
            AND (receipt_claim_token IS NULL OR receipt_lease_expires_at IS NULL OR receipt_lease_expires_at <= ${input.nowIso})
          ORDER BY created_at ASC
          LIMIT ${batchSize}
          FOR UPDATE SKIP LOCKED
        )
        UPDATE notifications_outbox AS outbox
        SET receipt_claim_token = ${input.claimToken}, receipt_lease_expires_at = ${input.leaseExpiresAtIso},
            updated_at = ${input.nowIso}
        FROM eligible
        WHERE outbox.id = eligible.id
        RETURNING outbox.*
      `.execute(db);
      return result.rows.map(toOutboxEntry);
    },
    async markOutboxSubmitted(id, claimToken, input) {
      const result = await db.updateTable("notifications_outbox").set({ status: "SUBMITTED", receipt_id: input.receiptId,
        receipt_due_at: input.dueAtIso, receipt_expires_at: input.expiresAtIso, dispatch_claim_token: null,
        dispatch_lease_expires_at: null, dispatched_at: new Date().toISOString(), updated_at: new Date().toISOString() })
        .where("id", "=", id).where("status", "=", "PROCESSING").where("dispatch_claim_token", "=", claimToken).executeTakeFirst();
      if (Number(result.numUpdatedRows) !== 1) throw new Error("notification outbox claim was lost before receipt persistence");
    },
    async markOutboxSimulated(id, claimToken) {
      const result = await db.updateTable("notifications_outbox").set({ status: "DISPATCHED", dispatch_claim_token: null,
        dispatch_lease_expires_at: null, dispatched_at: new Date().toISOString(), updated_at: new Date().toISOString() })
        .where("id", "=", id).where("status", "=", "PROCESSING").where("dispatch_claim_token", "=", claimToken).executeTakeFirst();
      if (Number(result.numUpdatedRows) !== 1) throw new Error("notification outbox claim was lost before dispatch completion");
    },
    async markReceiptPending(id, claimToken, dueAtIso) {
      const result = await db.updateTable("notifications_outbox").set({ receipt_due_at: dueAtIso,
        receipt_claim_token: null, receipt_lease_expires_at: null, updated_at: new Date().toISOString() })
        .where("id", "=", id).where("status", "=", "SUBMITTED").where("receipt_claim_token", "=", claimToken).executeTakeFirst();
      if (Number(result.numUpdatedRows) !== 1) throw new Error("notification receipt claim was lost before rescheduling");
    },
    async markReceiptProviderAccepted(id, claimToken) {
      const result = await db.updateTable("notifications_outbox").set({ status: "DISPATCHED", provider_accepted_at: new Date().toISOString(),
        receipt_claim_token: null, receipt_lease_expires_at: null, updated_at: new Date().toISOString() })
        .where("id", "=", id).where("status", "=", "SUBMITTED").where("receipt_claim_token", "=", claimToken).executeTakeFirst();
      if (Number(result.numUpdatedRows) !== 1) throw new Error("notification receipt claim was lost before acceptance persistence");
    },
    async markReceiptFailed(id, claimToken, input) {
      const result = await db.updateTable("notifications_outbox").set({ status: input.expired ? "EXPIRED" : "FAILED",
        failure_code: input.code, last_error: input.message, receipt_claim_token: null, receipt_lease_expires_at: null,
        updated_at: new Date().toISOString() })
        .where("id", "=", id).where("status", "=", "SUBMITTED").where("receipt_claim_token", "=", claimToken).executeTakeFirst();
      if (Number(result.numUpdatedRows) !== 1) throw new Error("notification receipt claim was lost before failure persistence");
    },
    async retirePushToken(entry) {
      await db.deleteFrom("notifications_push_tokens").where("user_id", "=", entry.userId)
        .where("device_id", "=", entry.deviceId).where("expo_push_token", "=", entry.expoPushToken).execute();
    },
    async getDeliveryHealth(nowIso) {
      const rows = await sql<{ pending: number; processing: number; oldest_processing_at: Date | null; submitted: number; oldest_submitted_at: Date | null }>`
        SELECT count(*) FILTER (WHERE status = 'PENDING')::int AS pending,
          count(*) FILTER (WHERE status = 'PROCESSING')::int AS processing,
          min(updated_at) FILTER (WHERE status = 'PROCESSING') AS oldest_processing_at,
          count(*) FILTER (WHERE status = 'SUBMITTED')::int AS submitted,
          min(dispatched_at) FILTER (WHERE status = 'SUBMITTED') AS oldest_submitted_at
        FROM notifications_outbox`.execute(db);
      const summary = rows.rows[0];
      const outcomes = await sql<{ merchant_id: string; environment: string; notification_type: string;
        provider_accepted: number; unverified: number; failed: number; expired: number }>`
        SELECT COALESCE(loc.tenant_id, o.payload_json ->> 'locationId') AS merchant_id,
          o.environment, o.payload_json ->> 'status' AS notification_type,
          count(*) FILTER (WHERE o.status = 'DISPATCHED' AND o.provider_accepted_at IS NOT NULL)::int AS provider_accepted,
          count(*) FILTER (WHERE o.status = 'DISPATCHED' AND o.provider_accepted_at IS NULL)::int AS unverified,
          count(*) FILTER (WHERE o.status = 'FAILED')::int AS failed,
          count(*) FILTER (WHERE o.status = 'EXPIRED')::int AS expired
        FROM notifications_outbox o LEFT JOIN catalog_client_locations loc
          ON loc.location_id = o.payload_json ->> 'locationId'
        WHERE o.status IN ('DISPATCHED', 'FAILED', 'EXPIRED')
        GROUP BY 1, 2, 3`.execute(db);
      return { pending: Number(summary?.pending ?? 0), processing: Number(summary?.processing ?? 0),
        oldestProcessingAgeSeconds: summary?.oldest_processing_at ? Math.max(0, Math.floor((Date.parse(nowIso) -
          Date.parse(String(summary.oldest_processing_at))) / 1000)) : null,
        submitted: Number(summary?.submitted ?? 0),
        oldestSubmittedAgeSeconds: summary?.oldest_submitted_at ? Math.max(0, Math.floor((Date.parse(nowIso) -
          Date.parse(String(summary.oldest_submitted_at))) / 1000)) : null,
        outcomes: outcomes.rows.map((row) => ({ merchantId: row.merchant_id, environment: row.environment,
          notificationType: row.notification_type, providerAccepted: Number(row.provider_accepted),
          unverified: Number(row.unverified), failed: Number(row.failed),
          expired: Number(row.expired) })) };
    },
    async markOutboxRetry(id, claimToken, input) {
      const result = await db
        .updateTable("notifications_outbox")
        .set({
          status: "PENDING",
          available_at: input.retryAtIso,
          last_error: input.error,
          dispatch_claim_token: null,
          dispatch_lease_expires_at: null,
          updated_at: new Date().toISOString()
        })
        .where("id", "=", id)
        .where("status", "=", "PROCESSING")
        .where("dispatch_claim_token", "=", claimToken)
        .executeTakeFirst();
      if (Number(result.numUpdatedRows) !== 1) throw new Error("notification outbox claim was lost before retry scheduling");
    },
    async markOutboxFailed(id, claimToken, error, code) {
      const result = await db
        .updateTable("notifications_outbox")
        .set({
          status: "FAILED",
          last_error: error,
          failure_code: code ?? "DISPATCH_FAILED",
          dispatch_claim_token: null,
          dispatch_lease_expires_at: null,
          updated_at: new Date().toISOString()
        })
        .where("id", "=", id)
        .where("status", "=", "PROCESSING")
        .where("dispatch_claim_token", "=", claimToken)
        .executeTakeFirst();
      if (Number(result.numUpdatedRows) !== 1) throw new Error("notification outbox claim was lost before failure persistence");
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
