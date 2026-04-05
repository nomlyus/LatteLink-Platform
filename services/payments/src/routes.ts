import type { FastifyBaseLogger, FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { createHash, createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import {
  allowsInMemoryPersistence,
  buildPersistenceStartupError,
  createPostgresDb,
  getDatabaseUrl,
  runMigrations
} from "@gazelle/persistence";
import {
  applePayWalletSchema,
  orderSchema,
  ordersPaymentReconciliationResultSchema,
  ordersPaymentReconciliationSchema
} from "@gazelle/contracts-orders";
import {
  paymentWebhookDispatchResultSchema,
  type PaymentWebhookDispatchResult
} from "./types.js";
import { getAdapter } from "./adapters/index.js";

const payloadSchema = z.object({
  id: z.string().uuid().optional()
});
const defaultRateLimitWindowMs = 60_000;
const defaultPaymentsWriteRateLimitMax = 60;
const defaultWebhookRateLimitMax = 120;
const defaultCloverWebhookVerificationCodeTtlMs = 15 * 60_000;
const cloverCredentialsUnavailableMessage =
  "Clover merchant credentials are not configured. Complete the Clover OAuth connection flow.";
const cloverEndpointsByEnvironment = {
  sandbox: {
    authorizeEndpoint: "https://sandbox.dev.clover.com/oauth/v2/authorize",
    tokenEndpoint: "https://apisandbox.dev.clover.com/oauth/v2/token",
    refreshEndpoint: "https://apisandbox.dev.clover.com/oauth/v2/refresh",
    pakmsEndpoint: "https://scl-sandbox.dev.clover.com/pakms/apikey",
    chargeEndpoint: "https://scl-sandbox.dev.clover.com/v1/charges",
    refundEndpoint: "https://scl-sandbox.dev.clover.com/v1/refunds",
    applePayTokenizeEndpoint: "https://token-sandbox.dev.clover.com/v1/tokens"
  },
  production: {
    authorizeEndpoint: "https://www.clover.com/oauth/v2/authorize",
    tokenEndpoint: "https://api.clover.com/oauth/v2/token",
    refreshEndpoint: "https://api.clover.com/oauth/v2/refresh",
    pakmsEndpoint: "https://scl.clover.com/pakms/apikey",
    chargeEndpoint: "https://scl.clover.com/v1/charges",
    refundEndpoint: "https://scl.clover.com/v1/refunds",
    applePayTokenizeEndpoint: "https://token.clover.com/v1/tokens"
  }
} as const;

const chargeRequestSchema = z.object({
  orderId: z.string().uuid(),
  amountCents: z.number().int().positive(),
  currency: z.literal("USD"),
  paymentSourceToken: z.string().min(1).optional(),
  applePayToken: z.string().min(1).optional(),
  applePayWallet: applePayWalletSchema.optional(),
  idempotencyKey: z.string().min(1)
}).superRefine((input, context) => {
  const hasPaymentSourceToken = Boolean(input.paymentSourceToken);
  const hasToken = Boolean(input.applePayToken);
  const hasWallet = Boolean(input.applePayWallet);
  const methodCount = [hasPaymentSourceToken, hasToken, hasWallet].filter(Boolean).length;

  if (methodCount === 0) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["paymentSourceToken"],
      message: "Provide exactly one payment method."
    });
  }

  if (methodCount > 1) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["applePayWallet"],
      message: "Provide exactly one payment method."
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

const submitOrderResponseSchema = z.object({
  accepted: z.literal(true),
  merchantId: z.string().min(1).optional()
});

const serviceErrorSchema = z.object({
  code: z.string(),
  message: z.string(),
  requestId: z.string(),
  details: z.record(z.unknown()).optional()
});

const internalHeadersSchema = z.object({
  "x-internal-token": z.string().optional()
});

const cloverOauthCallbackQuerySchema = z.object({
  code: z.string().min(1).optional(),
  state: z.string().min(1).optional(),
  merchant_id: z.string().min(1).optional(),
  merchantId: z.string().min(1).optional(),
  error: z.string().min(1).optional(),
  error_description: z.string().min(1).optional(),
  errorDescription: z.string().min(1).optional()
});

const cloverOauthConnectResponseSchema = z.object({
  authorizeUrl: z.string().url(),
  redirectUri: z.string().url(),
  stateExpiresAt: z.string().datetime()
});

const cloverCardEntryConfigResponseSchema = z.object({
  enabled: z.boolean(),
  providerMode: z.enum(["simulated", "live"]),
  environment: z.enum(["sandbox", "production"]).optional(),
  tokenizeEndpoint: z.string().url().optional(),
  apiAccessKey: z.string().min(1).optional(),
  merchantId: z.string().min(1).optional()
});

const cloverOauthStatusSchema = z.object({
  providerMode: z.enum(["simulated", "live"]),
  oauthConfigured: z.boolean(),
  connected: z.boolean(),
  credentialSource: z.enum(["none", "oauth"]),
  merchantId: z.string().min(1).optional(),
  connectedMerchantId: z.string().min(1).optional(),
  accessTokenExpiresAt: z.string().datetime().optional(),
  apiAccessKeyConfigured: z.boolean()
});

const cloverWebhookVerificationCodeResponseSchema = z.object({
  available: z.literal(true),
  verificationCode: z.string().min(1),
  receivedAt: z.string().datetime(),
  expiresAt: z.string().datetime()
});

const cloverOauthTokenResponseSchema = z.object({
  access_token: z.string().min(1),
  refresh_token: z.string().min(1).optional(),
  token_type: z.string().min(1).optional(),
  scope: z.union([z.string().min(1), z.array(z.string().min(1))]).optional(),
  expires_in: z.union([z.number().int().positive(), z.string().min(1)]).optional(),
  refresh_token_expires_in: z.union([z.number().int().positive(), z.string().min(1)]).optional(),
  access_token_expiration: z.union([z.number().int().positive(), z.string().min(1)]).optional(),
  refresh_token_expiration: z.union([z.number().int().positive(), z.string().min(1)]).optional(),
  merchant_id: z.string().min(1).optional()
});

export type ChargeResponse = z.output<typeof chargeResponseSchema>;
export type RefundResponse = z.output<typeof refundResponseSchema>;
export type ChargeRequest = z.output<typeof chargeRequestSchema>;
export type RefundRequest = z.output<typeof refundRequestSchema>;
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

type PersistedWebhookDedupRow = {
  event_key: string;
  kind: "CHARGE" | "REFUND";
  order_id: string;
  payment_id: string;
  status: string;
  order_applied: boolean;
  created_at: string;
};

type PersistedCloverConnectionRow = {
  merchant_id: string;
  access_token: string;
  refresh_token: string | null;
  access_token_expires_at: string | null;
  refresh_token_expires_at: string | null;
  api_access_key: string | null;
  token_type: string | null;
  scope: string | null;
};

export type CloverConnection = {
  merchantId: string;
  accessToken: string;
  refreshToken?: string;
  accessTokenExpiresAt?: string;
  refreshTokenExpiresAt?: string;
  apiAccessKey?: string;
  tokenType?: string;
  scope?: string;
};

type RecentCloverWebhookVerificationCode = z.output<typeof cloverWebhookVerificationCodeResponseSchema>;

export type PaymentsRepository = {
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
  findCloverConnection(merchantId: string): Promise<CloverConnection | undefined>;
  findLatestCloverConnection(): Promise<CloverConnection | undefined>;
  saveCloverConnection(connection: CloverConnection): Promise<CloverConnection>;
  findWebhookResult(eventKey: string): Promise<PaymentWebhookDispatchResult | undefined>;
  saveWebhookResult(eventKey: string, result: PaymentWebhookDispatchResult): Promise<void>;
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

function toWebhookDispatchResult(row: PersistedWebhookDedupRow): PaymentWebhookDispatchResult {
  return paymentWebhookDispatchResultSchema.parse({
    accepted: true,
    kind: row.kind,
    orderId: row.order_id,
    paymentId: row.payment_id,
    status: row.status,
    orderApplied: row.order_applied
  });
}

function toCloverConnection(row: PersistedCloverConnectionRow): CloverConnection {
  return {
    merchantId: row.merchant_id,
    accessToken: row.access_token,
    refreshToken: row.refresh_token ?? undefined,
    accessTokenExpiresAt: row.access_token_expires_at ? new Date(row.access_token_expires_at).toISOString() : undefined,
    refreshTokenExpiresAt: row.refresh_token_expires_at
      ? new Date(row.refresh_token_expires_at).toISOString()
      : undefined,
    apiAccessKey: row.api_access_key ?? undefined,
    tokenType: row.token_type ?? undefined,
    scope: row.scope ?? undefined
  };
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
  const webhookResultsByEventKey = new Map<string, PaymentWebhookDispatchResult>();
  const cloverConnectionsByMerchantId = new Map<string, CloverConnection>();
  let latestCloverMerchantId: string | undefined;

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
    async findCloverConnection(merchantId) {
      return cloverConnectionsByMerchantId.get(merchantId);
    },
    async findLatestCloverConnection() {
      return latestCloverMerchantId ? cloverConnectionsByMerchantId.get(latestCloverMerchantId) : undefined;
    },
    async saveCloverConnection(connection) {
      cloverConnectionsByMerchantId.set(connection.merchantId, connection);
      latestCloverMerchantId = connection.merchantId;
      return connection;
    },
    async findWebhookResult(eventKey) {
      return webhookResultsByEventKey.get(eventKey);
    },
    async saveWebhookResult(eventKey, result) {
      webhookResultsByEventKey.set(eventKey, result);
    },
    async close() {
      // no-op
    }
  };
}

async function createPostgresRepository(connectionString: string): Promise<PaymentsRepository> {
  const db = createPostgresDb(connectionString);
  await runMigrations(db);

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
    async findCloverConnection(merchantId) {
      const row = await db
        .selectFrom("payments_clover_connections")
        .selectAll()
        .where("merchant_id", "=", merchantId)
        .executeTakeFirst();

      return row ? toCloverConnection(row as PersistedCloverConnectionRow) : undefined;
    },
    async findLatestCloverConnection() {
      const row = await db
        .selectFrom("payments_clover_connections")
        .selectAll()
        .orderBy("updated_at", "desc")
        .executeTakeFirst();

      return row ? toCloverConnection(row as PersistedCloverConnectionRow) : undefined;
    },
    async saveCloverConnection(connection) {
      await db
        .insertInto("payments_clover_connections")
        .values({
          merchant_id: connection.merchantId,
          access_token: connection.accessToken,
          refresh_token: connection.refreshToken ?? null,
          access_token_expires_at: connection.accessTokenExpiresAt ?? null,
          refresh_token_expires_at: connection.refreshTokenExpiresAt ?? null,
          api_access_key: connection.apiAccessKey ?? null,
          token_type: connection.tokenType ?? null,
          scope: connection.scope ?? null
        })
        .onConflict((oc) =>
          oc.column("merchant_id").doUpdateSet({
            access_token: connection.accessToken,
            refresh_token: connection.refreshToken ?? null,
            access_token_expires_at: connection.accessTokenExpiresAt ?? null,
            refresh_token_expires_at: connection.refreshTokenExpiresAt ?? null,
            api_access_key: connection.apiAccessKey ?? null,
            token_type: connection.tokenType ?? null,
            scope: connection.scope ?? null,
            updated_at: new Date().toISOString()
          })
        )
        .execute();

      const persisted = await db
        .selectFrom("payments_clover_connections")
        .selectAll()
        .where("merchant_id", "=", connection.merchantId)
        .executeTakeFirstOrThrow();
      return toCloverConnection(persisted as PersistedCloverConnectionRow);
    },
    async findWebhookResult(eventKey) {
      const row = await db
        .selectFrom("payments_webhook_deduplication")
        .selectAll()
        .where("event_key", "=", eventKey)
        .executeTakeFirst();

      return row ? toWebhookDispatchResult(row as PersistedWebhookDedupRow) : undefined;
    },
    async saveWebhookResult(eventKey, result) {
      await db
        .insertInto("payments_webhook_deduplication")
        .values({
          event_key: eventKey,
          kind: result.kind,
          order_id: result.orderId,
          payment_id: result.paymentId,
          status: result.status,
          order_applied: result.orderApplied
        })
        .onConflict((oc) => oc.column("event_key").doNothing())
        .execute();
    },
    async close() {
      await db.destroy();
    }
  };
}

async function createPaymentsRepository(logger: FastifyBaseLogger): Promise<PaymentsRepository> {
  const databaseUrl = getDatabaseUrl();
  const allowInMemory = allowsInMemoryPersistence();
  if (!databaseUrl) {
    if (!allowInMemory) {
      throw buildPersistenceStartupError({
        service: "payments",
        reason: "missing_database_url"
      });
    }

    logger.warn({ backend: "memory" }, "payments persistence backend selected with explicit in-memory mode");
    return createInMemoryRepository();
  }

  try {
    const repository = await createPostgresRepository(databaseUrl);
    logger.info({ backend: "postgres" }, "payments persistence backend selected");
    return repository;
  } catch (error) {
    if (!allowInMemory) {
      logger.error({ error }, "failed to initialize postgres persistence");
      throw buildPersistenceStartupError({
        service: "payments",
        reason: "postgres_initialization_failed"
      });
    }

    logger.error({ error }, "failed to initialize postgres persistence; using explicit in-memory fallback");
    return createInMemoryRepository();
  }
}

const providerModeSchema = z.enum(["simulated", "live"]);
type ProviderMode = z.output<typeof providerModeSchema>;

export type CloverProviderConfig = {
  mode: ProviderMode;
  configured: boolean;
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

function readThrownServiceError(
  error: unknown
): { statusCode: number; code: string; message: string } | undefined {
  if (typeof error !== "object" || error === null) {
    return undefined;
  }

  const statusCode = "statusCode" in error && typeof error.statusCode === "number" ? error.statusCode : undefined;
  const code = "code" in error && typeof error.code === "string" ? error.code : undefined;
  const message = "message" in error && typeof error.message === "string" ? error.message : undefined;
  if (!statusCode || !code || !message) {
    return undefined;
  }

  return {
    statusCode,
    code,
    message
  };
}

function logPaymentsMutation(
  request: FastifyRequest,
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

function secretsMatch(expected: string, provided: string) {
  const expectedBuffer = Buffer.from(expected, "utf8");
  const providedBuffer = Buffer.from(provided, "utf8");
  if (expectedBuffer.length !== providedBuffer.length) {
    return false;
  }

  return timingSafeEqual(expectedBuffer, providedBuffer);
}

function authorizeInternalRequest(
  request: FastifyRequest,
  reply: FastifyReply,
  internalToken: string | undefined
) {
  if (!internalToken) {
    sendError(reply, {
      statusCode: 503,
      code: "INTERNAL_ACCESS_NOT_CONFIGURED",
      message: "ORDERS_INTERNAL_API_TOKEN must be configured before accepting internal payment writes",
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
    message: "Internal payments token is invalid",
    requestId: request.id
  });
  return false;
}

function authorizeWebhookRequest(
  request: FastifyRequest,
  reply: FastifyReply,
  sharedSecret: string | undefined
) {
  if (!sharedSecret) {
    sendError(reply, {
      statusCode: 503,
      code: "WEBHOOK_AUTH_NOT_CONFIGURED",
      message: "CLOVER_WEBHOOK_SHARED_SECRET must be configured before accepting Clover webhooks",
      requestId: request.id
    });
    return false;
  }

  const requestHeaders = request.headers as Record<string, unknown>;
  const providedSecret =
    getHeaderValue(requestHeaders, "x-clover-auth") ??
    getHeaderValue(requestHeaders, "x-clover-webhook-secret") ??
    getHeaderValue(requestHeaders, "x-webhook-secret") ??
    getHeaderValue(requestHeaders, "x-clover-signature");
  if (!providedSecret || !secretsMatch(sharedSecret, providedSecret)) {
    sendError(reply, {
      statusCode: 401,
      code: "UNAUTHORIZED_WEBHOOK",
      message: "Webhook secret validation failed",
      requestId: request.id
    });
    return false;
  }

  return true;
}

function resolveProviderMode(rawMode: string | undefined): ProviderMode {
  const parsed = providerModeSchema.safeParse(rawMode?.trim().toLowerCase());
  return parsed.success ? parsed.data : "simulated";
}

function resolveCloverProviderConfig(
  logger: FastifyBaseLogger,
  env: NodeJS.ProcessEnv = process.env
): CloverProviderConfig {
  const rawMode = env.PAYMENTS_PROVIDER_MODE ?? "simulated";
  const mode = resolveProviderMode(rawMode);
  const environment = resolveCloverOAuthEnvironment(env.CLOVER_OAUTH_ENVIRONMENT);
  const endpoints = cloverEndpointsByEnvironment[environment];

  if (mode === "simulated") {
    logger.info({ providerMode: mode }, "payments provider mode selected");
    return {
      mode,
      configured: true
    };
  }

  logger.info({ providerMode: mode }, "payments provider mode selected");
  return {
    mode,
    configured: true,
    chargeEndpoint: endpoints.chargeEndpoint,
    refundEndpoint: endpoints.refundEndpoint,
    applePayTokenizeEndpoint: endpoints.applePayTokenizeEndpoint
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

function resolveCloverWebhookVerificationCode(value: unknown): string | undefined {
  return firstStringAtPaths(value, [["verificationCode"], ["verification_code"]]);
}

export function summarizeCloverResponseForLogs(value: unknown): Record<string, string> {
  const summary = {
    status: firstStringAtPaths(value, [
      ["status"],
      ["result", "status"],
      ["data", "status"],
      ["payment", "status"],
      ["charge", "status"],
      ["refund", "status"]
    ]),
    code: firstStringAtPaths(value, [
      ["code"],
      ["errorCode"],
      ["error_code"],
      ["reasonCode"],
      ["reason_code"],
      ["result", "code"],
      ["data", "code"]
    ]),
    message: firstStringAtPaths(value, [
      ["message"],
      ["description"],
      ["reason"],
      ["error"],
      ["result", "message"],
      ["data", "message"]
    ])
  };

  const entries = Object.entries(summary).filter((entry): entry is [string, string] => entry[1] !== undefined);
  return Object.fromEntries(entries);
}

type CloverOAuthEnvironment = "sandbox" | "production";

export type CloverOAuthConfig = {
  configured: boolean;
  environment: CloverOAuthEnvironment;
  appId?: string;
  appSecret?: string;
  redirectUri?: string;
  stateSigningSecret?: string;
  authorizeEndpoint: string;
  tokenEndpoint: string;
  refreshEndpoint: string;
  pakmsEndpoint: string;
  misconfigurationReason?: string;
};

export type CloverRuntimeCredentials = {
  merchantId: string;
  bearerToken: string;
  apiAccessKey?: string;
  source: "oauth";
};

export type CloverCredentialsUnavailableError = {
  error: {
    statusCode: 503;
    code: "CLOVER_CREDENTIALS_UNAVAILABLE";
    message: string;
  };
};

function resolveCloverOAuthEnvironment(rawValue: string | undefined): CloverOAuthEnvironment {
  return rawValue?.trim().toLowerCase() === "production" ? "production" : "sandbox";
}

function buildCloverCredentialsUnavailableError(): CloverCredentialsUnavailableError {
  return {
    error: {
      statusCode: 503,
      code: "CLOVER_CREDENTIALS_UNAVAILABLE",
      message: cloverCredentialsUnavailableMessage
    }
  };
}

export function isCloverCredentialsUnavailableError(
  value: CloverRuntimeCredentials | CloverCredentialsUnavailableError | undefined
): value is CloverCredentialsUnavailableError {
  return value !== undefined && "error" in value;
}

function resolveCloverOAuthConfig(env: NodeJS.ProcessEnv = process.env): CloverOAuthConfig {
  const environment = resolveCloverOAuthEnvironment(env.CLOVER_OAUTH_ENVIRONMENT);
  const endpoints = cloverEndpointsByEnvironment[environment];
  const appId = trimToUndefined(env.CLOVER_APP_ID);
  const appSecret = trimToUndefined(env.CLOVER_APP_SECRET);
  const redirectUri = trimToUndefined(env.CLOVER_OAUTH_REDIRECT_URI);
  const stateSigningSecret = trimToUndefined(env.CLOVER_OAUTH_STATE_SECRET) ?? appSecret;

  const missing: string[] = [];
  if (!appId) {
    missing.push("CLOVER_APP_ID");
  }
  if (!appSecret) {
    missing.push("CLOVER_APP_SECRET");
  }
  if (!redirectUri) {
    missing.push("CLOVER_OAUTH_REDIRECT_URI");
  }
  if (!stateSigningSecret) {
    missing.push("CLOVER_OAUTH_STATE_SECRET");
  }

  return {
    configured: missing.length === 0,
    environment,
    appId,
    appSecret,
    redirectUri,
    stateSigningSecret,
    authorizeEndpoint: endpoints.authorizeEndpoint,
    tokenEndpoint: endpoints.tokenEndpoint,
    refreshEndpoint: endpoints.refreshEndpoint,
    pakmsEndpoint: endpoints.pakmsEndpoint,
    misconfigurationReason:
      missing.length > 0 ? `Missing required env for Clover OAuth flow: ${missing.join(", ")}` : undefined
  };
}

function toIsoFromSeconds(nowMs: number, expiresInValue: unknown) {
  const expiresIn =
    typeof expiresInValue === "number"
      ? expiresInValue
      : typeof expiresInValue === "string" && expiresInValue.trim().length > 0
        ? Number(expiresInValue)
        : NaN;
  if (!Number.isFinite(expiresIn) || expiresIn <= 0) {
    return undefined;
  }

  return new Date(nowMs + expiresIn * 1000).toISOString();
}

function toIsoFromUnixSeconds(unixSecondsValue: unknown) {
  const unixSeconds =
    typeof unixSecondsValue === "number"
      ? unixSecondsValue
      : typeof unixSecondsValue === "string" && unixSecondsValue.trim().length > 0
        ? Number(unixSecondsValue)
        : NaN;
  if (!Number.isFinite(unixSeconds) || unixSeconds <= 0) {
    return undefined;
  }

  return new Date(unixSeconds * 1000).toISOString();
}

function resolveCloverTokenExpiration(params: {
  nowMs: number;
  expiresIn?: unknown;
  absoluteUnixSeconds?: unknown;
}) {
  return (
    toIsoFromUnixSeconds(params.absoluteUnixSeconds) ??
    toIsoFromSeconds(params.nowMs, params.expiresIn)
  );
}

function isExpiringWithin(expiresAt: string | undefined, thresholdMs: number) {
  if (!expiresAt) {
    return false;
  }
  const expiresAtMs = Date.parse(expiresAt);
  if (Number.isNaN(expiresAtMs)) {
    return false;
  }

  return expiresAtMs - Date.now() <= thresholdMs;
}

function encodeSignedState(payload: Record<string, unknown>, secret: string) {
  const encodedPayload = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  const signature = createHmac("sha256", secret).update(encodedPayload).digest("base64url");
  return `${encodedPayload}.${signature}`;
}

function decodeSignedState(
  state: string,
  secret: string,
  maxAgeMs = 10 * 60_000
): { issuedAtMs: number; merchantId?: string } | undefined {
  const [encodedPayload, signature] = state.split(".");
  if (!encodedPayload || !signature) {
    return undefined;
  }

  const expectedSignature = createHmac("sha256", secret).update(encodedPayload).digest("base64url");
  const expectedBuffer = Buffer.from(expectedSignature, "utf8");
  const actualBuffer = Buffer.from(signature, "utf8");
  if (expectedBuffer.length !== actualBuffer.length) {
    return undefined;
  }
  if (!timingSafeEqual(expectedBuffer, actualBuffer)) {
    return undefined;
  }

  try {
    const parsed = z
      .object({
        issuedAtMs: z.number().int().positive(),
        merchantId: z.string().min(1).optional()
      })
      .parse(JSON.parse(Buffer.from(encodedPayload, "base64url").toString("utf8")) as unknown);
    if (Date.now() - parsed.issuedAtMs > maxAgeMs) {
      return undefined;
    }

    return parsed;
  } catch {
    return undefined;
  }
}

function buildCloverAuthorizeUrl(params: {
  oauthConfig: CloverOAuthConfig;
  merchantId?: string;
}) {
  const { oauthConfig, merchantId } = params;
  if (!oauthConfig.configured || !oauthConfig.appId || !oauthConfig.redirectUri || !oauthConfig.stateSigningSecret) {
    throw new Error(oauthConfig.misconfigurationReason ?? "Clover OAuth is not configured");
  }

  const state = encodeSignedState(
    {
      issuedAtMs: Date.now(),
      merchantId
    },
    oauthConfig.stateSigningSecret
  );
  const authorizeUrl = new URL(oauthConfig.authorizeEndpoint);
  authorizeUrl.searchParams.set("client_id", oauthConfig.appId);
  authorizeUrl.searchParams.set("response_type", "code");
  authorizeUrl.searchParams.set("redirect_uri", oauthConfig.redirectUri);
  authorizeUrl.searchParams.set("state", state);

  return {
    authorizeUrl: authorizeUrl.toString(),
    stateExpiresAt: new Date(Date.now() + 10 * 60_000).toISOString()
  };
}

function normalizeScope(scope: string | string[] | undefined) {
  if (Array.isArray(scope)) {
    return scope.join(" ");
  }

  return scope;
}

async function exchangeCloverAuthorizationCode(params: {
  oauthConfig: CloverOAuthConfig;
  code: string;
}): Promise<CloverConnection> {
  const { oauthConfig, code } = params;
  if (!oauthConfig.configured || !oauthConfig.appId || !oauthConfig.appSecret || !oauthConfig.redirectUri) {
    throw new Error(oauthConfig.misconfigurationReason ?? "Clover OAuth is not configured");
  }

  const body = JSON.stringify({
    client_id: oauthConfig.appId,
    client_secret: oauthConfig.appSecret,
    code
  });

  const tokenExchangeController = new AbortController()
  const tokenExchangeTimeout = setTimeout(() => tokenExchangeController.abort(), 10_000)
  let upstream: Response
  try {
    upstream = await fetch(oauthConfig.tokenEndpoint, {
      method: "POST",
      headers: {
        accept: "application/json",
        "content-type": "application/json"
      },
      body,
      signal: tokenExchangeController.signal,
    })
  } finally {
    clearTimeout(tokenExchangeTimeout)
  }
  const parsedBody = parseJsonSafely(await upstream.text());
  if (!upstream.ok) {
    throw new Error(
      firstStringAtPaths(parsedBody, [["message"], ["error_description"], ["error"]]) ??
        `Clover OAuth token exchange failed with status ${upstream.status}`
    );
  }

  const parsed = cloverOauthTokenResponseSchema.parse(parsedBody);
  const nowMs = Date.now();
  return {
    merchantId: parsed.merchant_id ?? "",
    accessToken: parsed.access_token,
    refreshToken: parsed.refresh_token,
    accessTokenExpiresAt: resolveCloverTokenExpiration({
      nowMs,
      expiresIn: parsed.expires_in,
      absoluteUnixSeconds: parsed.access_token_expiration
    }),
    refreshTokenExpiresAt: resolveCloverTokenExpiration({
      nowMs,
      expiresIn: parsed.refresh_token_expires_in,
      absoluteUnixSeconds: parsed.refresh_token_expiration
    }),
    tokenType: parsed.token_type,
    scope: normalizeScope(parsed.scope)
  };
}

async function refreshCloverConnection(params: {
  oauthConfig: CloverOAuthConfig;
  connection: CloverConnection;
}): Promise<CloverConnection> {
  const { oauthConfig, connection } = params;
  if (!oauthConfig.configured || !oauthConfig.appId || !oauthConfig.appSecret || !connection.refreshToken) {
    throw new Error("Clover OAuth refresh is not configured");
  }

  const body = JSON.stringify({
    client_id: oauthConfig.appId,
    refresh_token: connection.refreshToken
  });

  const tokenRefreshController = new AbortController()
  const tokenRefreshTimeout = setTimeout(() => tokenRefreshController.abort(), 10_000)
  let upstream: Response
  try {
    upstream = await fetch(oauthConfig.refreshEndpoint, {
      method: "POST",
      headers: {
        accept: "application/json",
        "content-type": "application/json"
      },
      body,
      signal: tokenRefreshController.signal,
    })
  } finally {
    clearTimeout(tokenRefreshTimeout)
  }
  const parsedBody = parseJsonSafely(await upstream.text());
  if (!upstream.ok) {
    throw new Error(
      firstStringAtPaths(parsedBody, [["message"], ["error_description"], ["error"]]) ??
        `Clover OAuth refresh failed with status ${upstream.status}`
    );
  }

  const parsed = cloverOauthTokenResponseSchema.parse(parsedBody);
  const nowMs = Date.now();
  return {
    merchantId: connection.merchantId,
    accessToken: parsed.access_token,
    refreshToken: parsed.refresh_token ?? connection.refreshToken,
    accessTokenExpiresAt:
      resolveCloverTokenExpiration({
        nowMs,
        expiresIn: parsed.expires_in,
        absoluteUnixSeconds: parsed.access_token_expiration
      }) ?? connection.accessTokenExpiresAt,
    refreshTokenExpiresAt:
      resolveCloverTokenExpiration({
        nowMs,
        expiresIn: parsed.refresh_token_expires_in,
        absoluteUnixSeconds: parsed.refresh_token_expiration
      }) ?? connection.refreshTokenExpiresAt,
    apiAccessKey: connection.apiAccessKey,
    tokenType: parsed.token_type ?? connection.tokenType,
    scope: normalizeScope(parsed.scope) ?? connection.scope
  };
}

async function fetchCloverApiAccessKey(params: {
  oauthConfig: CloverOAuthConfig;
  accessToken: string;
}): Promise<string> {
  const pakmsController = new AbortController()
  const pakmsTimeout = setTimeout(() => pakmsController.abort(), 10_000)
  let upstream: Response
  try {
    upstream = await fetch(params.oauthConfig.pakmsEndpoint, {
      method: "GET",
      headers: {
        accept: "application/json",
        authorization: `Bearer ${params.accessToken}`
      },
      signal: pakmsController.signal,
    })
  } finally {
    clearTimeout(pakmsTimeout)
  }
  const parsedBody = parseJsonSafely(await upstream.text());
  if (!upstream.ok) {
    throw new Error(
      firstStringAtPaths(parsedBody, [["message"], ["error_description"], ["error"]]) ??
        `Clover apiAccessKey lookup failed with status ${upstream.status}`
    );
  }

  const apiAccessKey = firstStringAtPaths(parsedBody, [
    ["apiAccessKey"],
    ["api_access_key"],
    ["apikey"],
    ["key"],
    ["result", "apiAccessKey"],
    ["data", "apiAccessKey"]
  ]);
  if (!apiAccessKey) {
    throw new Error("Clover apiAccessKey lookup did not return an apiAccessKey");
  }

  return apiAccessKey;
}

export async function resolveRuntimeCloverCredentials(params: {
  logger: FastifyBaseLogger;
  repository: PaymentsRepository;
  providerConfig: CloverProviderConfig;
  oauthConfig: CloverOAuthConfig;
  allowRefresh?: boolean;
}): Promise<CloverRuntimeCredentials | CloverCredentialsUnavailableError | undefined> {
  const { logger, repository, providerConfig, oauthConfig, allowRefresh = true } = params;
  if (providerConfig.mode !== "live") {
    return undefined;
  }

  const connectedMerchant = await repository.findLatestCloverConnection();

  if (connectedMerchant) {
    let resolvedConnection = connectedMerchant;
    let shouldPersistConnection = false;

    if (
      allowRefresh &&
      oauthConfig.configured &&
      resolvedConnection.refreshToken &&
      isExpiringWithin(resolvedConnection.accessTokenExpiresAt, 60_000)
    ) {
      resolvedConnection = await refreshCloverConnection({
        oauthConfig,
        connection: resolvedConnection
      });
      if (!resolvedConnection.apiAccessKey) {
        resolvedConnection.apiAccessKey = await fetchCloverApiAccessKey({
          oauthConfig,
          accessToken: resolvedConnection.accessToken
        });
        shouldPersistConnection = true;
      }
      shouldPersistConnection = true;
      logger.info({ merchantId: resolvedConnection.merchantId }, "refreshed Clover OAuth access token");
    }

    if (allowRefresh && oauthConfig.configured && !resolvedConnection.apiAccessKey) {
      resolvedConnection.apiAccessKey = await fetchCloverApiAccessKey({
        oauthConfig,
        accessToken: resolvedConnection.accessToken
      });
      shouldPersistConnection = true;
      logger.info({ merchantId: resolvedConnection.merchantId }, "fetched Clover API access key");
    }

    if (shouldPersistConnection) {
      resolvedConnection = await repository.saveCloverConnection(resolvedConnection);
    }

    return {
      merchantId: resolvedConnection.merchantId,
      bearerToken: resolvedConnection.accessToken,
      apiAccessKey: resolvedConnection.apiAccessKey,
      source: "oauth"
    };
  }

  return buildCloverCredentialsUnavailableError();
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

function buildWebhookEventKey(params: {
  resolved: CloverWebhookResolution;
  kind: "CHARGE" | "REFUND";
  orderId: string;
  paymentId: string;
  status: string;
}) {
  const { resolved, kind, orderId, paymentId, status } = params;
  if (resolved.eventId) {
    return `event:${kind}:${orderId}:${paymentId}:${resolved.eventId}`;
  }

  return createHash("sha256")
    .update(
      JSON.stringify({
        kind,
        orderId,
        paymentId,
        status,
        occurredAt: resolved.occurredAt,
        message: resolved.message ?? "",
        declineCode: resolved.declineCode ?? "",
        amountCents: resolved.amountCents ?? null,
        currency: resolved.currency ?? null
      })
    )
    .digest("hex");
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
  const simulationSignal = (input.paymentSourceToken ?? input.applePayToken ?? input.applePayWallet?.data ?? "").toLowerCase();

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
  logger: FastifyBaseLogger;
  repository: PaymentsRepository;
  oauthConfig: CloverOAuthConfig;
}): Promise<{ response: ChargeResponse; providerPaymentId?: string }> {
  const adapter = await getAdapter({
    logger: params.logger,
    repository: params.repository,
    providerConfig: params.config,
    oauthConfig: params.oauthConfig,
    requestId: params.requestId
  });
  return adapter.processCharge(params.request);
}

async function executeLiveRefund(params: {
  config: CloverProviderConfig;
  request: RefundRequest;
  requestId: string;
  logger: FastifyBaseLogger;
  providerPaymentId?: string;
  repository: PaymentsRepository;
  oauthConfig: CloverOAuthConfig;
}): Promise<RefundResponse> {
  const adapter = await getAdapter({
    logger: params.logger,
    repository: params.repository,
    providerConfig: params.config,
    oauthConfig: params.oauthConfig,
    requestId: params.requestId
  });
  return adapter.processRefund(params.request, params.providerPaymentId);
}

export async function registerRoutes(app: FastifyInstance) {
  const repository = await createPaymentsRepository(app.log);
  const cloverProvider = resolveCloverProviderConfig(app.log);
  const cloverOAuthConfig = resolveCloverOAuthConfig();
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
  const cloverWebhookVerificationCodeTtlMs = toPositiveInteger(
    process.env.CLOVER_WEBHOOK_VERIFICATION_CODE_TTL_MS,
    defaultCloverWebhookVerificationCodeTtlMs
  );
  let latestCloverWebhookVerificationCode: RecentCloverWebhookVerificationCode | undefined;

  const requireOrdersInternalWriteAccess = async (request: FastifyRequest, reply: FastifyReply) => {
    if (!authorizeInternalRequest(request, reply, ordersInternalToken)) {
      return reply;
    }
  };

  app.addHook("onClose", async () => {
    await repository.close();
  });

  const buildCloverOauthStatus = async () => {
    const latestConnection = await repository.findLatestCloverConnection();
    const runtimeCredentials = await resolveRuntimeCloverCredentials({
      logger: app.log,
      repository,
      providerConfig: cloverProvider,
      oauthConfig: cloverOAuthConfig,
      allowRefresh: false
    });
    const resolvedCredentials = isCloverCredentialsUnavailableError(runtimeCredentials) ? undefined : runtimeCredentials;

    return cloverOauthStatusSchema.parse({
      providerMode: cloverProvider.mode,
      oauthConfigured: cloverOAuthConfig.configured,
      connected: Boolean(latestConnection),
      credentialSource: resolvedCredentials?.source ?? "none",
      merchantId: latestConnection?.merchantId,
      connectedMerchantId: latestConnection?.merchantId,
      accessTokenExpiresAt: latestConnection?.accessTokenExpiresAt,
      apiAccessKeyConfigured: Boolean(resolvedCredentials?.apiAccessKey ?? latestConnection?.apiAccessKey)
    });
  };

  const buildCloverCardEntryConfig = async () => {
    const runtimeCredentials =
      cloverProvider.mode === "live"
        ? await resolveRuntimeCloverCredentials({
            logger: app.log,
            repository,
            providerConfig: cloverProvider,
            oauthConfig: cloverOAuthConfig,
            allowRefresh: false
          })
        : undefined;
    const resolvedCredentials = isCloverCredentialsUnavailableError(runtimeCredentials) ? undefined : runtimeCredentials;
    const apiAccessKey = resolvedCredentials?.apiAccessKey;
    const tokenizeEndpoint = cloverProvider.applePayTokenizeEndpoint;
    const merchantId = resolvedCredentials?.merchantId;

    return cloverCardEntryConfigResponseSchema.parse({
      enabled: Boolean(apiAccessKey && tokenizeEndpoint),
      providerMode: cloverProvider.mode,
      environment: cloverOAuthConfig.environment,
      tokenizeEndpoint,
      apiAccessKey,
      merchantId
    });
  };
  const readLatestCloverWebhookVerificationCode = () => {
    if (!latestCloverWebhookVerificationCode) {
      return undefined;
    }

    if (Date.parse(latestCloverWebhookVerificationCode.expiresAt) <= Date.now()) {
      latestCloverWebhookVerificationCode = undefined;
      return undefined;
    }

    return latestCloverWebhookVerificationCode;
  };

  app.get("/health", async () => ({ status: "ok", service: "payments" }));
  app.get("/ready", async (_request, reply) => {
    const runtimeCredentials =
      cloverProvider.mode === "live"
        ? await resolveRuntimeCloverCredentials({
            logger: app.log,
            repository,
            providerConfig: cloverProvider,
            oauthConfig: cloverOAuthConfig,
            allowRefresh: false
          })
        : undefined;
    const hasRuntimeCredentials =
      runtimeCredentials !== undefined && !isCloverCredentialsUnavailableError(runtimeCredentials);
    const status = {
      status: hasRuntimeCredentials || cloverProvider.mode === "simulated" ? "ready" : "degraded",
      service: "payments",
      persistence: repository.backend,
      providerMode: cloverProvider.mode,
      providerConfigured: hasRuntimeCredentials || cloverProvider.mode === "simulated"
    } as const;

    if (cloverProvider.mode === "live" && !hasRuntimeCredentials) {
      return reply.status(503).send(status);
    }

    return status;
  });

  app.get("/v1/payments/clover/oauth/status", async () => buildCloverOauthStatus());

  app.get("/v1/payments/clover/card-entry-config", async () => buildCloverCardEntryConfig());
  app.get("/v1/payments/clover/webhooks/verification-code", async (request, reply) => {
    const latestVerificationCode = readLatestCloverWebhookVerificationCode();

    if (!latestVerificationCode) {
      return reply.status(404).send(
        serviceErrorSchema.parse({
          code: "CLOVER_WEBHOOK_VERIFICATION_CODE_NOT_FOUND",
          message: "No active Clover webhook verification code is available",
          requestId: request.id
        })
      );
    }

    return cloverWebhookVerificationCodeResponseSchema.parse(latestVerificationCode);
  });

  app.get("/v1/payments/clover/oauth/connect", async (request, reply) => {
    if (!cloverOAuthConfig.configured || !cloverOAuthConfig.appId || !cloverOAuthConfig.redirectUri || !cloverOAuthConfig.stateSigningSecret) {
      return reply.status(503).send(
        serviceErrorSchema.parse({
          code: "CLOVER_OAUTH_NOT_CONFIGURED",
          message: cloverOAuthConfig.misconfigurationReason ?? "Clover OAuth is not configured",
          requestId: request.id
        })
      );
    }

    const { authorizeUrl, stateExpiresAt } = buildCloverAuthorizeUrl({
      oauthConfig: cloverOAuthConfig
    });

    return cloverOauthConnectResponseSchema.parse({
      authorizeUrl,
      redirectUri: cloverOAuthConfig.redirectUri,
      stateExpiresAt
    });
  });

  app.get("/v1/payments/clover/oauth/callback", async (request, reply) => {
    const query = cloverOauthCallbackQuerySchema.parse(request.query ?? {});
    if (!cloverOAuthConfig.configured || !cloverOAuthConfig.stateSigningSecret) {
      return reply.status(503).send(
        serviceErrorSchema.parse({
          code: "CLOVER_OAUTH_NOT_CONFIGURED",
          message: cloverOAuthConfig.misconfigurationReason ?? "Clover OAuth is not configured",
          requestId: request.id
        })
      );
    }

    if (query.error) {
      return reply.status(400).send(
        serviceErrorSchema.parse({
          code: "CLOVER_OAUTH_DENIED",
          message: query.error_description ?? query.errorDescription ?? query.error,
          requestId: request.id
        })
      );
    }

    if (!query.code || !query.state) {
      const launchMerchantId = trimToUndefined(query.merchant_id) ?? trimToUndefined(query.merchantId);
      if (launchMerchantId) {
        try {
          const { authorizeUrl } = buildCloverAuthorizeUrl({
            oauthConfig: cloverOAuthConfig,
            merchantId: launchMerchantId
          });
          return reply.redirect(authorizeUrl);
        } catch (error) {
          request.log.error({ error, requestId: request.id }, "Clover OAuth launch redirect failed");
          return reply.status(503).send(
            serviceErrorSchema.parse({
              code: "CLOVER_OAUTH_NOT_CONFIGURED",
              message: cloverOAuthConfig.misconfigurationReason ?? "Clover OAuth is not configured",
              requestId: request.id
            })
          );
        }
      }

      return reply.status(400).send(
        serviceErrorSchema.parse({
          code: "CLOVER_OAUTH_INVALID_CALLBACK",
          message: "Clover OAuth callback must include code and state",
          requestId: request.id
        })
      );
    }

    const decodedState = decodeSignedState(query.state, cloverOAuthConfig.stateSigningSecret);
    if (!decodedState) {
      return reply.status(400).send(
        serviceErrorSchema.parse({
          code: "CLOVER_OAUTH_INVALID_STATE",
          message: "Clover OAuth state validation failed",
          requestId: request.id
        })
      );
    }

    try {
      const exchanged = await exchangeCloverAuthorizationCode({
        oauthConfig: cloverOAuthConfig,
        code: query.code
      });
      const merchantId =
        trimToUndefined(query.merchant_id) ??
        trimToUndefined(query.merchantId) ??
        trimToUndefined(decodedState.merchantId) ??
        trimToUndefined(exchanged.merchantId);
      if (!merchantId) {
        return reply.status(400).send(
          serviceErrorSchema.parse({
            code: "CLOVER_OAUTH_MISSING_MERCHANT",
            message: "Clover OAuth callback did not provide a merchant_id",
            requestId: request.id
          })
        );
      }

      const apiAccessKey = await fetchCloverApiAccessKey({
        oauthConfig: cloverOAuthConfig,
        accessToken: exchanged.accessToken
      });
      await repository.saveCloverConnection({
        ...exchanged,
        merchantId,
        apiAccessKey
      });

      const status = await buildCloverOauthStatus();
      logPaymentsMutation(request, "clover oauth callback connected merchant", {
        merchantId,
        providerMode: status.providerMode,
        credentialSource: status.credentialSource
      });
      return status;
    } catch (error) {
      request.log.error({ error, requestId: request.id }, "Clover OAuth callback exchange failed");
      return reply.status(502).send(
        serviceErrorSchema.parse({
          code: "CLOVER_OAUTH_EXCHANGE_ERROR",
          message: error instanceof Error ? error.message : "Clover OAuth callback exchange failed",
          requestId: request.id
        })
      );
    }
  });

  app.post("/v1/payments/clover/oauth/refresh", async (request, reply) => {
    if (!cloverOAuthConfig.configured) {
      return reply.status(503).send(
        serviceErrorSchema.parse({
          code: "CLOVER_OAUTH_NOT_CONFIGURED",
          message: cloverOAuthConfig.misconfigurationReason ?? "Clover OAuth is not configured",
          requestId: request.id
        })
      );
    }

    const connection = await repository.findLatestCloverConnection();
    if (!connection) {
      return reply.status(404).send(
        serviceErrorSchema.parse({
          code: "CLOVER_OAUTH_NOT_CONNECTED",
          message: "No Clover OAuth connection is stored",
          requestId: request.id
        })
      );
    }

    try {
      const refreshedConnection = await refreshCloverConnection({
        oauthConfig: cloverOAuthConfig,
        connection
      });
      const apiAccessKey =
        refreshedConnection.apiAccessKey ??
        (await fetchCloverApiAccessKey({
          oauthConfig: cloverOAuthConfig,
          accessToken: refreshedConnection.accessToken
        }));
      await repository.saveCloverConnection({
        ...refreshedConnection,
        apiAccessKey
      });
      const status = await buildCloverOauthStatus();
      logPaymentsMutation(request, "clover oauth connection refreshed", {
        merchantId: status.connectedMerchantId ?? status.merchantId ?? null,
        providerMode: status.providerMode,
        credentialSource: status.credentialSource
      });
      return status;
    } catch (error) {
      request.log.error({ error, requestId: request.id }, "Clover OAuth refresh failed");
      return reply.status(502).send(
        serviceErrorSchema.parse({
          code: "CLOVER_OAUTH_REFRESH_ERROR",
          message: error instanceof Error ? error.message : "Clover OAuth refresh failed",
          requestId: request.id
        })
      );
    }
  });

  app.post(
    "/v1/payments/orders/submit",
    { preHandler: [app.rateLimit(paymentsWriteRateLimit), requireOrdersInternalWriteAccess] },
    async (request, reply) => {
    const order = orderSchema.parse(request.body);
    if (cloverProvider.mode === "simulated") {
      return submitOrderResponseSchema.parse({ accepted: true });
    }

    try {
      const adapter = await getAdapter({
        logger: request.log,
        repository,
        providerConfig: cloverProvider,
        oauthConfig: cloverOAuthConfig,
        requestId: request.id
      });
      await adapter.submitOrder(order);
      const latestConnection = await repository.findLatestCloverConnection();

      return submitOrderResponseSchema.parse({
        accepted: true,
        merchantId: latestConnection?.merchantId
      });
    } catch (error) {
      const serviceError = readThrownServiceError(error);
      const message = error instanceof Error ? error.message : "Live Clover order submission failed";
      const misconfigurationMessage =
        cloverOAuthConfig.misconfigurationReason ??
        cloverProvider.misconfigurationReason ??
        "Clover provider is misconfigured";
      const merchantId =
        typeof (error as { merchantId?: unknown } | null | undefined)?.merchantId === "string"
          ? (error as { merchantId?: string }).merchantId
          : undefined;

      if (serviceError?.code === "CLOVER_CREDENTIALS_UNAVAILABLE") {
        return reply.status(serviceError.statusCode).send(
          serviceErrorSchema.parse({
            code: serviceError.code,
            message: serviceError.message,
            requestId: request.id
          })
        );
      }

      if (message === misconfigurationMessage || message === "Clover provider is misconfigured") {
        return reply.status(503).send(
          serviceErrorSchema.parse({
            code: "PROVIDER_MISCONFIGURED",
            message: misconfigurationMessage,
            requestId: request.id
          })
        );
      }

      request.log.error(
        { error, requestId: request.id, orderId: order.id, merchantId },
        "live Clover order submission failed"
      );
      return reply.status(502).send(
        serviceErrorSchema.parse({
          code: "CLOVER_ORDER_SUBMIT_ERROR",
          message,
          requestId: request.id,
          details: {
            orderId: order.id,
            merchantId
          }
        })
      );
    }
    }
  );

  app.post("/v1/payments/charges", { preHandler: app.rateLimit(paymentsWriteRateLimit) }, async (request, reply) => {
    if (!authorizeInternalRequest(request, reply, ordersInternalToken)) {
      return;
    }

    const input = chargeRequestSchema.parse(request.body);
    const existing = await repository.findChargeByIdempotency(input.orderId, input.idempotencyKey);

    if (existing) {
      if (
        existing.orderId !== input.orderId ||
        existing.amountCents !== input.amountCents ||
        existing.currency !== input.currency
      ) {
        return reply.status(409).send(
          serviceErrorSchema.parse({
            code: "IDEMPOTENCY_KEY_REUSE",
            message: "Charge idempotency key was already used for a different payment request",
            requestId: request.id,
            details: {
              orderId: input.orderId,
              amountCents: input.amountCents,
              currency: input.currency
            }
          })
        );
      }

      logPaymentsMutation(request, "charge idempotency replayed", {
        orderId: existing.orderId,
        paymentId: existing.paymentId,
        status: existing.status,
        provider: existing.provider
      });
      return existing;
    }

    if (cloverProvider.mode === "simulated") {
      const chargeResponse = createSimulatedChargeResponse(input);
      const savedCharge = await repository.saveCharge({
        request: input,
        response: chargeResponse,
        providerPaymentId: chargeResponse.paymentId
      });
      logPaymentsMutation(request, "charge accepted", {
        orderId: savedCharge.orderId,
        paymentId: savedCharge.paymentId,
        status: savedCharge.status,
        provider: savedCharge.provider,
        providerMode: cloverProvider.mode
      });
      return savedCharge;
    }

    try {
      const result = await executeLiveCharge({
        config: cloverProvider,
        request: input,
        requestId: request.id,
        logger: request.log,
        repository,
        oauthConfig: cloverOAuthConfig
      });

      const savedCharge = await repository.saveCharge({
        request: input,
        response: result.response,
        providerPaymentId: result.providerPaymentId
      });
      logPaymentsMutation(request, "charge accepted", {
        orderId: savedCharge.orderId,
        paymentId: savedCharge.paymentId,
        status: savedCharge.status,
        provider: savedCharge.provider,
        providerMode: cloverProvider.mode
      });
      return savedCharge;
    } catch (error) {
      const serviceError = readThrownServiceError(error);
      const message = error instanceof Error ? error.message : "Live Clover charge failed";
      const misconfigurationMessage =
        cloverOAuthConfig.misconfigurationReason ??
        cloverProvider.misconfigurationReason ??
        "Clover provider is misconfigured";
      if (serviceError?.code === "CLOVER_CREDENTIALS_UNAVAILABLE") {
        return reply.status(serviceError.statusCode).send(
          serviceErrorSchema.parse({
            code: serviceError.code,
            message: serviceError.message,
            requestId: request.id
          })
        );
      }
      if (message === misconfigurationMessage || message === "Clover provider is misconfigured") {
        return reply.status(503).send(
          serviceErrorSchema.parse({
            code: "PROVIDER_MISCONFIGURED",
            message: misconfigurationMessage,
            requestId: request.id
          })
        );
      }

      request.log.error({ error, requestId: request.id, orderId: input.orderId }, "live Clover charge failed");
      return reply.status(502).send(
        serviceErrorSchema.parse({
          code: "CLOVER_CHARGE_ERROR",
          message,
          requestId: request.id
        })
      );
    }
  });

  app.post("/v1/payments/refunds", { preHandler: app.rateLimit(paymentsWriteRateLimit) }, async (request, reply) => {
    if (!authorizeInternalRequest(request, reply, ordersInternalToken)) {
      return;
    }

    const input = refundRequestSchema.parse(request.body);
    const existingRefund = await repository.findRefundByIdempotency(input.orderId, input.idempotencyKey);

    if (existingRefund) {
      if (
        existingRefund.orderId !== input.orderId ||
        existingRefund.paymentId !== input.paymentId ||
        existingRefund.amountCents !== input.amountCents ||
        existingRefund.currency !== input.currency
      ) {
        return reply.status(409).send(
          serviceErrorSchema.parse({
            code: "IDEMPOTENCY_KEY_REUSE",
            message: "Refund idempotency key was already used for a different refund request",
            requestId: request.id,
            details: {
              orderId: input.orderId,
              paymentId: input.paymentId,
              amountCents: input.amountCents,
              currency: input.currency
            }
          })
        );
      }

      logPaymentsMutation(request, "refund idempotency replayed", {
        orderId: existingRefund.orderId,
        paymentId: existingRefund.paymentId,
        refundId: existingRefund.refundId,
        status: existingRefund.status,
        provider: existingRefund.provider
      });
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

    if (cloverProvider.mode === "simulated") {
      const refundResponse = createSimulatedRefundResponse(input);
      const savedRefund = await repository.saveRefund({ request: input, response: refundResponse });
      logPaymentsMutation(request, "refund accepted", {
        orderId: savedRefund.orderId,
        paymentId: savedRefund.paymentId,
        refundId: savedRefund.refundId,
        status: savedRefund.status,
        provider: savedRefund.provider,
        providerMode: cloverProvider.mode
      });
      return savedRefund;
    }

    try {
      const refundResponse = await executeLiveRefund({
        config: cloverProvider,
        request: input,
        requestId: request.id,
        logger: request.log,
        providerPaymentId: chargeLookup?.providerPaymentId,
        repository,
        oauthConfig: cloverOAuthConfig
      });
      const savedRefund = await repository.saveRefund({ request: input, response: refundResponse });
      logPaymentsMutation(request, "refund accepted", {
        orderId: savedRefund.orderId,
        paymentId: savedRefund.paymentId,
        refundId: savedRefund.refundId,
        status: savedRefund.status,
        provider: savedRefund.provider,
        providerMode: cloverProvider.mode
      });
      return savedRefund;
    } catch (error) {
      const serviceError = readThrownServiceError(error);
      const message = error instanceof Error ? error.message : "Live Clover refund failed";
      const misconfigurationMessage =
        cloverOAuthConfig.misconfigurationReason ??
        cloverProvider.misconfigurationReason ??
        "Clover provider is misconfigured";
      if (serviceError?.code === "CLOVER_CREDENTIALS_UNAVAILABLE") {
        return reply.status(serviceError.statusCode).send(
          serviceErrorSchema.parse({
            code: serviceError.code,
            message: serviceError.message,
            requestId: request.id
          })
        );
      }
      if (message === misconfigurationMessage || message === "Clover provider is misconfigured") {
        return reply.status(503).send(
          serviceErrorSchema.parse({
            code: "PROVIDER_MISCONFIGURED",
            message: misconfigurationMessage,
            requestId: request.id
          })
        );
      }

      request.log.error(
        { error, requestId: request.id, orderId: input.orderId, paymentId: input.paymentId },
        "live Clover refund failed"
      );
      return reply.status(502).send(
        serviceErrorSchema.parse({
          code: "CLOVER_REFUND_ERROR",
          message,
          requestId: request.id
        })
      );
    }
  });

  app.post("/v1/payments/webhooks/clover", { preHandler: app.rateLimit(paymentsWebhookRateLimit) }, async (request, reply) => {
    const verificationCode = resolveCloverWebhookVerificationCode(request.body);
    if (verificationCode) {
      const receivedAt = new Date().toISOString();
      latestCloverWebhookVerificationCode = cloverWebhookVerificationCodeResponseSchema.parse({
        available: true,
        verificationCode,
        receivedAt,
        expiresAt: new Date(Date.now() + cloverWebhookVerificationCodeTtlMs).toISOString()
      });
      request.log.info(
        { requestId: request.id, verificationCode },
        "accepted Clover webhook verification request; use verificationCode to complete Clover webhook setup"
      );
      return {
        accepted: true,
        verificationCode
      };
    }

    if (!authorizeWebhookRequest(request, reply, cloverWebhookSharedSecret)) {
      return;
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
    const webhookEventKey = buildWebhookEventKey({
      resolved,
      kind: resolved.kind,
      orderId,
      paymentId,
      status: resolved.statusHint ?? chargeLookup.charge.status
    });
    const cachedWebhookResult = await repository.findWebhookResult(webhookEventKey);
    if (cachedWebhookResult) {
      return cachedWebhookResult;
    }

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
          { requestId: request.id, orderId, paymentId, webhookEventId: resolved.eventId, dispatchResult },
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

      const response: PaymentWebhookDispatchResult = {
        accepted: true,
        kind: "CHARGE",
        orderId,
        paymentId,
        status: reconciledCharge.status,
        orderApplied: dispatchResult.response.applied
      };
      await repository.saveWebhookResult(webhookEventKey, response);
      logPaymentsMutation(request, "charge webhook reconciled", {
        orderId,
        paymentId,
        webhookEventId: resolved.eventId,
        status: response.status,
        orderApplied: response.orderApplied
      });
      return response;
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
        { requestId: request.id, orderId, paymentId, webhookEventId: resolved.eventId, dispatchResult },
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

    const response: PaymentWebhookDispatchResult = {
      accepted: true,
      kind: "REFUND",
      orderId,
      paymentId,
      status: refundStatus,
      orderApplied: dispatchResult.response.applied
    };
    await repository.saveWebhookResult(webhookEventKey, response);
    logPaymentsMutation(request, "refund webhook reconciled", {
      orderId,
      paymentId,
      webhookEventId: resolved.eventId,
      status: response.status,
      orderApplied: response.orderApplied
    });
    return response;
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
