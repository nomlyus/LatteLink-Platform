import { orderSchema } from "@lattelink/contracts-orders";
import { GazelleApiClient } from "@lattelink/sdk-mobile";
import { z } from "zod";

export const fallbackOrderUpdatePollMs = 5_000;

export const ordersStreamSnapshotSchema = z.object({
  type: z.literal("snapshot"),
  orders: z.array(orderSchema)
});

export const ordersStreamUpdateSchema = z.object({
  type: z.literal("order_update"),
  order: orderSchema
});

export type OrdersStreamEvent = z.output<typeof ordersStreamSnapshotSchema> | z.output<typeof ordersStreamUpdateSchema>;

export type OrdersStreamEventHandler = (event: OrdersStreamEvent) => void;

export type OrdersStreamErrorHandler = (error: unknown) => void;

export function isAbortError(error: unknown) {
  if (!error || typeof error !== "object") {
    return false;
  }

  const candidate = error as { name?: string; code?: string; message?: string };
  if (candidate.name === "AbortError" || candidate.code === "ABORT_ERR") {
    return true;
  }

  return typeof candidate.message === "string" && candidate.message.toLowerCase().includes("aborted");
}

export function parseSseEventChunks(buffer: string) {
  const chunks = buffer.split(/\r?\n\r?\n/);
  return {
    completeEvents: chunks.slice(0, -1),
    remainder: chunks.at(-1) ?? ""
  };
}

export function readSseEventData(block: string) {
  const dataLines = block
    .split(/\r?\n/)
    .filter((line) => line.startsWith("data:"))
    .map((line) => line.slice("data:".length).trimStart());

  if (dataLines.length === 0) {
    return undefined;
  }

  return dataLines.join("\n");
}

export function startOrdersPolling(params: {
  client: Pick<GazelleApiClient, "listOrders">;
  onEvent: OrdersStreamEventHandler;
  onError?: OrdersStreamErrorHandler;
}) {
  let disposed = false;
  let inFlight = false;

  const poll = async () => {
    if (disposed || inFlight) {
      return;
    }

    inFlight = true;
    try {
      const orders = orderSchema.array().parse(await params.client.listOrders());
      if (disposed) return;
      params.onEvent({
        type: "snapshot",
        orders
      });
    } catch (error) {
      if (!disposed) {
        params.onError?.(error);
      }
    } finally {
      inFlight = false;
    }
  };

  void poll();
  const intervalHandle = setInterval(() => {
    void poll();
  }, fallbackOrderUpdatePollMs);

  return () => {
    disposed = true;
    clearInterval(intervalHandle);
  };
}
