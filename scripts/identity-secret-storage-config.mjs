const keyIdPattern = /^[A-Za-z0-9_-]{1,32}$/;

/** Validate without returning or logging secret material. */
export function validateIdentitySecretStorageConfig(env) {
  const encodedKeyRing = env.IDENTITY_APPLE_TOKEN_ENCRYPTION_KEYS;
  const activeKeyId = env.IDENTITY_APPLE_TOKEN_ENCRYPTION_ACTIVE_KEY_ID;
  const legacyMode = env.IDENTITY_ALLOW_LEGACY_SECRETS?.trim() ?? "";

  if (!encodedKeyRing?.trim()) {
    throw new Error("IDENTITY_APPLE_TOKEN_ENCRYPTION_KEYS must be configured");
  }
  if (!activeKeyId || !keyIdPattern.test(activeKeyId)) {
    throw new Error(
      "IDENTITY_APPLE_TOKEN_ENCRYPTION_ACTIVE_KEY_ID must be configured with a valid key ID",
    );
  }

  let keyRing;
  try {
    keyRing = JSON.parse(encodedKeyRing);
  } catch {
    throw new Error(
      "IDENTITY_APPLE_TOKEN_ENCRYPTION_KEYS must be a valid keyring",
    );
  }
  if (!keyRing || typeof keyRing !== "object" || Array.isArray(keyRing)) {
    throw new Error(
      "IDENTITY_APPLE_TOKEN_ENCRYPTION_KEYS must be a key-ID map",
    );
  }

  const keyIds = Object.keys(keyRing);
  if (
    keyIds.length === 0 ||
    keyIds.some((keyId) => !keyIdPattern.test(keyId))
  ) {
    throw new Error(
      "IDENTITY_APPLE_TOKEN_ENCRYPTION_KEYS must contain valid key IDs",
    );
  }

  for (const encodedKey of Object.values(keyRing)) {
    if (typeof encodedKey !== "string") {
      throw new Error(
        "IDENTITY_APPLE_TOKEN_ENCRYPTION_KEYS must contain valid key material",
      );
    }
    const key = Buffer.from(encodedKey, "base64");
    if (key.length !== 32 || key.toString("base64") !== encodedKey) {
      throw new Error(
        "IDENTITY_APPLE_TOKEN_ENCRYPTION_KEYS must contain canonical 32-byte keys",
      );
    }
  }

  if (!Object.hasOwn(keyRing, activeKeyId)) {
    throw new Error(
      "IDENTITY_APPLE_TOKEN_ENCRYPTION_ACTIVE_KEY_ID must name a key in the keyring",
    );
  }

  if (legacyMode && legacyMode !== "dev-cutover") {
    throw new Error(
      "IDENTITY_ALLOW_LEGACY_SECRETS may only be dev-cutover or unset",
    );
  }
  if (legacyMode === "dev-cutover" && env.DEPLOY_ENV !== "dev") {
    throw new Error(
      "IDENTITY_ALLOW_LEGACY_SECRETS=dev-cutover is restricted to DEPLOY_ENV=dev",
    );
  }

  return {
    keyRingPresent: true,
    activeKeyIdPresent: true,
    legacyCompatibilityEnabled: legacyMode === "dev-cutover",
  };
}

export async function loadIdentitySecretStorageConfig(env, envFilePath) {
  if (!envFilePath) return { ...env };

  const { readFile } = await import("node:fs/promises");
  const { resolve } = await import("node:path");
  const contents = await readFile(resolve(envFilePath), "utf8");
  const fileEnv = {};

  for (const line of contents.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const separator = trimmed.indexOf("=");
    if (separator < 1) continue;
    const name = trimmed.slice(0, separator).trim();
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) continue;
    fileEnv[name] = trimmed.slice(separator + 1);
  }

  // Match Compose precedence: process environment overrides the supplied file.
  return { ...fileEnv, ...env };
}
