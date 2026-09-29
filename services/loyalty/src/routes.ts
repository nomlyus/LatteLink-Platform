import { createHash, randomUUID, timingSafeEqual } from "node:crypto";
import type { FastifyBaseLogger, FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import {
  loyaltyBalanceSchema,
  loyaltyLedgerEntrySchema,
  loyaltyLocationRequestSchema,
  loyaltyProgramContextSchema,
  loyaltyProgramSchema,
  loyaltyProgramUpdateSchema
} from "@lattelink/contracts-loyalty";
import {
  allowsInMemoryPersistence,
  buildPersistenceStartupError,
  createPostgresDb,
  getDatabaseUrl,
  getPersistenceReadinessMetadata,
  runMigrations,
  sql
} from "@lattelink/persistence";
import { z } from "zod";

const defaultRateLimitWindowMs = 60_000;
const defaultLoyaltyMutationRateLimitMax = 180;

const serviceErrorSchema = z.object({
  code: z.string(),
  message: z.string(),
  requestId: z.string(),
  details: z.record(z.unknown()).optional()
});
const userHeadersSchema = z.object({ "x-user-id": z.string().uuid().optional() });
const gatewayHeadersSchema = z.object({ "x-gateway-token": z.string().optional() });
const internalHeadersSchema = z.object({ "x-internal-token": z.string().optional() });
const internalContextQuerySchema = loyaltyLocationRequestSchema.extend({ userId: z.string().uuid().optional() });
const internalProgramParamsSchema = z.object({ brandId: z.string().trim().min(1).max(160) });

const mutationBaseSchema = z.object({
  brandId: z.string().trim().min(1).max(160),
  userId: z.string().uuid(),
  locationId: z.string().trim().min(1).max(160),
  orderId: z.string().uuid().optional(),
  idempotencyKey: z.string().trim().min(1).max(240),
  occurredAt: z.string().datetime().optional()
});
const applyLedgerMutationSchema = z.union([
  mutationBaseSchema.extend({
    type: z.literal("EARN"),
    amountCents: z.number().int().positive(),
    points: z.number().int().nonnegative().optional()
  }),
  mutationBaseSchema.extend({
    type: z.literal("REDEEM"),
    amountCents: z.number().int().positive(),
    points: z.number().int().positive()
  }),
  mutationBaseSchema.extend({
    type: z.literal("REFUND"),
    amountCents: z.number().int().positive(),
    points: z.number().int().positive()
  }),
  mutationBaseSchema.extend({
    type: z.literal("ADJUSTMENT"),
    points: z.number().int().refine((value) => value !== 0, { message: "adjustment points cannot be zero" }),
    amountCents: z.undefined().optional()
  })
]);
const applyLedgerMutationResponseSchema = z.object({
  entry: loyaltyLedgerEntrySchema,
  balance: loyaltyBalanceSchema
});

type LoyaltyBalance = z.output<typeof loyaltyBalanceSchema>;
type LoyaltyLedgerEntry = z.output<typeof loyaltyLedgerEntrySchema>;
type LoyaltyProgram = z.output<typeof loyaltyProgramSchema>;
type LoyaltyProgramUpdate = z.output<typeof loyaltyProgramUpdateSchema>;
type ApplyLedgerMutation = z.output<typeof applyLedgerMutationSchema>;
type ApplyLedgerMutationResponse = z.output<typeof applyLedgerMutationResponseSchema>;
type MutationOutcome =
  | { kind: "applied" | "replay"; response: ApplyLedgerMutationResponse }
  | { kind: "idempotency_conflict" }
  | { kind: "insufficient"; balance: LoyaltyBalance; requestedPoints: number };
type ProgramContext = z.output<typeof loyaltyProgramContextSchema>;

type LoyaltyRepository = {
  backend: "memory" | "postgres";
  getLocationProgramContext(brandId: string, locationId: string, userId?: string): Promise<ProgramContext | undefined>;
  getProgram(brandId: string): Promise<LoyaltyProgram | undefined>;
  replaceProgram(input: LoyaltyProgramUpdate): Promise<LoyaltyProgram | undefined>;
  getEarnEntry(brandId: string, userId: string, orderId: string): Promise<LoyaltyLedgerEntry | undefined>;
  getBalance(brandId: string, userId: string): Promise<LoyaltyBalance>;
  getLedger(brandId: string, userId: string): Promise<LoyaltyLedgerEntry[]>;
  applyMutation(input: {
    brandId: string;
    userId: string;
    locationId: string;
    idempotencyKey: string;
    fingerprint: string;
    response: ApplyLedgerMutationResponse;
    deltaPoints: number;
    lifetimeEarnedDelta: number;
  }): Promise<MutationOutcome>;
  pingDb(): Promise<void>;
  close(): Promise<void>;
};

function sendError(reply: FastifyReply, input: {
  statusCode: number;
  code: string;
  message: string;
  requestId: string;
  details?: Record<string, unknown>;
}) {
  return reply.status(input.statusCode).send(serviceErrorSchema.parse(input));
}

function trimToUndefined(value: string | undefined) {
  const next = value?.trim();
  return next && next.length > 0 ? next : undefined;
}

function secretsMatch(expected: string, provided: string) {
  const expectedBuffer = Buffer.from(expected, "utf8");
  const providedBuffer = Buffer.from(provided, "utf8");
  return expectedBuffer.length === providedBuffer.length && timingSafeEqual(expectedBuffer, providedBuffer);
}

function authorize(request: FastifyRequest, reply: FastifyReply, expected: string | undefined, kind: "gateway" | "internal") {
  const isGateway = kind === "gateway";
  const missingCode = isGateway ? "GATEWAY_ACCESS_NOT_CONFIGURED" : "INTERNAL_ACCESS_NOT_CONFIGURED";
  const unauthorizedCode = isGateway ? "UNAUTHORIZED_GATEWAY_REQUEST" : "UNAUTHORIZED_INTERNAL_REQUEST";
  const envName = isGateway ? "GATEWAY_INTERNAL_API_TOKEN" : "LOYALTY_INTERNAL_API_TOKEN";
  if (!expected) {
    sendError(reply, {
      statusCode: 503,
      code: missingCode,
      message: `${envName} must be configured before accepting requests`,
      requestId: request.id
    });
    return false;
  }

  const token = isGateway
    ? gatewayHeadersSchema.safeParse(request.headers).data?.["x-gateway-token"]
    : internalHeadersSchema.safeParse(request.headers).data?.["x-internal-token"];
  if (token && secretsMatch(expected, token)) return true;
  sendError(reply, {
    statusCode: 401,
    code: unauthorizedCode,
    message: isGateway ? "Gateway token is invalid" : "Internal loyalty token is invalid",
    requestId: request.id
  });
  return false;
}

function resolveUserId(request: FastifyRequest, reply: FastifyReply) {
  const parsed = userHeadersSchema.safeParse(request.headers);
  if (!parsed.success || !parsed.data["x-user-id"]) {
    sendError(reply, {
      statusCode: 400,
      code: "INVALID_USER_CONTEXT",
      message: "A valid x-user-id header is required",
      requestId: request.id
    });
    return undefined;
  }
  return parsed.data["x-user-id"];
}

function earnPoints(amountCents: number, pointsPerDollar: number) {
  return Math.floor(amountCents / 100) * pointsPerDollar;
}

function toDelta(input: ApplyLedgerMutation, program?: ProgramContext) {
  switch (input.type) {
    case "EARN":
      return input.points ?? earnPoints(input.amountCents, program?.pointsPerDollar ?? 1);
    case "REDEEM":
      return -input.points;
    case "REFUND":
    case "ADJUSTMENT":
      return input.points;
  }
}

function fingerprint(input: ApplyLedgerMutation, deltaPoints: number) {
  return createHash("sha256")
    .update(JSON.stringify({ ...input, occurredAt: undefined, deltaPoints }))
    .digest("hex");
}

function defaultProgram(update: LoyaltyProgramUpdate, version: number): LoyaltyProgram {
  return loyaltyProgramSchema.parse({ ...update, version, updatedAt: new Date().toISOString() });
}

function createInMemoryRepository(): LoyaltyRepository {
  const programs = new Map<string, LoyaltyProgram>();
  const locationOwners = new Map<string, string>();
  const balances = new Map<string, LoyaltyBalance>();
  const ledger = new Map<string, LoyaltyLedgerEntry[]>();
  const idempotency = new Map<string, { fingerprint: string; response: ApplyLedgerMutationResponse }>();
  const locks = new Map<string, Promise<void>>();
  const customerKey = (brandId: string, userId: string) => `${brandId}\u0000${userId}`;

  async function underCustomerLock<T>(key: string, action: () => T | Promise<T>): Promise<T> {
    const previous = locks.get(key) ?? Promise.resolve();
    let release!: () => void;
    const lock = new Promise<void>((resolve) => { release = resolve; });
    locks.set(key, lock);
    await previous;
    try {
      return await action();
    } finally {
      release();
      if (locks.get(key) === lock) locks.delete(key);
    }
  }

  return {
    backend: "memory",
    async getProgram(brandId) { return programs.get(brandId); },
    async getEarnEntry(brandId, userId, orderId) {
      return ledger.get(customerKey(brandId, userId))?.find((entry) => entry.type === "EARN" && entry.orderId === orderId);
    },
    async getLocationProgramContext(brandId, locationId, userId) {
      const owner = locationOwners.get(locationId);
      if (!owner || owner !== brandId) return undefined;
      const program = programs.get(brandId);
      const participating = Boolean(program?.participatingLocationIds.includes(locationId));
      const balanceKey = userId ? customerKey(brandId, userId) : undefined;
      const balance = balanceKey ? balances.get(balanceKey) ?? loyaltyBalanceSchema.parse({
        brandId, userId, availablePoints: 0, pendingPoints: 0, lifetimeEarned: 0
      }) : undefined;
      return loyaltyProgramContextSchema.parse({
        brandId, locationId,
        enabled: program?.enabled ?? false,
        participating,
        pointsPerDollar: program?.pointsPerDollar ?? 1,
        redemptionCentsPerPoint: program?.redemptionCentsPerPoint ?? 1,
        minimumRedemptionPoints: program?.minimumRedemptionPoints ?? 1,
        maximumRedemptionPercent: program?.maximumRedemptionPercent ?? 100,
        excludedItemIds: program?.excludedItemIds ?? [],
        balance
      });
    },
    async replaceProgram(input) {
      const prior = programs.get(input.brandId);
      if (input.enabled && input.participatingLocationIds.length === 0) return undefined;
      if (input.participatingLocationIds.some((locationId) => {
        const owner = locationOwners.get(locationId);
        return owner !== undefined && owner !== input.brandId;
      })) return undefined;
      for (const locationId of input.participatingLocationIds) locationOwners.set(locationId, input.brandId);
      const next = defaultProgram(input, (prior?.version ?? 0) + 1);
      programs.set(input.brandId, next);
      return next;
    },
    async getBalance(brandId, userId) {
      const key = customerKey(brandId, userId);
      let balance = balances.get(key);
      if (!balance) {
        balance = loyaltyBalanceSchema.parse({ brandId, userId, availablePoints: 0, pendingPoints: 0, lifetimeEarned: 0 });
        balances.set(key, balance);
      }
      return balance;
    },
    async getLedger(brandId, userId) { return ledger.get(customerKey(brandId, userId)) ?? []; },
    async applyMutation(input) {
      const key = customerKey(input.brandId, input.userId);
      return underCustomerLock(key, async () => {
        const idKey = `${key}\u0000${input.idempotencyKey}`;
        const existing = idempotency.get(idKey);
        if (existing) {
          return existing.fingerprint === input.fingerprint
            ? { kind: "replay", response: existing.response }
            : { kind: "idempotency_conflict" };
        }
        const current = await this.getBalance(input.brandId, input.userId);
        const nextAvailable = current.availablePoints + input.deltaPoints;
        if (nextAvailable < 0) return { kind: "insufficient", balance: current, requestedPoints: Math.abs(input.deltaPoints) };
        const nextBalance = loyaltyBalanceSchema.parse({
          ...current,
          availablePoints: nextAvailable,
          lifetimeEarned: current.lifetimeEarned + input.lifetimeEarnedDelta
        });
        const response = applyLedgerMutationResponseSchema.parse({
          entry: { ...input.response.entry, brandId: input.brandId, userId: input.userId },
          balance: nextBalance
        });
        balances.set(key, nextBalance);
        ledger.set(key, [...(ledger.get(key) ?? []), response.entry]);
        idempotency.set(idKey, { fingerprint: input.fingerprint, response });
        return { kind: "applied", response };
      });
    },
    async pingDb() {},
    async close() {}
  };
}

function parseIsoDate(value: unknown) {
  return value instanceof Date ? value.toISOString() : new Date(String(value)).toISOString();
}

function rowToProgram(row: Record<string, unknown>): LoyaltyProgram {
  return loyaltyProgramSchema.parse({
    brandId: row.brand_id,
    enabled: row.enabled,
    participatingLocationIds: row.participating_location_ids ?? [],
    pointsPerDollar: row.points_per_dollar,
    redemptionCentsPerPoint: row.redemption_cents_per_point,
    minimumRedemptionPoints: row.minimum_redemption_points,
    maximumRedemptionPercent: row.maximum_redemption_percent,
    excludedItemIds: row.excluded_item_ids ?? [],
    version: row.version,
    updatedAt: parseIsoDate(row.updated_at)
  });
}

async function createPostgresRepository(connectionString: string): Promise<LoyaltyRepository> {
  const db = createPostgresDb(connectionString);
  await runMigrations(db);

  async function readProgram(brandId: string): Promise<LoyaltyProgram | undefined> {
    const result = await sql<Record<string, unknown>>`
      SELECT p.brand_id, p.enabled, p.points_per_dollar, p.redemption_cents_per_point,
        p.minimum_redemption_points, p.maximum_redemption_percent, p.excluded_item_ids,
        p.version, p.updated_at,
        COALESCE(ARRAY_AGG(pl.location_id ORDER BY pl.location_id)
          FILTER (WHERE pl.location_id IS NOT NULL), ARRAY[]::text[]) AS participating_location_ids
      FROM loyalty_programs p
      LEFT JOIN loyalty_program_locations pl ON pl.brand_id = p.brand_id
      WHERE p.brand_id = ${brandId}
      GROUP BY p.brand_id
    `.execute(db);
    return result.rows[0] ? rowToProgram(result.rows[0]) : undefined;
  }

  async function readBalance(brandId: string, userId: string): Promise<LoyaltyBalance> {
    await db.insertInto("loyalty_balances").values({
      brand_id: brandId,
      user_id: userId,
      available_points: 0,
      pending_points: 0,
      lifetime_earned: 0
    }).onConflict((conflict) => conflict.columns(["brand_id", "user_id"]).doNothing()).execute();
    const row = await db.selectFrom("loyalty_balances").selectAll()
      .where("brand_id", "=", brandId).where("user_id", "=", userId).executeTakeFirstOrThrow();
    return loyaltyBalanceSchema.parse({
      brandId: row.brand_id, userId: row.user_id,
      availablePoints: row.available_points,
      pendingPoints: row.pending_points,
      lifetimeEarned: row.lifetime_earned
    });
  }

  return {
    backend: "postgres",
    async getProgram(brandId) { return readProgram(brandId); },
    async getEarnEntry(brandId, userId, orderId) {
      const row = await db.selectFrom("loyalty_ledger_entries").selectAll()
        .where("brand_id", "=", brandId).where("user_id", "=", userId)
        .where("order_id", "=", orderId).where("type", "=", "EARN")
        .orderBy("created_at", "asc").executeTakeFirst();
      if (!row) return undefined;
      return loyaltyLedgerEntrySchema.parse({
        id: row.id, brandId: row.brand_id, userId: row.user_id,
        type: row.type, points: row.points, orderId: row.order_id ?? undefined,
        locationId: row.location_id, createdAt: parseIsoDate(row.created_at)
      });
    },
    async getLocationProgramContext(brandId, locationId, userId) {
      const result = await sql<Record<string, unknown>>`
        SELECT c.brand_id, l.location_id,
          COALESCE(p.enabled, FALSE) AS enabled,
          (pl.location_id IS NOT NULL) AS participating,
          COALESCE(p.points_per_dollar, 1) AS points_per_dollar,
          COALESCE(p.redemption_cents_per_point, 1) AS redemption_cents_per_point,
          COALESCE(p.minimum_redemption_points, 1) AS minimum_redemption_points,
          COALESCE(p.maximum_redemption_percent, 100) AS maximum_redemption_percent,
          COALESCE(p.excluded_item_ids, ARRAY[]::text[]) AS excluded_item_ids
        FROM catalog_client_locations l
        INNER JOIN catalog_clients c ON c.tenant_id = l.tenant_id AND c.brand_id = l.brand_id
        LEFT JOIN loyalty_programs p ON p.brand_id = c.brand_id
        LEFT JOIN loyalty_program_locations pl
          ON pl.brand_id = c.brand_id AND pl.location_id = l.location_id
        WHERE c.brand_id = ${brandId} AND l.location_id = ${locationId}
        LIMIT 1
      `.execute(db);
      const row = result.rows[0];
      if (!row) return undefined;
      const balance = userId ? await readBalance(brandId, userId) : undefined;
      return loyaltyProgramContextSchema.parse({
        brandId: row.brand_id,
        locationId: row.location_id,
        enabled: row.enabled,
        participating: row.participating,
        pointsPerDollar: row.points_per_dollar,
        redemptionCentsPerPoint: row.redemption_cents_per_point,
        minimumRedemptionPoints: row.minimum_redemption_points,
        maximumRedemptionPercent: row.maximum_redemption_percent,
        excludedItemIds: row.excluded_item_ids,
        balance
      });
    },
    async replaceProgram(input) {
      if (input.enabled && input.participatingLocationIds.length === 0) return undefined;
      const saved = await db.transaction().execute(async (trx) => {
        const canonical = await trx
          .selectFrom("catalog_client_locations as locations")
          .innerJoin("catalog_clients as clients", "clients.tenant_id", "locations.tenant_id")
          .select("locations.location_id")
          .where("clients.brand_id", "=", input.brandId)
          .where("locations.brand_id", "=", input.brandId)
          .where("locations.location_id", "in", input.participatingLocationIds.length ? input.participatingLocationIds : [""])
          .execute();
        const canonicalIds = new Set(canonical.map((row) => row.location_id));
        if (canonicalIds.size !== input.participatingLocationIds.length || input.participatingLocationIds.some((id) => !canonicalIds.has(id))) {
          return false;
        }

        await trx.insertInto("loyalty_programs").values({
          brand_id: input.brandId,
          enabled: input.enabled,
          points_per_dollar: input.pointsPerDollar,
          redemption_cents_per_point: input.redemptionCentsPerPoint,
          minimum_redemption_points: input.minimumRedemptionPoints,
          maximum_redemption_percent: input.maximumRedemptionPercent,
          excluded_item_ids: input.excludedItemIds,
          version: 1
        }).onConflict((conflict) => conflict.column("brand_id").doUpdateSet((eb) => ({
          enabled: eb.ref("excluded.enabled"),
          points_per_dollar: eb.ref("excluded.points_per_dollar"),
          redemption_cents_per_point: eb.ref("excluded.redemption_cents_per_point"),
          minimum_redemption_points: eb.ref("excluded.minimum_redemption_points"),
          maximum_redemption_percent: eb.ref("excluded.maximum_redemption_percent"),
          excluded_item_ids: eb.ref("excluded.excluded_item_ids"),
          version: sql`loyalty_programs.version + 1`,
          updated_at: new Date().toISOString()
        }))).execute();

        await trx.deleteFrom("loyalty_program_locations").where("brand_id", "=", input.brandId).execute();
        if (input.participatingLocationIds.length) {
          await trx.insertInto("loyalty_program_locations").values(
            input.participatingLocationIds.map((location_id) => ({ brand_id: input.brandId, location_id }))
          ).execute();
        }
        return true;
      });
      if (!saved) return undefined;
      return readProgram(input.brandId);
    },
    async getBalance(brandId, userId) { return readBalance(brandId, userId); },
    async getLedger(brandId, userId) {
      const rows = await db.selectFrom("loyalty_ledger_entries").selectAll()
        .where("brand_id", "=", brandId).where("user_id", "=", userId)
        .orderBy("created_at", "desc").execute();
      return rows.map((row) => loyaltyLedgerEntrySchema.parse({
        id: row.id, brandId: row.brand_id, userId: row.user_id,
        type: row.type, points: row.points,
        orderId: row.order_id ?? undefined,
        locationId: row.location_id,
        createdAt: parseIsoDate(row.created_at)
      }));
    },
    async applyMutation(input) {
      return db.transaction().execute(async (trx) => {
        await trx.insertInto("loyalty_balances").values({
          brand_id: input.brandId, user_id: input.userId,
          available_points: 0, pending_points: 0, lifetime_earned: 0
        }).onConflict((conflict) => conflict.columns(["brand_id", "user_id"]).doNothing()).execute();

        const row = await trx.selectFrom("loyalty_balances").selectAll()
          .where("brand_id", "=", input.brandId).where("user_id", "=", input.userId)
          .forUpdate().executeTakeFirstOrThrow();
        const existing = await trx.selectFrom("loyalty_idempotency_keys").selectAll()
          .where("brand_id", "=", input.brandId).where("user_id", "=", input.userId)
          .where("idempotency_key", "=", input.idempotencyKey).executeTakeFirst();
        if (existing) {
          const priorResponse = applyLedgerMutationResponseSchema.parse(existing.response_json);
          return existing.request_fingerprint === input.fingerprint
            ? { kind: "replay" as const, response: priorResponse }
            : { kind: "idempotency_conflict" as const };
        }

        const current = loyaltyBalanceSchema.parse({
          brandId: row.brand_id, userId: row.user_id,
          availablePoints: row.available_points, pendingPoints: row.pending_points,
          lifetimeEarned: row.lifetime_earned
        });
        const availablePoints = current.availablePoints + input.deltaPoints;
        if (availablePoints < 0) return { kind: "insufficient" as const, balance: current, requestedPoints: Math.abs(input.deltaPoints) };
        const response = applyLedgerMutationResponseSchema.parse({
          entry: input.response.entry,
          balance: { ...current, availablePoints, lifetimeEarned: current.lifetimeEarned + input.lifetimeEarnedDelta }
        });

        await trx.updateTable("loyalty_balances").set({
          available_points: response.balance.availablePoints,
          lifetime_earned: response.balance.lifetimeEarned,
          updated_at: new Date().toISOString()
        }).where("brand_id", "=", input.brandId).where("user_id", "=", input.userId).execute();
        await trx.insertInto("loyalty_ledger_entries").values({
          id: response.entry.id,
          brand_id: input.brandId,
          location_id: input.locationId,
          user_id: input.userId,
          type: response.entry.type,
          points: response.entry.points,
          order_id: response.entry.orderId ?? null,
          created_at: response.entry.createdAt
        }).execute();
        await trx.insertInto("loyalty_idempotency_keys").values({
          brand_id: input.brandId,
          location_id: input.locationId,
          user_id: input.userId,
          idempotency_key: input.idempotencyKey,
          request_fingerprint: input.fingerprint,
          response_json: response
        }).execute();
        return { kind: "applied" as const, response };
      });
    },
    async pingDb() { await sql`SELECT 1`.execute(db); },
    async close() { await db.destroy(); }
  };
}

async function createLoyaltyRepository(logger: FastifyBaseLogger): Promise<LoyaltyRepository> {
  const databaseUrl = getDatabaseUrl();
  const allowInMemory = allowsInMemoryPersistence();
  if (!databaseUrl) {
    if (!allowInMemory) throw buildPersistenceStartupError({ service: "loyalty", reason: "missing_database_url" });
    logger.warn({ backend: "memory" }, "loyalty persistence backend selected with explicit in-memory mode");
    return createInMemoryRepository();
  }
  try {
    const repository = await createPostgresRepository(databaseUrl);
    logger.info({ backend: "postgres" }, "loyalty persistence backend selected");
    return repository;
  } catch (error) {
    if (!allowInMemory) {
      logger.error({ error }, "failed to initialize postgres persistence");
      throw buildPersistenceStartupError({ service: "loyalty", reason: "postgres_initialization_failed" });
    }
    logger.error({ error }, "failed to initialize postgres persistence; using explicit in-memory fallback");
    return createInMemoryRepository();
  }
}

function toSortedLedger(entries: LoyaltyLedgerEntry[]) {
  return z.array(loyaltyLedgerEntrySchema).parse(
    [...entries].sort((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt))
  );
}

function toPositiveInteger(value: string | undefined, fallback: number) {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

async function requireMemberLocation(
  repository: LoyaltyRepository,
  brandId: string,
  locationId: string,
  request: FastifyRequest,
  reply: FastifyReply
) {
  const context = await repository.getLocationProgramContext(brandId, locationId);
  if (!context) {
    sendError(reply, {
      statusCode: 404,
      code: "LOYALTY_LOCATION_NOT_AVAILABLE",
      message: "Loyalty is not available for this location",
      requestId: request.id
    });
    return undefined;
  }
  return context;
}

export async function registerRoutes(app: FastifyInstance) {
  const gatewayApiToken = trimToUndefined(process.env.GATEWAY_INTERNAL_API_TOKEN);
  const loyaltyInternalApiToken = trimToUndefined(process.env.LOYALTY_INTERNAL_API_TOKEN);
  const repository = await createLoyaltyRepository(app.log);
  const rateWindow = toPositiveInteger(process.env.LOYALTY_RATE_LIMIT_WINDOW_MS, defaultRateLimitWindowMs);
  const mutationRateLimit = {
    max: toPositiveInteger(process.env.LOYALTY_RATE_LIMIT_MUTATION_MAX, defaultLoyaltyMutationRateLimitMax),
    timeWindow: rateWindow
  };

  app.addHook("onClose", async () => { await repository.close(); });
  app.get("/health", async () => ({ status: "ok", service: "loyalty" }));
  app.get("/ready", async (_request, reply) => {
    try {
      await repository.pingDb();
      return { status: "ready", service: "loyalty", persistence: repository.backend, environment: getPersistenceReadinessMetadata() };
    } catch {
      reply.status(503);
      return { status: "unavailable", service: "loyalty", error: "Database unavailable", environment: getPersistenceReadinessMetadata() };
    }
  });

  for (const kind of ["balance", "ledger"] as const) {
    app.get(`/v1/loyalty/${kind}`, async (request, reply) => {
      if (!authorize(request, reply, gatewayApiToken, "gateway")) return;
      const userId = resolveUserId(request, reply);
      if (!userId) return;
      const parsed = loyaltyLocationRequestSchema.safeParse(request.query);
      if (!parsed.success) {
        return sendError(reply, {
          statusCode: 400, code: "INVALID_LOYALTY_SCOPE",
          message: "brandId and locationId are required for loyalty reads",
          requestId: request.id, details: parsed.error.flatten()
        });
      }
      if (!await requireMemberLocation(repository, parsed.data.brandId, parsed.data.locationId, request, reply)) return;
      if (kind === "balance") return repository.getBalance(parsed.data.brandId, userId);
      return toSortedLedger(await repository.getLedger(parsed.data.brandId, userId));
    });
  }

  app.put("/v1/loyalty/internal/programs/:brandId", async (request, reply) => {
    if (!authorize(request, reply, loyaltyInternalApiToken, "internal")) return;
    const params = internalProgramParamsSchema.safeParse(request.params);
    const body = loyaltyProgramUpdateSchema.safeParse(request.body);
    if (!params.success || !body.success || body.data.brandId !== params.data?.brandId) {
      return sendError(reply, {
        statusCode: 400, code: "INVALID_LOYALTY_PROGRAM",
        message: "Loyalty program configuration is invalid",
        requestId: request.id,
        details: { params: params.success ? undefined : params.error.flatten(), body: body.success ? undefined : body.error.flatten() }
      });
    }
    const stored = await repository.replaceProgram(body.data);
    if (!stored) {
      return sendError(reply, {
        statusCode: 409, code: "LOYALTY_PROGRAM_LOCATION_MISMATCH",
        message: "Every participating location must belong to the configured brand",
        requestId: request.id
      });
    }
    return stored;
  });

  app.get("/v1/loyalty/internal/program-context", async (request, reply) => {
    if (!authorize(request, reply, loyaltyInternalApiToken, "internal")) return;
    const parsed = internalContextQuerySchema.safeParse(request.query);
    if (!parsed.success) {
      return sendError(reply, {
        statusCode: 400, code: "INVALID_LOYALTY_SCOPE",
        message: "brandId and locationId are required",
        requestId: request.id, details: parsed.error.flatten()
      });
    }
    const context = await repository.getLocationProgramContext(parsed.data.brandId, parsed.data.locationId, parsed.data.userId);
    if (!context) {
      return sendError(reply, {
        statusCode: 404, code: "LOYALTY_LOCATION_NOT_AVAILABLE",
        message: "Loyalty is not available for this location",
        requestId: request.id
      });
    }
    return loyaltyProgramContextSchema.parse(context);
  });

  app.get("/v1/loyalty/internal/order-earn", async (request, reply) => {
    if (!authorize(request, reply, loyaltyInternalApiToken, "internal")) return;
    const parsed = internalContextQuerySchema.extend({ orderId: z.string().uuid() }).safeParse(request.query);
    if (!parsed.success) {
      return sendError(reply, { statusCode: 400, code: "INVALID_LOYALTY_SCOPE", message: "brandId, locationId, userId, and orderId are required", requestId: request.id });
    }
    if (!await requireMemberLocation(repository, parsed.data.brandId, parsed.data.locationId, request, reply)) return;
    const entry = await repository.getEarnEntry(parsed.data.brandId, parsed.data.userId!, parsed.data.orderId);
    if (entry && entry.locationId !== parsed.data.locationId) {
      return sendError(reply, { statusCode: 409, code: "LOYALTY_ORDER_LOCATION_MISMATCH", message: "Loyalty order location is inconsistent", requestId: request.id });
    }
    return { entry: entry ?? null };
  });

  app.post("/v1/loyalty/internal/ledger/apply", { preHandler: app.rateLimit(mutationRateLimit) }, async (request, reply) => {
    if (!authorize(request, reply, loyaltyInternalApiToken, "internal")) return;
    const parsed = applyLedgerMutationSchema.safeParse(request.body);
    if (!parsed.success) {
      return sendError(reply, {
        statusCode: 400, code: "INVALID_LOYALTY_MUTATION",
        message: "Loyalty ledger mutation payload is invalid",
        requestId: request.id, details: parsed.error.flatten()
      });
    }
    const input = parsed.data;
    const context = await repository.getLocationProgramContext(input.brandId, input.locationId);
    if (!context) {
      return sendError(reply, {
        statusCode: 404, code: "LOYALTY_LOCATION_NOT_AVAILABLE",
        message: "Loyalty is not available for this location",
        requestId: request.id
      });
    }
    if ((input.type === "EARN" || input.type === "REDEEM") && (!context.enabled || !context.participating)) {
      return sendError(reply, {
        statusCode: 409, code: "LOYALTY_PROGRAM_UNAVAILABLE",
        message: "The loyalty program is not available at this location",
        requestId: request.id
      });
    }
    if (input.type === "REDEEM") {
      if (input.points < context.minimumRedemptionPoints || input.points * context.redemptionCentsPerPoint !== input.amountCents) {
        return sendError(reply, {
          statusCode: 409, code: "LOYALTY_REDEMPTION_RULE_MISMATCH",
          message: "Redemption does not match the current program rules",
          requestId: request.id
        });
      }
    }

    const deltaPoints = toDelta(input, context);
    if (input.type === "EARN" && input.points !== undefined && input.points !== earnPoints(input.amountCents, context.pointsPerDollar)) {
      return sendError(reply, {
        statusCode: 400, code: "LOYALTY_EARN_RULE_MISMATCH",
        message: "Earned points do not match the current program rule",
        requestId: request.id
      });
    }
    const now = input.occurredAt ?? new Date().toISOString();
    const entry = loyaltyLedgerEntrySchema.parse({
      id: randomUUID(), brandId: input.brandId, userId: input.userId,
      type: input.type, points: deltaPoints, orderId: input.orderId,
      locationId: input.locationId, createdAt: now
    });
    const currentBalance = await repository.getBalance(input.brandId, input.userId);
    const response = applyLedgerMutationResponseSchema.parse({ entry, balance: currentBalance });
    const outcome = await repository.applyMutation({
      brandId: input.brandId,
      userId: input.userId,
      locationId: input.locationId,
      idempotencyKey: input.idempotencyKey,
      fingerprint: fingerprint(input, deltaPoints),
      response,
      deltaPoints,
      lifetimeEarnedDelta: input.type === "EARN" ? deltaPoints : 0
    });
    if (outcome.kind === "idempotency_conflict") {
      return sendError(reply, {
        statusCode: 409, code: "IDEMPOTENCY_KEY_REUSE",
        message: "idempotencyKey was already used with a different loyalty transaction",
        requestId: request.id
      });
    }
    if (outcome.kind === "insufficient") {
      return sendError(reply, {
        statusCode: 409, code: "INSUFFICIENT_POINTS",
        message: "Redemption would result in a negative brand-wide point balance",
        requestId: request.id,
        details: { availablePoints: outcome.balance.availablePoints, requestedPoints: outcome.requestedPoints }
      });
    }
    return outcome.response;
  });

  app.post("/v1/loyalty/internal/ping", async (request, reply) => {
    if (!authorize(request, reply, loyaltyInternalApiToken, "internal")) return;
    return { service: "loyalty", accepted: true };
  });
}
