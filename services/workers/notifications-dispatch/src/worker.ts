import { z } from "zod";

export type NotificationsDispatchConfig = {
  notificationsBaseUrl: string;
  internalApiToken: string;
  intervalMs: number;
  batchSize: number;
};

export type NotificationsDispatchResult = {
  processed: number;
  dispatched: number;
  retried: number;
  failed: number;
};

type Logger = Pick<Console, "info" | "warn" | "error">;

export type NotificationsDispatchRuntime = {
  processOutbox: (baseUrl: string, batchSize: number, internalApiToken: string) => Promise<NotificationsDispatchResult>;
  processReceipts: (baseUrl: string, batchSize: number, internalApiToken: string) => Promise<{ processed: number; delivered: number; failed: number; expired: number; unresolved: number }>;
  logger: Logger;
  setTimeoutFn: (callback: () => void, delayMs: number) => ReturnType<typeof setTimeout>;
  clearTimeoutFn: (handle: ReturnType<typeof setTimeout>) => void;
};

export type NotificationsDispatchLoopHandle = {
  stop: () => void;
};

const outboxProcessResponseSchema = z.object({
  processed: z.number().int().nonnegative(),
  dispatched: z.number().int().nonnegative(),
  retried: z.number().int().nonnegative(),
  failed: z.number().int().nonnegative()
});

const defaultNotificationsBaseUrl = "http://127.0.0.1:3005";
const defaultIntervalMs = 5_000;
const defaultBatchSize = 50;

function trimToUndefined(value: string | undefined) {
  const next = value?.trim();
  return next && next.length > 0 ? next : undefined;
}

function parseIntegerEnv(input: {
  name: string;
  value: string | undefined;
  fallback: number;
  min: number;
}): number {
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

export function buildNotificationsDispatchConfig(env: NodeJS.ProcessEnv = process.env): NotificationsDispatchConfig {
  const notificationsBaseUrl = env.NOTIFICATIONS_SERVICE_BASE_URL ?? defaultNotificationsBaseUrl;
  const internalApiToken = trimToUndefined(env.NOTIFICATIONS_INTERNAL_API_TOKEN);
  new URL(notificationsBaseUrl);
  if (!internalApiToken) {
    throw new Error("NOTIFICATIONS_INTERNAL_API_TOKEN must be set");
  }

  return {
    notificationsBaseUrl,
    internalApiToken,
    intervalMs: parseIntegerEnv({
      name: "NOTIFICATIONS_DISPATCH_INTERVAL_MS",
      value: env.NOTIFICATIONS_DISPATCH_INTERVAL_MS,
      fallback: defaultIntervalMs,
      min: 1
    }),
    batchSize: parseIntegerEnv({
      name: "NOTIFICATIONS_DISPATCH_BATCH_SIZE",
      value: env.NOTIFICATIONS_DISPATCH_BATCH_SIZE,
      fallback: defaultBatchSize,
      min: 1
    })
  };
}

export function createNotificationsDispatchRuntime(
  logger: Logger = console
): NotificationsDispatchRuntime {
  return {
    processOutbox: async (baseUrl, batchSize, internalApiToken) => {
      const response = await fetch(`${baseUrl}/v1/notifications/internal/outbox/process`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-internal-token": internalApiToken
        },
        body: JSON.stringify({ batchSize })
      });

      if (!response.ok) {
        throw new Error(`notifications outbox process request failed with status ${response.status}`);
      }

      const payload = await response.json();
      return outboxProcessResponseSchema.parse(payload);
    },
    processReceipts: async (baseUrl, batchSize, internalApiToken) => {
      const response = await fetch(`${baseUrl}/v1/notifications/internal/receipts/process`, {
        method: "POST", headers: { "content-type": "application/json", "x-internal-token": internalApiToken },
        body: JSON.stringify({ batchSize })
      });
      if (!response.ok) throw new Error(`notifications receipt process request failed with status ${response.status}`);
      return z.object({ processed: z.number(), delivered: z.number(), failed: z.number(),
        expired: z.number(), unresolved: z.number() }).parse(await response.json());
    },
    logger,
    setTimeoutFn: (callback, delayMs) => setTimeout(callback, delayMs),
    clearTimeoutFn: (handle) => clearTimeout(handle)
  };
}

export async function processOutboxBatch(
  config: NotificationsDispatchConfig,
  runtime: Pick<NotificationsDispatchRuntime, "processOutbox" | "logger">
) {
  const result = await runtime.processOutbox(config.notificationsBaseUrl, config.batchSize, config.internalApiToken);
  runtime.logger.info(
    `[notifications-dispatch] processed=${result.processed} dispatched=${result.dispatched} retried=${result.retried} failed=${result.failed}`
  );
  return result;
}

export function startNotificationsDispatchLoop(input: {
  intervalMs: number;
  runCycle: () => Promise<void>;
  setTimeoutFn?: (callback: () => void, delayMs: number) => ReturnType<typeof setTimeout>;
  clearTimeoutFn?: (handle: ReturnType<typeof setTimeout>) => void;
}): NotificationsDispatchLoopHandle {
  const setTimeoutFn = input.setTimeoutFn ?? ((callback, delayMs) => setTimeout(callback, delayMs));
  const clearTimeoutFn = input.clearTimeoutFn ?? ((handle) => clearTimeout(handle));

  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | undefined;

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

export function startNotificationsDispatchWorker(
  config: NotificationsDispatchConfig,
  runtime: NotificationsDispatchRuntime
): NotificationsDispatchLoopHandle {
  return startNotificationsDispatchLoop({
    intervalMs: config.intervalMs,
    setTimeoutFn: runtime.setTimeoutFn,
    clearTimeoutFn: runtime.clearTimeoutFn,
    runCycle: async () => {
      try {
        await processOutboxBatch(config, runtime);
        const receipts = await runtime.processReceipts(config.notificationsBaseUrl, config.batchSize, config.internalApiToken);
        runtime.logger.info(`[notifications-dispatch] receipts processed=${receipts.processed} delivered=${receipts.delivered} failed=${receipts.failed} expired=${receipts.expired} unresolved=${receipts.unresolved}`);
      } catch (error) {
        runtime.logger.error("[notifications-dispatch] cycle failed", error);
      }
    }
  });
}
