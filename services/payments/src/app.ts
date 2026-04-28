import { randomUUID } from "node:crypto";
import { Readable } from "node:stream";
import Fastify from "fastify";
import rateLimit from "@fastify/rate-limit";
import swagger from "@fastify/swagger";
import swaggerUi from "@fastify/swagger-ui";
import {
  buildFastifyLoggerOptions,
  buildRequestCompletionLogPayload,
  initializeSentry,
  registerSentryErrorHook
} from "@lattelink/observability";
import { registerRoutes } from "./routes.js";

export async function buildApp() {
  const serviceName = "payments";
  initializeSentry({ service: serviceName });
  const app = Fastify({
    logger: buildFastifyLoggerOptions(serviceName),
    genReqId: (req) => (req.headers["x-request-id"] as string | undefined) ?? randomUUID()
  });
  registerSentryErrorHook(app, serviceName);
  const startedAtMs = Date.now();
  const requestMetrics = {
    total: 0,
    status2xx: 0,
    status4xx: 0,
    status5xx: 0
  };

  await app.register(swagger, {
    openapi: {
      info: {
        title: "Gazelle payments service",
        version: "0.1.0"
      }
    }
  });

  await app.register(swaggerUi, {
    routePrefix: "/docs"
  });

  await app.register(rateLimit, {
    global: false
  });

  app.addHook("onRequest", async (request, reply) => {
    reply.header("x-request-id", request.id);
  });
  app.addHook("preParsing", async (request, _reply, payload) => {
    if (request.method !== "POST" || !request.url.startsWith("/v1/payments/webhooks/stripe")) {
      return payload;
    }

    const chunks: Buffer[] = [];
    for await (const chunk of payload) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }

    const body = Buffer.concat(chunks);
    request.rawBody = body.toString("utf8");
    return Readable.from(body);
  });
  app.addHook("onResponse", async (request, reply) => {
    requestMetrics.total += 1;

    if (reply.statusCode >= 500) {
      requestMetrics.status5xx += 1;
    } else if (reply.statusCode >= 400) {
      requestMetrics.status4xx += 1;
    } else {
      requestMetrics.status2xx += 1;
    }

    const logPayload = buildRequestCompletionLogPayload({ service: serviceName, request, reply });

    if (reply.statusCode >= 500) {
      request.log.error(logPayload, "request completed with server error");
      return;
    }

    if (reply.statusCode >= 400) {
      request.log.warn(logPayload, "request completed with client error");
      return;
    }

    request.log.info(logPayload, "request completed");
  });

  app.get("/metrics", async () => ({
    service: "payments",
    uptimeSeconds: Math.floor((Date.now() - startedAtMs) / 1000),
    requests: requestMetrics
  }));

  await registerRoutes(app);
  return app;
}
