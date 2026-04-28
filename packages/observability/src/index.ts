import * as Sentry from "@sentry/node";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";

type LoggerOptions = {
  level: string;
  base: {
    service: string;
  };
  transport?: {
    target: string;
  };
  serializers: {
    req(request: {
      method?: string;
      url?: string;
      id?: string;
      headers?: Record<string, unknown>;
    }): Record<string, unknown>;
  };
};

let sentryInitialized = false;

function trimToUndefined(value: string | undefined) {
  const next = value?.trim();
  return next && next.length > 0 ? next : undefined;
}

function parseSampleRate(value: string | undefined) {
  const trimmed = trimToUndefined(value);
  if (!trimmed) {
    return undefined;
  }

  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 1) {
    return undefined;
  }

  return parsed;
}

export function buildFastifyLoggerOptions(service: string, env: NodeJS.ProcessEnv = process.env): LoggerOptions {
  return {
    level: env.LOG_LEVEL ?? "info",
    base: {
      service
    },
    transport:
      env.NODE_ENV === "production"
        ? undefined
        : {
            target: "pino-pretty"
          },
    serializers: {
      req(request) {
        return {
          method: request.method,
          url: request.url,
          requestId: request.id,
          userAgent: typeof request.headers?.["user-agent"] === "string" ? request.headers["user-agent"] : undefined
        };
      }
    }
  };
}

export function buildRequestCompletionLogPayload(input: {
  service: string;
  request: FastifyRequest;
  reply: FastifyReply;
}) {
  return {
    service: input.service,
    event: "http.request.completed",
    timestamp: new Date().toISOString(),
    requestId: input.request.id,
    method: input.request.method,
    url: input.request.url,
    statusCode: input.reply.statusCode,
    responseTimeMs: Math.round(input.reply.elapsedTime)
  };
}

export function initializeSentry(input: {
  service: string;
  env?: NodeJS.ProcessEnv;
}) {
  const env = input.env ?? process.env;
  const dsn = trimToUndefined(env.SENTRY_DSN);
  if (!dsn) {
    return false;
  }

  if (sentryInitialized) {
    return true;
  }

  Sentry.init({
    dsn,
    environment: trimToUndefined(env.DEPLOY_ENV) ?? trimToUndefined(env.NODE_ENV) ?? "development",
    release: trimToUndefined(env.APP_VERSION) ?? trimToUndefined(env.IMAGE_TAG) ?? "unknown",
    tracesSampleRate: parseSampleRate(env.SENTRY_TRACES_SAMPLE_RATE),
    serverName: input.service,
    initialScope: {
      tags: {
        service: input.service
      }
    }
  });

  sentryInitialized = true;
  return true;
}

export function registerSentryErrorHook(app: FastifyInstance, service: string) {
  app.addHook("onError", async (request, _reply, error) => {
    if (!sentryInitialized) {
      return;
    }

    Sentry.withScope((scope) => {
      scope.setTag("service", service);
      scope.setTag("requestId", request.id);
      scope.setContext("request", {
        method: request.method,
        url: request.url
      });
      Sentry.captureException(error);
    });
  });
}
