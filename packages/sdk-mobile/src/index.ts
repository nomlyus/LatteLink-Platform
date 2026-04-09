export type { paths as Paths } from "./generated/types.js";
import {
  appleExchangeRequestSchema,
  customerDevAccessRequestSchema,
  customerProfileRequestSchema,
  logoutRequestSchema,
  magicLinkRequestSchema,
  magicLinkVerifySchema,
  meResponseSchema,
  passkeyChallengeRequestSchema,
  passkeyChallengeResponseSchema,
  passkeyVerifyRequestSchema,
  refreshRequestSchema
} from "@gazelle/contracts-auth";
import { appConfigSchema, menuResponseSchema, storeConfigResponseSchema } from "@gazelle/contracts-catalog";
import { authSessionSchema } from "@gazelle/contracts-core";
import {
  createOrderRequestSchema,
  orderQuoteSchema,
  orderSchema,
  payOrderRequestSchema,
  quoteRequestSchema
} from "@gazelle/contracts-orders";
import { z } from "zod";

const authSuccessSchema = z.object({
  success: z.literal(true)
});

export type ApiClientOptions = {
  baseUrl: string;
  accessToken?: string;
};

type SessionRefreshHandler = () => Promise<z.output<typeof authSessionSchema> | null>;

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

  async requestMagicLink(input: z.input<typeof magicLinkRequestSchema>): Promise<{ success: true }> {
    magicLinkRequestSchema.parse(input);
    return this.post<{ success: true }>("/auth/magic-link/request", input);
  }

  async verifyMagicLink(input: z.input<typeof magicLinkVerifySchema>): Promise<z.output<typeof authSessionSchema>> {
    magicLinkVerifySchema.parse(input);
    const data = await this.post<unknown>("/auth/magic-link/verify", input);
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

  async menu(): Promise<z.output<typeof menuResponseSchema>> {
    const data = await this.get<unknown>("/menu");
    return menuResponseSchema.parse(data);
  }

  async storeConfig(): Promise<z.output<typeof storeConfigResponseSchema>> {
    const data = await this.get<unknown>("/store/config");
    return storeConfigResponseSchema.parse(data);
  }

  async appConfig(): Promise<z.output<typeof appConfigSchema>> {
    const data = await this.get<unknown>("/app-config");
    return appConfigSchema.parse(data);
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

  async payOrder(
    orderId: string,
    input: z.input<typeof payOrderRequestSchema>
  ): Promise<z.output<typeof orderSchema>> {
    z.string().uuid().parse(orderId);
    payOrderRequestSchema.parse(input);
    const data = await this.post<unknown>(`/orders/${orderId}/pay`, input);
    return orderSchema.parse(data);
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
    const effectiveToken = this.accessToken ?? this.options.accessToken;
    const headers: Record<string, string> = {};
    if (effectiveToken) {
      headers.Authorization = `Bearer ${effectiveToken}`;
    }
    if (body !== undefined) {
      headers["Content-Type"] = "application/json";
    }

    const response = await fetch(`${this.options.baseUrl}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body)
    });

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
