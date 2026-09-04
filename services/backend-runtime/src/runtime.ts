import type { FastifyInstance } from "fastify";
import { buildApp as buildCatalogApp } from "@lattelink/catalog/app";
import { buildApp as buildGatewayApp } from "@lattelink/gateway/app";
import { buildApp as buildIdentityApp } from "@lattelink/identity/app";
import { buildApp as buildLoyaltyApp } from "@lattelink/loyalty/app";
import { buildApp as buildNotificationsApp } from "@lattelink/notifications/app";
import {
  buildNotificationsDispatchConfig,
  createNotificationsDispatchRuntime,
  startNotificationsDispatchWorker,
} from "@lattelink/notifications-dispatch-worker/worker";
import { buildApp as buildOrdersApp } from "@lattelink/orders/app";
import {
  buildPaymentReconcilerConfig,
  createPaymentReconcilerRuntime,
  startPaymentReconcilerWorker,
  type PaymentReconcilerRuntime,
} from "@lattelink/payment-reconciler-worker/worker";
import { buildApp as buildPaymentsApp } from "@lattelink/payments/app";
import {
  buildMenuSyncConfig,
  createMenuSyncRuntime,
  startMenuSyncWorker,
} from "@lattelink/menu-sync-worker/worker";
import {
  buildInternalServiceEnvironment,
  internalServiceNames,
  resolveBackendRuntimeConfig,
  type BackendRuntimeConfig,
  type InternalServiceName,
} from "./config.js";

type WorkerHandle = {
  stop: () => void;
};

export type RuntimeDependencies = {
  buildApps: Record<
    InternalServiceName | "gateway",
    () => Promise<FastifyInstance>
  >;
  startWorkers: (env: NodeJS.ProcessEnv) => Promise<{
    handles: WorkerHandle[];
    close: () => Promise<void>;
  }>;
};

export type BackendRuntime = {
  config: BackendRuntimeConfig;
  close: () => Promise<void>;
};

const defaultDependencies: RuntimeDependencies = {
  buildApps: {
    identity: buildIdentityApp,
    orders: buildOrdersApp,
    catalog: buildCatalogApp,
    payments: buildPaymentsApp,
    loyalty: buildLoyaltyApp,
    notifications: buildNotificationsApp,
    gateway: buildGatewayApp,
  },
  startWorkers: startRuntimeWorkers,
};

async function startRuntimeWorkers(env: NodeJS.ProcessEnv) {
  const handles: WorkerHandle[] = [];
  let paymentRuntime: PaymentReconcilerRuntime | undefined;

  const notificationsConfig = buildNotificationsDispatchConfig(env);
  const paymentConfig = buildPaymentReconcilerConfig(env);
  const menuConfig = buildMenuSyncConfig(env);
  const notificationsRuntime = createNotificationsDispatchRuntime();
  const menuRuntime = menuConfig.enabled
    ? createMenuSyncRuntime(menuConfig)
    : undefined;

  try {
    if (paymentConfig.enabled) {
      paymentRuntime = await createPaymentReconcilerRuntime(paymentConfig);
    }

    handles.push(
      startNotificationsDispatchWorker(
        notificationsConfig,
        notificationsRuntime,
      ),
    );

    if (paymentConfig.enabled && paymentRuntime) {
      handles.push(startPaymentReconcilerWorker(paymentConfig, paymentRuntime));
    } else {
      console.info("[backend-runtime] payment reconciler disabled");
    }

    if (menuConfig.enabled && menuRuntime) {
      handles.push(startMenuSyncWorker(menuConfig, menuRuntime));
    } else {
      console.info("[backend-runtime] menu sync disabled");
    }
  } catch (error) {
    for (const handle of handles.reverse()) {
      handle.stop();
    }
    await paymentRuntime?.close?.();
    throw error;
  }

  return {
    handles,
    close: async () => {
      await paymentRuntime?.close?.();
    },
  };
}

export async function startBackendRuntime(
  input: {
    env?: NodeJS.ProcessEnv;
    dependencies?: RuntimeDependencies;
  } = {},
): Promise<BackendRuntime> {
  const env = input.env ?? process.env;
  const dependencies = input.dependencies ?? defaultDependencies;
  const config = resolveBackendRuntimeConfig(env);
  const internalEnvironment = buildInternalServiceEnvironment(config);

  Object.assign(process.env, internalEnvironment);
  Object.assign(env, internalEnvironment);

  const apps: FastifyInstance[] = [];
  let workerHandles: WorkerHandle[] = [];
  let closeWorkerResources: () => Promise<void> = async () => {};

  try {
    for (const service of internalServiceNames) {
      const app = await dependencies.buildApps[service]();
      apps.push(app);
      await app.listen({
        host: config.internalHost,
        port: config.internalPorts[service],
      });
      app.log.info(
        { service, port: config.internalPorts[service] },
        "internal service listening",
      );
    }

    const gateway = await dependencies.buildApps.gateway();
    apps.push(gateway);
    await gateway.listen({ host: config.publicHost, port: config.publicPort });
    gateway.log.info(
      { service: "gateway", port: config.publicPort },
      "public gateway listening",
    );

    const workers = await dependencies.startWorkers(env);
    workerHandles = workers.handles;
    closeWorkerResources = workers.close;
  } catch (error) {
    for (const app of apps.reverse()) {
      await app.close().catch(() => undefined);
    }
    throw error;
  }

  let closed = false;
  return {
    config,
    close: async () => {
      if (closed) return;
      closed = true;

      for (const handle of workerHandles.reverse()) {
        handle.stop();
      }
      await closeWorkerResources();
      for (const app of apps.reverse()) {
        await app.close();
      }
    },
  };
}
