import { createSign, generateKeyPairSync } from "node:crypto";
import { vi } from "vitest";

const appleIdentityKeyPair = generateKeyPairSync("rsa", {
  modulusLength: 2048
});
const appleClientSecretKeyPair = generateKeyPairSync("ec", {
  namedCurve: "prime256v1"
});
const appleIdentityJwk = appleIdentityKeyPair.publicKey.export({ format: "jwk" }) as Record<string, string>;

export const APPLE_TEST_CLIENT_ID = "com.lattelink.rawaq.beta";
export const APPLE_TEST_KID = "apple-test-kid";

export function createSignedAppleIdentityToken(input: {
  sub: string;
  email?: string;
  nonce: string;
  aud?: string;
  iss?: string;
  expSecondsFromNow?: number;
}) {
  const encodedHeader = Buffer.from(
    JSON.stringify({
      alg: "RS256",
      kid: APPLE_TEST_KID
    }),
    "utf8"
  ).toString("base64url");
  const encodedPayload = Buffer.from(
    JSON.stringify({
      iss: input.iss ?? "https://appleid.apple.com",
      aud: input.aud ?? APPLE_TEST_CLIENT_ID,
      exp: Math.floor(Date.now() / 1000) + (input.expSecondsFromNow ?? 300),
      iat: Math.floor(Date.now() / 1000),
      sub: input.sub,
      ...(input.email ? { email: input.email } : {}),
      nonce: input.nonce
    }),
    "utf8"
  ).toString("base64url");
  const signingInput = `${encodedHeader}.${encodedPayload}`;
  const signer = createSign("RSA-SHA256");
  signer.update(signingInput);
  signer.end();
  const signature = signer.sign(appleIdentityKeyPair.privateKey).toString("base64url");

  return `${signingInput}.${signature}`;
}

export function installAppleAuthFetchMock(options?: {
  refreshToken?: string;
  tokenResponseOverrides?: Record<string, unknown>;
  revokeStatus?: number;
}) {
  const fetchMock = vi.fn<typeof fetch>();
  const refreshToken = options?.refreshToken ?? "apple-refresh-token";

  fetchMock.mockImplementation(async (input, init) => {
    const url = typeof input === "string" ? input : input.url;
    const method = init?.method ?? "GET";

    if (url === "https://appleid.apple.com/auth/keys" && method === "GET") {
      return new Response(
        JSON.stringify({
          keys: [
            {
              ...appleIdentityJwk,
              kid: APPLE_TEST_KID,
              use: "sig",
              alg: "RS256"
            }
          ]
        }),
        {
          status: 200,
          headers: {
            "content-type": "application/json",
            "cache-control": "max-age=3600"
          }
        }
      );
    }

    if (url === "https://appleid.apple.com/auth/token" && method === "POST") {
      return new Response(
        JSON.stringify({
          access_token: "apple-access-token",
          token_type: "Bearer",
          refresh_token: refreshToken,
          ...options?.tokenResponseOverrides
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      );
    }

    if (url === "https://appleid.apple.com/auth/revoke" && method === "POST") {
      return new Response("", { status: options?.revokeStatus ?? 200 });
    }

    throw new Error(`Unexpected fetch: ${method} ${url}`);
  });

  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

export function installAppleAuthEnv() {
  vi.stubEnv("APPLE_TEAM_ID", "APPLETEAM123");
  vi.stubEnv("APPLE_KEY_ID", "APPLEKEY123");
  vi.stubEnv("APPLE_ALLOWED_CLIENT_IDS", APPLE_TEST_CLIENT_ID);
  vi.stubEnv(
    "APPLE_PRIVATE_KEY",
    appleClientSecretKeyPair.privateKey.export({ format: "pem", type: "pkcs8" }).toString()
  );
}
