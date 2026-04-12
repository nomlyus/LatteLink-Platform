import { orderSchema, type Order } from "@lattelink/contracts-orders";
import { GazelleApiClient } from "@lattelink/sdk-mobile";
import { z } from "zod";

const DEFAULT_LOCAL_API_BASE_URL = "http://127.0.0.1:8080/v1";
const DEFAULT_LOCAL_CATALOG_API_BASE_URL = "http://127.0.0.1:3002/v1";
const fallbackOrderUpdatePollMs = 5_000;

export const API_BASE_URL = process.env.EXPO_PUBLIC_API_BASE_URL ?? DEFAULT_LOCAL_API_BASE_URL;
export const CATALOG_API_BASE_URL =
  process.env.EXPO_PUBLIC_CATALOG_SERVICE_BASE_URL ??
  process.env.EXPO_PUBLIC_CATALOG_API_BASE_URL ??
  DEFAULT_LOCAL_CATALOG_API_BASE_URL;

type OrderUpdateHandler = (order: Order) => void;
type OrderUpdateErrorHandler = (error: unknown) => void;
const cloverCardEntryConfigSchema = z.object({
  enabled: z.boolean(),
  providerMode: z.enum(["simulated", "live"]),
  environment: z.enum(["sandbox", "production"]).optional(),
  tokenizeEndpoint: z.string().url().optional(),
  apiAccessKey: z.string().min(1).optional(),
  merchantId: z.string().min(1).optional()
});
export type CloverCardEntryConfig = z.output<typeof cloverCardEntryConfigSchema>;

type MobileApiClient = GazelleApiClient & {
  getCloverCardEntryConfig(): Promise<CloverCardEntryConfig>;
  subscribeToOrderUpdates(
    orderId: string,
    onUpdate: OrderUpdateHandler,
    onError?: OrderUpdateErrorHandler
  ): () => void;
};

function isAbortError(error: unknown) {
  if (!error || typeof error !== "object") {
    return false;
  }

  const candidate = error as { name?: string; code?: string; message?: string };
  if (candidate.name === "AbortError" || candidate.code === "ABORT_ERR") {
    return true;
  }

  return typeof candidate.message === "string" && candidate.message.toLowerCase().includes("aborted");
}

function parseSseEventChunks(buffer: string) {
  const chunks = buffer.split(/\r?\n\r?\n/);
  return {
    completeEvents: chunks.slice(0, -1),
    remainder: chunks.at(-1) ?? ""
  };
}

function readSseEventData(block: string) {
  const dataLines = block
    .split(/\r?\n/)
    .filter((line) => line.startsWith("data:"))
    .map((line) => line.slice("data:".length).trimStart());

  if (dataLines.length === 0) {
    return undefined;
  }

  return dataLines.join("\n");
}

async function streamOrderUpdates(params: {
  accessToken: string;
  orderId: string;
  onUpdate: OrderUpdateHandler;
  signal: AbortSignal;
}) {
  const response = await fetch(`${API_BASE_URL}/orders/${params.orderId}/stream`, {
    method: "GET",
    headers: {
      Accept: "text/event-stream",
      Authorization: `Bearer ${params.accessToken}`
    },
    signal: params.signal
  });

  if (!response.ok) {
    throw new Error(`Order stream request failed (${response.status})`);
  }

  const reader = response.body?.getReader();
  if (!reader || typeof TextDecoder !== "function") {
    throw new Error("Authenticated SSE streaming is not available in this runtime");
  }

  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { value, done } = await reader.read();
    if (done) {
      break;
    }

    buffer += decoder.decode(value, { stream: true });
    const { completeEvents, remainder } = parseSseEventChunks(buffer);
    buffer = remainder;

    for (const eventBlock of completeEvents) {
      const data = readSseEventData(eventBlock);
      if (!data) {
        continue;
      }

      params.onUpdate(orderSchema.parse(JSON.parse(data)));
    }
  }

  const trailingData = readSseEventData(buffer);
  if (trailingData) {
    params.onUpdate(orderSchema.parse(JSON.parse(trailingData)));
  }
}

function startOrderPolling(params: {
  client: GazelleApiClient;
  orderId: string;
  onUpdate: OrderUpdateHandler;
  onError?: OrderUpdateErrorHandler;
}) {
  let disposed = false;

  const poll = async () => {
    if (disposed) {
      return;
    }

    try {
      params.onUpdate(await params.client.getOrder(params.orderId));
    } catch (error) {
      if (!disposed) {
        params.onError?.(error);
      }
    }
  };

  const intervalHandle = setInterval(() => {
    void poll();
  }, fallbackOrderUpdatePollMs);

  return () => {
    disposed = true;
    clearInterval(intervalHandle);
  };
}

const baseApiClient = new GazelleApiClient({
  baseUrl: API_BASE_URL
});
let currentAccessToken: string | undefined;
const originalSetAccessToken = baseApiClient.setAccessToken.bind(baseApiClient);

baseApiClient.setAccessToken = (token?: string) => {
  currentAccessToken = token;
  originalSetAccessToken(token);
};

export const apiClient = Object.assign(baseApiClient, {
  async getCloverCardEntryConfig() {
    if (!currentAccessToken) {
      throw new Error("Sign in again to refresh payment configuration.");
    }

    const response = await fetch(`${API_BASE_URL}/payments/clover/card-entry-config`, {
      method: "GET",
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${currentAccessToken}`
      }
    });

    if (!response.ok) {
      throw new Error(`Card configuration request failed (${response.status})`);
    }

    return cloverCardEntryConfigSchema.parse(JSON.parse(await response.text()));
  },
  subscribeToOrderUpdates(orderId: string, onUpdate: OrderUpdateHandler, onError?: OrderUpdateErrorHandler) {
    let disposed = false;
    let fallbackCleanup = () => {};
    const abortController = new AbortController();

    const stopFallback = () => {
      fallbackCleanup();
      fallbackCleanup = () => {};
    };

    const startFallback = () => {
      if (disposed) {
        return;
      }

      stopFallback();
      fallbackCleanup = startOrderPolling({
        client: baseApiClient,
        orderId,
        onUpdate,
        onError
      });
    };

    if (
      typeof fetch !== "function" ||
      typeof TextDecoder !== "function" ||
      typeof currentAccessToken !== "string" ||
      currentAccessToken.length === 0
    ) {
      // TODO: Upgrade to native authenticated SSE once the Expo runtime reliably supports it everywhere we ship.
      startFallback();

      return () => {
        disposed = true;
        abortController.abort();
        stopFallback();
      };
    }

    const streamAccessToken = currentAccessToken;

    void (async () => {
      try {
        await streamOrderUpdates({
          accessToken: streamAccessToken,
          orderId,
          onUpdate,
          signal: abortController.signal
        });
      } catch (error) {
        if (disposed || isAbortError(error)) {
          return;
        }

        onError?.(error);
        startFallback();
      }
    })();

    return () => {
      disposed = true;
      abortController.abort();
      stopFallback();
    };
  }
}) as MobileApiClient;

export const catalogApiClient = new GazelleApiClient({
  baseUrl: CATALOG_API_BASE_URL
});
