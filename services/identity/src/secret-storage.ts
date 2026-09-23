import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from "node:crypto";

const sessionDigestPrefix = "sha256:v1:";
const appleCipherPrefix = "aes256gcm:v1:";
const appleCipherMarker = "aes256gcm:";
const appleKeyIdPattern = /^[A-Za-z0-9_-]{1,32}$/;

/** Session bearer tokens contain 256 random bits, so one-way SHA-256 digests are safe lookup keys. */
export function digestSessionToken(token: string): string {
  return `${sessionDigestPrefix}${createHash("sha256").update("nomly-session-v1\0").update(token).digest("hex")}`;
}

export function sessionTokenLookupValues(token: string): [string, string] {
  // Legacy lookups are available only during an explicitly bounded dev cutover.
  if (isLegacySecretCutoverEnabled()) {
    return [digestSessionToken(token), token];
  }
  return [digestSessionToken(token), digestSessionToken(token)];
}

export function isLegacySecretCutoverEnabled(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  return (
    env.DEPLOY_ENV === "dev" &&
    env.IDENTITY_ALLOW_LEGACY_SECRETS === "dev-cutover"
  );
}

export function isSessionTokenDigest(value: string): boolean {
  return /^sha256:v1:[0-9a-f]{64}$/.test(value);
}

export type AppleRefreshTokenCipher = {
  readonly activeKeyId: string;
  encrypt(token: string, userId: string): string;
  decrypt(value: string, userId: string): string;
  keyId(value: string): string | undefined;
};

function parseAppleKeyRing(
  encodedKeyRing: string | undefined,
  activeKeyId: string | undefined,
) {
  if (!encodedKeyRing || !activeKeyId || !appleKeyIdPattern.test(activeKeyId)) {
    throw new Error(
      "IDENTITY_APPLE_TOKEN_ENCRYPTION_KEYS and IDENTITY_APPLE_TOKEN_ENCRYPTION_ACTIVE_KEY_ID are required",
    );
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(encodedKeyRing);
  } catch {
    throw new Error(
      "IDENTITY_APPLE_TOKEN_ENCRYPTION_KEYS must be a JSON key-id to base64 key map",
    );
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(
      "IDENTITY_APPLE_TOKEN_ENCRYPTION_KEYS must be a JSON key-id to base64 key map",
    );
  }

  const keys = new Map<string, Buffer>();
  for (const [keyId, encodedKey] of Object.entries(parsed)) {
    if (!appleKeyIdPattern.test(keyId) || typeof encodedKey !== "string") {
      throw new Error(
        "IDENTITY_APPLE_TOKEN_ENCRYPTION_KEYS contains an invalid key entry",
      );
    }
    const key = Buffer.from(encodedKey, "base64");
    if (key.length !== 32 || key.toString("base64") !== encodedKey) {
      throw new Error(
        "IDENTITY_APPLE_TOKEN_ENCRYPTION_KEYS values must be canonical base64 32-byte keys",
      );
    }
    keys.set(keyId, key);
  }

  if (keys.size === 0 || !keys.has(activeKeyId)) {
    throw new Error(
      "IDENTITY_APPLE_TOKEN_ENCRYPTION_ACTIVE_KEY_ID must identify a configured key",
    );
  }

  return keys;
}

/**
 * Uses AES-256-GCM with a fresh nonce per write, a format version and key ID in
 * each value, and the owning user ID as authenticated associated data. Supply
 * a key ring containing the active key plus any old keys still needed to read
 * existing ciphertext during a controlled rotation.
 */
export function createAppleRefreshTokenCipher(
  encodedKeyRing: string | undefined,
  activeKeyId: string | undefined,
): AppleRefreshTokenCipher {
  const keys = parseAppleKeyRing(encodedKeyRing, activeKeyId);
  const currentKeyId = activeKeyId as string;

  const requireKey = (keyId: string) => {
    const key = keys.get(keyId);
    if (!key) {
      throw new Error("Apple refresh token encryption key is unavailable");
    }
    return key;
  };

  const keyIdFromValue = (value: string) => {
    const match = value.match(
      /^aes256gcm:v1:([A-Za-z0-9_-]{1,32}):([A-Za-z0-9_-]+)$/,
    );
    return match?.[1];
  };

  return {
    activeKeyId: currentKeyId,
    encrypt(token, userId) {
      const nonce = randomBytes(12);
      const cipher = createCipheriv(
        "aes-256-gcm",
        requireKey(currentKeyId),
        nonce,
      );
      cipher.setAAD(Buffer.from(`nomly-apple-refresh-v1\0${userId}`, "utf8"));
      const ciphertext = Buffer.concat([
        cipher.update(token, "utf8"),
        cipher.final(),
      ]);
      const payload = Buffer.concat([
        nonce,
        cipher.getAuthTag(),
        ciphertext,
      ]).toString("base64url");
      return `${appleCipherPrefix}${currentKeyId}:${payload}`;
    },
    decrypt(value, userId) {
      const keyId = keyIdFromValue(value);
      if (!keyId) {
        throw new Error("Apple refresh token ciphertext is invalid");
      }

      const encodedPayload = value.slice(
        `${appleCipherPrefix}${keyId}:`.length,
      );
      const payload = Buffer.from(encodedPayload, "base64url");
      if (
        payload.toString("base64url") !== encodedPayload ||
        payload.length < 29
      ) {
        throw new Error("Apple refresh token ciphertext is invalid");
      }

      const decipher = createDecipheriv(
        "aes-256-gcm",
        requireKey(keyId),
        payload.subarray(0, 12),
      );
      decipher.setAAD(Buffer.from(`nomly-apple-refresh-v1\0${userId}`, "utf8"));
      decipher.setAuthTag(payload.subarray(12, 28));
      return Buffer.concat([
        decipher.update(payload.subarray(28)),
        decipher.final(),
      ]).toString("utf8");
    },
    keyId: keyIdFromValue,
  };
}

/** Treat every reserved ciphertext marker as ciphertext, including unsupported versions. */
export function isEncryptedAppleRefreshToken(value: string): boolean {
  return value.startsWith(appleCipherMarker);
}

export function isSupportedAppleRefreshTokenCiphertext(value: string): boolean {
  return new RegExp(
    `^${appleCipherPrefix}[A-Za-z0-9_-]{1,32}:[A-Za-z0-9_-]{39,}$`,
  ).test(value);
}
