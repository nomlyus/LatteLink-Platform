import { createHash, randomUUID } from "node:crypto";
import type { FastifyBaseLogger, FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { loyaltyBalanceSchema, loyaltyLedgerEntrySchema } from "@gazelle/contracts-loyalty";
import { createPostgresDb, ensurePersistenceTables, getDatabaseUrl } from "@gazelle/persistence";
import { z } from "zod";

const defaultUserId = "123e4567-e89b-12d3-a456-426614174000";
const defaultRateLimitWindowMs = 60_000;
const defaultLoyaltyMutationRateLimitMax = 180;

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

type LoyaltyLedgerRow = {
  id: string;
  type: "EARN" | "REDEEM" | "REFUND" | "ADJUSTMENT";
  points: number;
  order_id: string | null;
  created_at: string | Date;
};

type LoyaltyIdempotencyRow = {
  request_fingerprint: string;
  response_json: unknown;
};

type LoyaltyRepository = {
  backend: "memory" | "postgres";
  getBalance(userId: string): Promise<LoyaltyBalance>;
  saveBalance(balance: LoyaltyBalance): Promise<void>;
  getLedger(userId: string): Promise<LoyaltyLedgerEntry[]>;
  appendLedgerEntry(userId: string, entry: LoyaltyLedgerEntry): Promise<void>;
  getIdempotencyRecord(userId: string, idempotencyKey: string): Promise<IdempotencyRecord | undefined>;
  saveIdempotencyRecord(userId: string, idempotencyKey: string, record: IdempotencyRecord): Promise<IdempotencyRecord>;
  close(): Promise<void>;
};

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

function toPositiveInteger(value: string | undefined, fallback: number) {
  const parsed = Number.parseInt(value ?? "", 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }

  return parsed;
}

function parseIsoDate(value: unknown) {
  if (value instanceof Date) {
    return value.toISOString();
  }

  return new Date(String(value)).toISOString();
}

function createInMemoryRepository(): LoyaltyRepository {
  const balancesByUserId = new Map<string, LoyaltyBalance>();
  const ledgerByUserId = new Map<string, LoyaltyLedgerEntry[]>();
  const idempotencyByUserId = new Map<string, Map<string, IdempotencyRecord>>();

  return {
    backend: "memory",
    async getBalance(userId) {
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
    },
    async saveBalance(balance) {
      balancesByUserId.set(balance.userId, balance);
    },
    async getLedger(userId) {
      return ledgerByUserId.get(userId) ?? [];
    },
    async appendLedgerEntry(userId, entry) {
      const existing = ledgerByUserId.get(userId) ?? [];
      existing.push(entry);
      ledgerByUserId.set(userId, existing);
    },
    async getIdempotencyRecord(userId, idempotencyKey) {
      return idempotencyByUserId.get(userId)?.get(idempotencyKey);
    },
    async saveIdempotencyRecord(userId, idempotencyKey, record) {
      const userStore = idempotencyByUserId.get(userId) ?? new Map<string, IdempotencyRecord>();
      const existing = userStore.get(idempotencyKey);
      if (existing) {
        return existing;
      }

      userStore.set(idempotencyKey, record);
      idempotencyByUserId.set(userId, userStore);
      return record;
    },
    async close() {
      // no-op
    }
  };
}

async function createPostgresRepository(connectionString: string): Promise<LoyaltyRepository> {
  const db = createPostgresDb(connectionString);
  await ensurePersistenceTables(db);

  return {
    backend: "postgres",
    async getBalance(userId) {
      try {
        await db
          .insertInto("loyalty_balances")
          .values({
            user_id: userId,
            available_points: 0,
            pending_points: 0,
            lifetime_earned: 0
          })
          .execute();
      } catch {
        // ignore duplicate key races; we read authoritative row below
      }

      const row = await db
        .selectFrom("loyalty_balances")
        .selectAll()
        .where("user_id", "=", userId)
        .executeTakeFirstOrThrow();

      return loyaltyBalanceSchema.parse({
        userId: row.user_id,
        availablePoints: row.available_points,
        pendingPoints: row.pending_points,
        lifetimeEarned: row.lifetime_earned
      });
    },
    async saveBalance(balance) {
      const updated = await db
        .updateTable("loyalty_balances")
        .set({
          available_points: balance.availablePoints,
          pending_points: balance.pendingPoints,
          lifetime_earned: balance.lifetimeEarned,
          updated_at: new Date().toISOString()
        })
        .where("user_id", "=", balance.userId)
        .executeTakeFirst();

      if (Number(updated.numUpdatedRows ?? 0) > 0) {
        return;
      }

      try {
        await db
          .insertInto("loyalty_balances")
          .values({
            user_id: balance.userId,
            available_points: balance.availablePoints,
            pending_points: balance.pendingPoints,
            lifetime_earned: balance.lifetimeEarned
          })
          .execute();
      } catch {
        await db
          .updateTable("loyalty_balances")
          .set({
            available_points: balance.availablePoints,
            pending_points: balance.pendingPoints,
            lifetime_earned: balance.lifetimeEarned,
            updated_at: new Date().toISOString()
          })
          .where("user_id", "=", balance.userId)
          .execute();
      }
    },
    async getLedger(userId) {
      const rows = (await db
        .selectFrom("loyalty_ledger_entries")
        .selectAll()
        .where("user_id", "=", userId)
        .orderBy("created_at", "desc")
        .execute()) as LoyaltyLedgerRow[];

      return rows.map((row) =>
        loyaltyLedgerEntrySchema.parse({
          id: row.id,
          type: row.type,
          points: row.points,
          orderId: row.order_id ?? undefined,
          createdAt: parseIsoDate(row.created_at)
        })
      );
    },
    async appendLedgerEntry(userId, entry) {
      await db
        .insertInto("loyalty_ledger_entries")
        .values({
          id: entry.id,
          user_id: userId,
          type: entry.type,
          points: entry.points,
          order_id: entry.orderId ?? null,
          created_at: entry.createdAt
        })
        .execute();
    },
    async getIdempotencyRecord(userId, idempotencyKey) {
      const row = await db
        .selectFrom("loyalty_idempotency_keys")
        .selectAll()
        .where("user_id", "=", userId)
        .where("idempotency_key", "=", idempotencyKey)
        .executeTakeFirst();

      if (!row) {
        return undefined;
      }

      return {
        requestFingerprint: row.request_fingerprint,
        response: applyLedgerMutationResponseSchema.parse(row.response_json)
      };
    },
    async saveIdempotencyRecord(userId, idempotencyKey, record) {
      try {
        await db
          .insertInto("loyalty_idempotency_keys")
          .values({
            user_id: userId,
            idempotency_key: idempotencyKey,
            request_fingerprint: record.requestFingerprint,
            response_json: record.response
          })
          .execute();
      } catch {
        // ignore duplicate key races; we read authoritative row below
      }

      const persisted = (await db
        .selectFrom("loyalty_idempotency_keys")
        .selectAll()
        .where("user_id", "=", userId)
        .where("idempotency_key", "=", idempotencyKey)
        .executeTakeFirstOrThrow()) as LoyaltyIdempotencyRow;

      return {
        requestFingerprint: persisted.request_fingerprint,
        response: applyLedgerMutationResponseSchema.parse(persisted.response_json)
      };
    },
    async close() {
      await db.destroy();
    }
  };
}

async function createLoyaltyRepository(logger: FastifyBaseLogger): Promise<LoyaltyRepository> {
  const databaseUrl = getDatabaseUrl();
  if (!databaseUrl) {
    logger.info({ backend: "memory" }, "loyalty persistence backend selected");
    return createInMemoryRepository();
  }

  try {
    const repository = await createPostgresRepository(databaseUrl);
    logger.info({ backend: "postgres" }, "loyalty persistence backend selected");
    return repository;
  } catch (error) {
    logger.error({ error }, "failed to initialize postgres persistence; falling back to in-memory");
    return createInMemoryRepository();
  }
}

export async function registerRoutes(app: FastifyInstance) {
  const repository = await createLoyaltyRepository(app.log);
  const loyaltyRateLimitWindowMs = toPositiveInteger(process.env.LOYALTY_RATE_LIMIT_WINDOW_MS, defaultRateLimitWindowMs);
  const loyaltyMutationRateLimit = {
    max: toPositiveInteger(process.env.LOYALTY_RATE_LIMIT_MUTATION_MAX, defaultLoyaltyMutationRateLimitMax),
    timeWindow: loyaltyRateLimitWindowMs
  };

  app.addHook("onClose", async () => {
    await repository.close();
  });

  app.get("/health", async () => ({ status: "ok", service: "loyalty" }));
  app.get("/ready", async () => ({ status: "ready", service: "loyalty", persistence: repository.backend }));

  app.get("/v1/loyalty/balance", async (request, reply) => {
    const userId = resolveUserId(request, reply);
    if (!userId) {
      return;
    }

    return repository.getBalance(userId);
  });

  app.get("/v1/loyalty/ledger", async (request, reply) => {
    const userId = resolveUserId(request, reply);
    if (!userId) {
      return;
    }

    const ledger = await repository.getLedger(userId);
    return toSortedLedger(ledger);
  });

  app.post(
    "/v1/loyalty/internal/ledger/apply",
    {
      preHandler: app.rateLimit(loyaltyMutationRateLimit)
    },
    async (request, reply) => {
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
      const balance = await repository.getBalance(input.userId);
      const deltaPoints = toLedgerDeltaPoints(input);
      const resolvedPoints = resolveMutationPoints(input);
      const mutationFingerprint = toMutationFingerprint(input, deltaPoints, resolvedPoints);
      const existingMutation = await repository.getIdempotencyRecord(input.userId, input.idempotencyKey);

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

      await repository.appendLedgerEntry(input.userId, entry);
      await repository.saveBalance(nextBalance);

      const response = applyLedgerMutationResponseSchema.parse({
        entry,
        balance: nextBalance
      });

      const persistedRecord = await repository.saveIdempotencyRecord(input.userId, input.idempotencyKey, {
        requestFingerprint: mutationFingerprint,
        response
      });

      if (persistedRecord.requestFingerprint !== mutationFingerprint) {
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

      return persistedRecord.response;
    }
  );

  app.post("/v1/loyalty/internal/ping", async (request) => {
    const parsed = payloadSchema.parse(request.body ?? {});

    return {
      service: "loyalty",
      accepted: true,
      payload: parsed
    };
  });
}
