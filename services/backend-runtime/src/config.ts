export const internalServiceNames = [
  "identity",
  "orders",
  "catalog",
  "payments",
  "loyalty",
  "notifications",
] as const;

export type InternalServiceName = (typeof internalServiceNames)[number];

export type BackendRuntimeConfig = {
  publicHost: string;
  publicPort: number;
  internalHost: string;
  internalPorts: Record<InternalServiceName, number>;
};

const defaultInternalPorts: Record<InternalServiceName, number> = {
  identity: 3100,
  orders: 3101,
  catalog: 3102,
  payments: 3103,
  loyalty: 3104,
  notifications: 3105,
};

function readPort(name: string, value: string | undefined, fallback: number) {
  const port = value === undefined ? fallback : Number(value);
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error(`${name} must be an integer between 1 and 65535`);
  }
  return port;
}

function envPortName(service: InternalServiceName) {
  return `BACKEND_RUNTIME_${service.toUpperCase()}_PORT`;
}

export function resolveBackendRuntimeConfig(
  env: NodeJS.ProcessEnv = process.env,
): BackendRuntimeConfig {
  const internalPorts = Object.fromEntries(
    internalServiceNames.map((service) => [
      service,
      readPort(
        envPortName(service),
        env[envPortName(service)],
        defaultInternalPorts[service],
      ),
    ]),
  ) as Record<InternalServiceName, number>;
  const publicPort = readPort("PORT", env.PORT, 8080);
  const ports = [publicPort, ...Object.values(internalPorts)];

  if (new Set(ports).size !== ports.length) {
    throw new Error("PORT and backend runtime internal ports must be unique");
  }

  return {
    publicHost: env.HOST?.trim() || "0.0.0.0",
    publicPort,
    internalHost: env.BACKEND_RUNTIME_INTERNAL_HOST?.trim() || "127.0.0.1",
    internalPorts,
  };
}

export function buildInternalServiceEnvironment(config: BackendRuntimeConfig) {
  const baseUrl = (service: InternalServiceName) =>
    `http://${config.internalHost}:${config.internalPorts[service]}`;

  return {
    IDENTITY_SERVICE_BASE_URL: baseUrl("identity"),
    ORDERS_SERVICE_BASE_URL: baseUrl("orders"),
    CATALOG_SERVICE_BASE_URL: baseUrl("catalog"),
    PAYMENTS_SERVICE_BASE_URL: baseUrl("payments"),
    LOYALTY_SERVICE_BASE_URL: baseUrl("loyalty"),
    NOTIFICATIONS_SERVICE_BASE_URL: baseUrl("notifications"),
  };
}
