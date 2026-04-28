import { orderSchema } from "@lattelink/contracts-orders";
import {
  GazelleApiClient,
  UNABLE_TO_REACH_BACKEND_MESSAGE,
  isBackendReachabilityError
} from "@lattelink/sdk-mobile";
import { z } from "zod";

const fallbackOrderUpdatePollMs = 5_000;

function normalizeApiBaseUrl(value: string | undefined | null) {
  return value?.trim().replace(/\/+$/, "") ?? "";
}

type MobileRuntimeVariant = "beta" | "production" | null;

const betaApiHostname = "api-dev.nomly.us";
const productionApiHostname = "api.nomly.us";
const localApiHostnames = new Set(["localhost", "127.0.0.1", "0.0.0.0"]);

function readBundleIdentifier() {
  return process.env.EXPO_PUBLIC_IOS_BUNDLE_IDENTIFIER?.trim() ?? "";
}

function resolveRuntimeVariant(): MobileRuntimeVariant {
  const appVariant = process.env.EXPO_PUBLIC_APP_VARIANT?.trim();
  const bundleIdentifier = readBundleIdentifier();

  if (appVariant === "beta" || bundleIdentifier.endsWith(".beta")) {
    return "beta";
  }

  if (appVariant === "production" || (bundleIdentifier.length > 0 && !bundleIdentifier.endsWith(".beta"))) {
    return "production";
  }

  return null;
}

function isLocalDevelopmentHostname(hostname: string) {
  return localApiHostnames.has(hostname) || hostname.endsWith(".local");
}

function resolveApiEnvironmentError(baseUrl: string, label: string) {
  const normalizedBaseUrl = normalizeApiBaseUrl(baseUrl);
  if (!normalizedBaseUrl) {
    return null;
  }

  let parsed: URL;
  try {
    parsed = new URL(normalizedBaseUrl);
  } catch {
    return `${label} must be a valid URL.`;
  }

  const runtimeVariant = resolveRuntimeVariant();
  const hostname = parsed.hostname;
  const allowLocalDevelopment = process.env.NODE_ENV !== "production";

  if (allowLocalDevelopment && isLocalDevelopmentHostname(hostname)) {
    return null;
  }

  if (runtimeVariant === "beta" && hostname !== betaApiHostname) {
    return `Beta mobile builds must use ${betaApiHostname}, not ${hostname}.`;
  }

  if (runtimeVariant === "production" && hostname !== productionApiHostname) {
    return `Production mobile builds must use ${productionApiHostname}, not ${hostname}.`;
  }

  return null;
}

function resolveRequiredApiEnvironmentError(baseUrl: string, label: string) {
  const normalizedBaseUrl = normalizeApiBaseUrl(baseUrl);
  if (!normalizedBaseUrl) {
    return `${label} is not configured.`;
  }

  return resolveApiEnvironmentError(normalizedBaseUrl, label);
}

function resolveGuardedApiBaseUrl(baseUrl: string | undefined, label: string) {
  const normalizedBaseUrl = normalizeApiBaseUrl(baseUrl);
  const error =
    label === "EXPO_PUBLIC_API_BASE_URL"
      ? resolveRequiredApiEnvironmentError(normalizedBaseUrl, label)
      : resolveApiEnvironmentError(normalizedBaseUrl, label);
  if (error) {
    console.error(`[mobile-api-config] ${error}`);
    return "";
  }

  return normalizedBaseUrl;
}

const apiBaseUrlEnvironmentError = resolveRequiredApiEnvironmentError(
  normalizeApiBaseUrl(process.env.EXPO_PUBLIC_API_BASE_URL),
  "EXPO_PUBLIC_API_BASE_URL"
);
const catalogServiceBaseUrlEnvironmentError = resolveApiEnvironmentError(
  normalizeApiBaseUrl(process.env.EXPO_PUBLIC_CATALOG_SERVICE_BASE_URL),
  "EXPO_PUBLIC_CATALOG_SERVICE_BASE_URL"
);
const catalogApiBaseUrlEnvironmentError = resolveApiEnvironmentError(
  normalizeApiBaseUrl(process.env.EXPO_PUBLIC_CATALOG_API_BASE_URL),
  "EXPO_PUBLIC_CATALOG_API_BASE_URL"
);

function toReachabilityError(error: unknown) {
  if (isBackendReachabilityError(error)) {
    return error;
  }

  return new Error(UNABLE_TO_REACH_BACKEND_MESSAGE, {
    cause: error instanceof Error ? error : undefined
  });
}

function resolveConfiguredApiUrl(baseUrl: string, path: string) {
  const normalizedBaseUrl = normalizeApiBaseUrl(baseUrl);
  if (!normalizedBaseUrl) {
    throw toReachabilityError(new Error("EXPO_PUBLIC_API_BASE_URL is not configured."));
  }

  return `${normalizedBaseUrl}${path}`;
}

export const API_BASE_URL = resolveGuardedApiBaseUrl(process.env.EXPO_PUBLIC_API_BASE_URL, "EXPO_PUBLIC_API_BASE_URL");
export { UNABLE_TO_REACH_BACKEND_MESSAGE, isBackendReachabilityError };
export const CATALOG_API_BASE_URL =
  resolveGuardedApiBaseUrl(process.env.EXPO_PUBLIC_CATALOG_SERVICE_BASE_URL, "EXPO_PUBLIC_CATALOG_SERVICE_BASE_URL") ||
  resolveGuardedApiBaseUrl(process.env.EXPO_PUBLIC_CATALOG_API_BASE_URL, "EXPO_PUBLIC_CATALOG_API_BASE_URL") ||
  API_BASE_URL;

export const MOBILE_API_ENVIRONMENT = {
  variant: resolveRuntimeVariant(),
  bundleIdentifier: readBundleIdentifier(),
  apiBaseUrl: API_BASE_URL,
  catalogApiBaseUrl: CATALOG_API_BASE_URL,
  locationId: process.env.EXPO_PUBLIC_LOCATION_ID?.trim() ?? "",
  apiConfigurationError:
    apiBaseUrlEnvironmentError ?? catalogServiceBaseUrlEnvironmentError ?? catalogApiBaseUrlEnvironmentError
};

export const MOBILE_LOCATION_ID = MOBILE_API_ENVIRONMENT.locationId;

const ordersStreamSnapshotSchema = z.object({
  type: z.literal("snapshot"),
  orders: z.array(orderSchema)
});
const ordersStreamUpdateSchema = z.object({
  type: z.literal("order_update"),
  order: orderSchema
});
export type OrdersStreamEvent =
  | z.output<typeof ordersStreamSnapshotSchema>
  | z.output<typeof ordersStreamUpdateSchema>;
type OrdersStreamEventHandler = (event: OrdersStreamEvent) => void;
type OrdersStreamErrorHandler = (error: unknown) => void;
type MobileApiClient = GazelleApiClient & {
  subscribeToOrders(
    onEvent: OrdersStreamEventHandler,
    onError?: OrdersStreamErrorHandler
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

async function streamOrders(params: {
  accessToken: string;
  onEvent: OrdersStreamEventHandler;
  signal: AbortSignal;
}) {
  let response: Response;

  try {
    response = await fetch(resolveConfiguredApiUrl(API_BASE_URL, "/orders/stream"), {
      method: "GET",
      headers: {
        Accept: "text/event-stream",
        Authorization: `Bearer ${params.accessToken}`
      },
      signal: params.signal
    });
  } catch (error) {
    throw toReachabilityError(error);
  }

  if (!response.ok) {
    throw new Error(`Orders stream request failed (${response.status})`);
  }

  const reader = response.body?.getReader();
  if (!reader || typeof TextDecoder !== "function") {
    throw new Error("Authenticated SSE streaming is not available in this runtime");
  }

  const decoder = new TextDecoder();
  let buffer = "";

  const emit = (raw: string) => {
    const parsed = JSON.parse(raw);
    const snapshot = ordersStreamSnapshotSchema.safeParse(parsed);
    if (snapshot.success) {
      params.onEvent(snapshot.data);
      return;
    }

    params.onEvent(ordersStreamUpdateSchema.parse(parsed));
  };

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

      emit(data);
    }
  }

  const trailingData = readSseEventData(buffer);
  if (trailingData) {
    emit(trailingData);
  }
}

function startOrdersPolling(params: {
  client: GazelleApiClient;
  onEvent: OrdersStreamEventHandler;
  onError?: OrdersStreamErrorHandler;
}) {
  let disposed = false;

  const poll = async () => {
    if (disposed) {
      return;
    }

    try {
      params.onEvent({
        type: "snapshot",
        orders: orderSchema.array().parse(await params.client.listOrders())
      });
    } catch (error) {
      if (!disposed) {
        params.onError?.(error);
      }
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
  subscribeToOrders(onEvent: OrdersStreamEventHandler, onError?: OrdersStreamErrorHandler) {
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
      fallbackCleanup = startOrdersPolling({
        client: baseApiClient,
        onEvent,
        onError
      });
    };

    if (
      typeof fetch !== "function" ||
      typeof TextDecoder !== "function" ||
      typeof currentAccessToken !== "string" ||
      currentAccessToken.length === 0
    ) {
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
        await streamOrders({
          accessToken: streamAccessToken,
          onEvent,
          signal: abortController.signal
        });
        if (disposed) {
          return;
        }

        onError?.(new Error("Orders stream closed"));
        startFallback();
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
