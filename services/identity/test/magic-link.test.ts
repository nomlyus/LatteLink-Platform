import { describe, expect, it } from "vitest";
import type { MailSender } from "../src/mail.js";
import { buildApp } from "../src/app.js";
import { createInMemoryIdentityRepository } from "../src/repository.js";

function createCapturingMailSender() {
  const sent: Array<{ to: string; magicLinkUrl: string }> = [];
  const sender: MailSender = {
    async sendMagicLink(params) {
      sent.push(params);
    }
  };

  return { sender, sent };
}

function extractTokenFromUrl(url: string) {
  const parsed = new URL(url);
  const token = parsed.searchParams.get("token");
  if (!token) {
    throw new Error(`Expected token in magic link URL: ${url}`);
  }

  return token;
}

function createFakeJwt(payload: Record<string, unknown>) {
  const header = Buffer.from(JSON.stringify({ alg: "none", typ: "JWT" }), "utf8").toString("base64url");
  const body = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  return `${header}.${body}.signature`;
}

describe("magic link auth", () => {
  it("stores an unconsumed token on request in log-compatible mode", async () => {
    const repository = createInMemoryIdentityRepository();
    const { sender, sent } = createCapturingMailSender();
    const app = await buildApp({ repository, mailSender: sender });

    const response = await app.inject({
      method: "POST",
      url: "/v1/auth/magic-link/request",
      payload: {
        email: "Owner@GazelleCoffee.com "
      }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ success: true });
    expect(sent).toHaveLength(1);

    const token = extractTokenFromUrl(sent[0].magicLinkUrl);
    const storedLink = await repository.getMagicLink(token);

    expect(storedLink).toMatchObject({
      token,
      email: "owner@gazellecoffee.com",
      consumedAt: null
    });

    await app.close();
  });

  it("verifies a valid token and issues a session", async () => {
    const repository = createInMemoryIdentityRepository();
    const { sender, sent } = createCapturingMailSender();
    const app = await buildApp({ repository, mailSender: sender });

    await app.inject({
      method: "POST",
      url: "/v1/auth/magic-link/request",
      payload: {
        email: "owner@gazellecoffee.com"
      }
    });

    const token = extractTokenFromUrl(sent[0].magicLinkUrl);
    const verifyResponse = await app.inject({
      method: "POST",
      url: "/v1/auth/magic-link/verify",
      payload: {
        token
      }
    });

    expect(verifyResponse.statusCode).toBe(200);
    expect(verifyResponse.json()).toMatchObject({
      accessToken: expect.any(String),
      refreshToken: expect.any(String),
      userId: expect.stringMatching(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
      )
    });

    const consumedLink = await repository.getMagicLink(token);
    expect(consumedLink?.consumedAt).toBeDefined();
    expect(consumedLink?.userId).toBe(verifyResponse.json().userId);

    await app.close();
  });

  it("rejects consumed tokens on subsequent verification attempts", async () => {
    const repository = createInMemoryIdentityRepository();
    const { sender, sent } = createCapturingMailSender();
    const app = await buildApp({ repository, mailSender: sender });

    await app.inject({
      method: "POST",
      url: "/v1/auth/magic-link/request",
      payload: {
        email: "owner@gazellecoffee.com"
      }
    });

    const token = extractTokenFromUrl(sent[0].magicLinkUrl);
    const firstVerify = await app.inject({
      method: "POST",
      url: "/v1/auth/magic-link/verify",
      payload: {
        token
      }
    });
    const secondVerify = await app.inject({
      method: "POST",
      url: "/v1/auth/magic-link/verify",
      payload: {
        token
      }
    });

    expect(firstVerify.statusCode).toBe(200);
    expect(secondVerify.statusCode).toBe(401);
    expect(secondVerify.json()).toMatchObject({
      code: "MAGIC_LINK_EXPIRED"
    });

    await app.close();
  });

  it("rejects unknown magic-link tokens", async () => {
    const repository = createInMemoryIdentityRepository();
    const { sender } = createCapturingMailSender();
    const app = await buildApp({ repository, mailSender: sender });

    const response = await app.inject({
      method: "POST",
      url: "/v1/auth/magic-link/verify",
      payload: {
        token: "missing-token"
      }
    });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({
      code: "INVALID_MAGIC_LINK"
    });

    await app.close();
  });

  it("creates distinct tokens for repeated requests to the same email", async () => {
    const repository = createInMemoryIdentityRepository();
    const { sender, sent } = createCapturingMailSender();
    const app = await buildApp({ repository, mailSender: sender });

    const firstResponse = await app.inject({
      method: "POST",
      url: "/v1/auth/magic-link/request",
      payload: {
        email: "owner@gazellecoffee.com"
      }
    });
    const secondResponse = await app.inject({
      method: "POST",
      url: "/v1/auth/magic-link/request",
      payload: {
        email: "owner@gazellecoffee.com"
      }
    });

    expect(firstResponse.statusCode).toBe(200);
    expect(secondResponse.statusCode).toBe(200);
    expect(sent).toHaveLength(2);

    const firstToken = extractTokenFromUrl(sent[0].magicLinkUrl);
    const secondToken = extractTokenFromUrl(sent[1].magicLinkUrl);

    expect(firstToken).not.toBe(secondToken);
    expect((await repository.getMagicLink(firstToken))?.consumedAt).toBeNull();
    expect((await repository.getMagicLink(secondToken))?.consumedAt).toBeNull();

    await app.close();
  });

  it("reuses the canonical Apple-backed user for magic-link verification on the same email", async () => {
    const repository = createInMemoryIdentityRepository();
    const { sender, sent } = createCapturingMailSender();
    const app = await buildApp({ repository, mailSender: sender });
    const appleToken = createFakeJwt({
      sub: "apple-user-merge",
      email: "owner@gazellecoffee.com"
    });

    const appleExchange = await app.inject({
      method: "POST",
      url: "/v1/auth/apple/exchange",
      payload: {
        identityToken: appleToken,
        authorizationCode: "auth-code",
        nonce: "apple-magic-link"
      }
    });
    await app.inject({
      method: "POST",
      url: "/v1/auth/magic-link/request",
      payload: {
        email: "owner@gazellecoffee.com"
      }
    });

    const token = extractTokenFromUrl(sent[0].magicLinkUrl);
    const magicLinkVerify = await app.inject({
      method: "POST",
      url: "/v1/auth/magic-link/verify",
      payload: {
        token
      }
    });

    expect(appleExchange.statusCode).toBe(200);
    expect(magicLinkVerify.statusCode).toBe(200);
    expect(magicLinkVerify.json().userId).toBe(appleExchange.json().userId);

    await app.close();
  });

  it("issues a seeded operator session through the dev-access route", async () => {
    const repository = createInMemoryIdentityRepository();
    const { sender } = createCapturingMailSender();
    const app = await buildApp({ repository, mailSender: sender, allowDevOperatorAccess: true });

    const response = await app.inject({
      method: "POST",
      url: "/v1/operator/auth/dev-access",
      payload: {
        email: "owner@gazellecoffee.com"
      }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      accessToken: expect.any(String),
      refreshToken: expect.any(String),
      operator: {
        email: "owner@gazellecoffee.com",
        role: "owner",
        locationId: "flagship-01"
      }
    });

    await app.close();
  });

  it("issues a seeded operator session through password sign-in", async () => {
    const repository = createInMemoryIdentityRepository();
    const { sender } = createCapturingMailSender();
    const app = await buildApp({ repository, mailSender: sender });

    const response = await app.inject({
      method: "POST",
      url: "/v1/operator/auth/sign-in",
      payload: {
        email: "owner@gazellecoffee.com",
        password: "LatteLinkOwner123!"
      }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      accessToken: expect.any(String),
      refreshToken: expect.any(String),
      operator: {
        email: "owner@gazellecoffee.com",
        role: "owner",
        locationId: "flagship-01"
      }
    });

    await app.close();
  });

  it("rejects invalid operator passwords", async () => {
    const repository = createInMemoryIdentityRepository();
    const { sender } = createCapturingMailSender();
    const app = await buildApp({ repository, mailSender: sender });

    const response = await app.inject({
      method: "POST",
      url: "/v1/operator/auth/sign-in",
      payload: {
        email: "owner@gazellecoffee.com",
        password: "WrongPassword123!"
      }
    });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({
      code: "INVALID_OPERATOR_CREDENTIALS"
    });

    await app.close();
  });

  it("rejects the dev-access route when explicitly disabled", async () => {
    const repository = createInMemoryIdentityRepository();
    const { sender } = createCapturingMailSender();
    const app = await buildApp({ repository, mailSender: sender, allowDevOperatorAccess: false });

    const response = await app.inject({
      method: "POST",
      url: "/v1/operator/auth/dev-access",
      payload: {
        email: "owner@gazellecoffee.com"
      }
    });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toMatchObject({
      code: "DEV_OPERATOR_ACCESS_DISABLED"
    });

    await app.close();
  });
});
