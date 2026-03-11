import type { FastifyBaseLogger } from "fastify";
import { orderQuoteSchema, orderSchema } from "@gazelle/contracts-orders";
import { createPostgresDb, ensurePersistenceTables, getDatabaseUrl } from "@gazelle/persistence";
import { z } from "zod";

type OrderQuote = z.output<typeof orderQuoteSchema>;
type Order = z.output<typeof orderSchema>;

type StoredOrderRecord = {
  order: Order;
  quoteId: string;
  userId: string;
  paymentId?: string;
  successfulCharge?: unknown;
  successfulRefund?: unknown;
};

type PersistedOrderRow = {
  order_id: string;
  user_id: string;
  quote_id: string;
  order_json: unknown;
  payment_id: string | null;
  successful_charge_json: unknown;
  successful_refund_json: unknown;
};

type PersistedQuoteRow = {
  quote_id: string;
  quote_hash: string;
  quote_json: unknown;
};

export type OrdersRepository = {
  backend: "memory" | "postgres";
  saveQuote(quote: OrderQuote): Promise<void>;
  getQuote(quoteId: string): Promise<OrderQuote | undefined>;
  createOrder(input: { order: Order; quoteId: string; userId: string }): Promise<void>;
  getOrder(orderId: string): Promise<Order | undefined>;
  listOrders(): Promise<Order[]>;
  getOrderForCreateIdempotency(quoteId: string, quoteHash: string): Promise<Order | undefined>;
  saveCreateOrderIdempotency(quoteId: string, quoteHash: string, orderId: string): Promise<void>;
  getPaymentOrderByIdempotency(orderId: string, idempotencyKey: string): Promise<Order | undefined>;
  savePaymentIdempotency(orderId: string, idempotencyKey: string): Promise<void>;
  getOrderQuote(orderId: string): Promise<OrderQuote | undefined>;
  getOrderUserId(orderId: string): Promise<string | undefined>;
  setOrderUserId(orderId: string, userId: string): Promise<void>;
  setPaymentId(orderId: string, paymentId: string): Promise<void>;
  getPaymentId(orderId: string): Promise<string | undefined>;
  setSuccessfulCharge(orderId: string, payload: unknown): Promise<void>;
  getSuccessfulCharge(orderId: string): Promise<unknown | undefined>;
  setSuccessfulRefund(orderId: string, payload: unknown): Promise<void>;
  getSuccessfulRefund(orderId: string): Promise<unknown | undefined>;
  updateOrder(orderId: string, order: Order): Promise<Order>;
  close(): Promise<void>;
};

function sortOrdersDescendingByCreatedAt(orders: Order[]) {
  return [...orders].sort((left, right) => {
    const leftCreatedAt = Date.parse(left.timeline[0]?.occurredAt ?? "1970-01-01T00:00:00.000Z");
    const rightCreatedAt = Date.parse(right.timeline[0]?.occurredAt ?? "1970-01-01T00:00:00.000Z");
    return rightCreatedAt - leftCreatedAt;
  });
}

function createInMemoryRepository(): OrdersRepository {
  const quotesById = new Map<string, OrderQuote>();
  const ordersById = new Map<string, StoredOrderRecord>();
  const createOrderIdempotency = new Map<string, string>();
  const paymentIdempotency = new Map<string, string>();

  return {
    backend: "memory",
    async saveQuote(quote) {
      quotesById.set(quote.quoteId, quote);
    },
    async getQuote(quoteId) {
      return quotesById.get(quoteId);
    },
    async createOrder({ order, quoteId, userId }) {
      ordersById.set(order.id, {
        order,
        quoteId,
        userId
      });
    },
    async getOrder(orderId) {
      return ordersById.get(orderId)?.order;
    },
    async listOrders() {
      const orders = [...ordersById.values()].map((entry) => entry.order);
      return sortOrdersDescendingByCreatedAt(orders);
    },
    async getOrderForCreateIdempotency(quoteId, quoteHash) {
      const orderId = createOrderIdempotency.get(`${quoteId}:${quoteHash}`);
      if (!orderId) {
        return undefined;
      }
      return ordersById.get(orderId)?.order;
    },
    async saveCreateOrderIdempotency(quoteId, quoteHash, orderId) {
      createOrderIdempotency.set(`${quoteId}:${quoteHash}`, orderId);
    },
    async getPaymentOrderByIdempotency(orderId, idempotencyKey) {
      const resolvedOrderId = paymentIdempotency.get(`${orderId}:${idempotencyKey}`);
      if (!resolvedOrderId) {
        return undefined;
      }
      return ordersById.get(resolvedOrderId)?.order;
    },
    async savePaymentIdempotency(orderId, idempotencyKey) {
      paymentIdempotency.set(`${orderId}:${idempotencyKey}`, orderId);
    },
    async getOrderQuote(orderId) {
      const record = ordersById.get(orderId);
      if (!record) {
        return undefined;
      }
      return quotesById.get(record.quoteId);
    },
    async getOrderUserId(orderId) {
      return ordersById.get(orderId)?.userId;
    },
    async setOrderUserId(orderId, userId) {
      const record = ordersById.get(orderId);
      if (!record) {
        return;
      }
      ordersById.set(orderId, {
        ...record,
        userId
      });
    },
    async setPaymentId(orderId, paymentId) {
      const record = ordersById.get(orderId);
      if (!record) {
        return;
      }
      ordersById.set(orderId, {
        ...record,
        paymentId
      });
    },
    async getPaymentId(orderId) {
      return ordersById.get(orderId)?.paymentId;
    },
    async setSuccessfulCharge(orderId, payload) {
      const record = ordersById.get(orderId);
      if (!record) {
        return;
      }
      ordersById.set(orderId, {
        ...record,
        successfulCharge: payload
      });
    },
    async getSuccessfulCharge(orderId) {
      return ordersById.get(orderId)?.successfulCharge;
    },
    async setSuccessfulRefund(orderId, payload) {
      const record = ordersById.get(orderId);
      if (!record) {
        return;
      }
      ordersById.set(orderId, {
        ...record,
        successfulRefund: payload
      });
    },
    async getSuccessfulRefund(orderId) {
      return ordersById.get(orderId)?.successfulRefund;
    },
    async updateOrder(orderId, order) {
      const record = ordersById.get(orderId);
      if (!record) {
        throw new Error("order not found while updating");
      }
      ordersById.set(orderId, {
        ...record,
        order
      });
      return order;
    },
    async close() {
      // no-op
    }
  };
}

async function createPostgresRepository(connectionString: string): Promise<OrdersRepository> {
  const db = createPostgresDb(connectionString);
  await ensurePersistenceTables(db);

  async function getPersistedOrder(orderId: string): Promise<PersistedOrderRow | undefined> {
    const row = await db.selectFrom("orders").selectAll().where("order_id", "=", orderId).executeTakeFirst();
    return row as PersistedOrderRow | undefined;
  }

  function parseOrder(payload: unknown): Order {
    return orderSchema.parse(payload);
  }

  function parseQuote(payload: unknown): OrderQuote {
    return orderQuoteSchema.parse(payload);
  }

  async function getQuoteById(quoteId: string): Promise<OrderQuote | undefined> {
    const row = await db.selectFrom("orders_quotes").selectAll().where("quote_id", "=", quoteId).executeTakeFirst();
    if (!row) {
      return undefined;
    }
    return parseQuote((row as PersistedQuoteRow).quote_json);
  }

  async function getOrderById(orderId: string): Promise<Order | undefined> {
    const row = await getPersistedOrder(orderId);
    if (!row) {
      return undefined;
    }
    return parseOrder(row.order_json);
  }

  return {
    backend: "postgres",
    async saveQuote(quote) {
      try {
        await db
          .insertInto("orders_quotes")
          .values({
            quote_id: quote.quoteId,
            quote_hash: quote.quoteHash,
            quote_json: quote
          })
          .execute();
        return;
      } catch {
        await db
          .updateTable("orders_quotes")
          .set({
            quote_hash: quote.quoteHash,
            quote_json: quote
          })
          .where("quote_id", "=", quote.quoteId)
          .execute();
      }
    },
    async getQuote(quoteId) {
      return getQuoteById(quoteId);
    },
    async createOrder({ order, quoteId, userId }) {
      await db
        .insertInto("orders")
        .values({
          order_id: order.id,
          user_id: userId,
          quote_id: quoteId,
          order_json: order
        })
        .execute();
    },
    async getOrder(orderId) {
      return getOrderById(orderId);
    },
    async listOrders() {
      const rows = await db.selectFrom("orders").selectAll().orderBy("created_at", "desc").execute();
      return rows.map((row) => parseOrder((row as PersistedOrderRow).order_json));
    },
    async getOrderForCreateIdempotency(quoteId, quoteHash) {
      const row = await db
        .selectFrom("orders_create_idempotency")
        .selectAll()
        .where("quote_id", "=", quoteId)
        .where("quote_hash", "=", quoteHash)
        .executeTakeFirst();

      if (!row) {
        return undefined;
      }

      return getOrderById(row.order_id);
    },
    async saveCreateOrderIdempotency(quoteId, quoteHash, orderId) {
      try {
        await db
          .insertInto("orders_create_idempotency")
          .values({
            quote_id: quoteId,
            quote_hash: quoteHash,
            order_id: orderId
          })
          .execute();
      } catch {
        // ignore duplicate key races
      }
    },
    async getPaymentOrderByIdempotency(orderId, idempotencyKey) {
      const row = await db
        .selectFrom("orders_payment_idempotency")
        .selectAll()
        .where("order_id", "=", orderId)
        .where("idempotency_key", "=", idempotencyKey)
        .executeTakeFirst();

      if (!row) {
        return undefined;
      }

      return getOrderById(row.order_id);
    },
    async savePaymentIdempotency(orderId, idempotencyKey) {
      try {
        await db
          .insertInto("orders_payment_idempotency")
          .values({
            order_id: orderId,
            idempotency_key: idempotencyKey
          })
          .execute();
      } catch {
        // ignore duplicate key races
      }
    },
    async getOrderQuote(orderId) {
      const orderRow = await getPersistedOrder(orderId);
      if (!orderRow) {
        return undefined;
      }
      return getQuoteById(orderRow.quote_id);
    },
    async getOrderUserId(orderId) {
      const row = await getPersistedOrder(orderId);
      return row?.user_id;
    },
    async setOrderUserId(orderId, userId) {
      await db
        .updateTable("orders")
        .set({
          user_id: userId,
          updated_at: new Date().toISOString()
        })
        .where("order_id", "=", orderId)
        .execute();
    },
    async setPaymentId(orderId, paymentId) {
      await db
        .updateTable("orders")
        .set({
          payment_id: paymentId,
          updated_at: new Date().toISOString()
        })
        .where("order_id", "=", orderId)
        .execute();
    },
    async getPaymentId(orderId) {
      const row = await getPersistedOrder(orderId);
      return row?.payment_id ?? undefined;
    },
    async setSuccessfulCharge(orderId, payload) {
      await db
        .updateTable("orders")
        .set({
          successful_charge_json: payload,
          updated_at: new Date().toISOString()
        })
        .where("order_id", "=", orderId)
        .execute();
    },
    async getSuccessfulCharge(orderId) {
      const row = await getPersistedOrder(orderId);
      return row?.successful_charge_json === null ? undefined : row?.successful_charge_json;
    },
    async setSuccessfulRefund(orderId, payload) {
      await db
        .updateTable("orders")
        .set({
          successful_refund_json: payload,
          updated_at: new Date().toISOString()
        })
        .where("order_id", "=", orderId)
        .execute();
    },
    async getSuccessfulRefund(orderId) {
      const row = await getPersistedOrder(orderId);
      return row?.successful_refund_json === null ? undefined : row?.successful_refund_json;
    },
    async updateOrder(orderId, order) {
      const updated = await db
        .updateTable("orders")
        .set({
          order_json: order,
          updated_at: new Date().toISOString()
        })
        .where("order_id", "=", orderId)
        .executeTakeFirst();

      if (Number(updated.numUpdatedRows ?? 0) === 0) {
        throw new Error("order not found while updating");
      }

      return order;
    },
    async close() {
      await db.destroy();
    }
  };
}

export async function createOrdersRepository(logger: FastifyBaseLogger): Promise<OrdersRepository> {
  const databaseUrl = getDatabaseUrl();
  if (!databaseUrl) {
    logger.info({ backend: "memory" }, "orders persistence backend selected");
    return createInMemoryRepository();
  }

  try {
    const repository = await createPostgresRepository(databaseUrl);
    logger.info({ backend: "postgres" }, "orders persistence backend selected");
    return repository;
  } catch (error) {
    logger.error({ error }, "failed to initialize postgres persistence; falling back to in-memory");
    return createInMemoryRepository();
  }
}
