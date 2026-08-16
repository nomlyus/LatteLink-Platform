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
  mobileExperienceDocumentSchema,
  storeConfigResponseSchema
} from "@lattelink/contracts-catalog";
import { authSessionSchema } from "@lattelink/contracts-core";
import {
  checkoutDraftSchema,
  createCheckoutDraftRequestSchema,
  createOrderRequestSchema,
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
  locationId?: string;
};

type SessionRefreshHandler = () => Promise<z.output<typeof authSessionSchema> | null>;

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

export function isBackendReachabilityError(error: unknown) {
  return error instanceof Error && error.message === UNABLE_TO_REACH_BACKEND_MESSAGE;
}

export class GazelleApiClient {
  private accessToken?: string;
  private sessionRefreshHandler?: SessionRefreshHandler;
  private refreshInFlight?: Promise<z.output<typeof authSessionSchema> | null>;

  constructor(private readonly options: ApiClientOptions) {}

  setAccessToken(token?: string) {
    this.accessToken = token;
  }

  setSessionRefreshHandler(handler?: SessionRefreshHandler) {
    this.sessionRefreshHandler = handler;
  }

  async get<T>(path: string): Promise<T> {
    return this.request<T>("GET", path);
  }

  async post<T>(path: string, body: unknown): Promise<T> {
    return this.request<T>("POST", path, body);
  }

  async put<T>(path: string, body: unknown): Promise<T> {
    return this.request<T>("PUT", path, body);
  }

  async delete<T>(path: string): Promise<T> {
    return this.request<T>("DELETE", path);
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

  private locationQuery(): string {
    const id = this.options.locationId?.trim();
    return id ? `?locationId=${encodeURIComponent(id)}` : "";
  }

  async menu(): Promise<z.output<typeof menuResponseSchema>> {
    const data = await this.get<unknown>(`/menu${this.locationQuery()}`);
    return menuResponseSchema.parse(data);
  }

  async storeConfig(): Promise<z.output<typeof storeConfigResponseSchema>> {
    const data = await this.get<unknown>(`/store/config${this.locationQuery()}`);
    return storeConfigResponseSchema.parse(data);
  }

  async homeNewsCards(): Promise<z.output<typeof homeNewsCardsResponseSchema>> {
    const data = await this.get<unknown>(`/store/cards${this.locationQuery()}`);
    return homeNewsCardsResponseSchema.parse(data);
  }

  async appConfig(): Promise<z.output<typeof appConfigSchema>> {
    const data = await this.get<unknown>(`/app-config${this.locationQuery()}`);
    return appConfigSchema.parse(data);
  }

  async mobileExperience(): Promise<z.output<typeof mobileExperienceDocumentSchema>> {
    const data = await this.get<unknown>(`/mobile-experience${this.locationQuery()}`);
    return mobileExperienceDocumentSchema.parse(data);
  }

  async quoteOrder(input: z.input<typeof quoteRequestSchema>): Promise<z.output<typeof orderQuoteSchema>> {
    quoteRequestSchema.parse(input);
    const data = await this.post<unknown>("/orders/quote", input);
    return orderQuoteSchema.parse(data);
  }

  async createOrder(input: z.input<typeof createOrderRequestSchema>): Promise<z.output<typeof orderSchema>> {
    createOrderRequestSchema.parse(input);
    const data = await this.post<unknown>("/orders", input);
    return orderSchema.parse(data);
  }

  async createCheckoutDraft(
    input: z.input<typeof createCheckoutDraftRequestSchema>
  ): Promise<z.output<typeof checkoutDraftSchema>> {
    createCheckoutDraftRequestSchema.parse(input);
    const data = await this.post<unknown>("/orders/checkouts", input);
    return checkoutDraftSchema.parse(data);
  }

  async createStripeMobilePaymentSession(
    input: z.input<typeof stripeMobilePaymentSessionRequestSchema>
  ): Promise<z.output<typeof stripeMobilePaymentSessionResponseSchema>> {
    stripeMobilePaymentSessionRequestSchema.parse(input);
    const data = await this.post<unknown>("/payments/stripe/mobile-session", input);
    return stripeMobilePaymentSessionResponseSchema.parse(data);
  }

  async finalizeStripeMobilePayment(
    input: z.input<typeof stripeMobilePaymentFinalizeRequestSchema>
  ): Promise<z.output<typeof stripeMobilePaymentFinalizeResponseSchema>> {
    stripeMobilePaymentFinalizeRequestSchema.parse(input);
    const data = await this.post<unknown>("/payments/stripe/mobile-session/finalize", input);
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
    if (!this.sessionRefreshHandler) {
      return null;
    }

    if (!this.refreshInFlight) {
      this.refreshInFlight = (async () => {
        try {
          const nextSession = await this.sessionRefreshHandler?.();
          if (nextSession?.accessToken) {
            this.setAccessToken(nextSession.accessToken);
          }
          return nextSession ?? null;
        } finally {
          this.refreshInFlight = undefined;
        }
      })();
    }

    return this.refreshInFlight;
  }

  private async request<T>(
    method: "GET" | "POST" | "PUT" | "DELETE",
    path: string,
    body?: unknown,
    hasRetriedUnauthorized = false
  ): Promise<T> {
    const baseUrl = normalizeBaseUrl(this.options.baseUrl);
    if (!baseUrl) {
      throw toReachabilityError(new Error("API base URL is not configured."));
    }

    const effectiveToken = this.accessToken ?? this.options.accessToken;
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
        body: body === undefined ? undefined : JSON.stringify(body)
      });
    } catch (error) {
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
        return this.request<T>(method, path, body, true);
      }
    }

    if (!response.ok) {
      const text = await response.text();
      const suffix = text ? `: ${text}` : "";
      throw new Error(`Request failed (${response.status})${suffix}`);
    }

    if (response.status === 204) {
      return undefined as T;
    }

    return (await response.json()) as T;
  }
}
