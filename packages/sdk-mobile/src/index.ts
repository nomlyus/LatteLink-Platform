export type { paths as Paths } from "./generated/types.js";
import {
  appleExchangeRequestSchema,
  logoutRequestSchema,
  magicLinkRequestSchema,
  magicLinkVerifySchema,
  meResponseSchema,
  passkeyChallengeRequestSchema,
  passkeyChallengeResponseSchema,
  passkeyVerifyRequestSchema,
  refreshRequestSchema
} from "@gazelle/contracts-auth";
import { authSessionSchema } from "@gazelle/contracts-core";
import { z } from "zod";

export type ApiClientOptions = {
  baseUrl: string;
  accessToken?: string;
};

export class GazelleApiClient {
  private accessToken?: string;

  constructor(private readonly options: ApiClientOptions) {}

  setAccessToken(token?: string) {
    this.accessToken = token;
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

  async appleExchange(
    input: z.input<typeof appleExchangeRequestSchema>
  ): Promise<z.output<typeof authSessionSchema>> {
    appleExchangeRequestSchema.parse(input);
    const data = await this.post<unknown>("/auth/apple/exchange", input);
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

  async me(): Promise<z.output<typeof meResponseSchema>> {
    const data = await this.get<unknown>("/auth/me");
    return meResponseSchema.parse(data);
  }

  private async request<T>(method: "GET" | "POST" | "PUT", path: string, body?: unknown): Promise<T> {
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
