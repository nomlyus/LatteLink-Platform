import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { apiErrorSchema, authSessionSchema } from "@lattelink/contracts-core";
import {
  appleExchangeRequestSchema,
  authContract,
  customerDevAccessRequestSchema,
  googleOAuthStartRequestSchema,
  googleOAuthStartResponseSchema,
  internalAdminMeResponseSchema,
  internalAdminPasswordSignInSchema,
  internalAdminSessionSchema,
  internalOwnerProvisionParamsSchema,
  internalOwnerProvisionRequestSchema,
  internalOwnerProvisionResponseSchema,
  internalOwnerSummarySchema,
  customerProfileRequestSchema,
  logoutRequestSchema,
  magicLinkRequestSchema,
  magicLinkVerifySchema,
  meResponseSchema,
  operatorAuthContract,
  operatorDevAccessRequestSchema,
  operatorGoogleExchangeRequestSchema,
  operatorMeResponseSchema,
  operatorPasswordSignInSchema,
  operatorUserCreateSchema,
  operatorUserListResponseSchema,
  operatorUserParamsSchema,
  operatorUserUpdateSchema,
  passkeyChallengeRequestSchema,
  passkeyChallengeResponseSchema,
  passkeyVerifyRequestSchema,
  refreshRequestSchema
} from "@lattelink/contracts-auth";
import {
  adminMenuItemCreateSchema,
  adminMenuItemSchema,
  adminMenuItemUpdateSchema,
  adminMenuItemVisibilityUpdateSchema,
  menuItemCustomizationGroupSchema,
  adminMutationSuccessSchema,
  adminStoreConfigSchema,
  adminStoreConfigUpdateSchema,
  appConfigSchema,
  homeNewsCardCreateSchema,
  homeNewsCardSchema,
  homeNewsCardUpdateSchema,
  homeNewsCardVisibilityUpdateSchema,
  homeNewsCardsResponseSchema,
  catalogContract,
  internalLocationBootstrapSchema,
  internalLocationListResponseSchema,
  internalLocationParamsSchema,
  internalLocationSummarySchema,
  menuResponseSchema,
  storeConfigResponseSchema
} from "@lattelink/contracts-catalog";
import {
  ordersContract,
  createOrderRequestSchema,
  orderQuoteSchema,
  orderSchema,
  payOrderRequestSchema,
  quoteRequestSchema
} from "@lattelink/contracts-orders";
import { loyaltyBalanceSchema, loyaltyContract, loyaltyLedgerEntrySchema } from "@lattelink/contracts-loyalty";
import {
  notificationsContract,
  pushTokenUpsertResponseSchema,
  pushTokenUpsertSchema
} from "@lattelink/contracts-notifications";

declare module "fastify" {
  interface FastifyRequest {
    authenticatedUserId?: string;
    authenticatedOperator?: z.output<typeof operatorMeResponseSchema>;
    authenticatedInternalAdmin?: z.output<typeof internalAdminMeResponseSchema>;
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
const cardParamsSchema = z.object({ cardId: z.string().min(1) });
const adminMenuItemWithCustomizationsSchema = adminMenuItemSchema.extend({
  customizationGroups: z.array(menuItemCustomizationGroupSchema).default([])
});
const adminMenuCategoryWithCustomizationsSchema = z.object({
  categoryId: z.string().min(1),
  title: z.string().min(1),
  items: z.array(adminMenuItemWithCustomizationsSchema)
});
const adminMenuResponseWithCustomizationsSchema = z.object({
  locationId: z.string().min(1),
  categories: z.array(adminMenuCategoryWithCustomizationsSchema)
});
const adminMenuItemUpdateWithCustomizationsSchema = adminMenuItemUpdateSchema.extend({
  customizationGroups: z.array(menuItemCustomizationGroupSchema).optional()
});
const cancelOrderRequestSchema = z.object({ reason: z.string().min(1) });
const adminOrderStatusUpdateSchema = z.object({
  status: z.enum(["IN_PREP", "READY", "COMPLETED", "CANCELED"]),
  note: z.string().min(1).optional()
});
const cloverCardEntryConfigResponseSchema = z.object({
  enabled: z.boolean(),
  providerMode: z.enum(["simulated", "live"]),
  environment: z.enum(["sandbox", "production"]).optional(),
  tokenizeEndpoint: z.string().url().optional(),
  apiAccessKey: z.string().min(1).optional(),
  merchantId: z.string().min(1).optional()
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

function forbidden(requestId: string, capability?: string) {
  return apiErrorSchema.parse({
    code: "FORBIDDEN",
    message: capability
      ? `Operator is missing required capability: ${capability}`
      : "Operator is not authorized to access this resource",
    requestId
  });
}

function internalAdminUnauthorized(requestId: string, message: string, code = "UNAUTHORIZED_INTERNAL_ADMIN") {
  return apiErrorSchema.parse({
    code,
    message,
    requestId
  });
}

function invalidRequest(requestId: string, message: string, details?: unknown) {
  return apiErrorSchema.parse({
    code: "INVALID_REQUEST",
    message,
    requestId,
    ...(details === undefined ? {} : { details })
  });
}

function ensureInternalAdminBearerAuth(request: FastifyRequest, reply: FastifyReply) {
  const parsed = authHeaderSchema.safeParse(request.headers);
  if (!parsed.success || !parsed.data.authorization) {
    reply.status(401).send(internalAdminUnauthorized(request.id, "Missing or invalid internal admin auth token"));
    return false;
  }

  return true;
}

function forbiddenInternalAdmin(
  requestId: string,
  capability?: z.output<typeof internalAdminMeResponseSchema>["capabilities"][number]
) {
  return apiErrorSchema.parse({
    code: "FORBIDDEN",
    message: capability
      ? `Internal admin is missing required capability: ${capability}`
      : "Internal admin is not authorized to access this resource",
    requestId
  });
}

async function resolveOperatorAccess(params: {
  request: FastifyRequest;
  reply: FastifyReply;
  identityBaseUrl: string;
  requiredCapability: z.output<typeof operatorMeResponseSchema>["capabilities"][number];
}) {
  const { request, reply, identityBaseUrl, requiredCapability } = params;
  if (!ensureBearerAuth(request, reply)) {
    return undefined;
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

async function resolveInternalAdminAccess(params: {
  request: FastifyRequest;
  reply: FastifyReply;
  identityBaseUrl: string;
  requiredCapability: z.output<typeof internalAdminMeResponseSchema>["capabilities"][number];
}) {
  const { request, reply, identityBaseUrl, requiredCapability } = params;
  if (!ensureInternalAdminBearerAuth(request, reply)) {
    return undefined;
  }

  if (request.authenticatedInternalAdmin) {
    if (!request.authenticatedInternalAdmin.capabilities.includes(requiredCapability)) {
      reply.status(403).send(forbiddenInternalAdmin(request.id, requiredCapability));
      return undefined;
    }

    return request.authenticatedInternalAdmin;
  }

  const authorization = request.headers.authorization;
  const timeoutMs = toPositiveInteger(process.env.GATEWAY_UPSTREAM_TIMEOUT_MS, defaultUpstreamTimeoutMs);
  const timeoutController = new AbortController();
  const timeoutHandle = setTimeout(() => timeoutController.abort(), timeoutMs);

  try {
    const response = await fetch(`${identityBaseUrl}/v1/internal-admin/auth/me`, {
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
        reply.status(401).send(internalAdminUnauthorized(request.id, "Missing or invalid internal admin auth token"));
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

    const admin = internalAdminMeResponseSchema.safeParse(parsedPayload);
    if (!admin.success) {
      reply.status(502).send(
        apiErrorSchema.parse({
          code: "UPSTREAM_INVALID_RESPONSE",
          message: "Identity response did not match contract",
          requestId: request.id,
          details: admin.error.flatten()
        })
      );
      return undefined;
    }

    request.authenticatedInternalAdmin = admin.data;
    if (!admin.data.capabilities.includes(requiredCapability)) {
      reply.status(403).send(forbiddenInternalAdmin(request.id, requiredCapability));
      return undefined;
    }

    return admin.data;
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

    request.log.error({ error, requestId: request.id }, "internal admin access check failed");
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

function resolveServiceBaseUrl(params: {
  envVar: string;
  serviceLabel: string;
  fallbackUrl: string;
}) {
  const { envVar, serviceLabel, fallbackUrl } = params;
  const configured = trimToUndefined(process.env[envVar]);

  if (configured) {
    return configured;
  }

  if (process.env.NODE_ENV === "production") {
    throw new Error(`${envVar} must be configured in production for ${serviceLabel} upstream routing`);
  }

  return fallbackUrl;
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
    trimToUndefined(request.authenticatedInternalAdmin?.internalAdminUserId) ??
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

async function proxyOpaqueUpstream(params: {
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
      redirect,
      signal: timeoutController.signal
    });
  } catch (error) {
    if (isAbortError(error)) {
      request.log.warn(
        { requestId: request.id, serviceLabel, method, path, timeoutMs },
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

    request.log.error(
      { error, requestId: request.id, serviceLabel, method, path },
      "opaque upstream request failed before response"
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

  if (rawBody.length === 0) {
    return reply.send();
  }

  if (contentType?.toLowerCase().includes("application/json")) {
    return reply.send(parseJsonSafely(rawBody));
  }

  return reply.send(rawBody);
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
  const identityBaseUrl = resolveServiceBaseUrl({
    envVar: "IDENTITY_SERVICE_BASE_URL",
    serviceLabel: "Identity",
    fallbackUrl: "http://127.0.0.1:3000"
  });
  const ordersBaseUrl = resolveServiceBaseUrl({
    envVar: "ORDERS_SERVICE_BASE_URL",
    serviceLabel: "Orders",
    fallbackUrl: "http://127.0.0.1:3001"
  });
  const ordersInternalApiToken = trimToUndefined(process.env.ORDERS_INTERNAL_API_TOKEN);
  const catalogBaseUrl = resolveServiceBaseUrl({
    envVar: "CATALOG_SERVICE_BASE_URL",
    serviceLabel: "Catalog",
    fallbackUrl: "http://127.0.0.1:3002"
  });
  const paymentsBaseUrl = resolveServiceBaseUrl({
    envVar: "PAYMENTS_SERVICE_BASE_URL",
    serviceLabel: "Payments",
    fallbackUrl: "http://127.0.0.1:3003"
  });
  const loyaltyBaseUrl = resolveServiceBaseUrl({
    envVar: "LOYALTY_SERVICE_BASE_URL",
    serviceLabel: "Loyalty",
    fallbackUrl: "http://127.0.0.1:3004"
  });
  const notificationsBaseUrl = resolveServiceBaseUrl({
    envVar: "NOTIFICATIONS_SERVICE_BASE_URL",
    serviceLabel: "Notifications",
    fallbackUrl: "http://127.0.0.1:3005"
  });
  const gatewayInternalApiToken = trimToUndefined(process.env.GATEWAY_INTERNAL_API_TOKEN);
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
  const paymentsReadRateLimit = {
    max: toPositiveInteger(process.env.GATEWAY_RATE_LIMIT_PAYMENTS_READ_MAX, 60),
    timeWindow: rateLimitWindowMs,
    keyGenerator: userScopedRateLimitKey
  };
  const paymentsWriteRateLimit = {
    max: toPositiveInteger(process.env.GATEWAY_RATE_LIMIT_PAYMENTS_WRITE_MAX, 20),
    timeWindow: rateLimitWindowMs,
    keyGenerator: userScopedRateLimitKey
  };
  const paymentsWebhookRateLimit = {
    max: toPositiveInteger(process.env.GATEWAY_RATE_LIMIT_PAYMENTS_WEBHOOK_MAX, 120),
    timeWindow: rateLimitWindowMs
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
        requiredCapability: capability
      });
  const requireInternalAdminCapability = (
    capability: z.output<typeof internalAdminMeResponseSchema>["capabilities"][number]
  ) =>
    async (request: FastifyRequest, reply: FastifyReply) =>
      resolveInternalAdminAccess({
        request,
        reply,
        identityBaseUrl,
        requiredCapability: capability
      });

  app.get("/health", async () => ({ status: "ok", service: "gateway" }));
  app.get("/ready", async () => ({ status: "ready", service: "gateway" }));

  app.get("/v1/meta/contracts", async () => ({
    auth: authContract.basePath,
    operatorAuth: operatorAuthContract.basePath,
    internalAdminAuth: "/internal-admin/auth",
    catalog: catalogContract.basePath,
    orders: ordersContract.basePath,
    loyalty: loyaltyContract.basePath,
    notifications: notificationsContract.basePath
  }));

  app.get("/v1/payments/clover/oauth/status", { preHandler: app.rateLimit(paymentsReadRateLimit) }, async (request, reply) =>
    proxyOpaqueUpstream({
      request,
      reply,
      baseUrl: paymentsBaseUrl,
      serviceLabel: "Payments",
      method: "GET",
      path: "/v1/payments/clover/oauth/status",
      forwardUserIdHeader: false
    })
  );

  app.get(
    "/v1/payments/clover/card-entry-config",
    { preHandler: [app.rateLimit(paymentsReadRateLimit), requireCustomerAuth] },
    async (request, reply) =>
      proxyUpstream({
        request,
        reply,
        baseUrl: paymentsBaseUrl,
        serviceLabel: "Payments",
        method: "GET",
        path: "/v1/payments/clover/card-entry-config",
        responseSchema: cloverCardEntryConfigResponseSchema
      })
  );

  app.get(
    "/v1/payments/clover/webhooks/verification-code",
    { preHandler: app.rateLimit(paymentsReadRateLimit) },
    async (request, reply) =>
      proxyOpaqueUpstream({
        request,
        reply,
        baseUrl: paymentsBaseUrl,
        serviceLabel: "Payments",
        method: "GET",
        path: "/v1/payments/clover/webhooks/verification-code",
        forwardUserIdHeader: false
      })
  );

  app.get("/v1/payments/clover/oauth/connect", { preHandler: app.rateLimit(paymentsReadRateLimit) }, async (request, reply) =>
    proxyOpaqueUpstream({
      request,
      reply,
      baseUrl: paymentsBaseUrl,
      serviceLabel: "Payments",
      method: "GET",
      path: "/v1/payments/clover/oauth/connect",
      forwardUserIdHeader: false
    })
  );

  app.get("/v1/payments/clover/oauth/callback", { preHandler: app.rateLimit(paymentsReadRateLimit) }, async (request, reply) =>
    proxyOpaqueUpstream({
      request,
      reply,
      baseUrl: paymentsBaseUrl,
      serviceLabel: "Payments",
      method: "GET",
      path: request.url,
      forwardUserIdHeader: false,
      redirect: "manual"
    })
  );

  app.post("/v1/payments/clover/oauth/refresh", { preHandler: app.rateLimit(paymentsWriteRateLimit) }, async (request, reply) =>
    proxyOpaqueUpstream({
      request,
      reply,
      baseUrl: paymentsBaseUrl,
      serviceLabel: "Payments",
      method: "POST",
      path: "/v1/payments/clover/oauth/refresh",
      forwardUserIdHeader: false
    })
  );

  app.post("/v1/payments/webhooks/clover", { preHandler: app.rateLimit(paymentsWebhookRateLimit) }, async (request, reply) =>
    proxyOpaqueUpstream({
      request,
      reply,
      baseUrl: paymentsBaseUrl,
      serviceLabel: "Payments",
      method: "POST",
      path: "/v1/payments/webhooks/clover",
      body: request.body,
      forwardUserIdHeader: false
    })
  );

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
    "/v1/auth/dev-access",
    {
      preHandler: app.rateLimit(authWriteRateLimit)
    },
    async (request, reply) => {
    const input = customerDevAccessRequestSchema.parse(request.body);

    return proxyUpstream({
      request,
      reply,
      baseUrl: identityBaseUrl,
      serviceLabel: "Identity",
      method: "POST",
      path: "/v1/auth/dev-access",
      body: input,
      responseSchema: authContract.routes.devAccess.response
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

  app.delete(
    "/v1/auth/account",
    {
      preHandler: [app.rateLimit(authWriteRateLimit), requireBearerAuth]
    },
    async (request, reply) => {
    return proxyUpstream({
      request,
      reply,
      baseUrl: identityBaseUrl,
      serviceLabel: "Identity",
      method: "DELETE",
      path: "/v1/auth/account",
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

  app.post(
    "/v1/auth/profile",
    {
      preHandler: [app.rateLimit(authWriteRateLimit), requireBearerAuth]
    },
    async (request, reply) => {
    const input = customerProfileRequestSchema.parse(request.body);

    return proxyUpstream({
      request,
      reply,
      baseUrl: identityBaseUrl,
      serviceLabel: "Identity",
      method: "POST",
      path: "/v1/auth/profile",
      body: input,
      responseSchema: meResponseSchema
    });
    }
  );

  app.post(
    "/v1/operator/auth/sign-in",
    {
      preHandler: app.rateLimit(authWriteRateLimit)
    },
    async (request, reply) => {
      const input = operatorPasswordSignInSchema.parse(request.body);

      return proxyUpstream({
        request,
        reply,
        baseUrl: identityBaseUrl,
        serviceLabel: "Identity",
        method: "POST",
        path: "/v1/operator/auth/sign-in",
        body: input,
        responseSchema: operatorAuthContract.routes.signIn.response
      });
    }
  );

  app.get(
    "/v1/operator/auth/providers",
    {
      preHandler: app.rateLimit(authReadRateLimit)
    },
    async (request, reply) => {
      return proxyUpstream({
        request,
        reply,
        baseUrl: identityBaseUrl,
        serviceLabel: "Identity",
        method: "GET",
        path: "/v1/operator/auth/providers",
        responseSchema: operatorAuthContract.routes.providers.response
      });
    }
  );

  app.get(
    "/v1/operator/auth/google/start",
    {
      preHandler: app.rateLimit(authReadRateLimit)
    },
    async (request, reply) => {
      const input = googleOAuthStartRequestSchema.parse(request.query);
      const search = new URLSearchParams({
        redirectUri: input.redirectUri
      });

      return proxyUpstream({
        request,
        reply,
        baseUrl: identityBaseUrl,
        serviceLabel: "Identity",
        method: "GET",
        path: `/v1/operator/auth/google/start?${search.toString()}`,
        responseSchema: googleOAuthStartResponseSchema
      });
    }
  );

  app.post(
    "/v1/operator/auth/google/exchange",
    {
      preHandler: app.rateLimit(authWriteRateLimit)
    },
    async (request, reply) => {
      const input = operatorGoogleExchangeRequestSchema.parse(request.body);

      return proxyUpstream({
        request,
        reply,
        baseUrl: identityBaseUrl,
        serviceLabel: "Identity",
        method: "POST",
        path: "/v1/operator/auth/google/exchange",
        body: input,
        responseSchema: operatorAuthContract.routes.googleExchange.response
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
    "/v1/operator/auth/dev-access",
    {
      preHandler: app.rateLimit(authWriteRateLimit)
    },
    async (request, reply) => {
      const input = operatorDevAccessRequestSchema.parse(request.body);

      return proxyUpstream({
        request,
        reply,
        baseUrl: identityBaseUrl,
        serviceLabel: "Identity",
        method: "POST",
        path: "/v1/operator/auth/dev-access",
        body: input,
        responseSchema: operatorAuthContract.routes.devAccess.response
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

  app.post(
    "/v1/internal-admin/auth/sign-in",
    {
      preHandler: app.rateLimit(authWriteRateLimit)
    },
    async (request, reply) => {
      const input = internalAdminPasswordSignInSchema.parse(request.body);

      return proxyUpstream({
        request,
        reply,
        baseUrl: identityBaseUrl,
        serviceLabel: "Identity",
        method: "POST",
        path: "/v1/internal-admin/auth/sign-in",
        body: input,
        responseSchema: internalAdminSessionSchema
      });
    }
  );

  app.post(
    "/v1/internal-admin/auth/refresh",
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
        path: "/v1/internal-admin/auth/refresh",
        body: input,
        responseSchema: internalAdminSessionSchema
      });
    }
  );

  app.post(
    "/v1/internal-admin/auth/logout",
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
        path: "/v1/internal-admin/auth/logout",
        body: input,
        responseSchema: authSuccessSchema
      });
    }
  );

  app.get(
    "/v1/internal-admin/auth/me",
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
        path: "/v1/internal-admin/auth/me",
        responseSchema: internalAdminMeResponseSchema
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

  app.get("/v1/store/cards", { preHandler: app.rateLimit(catalogReadRateLimit) }, async (request, reply) =>
    proxyUpstream({
      request,
      reply,
      baseUrl: catalogBaseUrl,
      serviceLabel: "Catalog",
      method: "GET",
      path: "/v1/store/cards",
      responseSchema: homeNewsCardsResponseSchema
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
        responseSchema: adminMenuResponseWithCustomizationsSchema
      })
  );

  app.get(
    "/v1/admin/cards",
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
        path: "/v1/catalog/admin/cards",
        additionalHeaders: {
          "x-gateway-token": gatewayInternalApiToken
        },
        responseSchema: homeNewsCardsResponseSchema
      })
  );

  app.get(
    "/v1/cards",
    {
      preHandler: app.rateLimit(catalogReadRateLimit)
    },
    async (request, reply) =>
      proxyUpstream({
        request,
        reply,
        baseUrl: catalogBaseUrl,
        serviceLabel: "Catalog",
        method: "GET",
        path: "/v1/cards",
        responseSchema: homeNewsCardsResponseSchema
      })
  );

  app.put(
    "/v1/admin/cards",
    {
      preHandler: [app.rateLimit(staffWriteRateLimit), requireOperatorCapability("menu:write")]
    },
    async (request, reply) => {
      const input = homeNewsCardsResponseSchema.parse(request.body);

      return proxyUpstream({
        request,
        reply,
        baseUrl: catalogBaseUrl,
        serviceLabel: "Catalog",
        method: "PUT",
        path: "/v1/catalog/admin/cards",
        body: input,
        additionalHeaders: {
          "x-gateway-token": gatewayInternalApiToken
        },
        responseSchema: homeNewsCardsResponseSchema
      });
    }
  );

  app.post(
    "/v1/admin/cards",
    {
      preHandler: [app.rateLimit(staffWriteRateLimit), requireOperatorCapability("menu:write")]
    },
    async (request, reply) => {
      const input = homeNewsCardCreateSchema.parse(request.body);

      return proxyUpstream({
        request,
        reply,
        baseUrl: catalogBaseUrl,
        serviceLabel: "Catalog",
        method: "POST",
        path: "/v1/catalog/admin/cards",
        body: input,
        additionalHeaders: {
          "x-gateway-token": gatewayInternalApiToken
        },
        responseSchema: homeNewsCardSchema
      });
    }
  );

  app.put(
    "/v1/admin/cards/:cardId",
    {
      preHandler: [app.rateLimit(staffWriteRateLimit), requireOperatorCapability("menu:write")]
    },
    async (request, reply) => {
      const { cardId } = cardParamsSchema.parse(request.params);
      const input = homeNewsCardUpdateSchema.parse(request.body);

      return proxyUpstream({
        request,
        reply,
        baseUrl: catalogBaseUrl,
        serviceLabel: "Catalog",
        method: "PUT",
        path: `/v1/catalog/admin/cards/${cardId}`,
        body: input,
        additionalHeaders: {
          "x-gateway-token": gatewayInternalApiToken
        },
        responseSchema: homeNewsCardSchema
      });
    }
  );

  app.patch(
    "/v1/admin/cards/:cardId/visibility",
    {
      preHandler: [app.rateLimit(staffWriteRateLimit), requireOperatorCapability("menu:visibility")]
    },
    async (request, reply) => {
      const { cardId } = cardParamsSchema.parse(request.params);
      const input = homeNewsCardVisibilityUpdateSchema.parse(request.body);

      return proxyUpstream({
        request,
        reply,
        baseUrl: catalogBaseUrl,
        serviceLabel: "Catalog",
        method: "PATCH",
        path: `/v1/catalog/admin/cards/${cardId}/visibility`,
        body: input,
        additionalHeaders: {
          "x-gateway-token": gatewayInternalApiToken
        },
        responseSchema: homeNewsCardSchema
      });
    }
  );

  app.delete(
    "/v1/admin/cards/:cardId",
    {
      preHandler: [app.rateLimit(staffWriteRateLimit), requireOperatorCapability("menu:write")]
    },
    async (request, reply) => {
      const { cardId } = cardParamsSchema.parse(request.params);

      return proxyUpstream({
        request,
        reply,
        baseUrl: catalogBaseUrl,
        serviceLabel: "Catalog",
        method: "DELETE",
        path: `/v1/catalog/admin/cards/${cardId}`,
        additionalHeaders: {
          "x-gateway-token": gatewayInternalApiToken
        },
        responseSchema: adminMutationSuccessSchema
      });
    }
  );

  app.put(
    "/v1/admin/menu/:itemId",
    {
      preHandler: [app.rateLimit(staffWriteRateLimit), requireOperatorCapability("menu:write")]
    },
    async (request, reply) => {
      const { itemId } = menuItemParamsSchema.parse(request.params);
      const parsedBody = adminMenuItemUpdateWithCustomizationsSchema.safeParse(request.body);
      if (!parsedBody.success) {
        return reply.status(400).send(
          invalidRequest(request.id, "Admin menu update payload is invalid", {
            issues: parsedBody.error.issues
          })
        );
      }

      return proxyUpstream({
        request,
        reply,
        baseUrl: catalogBaseUrl,
        serviceLabel: "Catalog",
        method: "PUT",
        path: `/v1/catalog/admin/menu/${itemId}`,
        body: parsedBody.data,
        additionalHeaders: {
          "x-gateway-token": gatewayInternalApiToken
        },
        responseSchema: adminMenuItemWithCustomizationsSchema
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
        responseSchema: adminMenuItemWithCustomizationsSchema
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
        responseSchema: adminMenuItemWithCustomizationsSchema
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

  app.post(
    "/v1/internal/locations/bootstrap",
    {
      preHandler: [app.rateLimit(authWriteRateLimit), requireInternalAdminCapability("clients:write")]
    },
    async (request, reply) => {
      const input = internalLocationBootstrapSchema.parse(request.body);

      return proxyUpstream({
        request,
        reply,
        baseUrl: catalogBaseUrl,
        serviceLabel: "Catalog",
        method: "POST",
        path: "/v1/catalog/internal/locations/bootstrap",
        body: input,
        additionalHeaders: {
          "x-gateway-token": gatewayInternalApiToken
        },
        forwardUserIdHeader: false,
        responseSchema: internalLocationSummarySchema
      });
    }
  );

  app.get(
    "/v1/internal/locations",
    {
      preHandler: [app.rateLimit(authReadRateLimit), requireInternalAdminCapability("clients:read")]
    },
    async (request, reply) => {
      return proxyUpstream({
        request,
        reply,
        baseUrl: catalogBaseUrl,
        serviceLabel: "Catalog",
        method: "GET",
        path: "/v1/catalog/internal/locations",
        additionalHeaders: {
          "x-gateway-token": gatewayInternalApiToken
        },
        forwardUserIdHeader: false,
        responseSchema: internalLocationListResponseSchema
      });
    }
  );

  app.get(
    "/v1/internal/locations/:locationId",
    {
      preHandler: [app.rateLimit(authReadRateLimit), requireInternalAdminCapability("clients:read")]
    },
    async (request, reply) => {
      const { locationId } = internalLocationParamsSchema.parse(request.params);

      return proxyUpstream({
        request,
        reply,
        baseUrl: catalogBaseUrl,
        serviceLabel: "Catalog",
        method: "GET",
        path: `/v1/catalog/internal/locations/${locationId}`,
        additionalHeaders: {
          "x-gateway-token": gatewayInternalApiToken
        },
        forwardUserIdHeader: false,
        responseSchema: internalLocationSummarySchema
      });
    }
  );

  app.get(
    "/v1/internal/locations/:locationId/owner",
    {
      preHandler: [app.rateLimit(authReadRateLimit), requireInternalAdminCapability("owners:read")]
    },
    async (request, reply) => {
      const { locationId } = internalLocationParamsSchema.parse(request.params);

      return proxyUpstream({
        request,
        reply,
        baseUrl: identityBaseUrl,
        serviceLabel: "Identity",
        method: "GET",
        path: `/v1/identity/internal/locations/${locationId}/owner`,
        additionalHeaders: {
          "x-gateway-token": gatewayInternalApiToken
        },
        forwardUserIdHeader: false,
        responseSchema: internalOwnerSummarySchema
      });
    }
  );

  app.post(
    "/v1/internal/locations/:locationId/owner/provision",
    {
      preHandler: [app.rateLimit(authWriteRateLimit), requireInternalAdminCapability("owners:write")]
    },
    async (request, reply) => {
      const { locationId } = internalOwnerProvisionParamsSchema.parse(request.params);
      const input = internalOwnerProvisionRequestSchema.parse(request.body);

      return proxyUpstream({
        request,
        reply,
        baseUrl: identityBaseUrl,
        serviceLabel: "Identity",
        method: "POST",
        path: `/v1/identity/internal/locations/${locationId}/owner/provision`,
        body: input,
        additionalHeaders: {
          "x-gateway-token": gatewayInternalApiToken
        },
        forwardUserIdHeader: false,
        responseSchema: internalOwnerProvisionResponseSchema
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
