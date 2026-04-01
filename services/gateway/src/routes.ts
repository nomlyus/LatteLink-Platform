import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { apiErrorSchema, authSessionSchema } from "@gazelle/contracts-core";
import {
  appleExchangeRequestSchema,
  authContract,
  logoutRequestSchema,
  magicLinkRequestSchema,
  magicLinkVerifySchema,
  meResponseSchema,
  operatorAuthContract,
  operatorMeResponseSchema,
  operatorUserCreateSchema,
  operatorUserListResponseSchema,
  operatorUserParamsSchema,
  operatorUserUpdateSchema,
  passkeyChallengeRequestSchema,
  passkeyChallengeResponseSchema,
  passkeyVerifyRequestSchema,
  refreshRequestSchema
} from "@gazelle/contracts-auth";
import {
  adminMenuItemCreateSchema,
  adminMenuItemSchema,
  adminMenuItemUpdateSchema,
  adminMenuItemVisibilityUpdateSchema,
  adminMutationSuccessSchema,
  adminMenuResponseSchema,
  adminStoreConfigSchema,
  adminStoreConfigUpdateSchema,
  appConfigSchema,
  catalogContract,
  menuResponseSchema,
  storeConfigResponseSchema
} from "@gazelle/contracts-catalog";
import {
  ordersContract,
  createOrderRequestSchema,
  orderQuoteSchema,
  orderSchema,
  payOrderRequestSchema,
  quoteRequestSchema
} from "@gazelle/contracts-orders";
import { loyaltyBalanceSchema, loyaltyContract, loyaltyLedgerEntrySchema } from "@gazelle/contracts-loyalty";
import {
  notificationsContract,
  pushTokenUpsertResponseSchema,
  pushTokenUpsertSchema
} from "@gazelle/contracts-notifications";

declare module "fastify" {
  interface FastifyRequest {
    authenticatedUserId?: string;
    authenticatedOperator?: z.output<typeof operatorMeResponseSchema>;
  }
}

const authHeaderSchema = z.object({
  authorization: z.string().startsWith("Bearer ").optional()
});
const jwtHeaderSchema = z.object({
  alg: z.literal("HS256"),
  typ: z.literal("JWT")
});
const jwtAccessTokenClaimsSchema = z.object({
  sub: z.string().uuid(),
  exp: z.number().int(),
  iat: z.number().int()
});
const orderIdParamsSchema = z.object({ orderId: z.string().uuid() });
const menuItemParamsSchema = z.object({ itemId: z.string().min(1) });
const cancelOrderRequestSchema = z.object({ reason: z.string().min(1) });
const staffHeaderSchema = z.object({ "x-staff-token": z.string().min(1).optional() });
const adminOrderStatusUpdateSchema = z.object({
  status: z.enum(["IN_PREP", "READY", "COMPLETED", "CANCELED"]),
  note: z.string().min(1).optional()
});
const defaultRateLimitWindowMs = 60_000;
const defaultUpstreamTimeoutMs = 5_000;
const defaultOrderStreamPollIntervalMs = 2_000;
type StreamOrderFetchSuccess = {
  order: z.output<typeof orderSchema>;
};
type StreamOrderFetchError = {
  statusCode: number;
  error: z.output<typeof apiErrorSchema>;
};

function unauthorized(requestId: string) {
  return apiErrorSchema.parse({
    code: "UNAUTHORIZED",
    message: "Missing or invalid auth token",
    requestId
  });
}

function ensureBearerAuth(request: FastifyRequest, reply: FastifyReply) {
  const parsed = authHeaderSchema.safeParse(request.headers);
  if (!parsed.success || !parsed.data.authorization) {
    reply.status(401).send(unauthorized(request.id));
    return false;
  }

  return true;
}

async function requireBearerAuth(request: FastifyRequest, reply: FastifyReply) {
  if (!ensureBearerAuth(request, reply)) {
    return reply;
  }

  return undefined;
}

function staffAccessUnavailable(requestId: string) {
  return apiErrorSchema.parse({
    code: "STAFF_ACCESS_NOT_CONFIGURED",
    message: "Staff access token is not configured",
    requestId
  });
}

function ensureStaffTokenAuth(request: FastifyRequest, reply: FastifyReply, staffToken: string | undefined) {
  if (!staffToken) {
    reply.status(503).send(staffAccessUnavailable(request.id));
    return false;
  }

  const parsed = staffHeaderSchema.safeParse(request.headers);
  if (!parsed.success || parsed.data["x-staff-token"] !== staffToken) {
    reply.status(401).send(
      apiErrorSchema.parse({
        code: "UNAUTHORIZED_STAFF_REQUEST",
        message: "Missing or invalid staff token",
        requestId: request.id
      })
    );
    return false;
  }

  return true;
}

async function requireStaffAccess(request: FastifyRequest, reply: FastifyReply, staffToken: string | undefined) {
  if (!ensureBearerAuth(request, reply)) {
    return reply;
  }

  if (!ensureStaffTokenAuth(request, reply, staffToken)) {
    return reply;
  }

  return undefined;
}

function forbidden(requestId: string, capability?: string) {
  return apiErrorSchema.parse({
    code: "FORBIDDEN",
    message: capability
      ? `Operator is missing required capability: ${capability}`
      : "Operator is not authorized to access this resource",
    requestId
  });
}

async function resolveOperatorAccess(params: {
  request: FastifyRequest;
  reply: FastifyReply;
  identityBaseUrl: string;
  fallbackStaffToken?: string;
  requiredCapability: z.output<typeof operatorMeResponseSchema>["capabilities"][number];
}) {
  const { request, reply, identityBaseUrl, fallbackStaffToken, requiredCapability } = params;
  if (!ensureBearerAuth(request, reply)) {
    return undefined;
  }

  if (fallbackStaffToken) {
    const parsedStaffHeader = staffHeaderSchema.safeParse(request.headers);
    const presentedStaffToken = parsedStaffHeader.success ? parsedStaffHeader.data["x-staff-token"] : undefined;
    if (presentedStaffToken) {
      if (presentedStaffToken !== fallbackStaffToken) {
        reply.status(401).send(
          apiErrorSchema.parse({
            code: "UNAUTHORIZED_STAFF_REQUEST",
            message: "Missing or invalid staff token",
            requestId: request.id
          })
        );
        return undefined;
      }

      request.authenticatedOperator = operatorMeResponseSchema.parse({
        operatorUserId: "00000000-0000-4000-8000-000000000001",
        displayName: "Fallback staff operator",
        email: "staff-token@gazelle.local",
        role: "owner",
        locationId: "flagship-01",
        active: true,
        capabilities: [
          "orders:read",
          "orders:write",
          "menu:read",
          "menu:write",
          "menu:visibility",
          "store:read",
          "store:write",
          "staff:read",
          "staff:write"
        ],
        createdAt: new Date(0).toISOString(),
        updatedAt: new Date(0).toISOString()
      });
      return request.authenticatedOperator;
    }

    const authorizationHeader = typeof request.headers.authorization === "string" ? request.headers.authorization : "";
    if (!authorizationHeader.startsWith("Bearer operator-access-")) {
      reply.status(401).send(
        apiErrorSchema.parse({
          code: "UNAUTHORIZED_STAFF_REQUEST",
          message: "Missing or invalid staff token",
          requestId: request.id
        })
      );
      return undefined;
    }
  }

  if (request.authenticatedOperator) {
    if (!request.authenticatedOperator.capabilities.includes(requiredCapability)) {
      reply.status(403).send(forbidden(request.id, requiredCapability));
      return undefined;
    }

    return request.authenticatedOperator;
  }

  const authorization = request.headers.authorization;
  const timeoutMs = toPositiveInteger(process.env.GATEWAY_UPSTREAM_TIMEOUT_MS, defaultUpstreamTimeoutMs);
  const timeoutController = new AbortController();
  const timeoutHandle = setTimeout(() => timeoutController.abort(), timeoutMs);

  try {
    const response = await fetch(`${identityBaseUrl}/v1/operator/auth/me`, {
      method: "GET",
      headers: {
        authorization: String(authorization),
        "x-request-id": request.id
      },
      signal: timeoutController.signal
    });
    const parsedPayload = parseJsonSafely(await response.text());

    if (!response.ok) {
      if (response.status === 401) {
        reply.status(401).send(unauthorized(request.id));
        return undefined;
      }

      const upstreamError = apiErrorSchema.safeParse(parsedPayload);
      if (upstreamError.success) {
        reply.status(response.status).send(upstreamError.data);
        return undefined;
      }

      reply.status(502).send(
        apiErrorSchema.parse({
          code: "UPSTREAM_INVALID_RESPONSE",
          message: "Identity response did not match contract",
          requestId: request.id
        })
      );
      return undefined;
    }

    const operator = operatorMeResponseSchema.safeParse(parsedPayload);
    if (!operator.success) {
      reply.status(502).send(
        apiErrorSchema.parse({
          code: "UPSTREAM_INVALID_RESPONSE",
          message: "Identity response did not match contract",
          requestId: request.id,
          details: operator.error.flatten()
        })
      );
      return undefined;
    }

    request.authenticatedOperator = operator.data;
    if (!operator.data.capabilities.includes(requiredCapability)) {
      reply.status(403).send(forbidden(request.id, requiredCapability));
      return undefined;
    }

    return operator.data;
  } catch (error) {
    if (isAbortError(error)) {
      reply.status(504).send(
        apiErrorSchema.parse({
          code: "UPSTREAM_TIMEOUT",
          message: "Identity service timed out",
          requestId: request.id
        })
      );
      return undefined;
    }

    request.log.error({ error, requestId: request.id }, "operator access check failed");
    reply.status(502).send(
      apiErrorSchema.parse({
        code: "UPSTREAM_UNAVAILABLE",
        message: "Identity service is unavailable",
        requestId: request.id
      })
    );
    return undefined;
  } finally {
    clearTimeout(timeoutHandle);
  }
}

function trimToUndefined(value: string | undefined) {
  const next = value?.trim();
  return next && next.length > 0 ? next : undefined;
}

// Local JWT verification is intentionally fail-closed. Once JWT mode is enabled, malformed or tampered
// bearer tokens are treated as unauthorized instead of falling back to identity roundtrips.
function verifyJwtAccessToken(token: string, secret: string): { userId: string } | undefined {
  const parts = token.split(".");
  if (parts.length !== 3 || !parts[0] || !parts[1] || !parts[2]) {
    return undefined;
  }

  const [encodedHeader, encodedPayload, encodedSignature] = parts;
  const signingInput = `${encodedHeader}.${encodedPayload}`;
  const expectedSignature = createHmac("sha256", secret).update(signingInput).digest("base64url");
  const actualSignatureBuffer = Buffer.from(encodedSignature, "utf8");
  const expectedSignatureBuffer = Buffer.from(expectedSignature, "utf8");

  if (actualSignatureBuffer.length !== expectedSignatureBuffer.length) {
    return undefined;
  }

  if (!timingSafeEqual(actualSignatureBuffer, expectedSignatureBuffer)) {
    return undefined;
  }

  try {
    const header = jwtHeaderSchema.parse(JSON.parse(Buffer.from(encodedHeader, "base64url").toString("utf8")));
    const claims = jwtAccessTokenClaimsSchema.parse(
      JSON.parse(Buffer.from(encodedPayload, "base64url").toString("utf8"))
    );

    if (header.alg !== "HS256" || header.typ !== "JWT") {
      return undefined;
    }

    if (claims.exp <= Math.floor(Date.now() / 1000)) {
      return undefined;
    }

    return { userId: claims.sub };
  } catch {
    return undefined;
  }
}

function toPositiveInteger(value: string | undefined, fallback: number) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }

  return Math.floor(parsed);
}

function toHeaderValue(value: string | string[] | undefined) {
  if (Array.isArray(value)) {
    return value[0];
  }

  return value;
}

function userScopedRateLimitKey(request: FastifyRequest) {
  const userId =
    trimToUndefined(request.authenticatedUserId) ??
    trimToUndefined(request.authenticatedOperator?.operatorUserId) ??
    trimToUndefined(toHeaderValue(request.headers["x-user-id"]));
  if (userId) {
    return `user:${userId.toLowerCase()}`;
  }

  return `ip:${request.ip}`;
}

const authSuccessSchema = z.object({ success: z.literal(true) });

function parseJsonSafely(rawBody: string): unknown {
  if (!rawBody) {
    return undefined;
  }

  try {
    return JSON.parse(rawBody) as unknown;
  } catch {
    return rawBody;
  }
}

function toErrorDetails(input: unknown): Record<string, unknown> | undefined {
  if (input === undefined) {
    return undefined;
  }
  if (input && typeof input === "object" && !Array.isArray(input)) {
    return input as Record<string, unknown>;
  }

  return { upstreamBody: input };
}

function isAbortError(error: unknown): boolean {
  if (!error || typeof error !== "object") {
    return false;
  }

  const candidate = error as { name?: string; code?: string; message?: string };
  if (candidate.name === "AbortError" || candidate.code === "ABORT_ERR") {
    return true;
  }

  return typeof candidate.message === "string" && candidate.message.toLowerCase().includes("aborted");
}

async function proxyUpstream<TResponse>(params: {
  request: FastifyRequest;
  reply: FastifyReply;
  baseUrl: string;
  serviceLabel: string;
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  path: string;
  body?: unknown;
  additionalHeaders?: Record<string, string | undefined>;
  forwardUserIdHeader?: boolean;
  timeoutMs?: number;
  responseSchema: z.ZodType<TResponse>;
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
    timeoutMs = toPositiveInteger(process.env.GATEWAY_UPSTREAM_TIMEOUT_MS, defaultUpstreamTimeoutMs),
    responseSchema
  } = params;

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
    upstreamResponse = await fetch(`${baseUrl}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: timeoutController.signal
    });
  } catch (error) {
    if (isAbortError(error)) {
      request.log.warn(
        { requestId: request.id, serviceLabel, method, path, timeoutMs },
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

    request.log.error(
      { error, requestId: request.id, serviceLabel, method, path },
      "upstream request failed before response"
    );
    return reply.status(502).send(
      apiErrorSchema.parse({
        code: "UPSTREAM_UNAVAILABLE",
        message: `${serviceLabel} service is unavailable`,
        requestId: request.id
      })
    );
  } finally {
    clearTimeout(timeoutHandle);
  }

  const rawBody = await upstreamResponse.text();
  const parsedBody = parseJsonSafely(rawBody);

  if (!upstreamResponse.ok) {
    const upstreamError = apiErrorSchema.safeParse(parsedBody);

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
    return reply.status(502).send(
      apiErrorSchema.parse({
        code: "UPSTREAM_INVALID_RESPONSE",
        message: `${serviceLabel} response did not match contract`,
        requestId: request.id,
        details: parsedResponse.error.flatten()
      })
    );
  }

  return reply.status(upstreamResponse.status).send(parsedResponse.data);
}

async function fetchOrderForStream(params: {
  requestId: string;
  ordersBaseUrl: string;
  gatewayInternalApiToken: string | undefined;
  orderId: string;
  userId: string;
  authorization: string;
  timeoutMs?: number;
}): Promise<StreamOrderFetchSuccess | StreamOrderFetchError> {
  const {
    requestId,
    ordersBaseUrl,
    gatewayInternalApiToken,
    orderId,
    userId,
    authorization,
    timeoutMs = toPositiveInteger(process.env.GATEWAY_UPSTREAM_TIMEOUT_MS, defaultUpstreamTimeoutMs)
  } = params;
  const headers: Record<string, string> = {
    authorization,
    "x-request-id": requestId,
    "x-user-id": userId
  };

  if (gatewayInternalApiToken) {
    headers["x-gateway-token"] = gatewayInternalApiToken;
  }

  let upstreamResponse: Response;
  const timeoutController = new AbortController();
  const timeoutHandle = setTimeout(() => timeoutController.abort(), timeoutMs);

  try {
    upstreamResponse = await fetch(`${ordersBaseUrl}/v1/orders/${orderId}`, {
      method: "GET",
      headers,
      signal: timeoutController.signal
    });
  } catch (error) {
    if (isAbortError(error)) {
      return {
        statusCode: 504,
        error: apiErrorSchema.parse({
          code: "UPSTREAM_TIMEOUT",
          message: "Orders service timed out",
          requestId
        })
      } as const;
    }

    return {
      statusCode: 502,
      error: apiErrorSchema.parse({
        code: "UPSTREAM_UNAVAILABLE",
        message: "Orders service is unavailable",
        requestId
      })
    } as const;
  } finally {
    clearTimeout(timeoutHandle);
  }

  const rawBody = await upstreamResponse.text();
  const parsedBody = parseJsonSafely(rawBody);

  if (!upstreamResponse.ok) {
    const upstreamError = apiErrorSchema.safeParse(parsedBody);
    if (upstreamError.success) {
      return {
        statusCode: upstreamResponse.status,
        error: upstreamError.data
      } as const;
    }

    return {
      statusCode: upstreamResponse.status,
      error: apiErrorSchema.parse({
        code: "UPSTREAM_ERROR",
        message: `Orders request failed with status ${upstreamResponse.status}`,
        requestId,
        details: toErrorDetails(parsedBody)
      })
    } as const;
  }

  const parsedResponse = orderSchema.safeParse(parsedBody);
  if (!parsedResponse.success) {
    return {
      statusCode: 502,
      error: apiErrorSchema.parse({
        code: "UPSTREAM_INVALID_RESPONSE",
        message: "Orders response did not match contract",
        requestId,
        details: parsedResponse.error.flatten()
      })
    } as const;
  }

  return {
    order: parsedResponse.data
  } as const;
}

function isTerminalOrderStatus(status: z.output<typeof orderSchema>["status"]) {
  return status === "COMPLETED" || status === "CANCELED";
}

async function resolveAuthenticatedUserId(params: {
  request: FastifyRequest;
  reply: FastifyReply;
  identityBaseUrl: string;
  jwtSecretConfigured?: boolean;
  timeoutMs?: number;
}) {
  const {
    request,
    reply,
    identityBaseUrl,
    jwtSecretConfigured = false,
    timeoutMs = toPositiveInteger(process.env.GATEWAY_UPSTREAM_TIMEOUT_MS, defaultUpstreamTimeoutMs)
  } = params;
  if (request.authenticatedUserId) {
    return request.authenticatedUserId;
  }

  if (jwtSecretConfigured) {
    // JWT mode is fail-closed: once local verification is enabled, we do not fall back to
    // identity for bearer verification. Revocation remains bounded by the short access-token TTL.
    reply.status(401).send(unauthorized(request.id));
    return undefined;
  }

  const authorization = request.headers.authorization;

  if (typeof authorization !== "string") {
    reply.status(401).send(unauthorized(request.id));
    return undefined;
  }

  let upstreamResponse: Response;
  const timeoutController = new AbortController();
  const timeoutHandle = setTimeout(() => timeoutController.abort(), timeoutMs);

  try {
    upstreamResponse = await fetch(`${identityBaseUrl}/v1/auth/me`, {
      method: "GET",
      headers: {
        authorization,
        "x-request-id": request.id
      },
      signal: timeoutController.signal
    });
  } catch (error) {
    if (isAbortError(error)) {
      request.log.warn({ requestId: request.id, timeoutMs }, "identity auth lookup timed out");
      reply.status(504).send(
        apiErrorSchema.parse({
          code: "UPSTREAM_TIMEOUT",
          message: "Identity service timed out",
          requestId: request.id
        })
      );
      return undefined;
    }

    request.log.error({ error, requestId: request.id }, "identity auth lookup failed before response");
    reply.status(502).send(
      apiErrorSchema.parse({
        code: "UPSTREAM_UNAVAILABLE",
        message: "Identity service is unavailable",
        requestId: request.id
      })
    );
    return undefined;
  } finally {
    clearTimeout(timeoutHandle);
  }

  const rawBody = await upstreamResponse.text();
  const parsedBody = parseJsonSafely(rawBody);

  if (!upstreamResponse.ok) {
    const upstreamError = apiErrorSchema.safeParse(parsedBody);
    if (upstreamError.success) {
      reply.status(upstreamResponse.status).send(upstreamError.data);
      return undefined;
    }

    reply.status(upstreamResponse.status).send(
      apiErrorSchema.parse({
        code: "UPSTREAM_ERROR",
        message: `Identity request failed with status ${upstreamResponse.status}`,
        requestId: request.id,
        details: toErrorDetails(parsedBody)
      })
    );
    return undefined;
  }

  const parsedResponse = meResponseSchema.safeParse(parsedBody);
  if (!parsedResponse.success) {
    reply.status(502).send(
      apiErrorSchema.parse({
        code: "UPSTREAM_INVALID_RESPONSE",
        message: "Identity response did not match contract",
        requestId: request.id,
        details: parsedResponse.error.flatten()
      })
    );
    return undefined;
  }

  request.authenticatedUserId = parsedResponse.data.userId;
  return parsedResponse.data.userId;
}

async function requireAuthenticatedCustomer(params: {
  request: FastifyRequest;
  reply: FastifyReply;
  identityBaseUrl: string;
  jwtSecret?: string;
}) {
  const { request, reply, identityBaseUrl, jwtSecret } = params;

  if (!ensureBearerAuth(request, reply)) {
    return reply;
  }

  const authorization = request.headers.authorization;
  if (typeof authorization !== "string") {
    return reply.status(401).send(unauthorized(request.id));
  }

  const accessToken = authorization.slice("Bearer ".length);

  if (jwtSecret) {
    const verified = verifyJwtAccessToken(accessToken, jwtSecret);
    if (!verified) {
      return reply.status(401).send(unauthorized(request.id));
    }

    request.authenticatedUserId = verified.userId;
    return undefined;
  }

  // Legacy opaque-token mode still resolves the caller through identity so rollout can happen
  // incrementally when JWT signing is not configured yet.
  const userId = await resolveAuthenticatedUserId({
    request,
    reply,
    identityBaseUrl
  });
  if (!userId) {
    return reply;
  }

  request.authenticatedUserId = userId;
  return undefined;
}

export async function registerRoutes(app: FastifyInstance) {
  const identityBaseUrl = process.env.IDENTITY_SERVICE_BASE_URL ?? "http://127.0.0.1:3000";
  const ordersBaseUrl = process.env.ORDERS_SERVICE_BASE_URL ?? "http://127.0.0.1:3001";
  const ordersInternalApiToken = trimToUndefined(process.env.ORDERS_INTERNAL_API_TOKEN);
  const catalogBaseUrl = process.env.CATALOG_SERVICE_BASE_URL ?? "http://127.0.0.1:3002";
  const loyaltyBaseUrl = process.env.LOYALTY_SERVICE_BASE_URL ?? "http://127.0.0.1:3004";
  const notificationsBaseUrl = process.env.NOTIFICATIONS_SERVICE_BASE_URL ?? "http://127.0.0.1:3005";
  const gatewayInternalApiToken = trimToUndefined(process.env.GATEWAY_INTERNAL_API_TOKEN);
  const gatewayStaffApiToken = trimToUndefined(process.env.GATEWAY_STAFF_API_TOKEN);
  const jwtSecret = trimToUndefined(process.env.JWT_SECRET);
  const rateLimitWindowMs = toPositiveInteger(process.env.GATEWAY_RATE_LIMIT_WINDOW_MS, defaultRateLimitWindowMs);
  const authWriteRateLimit = {
    max: toPositiveInteger(process.env.GATEWAY_RATE_LIMIT_AUTH_WRITE_MAX, 24),
    timeWindow: rateLimitWindowMs
  };
  const authReadRateLimit = {
    max: toPositiveInteger(process.env.GATEWAY_RATE_LIMIT_AUTH_READ_MAX, 120),
    timeWindow: rateLimitWindowMs,
    keyGenerator: userScopedRateLimitKey
  };
  const catalogReadRateLimit = {
    max: toPositiveInteger(process.env.GATEWAY_RATE_LIMIT_CATALOG_READ_MAX, 180),
    timeWindow: rateLimitWindowMs,
    keyGenerator: userScopedRateLimitKey
  };
  const ordersReadRateLimit = {
    max: toPositiveInteger(process.env.GATEWAY_RATE_LIMIT_ORDERS_READ_MAX, 120),
    timeWindow: rateLimitWindowMs,
    keyGenerator: userScopedRateLimitKey
  };
  const ordersWriteRateLimit = {
    max: toPositiveInteger(process.env.GATEWAY_RATE_LIMIT_ORDERS_WRITE_MAX, 60),
    timeWindow: rateLimitWindowMs,
    keyGenerator: userScopedRateLimitKey
  };
  const checkoutRateLimit = {
    max: toPositiveInteger(process.env.GATEWAY_RATE_LIMIT_CHECKOUT_MAX, 20),
    timeWindow: rateLimitWindowMs,
    keyGenerator: userScopedRateLimitKey
  };
  const loyaltyReadRateLimit = {
    max: toPositiveInteger(process.env.GATEWAY_RATE_LIMIT_LOYALTY_READ_MAX, 120),
    timeWindow: rateLimitWindowMs,
    keyGenerator: userScopedRateLimitKey
  };
  const pushTokenRateLimit = {
    max: toPositiveInteger(process.env.GATEWAY_RATE_LIMIT_PUSH_TOKEN_MAX, 30),
    timeWindow: rateLimitWindowMs,
    keyGenerator: userScopedRateLimitKey
  };
  const orderStreamPollIntervalMs = toPositiveInteger(
    process.env.GATEWAY_ORDER_STREAM_POLL_MS,
    defaultOrderStreamPollIntervalMs
  );
  const staffReadRateLimit = {
    max: toPositiveInteger(process.env.GATEWAY_RATE_LIMIT_STAFF_READ_MAX, 120),
    timeWindow: rateLimitWindowMs,
    keyGenerator: userScopedRateLimitKey
  };
  const staffWriteRateLimit = {
    max: toPositiveInteger(process.env.GATEWAY_RATE_LIMIT_STAFF_WRITE_MAX, 60),
    timeWindow: rateLimitWindowMs,
    keyGenerator: userScopedRateLimitKey
  };
  const requireCustomerAuth = async (request: FastifyRequest, reply: FastifyReply) =>
    requireAuthenticatedCustomer({
      request,
      reply,
      identityBaseUrl,
      jwtSecret
    });
  const requireOperatorCapability = (capability: z.output<typeof operatorMeResponseSchema>["capabilities"][number]) =>
    async (request: FastifyRequest, reply: FastifyReply) =>
      resolveOperatorAccess({
        request,
        reply,
        identityBaseUrl,
        fallbackStaffToken: gatewayStaffApiToken,
        requiredCapability: capability
      });

  app.get("/health", async () => ({ status: "ok", service: "gateway" }));
  app.get("/ready", async () => ({ status: "ready", service: "gateway" }));

  app.get("/v1/meta/contracts", async () => ({
    auth: authContract.basePath,
    operatorAuth: operatorAuthContract.basePath,
    catalog: catalogContract.basePath,
    orders: ordersContract.basePath,
    loyalty: loyaltyContract.basePath,
    notifications: notificationsContract.basePath
  }));

  app.post(
    "/v1/auth/apple/exchange",
    {
      preHandler: app.rateLimit(authWriteRateLimit)
    },
    async (request, reply) => {
    const input = appleExchangeRequestSchema.parse(request.body);

    return proxyUpstream({
      request,
      reply,
      baseUrl: identityBaseUrl,
      serviceLabel: "Identity",
      method: "POST",
      path: "/v1/auth/apple/exchange",
      body: input,
      responseSchema: authSessionSchema
    });
    }
  );

  app.post(
    "/v1/auth/passkey/register/challenge",
    {
      preHandler: app.rateLimit(authWriteRateLimit)
    },
    async (request, reply) => {
    const input = passkeyChallengeRequestSchema.parse(request.body ?? {});

    return proxyUpstream({
      request,
      reply,
      baseUrl: identityBaseUrl,
      serviceLabel: "Identity",
      method: "POST",
      path: "/v1/auth/passkey/register/challenge",
      body: input,
      responseSchema: passkeyChallengeResponseSchema
    });
    }
  );

  app.post(
    "/v1/auth/passkey/register/verify",
    {
      preHandler: app.rateLimit(authWriteRateLimit)
    },
    async (request, reply) => {
    const input = passkeyVerifyRequestSchema.parse(request.body);

    return proxyUpstream({
      request,
      reply,
      baseUrl: identityBaseUrl,
      serviceLabel: "Identity",
      method: "POST",
      path: "/v1/auth/passkey/register/verify",
      body: input,
      responseSchema: authSessionSchema
    });
    }
  );

  app.post(
    "/v1/auth/passkey/auth/challenge",
    {
      preHandler: app.rateLimit(authWriteRateLimit)
    },
    async (request, reply) => {
    const input = passkeyChallengeRequestSchema.parse(request.body ?? {});

    return proxyUpstream({
      request,
      reply,
      baseUrl: identityBaseUrl,
      serviceLabel: "Identity",
      method: "POST",
      path: "/v1/auth/passkey/auth/challenge",
      body: input,
      responseSchema: passkeyChallengeResponseSchema
    });
    }
  );

  app.post(
    "/v1/auth/passkey/auth/verify",
    {
      preHandler: app.rateLimit(authWriteRateLimit)
    },
    async (request, reply) => {
    const input = passkeyVerifyRequestSchema.parse(request.body);

    return proxyUpstream({
      request,
      reply,
      baseUrl: identityBaseUrl,
      serviceLabel: "Identity",
      method: "POST",
      path: "/v1/auth/passkey/auth/verify",
      body: input,
      responseSchema: authSessionSchema
    });
    }
  );

  app.post(
    "/v1/auth/magic-link/request",
    {
      preHandler: app.rateLimit(authWriteRateLimit)
    },
    async (request, reply) => {
    const input = magicLinkRequestSchema.parse(request.body);

    return proxyUpstream({
      request,
      reply,
      baseUrl: identityBaseUrl,
      serviceLabel: "Identity",
      method: "POST",
      path: "/v1/auth/magic-link/request",
      body: input,
      responseSchema: authSuccessSchema
    });
    }
  );

  app.post(
    "/v1/auth/magic-link/verify",
    {
      preHandler: app.rateLimit(authWriteRateLimit)
    },
    async (request, reply) => {
    const input = magicLinkVerifySchema.parse(request.body);

    return proxyUpstream({
      request,
      reply,
      baseUrl: identityBaseUrl,
      serviceLabel: "Identity",
      method: "POST",
      path: "/v1/auth/magic-link/verify",
      body: input,
      responseSchema: authSessionSchema
    });
    }
  );

  app.post(
    "/v1/auth/refresh",
    {
      preHandler: app.rateLimit(authWriteRateLimit)
    },
    async (request, reply) => {
    const input = refreshRequestSchema.parse(request.body);

    return proxyUpstream({
      request,
      reply,
      baseUrl: identityBaseUrl,
      serviceLabel: "Identity",
      method: "POST",
      path: "/v1/auth/refresh",
      body: input,
      responseSchema: authSessionSchema
    });
    }
  );

  app.post(
    "/v1/auth/logout",
    {
      preHandler: app.rateLimit(authWriteRateLimit)
    },
    async (request, reply) => {
    const input = logoutRequestSchema.parse(request.body);

    return proxyUpstream({
      request,
      reply,
      baseUrl: identityBaseUrl,
      serviceLabel: "Identity",
      method: "POST",
      path: "/v1/auth/logout",
      body: input,
      responseSchema: authSuccessSchema
    });
    }
  );

  app.get(
    "/v1/auth/me",
    {
      preHandler: [app.rateLimit(authReadRateLimit), requireBearerAuth]
    },
    async (request, reply) => {
    return proxyUpstream({
      request,
      reply,
      baseUrl: identityBaseUrl,
      serviceLabel: "Identity",
      method: "GET",
      path: "/v1/auth/me",
      responseSchema: meResponseSchema
    });
    }
  );

  app.get(
    "/v1/me",
    {
      preHandler: [app.rateLimit(authReadRateLimit), requireBearerAuth]
    },
    async (request, reply) => {
    return proxyUpstream({
      request,
      reply,
      baseUrl: identityBaseUrl,
      serviceLabel: "Identity",
      method: "GET",
      path: "/v1/auth/me",
      responseSchema: meResponseSchema
    });
    }
  );

  app.post(
    "/v1/operator/auth/magic-link/request",
    {
      preHandler: app.rateLimit(authWriteRateLimit)
    },
    async (request, reply) => {
      const input = magicLinkRequestSchema.parse(request.body);

      return proxyUpstream({
        request,
        reply,
        baseUrl: identityBaseUrl,
        serviceLabel: "Identity",
        method: "POST",
        path: "/v1/operator/auth/magic-link/request",
        body: input,
        responseSchema: authSuccessSchema
      });
    }
  );

  app.post(
    "/v1/operator/auth/magic-link/verify",
    {
      preHandler: app.rateLimit(authWriteRateLimit)
    },
    async (request, reply) => {
      const input = magicLinkVerifySchema.parse(request.body);

      return proxyUpstream({
        request,
        reply,
        baseUrl: identityBaseUrl,
        serviceLabel: "Identity",
        method: "POST",
        path: "/v1/operator/auth/magic-link/verify",
        body: input,
        responseSchema: operatorAuthContract.routes.magicLinkVerify.response
      });
    }
  );

  app.post(
    "/v1/operator/auth/refresh",
    {
      preHandler: app.rateLimit(authWriteRateLimit)
    },
    async (request, reply) => {
      const input = refreshRequestSchema.parse(request.body);

      return proxyUpstream({
        request,
        reply,
        baseUrl: identityBaseUrl,
        serviceLabel: "Identity",
        method: "POST",
        path: "/v1/operator/auth/refresh",
        body: input,
        responseSchema: operatorAuthContract.routes.refresh.response
      });
    }
  );

  app.post(
    "/v1/operator/auth/logout",
    {
      preHandler: app.rateLimit(authWriteRateLimit)
    },
    async (request, reply) => {
      const input = logoutRequestSchema.parse(request.body);

      return proxyUpstream({
        request,
        reply,
        baseUrl: identityBaseUrl,
        serviceLabel: "Identity",
        method: "POST",
        path: "/v1/operator/auth/logout",
        body: input,
        responseSchema: authSuccessSchema
      });
    }
  );

  app.get(
    "/v1/operator/auth/me",
    {
      preHandler: [app.rateLimit(authReadRateLimit), requireBearerAuth]
    },
    async (request, reply) =>
      proxyUpstream({
        request,
        reply,
        baseUrl: identityBaseUrl,
        serviceLabel: "Identity",
        method: "GET",
        path: "/v1/operator/auth/me",
        responseSchema: operatorMeResponseSchema
      })
  );

  app.get("/v1/menu", { preHandler: app.rateLimit(catalogReadRateLimit) }, async (request, reply) =>
    proxyUpstream({
      request,
      reply,
      baseUrl: catalogBaseUrl,
      serviceLabel: "Catalog",
      method: "GET",
      path: "/v1/menu",
      responseSchema: menuResponseSchema
    })
  );

  app.get("/v1/app-config", { preHandler: app.rateLimit(catalogReadRateLimit) }, async (request, reply) =>
    proxyUpstream({
      request,
      reply,
      baseUrl: catalogBaseUrl,
      serviceLabel: "Catalog",
      method: "GET",
      path: "/v1/app-config",
      responseSchema: appConfigSchema
    })
  );

  app.get("/v1/store/config", { preHandler: app.rateLimit(catalogReadRateLimit) }, async (request, reply) =>
    proxyUpstream({
      request,
      reply,
      baseUrl: catalogBaseUrl,
      serviceLabel: "Catalog",
      method: "GET",
      path: "/v1/store/config",
      responseSchema: storeConfigResponseSchema
    })
  );

  app.post(
    "/v1/orders/quote",
    { preHandler: [app.rateLimit(ordersWriteRateLimit), requireCustomerAuth] },
    async (request, reply) => {
    const input = quoteRequestSchema.parse(request.body);

    return proxyUpstream({
      request,
      reply,
      baseUrl: ordersBaseUrl,
      serviceLabel: "Orders",
      method: "POST",
      path: "/v1/orders/quote",
      body: input,
      additionalHeaders: {
        "x-gateway-token": gatewayInternalApiToken
      },
      responseSchema: orderQuoteSchema
    });
    }
  );

  app.post("/v1/orders", { preHandler: [app.rateLimit(ordersWriteRateLimit), requireCustomerAuth] }, async (request, reply) => {
    const input = createOrderRequestSchema.parse(request.body);
    const userId = await resolveAuthenticatedUserId({
      request,
      reply,
      identityBaseUrl,
      jwtSecretConfigured: Boolean(jwtSecret)
    });
    if (!userId) {
      return;
    }

    return proxyUpstream({
      request,
      reply,
      baseUrl: ordersBaseUrl,
      serviceLabel: "Orders",
      method: "POST",
      path: "/v1/orders",
      body: input,
      additionalHeaders: {
        "x-gateway-token": gatewayInternalApiToken,
        "x-user-id": userId
      },
      responseSchema: orderSchema
    });
  });

  app.post("/v1/orders/:orderId/pay", { preHandler: [app.rateLimit(checkoutRateLimit), requireCustomerAuth] }, async (request, reply) => {
    const { orderId } = orderIdParamsSchema.parse(request.params);
    const input = payOrderRequestSchema.parse(request.body);
    const userId = await resolveAuthenticatedUserId({
      request,
      reply,
      identityBaseUrl,
      jwtSecretConfigured: Boolean(jwtSecret)
    });
    if (!userId) {
      return;
    }

    return proxyUpstream({
      request,
      reply,
      baseUrl: ordersBaseUrl,
      serviceLabel: "Orders",
      method: "POST",
      path: `/v1/orders/${orderId}/pay`,
      body: input,
      additionalHeaders: {
        "x-gateway-token": gatewayInternalApiToken,
        "x-user-id": userId
      },
      responseSchema: orderSchema
    });
  });

  app.get("/v1/orders", { preHandler: [app.rateLimit(ordersReadRateLimit), requireCustomerAuth] }, async (request, reply) => {
    const userId = await resolveAuthenticatedUserId({
      request,
      reply,
      identityBaseUrl,
      jwtSecretConfigured: Boolean(jwtSecret)
    });
    if (!userId) {
      return;
    }

    return proxyUpstream({
      request,
      reply,
      baseUrl: ordersBaseUrl,
      serviceLabel: "Orders",
      method: "GET",
      path: "/v1/orders",
      additionalHeaders: {
        "x-gateway-token": gatewayInternalApiToken,
        "x-user-id": userId
      },
      responseSchema: z.array(orderSchema)
    });
  });

  app.get("/v1/orders/:orderId", { preHandler: [app.rateLimit(ordersReadRateLimit), requireCustomerAuth] }, async (request, reply) => {
    const { orderId } = orderIdParamsSchema.parse(request.params);
    const userId = await resolveAuthenticatedUserId({
      request,
      reply,
      identityBaseUrl,
      jwtSecretConfigured: Boolean(jwtSecret)
    });
    if (!userId) {
      return;
    }

    return proxyUpstream({
      request,
      reply,
      baseUrl: ordersBaseUrl,
      serviceLabel: "Orders",
      method: "GET",
      path: `/v1/orders/${orderId}`,
      additionalHeaders: {
        "x-gateway-token": gatewayInternalApiToken,
        "x-user-id": userId
      },
      responseSchema: orderSchema
    });
  });

  app.get(
    "/v1/orders/:orderId/stream",
    { preHandler: [app.rateLimit(ordersReadRateLimit), requireCustomerAuth] },
    async (request, reply) => {
      const { orderId } = orderIdParamsSchema.parse(request.params);
      const userId = await resolveAuthenticatedUserId({
        request,
        reply,
        identityBaseUrl,
        jwtSecretConfigured: Boolean(jwtSecret)
      });
      if (!userId) {
        return;
      }

      const authorization = request.headers.authorization;
      if (typeof authorization !== "string") {
        return reply.status(401).send(unauthorized(request.id));
      }

      const initialOrderResult = await fetchOrderForStream({
        requestId: request.id,
        ordersBaseUrl,
        gatewayInternalApiToken,
        orderId,
        userId,
        authorization
      });
      if ("error" in initialOrderResult) {
        const { statusCode, error } = initialOrderResult;
        return reply.status(statusCode).send(error);
      }

      reply.hijack();
      reply.raw.statusCode = 200;
      reply.raw.setHeader("Content-Type", "text/event-stream");
      reply.raw.setHeader("Cache-Control", "no-cache");
      reply.raw.setHeader("Connection", "keep-alive");
      reply.raw.setHeader("X-Accel-Buffering", "no");
      if (typeof reply.raw.flushHeaders === "function") {
        reply.raw.flushHeaders();
      }

      // This is SSE backed by gateway polling rather than a dedicated websocket/event bus. The stream keeps
      // client integration simple today while the gateway re-reads order state on an interval behind the scenes.
      let closed = false;
      let pollTimeout: ReturnType<typeof setTimeout> | undefined;
      let lastSeenStatus = initialOrderResult.order.status;

      const cleanup = () => {
        if (pollTimeout) {
          clearTimeout(pollTimeout);
          pollTimeout = undefined;
        }
        if (closed) {
          return;
        }
        closed = true;
        request.raw.removeListener("close", handleDisconnect);
        if (!reply.raw.destroyed && !reply.raw.writableEnded) {
          reply.raw.end();
        }
      };

      const sendEvent = (data: unknown) => {
        if (closed || reply.raw.destroyed || reply.raw.writableEnded) {
          return;
        }
        reply.raw.write(`data: ${JSON.stringify(data)}\n\n`);
      };

      const handleDisconnect = () => {
        cleanup();
      };

      const pollForUpdates = async () => {
        if (closed) {
          return;
        }

        const nextOrderResult = await fetchOrderForStream({
          requestId: request.id,
          ordersBaseUrl,
          gatewayInternalApiToken,
          orderId,
          userId,
          authorization
        });

        if ("error" in nextOrderResult) {
          const { statusCode, error } = nextOrderResult;
          request.log.warn(
            {
              requestId: request.id,
              orderId,
              statusCode,
              errorCode: error.code
            },
            "order stream poll failed"
          );
          cleanup();
          return;
        }

        if (nextOrderResult.order.status !== lastSeenStatus) {
          lastSeenStatus = nextOrderResult.order.status;
          sendEvent(nextOrderResult.order);
        }

        if (isTerminalOrderStatus(lastSeenStatus)) {
          cleanup();
          return;
        }

        pollTimeout = setTimeout(() => {
          void pollForUpdates();
        }, orderStreamPollIntervalMs);
      };

      request.raw.on("close", handleDisconnect);
      sendEvent(initialOrderResult.order);

      if (isTerminalOrderStatus(lastSeenStatus)) {
        cleanup();
        return;
      }

      pollTimeout = setTimeout(() => {
        void pollForUpdates();
      }, orderStreamPollIntervalMs);
    }
  );

  app.post("/v1/orders/:orderId/cancel", { preHandler: [app.rateLimit(checkoutRateLimit), requireCustomerAuth] }, async (request, reply) => {
    const { orderId } = orderIdParamsSchema.parse(request.params);
    const input = cancelOrderRequestSchema.parse(request.body);
    const userId = await resolveAuthenticatedUserId({
      request,
      reply,
      identityBaseUrl,
      jwtSecretConfigured: Boolean(jwtSecret)
    });
    if (!userId) {
      return;
    }

    return proxyUpstream({
      request,
      reply,
      baseUrl: ordersBaseUrl,
      serviceLabel: "Orders",
      method: "POST",
      path: `/v1/orders/${orderId}/cancel`,
      body: input,
      additionalHeaders: {
        "x-gateway-token": gatewayInternalApiToken,
        "x-user-id": userId
      },
      responseSchema: orderSchema
    });
  });

  app.get(
    "/v1/admin/orders",
    {
      preHandler: [app.rateLimit(staffReadRateLimit), requireOperatorCapability("orders:read")]
    },
    async (request, reply) =>
      proxyUpstream({
        request,
        reply,
        baseUrl: ordersBaseUrl,
        serviceLabel: "Orders",
        method: "GET",
        path: "/v1/orders",
        additionalHeaders: {
          "x-gateway-token": gatewayInternalApiToken
        },
        forwardUserIdHeader: false,
        responseSchema: z.array(orderSchema)
      })
  );

  app.get(
    "/v1/admin/orders/:orderId",
    {
      preHandler: [app.rateLimit(staffReadRateLimit), requireOperatorCapability("orders:read")]
    },
    async (request, reply) => {
      const { orderId } = orderIdParamsSchema.parse(request.params);

      return proxyUpstream({
        request,
        reply,
        baseUrl: ordersBaseUrl,
        serviceLabel: "Orders",
        method: "GET",
        path: `/v1/orders/${orderId}`,
        additionalHeaders: {
          "x-gateway-token": gatewayInternalApiToken
        },
        forwardUserIdHeader: false,
        responseSchema: orderSchema
      });
    }
  );

  app.post(
    "/v1/admin/orders/:orderId/status",
    {
      preHandler: [app.rateLimit(staffWriteRateLimit), requireOperatorCapability("orders:write")]
    },
    async (request, reply) => {
      const { orderId } = orderIdParamsSchema.parse(request.params);
      const input = adminOrderStatusUpdateSchema.parse(request.body);

      if (input.status === "CANCELED") {
        const cancelPayload = cancelOrderRequestSchema.parse({
          reason: input.note ?? "Canceled by staff"
        });

        return proxyUpstream({
          request,
          reply,
          baseUrl: ordersBaseUrl,
          serviceLabel: "Orders",
          method: "POST",
          path: `/v1/orders/${orderId}/cancel`,
          body: cancelPayload,
          additionalHeaders: {
            "x-gateway-token": gatewayInternalApiToken,
            "x-order-cancel-source": "staff"
          },
          forwardUserIdHeader: false,
          responseSchema: orderSchema
        });
      }

      return proxyUpstream({
        request,
        reply,
        baseUrl: ordersBaseUrl,
        serviceLabel: "Orders",
        method: "POST",
        path: `/v1/orders/${orderId}/status`,
        body: input,
        additionalHeaders: {
          "x-internal-token": ordersInternalApiToken
        },
        forwardUserIdHeader: false,
        responseSchema: orderSchema
      });
    }
  );

  app.get(
    "/v1/admin/menu",
    {
      preHandler: [app.rateLimit(staffReadRateLimit), requireOperatorCapability("menu:read")]
    },
    async (request, reply) =>
      proxyUpstream({
        request,
        reply,
        baseUrl: catalogBaseUrl,
        serviceLabel: "Catalog",
        method: "GET",
        path: "/v1/catalog/admin/menu",
        additionalHeaders: {
          "x-gateway-token": gatewayInternalApiToken
        },
        responseSchema: adminMenuResponseSchema
      })
  );

  app.put(
    "/v1/admin/menu/:itemId",
    {
      preHandler: [app.rateLimit(staffWriteRateLimit), requireOperatorCapability("menu:write")]
    },
    async (request, reply) => {
      const { itemId } = menuItemParamsSchema.parse(request.params);
      const input = adminMenuItemUpdateSchema.parse(request.body);

      return proxyUpstream({
        request,
        reply,
        baseUrl: catalogBaseUrl,
        serviceLabel: "Catalog",
        method: "PUT",
        path: `/v1/catalog/admin/menu/${itemId}`,
        body: input,
        additionalHeaders: {
          "x-gateway-token": gatewayInternalApiToken
        },
        responseSchema: adminMenuItemSchema
      });
    }
  );

  app.post(
    "/v1/admin/menu",
    {
      preHandler: [app.rateLimit(staffWriteRateLimit), requireOperatorCapability("menu:write")]
    },
    async (request, reply) => {
      const input = adminMenuItemCreateSchema.parse(request.body);

      return proxyUpstream({
        request,
        reply,
        baseUrl: catalogBaseUrl,
        serviceLabel: "Catalog",
        method: "POST",
        path: "/v1/catalog/admin/menu",
        body: input,
        additionalHeaders: {
          "x-gateway-token": gatewayInternalApiToken
        },
        responseSchema: adminMenuItemSchema
      });
    }
  );

  app.patch(
    "/v1/admin/menu/:itemId/visibility",
    {
      preHandler: [app.rateLimit(staffWriteRateLimit), requireOperatorCapability("menu:visibility")]
    },
    async (request, reply) => {
      const { itemId } = menuItemParamsSchema.parse(request.params);
      const input = adminMenuItemVisibilityUpdateSchema.parse(request.body);

      return proxyUpstream({
        request,
        reply,
        baseUrl: catalogBaseUrl,
        serviceLabel: "Catalog",
        method: "PATCH",
        path: `/v1/catalog/admin/menu/${itemId}/visibility`,
        body: input,
        additionalHeaders: {
          "x-gateway-token": gatewayInternalApiToken
        },
        responseSchema: adminMenuItemSchema
      });
    }
  );

  app.delete(
    "/v1/admin/menu/:itemId",
    {
      preHandler: [app.rateLimit(staffWriteRateLimit), requireOperatorCapability("menu:write")]
    },
    async (request, reply) => {
      const { itemId } = menuItemParamsSchema.parse(request.params);

      return proxyUpstream({
        request,
        reply,
        baseUrl: catalogBaseUrl,
        serviceLabel: "Catalog",
        method: "DELETE",
        path: `/v1/catalog/admin/menu/${itemId}`,
        additionalHeaders: {
          "x-gateway-token": gatewayInternalApiToken
        },
        responseSchema: adminMutationSuccessSchema
      });
    }
  );

  app.get(
    "/v1/admin/store/config",
    {
      preHandler: [app.rateLimit(staffReadRateLimit), requireOperatorCapability("store:read")]
    },
    async (request, reply) =>
      proxyUpstream({
        request,
        reply,
        baseUrl: catalogBaseUrl,
        serviceLabel: "Catalog",
        method: "GET",
        path: "/v1/catalog/admin/store/config",
        additionalHeaders: {
          "x-gateway-token": gatewayInternalApiToken
        },
        responseSchema: adminStoreConfigSchema
      })
  );

  app.put(
    "/v1/admin/store/config",
    {
      preHandler: [app.rateLimit(staffWriteRateLimit), requireOperatorCapability("store:write")]
    },
    async (request, reply) => {
      const input = adminStoreConfigUpdateSchema.parse(request.body);

      return proxyUpstream({
        request,
        reply,
        baseUrl: catalogBaseUrl,
        serviceLabel: "Catalog",
        method: "PUT",
        path: "/v1/catalog/admin/store/config",
        body: input,
        additionalHeaders: {
          "x-gateway-token": gatewayInternalApiToken
        },
        responseSchema: adminStoreConfigSchema
      });
    }
  );

  app.get(
    "/v1/admin/staff",
    {
      preHandler: [app.rateLimit(staffReadRateLimit), requireOperatorCapability("staff:read")]
    },
    async (request, reply) =>
      proxyUpstream({
        request,
        reply,
        baseUrl: identityBaseUrl,
        serviceLabel: "Identity",
        method: "GET",
        path: "/v1/operator/users",
        responseSchema: operatorUserListResponseSchema
      })
  );

  app.post(
    "/v1/admin/staff",
    {
      preHandler: [app.rateLimit(staffWriteRateLimit), requireOperatorCapability("staff:write")]
    },
    async (request, reply) => {
      const input = operatorUserCreateSchema.parse(request.body);

      return proxyUpstream({
        request,
        reply,
        baseUrl: identityBaseUrl,
        serviceLabel: "Identity",
        method: "POST",
        path: "/v1/operator/users",
        body: input,
        responseSchema: operatorMeResponseSchema
      });
    }
  );

  app.patch(
    "/v1/admin/staff/:operatorUserId",
    {
      preHandler: [app.rateLimit(staffWriteRateLimit), requireOperatorCapability("staff:write")]
    },
    async (request, reply) => {
      const { operatorUserId } = operatorUserParamsSchema.parse(request.params);
      const input = operatorUserUpdateSchema.parse(request.body);

      return proxyUpstream({
        request,
        reply,
        baseUrl: identityBaseUrl,
        serviceLabel: "Identity",
        method: "PATCH",
        path: `/v1/operator/users/${operatorUserId}`,
        body: input,
        responseSchema: operatorMeResponseSchema
      });
    }
  );

  app.get("/v1/loyalty/balance", { preHandler: [app.rateLimit(loyaltyReadRateLimit), requireCustomerAuth] }, async (request, reply) => {
    return proxyUpstream({
      request,
      reply,
      baseUrl: loyaltyBaseUrl,
      serviceLabel: "Loyalty",
      method: "GET",
      path: "/v1/loyalty/balance",
      additionalHeaders: {
        "x-gateway-token": gatewayInternalApiToken
      },
      responseSchema: loyaltyBalanceSchema
    });
  });

  app.get("/v1/loyalty/ledger", { preHandler: [app.rateLimit(loyaltyReadRateLimit), requireCustomerAuth] }, async (request, reply) => {
    return proxyUpstream({
      request,
      reply,
      baseUrl: loyaltyBaseUrl,
      serviceLabel: "Loyalty",
      method: "GET",
      path: "/v1/loyalty/ledger",
      additionalHeaders: {
        "x-gateway-token": gatewayInternalApiToken
      },
      responseSchema: z.array(loyaltyLedgerEntrySchema)
    });
  });

  app.put("/v1/devices/push-token", { preHandler: [app.rateLimit(pushTokenRateLimit), requireCustomerAuth] }, async (request, reply) => {
    const input = pushTokenUpsertSchema.parse(request.body);

    return proxyUpstream({
      request,
      reply,
      baseUrl: notificationsBaseUrl,
      serviceLabel: "Notifications",
      method: "PUT",
      path: "/v1/devices/push-token",
      body: input,
      additionalHeaders: {
        "x-gateway-token": gatewayInternalApiToken
      },
      responseSchema: pushTokenUpsertResponseSchema
    });
  });
}
