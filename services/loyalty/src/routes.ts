import { createHash, randomUUID } from "node:crypto";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { loyaltyBalanceSchema, loyaltyLedgerEntrySchema } from "@gazelle/contracts-loyalty";
import { z } from "zod";

const defaultUserId = "123e4567-e89b-12d3-a456-426614174000";

const payloadSchema = z.object({
  id: z.string().uuid().optional()
});

const serviceErrorSchema = z.object({
  code: z.string(),
  message: z.string(),
  requestId: z.string(),
  details: z.record(z.unknown()).optional()
});

const userHeadersSchema = z.object({
  "x-user-id": z.string().uuid().optional()
});

const mutationBaseSchema = z.object({
  userId: z.string().uuid(),
  orderId: z.string().uuid().optional(),
  idempotencyKey: z.string().min(1),
  occurredAt: z.string().datetime().optional()
});

const deterministicMoneyPointsMessage = "points must match amountCents for deterministic money accounting";

const earnMutationSchema = mutationBaseSchema
  .extend({
    type: z.literal("EARN"),
    amountCents: z.number().int().positive(),
    points: z.number().int().positive().optional()
  })
  .superRefine((input, context) => {
    if (input.points !== undefined && input.points !== input.amountCents) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: deterministicMoneyPointsMessage,
        path: ["points"]
      });
    }
  });

const redeemMutationSchema = mutationBaseSchema
  .extend({
    type: z.literal("REDEEM"),
    amountCents: z.number().int().positive(),
    points: z.number().int().positive().optional()
  })
  .superRefine((input, context) => {
    if (input.points !== undefined && input.points !== input.amountCents) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: deterministicMoneyPointsMessage,
        path: ["points"]
      });
    }
  });

const refundMutationSchema = mutationBaseSchema
  .extend({
    type: z.literal("REFUND"),
    amountCents: z.number().int().positive(),
    points: z.number().int().positive().optional()
  })
  .superRefine((input, context) => {
    if (input.points !== undefined && input.points !== input.amountCents) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: deterministicMoneyPointsMessage,
        path: ["points"]
      });
    }
  });

const adjustmentMutationSchema = mutationBaseSchema.extend({
  type: z.literal("ADJUSTMENT"),
  points: z.number().int().refine((value) => value !== 0, {
    message: "adjustment points cannot be zero"
  }),
  amountCents: z.undefined().optional()
});

const applyLedgerMutationSchema = z.union([
  earnMutationSchema,
  redeemMutationSchema,
  refundMutationSchema,
  adjustmentMutationSchema
]);

const applyLedgerMutationResponseSchema = z.object({
  entry: loyaltyLedgerEntrySchema,
  balance: loyaltyBalanceSchema
});

type LoyaltyBalance = z.output<typeof loyaltyBalanceSchema>;
type LoyaltyLedgerEntry = z.output<typeof loyaltyLedgerEntrySchema>;
type ApplyLedgerMutation = z.output<typeof applyLedgerMutationSchema>;
type ApplyLedgerMutationResponse = z.output<typeof applyLedgerMutationResponseSchema>;

type IdempotencyRecord = {
  requestFingerprint: string;
  response: ApplyLedgerMutationResponse;
};

const balancesByUserId = new Map<string, LoyaltyBalance>();
const ledgerByUserId = new Map<string, LoyaltyLedgerEntry[]>();
const idempotencyByUserId = new Map<string, Map<string, IdempotencyRecord>>();

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

function ensureUserBalance(userId: string) {
  const existing = balancesByUserId.get(userId);
  if (existing) {
    return existing;
  }

  const created = loyaltyBalanceSchema.parse({
    userId,
    availablePoints: 0,
    pendingPoints: 0,
    lifetimeEarned: 0
  });
  balancesByUserId.set(userId, created);
  return created;
}

function ensureLedger(userId: string) {
  const existing = ledgerByUserId.get(userId);
  if (existing) {
    return existing;
  }

  const created: LoyaltyLedgerEntry[] = [];
  ledgerByUserId.set(userId, created);
  return created;
}

function ensureIdempotencyStore(userId: string) {
  const existing = idempotencyByUserId.get(userId);
  if (existing) {
    return existing;
  }

  const created = new Map<string, IdempotencyRecord>();
  idempotencyByUserId.set(userId, created);
  return created;
}

function resolveUserId(request: FastifyRequest, reply: FastifyReply) {
  const parsed = userHeadersSchema.safeParse(request.headers);
  if (!parsed.success) {
    sendError(reply, {
      statusCode: 400,
      code: "INVALID_USER_CONTEXT",
      message: "x-user-id header must be a UUID when provided",
      requestId: request.id,
      details: parsed.error.flatten()
    });
    return undefined;
  }

  return parsed.data["x-user-id"] ?? defaultUserId;
}

function resolveMutationPoints(input: ApplyLedgerMutation) {
  if (input.type === "ADJUSTMENT") {
    return Math.abs(input.points);
  }

  return input.points ?? input.amountCents;
}

function toLedgerDeltaPoints(input: ApplyLedgerMutation) {
  if (input.type === "REDEEM") {
    return -(input.points ?? input.amountCents);
  }

  if (input.type === "ADJUSTMENT") {
    return input.points;
  }

  return input.points ?? input.amountCents;
}

function toLifetimeEarnedDelta(input: ApplyLedgerMutation) {
  if (input.type !== "EARN") {
    return 0;
  }

  return input.points ?? input.amountCents;
}

function toMutationFingerprint(input: ApplyLedgerMutation, deltaPoints: number, resolvedPoints: number) {
  return createHash("sha256")
    .update(
      JSON.stringify({
        type: input.type,
        userId: input.userId,
        orderId: input.orderId ?? null,
        amountCents: "amountCents" in input ? input.amountCents ?? null : null,
        points: "points" in input ? input.points : null,
        deltaPoints,
        resolvedPoints
      })
    )
    .digest("hex");
}

function toSortedLedger(entries: LoyaltyLedgerEntry[]) {
  return z
    .array(loyaltyLedgerEntrySchema)
    .parse([...entries].sort((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt)));
}

export async function registerRoutes(app: FastifyInstance) {
  app.get("/health", async () => ({ status: "ok", service: "loyalty" }));
  app.get("/ready", async () => ({ status: "ready", service: "loyalty" }));

  app.get("/v1/loyalty/balance", async (request, reply) => {
    const userId = resolveUserId(request, reply);
    if (!userId) {
      return;
    }

    return ensureUserBalance(userId);
  });

  app.get("/v1/loyalty/ledger", async (request, reply) => {
    const userId = resolveUserId(request, reply);
    if (!userId) {
      return;
    }

    return toSortedLedger(ensureLedger(userId));
  });

  app.post("/v1/loyalty/internal/ledger/apply", async (request, reply) => {
    const parsedMutation = applyLedgerMutationSchema.safeParse(request.body);
    if (!parsedMutation.success) {
      return sendError(reply, {
        statusCode: 400,
        code: "INVALID_LOYALTY_MUTATION",
        message: "Loyalty ledger mutation payload is invalid",
        requestId: request.id,
        details: parsedMutation.error.flatten()
      });
    }

    const input = parsedMutation.data;
    const balance = ensureUserBalance(input.userId);
    const ledger = ensureLedger(input.userId);
    const idempotencyStore = ensureIdempotencyStore(input.userId);
    const deltaPoints = toLedgerDeltaPoints(input);
    const resolvedPoints = resolveMutationPoints(input);
    const mutationFingerprint = toMutationFingerprint(input, deltaPoints, resolvedPoints);
    const existingMutation = idempotencyStore.get(input.idempotencyKey);

    if (existingMutation) {
      if (existingMutation.requestFingerprint !== mutationFingerprint) {
        return sendError(reply, {
          statusCode: 409,
          code: "IDEMPOTENCY_KEY_REUSE",
          message: "idempotencyKey was already used with a different mutation payload",
          requestId: request.id,
          details: {
            userId: input.userId,
            idempotencyKey: input.idempotencyKey
          }
        });
      }

      return existingMutation.response;
    }

    const availableAfterMutation = balance.availablePoints + deltaPoints;
    if (availableAfterMutation < 0) {
      return sendError(reply, {
        statusCode: 409,
        code: "INSUFFICIENT_POINTS",
        message: "Mutation would result in a negative availablePoints balance",
        requestId: request.id,
        details: {
          userId: input.userId,
          availablePoints: balance.availablePoints,
          requestedPoints: resolvedPoints,
          type: input.type
        }
      });
    }

    const nextBalance = loyaltyBalanceSchema.parse({
      ...balance,
      availablePoints: availableAfterMutation,
      pendingPoints: balance.pendingPoints,
      lifetimeEarned: balance.lifetimeEarned + toLifetimeEarnedDelta(input)
    });

    const entry = loyaltyLedgerEntrySchema.parse({
      id: randomUUID(),
      type: input.type,
      points: deltaPoints,
      orderId: input.orderId,
      createdAt: input.occurredAt ?? new Date().toISOString()
    });

    ledger.push(entry);
    balancesByUserId.set(input.userId, nextBalance);

    const response = applyLedgerMutationResponseSchema.parse({
      entry,
      balance: nextBalance
    });

    idempotencyStore.set(input.idempotencyKey, {
      requestFingerprint: mutationFingerprint,
      response
    });

    return response;
  });

  app.post("/v1/loyalty/internal/ping", async (request) => {
    const parsed = payloadSchema.parse(request.body ?? {});

    return {
      service: "loyalty",
      accepted: true,
      payload: parsed
    };
  });
}
