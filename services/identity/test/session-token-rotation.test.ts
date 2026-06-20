import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildApp } from "../src/app.js";
import { createInMemoryIdentityRepository } from "../src/repository.js";
import { provisionOwnerAccess } from "../src/provisioning.js";

const maxSessionTokenLength = 512;
const rotationCount = 100;

type Session = {
  accessToken: string;
  refreshToken: string;
};

async function rotateSession(
  app: Awaited<ReturnType<typeof buildApp>>,
  path: string,
  initialSession: Session
) {
  let session = initialSession;
  const accessTokens = new Set([session.accessToken]);
  const refreshTokens = new Set([session.refreshToken]);

  for (let index = 0; index < rotationCount; index += 1) {
    const previousRefreshToken = session.refreshToken;
    const response = await app.inject({
      method: "POST",
      url: path,
      payload: {
        refreshToken: previousRefreshToken
      }
    });

    expect(response.statusCode).toBe(200);
    session = response.json() as Session;
    expect(session.accessToken.length).toBeLessThanOrEqual(maxSessionTokenLength);
    expect(session.refreshToken.length).toBeLessThanOrEqual(maxSessionTokenLength);
    expect(session.accessToken).not.toContain(previousRefreshToken);
    expect(session.refreshToken).not.toContain(previousRefreshToken);
    expect(accessTokens.has(session.accessToken)).toBe(false);
    expect(refreshTokens.has(session.refreshToken)).toBe(false);
    accessTokens.add(session.accessToken);
    refreshTokens.add(session.refreshToken);

    const reusedRefresh = await app.inject({
      method: "POST",
      url: path,
      payload: {
        refreshToken: previousRefreshToken
      }
    });
    expect(reusedRefresh.statusCode).toBe(401);
  }

  return session;
}

describe("session token rotation", () => {
  beforeEach(() => {
    vi.stubEnv("IDENTITY_RATE_LIMIT_AUTH_WRITE_MAX", "1000");
    vi.stubEnv("DEFAULT_INTERNAL_ADMIN_OWNER_EMAIL", "platform-owner@example.com");
    vi.stubEnv("DEFAULT_INTERNAL_ADMIN_OWNER_PASSWORD", "local-admin-password-123");
    vi.stubEnv("DEFAULT_INTERNAL_ADMIN_OWNER_NAME", "Platform Owner");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("keeps customer tokens bounded across repeated refresh rotations", async () => {
    const repository = createInMemoryIdentityRepository();
    const app = await buildApp({
      repository,
      allowDevCustomerAccess: true
    });
    const signIn = await app.inject({
      method: "POST",
      url: "/v1/auth/dev-access",
      payload: {
        email: "customer@example.com",
        name: "Customer"
      }
    });
    expect(signIn.statusCode).toBe(200);

    await rotateSession(app, "/v1/auth/refresh", signIn.json() as Session);
    await app.close();
  });

  it("keeps operator tokens bounded across repeated refresh rotations", async () => {
    const repository = createInMemoryIdentityRepository();
    await provisionOwnerAccess(repository, {
      allowInMemory: true,
      displayName: "Store Owner",
      email: "owner@example.com",
      locationId: "rawaqcoffee01",
      password: "LatteLinkOwner123!"
    });
    const app = await buildApp({ repository });
    const signIn = await app.inject({
      method: "POST",
      url: "/v1/operator/auth/sign-in",
      payload: {
        email: "owner@example.com",
        password: "LatteLinkOwner123!"
      }
    });
    expect(signIn.statusCode).toBe(200);

    await rotateSession(app, "/v1/operator/auth/refresh", signIn.json() as Session);
    await app.close();
  });

  it("allows only one successful rotation for concurrent operator refresh requests", async () => {
    const repository = createInMemoryIdentityRepository();
    await provisionOwnerAccess(repository, {
      allowInMemory: true,
      displayName: "Store Owner",
      email: "concurrent-owner@example.com",
      locationId: "rawaqcoffee01",
      password: "LatteLinkOwner123!"
    });
    const app = await buildApp({ repository });
    const signIn = await app.inject({
      method: "POST",
      url: "/v1/operator/auth/sign-in",
      payload: {
        email: "concurrent-owner@example.com",
        password: "LatteLinkOwner123!"
      }
    });
    expect(signIn.statusCode).toBe(200);
    const session = signIn.json() as Session;

    const responses = await Promise.all([
      app.inject({
        method: "POST",
        url: "/v1/operator/auth/refresh",
        payload: { refreshToken: session.refreshToken }
      }),
      app.inject({
        method: "POST",
        url: "/v1/operator/auth/refresh",
        payload: { refreshToken: session.refreshToken }
      })
    ]);

    expect(responses.map((response) => response.statusCode).sort()).toEqual([200, 401]);
    await app.close();
  });

  it("keeps internal admin tokens bounded across repeated refresh rotations", async () => {
    const repository = createInMemoryIdentityRepository();
    const app = await buildApp({ repository });
    const signIn = await app.inject({
      method: "POST",
      url: "/v1/internal-admin/auth/sign-in",
      payload: {
        email: "platform-owner@example.com",
        password: "local-admin-password-123"
      }
    });
    expect(signIn.statusCode).toBe(200);

    await rotateSession(app, "/v1/internal-admin/auth/refresh", signIn.json() as Session);
    await app.close();
  });

  it.each([
    "/v1/auth/refresh",
    "/v1/auth/logout",
    "/v1/operator/auth/refresh",
    "/v1/operator/auth/logout",
    "/v1/internal-admin/auth/refresh",
    "/v1/internal-admin/auth/logout"
  ])("rejects oversized tokens at %s", async (path) => {
    const repository = createInMemoryIdentityRepository();
    const app = await buildApp({ repository });
    const response = await app.inject({
      method: "POST",
      url: path,
      payload: {
        refreshToken: "x".repeat(maxSessionTokenLength + 1)
      }
    });

    expect(response.statusCode).toBe(400);
    await app.close();
  });
});
