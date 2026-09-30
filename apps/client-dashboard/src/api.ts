import { z } from "zod";
import {
  adminMenuItemCreateSchema,
  adminMenuCategoryCreateSchema,
  adminMenuCategoryReorderSchema,
  adminMenuCategorySchema,
  adminMenuCategoryUpdateSchema,
  adminMenuItemImageUploadRequestSchema,
  adminMenuItemImageUploadResponseSchema,
  adminMenuItemVisibilityUpdateSchema,
  adminMutationSuccessSchema,
  adminModifierGroupCreateSchema,
  adminModifierGroupUpdateSchema,
  modifierGroupSchema,
  adminStoreConfigSchema,
  appConfigSchema
} from "@lattelink/contracts-catalog";
import {
  reportingQueryRequestSchema,
  reportingResponseSchema,
  type ReportingResponse
} from "@lattelink/contracts-reporting";
import {
  orderSchema
} from "@lattelink/contracts-orders";
import {
  filterVisibleOrders,
  normalizeMenuItemCreateForm,
  normalizeMenuItemForm,
  operatorMenuItemSchema,
  operatorMenuResponseSchema,
  type OperatorOrder
} from "./model";
import type { OperatorSession } from "./features/auth/auth-types";

export type { OperatorSession } from "./features/auth/auth-types";

const ordersSchema = z.array(orderSchema);
const unreachableBackendMessage = "Unable to reach backend.";

export type DashboardLocation = {
  locationId: string;
  locationName: string;
  storeName?: string;
  marketLabel: string;
  timezone?: string;
  appConfig: z.output<typeof appConfigSchema>;
};
export type OperatorReportingResponse = ReportingResponse;
export type OperatorDashboardSnapshot = {
  appConfig: z.output<typeof appConfigSchema> | null;
  storeConfig: z.output<typeof adminStoreConfigSchema> | null;
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

export function normalizeApiBaseUrl(input: string) {
  const trimmed = input.trim();
  if (!trimmed) {
    return "";
  }

  return trimmed.replace(/\/+$/, "").endsWith("/v1") ? trimmed.replace(/\/+$/, "") : `${trimmed.replace(/\/+$/, "")}/v1`;
}

export function resolveDefaultApiBaseUrl() {
  const configuredApiBaseUrl = normalizeApiBaseUrl(process.env.NEXT_PUBLIC_API_BASE_URL ?? "");
  if (configuredApiBaseUrl) {
    return configuredApiBaseUrl;
  }

  // Keep the canonical dev dashboard usable if its Vercel preview env is omitted.
  // Never infer a production API endpoint from the browser hostname.
  if (typeof window !== "undefined" && window.location.hostname === "app-dev.nomly.us") {
    return "https://api-dev.nomly.us/v1";
  }

  return "";
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

function requireApiBaseUrl(apiBaseUrl: string) {
  const normalized = normalizeApiBaseUrl(apiBaseUrl);
  if (!normalized) {
    throw new Error(unreachableBackendMessage);
  }

  return normalized;
}

export async function requestJson<TSchema extends z.ZodTypeAny>(params: {
  apiBaseUrl: string;
  accessToken?: string;
  path: string;
  query?: Record<string, string | undefined>;
  method?: RequestMethod;
  body?: unknown;
  signal?: AbortSignal;
  schema: TSchema;
}): Promise<z.output<TSchema>> {
  const { apiBaseUrl, accessToken, path, query, method = "GET", body, signal, schema } = params;
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
        body: body === undefined ? undefined : JSON.stringify(body),
        signal
      });
    } catch (error) {
      if (signal?.aborted) throw error;
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

export async function fetchDashboardLocations(session: OperatorSession): Promise<DashboardLocation[]> {
  const locationIds = normalizeOperatorLocationIds(session.operator.locationId, session.operator.locationIds ?? []);
  const canReadStoreConfig = new Set(session.operator.capabilities).has("store:read");
  const locations = await Promise.all(
    locationIds.map(async (locationId) => {
      const [appConfig, storeConfig] = await Promise.all([
        requestJson({
          apiBaseUrl: session.apiBaseUrl,
          accessToken: session.accessToken,
          path: "/admin/app-config",
          query: { locationId },
          schema: appConfigSchema
        }),
        canReadStoreConfig ? fetchOperatorLocationStoreConfig(session, locationId) : Promise.resolve(null)
      ]);
      return { appConfig, storeConfig };
    })
  );

  return locations.map(({ appConfig, storeConfig }) => ({
    locationId: appConfig.brand.locationId,
    locationName: appConfig.brand.locationName,
    storeName: storeConfig?.storeName,
    marketLabel: appConfig.brand.marketLabel,
    timezone: storeConfig?.timezone ?? "America/Detroit",
    appConfig
  }));
}

export function fetchOperatorReporting(
  session: OperatorSession,
  locationIds: string[],
  input: { start: string; end: string; granularity: "hour" | "day" },
  signal?: AbortSignal
) {
  return requestJson({
    apiBaseUrl: session.apiBaseUrl,
    accessToken: session.accessToken,
    path: "/admin/reporting/query",
    method: "POST",
    body: reportingQueryRequestSchema.parse({ locationIds, ...input }),
    signal,
    schema: reportingResponseSchema
  });
}

export function fetchOperatorLocationStoreConfig(session: OperatorSession, locationId: string, signal?: AbortSignal) {
  return requestJson({
    apiBaseUrl: session.apiBaseUrl,
    accessToken: session.accessToken,
    path: "/admin/store/config",
    query: { locationId },
    signal,
    schema: adminStoreConfigSchema
  });
}

export async function fetchOperatorOrders(session: OperatorSession, locationId: string, signal?: AbortSignal) {
  const orders = await requestJson({
    apiBaseUrl: session.apiBaseUrl,
    accessToken: session.accessToken,
    path: "/admin/orders",
    query: { locationId },
    signal,
    schema: ordersSchema
  });

  return filterVisibleOrders(orders as OperatorOrder[]);
}

export function fetchOperatorMenu(session: OperatorSession, locationId: string, signal?: AbortSignal) {
  return requestJson({
    apiBaseUrl: session.apiBaseUrl,
    accessToken: session.accessToken,
    path: "/admin/menu",
    query: { locationId: requireSelectedLocationId(locationId) },
    signal,
    schema: operatorMenuResponseSchema
  });
}

export async function fetchOperatorSnapshot(
  session: OperatorSession,
  locationId: string | null
): Promise<OperatorDashboardSnapshot> {
  const capabilitySet = new Set(session.operator.capabilities);
  const query = locationId ? { locationId } : undefined;
  const [appConfig, storeConfig] = await Promise.all([
    locationId
      ? requestJson({
          apiBaseUrl: session.apiBaseUrl,
          accessToken: session.accessToken,
          path: "/admin/app-config",
          query,
          schema: appConfigSchema
        })
      : Promise.resolve(null),
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
      : Promise.resolve(null)
  ]);

  return {
    appConfig,
    storeConfig
  };
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
    status: "IN_PREP" | "READY" | "COMPLETED";
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

export function cancelAndRefundOperatorOrder(
  session: OperatorSession,
  locationId: string | null,
  orderId: string,
  input: { reason: string }
) {
  return requestJson({
    apiBaseUrl: session.apiBaseUrl,
    accessToken: session.accessToken,
    path: `/admin/orders/${orderId}/cancel-and-refund`,
    query: { locationId: requireSelectedLocationId(locationId) },
    method: "POST",
    body: { reason: input.reason.trim() },
    schema: orderSchema
  });
}

export function refundOperatorOrder(
  session: OperatorSession,
  locationId: string | null,
  orderId: string,
  input: { reason: string }
) {
  return requestJson({
    apiBaseUrl: session.apiBaseUrl,
    accessToken: session.accessToken,
    path: `/admin/orders/${orderId}/refund`,
    query: locationId ? { locationId } : {},
    method: "POST",
    body: { reason: input.reason.trim() },
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

export function createOperatorMenuCategory(
  session: OperatorSession,
  locationId: string | null,
  input: z.input<typeof adminMenuCategoryCreateSchema>
) {
  return requestJson({
    apiBaseUrl: session.apiBaseUrl,
    accessToken: session.accessToken,
    path: "/admin/menu/categories",
    query: { locationId: requireSelectedLocationId(locationId) },
    method: "POST",
    body: adminMenuCategoryCreateSchema.parse(input),
    schema: adminMenuCategorySchema
  });
}

export function updateOperatorMenuCategory(
  session: OperatorSession,
  locationId: string | null,
  categoryId: string,
  input: z.input<typeof adminMenuCategoryUpdateSchema>
) {
  return requestJson({
    apiBaseUrl: session.apiBaseUrl,
    accessToken: session.accessToken,
    path: `/admin/menu/categories/${categoryId}`,
    query: { locationId: requireSelectedLocationId(locationId) },
    method: "PUT",
    body: adminMenuCategoryUpdateSchema.parse({ ...input, categoryId }),
    schema: adminMenuCategorySchema
  });
}

export function reorderOperatorMenuCategories(session: OperatorSession, locationId: string | null, categoryIds: string[]) {
  return requestJson({
    apiBaseUrl: session.apiBaseUrl,
    accessToken: session.accessToken,
    path: "/admin/menu/categories/reorder",
    query: { locationId: requireSelectedLocationId(locationId) },
    method: "POST",
    body: adminMenuCategoryReorderSchema.parse({ categoryIds }),
    schema: operatorMenuResponseSchema
  });
}

export function deleteOperatorMenuCategory(session: OperatorSession, locationId: string | null, categoryId: string) {
  return requestJson({
    apiBaseUrl: session.apiBaseUrl,
    accessToken: session.accessToken,
    path: `/admin/menu/categories/${categoryId}`,
    query: { locationId: requireSelectedLocationId(locationId) },
    method: "DELETE",
    schema: adminMutationSuccessSchema
  });
}

export function createOperatorModifierGroup(
  session: OperatorSession,
  locationId: string | null,
  input: z.input<typeof adminModifierGroupCreateSchema>
) {
  return requestJson({
    apiBaseUrl: session.apiBaseUrl,
    accessToken: session.accessToken,
    path: "/admin/menu/modifier-groups",
    query: { locationId: requireSelectedLocationId(locationId) },
    method: "POST",
    body: adminModifierGroupCreateSchema.parse(input),
    schema: modifierGroupSchema
  });
}

export function updateOperatorModifierGroup(
  session: OperatorSession,
  locationId: string | null,
  modifierGroupId: string,
  input: z.input<typeof adminModifierGroupUpdateSchema>
) {
  return requestJson({
    apiBaseUrl: session.apiBaseUrl,
    accessToken: session.accessToken,
    path: `/admin/menu/modifier-groups/${modifierGroupId}`,
    query: { locationId: requireSelectedLocationId(locationId) },
    method: "PUT",
    body: adminModifierGroupUpdateSchema.parse({ ...input, id: modifierGroupId }),
    schema: modifierGroupSchema
  });
}

export function deleteOperatorModifierGroup(session: OperatorSession, locationId: string | null, modifierGroupId: string) {
  return requestJson({
    apiBaseUrl: session.apiBaseUrl,
    accessToken: session.accessToken,
    path: `/admin/menu/modifier-groups/${modifierGroupId}`,
    query: { locationId: requireSelectedLocationId(locationId) },
    method: "DELETE",
    schema: adminMutationSuccessSchema
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

export type AdminOrderStreamState = "connecting" | "connected" | "reconnecting" | "unavailable";

export function subscribeToAdminOrderStream(params: {
  session: OperatorSession;
  locationId: string | null;
  onEvent: (event: AdminOrderStreamEvent) => void;
  onStateChange: (state: AdminOrderStreamState) => void;
}): () => void {
  const { session, locationId, onEvent, onStateChange } = params;
  const query = locationId && locationId !== "all" ? `?locationId=${encodeURIComponent(locationId)}` : "";
  const url = `${requireApiBaseUrl(session.apiBaseUrl)}/admin/orders/stream${query}`;
  const headers = buildOperatorHeaders(session.accessToken);

  let closed = false;
  let abortController: AbortController | null = null;
  let retryTimer: ReturnType<typeof setTimeout> | null = null;
  let failures = 0;

  const scheduleReconnect = () => {
    if (closed) return;
    failures += 1;
    onStateChange(failures >= 3 ? "unavailable" : "reconnecting");
    const delay = Math.min(30_000, 1_000 * 2 ** Math.min(failures - 1, 5));
    retryTimer = setTimeout(connect, delay);
  };

  const connect = () => {
    if (closed) {
      return;
    }
    retryTimer = null;
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
              failures = 0;
              onStateChange("connected");
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
          scheduleReconnect();
        }
      })
      .catch(() => {
        if (closed) {
          return;
        }
        scheduleReconnect();
      });
  };

  onStateChange("connecting");
  connect();

  return () => {
    closed = true;
    abortController?.abort();
    if (retryTimer !== null) clearTimeout(retryTimer);
  };
}
