import { describe, expect, it } from "vitest";
import {
  buildInternalServiceEnvironment,
  resolveBackendRuntimeConfig,
} from "../src/config.js";

describe("backend runtime configuration", () => {
  it("uses Heroku's public port and stable loopback service ports", () => {
    const config = resolveBackendRuntimeConfig({
      PORT: "54321",
    } as NodeJS.ProcessEnv);

    expect(config).toEqual({
      publicHost: "0.0.0.0",
      publicPort: 54321,
      internalHost: "127.0.0.1",
      internalPorts: {
        identity: 3100,
        orders: 3101,
        catalog: 3102,
        payments: 3103,
        loyalty: 3104,
        notifications: 3105,
      },
    });
    expect(buildInternalServiceEnvironment(config)).toEqual({
      IDENTITY_SERVICE_BASE_URL: "http://127.0.0.1:3100",
      ORDERS_SERVICE_BASE_URL: "http://127.0.0.1:3101",
      CATALOG_SERVICE_BASE_URL: "http://127.0.0.1:3102",
      PAYMENTS_SERVICE_BASE_URL: "http://127.0.0.1:3103",
      LOYALTY_SERVICE_BASE_URL: "http://127.0.0.1:3104",
      NOTIFICATIONS_SERVICE_BASE_URL: "http://127.0.0.1:3105",
    });
  });

  it("supports internal port overrides", () => {
    const config = resolveBackendRuntimeConfig({
      PORT: "8080",
      BACKEND_RUNTIME_ORDERS_PORT: "4101",
    } as NodeJS.ProcessEnv);

    expect(config.internalPorts.orders).toBe(4101);
  });

  it("rejects invalid or colliding ports", () => {
    expect(() =>
      resolveBackendRuntimeConfig({ PORT: "invalid" } as NodeJS.ProcessEnv),
    ).toThrow("PORT must be an integer");

    expect(() =>
      resolveBackendRuntimeConfig({
        PORT: "3100",
      } as NodeJS.ProcessEnv),
    ).toThrow("must be unique");
  });
});
