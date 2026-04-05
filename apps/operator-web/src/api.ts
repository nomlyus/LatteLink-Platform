import { z } from "zod";
import {
  googleOAuthStartResponseSchema,
  operatorAuthProvidersSchema,
  operatorDevAccessRequestSchema,
  operatorGoogleExchangeRequestSchema,
  operatorPasswordSignInSchema,
  operatorSessionSchema,
  operatorUserListResponseSchema,
  operatorUserSchema
} from "@gazelle/contracts-auth";
import {
  adminMenuItemCreateSchema,
  adminMenuItemVisibilityUpdateSchema,
  adminMutationSuccessSchema,
  adminStoreConfigSchema,
  adminStoreConfigUpdateSchema,
  appConfigSchema,
  homeNewsCardsResponseSchema
} from "@gazelle/contracts-catalog";
import { orderSchema } from "@gazelle/contracts-orders";
import {
  normalizeMenuItemCreateForm,
  normalizeMenuItemForm,
  operatorMenuItemSchema,
  operatorMenuResponseSchema,
  normalizeOperatorUserCreateForm,
  normalizeOperatorUserUpdateForm,
  normalizeStoreConfigForm,
  type OperatorOrder,
  type OperatorMenuResponse,
  type OperatorNewsCard
} from "./model.js";

const ordersSchema = z.array(orderSchema);

const storedOperatorSessionSchema = operatorSessionSchema.extend({
  apiBaseUrl: z.string().min(1)
});

export type OperatorUser = z.output<typeof operatorUserSchema>;
export type OperatorSession = z.output<typeof storedOperatorSessionSchema>;
export type OperatorAuthProviders = z.output<typeof operatorAuthProvidersSchema>;
export type OperatorDashboardSnapshot = {
  appConfig: z.output<typeof appConfigSchema>;
  orders: OperatorOrder[];
  menu: OperatorMenuResponse;
  cards: OperatorNewsCard[];
  storeConfig: z.output<typeof adminStoreConfigSchema>;
  staff: OperatorUser[];
};

type RequestMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

export class ApiRequestError extends Error {
  statusCode: number;
  payload: unknown;

  constructor(message: string, statusCode: number, payload: unknown) {
    super(message);
    this.name = "ApiRequestError";
    this.statusCode = statusCode;
    this.payload = payload;
  }
}

function trimToUndefined(value: string | undefined | null) {
  const next = value?.trim();
  return next && next.length > 0 ? next : undefined;
}

function parseJsonSafely(rawValue: string): unknown {
  if (!rawValue) {
    return undefined;
  }

  try {
    return JSON.parse(rawValue) as unknown;
  } catch {
    return rawValue;
  }
}

function normalizeNewsCardsPayload(input: {
  locationId: string;
  cards: Array<{
    cardId: string;
    label: string;
    title: string;
    body: string;
    note?: string | null;
    sortOrder: number;
    visible: boolean;
  }>;
}) {
  return homeNewsCardsResponseSchema.parse({
    locationId: input.locationId,
    cards: input.cards
  });
}

export function normalizeApiBaseUrl(input: string) {
  const trimmed = input.trim();
  if (!trimmed) {
    return DEFAULT_API_BASE_URL;
  }

  return trimmed.replace(/\/+$/, "").endsWith("/v1") ? trimmed.replace(/\/+$/, "") : `${trimmed.replace(/\/+$/, "")}/v1`;
}

export function resolveDefaultApiBaseUrl() {
  return normalizeApiBaseUrl(import.meta.env.VITE_API_BASE_URL ?? DEFAULT_API_BASE_URL);
}

export function buildOperatorHeaders(accessToken: string, includeJsonContentType = false): Record<string, string> {
  const headers: Record<string, string> = {
    authorization: `Bearer ${accessToken}`
  };

  if (includeJsonContentType) {
    headers["content-type"] = "application/json";
  }

  return headers;
}

export function extractApiErrorMessage(payload: unknown, statusCode: number) {
  if (payload && typeof payload === "object" && "message" in payload) {
    const message = trimToUndefined(String((payload as { message?: unknown }).message ?? ""));
    if (message) {
      return message;
    }
  }

  return `Request failed (${statusCode})`;
}

export function isApiRequestError(error: unknown): error is ApiRequestError {
  return error instanceof ApiRequestError;
}

function toStoredSession(apiBaseUrl: string, payload: z.output<typeof operatorSessionSchema>): OperatorSession {
  return storedOperatorSessionSchema.parse({
    apiBaseUrl: normalizeApiBaseUrl(apiBaseUrl),
    ...payload
  });
}

async function requestJson<TSchema extends z.ZodTypeAny>(params: {
  apiBaseUrl: string;
  accessToken?: string;
  path: string;
  method?: RequestMethod;
  body?: unknown;
  schema: TSchema;
}): Promise<z.output<TSchema>> {
  const { apiBaseUrl, accessToken, path, method = "GET", body, schema } = params;
  const response = await fetch(`${normalizeApiBaseUrl(apiBaseUrl)}${path}`, {
    method,
    headers: accessToken ? buildOperatorHeaders(accessToken, body !== undefined) : body !== undefined ? { "content-type": "application/json" } : undefined,
    body: body === undefined ? undefined : JSON.stringify(body)
  });

  const parsedPayload = parseJsonSafely(await response.text());
  if (!response.ok) {
    throw new ApiRequestError(extractApiErrorMessage(parsedPayload, response.status), response.status, parsedPayload);
  }

  return schema.parse(parsedPayload);
}

export async function signInOperatorWithPassword(params: { apiBaseUrl: string; email: string; password: string }) {
  const session = await requestJson({
    apiBaseUrl: params.apiBaseUrl,
    path: "/operator/auth/sign-in",
    method: "POST",
    body: operatorPasswordSignInSchema.parse({
      email: params.email.trim(),
      password: params.password
    }),
    schema: operatorSessionSchema
  });

  return toStoredSession(params.apiBaseUrl, session);
}

export async function requestOperatorDevAccess(params: { apiBaseUrl: string; email: string }) {
  const session = await requestJson({
    apiBaseUrl: params.apiBaseUrl,
    path: "/operator/auth/dev-access",
    method: "POST",
    body: operatorDevAccessRequestSchema.parse({
      email: params.email.trim()
    }),
    schema: operatorSessionSchema
  });

  return toStoredSession(params.apiBaseUrl, session);
}

export function startOperatorGoogleSignIn(params: { apiBaseUrl: string; redirectUri: string }) {
  const search = new URLSearchParams({
    redirectUri: params.redirectUri
  });

  return requestJson({
    apiBaseUrl: params.apiBaseUrl,
    path: `/operator/auth/google/start?${search.toString()}`,
    schema: googleOAuthStartResponseSchema
  });
}

export function fetchOperatorAuthProviders(params: { apiBaseUrl: string }) {
  return requestJson({
    apiBaseUrl: params.apiBaseUrl,
    path: "/operator/auth/providers",
    schema: operatorAuthProvidersSchema
  });
}

export async function exchangeOperatorGoogleCode(params: {
  apiBaseUrl: string;
  code: string;
  state: string;
  redirectUri: string;
}) {
  const session = await requestJson({
    apiBaseUrl: params.apiBaseUrl,
    path: "/operator/auth/google/exchange",
    method: "POST",
    body: operatorGoogleExchangeRequestSchema.parse({
      code: params.code,
      state: params.state,
      redirectUri: params.redirectUri
    }),
    schema: operatorSessionSchema
  });

  return toStoredSession(params.apiBaseUrl, session);
}

export async function refreshOperatorSession(session: OperatorSession) {
  const nextSession = await requestJson({
    apiBaseUrl: session.apiBaseUrl,
    path: "/operator/auth/refresh",
    method: "POST",
    body: {
      refreshToken: session.refreshToken
    },
    schema: operatorSessionSchema
  });

  return toStoredSession(session.apiBaseUrl, nextSession);
}

export async function logoutOperatorSession(session: OperatorSession) {
  return requestJson({
    apiBaseUrl: session.apiBaseUrl,
    accessToken: session.accessToken,
    path: "/operator/auth/logout",
    method: "POST",
    body: {
      refreshToken: session.refreshToken
    },
    schema: z.object({ success: z.literal(true) })
  });
}

export async function fetchOperatorSnapshot(session: OperatorSession): Promise<OperatorDashboardSnapshot> {
  const capabilitySet = new Set(session.operator.capabilities);
  const [appConfig, orders, menu, cards, storeConfig, staffResponse] = await Promise.all([
    requestJson({
      apiBaseUrl: session.apiBaseUrl,
      path: "/app-config",
      schema: appConfigSchema
    }),
    capabilitySet.has("orders:read")
      ? requestJson({
          apiBaseUrl: session.apiBaseUrl,
          accessToken: session.accessToken,
          path: "/admin/orders",
          schema: ordersSchema
        })
      : Promise.resolve([] as z.output<typeof ordersSchema>),
    capabilitySet.has("menu:read")
      ? requestJson({
          apiBaseUrl: session.apiBaseUrl,
          accessToken: session.accessToken,
          path: "/admin/menu",
          schema: operatorMenuResponseSchema
        })
      : Promise.resolve(operatorMenuResponseSchema.parse({ locationId: session.operator.locationId, categories: [] })),
    capabilitySet.has("menu:read")
      ? requestJson({
          apiBaseUrl: session.apiBaseUrl,
          accessToken: session.accessToken,
          path: "/admin/cards",
          schema: homeNewsCardsResponseSchema
        })
      : Promise.resolve(homeNewsCardsResponseSchema.parse({ locationId: session.operator.locationId, cards: [] })),
    capabilitySet.has("store:read")
      ? requestJson({
          apiBaseUrl: session.apiBaseUrl,
          accessToken: session.accessToken,
          path: "/admin/store/config",
          schema: adminStoreConfigSchema
        })
      : Promise.resolve(
          adminStoreConfigSchema.parse({
            locationId: session.operator.locationId,
            storeName: "Store access unavailable",
            hours: "Permissions required",
            pickupInstructions: "Permissions required"
          })
        ),
    capabilitySet.has("staff:read")
      ? requestJson({
          apiBaseUrl: session.apiBaseUrl,
          accessToken: session.accessToken,
          path: "/admin/staff",
          schema: operatorUserListResponseSchema
        })
      : Promise.resolve(operatorUserListResponseSchema.parse({ users: [] }))
  ]);

  return {
    appConfig,
    orders: orders as OperatorOrder[],
    menu,
    cards: cards.cards.map((card) => ({
      ...card
    })),
    storeConfig,
    staff: staffResponse.users
  };
}

export function updateOperatorOrderStatus(
  session: OperatorSession,
  orderId: string,
  input: {
    status: "IN_PREP" | "READY" | "COMPLETED" | "CANCELED";
    note?: string;
  }
) {
  return requestJson({
    apiBaseUrl: session.apiBaseUrl,
    accessToken: session.accessToken,
    path: `/admin/orders/${orderId}/status`,
    method: "POST",
    body: {
      status: input.status,
      ...(trimToUndefined(input.note) ? { note: trimToUndefined(input.note) } : {})
    },
    schema: orderSchema
  });
}

export function createOperatorMenuItem(
  session: OperatorSession,
  input: Parameters<typeof normalizeMenuItemCreateForm>[0]
) {
  return requestJson({
    apiBaseUrl: session.apiBaseUrl,
    accessToken: session.accessToken,
    path: "/admin/menu",
    method: "POST",
    body: adminMenuItemCreateSchema.parse(normalizeMenuItemCreateForm(input)),
    schema: operatorMenuItemSchema
  });
}

export function updateOperatorMenuItem(
  session: OperatorSession,
  itemId: string,
  input: Parameters<typeof normalizeMenuItemForm>[0]
) {
  return requestJson({
    apiBaseUrl: session.apiBaseUrl,
    accessToken: session.accessToken,
    path: `/admin/menu/${itemId}`,
    method: "PUT",
    body: normalizeMenuItemForm(input),
    schema: operatorMenuItemSchema
  });
}

export function updateOperatorMenuItemVisibility(session: OperatorSession, itemId: string, visible: boolean) {
  return requestJson({
    apiBaseUrl: session.apiBaseUrl,
    accessToken: session.accessToken,
    path: `/admin/menu/${itemId}/visibility`,
    method: "PATCH",
    body: adminMenuItemVisibilityUpdateSchema.parse({ visible }),
    schema: operatorMenuItemSchema
  });
}

export function deleteOperatorMenuItem(session: OperatorSession, itemId: string) {
  return requestJson({
    apiBaseUrl: session.apiBaseUrl,
    accessToken: session.accessToken,
    path: `/admin/menu/${itemId}`,
    method: "DELETE",
    schema: adminMutationSuccessSchema
  });
}

export function replaceOperatorNewsCards(session: OperatorSession, cards: OperatorNewsCard[]) {
  return requestJson({
    apiBaseUrl: session.apiBaseUrl,
    accessToken: session.accessToken,
    path: "/admin/cards",
    method: "PUT",
    body: normalizeNewsCardsPayload({
      locationId: session.operator.locationId,
      cards
    }),
    schema: homeNewsCardsResponseSchema
  });
}

export function updateOperatorStoreConfig(
  session: OperatorSession,
  input: Parameters<typeof normalizeStoreConfigForm>[0]
) {
  return requestJson({
    apiBaseUrl: session.apiBaseUrl,
    accessToken: session.accessToken,
    path: "/admin/store/config",
    method: "PUT",
    body: adminStoreConfigUpdateSchema.parse(normalizeStoreConfigForm(input)),
    schema: adminStoreConfigSchema
  });
}

export function createOperatorStaffUser(
  session: OperatorSession,
  input: Parameters<typeof normalizeOperatorUserCreateForm>[0]
) {
  return requestJson({
    apiBaseUrl: session.apiBaseUrl,
    accessToken: session.accessToken,
    path: "/admin/staff",
    method: "POST",
    body: normalizeOperatorUserCreateForm(input),
    schema: operatorUserSchema
  });
}

export function updateOperatorStaffUser(
  session: OperatorSession,
  operatorUserId: string,
  input: Parameters<typeof normalizeOperatorUserUpdateForm>[0]
) {
  return requestJson({
    apiBaseUrl: session.apiBaseUrl,
    accessToken: session.accessToken,
    path: `/admin/staff/${operatorUserId}`,
    method: "PATCH",
    body: normalizeOperatorUserUpdateForm(input),
    schema: operatorUserSchema
  });
}

export const DEFAULT_API_BASE_URL = "http://127.0.0.1:8080/v1";
