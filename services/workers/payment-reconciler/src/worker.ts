import Stripe from "stripe";
import {
  createPostgresDb,
  getDatabaseUrl,
  runMigrations,
  sql,
  type PersistenceDb
} from "@lattelink/persistence";
import {
  checkoutPaymentConfirmationResponseSchema,
  checkoutPaymentConfirmationSchema,
  orderQuoteSchema,
  orderSchema,
  ordersPaymentReconciliationResultSchema,
  ordersPaymentReconciliationSchema
} from "@lattelink/contracts-orders";
import { captureOperationalError } from "@lattelink/observability";
import { z } from "zod";

type Logger = Pick<Console, "info" | "warn" | "error">;
type TimerHandle = ReturnType<typeof setTimeout>;

export type PaymentReconcilerConfig = {
  enabled: boolean;
  databaseUrl: string;
  ordersBaseUrl: string;
  ordersInternalApiToken: string;
  stripeSecretKey: string;
  intervalMs: number;
  staleThresholdMs: number;
  batchSize: number;
};

export type StalePaymentIntentCandidate = {
  referenceType?: "ORDER" | "CHECKOUT";
  orderId: string;
  locationId: string;
  paymentIntentId: string;
  stripeAccountId: string;
  amountCents: number;
  currency: "USD";
  createdAt: string;
  orderJson: unknown;
};

export type ReconcilerPaymentIntent = Pick<
  Stripe.PaymentIntent,
  "id" | "status" | "amount" | "amount_received" | "currency" | "metadata" | "last_payment_error"
>;

export type PaymentReconcilerBatchResult = {
  scanned: number;
  recovered: number;
  canceled: number;
  skipped: number;
  failed: number;
};

export type PaymentReconcilerRuntime = {
  listStalePendingPaymentIntents: (
    cutoffIso: string,
    batchSize: number
  ) => Promise<StalePaymentIntentCandidate[]>;
  retrievePaymentIntent: (paymentIntentId: string, stripeAccountId: string) => Promise<ReconcilerPaymentIntent>;
  updatePaymentIntentStatus: (paymentIntentId: string, status: string) => Promise<void>;
  reconcileSucceededPayment: (input: {
    ordersBaseUrl: string;
    internalApiToken: string;
    orderId: string;
    paymentIntent: ReconcilerPaymentIntent;
    referenceType?: "ORDER" | "CHECKOUT";
  }) => Promise<{ applied: boolean; orderStatus: string }>;
  cancelPendingOrder: (input: {
    ordersBaseUrl: string;
    internalApiToken: string;
    orderId: string;
    reason: string;
  }) => Promise<void>;
  expireCheckoutDraft: (input: {
    ordersBaseUrl: string;
    internalApiToken: string;
    checkoutId: string;
  }) => Promise<void>;
  logger: Logger;
  setTimeoutFn: (callback: () => void, delayMs: number) => TimerHandle;
  clearTimeoutFn: (handle: TimerHandle) => void;
  close?: () => Promise<void>;
};

export type PaymentReconcilerLoopHandle = {
  stop: () => void;
};

const stalePaymentIntentRowSchema = z.object({
  reference_type: z.enum(["ORDER", "CHECKOUT"]).default("ORDER"),
  order_id: z.string().uuid(),
  location_id: z.string().min(1),
  payment_intent_id: z.string().min(1),
  stripe_account_id: z.string().min(1),
  amount_cents: z.number().int().positive(),
  currency: z.literal("USD"),
  created_at: z.union([z.string(), z.date()]),
  order_json: z.unknown()
});

const defaultOrdersBaseUrl = "http://127.0.0.1:3001";
const defaultIntervalMs = 300_000;
const defaultStaleThresholdMs = 600_000;
const defaultBatchSize = 50;

function trimToUndefined(value: string | undefined) {
  const next = value?.trim();
  return next && next.length > 0 ? next : undefined;
}

function parseBooleanEnv(value: string | undefined, fallback: boolean) {
  if (value === undefined) {
    return fallback;
  }

  const normalized = value.trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) {
    return true;
  }
  if (["0", "false", "no", "off"].includes(normalized)) {
    return false;
  }

  throw new Error("PAYMENT_RECONCILER_ENABLED must be a boolean value");
}

function parseIntegerEnv(input: {
  name: string;
  value: string | undefined;
  fallback: number;
  min: number;
}) {
  const { name, value, fallback, min } = input;
  if (value === undefined) {
    return fallback;
  }

  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < min) {
    throw new Error(`${name} must be an integer >= ${min}`);
  }

  return parsed;
}

export function buildPaymentReconcilerConfig(env: NodeJS.ProcessEnv = process.env): PaymentReconcilerConfig {
  const enabled = parseBooleanEnv(env.PAYMENT_RECONCILER_ENABLED, true);
  const databaseUrl = trimToUndefined(env.DATABASE_URL) ?? getDatabaseUrl();
  const ordersBaseUrl = env.ORDERS_SERVICE_BASE_URL ?? defaultOrdersBaseUrl;
  const ordersInternalApiToken = trimToUndefined(env.ORDERS_INTERNAL_API_TOKEN);
  const stripeSecretKey = trimToUndefined(env.STRIPE_SECRET_KEY);
  new URL(ordersBaseUrl);

  if (!enabled) {
    return {
      enabled,
      databaseUrl: databaseUrl ?? "",
      ordersBaseUrl,
      ordersInternalApiToken: ordersInternalApiToken ?? "",
      stripeSecretKey: stripeSecretKey ?? "",
      intervalMs: defaultIntervalMs,
      staleThresholdMs: defaultStaleThresholdMs,
      batchSize: defaultBatchSize
    };
  }

  if (!databaseUrl) {
    throw new Error("DATABASE_URL must be set");
  }
  if (!ordersInternalApiToken) {
    throw new Error("ORDERS_INTERNAL_API_TOKEN must be set");
  }
  if (!stripeSecretKey) {
    throw new Error("STRIPE_SECRET_KEY must be set");
  }

  return {
    enabled,
    databaseUrl,
    ordersBaseUrl,
    ordersInternalApiToken,
    stripeSecretKey,
    intervalMs: parseIntegerEnv({
      name: "PAYMENT_RECONCILER_INTERVAL_MS",
      value: env.PAYMENT_RECONCILER_INTERVAL_MS,
      fallback: defaultIntervalMs,
      min: 1_000
    }),
    staleThresholdMs: parseIntegerEnv({
      name: "PAYMENT_RECONCILER_STALE_THRESHOLD_MS",
      value: env.PAYMENT_RECONCILER_STALE_THRESHOLD_MS,
      fallback: defaultStaleThresholdMs,
      min: 60_000
    }),
    batchSize: parseIntegerEnv({
      name: "PAYMENT_RECONCILER_BATCH_SIZE",
      value: env.PAYMENT_RECONCILER_BATCH_SIZE,
      fallback: defaultBatchSize,
      min: 1
    })
  };
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

function parseStalePaymentIntentCandidate(row: unknown): StalePaymentIntentCandidate {
  const parsed = stalePaymentIntentRowSchema.parse(row);
  return {
    referenceType: parsed.reference_type,
    orderId: parsed.order_id,
    locationId: parsed.location_id,
    paymentIntentId: parsed.payment_intent_id,
    stripeAccountId: parsed.stripe_account_id,
    amountCents: parsed.amount_cents,
    currency: parsed.currency,
    createdAt: parsed.created_at instanceof Date ? parsed.created_at.toISOString() : new Date(parsed.created_at).toISOString(),
    orderJson: parsed.order_json
  };
}

async function listStalePendingPaymentIntents(
  db: PersistenceDb,
  cutoffIso: string,
  batchSize: number
): Promise<StalePaymentIntentCandidate[]> {
  const result = await sql<z.input<typeof stalePaymentIntentRowSchema>>`
    SELECT * FROM (
    SELECT
      'ORDER' AS reference_type,
      spi.order_id,
      spi.location_id,
      spi.payment_intent_id,
      spi.stripe_account_id,
      spi.amount_cents,
      spi.currency,
      spi.created_at,
      o.order_json
    FROM payments_stripe_payment_intents spi
    INNER JOIN orders o ON o.order_id = spi.order_id
    WHERE o.order_json->>'status' = 'PENDING_PAYMENT'
    UNION ALL
    SELECT
      'CHECKOUT' AS reference_type,
      spi.order_id,
      spi.location_id,
      spi.payment_intent_id,
      spi.stripe_account_id,
      spi.amount_cents,
      spi.currency,
      spi.created_at,
      q.quote_json AS order_json
    FROM payments_stripe_payment_intents spi
    INNER JOIN order_checkout_drafts d ON d.checkout_id = spi.order_id
    INNER JOIN orders_quotes q ON q.quote_id = d.quote_id
    WHERE d.status = 'OPEN'
    ) candidates
    WHERE candidates.created_at < ${cutoffIso}
    ORDER BY candidates.created_at ASC
    LIMIT ${batchSize}
  `.execute(db);

  return result.rows.map(parseStalePaymentIntentCandidate);
}

async function updatePaymentIntentStatus(db: PersistenceDb, paymentIntentId: string, status: string) {
  await db
    .updateTable("payments_stripe_payment_intents")
    .set({
      status,
      updated_at: new Date().toISOString()
    })
    .where("payment_intent_id", "=", paymentIntentId)
    .execute();
}

async function parseJsonSafely(response: Response): Promise<unknown> {
  const raw = await response.text();
  if (!raw) {
    return undefined;
  }

  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return raw;
  }
}

async function reconcileSucceededPayment(input: {
  ordersBaseUrl: string;
  internalApiToken: string;
  orderId: string;
  paymentIntent: ReconcilerPaymentIntent;
  referenceType?: "ORDER" | "CHECKOUT";
}) {
  if (input.referenceType === "CHECKOUT") {
    const payload = checkoutPaymentConfirmationSchema.parse({
      eventId: `stripe-reconciler:${input.paymentIntent.id}:succeeded`,
      checkoutId: input.orderId,
      paymentId: input.paymentIntent.id,
      occurredAt: new Date().toISOString(),
      amountCents: input.paymentIntent.amount_received > 0 ? input.paymentIntent.amount_received : input.paymentIntent.amount,
      currency: normalizeStripeCurrency(input.paymentIntent.currency)
    });
    const response = await fetch(`${input.ordersBaseUrl}/v1/orders/internal/checkouts/confirm-payment`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-internal-token": input.internalApiToken },
      body: JSON.stringify(payload)
    });
    const body = await parseJsonSafely(response);
    if (!response.ok) throw new Error(`checkout confirmation failed with status ${response.status}: ${JSON.stringify(body)}`);
    const parsed = checkoutPaymentConfirmationResponseSchema.parse(body);
    return { applied: parsed.applied, orderStatus: parsed.order.status };
  }
  const payload = ordersPaymentReconciliationSchema.parse({
    eventId: `stripe-reconciler:${input.paymentIntent.id}:succeeded`,
    provider: "STRIPE",
    kind: "CHARGE",
    orderId: input.orderId,
    paymentId: input.paymentIntent.id,
    status: "SUCCEEDED",
    occurredAt: new Date().toISOString(),
    message: "Stripe payment succeeded; auto-reconciled by stale payment worker",
    amountCents: input.paymentIntent.amount_received > 0 ? input.paymentIntent.amount_received : input.paymentIntent.amount,
    currency: normalizeStripeCurrency(input.paymentIntent.currency)
  });

  const response = await fetch(`${input.ordersBaseUrl}/v1/orders/internal/payments/reconcile`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-internal-token": input.internalApiToken
    },
    body: JSON.stringify(payload)
  });
  const body = await parseJsonSafely(response);
  if (!response.ok) {
    throw new Error(`orders reconciliation failed with status ${response.status}: ${JSON.stringify(body)}`);
  }

  const parsed = ordersPaymentReconciliationResultSchema.parse(body);
  return {
    applied: parsed.applied,
    orderStatus: parsed.orderStatus ?? "PENDING_PAYMENT"
  };
}

async function cancelPendingOrder(input: {
  ordersBaseUrl: string;
  internalApiToken: string;
  orderId: string;
  reason: string;
}) {
  const response = await fetch(`${input.ordersBaseUrl}/v1/orders/internal/${input.orderId}/cancel`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-internal-token": input.internalApiToken
    },
    body: JSON.stringify({ reason: input.reason })
  });
  const body = await parseJsonSafely(response);
  if (!response.ok) {
    throw new Error(`orders cancel failed with status ${response.status}: ${JSON.stringify(body)}`);
  }
}

async function expireCheckoutDraft(input: {
  ordersBaseUrl: string;
  internalApiToken: string;
  checkoutId: string;
}) {
  const response = await fetch(`${input.ordersBaseUrl}/v1/orders/internal/checkouts/${input.checkoutId}/expire`, {
    method: "POST",
    headers: { "x-internal-token": input.internalApiToken }
  });
  const body = await parseJsonSafely(response);
  if (!response.ok) {
    throw new Error(`checkout expiration failed with status ${response.status}: ${JSON.stringify(body)}`);
  }
}

export async function createPaymentReconcilerRuntime(
  config: PaymentReconcilerConfig,
  logger: Logger = console
): Promise<PaymentReconcilerRuntime> {
  const db = createPostgresDb(config.databaseUrl);
  await runMigrations(db);
  const stripeClient = new Stripe(config.stripeSecretKey);

  return {
    listStalePendingPaymentIntents: (cutoffIso, batchSize) => listStalePendingPaymentIntents(db, cutoffIso, batchSize),
    retrievePaymentIntent: async (paymentIntentId, stripeAccountId) =>
      stripeClient.paymentIntents.retrieve(paymentIntentId, {}, { stripeAccount: stripeAccountId }),
    updatePaymentIntentStatus: (paymentIntentId, status) => updatePaymentIntentStatus(db, paymentIntentId, status),
    reconcileSucceededPayment,
    cancelPendingOrder,
    expireCheckoutDraft,
    logger,
    setTimeoutFn: (callback, delayMs) => setTimeout(callback, delayMs),
    clearTimeoutFn: (handle) => clearTimeout(handle),
    close: () => db.destroy()
  };
}

function shouldCancelForStripeStatus(status: Stripe.PaymentIntent.Status) {
  return status === "canceled" || status === "requires_payment_method";
}

function shouldSkipForStripeStatus(status: Stripe.PaymentIntent.Status) {
  return status === "processing" || status === "requires_action" || status === "requires_confirmation" || status === "requires_capture";
}

export async function processStalePaymentsBatch(
  config: PaymentReconcilerConfig,
  runtime: Pick<
    PaymentReconcilerRuntime,
    | "listStalePendingPaymentIntents"
    | "retrievePaymentIntent"
    | "updatePaymentIntentStatus"
    | "reconcileSucceededPayment"
    | "cancelPendingOrder"
    | "expireCheckoutDraft"
    | "logger"
  >
): Promise<PaymentReconcilerBatchResult> {
  const cutoffIso = new Date(Date.now() - config.staleThresholdMs).toISOString();
  const candidates = await runtime.listStalePendingPaymentIntents(cutoffIso, config.batchSize);
  const result: PaymentReconcilerBatchResult = {
    scanned: candidates.length,
    recovered: 0,
    canceled: 0,
    skipped: 0,
    failed: 0
  };

  for (const candidate of candidates) {
    try {
      const isCheckout = candidate.referenceType === "CHECKOUT";
      const context = isCheckout ? orderQuoteSchema.parse(candidate.orderJson) : orderSchema.parse(candidate.orderJson);
      const contextId = isCheckout ? candidate.orderId : orderSchema.parse(context).id;
      if (contextId !== candidate.orderId || context.locationId !== candidate.locationId) {
        throw new Error("stored order JSON does not match stale payment intent candidate");
      }

      const paymentIntent = await runtime.retrievePaymentIntent(candidate.paymentIntentId, candidate.stripeAccountId);
      await runtime.updatePaymentIntentStatus(candidate.paymentIntentId, paymentIntent.status);

      const metadataReferenceId = candidate.referenceType === "CHECKOUT"
        ? paymentIntent.metadata.checkoutId
        : resolveStripeMetadataOrderId(paymentIntent.metadata);
      if (metadataReferenceId !== candidate.orderId) {
        throw new Error("Stripe PaymentIntent metadata does not match order");
      }

      const amountCents = paymentIntent.amount_received > 0 ? paymentIntent.amount_received : paymentIntent.amount;
      const currency = normalizeStripeCurrency(paymentIntent.currency);
      if (amountCents !== context.total.amountCents || currency !== context.total.currency) {
        throw new Error("Stripe PaymentIntent amount or currency does not match order");
      }

      if (paymentIntent.status === "succeeded") {
        await runtime.reconcileSucceededPayment({
          ordersBaseUrl: config.ordersBaseUrl,
          internalApiToken: config.ordersInternalApiToken,
          orderId: candidate.orderId,
          paymentIntent,
          referenceType: candidate.referenceType
        });
        result.recovered += 1;
        runtime.logger.info({
          orderId: candidate.orderId,
          paymentIntentId: candidate.paymentIntentId,
          stripeStatus: paymentIntent.status
        }, "[payment-reconciler] recovered stale paid order");
        continue;
      }

      if (shouldCancelForStripeStatus(paymentIntent.status)) {
        if (candidate.referenceType === "CHECKOUT") {
          await runtime.expireCheckoutDraft({
            ordersBaseUrl: config.ordersBaseUrl,
            internalApiToken: config.ordersInternalApiToken,
            checkoutId: candidate.orderId
          });
          result.canceled += 1;
          continue;
        }
        await runtime.cancelPendingOrder({
          ordersBaseUrl: config.ordersBaseUrl,
          internalApiToken: config.ordersInternalApiToken,
          orderId: candidate.orderId,
          reason: `Payment failed - auto-reconciled from Stripe status ${paymentIntent.status}`
        });
        result.canceled += 1;
        runtime.logger.info({
          orderId: candidate.orderId,
          paymentIntentId: candidate.paymentIntentId,
          stripeStatus: paymentIntent.status
        }, "[payment-reconciler] canceled stale failed payment order");
        continue;
      }

      if (shouldSkipForStripeStatus(paymentIntent.status)) {
        result.skipped += 1;
        runtime.logger.info({
          orderId: candidate.orderId,
          paymentIntentId: candidate.paymentIntentId,
          stripeStatus: paymentIntent.status
        }, "[payment-reconciler] skipped pending Stripe payment intent");
        continue;
      }

      result.skipped += 1;
      runtime.logger.warn({
        orderId: candidate.orderId,
        paymentIntentId: candidate.paymentIntentId,
        stripeStatus: paymentIntent.status
      }, "[payment-reconciler] skipped unsupported Stripe payment intent status");
    } catch (error) {
      result.failed += 1;
      captureOperationalError({
        service: "payment-reconciler",
        event: "stale_payment.candidate_failed",
        error,
        tags: {
          orderId: candidate.orderId,
          locationId: candidate.locationId,
          paymentIntentId: candidate.paymentIntentId
        },
        context: {
          candidate: {
            orderId: candidate.orderId,
            locationId: candidate.locationId,
            paymentIntentId: candidate.paymentIntentId,
            stripeAccountId: candidate.stripeAccountId,
            amountCents: candidate.amountCents,
            currency: candidate.currency,
            createdAt: candidate.createdAt
          }
        },
        fingerprint: ["payment-reconciler", "stale-payment-candidate-failed"]
      });
      runtime.logger.error({
        error,
        orderId: candidate.orderId,
        paymentIntentId: candidate.paymentIntentId
      }, "[payment-reconciler] stale payment candidate failed");
    }
  }

  runtime.logger.info(
    `[payment-reconciler] scanned=${result.scanned} recovered=${result.recovered} canceled=${result.canceled} skipped=${result.skipped} failed=${result.failed}`
  );
  return result;
}

export function startPaymentReconcilerLoop(input: {
  intervalMs: number;
  runCycle: () => Promise<void>;
  setTimeoutFn?: (callback: () => void, delayMs: number) => TimerHandle;
  clearTimeoutFn?: (handle: TimerHandle) => void;
}): PaymentReconcilerLoopHandle {
  const setTimeoutFn = input.setTimeoutFn ?? ((callback, delayMs) => setTimeout(callback, delayMs));
  const clearTimeoutFn = input.clearTimeoutFn ?? ((handle) => clearTimeout(handle));

  let stopped = false;
  let timer: TimerHandle | undefined;

  const executeCycle = async () => {
    if (stopped) {
      return;
    }

    await input.runCycle();

    if (stopped) {
      return;
    }

    timer = setTimeoutFn(() => {
      void executeCycle();
    }, input.intervalMs);
  };

  void executeCycle();

  return {
    stop: () => {
      stopped = true;
      if (timer !== undefined) {
        clearTimeoutFn(timer);
      }
    }
  };
}

export function startPaymentReconcilerWorker(
  config: PaymentReconcilerConfig,
  runtime: PaymentReconcilerRuntime
): PaymentReconcilerLoopHandle {
  return startPaymentReconcilerLoop({
    intervalMs: config.intervalMs,
    setTimeoutFn: runtime.setTimeoutFn,
    clearTimeoutFn: runtime.clearTimeoutFn,
    runCycle: async () => {
      try {
        await processStalePaymentsBatch(config, runtime);
      } catch (error) {
        captureOperationalError({
          service: "payment-reconciler",
          event: "stale_payment.cycle_failed",
          error,
          context: {
            intervalMs: config.intervalMs,
            staleThresholdMs: config.staleThresholdMs,
            batchSize: config.batchSize
          },
          fingerprint: ["payment-reconciler", "cycle-failed"]
        });
        runtime.logger.error("[payment-reconciler] cycle failed", error);
      }
    }
  });
}
