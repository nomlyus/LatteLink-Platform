import type { FastifyInstance } from "fastify";
import { describe, expect, it, vi } from "vitest";
import { internalServiceNames } from "../src/config.js";
import {
  startBackendRuntime,
  type RuntimeDependencies,
} from "../src/runtime.js";

const runtimeNames = [...internalServiceNames, "gateway"] as const;

function createDependencies(input: {
  events: string[];
  failOnListen?: (typeof runtimeNames)[number];
}): RuntimeDependencies {
  const buildApps = Object.fromEntries(
    runtimeNames.map((name) => [
      name,
      async () =>
        ({
          listen: vi.fn(async () => {
            input.events.push(`listen:${name}`);
            if (input.failOnListen === name) {
              throw new Error(`${name} failed to listen`);
            }
            return "";
          }),
          close: vi.fn(async () => {
            input.events.push(`close:${name}`);
          }),
          log: {
            info: vi.fn(),
          },
        }) as unknown as FastifyInstance,
    ]),
  ) as RuntimeDependencies["buildApps"];

  return {
    buildApps,
    startWorkers: async () => {
      input.events.push("workers:start");
      return {
        handles: [
          {
            stop: () => {
              input.events.push("workers:stop");
            },
          },
        ],
        close: async () => {
          input.events.push("workers:close");
        },
      };
    },
  };
}

describe("backend runtime lifecycle", () => {
  it("starts internal services before the public gateway and shuts down in reverse", async () => {
    const events: string[] = [];
    const runtime = await startBackendRuntime({
      env: { PORT: "8181" } as NodeJS.ProcessEnv,
      dependencies: createDependencies({ events }),
    });

    expect(events).toEqual([
      ...internalServiceNames.map((name) => `listen:${name}`),
      "listen:gateway",
      "workers:start",
    ]);

    await runtime.close();
    await runtime.close();

    expect(events.slice(-9)).toEqual([
      "workers:stop",
      "workers:close",
      "close:gateway",
      ...[...internalServiceNames].reverse().map((name) => `close:${name}`),
    ]);
  });

  it("closes every created app when startup fails", async () => {
    const events: string[] = [];

    await expect(
      startBackendRuntime({
        env: { PORT: "8181" } as NodeJS.ProcessEnv,
        dependencies: createDependencies({
          events,
          failOnListen: "catalog",
        }),
      }),
    ).rejects.toThrow("catalog failed to listen");

    expect(events).toEqual([
      "listen:identity",
      "listen:orders",
      "listen:catalog",
      "close:catalog",
      "close:orders",
      "close:identity",
    ]);
  });
});
