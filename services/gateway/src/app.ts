import { randomUUID } from "node:crypto";
import { Readable } from "node:stream";
import Fastify from "fastify";
import cors from "@fastify/cors";
import rateLimit from "@fastify/rate-limit";
import swagger from "@fastify/swagger";
import swaggerUi from "@fastify/swagger-ui";
import { ZodError } from "zod";
import {
  buildFastifyLoggerOptions,
  buildRequestCompletionLogPayload,
  initializeSentry,
  registerSentryErrorHook
} from "@lattelink/observability";
import { registerRoutes } from "./routes.js";

const defaultCorsAllowedOrigins = [
  "http://localhost:3000",
  "http://127.0.0.1:3000",
  "http://localhost:4173",
  "http://127.0.0.1:4173",
  "http://localhost:5173",
  "http://127.0.0.1:5173",
  "http://localhost:8080",
  "http://127.0.0.1:8080"
];

function parseOriginCandidate(value: string | undefined) {
  const trimmed = value?.trim();
  if (!trimmed) {
    return [];
  }

  return trimmed
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0)
    .flatMap((entry) => {
      const withScheme = /^https?:\/\//i.test(entry) ? entry : `https://${entry}`;

      try {
        return [new URL(withScheme).origin];
      } catch {
        return [];
      }
    });
}

function parseOriginHostSuffixCandidate(value: string | undefined) {
  const trimmed = value?.trim();
  if (!trimmed) {
    return [];
  }

  return trimmed
    .split(",")
    .map((entry) => entry.trim().toLowerCase())
    .filter((entry) => entry.length > 0)
    .map((entry) => entry.replace(/^https?:\/\//, "").replace(/\/.*$/, "").replace(/^\*\./, "").replace(/^\./, ""))
    .filter((entry) => entry.length > 0);
}

function originMatchesAllowedHostSuffix(origin: string, allowedHostSuffixes: string[]) {
  let hostname: string;

  try {
    hostname = new URL(origin).hostname.toLowerCase();
  } catch {
    return false;
  }

  return allowedHostSuffixes.some((suffix) => hostname === suffix || hostname.endsWith(`.${suffix}`));
}

function resolveAllowedCorsOrigins() {
  return new Set([
    ...defaultCorsAllowedOrigins,
    ...parseOriginCandidate(process.env.CORS_ALLOWED_ORIGINS),
    ...parseOriginCandidate(process.env.FREE_CLIENT_DASHBOARD_DOMAIN),
    ...parseOriginCandidate(process.env.CLIENT_DASHBOARD_DOMAIN),
    ...parseOriginCandidate(process.env.CLIENT_DASHBOARD_ORIGIN),
    ...parseOriginCandidate(process.env.ADMIN_CONSOLE_CLIENT_DASHBOARD_URL),
    ...parseOriginCandidate(process.env.PUBLIC_API_BASE_URL)
  ]);
}

function resolveAllowedCorsOriginHostSuffixes() {
  return parseOriginHostSuffixCandidate(process.env.CORS_ALLOWED_ORIGIN_HOST_SUFFIXES);
}

export async function buildApp() {
  const serviceName = "gateway";
  initializeSentry({ service: serviceName });
  const publicApiBaseUrl = process.env.PUBLIC_API_BASE_URL ?? "http://localhost:8080/v1";
  const allowedCorsOrigins = resolveAllowedCorsOrigins();
  const allowedCorsOriginHostSuffixes = resolveAllowedCorsOriginHostSuffixes();
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

  await app.register(cors, {
    origin: (origin, cb) => {
      if (
        !origin ||
        allowedCorsOrigins.has(origin) ||
        originMatchesAllowedHostSuffix(origin, allowedCorsOriginHostSuffixes)
      ) {
        cb(null, true);
      } else {
        cb(new Error("Not allowed by CORS"), false);
      }
    },
    credentials: true,
    methods: ["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Authorization", "Content-Type", "X-Requested-With"],
  });

  await app.register(rateLimit, {
    global: false
  });

  await app.register(swagger, {
    openapi: {
      info: {
        title: "Gazelle Public API Gateway",
        version: "1.0.0"
      },
      servers: [{ url: publicApiBaseUrl }]
    }
  });

  await app.register(swaggerUi, {
    routePrefix: "/docs"
  });

  app.setErrorHandler((error, request, reply) => {
    if (error instanceof ZodError) {
      request.log.warn(
        {
          requestId: request.id,
          details: error.flatten()
        },
        "request validation failed"
      );
      reply.status(400).send({
        code: "INVALID_REQUEST",
        message: "Request validation failed.",
        requestId: request.id,
        details: error.flatten()
      });
      return;
    }

    reply.send(error);
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
    service: "gateway",
    uptimeSeconds: Math.floor((Date.now() - startedAtMs) / 1000),
    requests: requestMetrics
  }));

  await registerRoutes(app);

  return app;
}
