import { z } from "zod";
import {
  googleOAuthStartResponseSchema,
  operatorAuthProvidersSchema,
  operatorDevAccessRequestSchema,
  operatorGoogleExchangeRequestSchema,
  operatorInviteAcceptRequestSchema,
  operatorInviteAcceptResponseSchema,
  operatorInviteLookupResponseSchema,
  operatorPasswordSignInSchema,
  operatorSessionSchema,
  operatorUserListResponseSchema,
  operatorUserSchema
} from "@lattelink/contracts-auth";
import {
  adminMenuItemCreateSchema,
  adminMenuItemImageUploadRequestSchema,
  adminMenuItemImageUploadResponseSchema,
  adminMenuItemVisibilityUpdateSchema,
  adminMutationSuccessSchema,
  adminStoreConfigSchema,
  adminStoreConfigUpdateSchema,
  appConfigSchema,
  homeNewsCardsResponseSchema,
  onboardingSummarySchema,
  operatorOnboardingUpdateSchema
} from "@lattelink/contracts-catalog";
import {
  createDiscountCodeRequestSchema,
  discountCodeListResponseSchema,
  discountCodeSchema,
  orderSchema,
  updateDiscountCodeRequestSchema
} from "@lattelink/contracts-orders";
import {
  filterVisibleOrders,
  normalizeMenuItemCreateForm,
  normalizeMenuItemForm,
  operatorMenuItemSchema,
  operatorMenuResponseSchema,
  normalizeOperatorUserCreateForm,
  normalizeOperatorUserUpdateForm,
  normalizeStoreConfigForm,
  type OperatorOrder,
  type OperatorMenuResponse,
  type OperatorNewsCard,
  type OperatorDiscountCode
} from "./model.js";

const ordersSchema = z.array(orderSchema);
const unreachableBackendMessage = "Unable to reach backend.";

const storedOperatorSessionSchema = operatorSessionSchema.extend({
  apiBaseUrl: z.string().min(1)
});

export type OperatorUser = z.output<typeof operatorUserSchema>;
export type OperatorSession = z.output<typeof storedOperatorSessionSchema>;
export type OperatorAuthProviders = z.output<typeof operatorAuthProvidersSchema>;
export type OperatorInviteLookup = z.output<typeof operatorInviteLookupResponseSchema>;
export type OperatorInviteAcceptResponse = z.output<typeof operatorInviteAcceptResponseSchema>;
export type OperatorOnboardingSummary = z.output<typeof onboardingSummarySchema>;
export type DashboardLocation = {
  locationId: string;
  locationName: string;
  marketLabel: string;
  appConfig: z.output<typeof appConfigSchema>;
};
export type OperatorDashboardSnapshot = {
  appConfig: z.output<typeof appConfigSchema> | null;
  orders: OperatorOrder[];
  menu: OperatorMenuResponse;
  cards: OperatorNewsCard[];
  discountCodes: OperatorDiscountCode[];
  storeConfig: z.output<typeof adminStoreConfigSchema> | null;
  team: OperatorUser[];
};

type RequestMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
type MenuImageVariantUpload = z.output<typeof adminMenuItemImageUploadResponseSchema>["variantUploads"][number];

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

function buildPathWithQuery(path: string, query?: Record<string, string | undefined>) {
  if (!query) {
    return path;
  }

  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value) {
      search.set(key, value);
    }
  }

  const queryString = search.toString();
  return queryString ? `${path}?${queryString}` : path;
}

function normalizeOperatorLocationIds(primaryLocationId: string, locationIds?: readonly string[]) {
  return Array.from(new Set([primaryLocationId, ...(locationIds ?? [])]));
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
    return "";
  }

  return trimmed.replace(/\/+$/, "").endsWith("/v1") ? trimmed.replace(/\/+$/, "") : `${trimmed.replace(/\/+$/, "")}/v1`;
}

export function resolveDefaultApiBaseUrl() {
  return normalizeApiBaseUrl(import.meta.env.VITE_API_BASE_URL ?? "");
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

function requireApiBaseUrl(apiBaseUrl: string) {
  const normalized = normalizeApiBaseUrl(apiBaseUrl);
  if (!normalized) {
    throw new Error(unreachableBackendMessage);
  }

  return normalized;
}

async function requestJson<TSchema extends z.ZodTypeAny>(params: {
  apiBaseUrl: string;
  accessToken?: string;
  path: string;
  query?: Record<string, string | undefined>;
  method?: RequestMethod;
  body?: unknown;
  schema: TSchema;
}): Promise<z.output<TSchema>> {
  const { apiBaseUrl, accessToken, path, query, method = "GET", body, schema } = params;
  const resolvedPath = buildPathWithQuery(path, query);
  const response = await (async () => {
    try {
      return await fetch(`${requireApiBaseUrl(apiBaseUrl)}${resolvedPath}`, {
        method,
        headers: accessToken
          ? buildOperatorHeaders(accessToken, body !== undefined)
          : body !== undefined
            ? { "content-type": "application/json" }
            : undefined,
        body: body === undefined ? undefined : JSON.stringify(body)
      });
    } catch (error) {
      throw new Error(unreachableBackendMessage, {
        cause: error instanceof Error ? error : undefined
      });
    }
  })();

  const parsedPayload = parseJsonSafely(await response.text());
  if (!response.ok) {
    throw new ApiRequestError(extractApiErrorMessage(parsedPayload, response.status), response.status, parsedPayload);
  }

  return schema.parse(parsedPayload);
}

async function uploadBinary(params: {
  uploadUrl: string;
  method: "PUT";
  headers: Record<string, string>;
  body: Blob;
}) {
  let response: Response;
  try {
    response = await fetch(params.uploadUrl, {
      method: params.method,
      headers: params.headers,
      body: params.body
    });
  } catch (error) {
    throw new Error("Unable to upload image.", {
      cause: error instanceof Error ? error : undefined
    });
  }

  if (!response.ok) {
    throw new Error(`Image upload failed (${response.status}).`);
  }
}

function canCreateMenuImageVariant(file: File) {
  return file.type === "image/jpeg" || file.type === "image/png" || file.type === "image/webp";
}

function loadImageFromObjectUrl(objectUrl: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Unable to read image for optimization."));
    image.decoding = "async";
    image.src = objectUrl;
  });
}

function canvasToBlob(canvas: HTMLCanvasElement, contentType: string, quality: number) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) {
          resolve(blob);
          return;
        }
        reject(new Error("Unable to encode optimized image variant."));
      },
      contentType,
      quality
    );
  });
}

async function createMenuImageVariantBlob(file: File, upload: MenuImageVariantUpload) {
  if (!canCreateMenuImageVariant(file) || typeof document === "undefined" || typeof Image === "undefined") {
    return null;
  }

  const objectUrl = URL.createObjectURL(file);
  try {
    const image = await loadImageFromObjectUrl(objectUrl);
    const sourceWidth = image.naturalWidth || image.width;
    const sourceHeight = image.naturalHeight || image.height;

    if (sourceWidth <= 0 || sourceHeight <= 0) {
      throw new Error("Image dimensions could not be determined.");
    }

    const targetWidth = Math.max(1, Math.min(upload.width, sourceWidth));
    const targetHeight = Math.max(1, Math.round((sourceHeight / sourceWidth) * targetWidth));
    const canvas = document.createElement("canvas");
    canvas.width = targetWidth;
    canvas.height = targetHeight;

    const context = canvas.getContext("2d");
    if (!context) {
      throw new Error("Image optimization is not available in this browser.");
    }

    context.drawImage(image, 0, 0, targetWidth, targetHeight);
    return await canvasToBlob(canvas, upload.contentType, upload.quality);
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

async function uploadMenuItemImageVariants(file: File, variantUploads: MenuImageVariantUpload[]) {
  await Promise.all(
    variantUploads.map(async (upload) => {
      const blob = await createMenuImageVariantBlob(file, upload);
      if (!blob) {
        return;
      }

      await uploadBinary({
        uploadUrl: upload.uploadUrl,
        method: upload.uploadMethod,
        headers: upload.uploadHeaders,
        body: blob
      });
    })
  );
}

export async function signInOperatorWithPassword(params: {
  apiBaseUrl: string;
  email: string;
  password: string;
  locationId?: string;
}) {
  const session = await requestJson({
    apiBaseUrl: params.apiBaseUrl,
    path: "/operator/auth/sign-in",
    method: "POST",
    body: operatorPasswordSignInSchema.parse({
      email: params.email.trim(),
      password: params.password,
      locationId: params.locationId
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

export function lookupOperatorInvite(params: { apiBaseUrl: string; token: string }) {
  return requestJson({
    apiBaseUrl: params.apiBaseUrl,
    path: `/operator/invites/${encodeURIComponent(params.token)}`,
    schema: operatorInviteLookupResponseSchema
  });
}

export function acceptOperatorInvite(params: { apiBaseUrl: string; token: string; password: string }) {
  return requestJson({
    apiBaseUrl: params.apiBaseUrl,
    path: `/operator/invites/${encodeURIComponent(params.token)}/accept`,
    method: "POST",
    body: operatorInviteAcceptRequestSchema.parse({
      password: params.password
    }),
    schema: operatorInviteAcceptResponseSchema
  });
}

export function startOperatorGoogleSignIn(params: { apiBaseUrl: string; redirectUri: string; locationId?: string }) {
  const search = new URLSearchParams({
    redirectUri: params.redirectUri
  });
  if (params.locationId) {
    search.set("locationId", params.locationId);
  }

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
  locationId?: string;
}) {
  const session = await requestJson({
    apiBaseUrl: params.apiBaseUrl,
    path: "/operator/auth/google/exchange",
    method: "POST",
    body: operatorGoogleExchangeRequestSchema.parse({
      code: params.code,
      state: params.state,
      redirectUri: params.redirectUri,
      locationId: params.locationId
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

export async function fetchDashboardLocations(session: OperatorSession): Promise<DashboardLocation[]> {
  const locationIds = normalizeOperatorLocationIds(session.operator.locationId, session.operator.locationIds ?? []);
  const appConfigs = await Promise.all(
    locationIds.map((locationId) =>
      requestJson({
        apiBaseUrl: session.apiBaseUrl,
        path: "/app-config",
        query: { locationId },
        schema: appConfigSchema
      })
    )
  );

  return appConfigs.map((appConfig) => ({
    locationId: appConfig.brand.locationId,
    locationName: appConfig.brand.locationName,
    marketLabel: appConfig.brand.marketLabel,
    appConfig
  }));
}

export async function fetchOperatorOrders(session: OperatorSession, locationId: string) {
  const orders = await requestJson({
    apiBaseUrl: session.apiBaseUrl,
    accessToken: session.accessToken,
    path: "/admin/orders",
    query: { locationId },
    schema: ordersSchema
  });

  return filterVisibleOrders(orders as OperatorOrder[]);
}

export async function fetchOperatorSnapshot(
  session: OperatorSession,
  locationId: string | null
): Promise<OperatorDashboardSnapshot> {
  const capabilitySet = new Set(session.operator.capabilities);
  const query = locationId ? { locationId } : undefined;
  const fallbackLocationId = locationId ?? session.operator.locationId;
  const [appConfig, orders, menu, cards, discountCodeResponse, storeConfig, teamResponse] = await Promise.all([
    locationId
      ? requestJson({
          apiBaseUrl: session.apiBaseUrl,
          path: "/app-config",
          query,
          schema: appConfigSchema
        })
      : Promise.resolve(null),
    capabilitySet.has("orders:read")
      ? locationId
        ? requestJson({
            apiBaseUrl: session.apiBaseUrl,
            accessToken: session.accessToken,
            path: "/admin/orders",
            query,
            schema: ordersSchema
          })
        : Promise.resolve([] as z.output<typeof ordersSchema>)
      : Promise.resolve([] as z.output<typeof ordersSchema>),
    capabilitySet.has("menu:read")
      ? locationId
        ? requestJson({
            apiBaseUrl: session.apiBaseUrl,
            accessToken: session.accessToken,
            path: "/admin/menu",
            query,
            schema: operatorMenuResponseSchema
          })
        : Promise.resolve(operatorMenuResponseSchema.parse({ locationId: fallbackLocationId, categories: [] }))
      : Promise.resolve(operatorMenuResponseSchema.parse({ locationId: fallbackLocationId, categories: [] })),
    capabilitySet.has("menu:read")
      ? locationId
        ? requestJson({
            apiBaseUrl: session.apiBaseUrl,
            accessToken: session.accessToken,
            path: "/admin/cards",
            query,
            schema: homeNewsCardsResponseSchema
          })
        : Promise.resolve(homeNewsCardsResponseSchema.parse({ locationId: fallbackLocationId, cards: [] }))
      : Promise.resolve(homeNewsCardsResponseSchema.parse({ locationId: fallbackLocationId, cards: [] })),
    capabilitySet.has("menu:read")
      ? locationId
        ? requestJson({
            apiBaseUrl: session.apiBaseUrl,
            accessToken: session.accessToken,
            path: "/admin/discount-codes",
            query,
            schema: discountCodeListResponseSchema
          })
        : Promise.resolve(discountCodeListResponseSchema.parse({ discountCodes: [] }))
      : Promise.resolve(discountCodeListResponseSchema.parse({ discountCodes: [] })),
    capabilitySet.has("store:read")
      ? locationId
        ? requestJson({
            apiBaseUrl: session.apiBaseUrl,
            accessToken: session.accessToken,
            path: "/admin/store/config",
            query,
            schema: adminStoreConfigSchema
          })
        : Promise.resolve(null)
      : Promise.resolve(null),
    capabilitySet.has("team:read")
      ? locationId
        ? requestJson({
            apiBaseUrl: session.apiBaseUrl,
            accessToken: session.accessToken,
            path: "/admin/staff",
            query,
            schema: operatorUserListResponseSchema
          })
        : Promise.resolve(operatorUserListResponseSchema.parse({ users: [] }))
      : Promise.resolve(operatorUserListResponseSchema.parse({ users: [] }))
  ]);

  return {
    appConfig,
    orders: filterVisibleOrders(orders as OperatorOrder[]),
    menu,
    cards: cards.cards.map((card) => ({
      ...card
    })),
    discountCodes: discountCodeResponse.discountCodes,
    storeConfig,
    team: teamResponse.users
  };
}

export function fetchOperatorOnboardingSummary(session: OperatorSession, locationId: string) {
  return requestJson({
    apiBaseUrl: session.apiBaseUrl,
    accessToken: session.accessToken,
    path: "/admin/onboarding",
    query: { locationId },
    schema: onboardingSummarySchema
  });
}

export function updateOperatorOnboarding(
  session: OperatorSession,
  locationId: string,
  input: z.input<typeof operatorOnboardingUpdateSchema>
) {
  return requestJson({
    apiBaseUrl: session.apiBaseUrl,
    accessToken: session.accessToken,
    path: "/admin/onboarding",
    query: { locationId },
    method: "PATCH",
    body: operatorOnboardingUpdateSchema.parse(input),
    schema: onboardingSummarySchema
  });
}

export function submitOperatorOnboardingReview(session: OperatorSession, locationId: string) {
  return requestJson({
    apiBaseUrl: session.apiBaseUrl,
    accessToken: session.accessToken,
    path: "/admin/onboarding/submit-review",
    query: { locationId },
    method: "POST",
    body: {},
    schema: onboardingSummarySchema
  });
}

function requireSelectedLocationId(locationId: string | null) {
  if (!locationId) {
    throw new Error("Choose a specific location before managing store settings.");
  }

  return locationId;
}

export function updateOperatorOrderStatus(
  session: OperatorSession,
  locationId: string | null,
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
    query: { locationId: requireSelectedLocationId(locationId) },
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
  locationId: string | null,
  input: Parameters<typeof normalizeMenuItemCreateForm>[0]
) {
  return requestJson({
    apiBaseUrl: session.apiBaseUrl,
    accessToken: session.accessToken,
    path: "/admin/menu",
    query: { locationId: requireSelectedLocationId(locationId) },
    method: "POST",
    body: adminMenuItemCreateSchema.parse(normalizeMenuItemCreateForm(input)),
    schema: operatorMenuItemSchema
  });
}

export async function uploadOperatorMenuItemImage(
  session: OperatorSession,
  locationId: string | null,
  itemId: string,
  file: File
) {
  const upload = await requestJson({
    apiBaseUrl: session.apiBaseUrl,
    accessToken: session.accessToken,
    path: `/admin/menu/${itemId}/image-upload`,
    query: { locationId: requireSelectedLocationId(locationId) },
    method: "POST",
    body: adminMenuItemImageUploadRequestSchema.parse({
      fileName: file.name,
      contentType: file.type || "application/octet-stream",
      sizeBytes: file.size
    }),
    schema: adminMenuItemImageUploadResponseSchema
  });

  await uploadBinary({
    uploadUrl: upload.uploadUrl,
    method: upload.uploadMethod,
    headers: upload.uploadHeaders,
    body: file
  });
  await uploadMenuItemImageVariants(file, upload.variantUploads);

  return upload.assetUrl;
}

export function updateOperatorMenuItem(
  session: OperatorSession,
  locationId: string | null,
  itemId: string,
  input: Parameters<typeof normalizeMenuItemForm>[0]
) {
  return requestJson({
    apiBaseUrl: session.apiBaseUrl,
    accessToken: session.accessToken,
    path: `/admin/menu/${itemId}`,
    query: { locationId: requireSelectedLocationId(locationId) },
    method: "PUT",
    body: normalizeMenuItemForm(input),
    schema: operatorMenuItemSchema
  });
}

export function updateOperatorMenuItemVisibility(
  session: OperatorSession,
  locationId: string | null,
  itemId: string,
  visible: boolean
) {
  return requestJson({
    apiBaseUrl: session.apiBaseUrl,
    accessToken: session.accessToken,
    path: `/admin/menu/${itemId}/visibility`,
    query: { locationId: requireSelectedLocationId(locationId) },
    method: "PATCH",
    body: adminMenuItemVisibilityUpdateSchema.parse({ visible }),
    schema: operatorMenuItemSchema
  });
}

export function deleteOperatorMenuItem(session: OperatorSession, locationId: string | null, itemId: string) {
  return requestJson({
    apiBaseUrl: session.apiBaseUrl,
    accessToken: session.accessToken,
    path: `/admin/menu/${itemId}`,
    query: { locationId: requireSelectedLocationId(locationId) },
    method: "DELETE",
    schema: adminMutationSuccessSchema
  });
}

export function replaceOperatorNewsCards(session: OperatorSession, locationId: string | null, cards: OperatorNewsCard[]) {
  const selectedLocationId = requireSelectedLocationId(locationId);
  return requestJson({
    apiBaseUrl: session.apiBaseUrl,
    accessToken: session.accessToken,
    path: "/admin/cards",
    query: { locationId: selectedLocationId },
    method: "PUT",
    body: normalizeNewsCardsPayload({
      locationId: selectedLocationId,
      cards
    }),
    schema: homeNewsCardsResponseSchema
  });
}

export function createOperatorDiscountCode(
  session: OperatorSession,
  locationId: string | null,
  input: Omit<z.input<typeof createDiscountCodeRequestSchema>, "locationId">
) {
  const selectedLocationId = requireSelectedLocationId(locationId);
  return requestJson({
    apiBaseUrl: session.apiBaseUrl,
    accessToken: session.accessToken,
    path: "/admin/discount-codes",
    query: { locationId: selectedLocationId },
    method: "POST",
    body: createDiscountCodeRequestSchema.parse({
      locationId: selectedLocationId,
      ...input
    }),
    schema: discountCodeSchema
  });
}

export function updateOperatorDiscountCode(
  session: OperatorSession,
  locationId: string | null,
  discountCodeId: string,
  input: Omit<z.input<typeof updateDiscountCodeRequestSchema>, "locationId">
) {
  const selectedLocationId = requireSelectedLocationId(locationId);
  return requestJson({
    apiBaseUrl: session.apiBaseUrl,
    accessToken: session.accessToken,
    path: `/admin/discount-codes/${discountCodeId}`,
    query: { locationId: selectedLocationId },
    method: "PATCH",
    body: updateDiscountCodeRequestSchema.parse({
      locationId: selectedLocationId,
      ...input
    }),
    schema: discountCodeSchema
  });
}

export function updateOperatorStoreConfig(
  session: OperatorSession,
  locationId: string | null,
  input: Parameters<typeof normalizeStoreConfigForm>[0]
) {
  return requestJson({
    apiBaseUrl: session.apiBaseUrl,
    accessToken: session.accessToken,
    path: "/admin/store/config",
    query: { locationId: requireSelectedLocationId(locationId) },
    method: "PUT",
    body: adminStoreConfigUpdateSchema.parse(normalizeStoreConfigForm(input)),
    schema: adminStoreConfigSchema
  });
}

export function createOperatorStaffUser(
  session: OperatorSession,
  locationId: string | null,
  input: Parameters<typeof normalizeOperatorUserCreateForm>[0]
) {
  return requestJson({
    apiBaseUrl: session.apiBaseUrl,
    accessToken: session.accessToken,
    path: "/admin/staff",
    query: { locationId: requireSelectedLocationId(locationId) },
    method: "POST",
    body: normalizeOperatorUserCreateForm(input),
    schema: operatorUserSchema
  });
}

export function updateOperatorStaffUser(
  session: OperatorSession,
  locationId: string | null,
  operatorUserId: string,
  input: Parameters<typeof normalizeOperatorUserUpdateForm>[0]
) {
  return requestJson({
    apiBaseUrl: session.apiBaseUrl,
    accessToken: session.accessToken,
    path: `/admin/staff/${operatorUserId}`,
    query: { locationId: requireSelectedLocationId(locationId) },
    method: "PATCH",
    body: normalizeOperatorUserUpdateForm(input),
    schema: operatorUserSchema
  });
}

const adminOrderStreamSnapshotSchema = z.object({
  type: z.literal("snapshot"),
  orders: z.array(orderSchema)
});

const adminOrderStreamUpdateSchema = z.object({
  type: z.literal("order_update"),
  order: orderSchema
});

export type AdminOrderStreamEvent =
  | { type: "snapshot"; orders: OperatorOrder[] }
  | { type: "order_update"; order: OperatorOrder };

export function subscribeToAdminOrderStream(params: {
  session: OperatorSession;
  locationId: string | null;
  onEvent: (event: AdminOrderStreamEvent) => void;
  onError: () => void;
}): () => void {
  const { session, locationId, onEvent, onError } = params;
  const query = locationId && locationId !== "all" ? `?locationId=${encodeURIComponent(locationId)}` : "";
  const url = `${requireApiBaseUrl(session.apiBaseUrl)}/admin/orders/stream${query}`;
  const headers = buildOperatorHeaders(session.accessToken);

  let closed = false;
  let abortController = new AbortController();

  const connect = () => {
    if (closed) {
      return;
    }
    abortController = new AbortController();
    fetch(url, { headers, signal: abortController.signal })
      .then(async (response) => {
        if (!response.ok || !response.body) {
          throw new Error(`Stream request failed with status ${response.status}`);
        }
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        while (true) {
          const { done, value } = await reader.read();
          if (done || closed) {
            break;
          }
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";
          for (const line of lines) {
            if (!line.startsWith("data:")) {
              continue;
            }
            const raw = line.slice(5).trim();
            let parsed: unknown;
            try {
              parsed = JSON.parse(raw);
            } catch {
              continue;
            }
            const snapshot = adminOrderStreamSnapshotSchema.safeParse(parsed);
            if (snapshot.success) {
              onEvent({ type: "snapshot", orders: filterVisibleOrders(snapshot.data.orders as unknown as OperatorOrder[]) });
              continue;
            }
            const update = adminOrderStreamUpdateSchema.safeParse(parsed);
            if (update.success) {
              onEvent({ type: "order_update", order: update.data.order as unknown as OperatorOrder });
            }
          }
        }
        // stream closed normally — notify so caller can reconnect or fall back to polling
        if (!closed) {
          onError();
        }
      })
      .catch(() => {
        if (closed) {
          return;
        }
        onError();
      });
  };

  connect();

  return () => {
    closed = true;
    abortController.abort();
  };
}
