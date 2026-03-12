import type { FastifyBaseLogger, FastifyInstance } from "fastify";
import { z } from "zod";
import { randomUUID } from "node:crypto";
import { createPostgresDb, ensurePersistenceTables, getDatabaseUrl } from "@gazelle/persistence";
import {
  applePayWalletSchema,
  ordersPaymentReconciliationResultSchema,
  ordersPaymentReconciliationSchema
} from "@gazelle/contracts-orders";

const payloadSchema = z.object({
  id: z.string().uuid().optional()
});
const defaultRateLimitWindowMs = 60_000;
const defaultPaymentsWriteRateLimitMax = 60;
const defaultWebhookRateLimitMax = 120;

const chargeRequestSchema = z.object({
  orderId: z.string().uuid(),
  amountCents: z.number().int().positive(),
  currency: z.literal("USD"),
  applePayToken: z.string().min(1).optional(),
  applePayWallet: applePayWalletSchema.optional(),
  idempotencyKey: z.string().min(1)
}).superRefine((input, context) => {
  const hasToken = Boolean(input.applePayToken);
  const hasWallet = Boolean(input.applePayWallet);

  if (!hasToken && !hasWallet) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["applePayToken"],
      message: "Either applePayToken or applePayWallet is required."
    });
  }

  if (hasToken && hasWallet) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["applePayWallet"],
      message: "Provide either applePayToken or applePayWallet, but not both."
    });
  }
});

const chargeStatusSchema = z.enum(["SUCCEEDED", "DECLINED", "TIMEOUT"]);

const chargeResponseSchema = z.object({
  paymentId: z.string().uuid(),
  provider: z.literal("CLOVER"),
  orderId: z.string().uuid(),
  status: chargeStatusSchema,
  approved: z.boolean(),
  amountCents: z.number().int().positive(),
  currency: z.literal("USD"),
  occurredAt: z.string().datetime(),
  declineCode: z.string().optional(),
  message: z.string().optional()
});

const refundRequestSchema = z.object({
  orderId: z.string().uuid(),
  paymentId: z.string().uuid(),
  amountCents: z.number().int().positive(),
  currency: z.literal("USD"),
  reason: z.string().min(1),
  idempotencyKey: z.string().min(1)
});

const refundStatusSchema = z.enum(["REFUNDED", "REJECTED"]);

const refundResponseSchema = z.object({
  refundId: z.string().uuid(),
  provider: z.literal("CLOVER"),
  orderId: z.string().uuid(),
  paymentId: z.string().uuid(),
  status: refundStatusSchema,
  amountCents: z.number().int().positive(),
  currency: z.literal("USD"),
  occurredAt: z.string().datetime(),
  message: z.string().optional()
});

const serviceErrorSchema = z.object({
  code: z.string(),
  message: z.string(),
  requestId: z.string(),
  details: z.record(z.unknown()).optional()
});

type ChargeResponse = z.output<typeof chargeResponseSchema>;
type RefundResponse = z.output<typeof refundResponseSchema>;
type ChargeRequest = z.output<typeof chargeRequestSchema>;
type RefundRequest = z.output<typeof refundRequestSchema>;
type OrderPaymentReconciliation = z.output<typeof ordersPaymentReconciliationSchema>;

type PersistedChargeRow = {
  payment_id: string;
  provider_payment_id: string | null;
  order_id: string;
  idempotency_key: string;
  provider: "CLOVER";
  status: "SUCCEEDED" | "DECLINED" | "TIMEOUT";
  approved: boolean;
  amount_cents: number;
  currency: "USD";
  occurred_at: string;
  decline_code: string | null;
  message: string | null;
};

type PersistedRefundRow = {
  refund_id: string;
  order_id: string;
  payment_id: string;
  idempotency_key: string;
  provider: "CLOVER";
  status: "REFUNDED" | "REJECTED";
  amount_cents: number;
  currency: "USD";
  occurred_at: string;
  message: string | null;
};

type PaymentsRepository = {
  backend: "memory" | "postgres";
  findChargeByIdempotency(orderId: string, idempotencyKey: string): Promise<ChargeResponse | undefined>;
  saveCharge(input: {
    request: ChargeRequest;
    response: ChargeResponse;
    providerPaymentId?: string;
  }): Promise<ChargeResponse>;
  findLatestChargeForOrder(
    orderId: string
  ): Promise<{ charge: ChargeResponse; providerPaymentId?: string } | undefined>;
  findChargeByPaymentId(paymentId: string): Promise<{ charge: ChargeResponse; providerPaymentId?: string } | undefined>;
  findChargeByProviderPaymentId(
    providerPaymentId: string
  ): Promise<{ charge: ChargeResponse; providerPaymentId?: string } | undefined>;
  updateChargeStatus(input: {
    paymentId: string;
    status: z.output<typeof chargeStatusSchema>;
    message?: string;
    declineCode?: string;
    occurredAt: string;
  }): Promise<ChargeResponse | undefined>;
  findRefundByIdempotency(orderId: string, idempotencyKey: string): Promise<RefundResponse | undefined>;
  saveRefund(input: { request: RefundRequest; response: RefundResponse }): Promise<RefundResponse>;
  findLatestRefundForOrderAndPayment(orderId: string, paymentId: string): Promise<RefundResponse | undefined>;
  updateRefundStatus(input: {
    refundId: string;
    status: z.output<typeof refundStatusSchema>;
    message?: string;
    occurredAt: string;
  }): Promise<RefundResponse | undefined>;
  close(): Promise<void>;
};

function toChargeResponse(row: PersistedChargeRow): ChargeResponse {
  return chargeResponseSchema.parse({
    paymentId: row.payment_id,
    provider: row.provider,
    orderId: row.order_id,
    status: row.status,
    approved: row.approved,
    amountCents: row.amount_cents,
    currency: row.currency,
    occurredAt: new Date(row.occurred_at).toISOString(),
    declineCode: row.decline_code ?? undefined,
    message: row.message ?? undefined
  });
}

function toChargeLookup(row: PersistedChargeRow) {
  return {
    charge: toChargeResponse(row),
    providerPaymentId: row.provider_payment_id ?? undefined
  };
}

function toRefundResponse(row: PersistedRefundRow): RefundResponse {
  return refundResponseSchema.parse({
    refundId: row.refund_id,
    provider: row.provider,
    orderId: row.order_id,
    paymentId: row.payment_id,
    status: row.status,
    amountCents: row.amount_cents,
    currency: row.currency,
    occurredAt: new Date(row.occurred_at).toISOString(),
    message: row.message ?? undefined
  });
}

function createInMemoryRepository(): PaymentsRepository {
  const chargeResultsByIdempotency = new Map<string, ChargeResponse>();
  const chargeResultByOrderId = new Map<string, ChargeResponse>();
  const chargeResultByPaymentId = new Map<string, ChargeResponse>();
  const providerPaymentIdByPaymentId = new Map<string, string>();
  const internalPaymentIdByProviderPaymentId = new Map<string, string>();
  const refundResultsByIdempotency = new Map<string, RefundResponse>();
  const refundResultByRefundId = new Map<string, RefundResponse>();
  const latestRefundIdByOrderPayment = new Map<string, string>();

  return {
    backend: "memory",
    async findChargeByIdempotency(orderId, idempotencyKey) {
      return chargeResultsByIdempotency.get(`${orderId}:${idempotencyKey}`);
    },
    async saveCharge({ request, response, providerPaymentId }) {
      const key = `${request.orderId}:${request.idempotencyKey}`;
      chargeResultsByIdempotency.set(key, response);
      chargeResultByOrderId.set(request.orderId, response);
      chargeResultByPaymentId.set(response.paymentId, response);
      const resolvedProviderPaymentId = providerPaymentId ?? response.paymentId;
      providerPaymentIdByPaymentId.set(response.paymentId, resolvedProviderPaymentId);
      internalPaymentIdByProviderPaymentId.set(resolvedProviderPaymentId, response.paymentId);
      internalPaymentIdByProviderPaymentId.set(response.paymentId, response.paymentId);
      return response;
    },
    async findLatestChargeForOrder(orderId) {
      const charge = chargeResultByOrderId.get(orderId);
      if (!charge) {
        return undefined;
      }

      return {
        charge,
        providerPaymentId: providerPaymentIdByPaymentId.get(charge.paymentId)
      };
    },
    async findChargeByPaymentId(paymentId) {
      const charge = chargeResultByPaymentId.get(paymentId);
      if (!charge) {
        return undefined;
      }
      return {
        charge,
        providerPaymentId: providerPaymentIdByPaymentId.get(paymentId)
      };
    },
    async findChargeByProviderPaymentId(providerPaymentId) {
      const resolvedPaymentId =
        internalPaymentIdByProviderPaymentId.get(providerPaymentId) ?? providerPaymentId;
      const charge = chargeResultByPaymentId.get(resolvedPaymentId);
      if (!charge) {
        return undefined;
      }
      return {
        charge,
        providerPaymentId: providerPaymentIdByPaymentId.get(resolvedPaymentId)
      };
    },
    async updateChargeStatus({ paymentId, status, message, declineCode, occurredAt }) {
      const record = chargeResultByPaymentId.get(paymentId);
      if (!record) {
        return undefined;
      }

      const next = chargeResponseSchema.parse({
        ...record,
        status,
        approved: status === "SUCCEEDED",
        message: message ?? record.message,
        declineCode: status === "DECLINED" ? declineCode ?? record.declineCode : undefined,
        occurredAt
      });
      chargeResultByPaymentId.set(paymentId, next);
      chargeResultByOrderId.set(next.orderId, next);
      return next;
    },
    async findRefundByIdempotency(orderId, idempotencyKey) {
      return refundResultsByIdempotency.get(`${orderId}:${idempotencyKey}`);
    },
    async saveRefund({ request, response }) {
      const key = `${request.orderId}:${request.idempotencyKey}`;
      refundResultsByIdempotency.set(key, response);
      refundResultByRefundId.set(response.refundId, response);
      latestRefundIdByOrderPayment.set(`${response.orderId}:${response.paymentId}`, response.refundId);
      return response;
    },
    async findLatestRefundForOrderAndPayment(orderId, paymentId) {
      const refundId = latestRefundIdByOrderPayment.get(`${orderId}:${paymentId}`);
      if (!refundId) {
        return undefined;
      }
      return refundResultByRefundId.get(refundId);
    },
    async updateRefundStatus({ refundId, status, message, occurredAt }) {
      const current = refundResultByRefundId.get(refundId);
      if (!current) {
        return undefined;
      }

      const next = refundResponseSchema.parse({
        ...current,
        status,
        message: message ?? current.message,
        occurredAt
      });
      refundResultByRefundId.set(refundId, next);
      refundResultsByIdempotency.forEach((value, key) => {
        if (value.refundId === refundId) {
          refundResultsByIdempotency.set(key, next);
        }
      });
      latestRefundIdByOrderPayment.set(`${next.orderId}:${next.paymentId}`, next.refundId);
      return next;
    },
    async close() {
      // no-op
    }
  };
}

async function createPostgresRepository(connectionString: string): Promise<PaymentsRepository> {
  const db = createPostgresDb(connectionString);
  await ensurePersistenceTables(db);

  return {
    backend: "postgres",
    async findChargeByIdempotency(orderId, idempotencyKey) {
      const row = await db
        .selectFrom("payments_charges")
        .selectAll()
        .where("order_id", "=", orderId)
        .where("idempotency_key", "=", idempotencyKey)
        .executeTakeFirst();

      return row ? toChargeResponse(row as PersistedChargeRow) : undefined;
    },
    async saveCharge({ request, response, providerPaymentId }) {
      await db
        .insertInto("payments_charges")
        .values({
          payment_id: response.paymentId,
          provider_payment_id: providerPaymentId ?? null,
          order_id: response.orderId,
          idempotency_key: request.idempotencyKey,
          provider: response.provider,
          status: response.status,
          approved: response.approved,
          amount_cents: response.amountCents,
          currency: response.currency,
          occurred_at: response.occurredAt,
          decline_code: response.declineCode ?? null,
          message: response.message ?? null
        })
        .onConflict((oc) => oc.columns(["order_id", "idempotency_key"]).doNothing())
        .execute();

      const persisted = await db
        .selectFrom("payments_charges")
        .selectAll()
        .where("order_id", "=", request.orderId)
        .where("idempotency_key", "=", request.idempotencyKey)
        .executeTakeFirstOrThrow();

      return toChargeResponse(persisted as PersistedChargeRow);
    },
    async findLatestChargeForOrder(orderId) {
      const row = await db
        .selectFrom("payments_charges")
        .selectAll()
        .where("order_id", "=", orderId)
        .orderBy("created_at", "desc")
        .executeTakeFirst();

      return row ? toChargeLookup(row as PersistedChargeRow) : undefined;
    },
    async findChargeByPaymentId(paymentId) {
      const row = await db
        .selectFrom("payments_charges")
        .selectAll()
        .where("payment_id", "=", paymentId)
        .executeTakeFirst();

      return row ? toChargeLookup(row as PersistedChargeRow) : undefined;
    },
    async findChargeByProviderPaymentId(providerPaymentId) {
      const providerIdAsUuid = z.string().uuid().safeParse(providerPaymentId);
      const row = providerIdAsUuid.success
        ? await db
            .selectFrom("payments_charges")
            .selectAll()
            .where((expressionBuilder) =>
              expressionBuilder.or([
                expressionBuilder("provider_payment_id", "=", providerPaymentId),
                expressionBuilder("payment_id", "=", providerPaymentId)
              ])
            )
            .orderBy("created_at", "desc")
            .executeTakeFirst()
        : await db
            .selectFrom("payments_charges")
            .selectAll()
            .where("provider_payment_id", "=", providerPaymentId)
            .orderBy("created_at", "desc")
            .executeTakeFirst();

      return row ? toChargeLookup(row as PersistedChargeRow) : undefined;
    },
    async updateChargeStatus({ paymentId, status, message, declineCode, occurredAt }) {
      const existing = await db
        .selectFrom("payments_charges")
        .selectAll()
        .where("payment_id", "=", paymentId)
        .executeTakeFirst();
      if (!existing) {
        return undefined;
      }

      await db
        .updateTable("payments_charges")
        .set({
          status,
          approved: status === "SUCCEEDED",
          message: message ?? existing.message,
          decline_code: status === "DECLINED" ? declineCode ?? existing.decline_code : null,
          occurred_at: occurredAt
        })
        .where("payment_id", "=", paymentId)
        .execute();

      const updated = await db
        .selectFrom("payments_charges")
        .selectAll()
        .where("payment_id", "=", paymentId)
        .executeTakeFirstOrThrow();
      return toChargeResponse(updated as PersistedChargeRow);
    },
    async findRefundByIdempotency(orderId, idempotencyKey) {
      const row = await db
        .selectFrom("payments_refunds")
        .selectAll()
        .where("order_id", "=", orderId)
        .where("idempotency_key", "=", idempotencyKey)
        .executeTakeFirst();

      return row ? toRefundResponse(row as PersistedRefundRow) : undefined;
    },
    async saveRefund({ request, response }) {
      await db
        .insertInto("payments_refunds")
        .values({
          refund_id: response.refundId,
          order_id: response.orderId,
          payment_id: response.paymentId,
          idempotency_key: request.idempotencyKey,
          provider: response.provider,
          status: response.status,
          amount_cents: response.amountCents,
          currency: response.currency,
          occurred_at: response.occurredAt,
          message: response.message ?? null
        })
        .onConflict((oc) => oc.columns(["order_id", "idempotency_key"]).doNothing())
        .execute();

      const persisted = await db
        .selectFrom("payments_refunds")
        .selectAll()
        .where("order_id", "=", request.orderId)
        .where("idempotency_key", "=", request.idempotencyKey)
        .executeTakeFirstOrThrow();

      return toRefundResponse(persisted as PersistedRefundRow);
    },
    async findLatestRefundForOrderAndPayment(orderId, paymentId) {
      const row = await db
        .selectFrom("payments_refunds")
        .selectAll()
        .where("order_id", "=", orderId)
        .where("payment_id", "=", paymentId)
        .orderBy("created_at", "desc")
        .executeTakeFirst();

      return row ? toRefundResponse(row as PersistedRefundRow) : undefined;
    },
    async updateRefundStatus({ refundId, status, message, occurredAt }) {
      const existing = await db
        .selectFrom("payments_refunds")
        .selectAll()
        .where("refund_id", "=", refundId)
        .executeTakeFirst();
      if (!existing) {
        return undefined;
      }

      await db
        .updateTable("payments_refunds")
        .set({
          status,
          message: message ?? existing.message,
          occurred_at: occurredAt
        })
        .where("refund_id", "=", refundId)
        .execute();

      const updated = await db
        .selectFrom("payments_refunds")
        .selectAll()
        .where("refund_id", "=", refundId)
        .executeTakeFirstOrThrow();
      return toRefundResponse(updated as PersistedRefundRow);
    },
    async close() {
      await db.destroy();
    }
  };
}

async function createPaymentsRepository(logger: FastifyBaseLogger): Promise<PaymentsRepository> {
  const databaseUrl = getDatabaseUrl();
  if (!databaseUrl) {
    logger.info({ backend: "memory" }, "payments persistence backend selected");
    return createInMemoryRepository();
  }

  try {
    const repository = await createPostgresRepository(databaseUrl);
    logger.info({ backend: "postgres" }, "payments persistence backend selected");
    return repository;
  } catch (error) {
    logger.error({ error }, "failed to initialize postgres persistence; falling back to in-memory");
    return createInMemoryRepository();
  }
}

const providerModeSchema = z.enum(["simulated", "live"]);
type ProviderMode = z.output<typeof providerModeSchema>;

type CloverProviderConfig = {
  mode: ProviderMode;
  configured: boolean;
  apiKey?: string;
  merchantId?: string;
  chargeEndpoint?: string;
  refundEndpoint?: string;
  applePayTokenizeEndpoint?: string;
  misconfigurationReason?: string;
};

function trimToUndefined(value: string | undefined) {
  const next = value?.trim();
  return next && next.length > 0 ? next : undefined;
}

function toPositiveInteger(value: string | undefined, fallback: number) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }

  return Math.floor(parsed);
}

function resolveProviderMode(rawMode: string | undefined): ProviderMode {
  const parsed = providerModeSchema.safeParse(rawMode?.trim().toLowerCase());
  return parsed.success ? parsed.data : "simulated";
}

function resolveCloverProviderConfig(
  logger: FastifyBaseLogger,
  env: NodeJS.ProcessEnv = process.env
): CloverProviderConfig {
  const rawMode = env.CLOVER_PROVIDER_MODE ?? env.PAYMENTS_PROVIDER_MODE ?? "simulated";
  const mode = resolveProviderMode(rawMode);
  const apiKey = trimToUndefined(env.CLOVER_API_KEY);
  const merchantId = trimToUndefined(env.CLOVER_MERCHANT_ID);
  const chargeEndpoint = trimToUndefined(env.CLOVER_CHARGE_ENDPOINT);
  const refundEndpoint = trimToUndefined(env.CLOVER_REFUND_ENDPOINT);
  const applePayTokenizeEndpoint = trimToUndefined(env.CLOVER_APPLE_PAY_TOKENIZE_ENDPOINT);

  if (mode === "simulated") {
    logger.info({ providerMode: mode }, "payments provider mode selected");
    return {
      mode,
      configured: true
    };
  }

  const missing: string[] = [];
  if (!apiKey) {
    missing.push("CLOVER_API_KEY");
  }
  if (!merchantId) {
    missing.push("CLOVER_MERCHANT_ID");
  }
  if (!chargeEndpoint) {
    missing.push("CLOVER_CHARGE_ENDPOINT");
  }
  if (!refundEndpoint) {
    missing.push("CLOVER_REFUND_ENDPOINT");
  }

  if (missing.length > 0) {
    const misconfigurationReason = `Missing required env for live Clover mode: ${missing.join(", ")}`;
    logger.error({ providerMode: mode, missing }, "payments provider misconfigured");
    return {
      mode,
      configured: false,
      apiKey,
      merchantId,
      chargeEndpoint,
      refundEndpoint,
      applePayTokenizeEndpoint,
      misconfigurationReason
    };
  }

  logger.info({ providerMode: mode }, "payments provider mode selected");
  return {
    mode,
    configured: true,
    apiKey,
    merchantId,
    chargeEndpoint,
    refundEndpoint,
    applePayTokenizeEndpoint
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function parseJsonSafely(raw: string): unknown {
  if (!raw || raw.length === 0) {
    return undefined;
  }

  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return raw;
  }
}

function readPath(value: unknown, path: string[]): unknown {
  let cursor: unknown = value;
  for (const part of path) {
    if (!isRecord(cursor) || !(part in cursor)) {
      return undefined;
    }
    cursor = cursor[part];
  }

  return cursor;
}

function firstStringAtPaths(value: unknown, paths: string[][]): string | undefined {
  for (const path of paths) {
    const candidate = readPath(value, path);
    if (typeof candidate === "string" && candidate.trim().length > 0) {
      return candidate.trim();
    }
  }

  return undefined;
}

function firstBooleanAtPaths(value: unknown, paths: string[][]): boolean | undefined {
  for (const path of paths) {
    const candidate = readPath(value, path);
    if (typeof candidate === "boolean") {
      return candidate;
    }
  }

  return undefined;
}

function firstNumberAtPaths(value: unknown, paths: string[][]): number | undefined {
  for (const path of paths) {
    const candidate = readPath(value, path);
    if (typeof candidate === "number" && Number.isFinite(candidate)) {
      return candidate;
    }
    if (typeof candidate === "string" && candidate.trim().length > 0) {
      const parsed = Number(candidate);
      if (Number.isFinite(parsed)) {
        return parsed;
      }
    }
  }

  return undefined;
}

function toIsoDate(value: unknown): string | undefined {
  if (typeof value !== "string" || value.trim().length === 0) {
    return undefined;
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return undefined;
  }

  return parsed.toISOString();
}

function firstIsoDateAtPaths(value: unknown, paths: string[][]): string | undefined {
  for (const path of paths) {
    const candidate = readPath(value, path);
    const parsed = toIsoDate(candidate);
    if (parsed) {
      return parsed;
    }
  }

  return undefined;
}

function toTemplatedUrl(template: string, variables: Record<string, string>) {
  let resolved = template;
  for (const [key, value] of Object.entries(variables)) {
    resolved = resolved.replaceAll(`{${key}}`, encodeURIComponent(value));
  }

  return resolved;
}

function resolveChargeStatus(params: {
  providerStatus?: string;
  approved?: boolean;
  httpStatus: number;
}): z.output<typeof chargeStatusSchema> {
  const providerStatus = params.providerStatus?.toLowerCase();
  if (providerStatus) {
    if (
      providerStatus.includes("timeout") ||
      providerStatus.includes("timed_out") ||
      providerStatus.includes("pending") ||
      providerStatus.includes("processing")
    ) {
      return "TIMEOUT";
    }
    if (
      providerStatus.includes("declin") ||
      providerStatus.includes("reject") ||
      providerStatus.includes("denied") ||
      providerStatus.includes("failed") ||
      providerStatus.includes("cancel")
    ) {
      return "DECLINED";
    }
    if (
      providerStatus.includes("success") ||
      providerStatus.includes("approv") ||
      providerStatus.includes("paid") ||
      providerStatus.includes("captur") ||
      providerStatus.includes("complete") ||
      providerStatus.includes("authoriz")
    ) {
      return "SUCCEEDED";
    }
  }

  if (params.approved === true) {
    return "SUCCEEDED";
  }
  if (params.httpStatus === 408 || params.httpStatus === 429 || params.httpStatus >= 500) {
    return "TIMEOUT";
  }
  if (params.httpStatus >= 400) {
    return "DECLINED";
  }

  return "SUCCEEDED";
}

function resolveRefundStatus(params: { providerStatus?: string; httpStatus: number }) {
  const providerStatus = params.providerStatus?.toLowerCase();
  if (providerStatus) {
    if (
      providerStatus.includes("refund") ||
      providerStatus.includes("succeed") ||
      providerStatus.includes("approv") ||
      providerStatus.includes("complete")
    ) {
      return "REFUNDED" as const;
    }
    if (
      providerStatus.includes("reject") ||
      providerStatus.includes("declin") ||
      providerStatus.includes("deny") ||
      providerStatus.includes("fail")
    ) {
      return "REJECTED" as const;
    }
  }

  if (params.httpStatus >= 400) {
    return "REJECTED" as const;
  }

  return "REFUNDED" as const;
}

type CloverWebhookResolution = {
  eventId?: string;
  kind: "CHARGE" | "REFUND";
  statusHint?: string;
  approved?: boolean;
  message?: string;
  declineCode?: string;
  occurredAt: string;
  orderId?: string;
  paymentReference?: string;
  amountCents?: number;
  currency?: "USD";
};

function normalizeWebhookKind(rawKind: string | undefined) {
  if (!rawKind) {
    return "CHARGE" as const;
  }
  const normalized = rawKind.toLowerCase();
  if (normalized.includes("refund")) {
    return "REFUND" as const;
  }
  return "CHARGE" as const;
}

function normalizeCurrency(rawCurrency: string | undefined): "USD" | undefined {
  if (!rawCurrency) {
    return undefined;
  }
  return rawCurrency.toUpperCase() === "USD" ? "USD" : undefined;
}

function resolveCloverWebhookPayload(payload: unknown): CloverWebhookResolution {
  const eventType = firstStringAtPaths(payload, [
    ["type"],
    ["eventType"],
    ["event_type"],
    ["topic"],
    ["name"],
    ["event", "type"]
  ]);
  const statusHint = firstStringAtPaths(payload, [
    ["status"],
    ["payment", "status"],
    ["charge", "status"],
    ["refund", "status"],
    ["result", "status"],
    ["data", "status"],
    ["event", "status"]
  ]);
  const kind = normalizeWebhookKind(eventType ?? statusHint);
  const eventId = firstStringAtPaths(payload, [
    ["eventId"],
    ["event_id"],
    ["id"],
    ["event", "id"],
    ["data", "eventId"]
  ]);
  const occurredAt =
    firstIsoDateAtPaths(payload, [
      ["occurredAt"],
      ["occurred_at"],
      ["timestamp"],
      ["event", "occurredAt"],
      ["event", "timestamp"],
      ["createdAt"],
      ["created_at"]
    ]) ?? new Date().toISOString();
  const message = firstStringAtPaths(payload, [
    ["message"],
    ["description"],
    ["reason"],
    ["error"],
    ["result", "message"],
    ["data", "message"]
  ]);
  const declineCode = firstStringAtPaths(payload, [
    ["declineCode"],
    ["decline_code"],
    ["reasonCode"],
    ["errorCode"],
    ["code"]
  ]);
  const paymentReference = firstStringAtPaths(payload, [
    ["providerPaymentId"],
    ["provider_payment_id"],
    ["paymentId"],
    ["payment_id"],
    ["chargeId"],
    ["charge_id"],
    ["payment", "id"],
    ["charge", "id"],
    ["data", "paymentId"],
    ["data", "id"],
    ["resource", "id"],
    ["object", "id"]
  ]);
  const orderId = firstStringAtPaths(payload, [
    ["orderId"],
    ["order_id"],
    ["metadata", "orderId"],
    ["metadata", "order_id"],
    ["payment", "metadata", "orderId"],
    ["charge", "metadata", "orderId"],
    ["data", "metadata", "orderId"],
    ["externalReference"],
    ["external_reference"]
  ]);
  const approved = firstBooleanAtPaths(payload, [
    ["approved"],
    ["payment", "approved"],
    ["charge", "approved"],
    ["result", "approved"],
    ["data", "approved"]
  ]);
  const amountRaw = firstNumberAtPaths(payload, [
    ["amountCents"],
    ["amount_cents"],
    ["amount"],
    ["payment", "amount"],
    ["refund", "amount"],
    ["data", "amount"]
  ]);
  const amountCents =
    amountRaw === undefined
      ? undefined
      : Number.isInteger(amountRaw)
        ? amountRaw
        : Math.round(amountRaw);
  const currency = normalizeCurrency(
    firstStringAtPaths(payload, [
      ["currency"],
      ["currencyCode"],
      ["currency_code"],
      ["payment", "currency"],
      ["refund", "currency"],
      ["data", "currency"]
    ])
  );

  return {
    eventId,
    kind,
    statusHint,
    approved,
    message,
    declineCode,
    occurredAt,
    orderId,
    paymentReference,
    amountCents: amountCents && amountCents > 0 ? amountCents : undefined,
    currency
  };
}

function getHeaderValue(headers: Record<string, unknown>, key: string): string | undefined {
  const value = headers[key];
  if (typeof value === "string" && value.trim().length > 0) {
    return value.trim();
  }
  if (Array.isArray(value)) {
    const first = value.find((entry) => typeof entry === "string" && entry.trim().length > 0);
    if (typeof first === "string") {
      return first.trim();
    }
  }
  return undefined;
}

async function dispatchOrderReconciliation(params: {
  ordersBaseUrl: string;
  internalToken?: string;
  requestId: string;
  payload: OrderPaymentReconciliation;
}): Promise<{ ok: true; response: z.output<typeof ordersPaymentReconciliationResultSchema> } | {
  ok: false;
  status?: number;
  body?: unknown;
}> {
  const headers: Record<string, string> = {
    "content-type": "application/json",
    "x-request-id": params.requestId
  };
  if (params.internalToken) {
    headers["x-internal-token"] = params.internalToken;
  }

  let upstream: Response;
  try {
    upstream = await fetch(`${params.ordersBaseUrl}/v1/orders/internal/payments/reconcile`, {
      method: "POST",
      headers,
      body: JSON.stringify(params.payload)
    });
  } catch {
    return { ok: false };
  }

  const body = parseJsonSafely(await upstream.text());
  if (!upstream.ok) {
    return {
      ok: false,
      status: upstream.status,
      body
    };
  }

  const parsed = ordersPaymentReconciliationResultSchema.safeParse(body);
  if (!parsed.success) {
    return {
      ok: false,
      status: upstream.status,
      body
    };
  }

  return {
    ok: true,
    response: parsed.data
  };
}

function createSimulatedChargeResponse(input: ChargeRequest): ChargeResponse {
  const simulationSignal = (input.applePayToken ?? input.applePayWallet?.data ?? "").toLowerCase();

  if (simulationSignal.includes("decline")) {
    return chargeResponseSchema.parse({
      paymentId: randomUUID(),
      provider: "CLOVER",
      orderId: input.orderId,
      status: "DECLINED",
      approved: false,
      amountCents: input.amountCents,
      currency: input.currency,
      occurredAt: new Date().toISOString(),
      declineCode: "CARD_DECLINED",
      message: "Clover declined the charge"
    });
  }

  if (simulationSignal.includes("timeout")) {
    return chargeResponseSchema.parse({
      paymentId: randomUUID(),
      provider: "CLOVER",
      orderId: input.orderId,
      status: "TIMEOUT",
      approved: false,
      amountCents: input.amountCents,
      currency: input.currency,
      occurredAt: new Date().toISOString(),
      message: "Clover timed out while processing charge"
    });
  }

  return chargeResponseSchema.parse({
    paymentId: randomUUID(),
    provider: "CLOVER",
    orderId: input.orderId,
    status: "SUCCEEDED",
    approved: true,
    amountCents: input.amountCents,
    currency: input.currency,
    occurredAt: new Date().toISOString(),
    message: "Clover accepted the charge"
  });
}

function createSimulatedRefundResponse(input: RefundRequest): RefundResponse {
  const shouldReject = input.reason.toLowerCase().includes("reject");
  return refundResponseSchema.parse({
    refundId: randomUUID(),
    provider: "CLOVER",
    orderId: input.orderId,
    paymentId: input.paymentId,
    status: shouldReject ? "REJECTED" : "REFUNDED",
    amountCents: input.amountCents,
    currency: input.currency,
    occurredAt: new Date().toISOString(),
    message: shouldReject ? "Clover rejected the refund" : "Clover accepted the refund"
  });
}

async function executeLiveCharge(params: {
  config: CloverProviderConfig;
  request: ChargeRequest;
  requestId: string;
}): Promise<{ response: ChargeResponse; providerPaymentId?: string }> {
  const { config, request, requestId } = params;
  if (!config.configured || !config.apiKey || !config.chargeEndpoint || !config.merchantId) {
    throw new Error(config.misconfigurationReason ?? "Clover provider is not configured");
  }

  const internalPaymentId = randomUUID();
  let sourceToken = request.applePayToken;
  if (!sourceToken && request.applePayWallet) {
    if (!config.applePayTokenizeEndpoint) {
      throw new Error("CLOVER_APPLE_PAY_TOKENIZE_ENDPOINT is required for applePayWallet requests");
    }

    const tokenizeResponse = await fetch(
      toTemplatedUrl(config.applePayTokenizeEndpoint, { merchantId: config.merchantId }),
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${config.apiKey}`,
          "x-api-key": config.apiKey,
          "x-request-id": requestId
        },
        body: JSON.stringify({
          merchantId: config.merchantId,
          walletType: "APPLE_PAY",
          wallet: request.applePayWallet
        })
      }
    );

    const tokenizeBody = parseJsonSafely(await tokenizeResponse.text());
    if (!tokenizeResponse.ok) {
      throw new Error(`Clover wallet tokenization failed with status ${tokenizeResponse.status}`);
    }

    sourceToken = firstStringAtPaths(tokenizeBody, [
      ["id"],
      ["token"],
      ["source"],
      ["sourceToken"],
      ["result", "id"],
      ["result", "token"],
      ["data", "id"],
      ["data", "token"]
    ]);

    if (!sourceToken) {
      throw new Error("Clover wallet tokenization did not return a source token");
    }
  }

  if (!sourceToken) {
    throw new Error("Unable to resolve Clover payment source token");
  }

  const chargeUrl = toTemplatedUrl(config.chargeEndpoint, { merchantId: config.merchantId });
  let chargeResponse: Response;
  try {
    chargeResponse = await fetch(chargeUrl, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${config.apiKey}`,
        "x-api-key": config.apiKey,
        "x-request-id": requestId,
        "idempotency-key": request.idempotencyKey
      },
      body: JSON.stringify({
        merchantId: config.merchantId,
        amount: request.amountCents,
        amountCents: request.amountCents,
        currency: request.currency,
        currencyCode: request.currency,
        source: sourceToken,
        sourceToken,
        externalReference: request.orderId,
        metadata: {
          orderId: request.orderId,
          internalPaymentId,
          idempotencyKey: request.idempotencyKey,
          origin: "gazelle-payments-service"
        }
      })
    });
  } catch {
    return {
      response: chargeResponseSchema.parse({
        paymentId: randomUUID(),
        provider: "CLOVER",
        orderId: request.orderId,
        status: "TIMEOUT",
        approved: false,
        amountCents: request.amountCents,
        currency: request.currency,
        occurredAt: new Date().toISOString(),
        message: "Clover network request failed"
      })
    };
  }

  const body = parseJsonSafely(await chargeResponse.text());
  const providerStatus = firstStringAtPaths(body, [
    ["status"],
    ["charge", "status"],
    ["payment", "status"],
    ["result", "status"],
    ["data", "status"]
  ]);
  const providerMessage =
    firstStringAtPaths(body, [
      ["message"],
      ["description"],
      ["reason"],
      ["error"],
      ["result", "message"],
      ["data", "message"]
    ]) ?? `Clover responded with status ${chargeResponse.status}`;
  const approved = firstBooleanAtPaths(body, [
    ["approved"],
    ["charge", "approved"],
    ["payment", "approved"],
    ["result", "approved"],
    ["data", "approved"]
  ]);
  const status = resolveChargeStatus({
    providerStatus,
    approved,
    httpStatus: chargeResponse.status
  });
  const providerPaymentId = firstStringAtPaths(body, [
    ["id"],
    ["paymentId"],
    ["payment_id"],
    ["chargeId"],
    ["charge_id"],
    ["result", "id"],
    ["data", "id"],
    ["payment", "id"],
    ["charge", "id"]
  ]);

  return {
    response: chargeResponseSchema.parse({
      paymentId: internalPaymentId,
      provider: "CLOVER",
      orderId: request.orderId,
      status,
      approved: status === "SUCCEEDED",
      amountCents: request.amountCents,
      currency: request.currency,
      occurredAt: new Date().toISOString(),
      declineCode:
        status === "DECLINED"
          ? firstStringAtPaths(body, [
              ["declineCode"],
              ["decline_code"],
              ["reasonCode"],
              ["reason_code"],
              ["errorCode"],
              ["error_code"],
              ["code"]
            ])
          : undefined,
      message: providerMessage
    }),
    providerPaymentId: providerPaymentId ?? internalPaymentId
  };
}

async function executeLiveRefund(params: {
  config: CloverProviderConfig;
  request: RefundRequest;
  requestId: string;
  providerPaymentId?: string;
}): Promise<RefundResponse> {
  const { config, request, requestId, providerPaymentId } = params;
  if (!config.configured || !config.apiKey || !config.refundEndpoint || !config.merchantId) {
    throw new Error(config.misconfigurationReason ?? "Clover provider is not configured");
  }

  const refundUrl = toTemplatedUrl(config.refundEndpoint, {
    merchantId: config.merchantId,
    paymentId: providerPaymentId ?? request.paymentId
  });
  const upstream = await fetch(refundUrl, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${config.apiKey}`,
      "x-api-key": config.apiKey,
      "x-request-id": requestId,
      "idempotency-key": request.idempotencyKey
    },
    body: JSON.stringify({
      merchantId: config.merchantId,
      paymentId: providerPaymentId ?? request.paymentId,
      amount: request.amountCents,
      amountCents: request.amountCents,
      currency: request.currency,
      reason: request.reason,
      metadata: {
        orderId: request.orderId,
        idempotencyKey: request.idempotencyKey,
        origin: "gazelle-payments-service"
      }
    })
  });

  const body = parseJsonSafely(await upstream.text());
  const providerStatus = firstStringAtPaths(body, [
    ["status"],
    ["refund", "status"],
    ["result", "status"],
    ["data", "status"]
  ]);
  const status = resolveRefundStatus({
    providerStatus,
    httpStatus: upstream.status
  });

  return refundResponseSchema.parse({
    refundId: randomUUID(),
    provider: "CLOVER",
    orderId: request.orderId,
    paymentId: request.paymentId,
    status,
    amountCents: request.amountCents,
    currency: request.currency,
    occurredAt: new Date().toISOString(),
    message:
      firstStringAtPaths(body, [
        ["message"],
        ["description"],
        ["reason"],
        ["error"],
        ["result", "message"],
        ["data", "message"]
      ]) ?? `Clover responded with status ${upstream.status}`
  });
}

export async function registerRoutes(app: FastifyInstance) {
  const repository = await createPaymentsRepository(app.log);
  const cloverProvider = resolveCloverProviderConfig(app.log);
  const ordersBaseUrl = process.env.ORDERS_SERVICE_BASE_URL ?? "http://127.0.0.1:3001";
  const ordersInternalToken = trimToUndefined(process.env.ORDERS_INTERNAL_API_TOKEN);
  const cloverWebhookSharedSecret = trimToUndefined(process.env.CLOVER_WEBHOOK_SHARED_SECRET);
  const rateLimitWindowMs = toPositiveInteger(process.env.PAYMENTS_RATE_LIMIT_WINDOW_MS, defaultRateLimitWindowMs);
  const paymentsWriteRateLimit = {
    max: toPositiveInteger(process.env.PAYMENTS_RATE_LIMIT_WRITE_MAX, defaultPaymentsWriteRateLimitMax),
    timeWindow: rateLimitWindowMs
  };
  const paymentsWebhookRateLimit = {
    max: toPositiveInteger(process.env.PAYMENTS_RATE_LIMIT_WEBHOOK_MAX, defaultWebhookRateLimitMax),
    timeWindow: rateLimitWindowMs
  };

  app.addHook("onClose", async () => {
    await repository.close();
  });

  app.get("/health", async () => ({ status: "ok", service: "payments" }));
  app.get("/ready", async () => ({
    status: "ready",
    service: "payments",
    persistence: repository.backend,
    providerMode: cloverProvider.mode,
    providerConfigured: cloverProvider.configured
  }));

  app.post("/v1/payments/charges", { preHandler: app.rateLimit(paymentsWriteRateLimit) }, async (request, reply) => {
    const input = chargeRequestSchema.parse(request.body);
    const existing = await repository.findChargeByIdempotency(input.orderId, input.idempotencyKey);

    if (existing) {
      return existing;
    }

    if (cloverProvider.mode === "live" && !cloverProvider.configured) {
      return reply.status(503).send(
        serviceErrorSchema.parse({
          code: "PROVIDER_MISCONFIGURED",
          message: cloverProvider.misconfigurationReason ?? "Clover provider is misconfigured",
          requestId: request.id
        })
      );
    }

    if (cloverProvider.mode === "simulated") {
      const chargeResponse = createSimulatedChargeResponse(input);
      return repository.saveCharge({
        request: input,
        response: chargeResponse,
        providerPaymentId: chargeResponse.paymentId
      });
    }

    try {
      const result = await executeLiveCharge({
        config: cloverProvider,
        request: input,
        requestId: request.id
      });

      return repository.saveCharge({
        request: input,
        response: result.response,
        providerPaymentId: result.providerPaymentId
      });
    } catch (error) {
      request.log.error({ error }, "live Clover charge failed");
      return reply.status(502).send(
        serviceErrorSchema.parse({
          code: "CLOVER_CHARGE_ERROR",
          message: error instanceof Error ? error.message : "Live Clover charge failed",
          requestId: request.id
        })
      );
    }
  });

  app.post("/v1/payments/refunds", { preHandler: app.rateLimit(paymentsWriteRateLimit) }, async (request, reply) => {
    const input = refundRequestSchema.parse(request.body);
    const existingRefund = await repository.findRefundByIdempotency(input.orderId, input.idempotencyKey);

    if (existingRefund) {
      return existingRefund;
    }

    const chargeLookup = await repository.findLatestChargeForOrder(input.orderId);
    const chargeResult = chargeLookup?.charge;
    if (!chargeResult || chargeResult.paymentId !== input.paymentId) {
      return reply.status(404).send(
        serviceErrorSchema.parse({
          code: "PAYMENT_NOT_FOUND",
          message: "Payment not found for refund",
          requestId: request.id,
          details: { orderId: input.orderId, paymentId: input.paymentId }
        })
      );
    }

    if (chargeResult.status !== "SUCCEEDED") {
      return reply.status(409).send(
        serviceErrorSchema.parse({
          code: "PAYMENT_NOT_REFUNDABLE",
          message: `Payment in status ${chargeResult.status} is not refundable`,
          requestId: request.id,
          details: { orderId: input.orderId, paymentId: input.paymentId, status: chargeResult.status }
        })
      );
    }

    if (cloverProvider.mode === "live" && !cloverProvider.configured) {
      return reply.status(503).send(
        serviceErrorSchema.parse({
          code: "PROVIDER_MISCONFIGURED",
          message: cloverProvider.misconfigurationReason ?? "Clover provider is misconfigured",
          requestId: request.id
        })
      );
    }

    if (cloverProvider.mode === "simulated") {
      const refundResponse = createSimulatedRefundResponse(input);
      return repository.saveRefund({ request: input, response: refundResponse });
    }

    try {
      const refundResponse = await executeLiveRefund({
        config: cloverProvider,
        request: input,
        requestId: request.id,
        providerPaymentId: chargeLookup?.providerPaymentId
      });
      return repository.saveRefund({ request: input, response: refundResponse });
    } catch (error) {
      request.log.error({ error }, "live Clover refund failed");
      return reply.status(502).send(
        serviceErrorSchema.parse({
          code: "CLOVER_REFUND_ERROR",
          message: error instanceof Error ? error.message : "Live Clover refund failed",
          requestId: request.id
        })
      );
    }
  });

  app.post("/v1/payments/webhooks/clover", { preHandler: app.rateLimit(paymentsWebhookRateLimit) }, async (request, reply) => {
    if (cloverWebhookSharedSecret) {
      const requestHeaders = request.headers as Record<string, unknown>;
      const providedSecret =
        getHeaderValue(requestHeaders, "x-clover-webhook-secret") ??
        getHeaderValue(requestHeaders, "x-webhook-secret") ??
        getHeaderValue(requestHeaders, "x-clover-signature");
      if (!providedSecret || providedSecret !== cloverWebhookSharedSecret) {
        return reply.status(401).send(
          serviceErrorSchema.parse({
            code: "UNAUTHORIZED_WEBHOOK",
            message: "Webhook secret validation failed",
            requestId: request.id
          })
        );
      }
    }

    const resolved = resolveCloverWebhookPayload(request.body);
    if (!resolved.paymentReference && !resolved.orderId) {
      return reply.status(400).send(
        serviceErrorSchema.parse({
          code: "INVALID_WEBHOOK_PAYLOAD",
          message: "Webhook payload must include payment or order reference",
          requestId: request.id
        })
      );
    }

    const chargeLookupFromPayment = resolved.paymentReference
      ? await repository.findChargeByProviderPaymentId(resolved.paymentReference)
      : undefined;
    const chargeLookupFromOrder =
      !chargeLookupFromPayment && resolved.orderId
        ? await repository.findLatestChargeForOrder(resolved.orderId)
        : undefined;
    const chargeLookup = chargeLookupFromPayment ?? chargeLookupFromOrder;

    if (!chargeLookup) {
      return reply.status(404).send(
        serviceErrorSchema.parse({
          code: "PAYMENT_NOT_FOUND",
          message: "Unable to resolve payment from Clover webhook payload",
          requestId: request.id,
          details: {
            paymentReference: resolved.paymentReference,
            orderId: resolved.orderId
          }
        })
      );
    }

    const orderId = resolved.orderId ?? chargeLookup.charge.orderId;
    const paymentId = chargeLookup.charge.paymentId;

    if (resolved.kind === "CHARGE") {
      const status = resolveChargeStatus({
        providerStatus: resolved.statusHint,
        approved: resolved.approved,
        httpStatus: 200
      });
      const reconciledCharge =
        (await repository.updateChargeStatus({
          paymentId,
          status,
          message: resolved.message,
          declineCode: resolved.declineCode,
          occurredAt: resolved.occurredAt
        })) ?? chargeLookup.charge;

      const payload = ordersPaymentReconciliationSchema.parse({
        eventId: resolved.eventId,
        provider: "CLOVER",
        kind: "CHARGE",
        orderId,
        paymentId,
        status: reconciledCharge.status,
        occurredAt: reconciledCharge.occurredAt,
        message: reconciledCharge.message,
        declineCode: reconciledCharge.declineCode,
        amountCents: resolved.amountCents ?? reconciledCharge.amountCents,
        currency: resolved.currency ?? reconciledCharge.currency
      });
      const dispatchResult = await dispatchOrderReconciliation({
        ordersBaseUrl,
        internalToken: ordersInternalToken,
        requestId: request.id,
        payload
      });

      if (!dispatchResult.ok) {
        request.log.error(
          { orderId, paymentId, webhookEventId: resolved.eventId, dispatchResult },
          "failed to dispatch charge reconciliation to orders service"
        );
        return reply.status(502).send(
          serviceErrorSchema.parse({
            code: "ORDERS_RECONCILIATION_FAILED",
            message: "Orders reconciliation call failed",
            requestId: request.id,
            details: {
              upstreamStatus: dispatchResult.status,
              upstreamBody: dispatchResult.body
            }
          })
        );
      }

      return {
        accepted: true,
        kind: "CHARGE",
        orderId,
        paymentId,
        status: reconciledCharge.status,
        orderApplied: dispatchResult.response.applied
      };
    }

    const refundStatus = resolveRefundStatus({
      providerStatus: resolved.statusHint,
      httpStatus: 200
    });
    const latestRefund = await repository.findLatestRefundForOrderAndPayment(orderId, paymentId);
    const reconciledRefund =
      latestRefund && refundStatus
        ? await repository.updateRefundStatus({
            refundId: latestRefund.refundId,
            status: refundStatus,
            message: resolved.message,
            occurredAt: resolved.occurredAt
          })
        : undefined;

    const payload = ordersPaymentReconciliationSchema.parse({
      eventId: resolved.eventId,
      provider: "CLOVER",
      kind: "REFUND",
      orderId,
      paymentId,
      refundId: reconciledRefund?.refundId ?? latestRefund?.refundId,
      status: refundStatus,
      occurredAt: resolved.occurredAt,
      message: resolved.message ?? reconciledRefund?.message ?? latestRefund?.message,
      amountCents:
        resolved.amountCents ?? reconciledRefund?.amountCents ?? latestRefund?.amountCents ?? chargeLookup.charge.amountCents,
      currency: resolved.currency ?? reconciledRefund?.currency ?? latestRefund?.currency ?? chargeLookup.charge.currency
    });
    const dispatchResult = await dispatchOrderReconciliation({
      ordersBaseUrl,
      internalToken: ordersInternalToken,
      requestId: request.id,
      payload
    });
    if (!dispatchResult.ok) {
      request.log.error(
        { orderId, paymentId, webhookEventId: resolved.eventId, dispatchResult },
        "failed to dispatch refund reconciliation to orders service"
      );
      return reply.status(502).send(
        serviceErrorSchema.parse({
          code: "ORDERS_RECONCILIATION_FAILED",
          message: "Orders reconciliation call failed",
          requestId: request.id,
          details: {
            upstreamStatus: dispatchResult.status,
            upstreamBody: dispatchResult.body
          }
        })
      );
    }

    return {
      accepted: true,
      kind: "REFUND",
      orderId,
      paymentId,
      status: refundStatus,
      orderApplied: dispatchResult.response.applied
    };
  });

  app.post("/v1/payments/internal/ping", async (request) => {
    const parsed = payloadSchema.parse(request.body ?? {});

    return {
      service: "payments",
      accepted: true,
      payload: parsed
    };
  });
}
