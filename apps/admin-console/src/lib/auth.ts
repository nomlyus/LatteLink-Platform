import { createHmac, timingSafeEqual } from "node:crypto";
import {
  internalAdminSessionSchema,
  type InternalAdminCapability,
  type InternalAdminRole,
  type InternalAdminSession
} from "@lattelink/contracts-auth";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import {
  getInternalAdminApiBaseUrl,
  hasAdminConsoleSessionSecret,
  hasInternalAdminApiBaseUrl,
  readAdminConsoleSessionSecret
} from "@/lib/config";
import { adminConsoleSessionCookieName, adminConsoleSessionMaxAgeSeconds } from "@/lib/session-constants";

export type AdminConsoleRole = InternalAdminRole;
export type AdminConsoleSession = InternalAdminSession;

type AdminAuthApiErrorBody = {
  code?: string;
  message?: string;
};

export class AdminAuthError extends Error {
  statusCode: number;
  code?: string;

  constructor(message: string, statusCode: number, code?: string) {
    super(message);
    this.name = "AdminAuthError";
    this.statusCode = statusCode;
    this.code = code;
  }
}

function encodeBase64Url(value: string) {
  return Buffer.from(value, "utf8").toString("base64url");
}

function decodeBase64Url(value: string) {
  return Buffer.from(value, "base64url").toString("utf8");
}

function safeEquals(left: string, right: string) {
  const leftBuffer = Buffer.from(left, "utf8");
  const rightBuffer = Buffer.from(right, "utf8");
  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }

  return timingSafeEqual(leftBuffer, rightBuffer);
}

function signPayload(payload: string) {
  return createHmac("sha256", readAdminConsoleSessionSecret()).update(payload).digest("base64url");
}

function createSessionToken(session: AdminConsoleSession) {
  const payload = encodeBase64Url(JSON.stringify(session));
  return `${payload}.${signPayload(payload)}`;
}

function parseSessionToken(token: string | undefined) {
  if (!token) {
    return null;
  }

  const [payload, signature] = token.split(".");
  if (!payload || !signature || !safeEquals(signPayload(payload), signature)) {
    return null;
  }

  try {
    const parsed = internalAdminSessionSchema.parse(JSON.parse(decodeBase64Url(payload)));
    if (Date.parse(parsed.expiresAt) <= Date.now()) {
      return null;
    }

    return parsed;
  } catch {
    return null;
  }
}

async function requestAdminAuthApi<TResponse>(path: string, init?: RequestInit): Promise<TResponse> {
  const response = await fetch(`${getInternalAdminApiBaseUrl()}${path}`, {
    ...init,
    cache: "no-store",
    headers: {
      "content-type": "application/json",
      ...(init?.headers ?? {})
    }
  });

  if (!response.ok) {
    let errorBody: AdminAuthApiErrorBody | undefined;
    try {
      errorBody = (await response.json()) as AdminAuthApiErrorBody;
    } catch {
      errorBody = undefined;
    }

    throw new AdminAuthError(
      errorBody?.message ?? `Admin auth request failed with status ${response.status}.`,
      response.status,
      errorBody?.code
    );
  }

  return (await response.json()) as TResponse;
}

export function getAdminConsoleAuthStatus() {
  const hasSessionSecret = hasAdminConsoleSessionSecret();
  const hasBaseUrl = hasInternalAdminApiBaseUrl();

  return {
    configured: hasSessionSecret && hasBaseUrl,
    hasSessionSecret,
    hasBaseUrl
  };
}

export async function signInInternalAdmin(input: { email: string; password: string }) {
  return requestAdminAuthApi<AdminConsoleSession>("/v1/internal-admin/auth/sign-in", {
    method: "POST",
    body: JSON.stringify({
      email: input.email.trim(),
      password: input.password
    })
  });
}

export async function revokeAdminSession(session: AdminConsoleSession) {
  await requestAdminAuthApi<{ success: true }>("/v1/internal-admin/auth/logout", {
    method: "POST",
    body: JSON.stringify({
      refreshToken: session.refreshToken
    })
  });
}

export async function getAdminSession() {
  const cookieStore = await cookies();
  return parseSessionToken(cookieStore.get(adminConsoleSessionCookieName)?.value);
}

export async function requireAdminSession() {
  const session = await getAdminSession();
  if (!session) {
    redirect("/sign-in?error=Please sign in to continue.");
  }

  return session;
}

export async function requireAdminCapability(capability: InternalAdminCapability) {
  const session = await requireAdminSession();
  if (!session.admin.capabilities.includes(capability)) {
    throw new Error(`Admin is missing required capability: ${capability}`);
  }

  return session;
}

export async function setAdminSession(session: AdminConsoleSession) {
  const cookieStore = await cookies();
  cookieStore.set(adminConsoleSessionCookieName, createSessionToken(session), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: adminConsoleSessionMaxAgeSeconds
  });
}

export async function clearAdminSession() {
  const cookieStore = await cookies();
  cookieStore.delete(adminConsoleSessionCookieName);
}
