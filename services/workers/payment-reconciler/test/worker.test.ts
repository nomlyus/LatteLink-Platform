import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildPaymentReconcilerConfig,
  processStalePaymentsBatch,
  startPaymentReconcilerLoop,
  type PaymentReconcilerConfig,
  type PaymentReconcilerRuntime,
  type ReconcilerPaymentIntent,
  type StalePaymentIntentCandidate
} from "../src/worker.js";

const orderId = "11111111-1111-4111-8111-111111111111";
const locationId = "rawaqcoffee01";
const paymentIntentId = "pi_test_123";
const stripeAccountId = "acct_test_123";

const orderJson = {
  id: orderId,
  locationId,
  status: "PENDING_PAYMENT",
  items: [
    {
      itemId: "latte",
      name: "Latte",
      quantity: 1,
      unitPriceCents: 500,
      lineTotalCents: 500
    }
  ],
  total: {
    currency: "USD",
    amountCents: 500
  },
  pickupCode: "ABC123",
  timeline: [
    {
      status: "PENDING_PAYMENT",
      occurredAt: "2026-04-28T12:00:00.000Z",
      source: "customer"
    }
  ]
};

const checkoutQuoteJson = {
  quoteId: "22222222-2222-4222-8222-222222222222",
  locationId,
  items: orderJson.items,
  subtotal: orderJson.total,
  discount: { currency: "USD", amountCents: 0 },
  discounts: [],
  tax: { currency: "USD", amountCents: 0 },
  total: orderJson.total,
  pointsToRedeem: 0,
  quoteHash: "checkout-quote-hash"
};

const baseConfig: PaymentReconcilerConfig = {
  enabled: true,
  databaseUrl: "postgres://example",
  ordersBaseUrl: "http://127.0.0.1:3001",
  ordersInternalApiToken: "orders-token",
  stripeSecretKey: "sk_test_123",
  intervalMs: 300_000,
  staleThresholdMs: 600_000,
  batchSize: 50
};

function buildCandidate(overrides: Partial<StalePaymentIntentCandidate> = {}): StalePaymentIntentCandidate {
  return {
    orderId,
    locationId,
    paymentIntentId,
    stripeAccountId,
    amountCents: 500,
    currency: "USD",
    createdAt: "2026-04-28T11:45:00.000Z",
    orderJson,
    ...overrides
  };
}

function buildPaymentIntent(overrides: Partial<ReconcilerPaymentIntent> = {}): ReconcilerPaymentIntent {
  return {
    id: paymentIntentId,
    status: "succeeded",
    amount: 500,
    amount_received: 500,
    currency: "usd",
    metadata: {
      orderId
    },
    last_payment_error: null,
    ...overrides
  };
}

function buildRuntime(overrides: Partial<PaymentReconcilerRuntime> = {}): PaymentReconcilerRuntime {
  return {
    listStalePendingPaymentIntents: vi.fn(async () => [buildCandidate()]),
    retrievePaymentIntent: vi.fn(async () => buildPaymentIntent()),
    updatePaymentIntentStatus: vi.fn(async () => undefined),
    reconcileSucceededPayment: vi.fn(async () => ({
      applied: true,
      orderStatus: "PAID"
    })),
    cancelPendingOrder: vi.fn(async () => undefined),
    expireCheckoutDraft: vi.fn(async () => undefined),
    logger: {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn()
    },
    setTimeoutFn: (callback, delayMs) => setTimeout(callback, delayMs),
    clearTimeoutFn: (handle) => clearTimeout(handle),
    close: vi.fn(async () => undefined),
    ...overrides
  };
}

describe("payment reconciler worker", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("builds config from environment defaults", () => {
    const config = buildPaymentReconcilerConfig({
      DATABASE_URL: "postgres://db",
      ORDERS_INTERNAL_API_TOKEN: "orders-token",
      STRIPE_SECRET_KEY: "sk_test_123"
    } as NodeJS.ProcessEnv);

    expect(config.enabled).toBe(true);
    expect(config.ordersBaseUrl).toBe("http://127.0.0.1:3001");
    expect(config.intervalMs).toBe(300_000);
    expect(config.staleThresholdMs).toBe(600_000);
    expect(config.batchSize).toBe(50);
  });

  it("does not require secrets when disabled", () => {
    const config = buildPaymentReconcilerConfig({
      PAYMENT_RECONCILER_ENABLED: "false"
    } as NodeJS.ProcessEnv);

    expect(config.enabled).toBe(false);
  });

  it("requires database, orders token, and Stripe secret when enabled", () => {
    expect(() => buildPaymentReconcilerConfig({} as NodeJS.ProcessEnv)).toThrow("DATABASE_URL must be set");
    expect(() =>
      buildPaymentReconcilerConfig({
        DATABASE_URL: "postgres://db"
      } as NodeJS.ProcessEnv)
    ).toThrow("ORDERS_INTERNAL_API_TOKEN must be set");
    expect(() =>
      buildPaymentReconcilerConfig({
        DATABASE_URL: "postgres://db",
        ORDERS_INTERNAL_API_TOKEN: "orders-token"
      } as NodeJS.ProcessEnv)
    ).toThrow("STRIPE_SECRET_KEY must be set");
  });

  it("recovers succeeded Stripe PaymentIntents", async () => {
    const runtime = buildRuntime();

    const result = await processStalePaymentsBatch(baseConfig, runtime);

    expect(result).toEqual({
      scanned: 1,
      recovered: 1,
      canceled: 0,
      skipped: 0,
      failed: 0
    });
    expect(runtime.reconcileSucceededPayment).toHaveBeenCalledWith({
      ordersBaseUrl: baseConfig.ordersBaseUrl,
      internalApiToken: baseConfig.ordersInternalApiToken,
      orderId,
      paymentIntent: buildPaymentIntent()
    });
    expect(runtime.cancelPendingOrder).not.toHaveBeenCalled();
  });

  it("cancels failed or canceled Stripe PaymentIntents", async () => {
    const runtime = buildRuntime({
      retrievePaymentIntent: vi.fn(async () => buildPaymentIntent({ status: "requires_payment_method" }))
    });

    const result = await processStalePaymentsBatch(baseConfig, runtime);

    expect(result).toMatchObject({
      recovered: 0,
      canceled: 1,
      skipped: 0,
      failed: 0
    });
    expect(runtime.cancelPendingOrder).toHaveBeenCalledWith({
      ordersBaseUrl: baseConfig.ordersBaseUrl,
      internalApiToken: baseConfig.ordersInternalApiToken,
      orderId,
      reason: "Payment failed - auto-reconciled from Stripe status requires_payment_method"
    });
  });

  it("expires checkout drafts when their Stripe PaymentIntent fails", async () => {
    const runtime = buildRuntime({
      listStalePendingPaymentIntents: vi.fn(async () => [buildCandidate({ referenceType: "CHECKOUT", orderJson: checkoutQuoteJson })]),
      retrievePaymentIntent: vi.fn(async () => buildPaymentIntent({
        status: "requires_payment_method",
        metadata: { checkoutId: orderId }
      }))
    });

    const result = await processStalePaymentsBatch(baseConfig, runtime);

    expect(result).toMatchObject({ canceled: 1, skipped: 0, failed: 0 });
    expect(runtime.expireCheckoutDraft).toHaveBeenCalledWith({
      ordersBaseUrl: baseConfig.ordersBaseUrl,
      internalApiToken: baseConfig.ordersInternalApiToken,
      checkoutId: orderId
    });
    expect(runtime.cancelPendingOrder).not.toHaveBeenCalled();
  });

  it("skips Stripe PaymentIntents that are still processing", async () => {
    const runtime = buildRuntime({
      retrievePaymentIntent: vi.fn(async () => buildPaymentIntent({ status: "processing" }))
    });

    const result = await processStalePaymentsBatch(baseConfig, runtime);

    expect(result).toMatchObject({
      recovered: 0,
      canceled: 0,
      skipped: 1,
      failed: 0
    });
    expect(runtime.reconcileSucceededPayment).not.toHaveBeenCalled();
    expect(runtime.cancelPendingOrder).not.toHaveBeenCalled();
  });

  it("fails safely on metadata mismatch", async () => {
    const runtime = buildRuntime({
      retrievePaymentIntent: vi.fn(async () =>
        buildPaymentIntent({
          metadata: {
            orderId: "22222222-2222-4222-8222-222222222222"
          }
        })
      )
    });

    const result = await processStalePaymentsBatch(baseConfig, runtime);

    expect(result).toMatchObject({
      recovered: 0,
      canceled: 0,
      skipped: 0,
      failed: 1
    });
    expect(runtime.reconcileSucceededPayment).not.toHaveBeenCalled();
  });

  it("stops the loop without scheduling another cycle", async () => {
    vi.useFakeTimers();
    const runCycle = vi.fn(async () => undefined);
    const handle = startPaymentReconcilerLoop({
      intervalMs: 5_000,
      runCycle
    });

    await vi.waitFor(() => {
      expect(runCycle).toHaveBeenCalledTimes(1);
    });
    handle.stop();
    await vi.advanceTimersByTimeAsync(10_000);

    expect(runCycle).toHaveBeenCalledTimes(1);
  });
});
