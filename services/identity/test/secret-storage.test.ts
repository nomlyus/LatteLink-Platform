import { randomBytes } from "node:crypto";
import type { FastifyBaseLogger } from "fastify";
import { afterEach, describe, expect, it, vi } from "vitest";
import { backfillIdentitySecretStorage } from "../src/backfill-secret-storage.js";
import { createIdentityRepository } from "../src/repository.js";
import {
  createAppleRefreshTokenCipher,
  digestSessionToken,
  isEncryptedAppleRefreshToken,
  isLegacySecretCutoverEnabled,
  isSessionTokenDigest,
  isSupportedAppleRefreshTokenCiphertext,
  sessionTokenLookupValues,
} from "../src/secret-storage.js";

function createKeyRing() {
  return {
    old: randomBytes(32).toString("base64"),
    active: randomBytes(32).toString("base64"),
  };
}

describe("identity secret storage", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("stores a versioned, domain-separated one-way lookup value for bearer tokens", () => {
    const token = `refresh_${randomBytes(32).toString("base64url")}`;
    const digest = digestSessionToken(token);
    expect(isSessionTokenDigest(digest)).toBe(true);
    expect(digest).not.toContain(token);
    expect(digestSessionToken(token)).toBe(digest);
    expect(sessionTokenLookupValues(token)).toEqual([digest, digest]);
    expect(isSessionTokenDigest(token)).toBe(false);
  });

  it("permits legacy session lookup only during an explicit dev cutover", () => {
    const token = "legacy-session-token";
    const digest = digestSessionToken(token);
    vi.stubEnv("DEPLOY_ENV", "prod");
    vi.stubEnv("IDENTITY_ALLOW_LEGACY_SECRETS", "dev-cutover");
    expect(isLegacySecretCutoverEnabled()).toBe(false);
    expect(sessionTokenLookupValues(token)).toEqual([digest, digest]);
    vi.stubEnv("DEPLOY_ENV", "dev");
    expect(isLegacySecretCutoverEnabled()).toBe(true);
    expect(sessionTokenLookupValues(token)).toEqual([digest, token]);
  });

  it("encrypts Apple refresh tokens with user-bound authenticated encryption", () => {
    const keyRing = createKeyRing();
    const cipher = createAppleRefreshTokenCipher(
      JSON.stringify(keyRing),
      "active",
    );
    const plaintext = "apple-provider-refresh-secret";
    const first = cipher.encrypt(plaintext, "user-a");
    const second = cipher.encrypt(plaintext, "user-a");

    expect(first).not.toBe(second);
    expect(first).not.toContain(plaintext);
    expect(first).toMatch(/^aes256gcm:v1:active:/);
    expect(isEncryptedAppleRefreshToken(first)).toBe(true);
    expect(isSupportedAppleRefreshTokenCiphertext(first)).toBe(true);
    expect(cipher.keyId(first)).toBe("active");
    expect(cipher.decrypt(first, "user-a")).toBe(plaintext);
    expect(() => cipher.decrypt(first, "user-b")).toThrow();
    expect(() =>
      createAppleRefreshTokenCipher(
        JSON.stringify({ active: randomBytes(32).toString("base64") }),
        "active",
      ).decrypt(first, "user-a"),
    ).toThrow();
    expect(() => cipher.decrypt(`${first.slice(0, -2)}xx`, "user-a")).toThrow();
    expect(() => cipher.decrypt(plaintext, "user-a")).toThrow();
  });

  it("supports key rotation by retaining old IDs for reads and selecting the new active key for writes", () => {
    const keyRing = createKeyRing();
    const oldCipher = createAppleRefreshTokenCipher(
      JSON.stringify({ old: keyRing.old }),
      "old",
    );
    const rotatingCipher = createAppleRefreshTokenCipher(
      JSON.stringify(keyRing),
      "active",
    );
    const oldValue = oldCipher.encrypt("provider-secret", "user-a");

    expect(rotatingCipher.keyId(oldValue)).toBe("old");
    expect(rotatingCipher.decrypt(oldValue, "user-a")).toBe("provider-secret");
    const reencrypted = rotatingCipher.encrypt(
      rotatingCipher.decrypt(oldValue, "user-a"),
      "user-a",
    );
    expect(rotatingCipher.keyId(reencrypted)).toBe("active");
    expect(rotatingCipher.decrypt(reencrypted, "user-a")).toBe(
      "provider-secret",
    );
    expect(() =>
      createAppleRefreshTokenCipher(
        JSON.stringify({ active: keyRing.active }),
        "active",
      ).decrypt(oldValue, "user-a"),
    ).toThrow(/key is unavailable/);
  });

  it("uses authenticated opaque cursors for bounded Apple backfill pages", () => {
    const keyRing = createKeyRing();
    const cipher = createAppleRefreshTokenCipher(
      JSON.stringify(keyRing),
      "active",
    );
    const userId = "037dcb74-e957-4c8e-85e4-8270eb027d2c";
    const cursor = cipher.encodeBackfillCursor(userId);

    expect(cursor).toMatch(/^nomly-backfill:v1:active:/);
    expect(cursor).not.toContain(userId);
    expect(cipher.decodeBackfillCursor(cursor)).toBe(userId);
    expect(
      createAppleRefreshTokenCipher(
        JSON.stringify(keyRing),
        "old",
      ).decodeBackfillCursor(cursor),
    ).toBe(userId);
    expect(() => cipher.decodeBackfillCursor(`${cursor}tampered`)).toThrow(
      /cursor is invalid or unavailable/,
    );
    expect(() =>
      createAppleRefreshTokenCipher(
        JSON.stringify({ active: randomBytes(32).toString("base64") }),
        "active",
      ).decodeBackfillCursor(cursor),
    ).toThrow(/cursor is invalid or unavailable/);
    expect(() => cipher.encodeBackfillCursor("not-a-user-id")).toThrow(
      /cursor user ID is invalid/,
    );
  });

  it("fails closed on malformed or unknown ciphertext markers instead of treating them as plaintext", () => {
    const cipher = createAppleRefreshTokenCipher(
      JSON.stringify({ active: randomBytes(32).toString("base64") }),
      "active",
    );
    const unknownVersion = "aes256gcm:v2:active:ciphertext";
    expect(isEncryptedAppleRefreshToken(unknownVersion)).toBe(true);
    expect(isSupportedAppleRefreshTokenCiphertext(unknownVersion)).toBe(false);
    expect(() => cipher.decrypt(unknownVersion, "user-a")).toThrow();
    expect(() =>
      cipher.decrypt("aes256gcm:v1:active:malformed", "user-a"),
    ).toThrow();
  });

  it("requires a well-formed active external key ring", () => {
    expect(() => createAppleRefreshTokenCipher(undefined, undefined)).toThrow(
      /IDENTITY_APPLE_TOKEN_ENCRYPTION_KEYS/,
    );
    expect(() =>
      createAppleRefreshTokenCipher(
        JSON.stringify({ active: Buffer.alloc(16).toString("base64") }),
        "active",
      ),
    ).toThrow();
    expect(() =>
      createAppleRefreshTokenCipher(
        JSON.stringify({ active: randomBytes(32).toString("base64") }),
        "missing",
      ),
    ).toThrow(/ACTIVE_KEY_ID/);
    expect(() =>
      createAppleRefreshTokenCipher(
        JSON.stringify({ "not a key id": randomBytes(32).toString("base64") }),
        "active",
      ),
    ).toThrow(/invalid key entry/);
  });

  it("does not mask missing persistent-DB encryption keys with the explicit in-memory fallback", async () => {
    vi.stubEnv(
      "DATABASE_URL",
      "postgres://test:test@127.0.0.1:1/identity_secret_test",
    );
    vi.stubEnv("EXPECTED_SUPABASE_PROJECT_REF", "");
    vi.stubEnv("ALLOW_IN_MEMORY_PERSISTENCE", "true");
    vi.stubEnv("IDENTITY_APPLE_TOKEN_ENCRYPTION_KEYS", "");
    vi.stubEnv("IDENTITY_APPLE_TOKEN_ENCRYPTION_ACTIVE_KEY_ID", "");

    await expect(
      createIdentityRepository({
        info: () => undefined,
        error: () => undefined,
      } as unknown as FastifyBaseLogger),
    ).rejects.toThrow(/IDENTITY_APPLE_TOKEN_ENCRYPTION_KEYS/);
  });

  it("requires explicit dev confirmation and an expected Supabase dev project before backfill", async () => {
    vi.stubEnv("DEPLOY_ENV", "prod");
    vi.stubEnv("IDENTITY_SECRET_BACKFILL_CONFIRM", "dev-only");
    await expect(backfillIdentitySecretStorage()).rejects.toThrow(
      /restricted to explicitly confirmed dev/,
    );

    vi.stubEnv("DEPLOY_ENV", "dev");
    vi.stubEnv(
      "DATABASE_URL",
      "postgres://test:test@127.0.0.1:1/identity_secret_test",
    );
    vi.stubEnv("EXPECTED_SUPABASE_PROJECT_REF", "devref");
    vi.stubEnv("IDENTITY_SECRET_BACKFILL_DEV_PROJECT_REF", "devref");
    await expect(backfillIdentitySecretStorage()).rejects.toThrow(
      /Supabase project ref mismatch/,
    );
  });
});
