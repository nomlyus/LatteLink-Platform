import { z } from "zod";
import {
  googleOAuthStartResponseSchema,
  operatorAuthProvidersSchema,
  operatorDevAccessRequestSchema,
  operatorGoogleExchangeRequestSchema,
  operatorPasswordSignInSchema,
  operatorSessionSchema
} from "@lattelink/contracts-auth";
import {
  merchantLaunchRequestSchema,
  merchantLaunchResponseSchema
} from "@lattelink/contracts-catalog";
import { normalizeApiBaseUrl, requestJson, resolveDefaultApiBaseUrl } from "../../api";
import { storedOperatorSessionSchema, type OperatorSession } from "./auth-types";

export type { OperatorAuthProviders, OperatorSession, OperatorUser } from "./auth-types";
export type MerchantLaunchResponse = z.output<typeof merchantLaunchResponseSchema>;

function toStoredSession(apiBaseUrl: string, payload: z.output<typeof operatorSessionSchema>): OperatorSession {
  return storedOperatorSessionSchema.parse({
    apiBaseUrl: normalizeApiBaseUrl(apiBaseUrl),
    ...payload
  });
}

export function getDefaultAuthApiBaseUrl() {
  return resolveDefaultApiBaseUrl();
}

export async function signInOperatorWithPassword(params: {
  apiBaseUrl: string;
  email: string;
  password: string;
  locationId?: string;
  signal?: AbortSignal;
}) {
  const session = await requestJson({
    apiBaseUrl: params.apiBaseUrl,
    path: "/operator/auth/sign-in",
    method: "POST",
    signal: params.signal,
    body: operatorPasswordSignInSchema.parse({
      email: params.email.trim(),
      password: params.password,
      locationId: params.locationId
    }),
    schema: operatorSessionSchema
  });

  return toStoredSession(params.apiBaseUrl, session);
}

export async function requestOperatorDevAccess(params: { apiBaseUrl: string; email: string; signal?: AbortSignal }) {
  const session = await requestJson({
    apiBaseUrl: params.apiBaseUrl,
    path: "/operator/auth/dev-access",
    method: "POST",
    signal: params.signal,
    body: operatorDevAccessRequestSchema.parse({ email: params.email.trim() }),
    schema: operatorSessionSchema
  });

  return toStoredSession(params.apiBaseUrl, session);
}

export function fetchOperatorAuthProviders(params: { apiBaseUrl: string; signal?: AbortSignal }) {
  return requestJson({
    apiBaseUrl: params.apiBaseUrl,
    path: "/operator/auth/providers",
    signal: params.signal,
    schema: operatorAuthProvidersSchema
  });
}

export function startOperatorGoogleSignIn(params: { apiBaseUrl: string; redirectUri: string; locationId?: string; signal?: AbortSignal }) {
  const search = new URLSearchParams({ redirectUri: params.redirectUri });
  if (params.locationId) search.set("locationId", params.locationId);
  return requestJson({
    apiBaseUrl: params.apiBaseUrl,
    path: `/operator/auth/google/start?${search.toString()}`,
    signal: params.signal,
    schema: googleOAuthStartResponseSchema
  });
}

export async function exchangeOperatorGoogleCode(params: {
  apiBaseUrl: string;
  code: string;
  state: string;
  redirectUri: string;
  locationId?: string;
  signal?: AbortSignal;
}) {
  const session = await requestJson({
    apiBaseUrl: params.apiBaseUrl,
    path: "/operator/auth/google/exchange",
    method: "POST",
    signal: params.signal,
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
    body: { refreshToken: session.refreshToken },
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
    body: { refreshToken: session.refreshToken },
    schema: z.object({ success: z.literal(true) })
  });
}

export async function createMerchantLaunch(params: {
  apiBaseUrl: string;
  businessName: string;
  locationName: string;
  marketLabel: string;
  ownerName: string;
  ownerEmail: string;
  storeName?: string;
  signal?: AbortSignal;
}) {
  return requestJson({
    apiBaseUrl: params.apiBaseUrl,
    path: "/merchant/launch",
    method: "POST",
    signal: params.signal,
    body: merchantLaunchRequestSchema.parse({
      businessName: params.businessName,
      locationName: params.locationName,
      marketLabel: params.marketLabel,
      ownerName: params.ownerName,
      ownerEmail: params.ownerEmail,
      storeName: params.storeName
    }),
    schema: merchantLaunchResponseSchema
  });
}
