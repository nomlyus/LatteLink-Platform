import type { FastifyBaseLogger, FastifyInstance } from "fastify";
import { z } from "zod";
import { randomUUID } from "node:crypto";
import { createPostgresDb, ensurePersistenceTables, getDatabaseUrl } from "@gazelle/persistence";

const payloadSchema = z.object({
  id: z.string().uuid().optional()
});

const chargeRequestSchema = z.object({
  orderId: z.string().uuid(),
  amountCents: z.number().int().positive(),
  currency: z.literal("USD"),
  applePayToken: z.string().min(1),
  idempotencyKey: z.string().min(1)
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

type PersistedChargeRow = {
  payment_id: string;
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
  saveCharge(input: { request: ChargeRequest; response: ChargeResponse }): Promise<ChargeResponse>;
  findLatestChargeForOrder(orderId: string): Promise<ChargeResponse | undefined>;
  findRefundByIdempotency(orderId: string, idempotencyKey: string): Promise<RefundResponse | undefined>;
  saveRefund(input: { request: RefundRequest; response: RefundResponse }): Promise<RefundResponse>;
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
  const refundResultsByIdempotency = new Map<string, RefundResponse>();

  return {
    backend: "memory",
    async findChargeByIdempotency(orderId, idempotencyKey) {
      return chargeResultsByIdempotency.get(`${orderId}:${idempotencyKey}`);
    },
    async saveCharge({ request, response }) {
      const key = `${request.orderId}:${request.idempotencyKey}`;
      chargeResultsByIdempotency.set(key, response);
      chargeResultByOrderId.set(request.orderId, response);
      return response;
    },
    async findLatestChargeForOrder(orderId) {
      return chargeResultByOrderId.get(orderId);
    },
    async findRefundByIdempotency(orderId, idempotencyKey) {
      return refundResultsByIdempotency.get(`${orderId}:${idempotencyKey}`);
    },
    async saveRefund({ request, response }) {
      const key = `${request.orderId}:${request.idempotencyKey}`;
      refundResultsByIdempotency.set(key, response);
      return response;
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
    async saveCharge({ request, response }) {
      await db
        .insertInto("payments_charges")
        .values({
          payment_id: response.paymentId,
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

      return row ? toChargeResponse(row as PersistedChargeRow) : undefined;
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

function createChargeResponse(input: ChargeRequest): ChargeResponse {
  const token = input.applePayToken.toLowerCase();

  if (token.includes("decline")) {
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

  if (token.includes("timeout")) {
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

export async function registerRoutes(app: FastifyInstance) {
  const repository = await createPaymentsRepository(app.log);

  app.addHook("onClose", async () => {
    await repository.close();
  });

  app.get("/health", async () => ({ status: "ok", service: "payments" }));
  app.get("/ready", async () => ({ status: "ready", service: "payments", persistence: repository.backend }));

  app.post("/v1/payments/charges", async (request) => {
    const input = chargeRequestSchema.parse(request.body);
    const existing = await repository.findChargeByIdempotency(input.orderId, input.idempotencyKey);

    if (existing) {
      return existing;
    }

    const chargeResponse = createChargeResponse(input);
    return repository.saveCharge({ request: input, response: chargeResponse });
  });

  app.post("/v1/payments/refunds", async (request, reply) => {
    const input = refundRequestSchema.parse(request.body);
    const existingRefund = await repository.findRefundByIdempotency(input.orderId, input.idempotencyKey);

    if (existingRefund) {
      return existingRefund;
    }

    const chargeResult = await repository.findLatestChargeForOrder(input.orderId);
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

    const shouldReject = input.reason.toLowerCase().includes("reject");
    const refundResponse = refundResponseSchema.parse({
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

    return repository.saveRefund({ request: input, response: refundResponse });
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
