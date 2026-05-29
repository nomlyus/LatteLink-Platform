import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildApp } from "../src/app.js";
import { createInMemoryIdentityRepository } from "../src/repository.js";

async function signInInternalAdmin(app: Awaited<ReturnType<typeof buildApp>>, email: string, password: string) {
  const response = await app.inject({
    method: "POST",
    url: "/v1/internal-admin/auth/sign-in",
    payload: {
      email,
      password
    }
  });

  expect(response.statusCode).toBe(200);
  return response.json();
}

describe("internal admin auth", () => {
  const adminEmail = "platform-owner@example.com";
  const adminPassword = "local-admin-password-123";

  beforeEach(() => {
    vi.stubEnv("DEFAULT_INTERNAL_ADMIN_OWNER_EMAIL", adminEmail);
    vi.stubEnv("DEFAULT_INTERNAL_ADMIN_OWNER_PASSWORD", adminPassword);
    vi.stubEnv("DEFAULT_INTERNAL_ADMIN_OWNER_NAME", "Platform Owner");
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
  });

  it("supports refresh rotation and invalidates prior internal admin access tokens after logout", async () => {
    const repository = createInMemoryIdentityRepository();
    const app = await buildApp({ repository });

    const session = await signInInternalAdmin(app, adminEmail, adminPassword);

    const me = await app.inject({
      method: "GET",
      url: "/v1/internal-admin/auth/me",
      headers: {
        authorization: `Bearer ${session.accessToken}`
      }
    });
    expect(me.statusCode).toBe(200);
    expect(me.json()).toMatchObject({
      email: adminEmail,
      role: "platform_owner"
    });

    const refresh = await app.inject({
      method: "POST",
      url: "/v1/internal-admin/auth/refresh",
      payload: {
        refreshToken: session.refreshToken
      }
    });
    expect(refresh.statusCode).toBe(200);
    const rotatedSession = refresh.json();
    expect(rotatedSession.accessToken).not.toBe(session.accessToken);
    expect(rotatedSession.refreshToken).not.toBe(session.refreshToken);

    const oldSessionMe = await app.inject({
      method: "GET",
      url: "/v1/internal-admin/auth/me",
      headers: {
        authorization: `Bearer ${session.accessToken}`
      }
    });
    expect(oldSessionMe.statusCode).toBe(401);

    const refreshedMe = await app.inject({
      method: "GET",
      url: "/v1/internal-admin/auth/me",
      headers: {
        authorization: `Bearer ${rotatedSession.accessToken}`
      }
    });
    expect(refreshedMe.statusCode).toBe(200);

    const logout = await app.inject({
      method: "POST",
      url: "/v1/internal-admin/auth/logout",
      payload: {
        refreshToken: rotatedSession.refreshToken
      }
    });
    expect(logout.statusCode).toBe(200);

    const postLogoutMe = await app.inject({
      method: "GET",
      url: "/v1/internal-admin/auth/me",
      headers: {
        authorization: `Bearer ${rotatedSession.accessToken}`
      }
    });
    expect(postLogoutMe.statusCode).toBe(401);

    await app.close();
  });

  it("rejects internal admin refresh after absolute session TTL", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2030-01-01T00:00:00.000Z"));
    process.env.INTERNAL_ADMIN_SESSION_ABSOLUTE_TTL_DAYS = "1";
    const repository = createInMemoryIdentityRepository();
    const app = await buildApp({ repository });

    const session = await signInInternalAdmin(app, adminEmail, adminPassword);

    vi.setSystemTime(new Date("2030-01-02T00:00:01.000Z"));
    const refresh = await app.inject({
      method: "POST",
      url: "/v1/internal-admin/auth/refresh",
      payload: {
        refreshToken: session.refreshToken
      }
    });

    expect(refresh.statusCode).toBe(401);
    expect(refresh.json()).toMatchObject({
      code: "SESSION_EXPIRED",
      message: "Your session has expired. Please sign in again."
    });

    const retry = await app.inject({
      method: "POST",
      url: "/v1/internal-admin/auth/refresh",
      payload: {
        refreshToken: session.refreshToken
      }
    });
    expect(retry.statusCode).toBe(401);
    expect(retry.json()).toMatchObject({
      code: "INVALID_REFRESH_TOKEN"
    });

    await app.close();
  });

  it("rejects invalid internal admin credentials", async () => {
    const repository = createInMemoryIdentityRepository();
    const app = await buildApp({ repository });

    const response = await app.inject({
      method: "POST",
      url: "/v1/internal-admin/auth/sign-in",
      payload: {
        email: adminEmail,
        password: "wrong-password"
      }
    });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({
      code: "INVALID_INTERNAL_ADMIN_CREDENTIALS"
    });

    await app.close();
  });

  it("does not seed source-controlled internal admin credentials by default", async () => {
    vi.unstubAllEnvs();
    const repository = createInMemoryIdentityRepository();
    const app = await buildApp({ repository });

    const response = await app.inject({
      method: "POST",
      url: "/v1/internal-admin/auth/sign-in",
      payload: {
        email: "admin@gazellecoffee.com",
        password: "GazelleAdmin123!"
      }
    });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({
      code: "INVALID_INTERNAL_ADMIN_CREDENTIALS"
    });

    await app.close();
  });

  it("requires internal admin bootstrap email and password to be configured together", () => {
    vi.unstubAllEnvs();
    vi.stubEnv("DEFAULT_INTERNAL_ADMIN_OWNER_EMAIL", "owner@example.com");

    expect(() => createInMemoryIdentityRepository()).toThrow(
      /DEFAULT_INTERNAL_ADMIN_OWNER_EMAIL and DEFAULT_INTERNAL_ADMIN_OWNER_PASSWORD/
    );
  });
});
