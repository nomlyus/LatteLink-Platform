import { createHash, createPrivateKey, createPublicKey, createSign, createVerify } from "node:crypto";
import { z } from "zod";

const defaultAppleJwksTtlMs = 15 * 60 * 1000;
const defaultAppleClientSecretTtlSeconds = 5 * 60;

const appleJwkSchema = z.object({
  kty: z.literal("RSA"),
  kid: z.string().min(1),
  use: z.string().min(1).optional(),
  alg: z.string().min(1).optional(),
  n: z.string().min(1),
  e: z.string().min(1)
});

const appleJwksSchema = z.object({
  keys: z.array(appleJwkSchema).min(1)
});

const appleIdentityTokenHeaderSchema = z.object({
  kid: z.string().min(1),
  alg: z.literal("RS256")
});

const appleIdentityTokenClaimsSchema = z.object({
  iss: z.literal("https://appleid.apple.com"),
  aud: z.union([z.string().min(1), z.array(z.string().min(1)).min(1)]),
  exp: z.number().int().positive(),
  iat: z.number().int().positive().optional(),
  sub: z.string().min(1),
  email: z.string().email().optional(),
  nonce: z.string().min(1).optional()
});

const appleTokenResponseSchema = z.object({
  access_token: z.string().min(1).optional(),
  expires_in: z.number().int().positive().optional(),
  id_token: z.string().min(1).optional(),
  refresh_token: z.string().min(1).optional(),
  token_type: z.string().min(1).optional()
});

export type AppleAuthConfig = {
  teamId: string;
  keyId: string;
  privateKey: string;
  allowedClientIds: string[];
  tokenEndpoint: string;
  revokeEndpoint: string;
  jwksEndpoint: string;
  clientSecretTtlSeconds: number;
};

export type VerifiedAppleIdentityToken = {
  sub: string;
  email?: string;
  clientId: string;
};

type AppleJwk = z.output<typeof appleJwkSchema>;

type DecodedAppleIdentityToken = {
  header: z.output<typeof appleIdentityTokenHeaderSchema>;
  claims: z.output<typeof appleIdentityTokenClaimsSchema>;
  signingInput: string;
  signature: Buffer;
};

type CachedAppleKeys = {
  expiresAtMs: number;
  keys: AppleJwk[];
};

let cachedAppleKeys: CachedAppleKeys | undefined;

export class AppleAuthError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "AppleAuthError";
    this.code = code;
  }
}

function parseCommaSeparatedEnv(value: string | undefined) {
  return (value ?? "")
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
}

function normalizePrivateKey(value: string) {
  return value.replace(/\\n/g, "\n").trim();
}

function normalizeAllowedClientIds() {
  return parseCommaSeparatedEnv(process.env.APPLE_ALLOWED_CLIENT_IDS);
}

function decodeJwtSegment<T>(segment: string, schema: z.ZodSchema<T>, code: string) {
  try {
    return schema.parse(JSON.parse(Buffer.from(segment, "base64url").toString("utf8")));
  } catch {
    throw new AppleAuthError(code, "Apple Sign-In token could not be decoded");
  }
}

function decodeAppleIdentityToken(identityToken: string): DecodedAppleIdentityToken {
  const [encodedHeader, encodedPayload, encodedSignature] = identityToken.split(".");
  if (!encodedHeader || !encodedPayload || !encodedSignature) {
    throw new AppleAuthError("INVALID_APPLE_IDENTITY", "Apple Sign-In token is malformed");
  }

  return {
    header: decodeJwtSegment(encodedHeader, appleIdentityTokenHeaderSchema, "INVALID_APPLE_IDENTITY"),
    claims: decodeJwtSegment(encodedPayload, appleIdentityTokenClaimsSchema, "INVALID_APPLE_IDENTITY"),
    signingInput: `${encodedHeader}.${encodedPayload}`,
    signature: Buffer.from(encodedSignature, "base64url")
  };
}

function parseJsonSafely(rawValue: string) {
  if (!rawValue) {
    return undefined;
  }

  try {
    return JSON.parse(rawValue) as unknown;
  } catch {
    return rawValue;
  }
}

function parseCacheControlMaxAge(cacheControl: string | null) {
  if (!cacheControl) {
    return undefined;
  }

  const maxAgeMatch = cacheControl.match(/max-age=(\d+)/i);
  if (!maxAgeMatch?.[1]) {
    return undefined;
  }

  const maxAgeSeconds = Number(maxAgeMatch[1]);
  return Number.isFinite(maxAgeSeconds) && maxAgeSeconds > 0 ? maxAgeSeconds * 1000 : undefined;
}

function normalizeAudience(value: string | string[]) {
  return Array.isArray(value) ? value : [value];
}

function hashNonce(value: string) {
  return createHash("sha256").update(value, "utf8").digest("base64url");
}

function nonceMatches(expectedNonce: string, actualNonce: string | undefined) {
  if (!actualNonce) {
    return false;
  }

  return actualNonce === expectedNonce || actualNonce === hashNonce(expectedNonce);
}

async function loadAppleSigningKeys(config: AppleAuthConfig) {
  if (cachedAppleKeys && cachedAppleKeys.expiresAtMs > Date.now()) {
    return cachedAppleKeys.keys;
  }

  let response: Response;
  try {
    response = await fetch(config.jwksEndpoint, {
      method: "GET",
      headers: {
        accept: "application/json"
      }
    });
  } catch {
    throw new AppleAuthError("APPLE_JWKS_FETCH_FAILED", "Apple signing key lookup failed");
  }

  const parsedBody = parseJsonSafely(await response.text());
  if (!response.ok) {
    throw new AppleAuthError("APPLE_JWKS_FETCH_FAILED", "Apple signing key lookup failed");
  }

  const parsedKeys = appleJwksSchema.safeParse(parsedBody);
  if (!parsedKeys.success) {
    throw new AppleAuthError("APPLE_JWKS_INVALID", "Apple signing key response was invalid");
  }

  cachedAppleKeys = {
    keys: parsedKeys.data.keys,
    expiresAtMs: Date.now() + (parseCacheControlMaxAge(response.headers.get("cache-control")) ?? defaultAppleJwksTtlMs)
  };

  return cachedAppleKeys.keys;
}

function buildAppleClientSecret(input: {
  clientId: string;
  config: AppleAuthConfig;
  now?: Date;
}) {
  const issuedAtSeconds = Math.floor((input.now ?? new Date()).getTime() / 1000);
  const expiresAtSeconds = issuedAtSeconds + input.config.clientSecretTtlSeconds;
  const encodedHeader = Buffer.from(
    JSON.stringify({
      alg: "ES256",
      kid: input.config.keyId
    }),
    "utf8"
  ).toString("base64url");
  const encodedPayload = Buffer.from(
    JSON.stringify({
      iss: input.config.teamId,
      iat: issuedAtSeconds,
      exp: expiresAtSeconds,
      aud: "https://appleid.apple.com",
      sub: input.clientId
    }),
    "utf8"
  ).toString("base64url");
  const signingInput = `${encodedHeader}.${encodedPayload}`;
  const privateKey = createPrivateKey(input.config.privateKey);
  const signer = createSign("SHA256");
  signer.update(signingInput);
  signer.end();
  const signature = signer.sign({
    key: privateKey,
    dsaEncoding: "ieee-p1363"
  });

  return `${signingInput}.${signature.toString("base64url")}`;
}

export function loadAppleAuthConfig(): AppleAuthConfig | undefined {
  const teamId = process.env.APPLE_TEAM_ID?.trim();
  const keyId = process.env.APPLE_KEY_ID?.trim();
  const privateKey = process.env.APPLE_PRIVATE_KEY?.trim();
  const allowedClientIds = normalizeAllowedClientIds();

  if (!teamId || !keyId || !privateKey || allowedClientIds.length === 0) {
    return undefined;
  }

  return {
    teamId,
    keyId,
    privateKey: normalizePrivateKey(privateKey),
    allowedClientIds,
    tokenEndpoint: process.env.APPLE_TOKEN_ENDPOINT?.trim() || "https://appleid.apple.com/auth/token",
    revokeEndpoint: process.env.APPLE_REVOKE_ENDPOINT?.trim() || "https://appleid.apple.com/auth/revoke",
    jwksEndpoint: process.env.APPLE_JWKS_ENDPOINT?.trim() || "https://appleid.apple.com/auth/keys",
    clientSecretTtlSeconds: (() => {
      const parsed = Number(process.env.APPLE_CLIENT_SECRET_TTL_SECONDS ?? defaultAppleClientSecretTtlSeconds);
      return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : defaultAppleClientSecretTtlSeconds;
    })()
  };
}

export async function verifyAppleIdentityToken(input: {
  config: AppleAuthConfig;
  identityToken: string;
  nonce: string;
}): Promise<VerifiedAppleIdentityToken> {
  const decoded = decodeAppleIdentityToken(input.identityToken);
  const keys = await loadAppleSigningKeys(input.config);
  const matchingKey = keys.find((key) => key.kid === decoded.header.kid);
  if (!matchingKey) {
    throw new AppleAuthError("INVALID_APPLE_IDENTITY", "Apple Sign-In token key is not trusted");
  }

  const verifier = createVerify("RSA-SHA256");
  verifier.update(decoded.signingInput);
  verifier.end();

  const signatureValid = verifier.verify(
    createPublicKey({
      key: matchingKey,
      format: "jwk"
    }),
    decoded.signature
  );
  if (!signatureValid) {
    throw new AppleAuthError("INVALID_APPLE_IDENTITY", "Apple Sign-In token signature is invalid");
  }

  if (decoded.claims.exp * 1000 <= Date.now()) {
    throw new AppleAuthError("INVALID_APPLE_IDENTITY", "Apple Sign-In token has expired");
  }

  const matchingClientId = normalizeAudience(decoded.claims.aud).find((clientId) =>
    input.config.allowedClientIds.includes(clientId)
  );
  if (!matchingClientId) {
    throw new AppleAuthError("INVALID_APPLE_IDENTITY", "Apple Sign-In token audience is not allowed");
  }

  if (!nonceMatches(input.nonce, decoded.claims.nonce)) {
    throw new AppleAuthError("INVALID_APPLE_IDENTITY", "Apple Sign-In token nonce did not match the request");
  }

  return {
    sub: decoded.claims.sub,
    email: decoded.claims.email,
    clientId: matchingClientId
  };
}

export async function exchangeAppleAuthorizationCode(input: {
  authorizationCode: string;
  clientId: string;
  config: AppleAuthConfig;
}) {
  const clientSecret = buildAppleClientSecret({
    clientId: input.clientId,
    config: input.config
  });

  let response: Response;
  try {
    response = await fetch(input.config.tokenEndpoint, {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded"
      },
      body: new URLSearchParams({
        client_id: input.clientId,
        client_secret: clientSecret,
        code: input.authorizationCode,
        grant_type: "authorization_code"
      })
    });
  } catch {
    throw new AppleAuthError("APPLE_TOKEN_EXCHANGE_FAILED", "Apple token exchange failed");
  }

  const parsedBody = parseJsonSafely(await response.text());
  if (!response.ok) {
    throw new AppleAuthError("APPLE_TOKEN_EXCHANGE_FAILED", "Apple token exchange failed");
  }

  const parsedToken = appleTokenResponseSchema.safeParse(parsedBody);
  if (!parsedToken.success) {
    throw new AppleAuthError("APPLE_TOKEN_INVALID", "Apple token response was invalid");
  }

  return parsedToken.data;
}

export async function revokeAppleRefreshToken(input: {
  refreshToken: string;
  clientId: string;
  config: AppleAuthConfig;
}) {
  const clientSecret = buildAppleClientSecret({
    clientId: input.clientId,
    config: input.config
  });

  let response: Response;
  try {
    response = await fetch(input.config.revokeEndpoint, {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded"
      },
      body: new URLSearchParams({
        client_id: input.clientId,
        client_secret: clientSecret,
        token: input.refreshToken,
        token_type_hint: "refresh_token"
      })
    });
  } catch {
    throw new AppleAuthError("APPLE_TOKEN_REVOCATION_FAILED", "Apple token revocation failed");
  }

  if (!response.ok) {
    throw new AppleAuthError("APPLE_TOKEN_REVOCATION_FAILED", "Apple token revocation failed");
  }
}
