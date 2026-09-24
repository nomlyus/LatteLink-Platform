import type { FastifyReply, FastifyRequest } from "fastify";
import { apiErrorSchema } from "@lattelink/contracts-core";
import { captureOperationalError, sanitizeRequestUrl } from "@lattelink/observability";
import { z } from "zod";

export const defaultUpstreamTimeoutMs = 5_000;

export function captureGatewayUpstreamOperationalError(input: {
  request: FastifyRequest;
  event: "upstream.timeout" | "upstream.unavailable";
  error: unknown;
  upstream: string;
  method: string;
  path: string;
  timeoutMs?: number;
}) {
  captureOperationalError({
    service: "gateway",
    event: input.event,
    error: input.error,
    level: input.event === "upstream.timeout" ? "warning" : "error",
    requestId: input.request.id,
    tags: {
      upstream: input.upstream,
      method: input.method,
      timeoutMs: input.timeoutMs
    },
    context: {
      path: sanitizeRequestUrl(input.path),
      url: sanitizeRequestUrl(input.request.url)
    },
    fingerprint: ["gateway", input.event, input.upstream, input.method]
  });
}

function toPositiveInteger(value: string | undefined, fallback: number) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }

  return Math.floor(parsed);
}

export function toHeaderValue(value: string | string[] | undefined) {
  if (Array.isArray(value)) {
    return value[0];
  }

  return value;
}

export function parseJsonSafely(rawBody: string): unknown {
  if (!rawBody) {
    return undefined;
  }

  try {
    return JSON.parse(rawBody) as unknown;
  } catch {
    return rawBody;
  }
}

export function toErrorDetails(input: unknown): Record<string, unknown> | undefined {
  if (input === undefined) {
    return undefined;
  }
  if (input && typeof input === "object" && !Array.isArray(input)) {
    return input as Record<string, unknown>;
  }

  return { upstreamBody: input };
}

export function isAbortError(error: unknown): boolean {
  if (!error || typeof error !== "object") {
    return false;
  }

  const candidate = error as { name?: string; code?: string; message?: string };
  if (candidate.name === "AbortError" || candidate.code === "ABORT_ERR") {
    return true;
  }

  return typeof candidate.message === "string" && candidate.message.toLowerCase().includes("aborted");
}

export class UpstreamHttpError extends Error {
  serviceLabel: string;
  statusCode: number;
  body: unknown;

  constructor(serviceLabel: string, statusCode: number, body: unknown) {
    super(`${serviceLabel} request failed with status ${statusCode}`);
    this.name = "UpstreamHttpError";
    this.serviceLabel = serviceLabel;
    this.statusCode = statusCode;
    this.body = body;
  }
}

export async function proxyUpstream<TResponse>(params: {
  request: FastifyRequest;
  reply: FastifyReply;
  baseUrl: string;
  serviceLabel: string;
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  path: string;
  body?: unknown;
  additionalHeaders?: Record<string, string | undefined>;
  forwardUserIdHeader?: boolean;
  forwardQuery?: boolean;
  forwardCacheControl?: boolean;
  timeoutMs?: number;
  responseSchema: z.ZodType<TResponse>;
  onSuccess?: (response: TResponse) => void | Promise<void>;
}) {
  const {
    request,
    reply,
    baseUrl,
    serviceLabel,
    method,
    path,
    body,
    additionalHeaders,
    forwardUserIdHeader = true,
    forwardQuery = false,
    forwardCacheControl = false,
    timeoutMs = toPositiveInteger(process.env.GATEWAY_UPSTREAM_TIMEOUT_MS, defaultUpstreamTimeoutMs),
    responseSchema,
    onSuccess
  } = params;

  const queryString = forwardQuery && request.url.includes("?") ? request.url.split("?")[1] : undefined;
  const upstreamPath = queryString ? `${path}?${queryString}` : path;

  const headers: Record<string, string> = {
    "x-request-id": request.id
  };
  const authorization = request.headers.authorization;
  // Gateway prefers verified auth context for downstream customer calls and only falls back to a raw
  // inbound header on routes that intentionally remain unscoped.
  const userIdHeader = request.authenticatedUserId ?? toHeaderValue(request.headers["x-user-id"]);

  if (typeof authorization === "string") {
    headers.authorization = authorization;
  }
  if (forwardUserIdHeader && typeof userIdHeader === "string") {
    headers["x-user-id"] = userIdHeader;
  }
  if (additionalHeaders) {
    for (const [key, value] of Object.entries(additionalHeaders)) {
      if (value) {
        headers[key] = value;
      }
    }
  }

  if (body !== undefined) {
    headers["content-type"] = "application/json";
  }

  let upstreamResponse: Response;
  const timeoutController = new AbortController();
  const timeoutHandle = setTimeout(() => timeoutController.abort(), timeoutMs);

  try {
    upstreamResponse = await fetch(`${baseUrl}${upstreamPath}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: timeoutController.signal
    });
  } catch (error) {
    if (isAbortError(error)) {
      captureGatewayUpstreamOperationalError({
        request,
        event: "upstream.timeout",
        error,
        upstream: serviceLabel,
        method,
        path,
        timeoutMs
      });
      request.log.warn(
        {
          service: "gateway",
          event: "upstream.timeout",
          timestamp: new Date().toISOString(),
          requestId: request.id,
          upstream: serviceLabel,
          method,
          path: sanitizeRequestUrl(path),
          timeoutMs
        },
        "upstream request timed out"
      );
      return reply.status(504).send(
        apiErrorSchema.parse({
          code: "UPSTREAM_TIMEOUT",
          message: `${serviceLabel} service timed out`,
          requestId: request.id
        })
      );
    }

    captureGatewayUpstreamOperationalError({
      request,
      event: "upstream.unavailable",
      error,
      upstream: serviceLabel,
      method,
      path,
      timeoutMs
    });
    request.log.error(
      {
        error,
        service: "gateway",
        event: "upstream.error",
        timestamp: new Date().toISOString(),
        requestId: request.id,
        upstream: serviceLabel,
        method,
        path: sanitizeRequestUrl(path)
      },
      "upstream request failed before response"
    );
    return reply.status(503).send(
      apiErrorSchema.parse({
        code: "UPSTREAM_UNAVAILABLE",
        message: `${serviceLabel} service is temporarily unavailable`,
        requestId: request.id
      })
    );
  } finally {
    clearTimeout(timeoutHandle);
  }

  const rawBody = await upstreamResponse.text();
  const parsedBody = parseJsonSafely(rawBody);
  const cacheControl = forwardCacheControl ? upstreamResponse.headers.get("cache-control") : null;

  if (!upstreamResponse.ok) {
    const upstreamError = apiErrorSchema.safeParse(parsedBody);
    request.log.error(
      {
        service: "gateway",
        event: "upstream.error",
        timestamp: new Date().toISOString(),
        requestId: request.id,
        upstream: serviceLabel,
        method,
        path: sanitizeRequestUrl(path),
        status: upstreamResponse.status
      },
      "upstream request returned error response"
    );

    if (upstreamError.success) {
      return reply.status(upstreamResponse.status).send(upstreamError.data);
    }

    return reply.status(upstreamResponse.status).send(
      apiErrorSchema.parse({
        code: "UPSTREAM_ERROR",
        message: `${serviceLabel} request failed with status ${upstreamResponse.status}`,
        requestId: request.id,
        details: toErrorDetails(parsedBody)
      })
    );
  }

  const parsedResponse = responseSchema.safeParse(parsedBody);

  if (!parsedResponse.success) {
    request.log.error(
      {
        service: "gateway",
        event: "upstream.invalid_response",
        timestamp: new Date().toISOString(),
        requestId: request.id,
        upstream: serviceLabel,
        method,
        path: sanitizeRequestUrl(path),
        status: upstreamResponse.status
      },
      "upstream response did not match contract"
    );
    return reply.status(502).send(
      apiErrorSchema.parse({
        code: "UPSTREAM_INVALID_RESPONSE",
        message: `${serviceLabel} response did not match contract`,
        requestId: request.id,
        details: parsedResponse.error.flatten()
      })
    );
  }

  if (cacheControl) {
    reply.header("cache-control", cacheControl);
  }

  await onSuccess?.(parsedResponse.data);
  return reply.status(upstreamResponse.status).send(parsedResponse.data);
}

export async function proxyOpaqueUpstream(params: {
  request: FastifyRequest;
  reply: FastifyReply;
  baseUrl: string;
  serviceLabel: string;
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  path: string;
  body?: unknown;
  rawBody?: string;
  additionalHeaders?: Record<string, string | undefined>;
  forwardUserIdHeader?: boolean;
  timeoutMs?: number;
  redirect?: RequestRedirect;
}) {
  const {
    request,
    reply,
    baseUrl,
    serviceLabel,
    method,
    path,
    body,
    rawBody,
    additionalHeaders,
    forwardUserIdHeader = true,
    timeoutMs = toPositiveInteger(process.env.GATEWAY_UPSTREAM_TIMEOUT_MS, defaultUpstreamTimeoutMs),
    redirect = "follow"
  } = params;

  const headers: Record<string, string> = {
    "x-request-id": request.id
  };
  const authorization = request.headers.authorization;
  const userIdHeader = request.authenticatedUserId ?? toHeaderValue(request.headers["x-user-id"]);

  if (typeof authorization === "string") {
    headers.authorization = authorization;
  }
  if (forwardUserIdHeader && typeof userIdHeader === "string") {
    headers["x-user-id"] = userIdHeader;
  }
  if (additionalHeaders) {
    for (const [key, value] of Object.entries(additionalHeaders)) {
      if (value) {
        headers[key] = value;
      }
    }
  }

  if (rawBody !== undefined) {
    headers["content-type"] = toHeaderValue(request.headers["content-type"]) ?? "application/json";
  } else if (body !== undefined) {
    headers["content-type"] = "application/json";
  }

  let upstreamResponse: Response;
  const timeoutController = new AbortController();
  const timeoutHandle = setTimeout(() => timeoutController.abort(), timeoutMs);

  try {
    upstreamResponse = await fetch(`${baseUrl}${path}`, {
      method,
      headers,
      body: rawBody ?? (body === undefined ? undefined : JSON.stringify(body)),
      redirect,
      signal: timeoutController.signal
    });
  } catch (error) {
    if (isAbortError(error)) {
      captureGatewayUpstreamOperationalError({
        request,
        event: "upstream.timeout",
        error,
        upstream: serviceLabel,
        method,
        path,
        timeoutMs
      });
      request.log.warn(
        { requestId: request.id, serviceLabel, method, path: sanitizeRequestUrl(path), timeoutMs },
        "opaque upstream request timed out"
      );
      return reply.status(504).send(
        apiErrorSchema.parse({
          code: "UPSTREAM_TIMEOUT",
          message: `${serviceLabel} service timed out`,
          requestId: request.id
        })
      );
    }

    captureGatewayUpstreamOperationalError({
      request,
      event: "upstream.unavailable",
      error,
      upstream: serviceLabel,
      method,
      path,
      timeoutMs
    });
    request.log.error(
      { error, requestId: request.id, serviceLabel, method, path: sanitizeRequestUrl(path) },
      "opaque upstream request failed before response"
    );
    return reply.status(503).send(
      apiErrorSchema.parse({
        code: "UPSTREAM_UNAVAILABLE",
        message: `${serviceLabel} service is temporarily unavailable`,
        requestId: request.id
      })
    );
  } finally {
    clearTimeout(timeoutHandle);
  }

  const upstreamRawBody = await upstreamResponse.text();
  const contentType = upstreamResponse.headers.get("content-type");
  const location = upstreamResponse.headers.get("location");
  const cacheControl = upstreamResponse.headers.get("cache-control");

  if (contentType) {
    reply.header("content-type", contentType);
  }
  if (location) {
    reply.header("location", location);
  }
  if (cacheControl) {
    reply.header("cache-control", cacheControl);
  }

  reply.status(upstreamResponse.status);

  if (upstreamRawBody.length === 0) {
    return reply.send();
  }

  if (contentType?.toLowerCase().includes("application/json")) {
    return reply.send(parseJsonSafely(upstreamRawBody));
  }

  return reply.send(upstreamRawBody);
}
