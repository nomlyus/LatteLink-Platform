export type { paths as Paths } from "./generated/types.js";
import {
  appleExchangeRequestSchema,
  customerDevAccessRequestSchema,
  customerProfileRequestSchema,
  logoutRequestSchema,
  meResponseSchema,
  passkeyChallengeRequestSchema,
  passkeyChallengeResponseSchema,
  passkeyVerifyRequestSchema,
  refreshRequestSchema
} from "@lattelink/contracts-auth";
import {
  appConfigSchema,
  homeNewsCardsResponseSchema,
  menuResponseSchema,
  mobileBrandBootstrapRequestSchema,
  mobileBrandBootstrapSchema,
  mobileExperienceDocumentSchema,
  storeConfigResponseSchema
} from "@lattelink/contracts-catalog";
import { authSessionSchema } from "@lattelink/contracts-core";
import {
  checkoutDraftSchema,
  createCheckoutDraftRequestSchema,
  orderQuoteSchema,
  orderSchema,
  stripeMobilePaymentSessionRequestSchema,
  stripeMobilePaymentFinalizeRequestSchema,
  stripeMobilePaymentFinalizeResponseSchema,
  stripeMobilePaymentSessionResponseSchema,
  quoteRequestSchema
} from "@lattelink/contracts-orders";
import { z } from "zod";

const authSuccessSchema = z.object({
  success: z.literal(true)
});

export const UNABLE_TO_REACH_BACKEND_MESSAGE = "Unable to reach backend.";

export type ApiClientOptions = {
  baseUrl: string;
  accessToken?: string;
  /** Public branded-app selector; backend persistence remains the authorization boundary. */
  brandId?: string;
};

export type ApiRequestOptions = {
  signal?: AbortSignal;
};

export class ApiHttpError extends Error {
  constructor(
    readonly statusCode: number,
    message: string
  ) {
    super(message);
    this.name = "ApiHttpError";
  }
}

export type MobileBrandBootstrapErrorKind = "brand_not_found" | "invalid_response";

export class MobileBrandBootstrapError extends Error {
  constructor(readonly kind: MobileBrandBootstrapErrorKind) {
    super(kind === "brand_not_found" ? "Branded app configuration was not found." : "Branded app configuration response is invalid.");
    this.name = "MobileBrandBootstrapError";
  }
}

type SessionRefreshHandler = () => Promise<z.output<typeof authSessionSchema> | null>;

type SharedAuthState = {
  accessToken?: string;
  sessionRefreshHandler?: SessionRefreshHandler;
  refreshInFlight?: Promise<z.output<typeof authSessionSchema> | null>;
};

function normalizeBaseUrl(baseUrl: string) {
  return baseUrl.trim().replace(/\/+$/, "");
}

function toReachabilityError(error: unknown) {
  if (error instanceof Error && error.message === UNABLE_TO_REACH_BACKEND_MESSAGE) {
    return error;
  }

  return new Error(UNABLE_TO_REACH_BACKEND_MESSAGE, {
    cause: error instanceof Error ? error : undefined
  });
}

function isAbortRequestError(error: unknown) {
  return error instanceof Error && (error.name === "AbortError" || error.message.toLowerCase().includes("aborted"));
}

export function isBackendReachabilityError(error: unknown) {
  return error instanceof Error && error.message === UNABLE_TO_REACH_BACKEND_MESSAGE;
}

export class GazelleApiClient {
  private readonly auth: SharedAuthState;

  constructor(
    private readonly options: ApiClientOptions,
    private readonly locationId?: string,
    auth?: SharedAuthState
  ) {
    this.auth = auth ?? {};
  }

  setAccessToken(token?: string) {
    this.auth.accessToken = token;
  }

  setSessionRefreshHandler(handler?: SessionRefreshHandler) {
    this.auth.sessionRefreshHandler = handler;
  }

  async get<T>(path: string, options?: ApiRequestOptions): Promise<T> {
    return this.request<T>("GET", path, undefined, options);
  }

  async post<T>(path: string, body: unknown, options?: ApiRequestOptions): Promise<T> {
    return this.request<T>("POST", path, body, options);
  }

  async put<T>(path: string, body: unknown, options?: ApiRequestOptions): Promise<T> {
    return this.request<T>("PUT", path, body, options);
  }

  async delete<T>(path: string, options?: ApiRequestOptions): Promise<T> {
    return this.request<T>("DELETE", path, undefined, options);
  }

  /** Returns an immutable location-scoped client; the shared client's location is never mutated. */
  forLocation(locationId: string): GazelleApiClient {
    const normalizedLocationId = locationId.trim();
    if (!normalizedLocationId) {
      throw new Error("A runtime locationId is required for location-scoped requests.");
    }

    return new GazelleApiClient(this.options, normalizedLocationId, this.auth);
  }

  async appleExchange(
    input: z.input<typeof appleExchangeRequestSchema>
  ): Promise<z.output<typeof authSessionSchema>> {
    appleExchangeRequestSchema.parse(input);
    const data = await this.post<unknown>("/auth/apple/exchange", input);
    return authSessionSchema.parse(data);
  }

  async devAccess(
    input: z.input<typeof customerDevAccessRequestSchema>
  ): Promise<z.output<typeof authSessionSchema>> {
    customerDevAccessRequestSchema.parse(input);
    const data = await this.post<unknown>("/auth/dev-access", input);
    return authSessionSchema.parse(data);
  }

  async passkeyRegisterChallenge(
    input: z.input<typeof passkeyChallengeRequestSchema>
  ): Promise<z.output<typeof passkeyChallengeResponseSchema>> {
    passkeyChallengeRequestSchema.parse(input);
    const data = await this.post<unknown>("/auth/passkey/register/challenge", input);
    return passkeyChallengeResponseSchema.parse(data);
  }

  async passkeyRegisterVerify(
    input: z.input<typeof passkeyVerifyRequestSchema>
  ): Promise<z.output<typeof authSessionSchema>> {
    passkeyVerifyRequestSchema.parse(input);
    const data = await this.post<unknown>("/auth/passkey/register/verify", input);
    return authSessionSchema.parse(data);
  }

  async passkeyAuthChallenge(
    input: z.input<typeof passkeyChallengeRequestSchema>
  ): Promise<z.output<typeof passkeyChallengeResponseSchema>> {
    passkeyChallengeRequestSchema.parse(input);
    const data = await this.post<unknown>("/auth/passkey/auth/challenge", input);
    return passkeyChallengeResponseSchema.parse(data);
  }

  async passkeyAuthVerify(
    input: z.input<typeof passkeyVerifyRequestSchema>
  ): Promise<z.output<typeof authSessionSchema>> {
    passkeyVerifyRequestSchema.parse(input);
    const data = await this.post<unknown>("/auth/passkey/auth/verify", input);
    return authSessionSchema.parse(data);
  }

  async refreshSession(input: z.input<typeof refreshRequestSchema>): Promise<z.output<typeof authSessionSchema>> {
    refreshRequestSchema.parse(input);
    const data = await this.post<unknown>("/auth/refresh", input);
    return authSessionSchema.parse(data);
  }

  async logout(input: z.input<typeof logoutRequestSchema>): Promise<{ success: true }> {
    logoutRequestSchema.parse(input);
    return this.post<{ success: true }>("/auth/logout", input);
  }

  async deleteAccount(): Promise<z.output<typeof authSuccessSchema>> {
    const data = await this.delete<unknown>("/auth/account");
    return authSuccessSchema.parse(data);
  }

  async me(): Promise<z.output<typeof meResponseSchema>> {
    const data = await this.get<unknown>("/auth/me");
    return meResponseSchema.parse(data);
  }

  async saveCustomerProfile(
    input: z.input<typeof customerProfileRequestSchema>
  ): Promise<z.output<typeof meResponseSchema>> {
    customerProfileRequestSchema.parse(input);
    const data = await this.post<unknown>("/auth/profile", input);
    return meResponseSchema.parse(data);
  }

  private brandQuery(): string {
    const brandId = this.options.brandId?.trim();
    if (!brandId) throw new Error("A public brandId is required for customer runtime requests.");
    return `?brandId=${encodeURIComponent(brandId)}`;
  }

  private locationQuery(): string {
    const brandId = this.options.brandId?.trim();
    const locationId = this.locationId?.trim();
    if (!brandId || !locationId) {
      throw new Error("Public brandId and locationId are required for customer catalog requests.");
    }
    const query = new URLSearchParams({ brandId, locationId });
    return `?${query.toString()}`;
  }

  async menu(options?: ApiRequestOptions): Promise<z.output<typeof menuResponseSchema>> {
    const data = await this.get<unknown>(`/menu${this.locationQuery()}`, options);
    return menuResponseSchema.parse(data);
  }

  async storeConfig(options?: ApiRequestOptions): Promise<z.output<typeof storeConfigResponseSchema>> {
    const data = await this.get<unknown>(`/store/config${this.locationQuery()}`, options);
    return storeConfigResponseSchema.parse(data);
  }

  async homeNewsCards(options?: ApiRequestOptions): Promise<z.output<typeof homeNewsCardsResponseSchema>> {
    const data = await this.get<unknown>(`/store/cards${this.locationQuery()}`, options);
    return homeNewsCardsResponseSchema.parse(data);
  }

  async appConfig(options?: ApiRequestOptions): Promise<z.output<typeof appConfigSchema>> {
    const data = await this.get<unknown>(`/app-config${this.locationQuery()}`, options);
    return appConfigSchema.parse(data);
  }

  async mobileExperience(options?: ApiRequestOptions): Promise<z.output<typeof mobileExperienceDocumentSchema>> {
    const data = await this.get<unknown>(`/mobile-experience${this.locationQuery()}`, options);
    return mobileExperienceDocumentSchema.parse(data);
  }

  async mobileBrandBootstrap(brandId: string): Promise<z.output<typeof mobileBrandBootstrapSchema>> {
    const request = mobileBrandBootstrapRequestSchema.parse({ brandId });
    let data: unknown;
    try {
      data = await this.get<unknown>(`/mobile/bootstrap?brandId=${encodeURIComponent(request.brandId)}`);
    } catch (error) {
      if (isBackendReachabilityError(error)) {
        throw error;
      }
      if (error instanceof ApiHttpError && error.statusCode === 404) {
        throw new MobileBrandBootstrapError("brand_not_found");
      }
      if (error instanceof ApiHttpError && error.statusCode >= 500) {
        throw toReachabilityError(error);
      }
      throw new MobileBrandBootstrapError("invalid_response");
    }

    const parsed = mobileBrandBootstrapSchema.safeParse(data);
    if (!parsed.success || parsed.data.brand.brandId !== request.brandId) {
      throw new MobileBrandBootstrapError("invalid_response");
    }
    return parsed.data;
  }

  async quoteOrder(input: z.input<typeof quoteRequestSchema>): Promise<z.output<typeof orderQuoteSchema>> {
    quoteRequestSchema.parse(input);
    const data = await this.post<unknown>(`/orders/quote${this.brandQuery()}`, input);
    return orderQuoteSchema.parse(data);
  }

  async createCheckoutDraft(
    input: z.input<typeof createCheckoutDraftRequestSchema>
  ): Promise<z.output<typeof checkoutDraftSchema>> {
    createCheckoutDraftRequestSchema.parse(input);
    const data = await this.post<unknown>(`/orders/checkouts${this.brandQuery()}`, input);
    return checkoutDraftSchema.parse(data);
  }

  async createStripeMobilePaymentSession(
    input: z.input<typeof stripeMobilePaymentSessionRequestSchema>
  ): Promise<z.output<typeof stripeMobilePaymentSessionResponseSchema>> {
    stripeMobilePaymentSessionRequestSchema.parse(input);
    const data = await this.post<unknown>(`/payments/stripe/mobile-session${this.brandQuery()}`, input);
    return stripeMobilePaymentSessionResponseSchema.parse(data);
  }

  async finalizeStripeMobilePayment(
    input: z.input<typeof stripeMobilePaymentFinalizeRequestSchema>
  ): Promise<z.output<typeof stripeMobilePaymentFinalizeResponseSchema>> {
    stripeMobilePaymentFinalizeRequestSchema.parse(input);
    const data = await this.post<unknown>(`/payments/stripe/mobile-session/finalize${this.brandQuery()}`, input);
    return stripeMobilePaymentFinalizeResponseSchema.parse(data);
  }

  async listOrders(): Promise<Array<z.output<typeof orderSchema>>> {
    const data = await this.get<unknown>("/orders");
    return z.array(orderSchema).parse(data);
  }

  async getOrder(orderId: string): Promise<z.output<typeof orderSchema>> {
    z.string().uuid().parse(orderId);
    const data = await this.get<unknown>(`/orders/${orderId}`);
    return orderSchema.parse(data);
  }

  async cancelOrder(orderId: string, input: { reason: string }): Promise<z.output<typeof orderSchema>> {
    z.string().uuid().parse(orderId);
    const data = await this.post<unknown>(`/orders/${orderId}/cancel`, input);
    return orderSchema.parse(data);
  }

  private async refreshSessionSafely() {
    if (!this.auth.sessionRefreshHandler) {
      return null;
    }

    if (!this.auth.refreshInFlight) {
      this.auth.refreshInFlight = (async () => {
        try {
          const nextSession = await this.auth.sessionRefreshHandler?.();
          if (nextSession?.accessToken) {
            this.setAccessToken(nextSession.accessToken);
          }
          return nextSession ?? null;
        } finally {
          this.auth.refreshInFlight = undefined;
        }
      })();
    }

    return this.auth.refreshInFlight;
  }

  private async request<T>(
    method: "GET" | "POST" | "PUT" | "DELETE",
    path: string,
    body?: unknown,
    options?: ApiRequestOptions,
    hasRetriedUnauthorized = false
  ): Promise<T> {
    const baseUrl = normalizeBaseUrl(this.options.baseUrl);
    if (!baseUrl) {
      throw toReachabilityError(new Error("API base URL is not configured."));
    }

    const effectiveToken = this.auth.accessToken ?? this.options.accessToken;
    const headers: Record<string, string> = {};
    if (effectiveToken) {
      headers.Authorization = `Bearer ${effectiveToken}`;
    }
    if (body !== undefined) {
      headers["Content-Type"] = "application/json";
    }

    let response: Response;

    try {
      response = await fetch(`${baseUrl}${path}`, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: options?.signal
      });
    } catch (error) {
      if (isAbortRequestError(error)) {
        throw error;
      }
      throw toReachabilityError(error);
    }

    const canRetryUnauthorized =
      response.status === 401 &&
      !hasRetriedUnauthorized &&
      Boolean(effectiveToken) &&
      path !== "/auth/refresh" &&
      path !== "/auth/logout";

    if (canRetryUnauthorized) {
      const nextSession = await this.refreshSessionSafely();
      if (nextSession?.accessToken) {
        return this.request<T>(method, path, body, options, true);
      }
    }

    if (!response.ok) {
      const text = await response.text();
      const suffix = text ? `: ${text}` : "";
      throw new ApiHttpError(response.status, `Request failed (${response.status})${suffix}`);
    }

    if (response.status === 204) {
      return undefined as T;
    }

    return (await response.json()) as T;
  }
}
