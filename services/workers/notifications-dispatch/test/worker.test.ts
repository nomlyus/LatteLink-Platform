import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildNotificationsDispatchConfig,
  processOutboxBatch,
  startNotificationsDispatchWorker,
  startNotificationsDispatchLoop,
  type NotificationsDispatchConfig,
  type NotificationsDispatchRuntime
} from "../src/worker.js";

const baseConfig: NotificationsDispatchConfig = {
  notificationsBaseUrl: "http://127.0.0.1:3005",
  internalApiToken: "notifications-internal-token",
  intervalMs: 5_000,
  batchSize: 25
};

function buildRuntime(overrides: Partial<NotificationsDispatchRuntime> = {}): NotificationsDispatchRuntime {
  return {
    processOutbox: async () => ({
      processed: 1,
      dispatched: 1,
      retried: 0,
      failed: 0
    }),
    processReceipts: async () => ({ processed: 0, providerAccepted: 0, failed: 0, expired: 0, unresolved: 0 }),
    logger: {
      info: () => undefined,
      warn: () => undefined,
      error: () => undefined
    },
    setTimeoutFn: (callback, delayMs) => setTimeout(callback, delayMs),
    clearTimeoutFn: (handle) => clearTimeout(handle),
    ...overrides
  };
}

describe("notifications dispatch worker", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("builds config from environment defaults", () => {
    const config = buildNotificationsDispatchConfig({
      NOTIFICATIONS_INTERNAL_API_TOKEN: "notifications-internal-token"
    } as NodeJS.ProcessEnv);

    expect(config.notificationsBaseUrl).toBe("http://127.0.0.1:3005");
    expect(config.internalApiToken).toBe("notifications-internal-token");
    expect(config.intervalMs).toBe(5000);
    expect(config.batchSize).toBe(50);
  });

  it("requires an internal notifications token in config", () => {
    expect(() => buildNotificationsDispatchConfig({} as NodeJS.ProcessEnv)).toThrow(
      "NOTIFICATIONS_INTERNAL_API_TOKEN must be set"
    );
  });

  it("processes an outbox batch through runtime", async () => {
    const processOutbox = vi.fn(async () => ({
      processed: 3,
      dispatched: 2,
      retried: 1,
      failed: 0
    }));
    const runtime = buildRuntime({
      processOutbox
    });

    const result = await processOutboxBatch(baseConfig, runtime);

    expect(result).toEqual({
      processed: 3,
      dispatched: 2,
      retried: 1,
      failed: 0
    });
    expect(processOutbox).toHaveBeenCalledWith(
      baseConfig.notificationsBaseUrl,
      baseConfig.batchSize,
      baseConfig.internalApiToken
    );
  });

  it("runs loop immediately, reschedules, and stops cleanly", async () => {
    vi.useFakeTimers();
    const runCycle = vi.fn(async () => undefined);
    const handle = startNotificationsDispatchLoop({
      intervalMs: 1000,
      runCycle
    });

    await Promise.resolve();
    expect(runCycle).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(1000);
    expect(runCycle).toHaveBeenCalledTimes(2);

    handle.stop();
    await vi.advanceTimersByTimeAsync(5000);
    expect(runCycle).toHaveBeenCalledTimes(2);
  });

  it("polls receipts on every dispatch cycle", async () => {
    const processOutbox = vi.fn(async () => ({ processed: 0, dispatched: 0, retried: 0, failed: 0 }));
    const processReceipts = vi.fn(async () => ({ processed: 1, providerAccepted: 1, failed: 0, expired: 0, unresolved: 0 }));
    const runtime = buildRuntime({ processOutbox, processReceipts });
    const handle = startNotificationsDispatchWorker(baseConfig, runtime);
    await vi.waitFor(() => expect(processReceipts).toHaveBeenCalledOnce());
    handle.stop();
    expect(processOutbox).toHaveBeenCalledOnce();
  });
});
