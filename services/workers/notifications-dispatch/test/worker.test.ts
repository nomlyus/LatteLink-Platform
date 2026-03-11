import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildNotificationsDispatchConfig,
  processOutboxBatch,
  startNotificationsDispatchLoop,
  type NotificationsDispatchConfig,
  type NotificationsDispatchRuntime
} from "../src/worker.js";

const baseConfig: NotificationsDispatchConfig = {
  notificationsBaseUrl: "http://127.0.0.1:3005",
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
    const config = buildNotificationsDispatchConfig({} as NodeJS.ProcessEnv);

    expect(config.notificationsBaseUrl).toBe("http://127.0.0.1:3005");
    expect(config.intervalMs).toBe(5000);
    expect(config.batchSize).toBe(50);
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
    expect(processOutbox).toHaveBeenCalledWith(baseConfig.notificationsBaseUrl, baseConfig.batchSize);
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
});
