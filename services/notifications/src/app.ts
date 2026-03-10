import { randomUUID } from "node:crypto";
import Fastify from "fastify";
import swagger from "@fastify/swagger";
import swaggerUi from "@fastify/swagger-ui";
import { registerRoutes } from "./routes.js";

export async function buildApp() {
  const app = Fastify({
    logger: {
      level: process.env.LOG_LEVEL ?? "info",
      transport:
        process.env.NODE_ENV === "production"
          ? undefined
          : {
              target: "pino-pretty"
            }
    },
    genReqId: (req) => (req.headers["x-request-id"] as string | undefined) ?? randomUUID()
  });
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
        title: "Gazelle notifications service",
        version: "0.1.0"
      }
    }
  });

  await app.register(swaggerUi, {
    routePrefix: "/docs"
  });

  app.addHook("onRequest", async (request, reply) => {
    reply.header("x-request-id", request.id);
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

    const logPayload = {
      requestId: request.id,
      method: request.method,
      url: request.url,
      statusCode: reply.statusCode,
      responseTimeMs: Math.round(reply.elapsedTime)
    };

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
    service: "notifications",
    uptimeSeconds: Math.floor((Date.now() - startedAtMs) / 1000),
    requests: requestMetrics
  }));

  await registerRoutes(app);
  return app;
}
