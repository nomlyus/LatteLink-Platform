import { startBackendRuntime } from "./runtime.js";

const runtime = await startBackendRuntime();

async function shutdown(signal: NodeJS.Signals) {
  console.info(`[backend-runtime] received ${signal}; shutting down`);
  await runtime.close();
  process.exit(0);
}

process.once("SIGTERM", () => {
  void shutdown("SIGTERM");
});
process.once("SIGINT", () => {
  void shutdown("SIGINT");
});
