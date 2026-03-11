import {
  buildNotificationsDispatchConfig,
  createNotificationsDispatchRuntime,
  startNotificationsDispatchWorker
} from "./worker.js";

let workerHandle: { stop: () => void } | undefined;

function shutdown(signal: NodeJS.Signals) {
  console.info(`[notifications-dispatch] received ${signal}; stopping worker loop`);
  workerHandle?.stop();
}

try {
  const config = buildNotificationsDispatchConfig();
  const runtime = createNotificationsDispatchRuntime();
  workerHandle = startNotificationsDispatchWorker(config, runtime);

  process.once("SIGINT", () => shutdown("SIGINT"));
  process.once("SIGTERM", () => shutdown("SIGTERM"));
} catch (error) {
  console.error("[notifications-dispatch] fatal", error);
  process.exit(1);
}
