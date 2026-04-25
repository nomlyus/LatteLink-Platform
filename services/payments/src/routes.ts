import type { FastifyBaseLogger, FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import Stripe from "stripe";
import { z } from "zod";
import { createHash, createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import {
  allowsInMemoryPersistence,
  buildPersistenceStartupError,
  createPostgresDb,
  getDatabaseUrl,
  runMigrations
} from "@lattelink/persistence";
import {
  clientPaymentProfileSchema,
  internalLocationPaymentProfileUpdateSchema,
  internalLocationSummarySchema,
  paymentReadinessSchema,
  stripeConnectDashboardLinkRequestSchema,
  stripeConnectLinkResponseSchema,
  stripeConnectOnboardingLinkRequestSchema
} from "@lattelink/contracts-catalog";
import {
  applePayWalletSchema,
  orderPaymentContextSchema,
  orderSchema,
  ordersPaymentReconciliationResultSchema,
  ordersPaymentReconciliationSchema,
  stripeMobilePaymentFinalizeRequestSchema,
  stripeMobilePaymentFinalizeResponseSchema,
  stripeMobilePaymentSessionRequestSchema,
  stripeMobilePaymentSessionResponseSchema
} from "@lattelink/contracts-orders";
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
    recoveryEndpoint: "https://apisandbox.dev.clover.com/oauth/v2/recovery",
    pakmsEndpoint: "https://scl-sandbox.dev.clover.com/pakms/apikey",
    chargeEndpoint: "https://scl-sandbox.dev.clover.com/v1/charges",
    refundEndpoint: "https://scl-sandbox.dev.clover.com/v1/refunds",
    applePayTokenizeEndpoint: "https://token-sandbox.dev.clover.com/v1/tokens"
  },
  production: {
    authorizeEndpoint: "https://www.clover.com/oauth/v2/authorize",
    tokenEndpoint: "https://api.clover.com/oauth/v2/token",
    refreshEndpoint: "https://api.clover.com/oauth/v2/refresh",
    recoveryEndpoint: "https://api.clover.com/oauth/v2/recovery",
    pakmsEndpoint: "https://scl.clover.com/pakms/apikey",
    chargeEndpoint: "https://scl.clover.com/v1/charges",
    refundEndpoint: "https://scl.clover.com/v1/refunds",
    applePayTokenizeEndpoint: "https://token.clover.com/v1/tokens"
  }
} as const;

const chargeRequestSchema = z.object({
  orderId: z.string().uuid(),
  order: orderSchema.optional(),
  amountCents: z.number().int().positive(),
  currency: z.literal("USD"),
  paymentSourceToken: z.string().min(1).optional(),
  applePayToken: z.string().min(1).optional(),
  applePayWallet: applePayWalletSchema.optional(),
  idempotencyKey: z.string().min(1),
  locationId: z.string().min(1).optional()
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
  paymentId: z.string().min(1),
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
  paymentId: z.string().min(1),
  amountCents: z.number().int().positive(),
  currency: z.literal("USD"),
  reason: z.string().min(1),
  idempotencyKey: z.string().min(1),
  locationId: z.string().min(1).optional()
});

const refundStatusSchema = z.enum(["REFUNDED", "REJECTED"]);

const refundResponseSchema = z.object({
  refundId: z.string().uuid(),
  provider: z.enum(["CLOVER", "STRIPE"]),
  orderId: z.string().uuid(),
  paymentId: z.string().min(1),
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

const gatewayHeadersSchema = z.object({
  "x-gateway-token": z.string().optional()
});

const locationIdQuerySchema = z.object({
  locationId: z.string().min(1).optional()
});

const userHeadersSchema = z.object({
  "x-user-id": z.string().uuid().optional()
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

const stripeWebhookAcceptedResponseSchema = z.object({
  accepted: z.literal(true),
  provider: z.literal("STRIPE"),
  eventId: z.string().min(1),
  eventType: z.string().min(1),
  duplicate: z.boolean(),
  livemode: z.boolean(),
  account: z.string().min(1).optional()
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
  provider: "CLOVER" | "STRIPE";
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

type PersistedStripeWebhookEventRow = {
  event_id: string;
  event_type: string;
  stripe_account: string | null;
  livemode: boolean;
  payload_json: unknown;
  created_at: string;
  updated_at: string;
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
  location_id: string | null;
};

export type CloverConnection = {
  merchantId: string;
  locationId?: string;
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
  findLatestCloverConnection(locationId: string): Promise<CloverConnection | undefined>;
  saveCloverConnection(connection: CloverConnection): Promise<CloverConnection>;
  findWebhookResult(eventKey: string): Promise<PaymentWebhookDispatchResult | undefined>;
  saveWebhookResult(eventKey: string, result: PaymentWebhookDispatchResult): Promise<void>;
  findStripeWebhookEvent(eventId: string): Promise<PersistedStripeWebhookEventRow | undefined>;
  saveStripeWebhookEvent(input: {
    eventId: string;
    eventType: string;
    stripeAccount?: string;
    livemode: boolean;
    payload: unknown;
  }): Promise<PersistedStripeWebhookEventRow>;
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
    locationId: row.location_id ?? undefined,
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
  const stripeWebhookEventsById = new Map<string, PersistedStripeWebhookEventRow>();
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
    async findLatestCloverConnection(locationId) {
      const byLocation = Array.from(cloverConnectionsByMerchantId.values()).find(
        (c) => c.locationId === locationId
      );
      if (byLocation) return byLocation;
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
    async findStripeWebhookEvent(eventId) {
      return stripeWebhookEventsById.get(eventId);
    },
    async saveStripeWebhookEvent(input) {
      const existing = stripeWebhookEventsById.get(input.eventId);
      if (existing) {
        return existing;
      }

      const now = new Date().toISOString();
      const next: PersistedStripeWebhookEventRow = {
        event_id: input.eventId,
        event_type: input.eventType,
        stripe_account: input.stripeAccount ?? null,
        livemode: input.livemode,
        payload_json: input.payload,
        created_at: now,
        updated_at: now
      };
      stripeWebhookEventsById.set(input.eventId, next);
      return next;
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
        .onConflict((oc) =>
          oc.columns(["order_id", "idempotency_key"])
            .doUpdateSet({
              refund_id: (eb) => eb.ref("excluded.refund_id"),
              payment_id: (eb) => eb.ref("excluded.payment_id"),
              provider: (eb) => eb.ref("excluded.provider"),
              status: (eb) => eb.ref("excluded.status"),
              amount_cents: (eb) => eb.ref("excluded.amount_cents"),
              currency: (eb) => eb.ref("excluded.currency"),
              occurred_at: (eb) => eb.ref("excluded.occurred_at"),
              message: (eb) => eb.ref("excluded.message")
            })
            .where("payments_refunds.status", "=", "REJECTED")
        )
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
    async findLatestCloverConnection(locationId) {
      const byLocation = await db
        .selectFrom("payments_clover_connections")
        .selectAll()
        .where("location_id", "=", locationId)
        .orderBy("updated_at", "desc")
        .executeTakeFirst();
      if (byLocation) return toCloverConnection(byLocation as PersistedCloverConnectionRow);

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
          location_id: connection.locationId ?? null,
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
            location_id: connection.locationId ?? null,
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
    async findStripeWebhookEvent(eventId) {
      const row = await db
        .selectFrom("payments_stripe_webhook_events")
        .selectAll()
        .where("event_id", "=", eventId)
        .executeTakeFirst();
      return row as PersistedStripeWebhookEventRow | undefined;
    },
    async saveStripeWebhookEvent(input) {
      await db
        .insertInto("payments_stripe_webhook_events")
        .values({
          event_id: input.eventId,
          event_type: input.eventType,
          stripe_account: input.stripeAccount ?? null,
          livemode: input.livemode,
          payload_json: input.payload
        })
        .onConflict((oc) =>
          oc.column("event_id").doUpdateSet({
            event_type: input.eventType,
            stripe_account: input.stripeAccount ?? null,
            livemode: input.livemode,
            payload_json: input.payload,
            updated_at: new Date().toISOString()
          })
        )
        .execute();

      return (await db
        .selectFrom("payments_stripe_webhook_events")
        .selectAll()
        .where("event_id", "=", input.eventId)
        .executeTakeFirstOrThrow()) as PersistedStripeWebhookEventRow;
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

function authorizeGatewayRequest(
  request: FastifyRequest,
  reply: FastifyReply,
  gatewayToken: string | undefined
) {
  if (!gatewayToken) {
    sendError(reply, {
      statusCode: 503,
      code: "GATEWAY_ACCESS_NOT_CONFIGURED",
      message: "GATEWAY_INTERNAL_API_TOKEN must be configured before accepting gateway payment reads",
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
    message: "Gateway payments token is invalid",
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

function requireStripeWebhookSecret(
  request: FastifyRequest,
  reply: FastifyReply,
  webhookSecret: string | undefined
): webhookSecret is string {
  if (webhookSecret) {
    return true;
  }

  sendError(reply, {
    statusCode: 503,
    code: "STRIPE_WEBHOOK_NOT_CONFIGURED",
    message: "STRIPE_CONNECT_WEBHOOK_SECRET must be configured before accepting Stripe webhooks",
    requestId: request.id
  });
  return false;
}

function requireStripeSecretKey(
  request: FastifyRequest,
  reply: FastifyReply,
  stripeSecretKey: string | undefined
) {
  if (stripeSecretKey) {
    return true;
  }

  sendError(reply, {
    statusCode: 503,
    code: "STRIPE_SECRET_KEY_NOT_CONFIGURED",
    message: "STRIPE_SECRET_KEY must be configured before creating Stripe payment sessions",
    requestId: request.id
  });
  return false;
}

function requireStripePublishableKey(
  request: FastifyRequest,
  reply: FastifyReply,
  stripePublishableKey: string | undefined
) {
  if (stripePublishableKey) {
    return true;
  }

  sendError(reply, {
    statusCode: 503,
    code: "STRIPE_PUBLISHABLE_KEY_NOT_CONFIGURED",
    message: "STRIPE_PUBLISHABLE_KEY must be configured before creating Stripe payment sessions",
    requestId: request.id
  });
  return false;
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
  recoveryEndpoint: string;
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
    recoveryEndpoint: endpoints.recoveryEndpoint,
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
): { issuedAtMs: number; merchantId?: string; locationId?: string } | undefined {
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
        merchantId: z.string().min(1).optional(),
        locationId: z.string().min(1).optional()
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
  locationId?: string;
}) {
  const { oauthConfig, merchantId, locationId } = params;
  if (!oauthConfig.configured || !oauthConfig.appId || !oauthConfig.redirectUri || !oauthConfig.stateSigningSecret) {
    throw new Error(oauthConfig.misconfigurationReason ?? "Clover OAuth is not configured");
  }

  const state = encodeSignedState(
    {
      issuedAtMs: Date.now(),
      merchantId,
      locationId
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
  const parsed =
    upstream.ok
      ? cloverOauthTokenResponseSchema.parse(parsedBody)
      : await recoverCloverTokenPair({
          oauthConfig,
          connection,
          refreshResponse: upstream,
          refreshResponseBody: parsedBody
        });
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

async function recoverCloverTokenPair(params: {
  oauthConfig: CloverOAuthConfig;
  connection: CloverConnection;
  refreshResponse: Response;
  refreshResponseBody: unknown;
}) {
  if (
    params.refreshResponse.status !== 401 ||
    params.refreshResponse.headers.get("x-clover-recovery-available") !== "true" ||
    !params.oauthConfig.appSecret
  ) {
    throw new Error(
      firstStringAtPaths(params.refreshResponseBody, [["message"], ["error_description"], ["error"]]) ??
        `Clover OAuth refresh failed with status ${params.refreshResponse.status}`
    );
  }

  const recoveryController = new AbortController()
  const recoveryTimeout = setTimeout(() => recoveryController.abort(), 10_000)
  let recoveryResponse: Response
  try {
    recoveryResponse = await fetch(params.oauthConfig.recoveryEndpoint, {
      method: "POST",
      headers: {
        accept: "application/json",
        "content-type": "application/json"
      },
      body: JSON.stringify({
        client_id: params.oauthConfig.appId,
        client_secret: params.oauthConfig.appSecret,
        recovery_token: params.connection.refreshToken
      }),
      signal: recoveryController.signal,
    })
  } finally {
    clearTimeout(recoveryTimeout)
  }
  const recoveryBody = parseJsonSafely(await recoveryResponse.text());
  if (!recoveryResponse.ok) {
    throw new Error(
      firstStringAtPaths(recoveryBody, [["message"], ["error_description"], ["error"]]) ??
        `Clover OAuth recovery failed with status ${recoveryResponse.status}`
    );
  }

  return cloverOauthTokenResponseSchema.parse(recoveryBody);
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
  locationId?: string;
  allowRefresh?: boolean;
}): Promise<CloverRuntimeCredentials | CloverCredentialsUnavailableError | undefined> {
  const { logger, repository, providerConfig, oauthConfig, locationId, allowRefresh = true } = params;
  if (providerConfig.mode !== "live") {
    return undefined;
  }

  const connectedMerchant = locationId
    ? await repository.findLatestCloverConnection(locationId)
    : await repository.findLatestCloverConnection("");

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

async function fetchOrderPaymentContext(params: {
  ordersBaseUrl: string;
  internalToken?: string;
  requestId: string;
  orderId: string;
  userId?: string;
}): Promise<
  | { ok: true; response: z.output<typeof orderPaymentContextSchema> }
  | { ok: false; status?: number; body?: unknown }
> {
  const headers: Record<string, string> = {
    "x-request-id": params.requestId
  };
  if (params.internalToken) {
    headers["x-internal-token"] = params.internalToken;
  }
  if (params.userId) {
    headers["x-user-id"] = params.userId;
  }

  let upstream: Response;
  try {
    upstream = await fetch(`${params.ordersBaseUrl}/v1/orders/internal/${params.orderId}/payment-context`, {
      method: "GET",
      headers
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

  const parsed = orderPaymentContextSchema.safeParse(body);
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

async function fetchInternalLocationSummary(params: {
  catalogBaseUrl: string;
  gatewayToken?: string;
  requestId: string;
  locationId: string;
}): Promise<
  | { ok: true; response: z.output<typeof internalLocationSummarySchema> }
  | { ok: false; status?: number; body?: unknown }
> {
  const headers: Record<string, string> = {
    "x-request-id": params.requestId
  };
  if (params.gatewayToken) {
    headers["x-gateway-token"] = params.gatewayToken;
  }

  let upstream: Response;
  try {
    upstream = await fetch(`${params.catalogBaseUrl}/v1/catalog/internal/locations/${params.locationId}`, {
      method: "GET",
      headers
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

  const parsed = internalLocationSummarySchema.safeParse(body);
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

async function updateInternalLocationPaymentProfile(params: {
  catalogBaseUrl: string;
  gatewayToken?: string;
  requestId: string;
  locationId: string;
  paymentProfile: z.input<typeof internalLocationPaymentProfileUpdateSchema>;
}): Promise<
  | { ok: true; response: z.output<typeof clientPaymentProfileSchema> }
  | { ok: false; status?: number; body?: unknown }
> {
  const headers: Record<string, string> = {
    "content-type": "application/json",
    "x-request-id": params.requestId
  };
  if (params.gatewayToken) {
    headers["x-gateway-token"] = params.gatewayToken;
  }

  let upstream: Response;
  try {
    upstream = await fetch(`${params.catalogBaseUrl}/v1/catalog/internal/locations/${params.locationId}/payment-profile`, {
      method: "PUT",
      headers,
      body: JSON.stringify(params.paymentProfile)
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

  const parsed = clientPaymentProfileSchema.safeParse(body);
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
    provider: "STRIPE",
    orderId: input.orderId,
    paymentId: input.paymentId,
    status: shouldReject ? "REJECTED" : "REFUNDED",
    amountCents: input.amountCents,
    currency: input.currency,
    occurredAt: new Date().toISOString(),
    message: shouldReject ? "Stripe rejected the refund" : "Stripe accepted the refund"
  });
}

function verifyStripeWebhookEvent(params: {
  stripeClient: Stripe;
  rawBody: string | undefined;
  signature: string | undefined;
  endpointSecret: string;
}) {
  if (!params.rawBody) {
    throw new Error("Stripe webhook raw body was unavailable for signature verification");
  }
  if (!params.signature) {
    throw new Error("Missing Stripe-Signature header");
  }

  return params.stripeClient.webhooks.constructEvent(
    params.rawBody,
    params.signature,
    params.endpointSecret
  );
}

function toStripeWebhookOccurredAt(createdUnixSeconds: number) {
  return new Date(createdUnixSeconds * 1000).toISOString();
}

function normalizeStripeCurrency(currency: string | null | undefined): "USD" | undefined {
  return currency?.toUpperCase() === "USD" ? "USD" : undefined;
}

function resolveStripeMetadataOrderId(metadata: Stripe.Metadata | null | undefined) {
  const orderId = metadata?.orderId;
  if (!orderId) {
    return undefined;
  }

  const parsedOrderId = z.string().uuid().safeParse(orderId);
  return parsedOrderId.success ? parsedOrderId.data : undefined;
}

function resolveStripeChargePaymentId(charge: Stripe.Charge) {
  if (typeof charge.payment_intent === "string" && charge.payment_intent.length > 0) {
    return charge.payment_intent;
  }

  if (charge.payment_intent && typeof charge.payment_intent === "object" && charge.payment_intent.id) {
    return charge.payment_intent.id;
  }

  return undefined;
}

function resolveStripeRefundId(charge: Stripe.Charge) {
  const refunds = charge.refunds?.data ?? [];
  const latestRefund = refunds[refunds.length - 1];
  return latestRefund?.id;
}

function resolveStripeOrderReconciliation(event: Stripe.Event): OrderPaymentReconciliation | undefined {
  if (event.type === "payment_intent.succeeded") {
    const intent = event.data.object as Stripe.PaymentIntent;
    const orderId = resolveStripeMetadataOrderId(intent.metadata);
    if (!orderId) {
      return undefined;
    }

    return buildStripePaymentIntentSucceededReconciliation({
      eventId: event.id,
      orderId,
      paymentIntent: intent,
      occurredAt: toStripeWebhookOccurredAt(event.created),
      message: "Stripe payment succeeded"
    });
  }

  if (event.type === "payment_intent.payment_failed") {
    const intent = event.data.object as Stripe.PaymentIntent;
    const orderId = resolveStripeMetadataOrderId(intent.metadata);
    if (!orderId) {
      return undefined;
    }

    const declineCode =
      intent.last_payment_error?.decline_code ??
      (typeof intent.last_payment_error?.code === "string" ? intent.last_payment_error.code : undefined);

    return ordersPaymentReconciliationSchema.parse({
      eventId: event.id,
      provider: "STRIPE",
      kind: "CHARGE",
      orderId,
      paymentId: intent.id,
      status: "DECLINED",
      occurredAt: toStripeWebhookOccurredAt(event.created),
      message: intent.last_payment_error?.message ?? "Stripe payment failed",
      declineCode,
      amountCents: intent.amount,
      currency: normalizeStripeCurrency(intent.currency)
    });
  }

  if (event.type === "charge.refunded") {
    const charge = event.data.object as Stripe.Charge;
    const orderId = resolveStripeMetadataOrderId(charge.metadata);
    const paymentId = resolveStripeChargePaymentId(charge);
    if (!orderId || !paymentId) {
      return undefined;
    }

    return ordersPaymentReconciliationSchema.parse({
      eventId: event.id,
      provider: "STRIPE",
      kind: "REFUND",
      orderId,
      paymentId,
      refundId: resolveStripeRefundId(charge),
      status: "REFUNDED",
      occurredAt: toStripeWebhookOccurredAt(event.created),
      message: "Stripe refund succeeded",
      amountCents: charge.amount_refunded > 0 ? charge.amount_refunded : charge.amount,
      currency: normalizeStripeCurrency(charge.currency)
    });
  }

  return undefined;
}

function buildStripePaymentIntentSucceededReconciliation(params: {
  orderId: string;
  paymentIntent: Stripe.PaymentIntent;
  occurredAt?: string;
  eventId?: string;
  message?: string;
}): OrderPaymentReconciliation {
  const { orderId, paymentIntent, occurredAt, eventId, message } = params;
  return ordersPaymentReconciliationSchema.parse({
    eventId,
    provider: "STRIPE",
    kind: "CHARGE",
    orderId,
    paymentId: paymentIntent.id,
    status: "SUCCEEDED",
    occurredAt: occurredAt ?? new Date().toISOString(),
    message: message ?? "Stripe payment succeeded",
    amountCents: paymentIntent.amount_received > 0 ? paymentIntent.amount_received : paymentIntent.amount,
    currency: normalizeStripeCurrency(paymentIntent.currency)
  });
}

function resolveStripeMerchantDisplayName(locationSummary: z.output<typeof internalLocationSummarySchema>) {
  return (
    trimToUndefined(locationSummary.storeName) ??
    trimToUndefined(locationSummary.locationName) ??
    trimToUndefined(locationSummary.brandName) ??
    "Gazelle"
  );
}

function normalizeStripeAccountCurrency(currency: string | null | undefined): "USD" | undefined {
  return currency?.toUpperCase() === "USD" ? "USD" : undefined;
}

function isDeletedStripeAccount(
  account: Stripe.Account | Stripe.DeletedAccount
): account is Stripe.DeletedAccount {
  return "deleted" in account && account.deleted === true;
}

function resolveStripeOnboardingStatus(account: Stripe.Account) {
  if (account.charges_enabled && account.payouts_enabled) {
    return "completed" as const;
  }

  const requirements = account.requirements;
  const hasRestrictions = Boolean(requirements?.disabled_reason) || Boolean(requirements?.currently_due?.length) || Boolean(requirements?.past_due?.length);
  if (hasRestrictions && account.details_submitted) {
    return "restricted" as const;
  }

  if (
    account.details_submitted ||
    Boolean(requirements?.eventually_due?.length) ||
    Boolean(requirements?.pending_verification?.length)
  ) {
    return "pending" as const;
  }

  return "pending" as const;
}

function resolveStripeDashboardEnabled(account: Stripe.Account) {
  return account.type === "express";
}

function buildPaymentReadiness(profile: z.output<typeof clientPaymentProfileSchema>) {
  const missingRequiredFields: string[] = [];
  if (!profile.stripeAccountId) {
    missingRequiredFields.push("stripeAccountId");
  }
  if (!profile.stripeChargesEnabled) {
    missingRequiredFields.push("stripeChargesEnabled");
  }
  if (!profile.stripePayoutsEnabled) {
    missingRequiredFields.push("stripePayoutsEnabled");
  }

  return paymentReadinessSchema.parse({
    ready: missingRequiredFields.length === 0 && profile.stripeOnboardingStatus === "completed",
    onboardingState: profile.stripeOnboardingStatus,
    missingRequiredFields
  });
}

function buildStripePaymentProfile(params: {
  locationSummary: z.output<typeof internalLocationSummarySchema>;
  stripeAccount: Stripe.Account;
}) {
  const { locationSummary, stripeAccount } = params;
  const existingProfile = locationSummary.paymentProfile;

  return internalLocationPaymentProfileUpdateSchema.parse({
    locationId: locationSummary.locationId,
    stripeAccountId: stripeAccount.id,
    stripeAccountType: "express",
    stripeOnboardingStatus: resolveStripeOnboardingStatus(stripeAccount),
    stripeDetailsSubmitted: Boolean(stripeAccount.details_submitted),
    stripeChargesEnabled: Boolean(stripeAccount.charges_enabled),
    stripePayoutsEnabled: Boolean(stripeAccount.payouts_enabled),
    stripeDashboardEnabled: resolveStripeDashboardEnabled(stripeAccount),
    country: "US",
    currency: normalizeStripeAccountCurrency(stripeAccount.default_currency) ?? existingProfile?.currency ?? "USD",
    cardEnabled: existingProfile?.cardEnabled ?? true,
    applePayEnabled: existingProfile?.applePayEnabled ?? true,
    refundsEnabled: existingProfile?.refundsEnabled ?? true,
    cloverPosEnabled: existingProfile?.cloverPosEnabled ?? false
  });
}

async function executeLiveCharge(params: {
  config: CloverProviderConfig;
  request: ChargeRequest;
  requestId: string;
  logger: FastifyBaseLogger;
  repository: PaymentsRepository;
  oauthConfig: CloverOAuthConfig;
  locationId?: string;
}): Promise<{ response: ChargeResponse; providerPaymentId?: string }> {
  const adapter = await getAdapter({
    logger: params.logger,
    repository: params.repository,
    providerConfig: params.config,
    oauthConfig: params.oauthConfig,
    locationId: params.locationId,
    requestId: params.requestId
  });
  return adapter.processCharge(params.request);
}

export async function registerRoutes(app: FastifyInstance) {
  const repository = await createPaymentsRepository(app.log);
  const cloverProvider = resolveCloverProviderConfig(app.log);
  const cloverOAuthConfig = resolveCloverOAuthConfig();
  const catalogBaseUrl = process.env.CATALOG_SERVICE_BASE_URL ?? "http://127.0.0.1:3002";
  const ordersBaseUrl = process.env.ORDERS_SERVICE_BASE_URL ?? "http://127.0.0.1:3001";
  const ordersInternalToken = trimToUndefined(process.env.ORDERS_INTERNAL_API_TOKEN);
  const gatewayInternalToken = trimToUndefined(process.env.GATEWAY_INTERNAL_API_TOKEN);
  const cloverWebhookSharedSecret = trimToUndefined(process.env.CLOVER_WEBHOOK_SHARED_SECRET);
  const stripeSecretKey = trimToUndefined(process.env.STRIPE_SECRET_KEY);
  const stripePublishableKey = trimToUndefined(process.env.STRIPE_PUBLISHABLE_KEY);
  const stripeConnectWebhookSecret = trimToUndefined(process.env.STRIPE_CONNECT_WEBHOOK_SECRET);
  const stripeClient = new Stripe(stripeSecretKey ?? "sk_test_placeholder");
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

  const buildCloverOauthStatus = async (locationId?: string) => {
    const latestConnection = await repository.findLatestCloverConnection(locationId ?? "");
    const runtimeCredentials = await resolveRuntimeCloverCredentials({
      logger: app.log,
      repository,
      providerConfig: cloverProvider,
      oauthConfig: cloverOAuthConfig,
      locationId,
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

  const buildCloverCardEntryConfig = async (locationId?: string) => {
    const runtimeCredentials =
      cloverProvider.mode === "live"
        ? await resolveRuntimeCloverCredentials({
            logger: app.log,
            repository,
            providerConfig: cloverProvider,
            oauthConfig: cloverOAuthConfig,
            locationId,
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

  app.get("/v1/payments/clover/oauth/status", async (request) => {
    const { locationId } = locationIdQuerySchema.parse(request.query);
    return buildCloverOauthStatus(locationId);
  });

  app.get("/v1/payments/clover/card-entry-config", async (request) => {
    const { locationId } = locationIdQuerySchema.parse(request.query);
    return buildCloverCardEntryConfig(locationId);
  });
  app.post("/v1/payments/stripe/mobile-session", { preHandler: app.rateLimit(paymentsWriteRateLimit) }, async (request, reply) => {
    if (!authorizeGatewayRequest(request, reply, gatewayInternalToken)) {
      return;
    }
    if (!requireStripeSecretKey(request, reply, stripeSecretKey)) {
      return;
    }
    if (!requireStripePublishableKey(request, reply, stripePublishableKey)) {
      return;
    }

    const input = stripeMobilePaymentSessionRequestSchema.parse(request.body);
    const parsedUserHeaders = userHeadersSchema.safeParse(request.headers);
    const userId = parsedUserHeaders.success ? parsedUserHeaders.data["x-user-id"] : undefined;
    const orderPaymentContextResult = await fetchOrderPaymentContext({
      ordersBaseUrl,
      internalToken: ordersInternalToken,
      requestId: request.id,
      orderId: input.orderId,
      userId
    });

    if (!orderPaymentContextResult.ok) {
      const upstreamError = serviceErrorSchema.safeParse(orderPaymentContextResult.body);
      return reply.status(orderPaymentContextResult.status ?? 502).send(
        upstreamError.success
          ? upstreamError.data
          : serviceErrorSchema.parse({
              code: "ORDERS_PAYMENT_CONTEXT_UNAVAILABLE",
              message: "Unable to load order payment context",
              requestId: request.id
            })
      );
    }

    const orderPaymentContext = orderPaymentContextResult.response;
    if (orderPaymentContext.status !== "PENDING_PAYMENT") {
      return reply.status(409).send(
        serviceErrorSchema.parse({
          code: "ORDER_NOT_PENDING_PAYMENT",
          message: `Order cannot create a Stripe payment session from status ${orderPaymentContext.status}`,
          requestId: request.id,
          details: {
            orderId: orderPaymentContext.orderId,
            status: orderPaymentContext.status
          }
        })
      );
    }

    const locationSummaryResult = await fetchInternalLocationSummary({
      catalogBaseUrl,
      gatewayToken: gatewayInternalToken,
      requestId: request.id,
      locationId: orderPaymentContext.locationId
    });

    if (!locationSummaryResult.ok) {
      const upstreamError = serviceErrorSchema.safeParse(locationSummaryResult.body);
      return reply.status(locationSummaryResult.status ?? 502).send(
        upstreamError.success
          ? upstreamError.data
          : serviceErrorSchema.parse({
              code: "CATALOG_LOCATION_UNAVAILABLE",
              message: "Unable to load location payment profile",
              requestId: request.id
            })
      );
    }

    const locationSummary = locationSummaryResult.response;
    const paymentProfile = locationSummary.paymentProfile;
    const paymentReadiness = locationSummary.paymentReadiness;
    if (
      !paymentProfile ||
      !paymentProfile.stripeAccountId ||
      !paymentReadiness?.ready ||
      !paymentProfile.stripeChargesEnabled ||
      !paymentProfile.cardEnabled
    ) {
      return reply.status(409).send(
        serviceErrorSchema.parse({
          code: "STRIPE_ACCOUNT_NOT_READY",
          message: "Location is not ready for Stripe mobile checkout",
          requestId: request.id,
          details: {
            locationId: locationSummary.locationId,
            onboardingState: paymentReadiness?.onboardingState ?? paymentProfile?.stripeOnboardingStatus ?? "unconfigured",
            missingRequiredFields: paymentReadiness?.missingRequiredFields ?? []
          }
        })
      );
    }

    try {
      const paymentIntent = await stripeClient.paymentIntents.create(
        {
          amount: orderPaymentContext.total.amountCents,
          currency: orderPaymentContext.total.currency.toLowerCase(),
          automatic_payment_methods: {
            enabled: true
          },
          metadata: {
            orderId: orderPaymentContext.orderId,
            locationId: orderPaymentContext.locationId,
            ...(userId ? { userId } : {})
          },
          description: `${resolveStripeMerchantDisplayName(locationSummary)} mobile order ${orderPaymentContext.orderId}`
        },
        {
          stripeAccount: paymentProfile.stripeAccountId,
          idempotencyKey: `stripe-mobile-session:${orderPaymentContext.orderId}`
        }
      );

      if (!paymentIntent.client_secret) {
        request.log.error(
          {
            requestId: request.id,
            orderId: orderPaymentContext.orderId,
            paymentIntentId: paymentIntent.id,
            stripeAccountId: paymentProfile.stripeAccountId
          },
          "Stripe PaymentIntent was missing client_secret"
        );
        return reply.status(502).send(
          serviceErrorSchema.parse({
            code: "STRIPE_PAYMENT_INTENT_INVALID",
            message: "Stripe payment session was missing a client secret",
            requestId: request.id
          })
        );
      }

      return stripeMobilePaymentSessionResponseSchema.parse({
        orderId: orderPaymentContext.orderId,
        paymentIntentId: paymentIntent.id,
        paymentIntentClientSecret: paymentIntent.client_secret,
        publishableKey: stripePublishableKey,
        stripeAccountId: paymentProfile.stripeAccountId,
        merchantDisplayName: resolveStripeMerchantDisplayName(locationSummary),
        merchantCountryCode: "US",
        amountCents: orderPaymentContext.total.amountCents,
        currency: orderPaymentContext.total.currency,
        applePayEnabled: paymentProfile.applePayEnabled,
        cardEnabled: paymentProfile.cardEnabled
      });
    } catch (error) {
      request.log.error(
        {
          error,
          requestId: request.id,
          orderId: orderPaymentContext.orderId,
          locationId: orderPaymentContext.locationId,
          stripeAccountId: paymentProfile.stripeAccountId
        },
        "Stripe mobile payment session creation failed"
      );
      return reply.status(502).send(
        serviceErrorSchema.parse({
          code: "STRIPE_PAYMENT_SESSION_ERROR",
          message: error instanceof Error ? error.message : "Stripe payment session creation failed",
          requestId: request.id
        })
      );
    }
  });

  app.post("/v1/payments/stripe/mobile-session/finalize", { preHandler: app.rateLimit(paymentsWriteRateLimit) }, async (request, reply) => {
    if (!authorizeGatewayRequest(request, reply, gatewayInternalToken)) {
      return;
    }
    if (!requireStripeSecretKey(request, reply, stripeSecretKey)) {
      return;
    }

    const input = stripeMobilePaymentFinalizeRequestSchema.parse(request.body);
    const parsedUserHeaders = userHeadersSchema.safeParse(request.headers);
    const userId = parsedUserHeaders.success ? parsedUserHeaders.data["x-user-id"] : undefined;
    const orderPaymentContextResult = await fetchOrderPaymentContext({
      ordersBaseUrl,
      internalToken: ordersInternalToken,
      requestId: request.id,
      orderId: input.orderId,
      userId
    });

    if (!orderPaymentContextResult.ok) {
      const upstreamError = serviceErrorSchema.safeParse(orderPaymentContextResult.body);
      return reply.status(orderPaymentContextResult.status ?? 502).send(
        upstreamError.success
          ? upstreamError.data
          : serviceErrorSchema.parse({
              code: "ORDERS_PAYMENT_CONTEXT_UNAVAILABLE",
              message: "Unable to load order payment context",
              requestId: request.id
            })
      );
    }

    const orderPaymentContext = orderPaymentContextResult.response;
    if (orderPaymentContext.status !== "PENDING_PAYMENT") {
      return stripeMobilePaymentFinalizeResponseSchema.parse({
        orderId: input.orderId,
        paymentIntentId: input.paymentIntentId,
        accepted: true,
        applied: false,
        orderStatus: orderPaymentContext.status,
        note: "Order is already settled for payment finalization"
      });
    }

    const locationSummaryResult = await fetchInternalLocationSummary({
      catalogBaseUrl,
      gatewayToken: gatewayInternalToken,
      requestId: request.id,
      locationId: orderPaymentContext.locationId
    });

    if (!locationSummaryResult.ok) {
      const upstreamError = serviceErrorSchema.safeParse(locationSummaryResult.body);
      return reply.status(locationSummaryResult.status ?? 502).send(
        upstreamError.success
          ? upstreamError.data
          : serviceErrorSchema.parse({
              code: "CATALOG_LOCATION_UNAVAILABLE",
              message: "Unable to load location payment profile",
              requestId: request.id
            })
      );
    }

    const paymentProfile = locationSummaryResult.response.paymentProfile;
    if (!paymentProfile?.stripeAccountId) {
      return reply.status(409).send(
        serviceErrorSchema.parse({
          code: "STRIPE_ACCOUNT_NOT_CONFIGURED",
          message: "Location does not have a Stripe account configured",
          requestId: request.id,
          details: {
            locationId: orderPaymentContext.locationId
          }
        })
      );
    }

    let paymentIntent: Stripe.PaymentIntent;
    try {
      paymentIntent = await stripeClient.paymentIntents.retrieve(
        input.paymentIntentId,
        {},
        {
          stripeAccount: paymentProfile.stripeAccountId
        }
      );
    } catch (error) {
      request.log.error(
        {
          error,
          requestId: request.id,
          orderId: input.orderId,
          paymentIntentId: input.paymentIntentId,
          stripeAccountId: paymentProfile.stripeAccountId
        },
        "Stripe mobile payment finalization lookup failed"
      );
      return reply.status(502).send(
        serviceErrorSchema.parse({
          code: "STRIPE_PAYMENT_INTENT_LOOKUP_FAILED",
          message: error instanceof Error ? error.message : "Unable to verify Stripe payment",
          requestId: request.id
        })
      );
    }

    const metadataOrderId = resolveStripeMetadataOrderId(paymentIntent.metadata);
    if (metadataOrderId !== input.orderId) {
      return reply.status(409).send(
        serviceErrorSchema.parse({
          code: "STRIPE_PAYMENT_INTENT_ORDER_MISMATCH",
          message: "Stripe payment does not match this order",
          requestId: request.id,
          details: {
            orderId: input.orderId,
            paymentIntentId: paymentIntent.id
          }
        })
      );
    }

    const normalizedCurrency = normalizeStripeCurrency(paymentIntent.currency);
    const verifiedAmountCents = paymentIntent.amount_received > 0 ? paymentIntent.amount_received : paymentIntent.amount;
    if (normalizedCurrency !== orderPaymentContext.total.currency || verifiedAmountCents !== orderPaymentContext.total.amountCents) {
      return reply.status(409).send(
        serviceErrorSchema.parse({
          code: "STRIPE_PAYMENT_INTENT_AMOUNT_MISMATCH",
          message: "Stripe payment amount does not match this order",
          requestId: request.id,
          details: {
            orderId: input.orderId,
            paymentIntentId: paymentIntent.id,
            expectedAmountCents: orderPaymentContext.total.amountCents,
            actualAmountCents: verifiedAmountCents,
            expectedCurrency: orderPaymentContext.total.currency,
            actualCurrency: normalizedCurrency
          }
        })
      );
    }

    if (paymentIntent.status !== "succeeded") {
      return reply.status(409).send(
        serviceErrorSchema.parse({
          code: "STRIPE_PAYMENT_NOT_SUCCEEDED",
          message: "Stripe payment has not succeeded yet",
          requestId: request.id,
          details: {
            orderId: input.orderId,
            paymentIntentId: paymentIntent.id,
            stripeStatus: paymentIntent.status
          }
        })
      );
    }

    const dispatchResult = await dispatchOrderReconciliation({
      ordersBaseUrl,
      internalToken: ordersInternalToken,
      requestId: request.id,
      payload: buildStripePaymentIntentSucceededReconciliation({
        orderId: input.orderId,
        paymentIntent,
        message: "Stripe mobile payment finalized"
      })
    });

    if (!dispatchResult.ok) {
      request.log.error(
        {
          requestId: request.id,
          orderId: input.orderId,
          paymentIntentId: input.paymentIntentId,
          dispatchResult
        },
        "failed to dispatch Stripe mobile payment finalization to orders service"
      );
      return reply.status(502).send(
        serviceErrorSchema.parse({
          code: "ORDERS_RECONCILIATION_FAILED",
          message: "Orders reconciliation call failed",
          requestId: request.id
        })
      );
    }

    return stripeMobilePaymentFinalizeResponseSchema.parse({
      orderId: input.orderId,
      paymentIntentId: paymentIntent.id,
      accepted: true,
      applied: dispatchResult.response.applied,
      orderStatus: dispatchResult.response.orderStatus ?? orderPaymentContext.status,
      note: dispatchResult.response.note
    });
  });

  app.post(
    "/v1/payments/stripe/connect/onboarding-link",
    { preHandler: app.rateLimit(paymentsWriteRateLimit) },
    async (request, reply) => {
      if (!authorizeGatewayRequest(request, reply, gatewayInternalToken)) {
        return;
      }
      if (!requireStripeSecretKey(request, reply, stripeSecretKey)) {
        return;
      }

      const input = stripeConnectOnboardingLinkRequestSchema.parse(request.body);
      const locationSummaryResult = await fetchInternalLocationSummary({
        catalogBaseUrl,
        gatewayToken: gatewayInternalToken,
        requestId: request.id,
        locationId: input.locationId
      });

      if (!locationSummaryResult.ok) {
        const upstreamError = serviceErrorSchema.safeParse(locationSummaryResult.body);
        return reply.status(locationSummaryResult.status ?? 502).send(
          upstreamError.success
            ? upstreamError.data
            : serviceErrorSchema.parse({
                code: "CATALOG_LOCATION_UNAVAILABLE",
                message: "Unable to load location payment profile",
                requestId: request.id
              })
        );
      }

      let stripeAccount: Stripe.Account;
      try {
        const existingAccountId = locationSummaryResult.response.paymentProfile?.stripeAccountId;
        if (existingAccountId) {
          const existingAccount = await stripeClient.accounts.retrieve(existingAccountId);
          stripeAccount = isDeletedStripeAccount(existingAccount)
            ? await stripeClient.accounts.create({
                type: "express",
                country: "US",
                capabilities: {
                  card_payments: { requested: true },
                  transfers: { requested: true }
                },
                metadata: {
                  locationId: input.locationId
                }
              })
            : existingAccount;
        } else {
          stripeAccount = await stripeClient.accounts.create({
            type: "express",
            country: "US",
            capabilities: {
              card_payments: { requested: true },
              transfers: { requested: true }
            },
            metadata: {
              locationId: input.locationId
            }
          });
        }

        const nextPaymentProfile = buildStripePaymentProfile({
          locationSummary: locationSummaryResult.response,
          stripeAccount
        });
        const updatedProfileResult = await updateInternalLocationPaymentProfile({
          catalogBaseUrl,
          gatewayToken: gatewayInternalToken,
          requestId: request.id,
          locationId: input.locationId,
          paymentProfile: nextPaymentProfile
        });

        if (!updatedProfileResult.ok) {
          const upstreamError = serviceErrorSchema.safeParse(updatedProfileResult.body);
          return reply.status(updatedProfileResult.status ?? 502).send(
            upstreamError.success
              ? upstreamError.data
              : serviceErrorSchema.parse({
                  code: "CATALOG_PAYMENT_PROFILE_UPDATE_FAILED",
                  message: "Unable to persist Stripe payment profile",
                  requestId: request.id
                })
          );
        }

        const accountLink = await stripeClient.accountLinks.create({
          account: updatedProfileResult.response.stripeAccountId ?? stripeAccount.id,
          type: "account_onboarding",
          return_url: input.returnUrl,
          refresh_url: input.refreshUrl
        });

        return stripeConnectLinkResponseSchema.parse({
          locationId: input.locationId,
          stripeAccountId: updatedProfileResult.response.stripeAccountId ?? stripeAccount.id,
          url: accountLink.url,
          expiresAt: new Date(accountLink.expires_at * 1000).toISOString(),
          paymentProfile: updatedProfileResult.response,
          paymentReadiness: buildPaymentReadiness(updatedProfileResult.response)
        });
      } catch (error) {
        request.log.error({ error, requestId: request.id, locationId: input.locationId }, "Stripe onboarding link creation failed");
        return reply.status(502).send(
          serviceErrorSchema.parse({
            code: "STRIPE_ONBOARDING_LINK_ERROR",
            message: error instanceof Error ? error.message : "Stripe onboarding link creation failed",
            requestId: request.id
          })
        );
      }
    }
  );

  app.post(
    "/v1/payments/stripe/connect/dashboard-link",
    { preHandler: app.rateLimit(paymentsWriteRateLimit) },
    async (request, reply) => {
      if (!authorizeGatewayRequest(request, reply, gatewayInternalToken)) {
        return;
      }
      if (!requireStripeSecretKey(request, reply, stripeSecretKey)) {
        return;
      }

      const input = stripeConnectDashboardLinkRequestSchema.parse(request.body);
      const locationSummaryResult = await fetchInternalLocationSummary({
        catalogBaseUrl,
        gatewayToken: gatewayInternalToken,
        requestId: request.id,
        locationId: input.locationId
      });

      if (!locationSummaryResult.ok) {
        const upstreamError = serviceErrorSchema.safeParse(locationSummaryResult.body);
        return reply.status(locationSummaryResult.status ?? 502).send(
          upstreamError.success
            ? upstreamError.data
            : serviceErrorSchema.parse({
                code: "CATALOG_LOCATION_UNAVAILABLE",
                message: "Unable to load location payment profile",
                requestId: request.id
              })
        );
      }

      const stripeAccountId = locationSummaryResult.response.paymentProfile?.stripeAccountId;
      if (!stripeAccountId) {
        return reply.status(409).send(
          serviceErrorSchema.parse({
            code: "STRIPE_ACCOUNT_NOT_CONFIGURED",
            message: "Location does not have a Stripe account configured yet",
            requestId: request.id,
            details: {
              locationId: input.locationId
            }
          })
        );
      }

      try {
        const stripeAccount = await stripeClient.accounts.retrieve(stripeAccountId);
        if (isDeletedStripeAccount(stripeAccount)) {
          return reply.status(409).send(
            serviceErrorSchema.parse({
              code: "STRIPE_ACCOUNT_NOT_CONFIGURED",
              message: "Stored Stripe account could not be used",
              requestId: request.id,
              details: {
                locationId: input.locationId,
                stripeAccountId
              }
            })
          );
        }

        const nextPaymentProfile = buildStripePaymentProfile({
          locationSummary: locationSummaryResult.response,
          stripeAccount
        });
        const updatedProfileResult = await updateInternalLocationPaymentProfile({
          catalogBaseUrl,
          gatewayToken: gatewayInternalToken,
          requestId: request.id,
          locationId: input.locationId,
          paymentProfile: nextPaymentProfile
        });

        if (!updatedProfileResult.ok) {
          const upstreamError = serviceErrorSchema.safeParse(updatedProfileResult.body);
          return reply.status(updatedProfileResult.status ?? 502).send(
            upstreamError.success
              ? upstreamError.data
              : serviceErrorSchema.parse({
                  code: "CATALOG_PAYMENT_PROFILE_UPDATE_FAILED",
                  message: "Unable to persist Stripe payment profile",
                  requestId: request.id
                })
          );
        }

        const loginLink = await stripeClient.accounts.createLoginLink(stripeAccountId);
        return stripeConnectLinkResponseSchema.parse({
          locationId: input.locationId,
          stripeAccountId,
          url: loginLink.url,
          paymentProfile: updatedProfileResult.response,
          paymentReadiness: buildPaymentReadiness(updatedProfileResult.response)
        });
      } catch (error) {
        request.log.error({ error, requestId: request.id, locationId: input.locationId, stripeAccountId }, "Stripe dashboard link creation failed");
        return reply.status(502).send(
          serviceErrorSchema.parse({
            code: "STRIPE_DASHBOARD_LINK_ERROR",
            message: error instanceof Error ? error.message : "Stripe dashboard link creation failed",
            requestId: request.id
          })
        );
      }
    }
  );

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

    const { locationId } = locationIdQuerySchema.parse(request.query);
    const { authorizeUrl, stateExpiresAt } = buildCloverAuthorizeUrl({
      oauthConfig: cloverOAuthConfig,
      locationId
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
      const locationIdFromState = trimToUndefined(decodedState.locationId);
      await repository.saveCloverConnection({
        ...exchanged,
        merchantId,
        locationId: locationIdFromState,
        apiAccessKey
      });

      const status = await buildCloverOauthStatus(locationIdFromState);
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

    const { locationId } = locationIdQuerySchema.parse(request.query);
    const connection = await repository.findLatestCloverConnection(locationId ?? "");
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
        locationId: locationId ?? connection.locationId,
        apiAccessKey
      });
      const status = await buildCloverOauthStatus(locationId);
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
        locationId: order.locationId,
        requestId: request.id
      });
      await adapter.submitOrder(order);
      const latestConnection = await repository.findLatestCloverConnection(order.locationId);

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
        oauthConfig: cloverOAuthConfig,
        locationId: input.locationId
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

    if (existingRefund && existingRefund.status === "REFUNDED") {
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

    const chargeLookup = await repository.findChargeByProviderPaymentId(input.paymentId);
    if (chargeLookup && chargeLookup.charge.orderId !== input.orderId) {
      return reply.status(409).send(
        serviceErrorSchema.parse({
          code: "PAYMENT_ORDER_MISMATCH",
          message: "Payment does not belong to this order",
          requestId: request.id,
          details: {
            orderId: input.orderId,
            paymentId: input.paymentId,
            chargeOrderId: chargeLookup.charge.orderId
          }
        })
      );
    }

    if (chargeLookup?.charge.status && chargeLookup.charge.status !== "SUCCEEDED") {
      return reply.status(409).send(
        serviceErrorSchema.parse({
          code: "PAYMENT_NOT_REFUNDABLE",
          message: `Payment in status ${chargeLookup.charge.status} is not refundable`,
          requestId: request.id,
          details: { orderId: input.orderId, paymentId: input.paymentId, status: chargeLookup.charge.status }
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

    if (!input.locationId) {
      return reply.status(409).send(
        serviceErrorSchema.parse({
          code: "LOCATION_REQUIRED",
          message: "Location ID is required for Stripe refund",
          requestId: request.id,
          details: { orderId: input.orderId, paymentId: input.paymentId }
        })
      );
    }

    const locationSummaryResult = await fetchInternalLocationSummary({
      catalogBaseUrl,
      gatewayToken: gatewayInternalToken,
      requestId: request.id,
      locationId: input.locationId
    });

    if (!locationSummaryResult.ok) {
      return reply.status(502).send(
        serviceErrorSchema.parse({
          code: "CATALOG_LOCATION_UNAVAILABLE",
          message: "Unable to load location payment profile for refund",
          requestId: request.id,
          details: { locationId: input.locationId }
        })
      );
    }

    const stripeAccountId = locationSummaryResult.response.paymentProfile?.stripeAccountId;
    if (!stripeAccountId) {
      return reply.status(409).send(
        serviceErrorSchema.parse({
          code: "STRIPE_ACCOUNT_NOT_CONFIGURED",
          message: "Stripe account not configured for this location",
          requestId: request.id,
          details: { locationId: input.locationId }
        })
      );
    }

    try {
      await stripeClient.refunds.create(
        {
          payment_intent: input.paymentId,
          amount: input.amountCents
        },
        {
          stripeAccount: stripeAccountId,
          idempotencyKey: input.idempotencyKey
        }
      );

      const refundResponse = refundResponseSchema.parse({
        refundId: randomUUID(),
        provider: "STRIPE",
        orderId: input.orderId,
        paymentId: input.paymentId,
        status: "REFUNDED",
        amountCents: input.amountCents,
        currency: input.currency,
        occurredAt: new Date().toISOString(),
        message: "Stripe refund succeeded"
      });

      const savedRefund = await repository.saveRefund({ request: input, response: refundResponse });
      logPaymentsMutation(request, "refund accepted", {
        orderId: savedRefund.orderId,
        paymentId: savedRefund.paymentId,
        refundId: savedRefund.refundId,
        status: savedRefund.status,
        provider: savedRefund.provider,
        providerMode: "live"
      });
      return savedRefund;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Live Stripe refund failed";

      request.log.error(
        { error, requestId: request.id, orderId: input.orderId, paymentId: input.paymentId },
        "live Stripe refund failed"
      );
      return reply.status(502).send(
        serviceErrorSchema.parse({
          code: "STRIPE_REFUND_ERROR",
          message,
          requestId: request.id
        })
      );
    }
  });

  app.post("/v1/payments/webhooks/stripe", { preHandler: app.rateLimit(paymentsWebhookRateLimit) }, async (request, reply) => {
    if (!requireStripeWebhookSecret(request, reply, stripeConnectWebhookSecret)) {
      return;
    }

    const requestHeaders = request.headers as Record<string, unknown>;
    const signature = getHeaderValue(requestHeaders, "stripe-signature");

    let event: Stripe.Event;
    try {
      event = verifyStripeWebhookEvent({
        stripeClient,
        rawBody: request.rawBody,
        signature,
        endpointSecret: stripeConnectWebhookSecret
      });
    } catch (error) {
      request.log.warn(
        {
          requestId: request.id,
          error: error instanceof Error ? error.message : "unknown error"
        },
        "stripe webhook signature verification failed"
      );
      return reply.status(400).send(
        serviceErrorSchema.parse({
          code: "INVALID_STRIPE_SIGNATURE",
          message: "Stripe webhook signature verification failed",
          requestId: request.id
        })
      );
    }

    const existingEvent = await repository.findStripeWebhookEvent(event.id);
    if (existingEvent) {
      return stripeWebhookAcceptedResponseSchema.parse({
        accepted: true,
        provider: "STRIPE",
        eventId: existingEvent.event_id,
        eventType: existingEvent.event_type,
        duplicate: true,
        livemode: existingEvent.livemode,
        account: existingEvent.stripe_account ?? undefined
      });
    }

    const stripeAccount = typeof event.account === "string" ? event.account : undefined;
    const reconciliationPayload = resolveStripeOrderReconciliation(event);
    let reconciliationApplied: boolean | undefined;

    if (reconciliationPayload) {
      const dispatchResult = await dispatchOrderReconciliation({
        ordersBaseUrl,
        internalToken: ordersInternalToken,
        requestId: request.id,
        payload: reconciliationPayload
      });
      if (!dispatchResult.ok) {
        request.log.error(
          {
            requestId: request.id,
            eventId: event.id,
            eventType: event.type,
            stripeAccount,
            dispatchResult
          },
          "failed to dispatch Stripe webhook reconciliation to orders service"
        );
        return reply.status(502).send(
          serviceErrorSchema.parse({
            code: "ORDERS_RECONCILIATION_FAILED",
            message: "Orders reconciliation call failed",
            requestId: request.id
          })
        );
      }

      reconciliationApplied = dispatchResult.response.applied;
    }

    await repository.saveStripeWebhookEvent({
      eventId: event.id,
      eventType: event.type,
      stripeAccount,
      livemode: event.livemode,
      payload: event
    });

    request.log.info(
      {
        requestId: request.id,
        eventId: event.id,
        eventType: event.type,
        stripeAccount,
        livemode: event.livemode,
        orderApplied: reconciliationApplied
      },
      "stripe webhook accepted"
    );

    return stripeWebhookAcceptedResponseSchema.parse({
      accepted: true,
      provider: "STRIPE",
      eventId: event.id,
      eventType: event.type,
      duplicate: false,
      livemode: event.livemode,
      account: stripeAccount
    });
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
