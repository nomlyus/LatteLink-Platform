import assert from "node:assert/strict";
import test from "node:test";
import {
  changedConfigVars,
  collectConfigVars,
  herokuConfigKeys,
  effectiveHerokuConfigEnv,
  syncHerokuConfig,
} from "./heroku-sync-config.mjs";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  loadIdentitySecretStorageConfig,
  validateIdentitySecretStorageConfig,
} from "./identity-secret-storage-config.mjs";

test("the Heroku config allowlist excludes platform-owned and deploy credentials", () => {
  assert.equal(herokuConfigKeys.includes("PORT"), false);
  assert.equal(herokuConfigKeys.includes("HEROKU_API_KEY"), false);
  assert.equal(herokuConfigKeys.includes("HEROKU_APP_NAME"), false);
  assert.equal(herokuConfigKeys.includes("GATEWAY_PROXY_MODE"), true);
  assert.equal(
    herokuConfigKeys.includes("IDENTITY_APPLE_TOKEN_ENCRYPTION_KEYS"),
    true,
  );
  assert.equal(
    herokuConfigKeys.includes("IDENTITY_APPLE_TOKEN_ENCRYPTION_ACTIVE_KEY_ID"),
    true,
  );
  assert.equal(
    herokuConfigKeys.includes("IDENTITY_ALLOW_LEGACY_SECRETS"),
    true,
  );
});

const syntheticKeyRing = JSON.stringify({
  active: Buffer.alloc(32, 37).toString("base64"),
});

test("identity key preflight accepts only a valid active external keyring without returning key material", () => {
  const result = validateIdentitySecretStorageConfig({
    DEPLOY_ENV: "dev",
    IDENTITY_APPLE_TOKEN_ENCRYPTION_KEYS: syntheticKeyRing,
    IDENTITY_APPLE_TOKEN_ENCRYPTION_ACTIVE_KEY_ID: "active",
    IDENTITY_ALLOW_LEGACY_SECRETS: "dev-cutover",
  });
  assert.deepEqual(result, {
    keyRingPresent: true,
    activeKeyIdPresent: true,
    legacyCompatibilityEnabled: true,
  });
  assert.equal(JSON.stringify(result).includes(syntheticKeyRing), false);
  assert.equal(
    JSON.stringify(result).includes(Buffer.alloc(32, 37).toString("base64")),
    false,
  );
});

test("identity key preflight rejects missing, malformed, and non-dev legacy settings", () => {
  const valid = {
    DEPLOY_ENV: "dev",
    IDENTITY_APPLE_TOKEN_ENCRYPTION_KEYS: syntheticKeyRing,
    IDENTITY_APPLE_TOKEN_ENCRYPTION_ACTIVE_KEY_ID: "active",
  };
  assert.throws(
    () =>
      validateIdentitySecretStorageConfig({
        ...valid,
        IDENTITY_APPLE_TOKEN_ENCRYPTION_KEYS: "",
      }),
    /IDENTITY_APPLE_TOKEN_ENCRYPTION_KEYS/,
  );
  assert.throws(
    () =>
      validateIdentitySecretStorageConfig({
        ...valid,
        IDENTITY_APPLE_TOKEN_ENCRYPTION_ACTIVE_KEY_ID: "missing",
      }),
    /ACTIVE_KEY_ID/,
  );
  assert.throws(
    () =>
      validateIdentitySecretStorageConfig({
        ...valid,
        DEPLOY_ENV: "production",
        IDENTITY_ALLOW_LEGACY_SECRETS: "dev-cutover",
      }),
    /restricted to DEPLOY_ENV=dev/,
  );
  assert.throws(
    () =>
      validateIdentitySecretStorageConfig({
        ...valid,
        IDENTITY_APPLE_TOKEN_ENCRYPTION_KEYS: JSON.stringify({
          active: Buffer.alloc(16).toString("base64"),
        }),
      }),
    /canonical 32-byte keys/,
  );
});

test("Compose preflight loads values from its env file and honors process overrides", async () => {
  const tempDirectory = await mkdtemp(join(tmpdir(), "nomly-secret-config-"));
  const envFilePath = join(tempDirectory, ".env");
  try {
    await writeFile(
      envFilePath,
      [
        "DEPLOY_ENV=dev",
        `IDENTITY_APPLE_TOKEN_ENCRYPTION_KEYS=${syntheticKeyRing}`,
        "IDENTITY_APPLE_TOKEN_ENCRYPTION_ACTIVE_KEY_ID=active",
        "IDENTITY_ALLOW_LEGACY_SECRETS=",
        "",
      ].join("\n"),
    );
    const config = await loadIdentitySecretStorageConfig(
      { IDENTITY_ALLOW_LEGACY_SECRETS: "dev-cutover" },
      envFilePath,
    );
    assert.deepEqual(validateIdentitySecretStorageConfig(config), {
      keyRingPresent: true,
      activeKeyIdPresent: true,
      legacyCompatibilityEnabled: true,
    });
  } finally {
    await rm(tempDirectory, { recursive: true, force: true });
  }
});

test("dev Heroku sync forwards key settings without logging values and clears an unset legacy switch", async () => {
  const originalFetch = globalThis.fetch;
  const originalApiKey = process.env.HEROKU_API_KEY;
  const originalLog = console.info;
  const logs = [];
  let patch;
  globalThis.fetch = async (_url, input = {}) => {
    if (input.method === "PATCH") {
      patch = JSON.parse(input.body);
      return { ok: true, json: async () => patch };
    }
    return {
      ok: true,
      json: async () => ({ IDENTITY_ALLOW_LEGACY_SECRETS: "dev-cutover" }),
    };
  };
  process.env.HEROKU_API_KEY = "test-only-heroku-api-key";
  console.info = (...values) => logs.push(values.join(" "));

  try {
    await syncHerokuConfig({
      DEPLOY_ENV: "dev",
      HEROKU_APP_NAME: "nomly-api-dev",
      PAYMENT_RECONCILER_ENABLED: "false",
      IDENTITY_APPLE_TOKEN_ENCRYPTION_KEYS: syntheticKeyRing,
      IDENTITY_APPLE_TOKEN_ENCRYPTION_ACTIVE_KEY_ID: "active",
      IDENTITY_ALLOW_LEGACY_SECRETS: "",
    });
  } finally {
    globalThis.fetch = originalFetch;
    console.info = originalLog;
    if (originalApiKey === undefined) delete process.env.HEROKU_API_KEY;
    else process.env.HEROKU_API_KEY = originalApiKey;
  }

  assert.equal(patch.IDENTITY_APPLE_TOKEN_ENCRYPTION_KEYS, syntheticKeyRing);
  assert.equal(patch.IDENTITY_APPLE_TOKEN_ENCRYPTION_ACTIVE_KEY_ID, "active");
  assert.equal(patch.IDENTITY_ALLOW_LEGACY_SECRETS, null);
  assert.equal(logs.join(" ").includes(syntheticKeyRing), false);
  assert.equal(
    logs.join(" ").includes(Buffer.alloc(32, 37).toString("base64")),
    false,
  );
});

test("production Heroku sync never alters identity secret-storage settings", async () => {
  const originalFetch = globalThis.fetch;
  const originalApiKey = process.env.HEROKU_API_KEY;
  const originalLog = console.info;
  let patchCalled = false;
  globalThis.fetch = async (_url, input = {}) => {
    if (input.method === "PATCH") patchCalled = true;
    return {
      ok: true,
      json: async () => ({
        DEPLOY_ENV: "production",
        IDENTITY_APPLE_TOKEN_ENCRYPTION_KEYS: "existing-value-hidden",
        IDENTITY_APPLE_TOKEN_ENCRYPTION_ACTIVE_KEY_ID: "existing-id",
        IDENTITY_ALLOW_LEGACY_SECRETS: "existing-mode",
      }),
    };
  };
  process.env.HEROKU_API_KEY = "test-only-heroku-api-key";
  console.info = () => undefined;

  try {
    await syncHerokuConfig({
      DEPLOY_ENV: "production",
      HEROKU_APP_NAME: "nomly-api-prod",
    });
  } finally {
    globalThis.fetch = originalFetch;
    console.info = originalLog;
    if (originalApiKey === undefined) delete process.env.HEROKU_API_KEY;
    else process.env.HEROKU_API_KEY = originalApiKey;
  }

  assert.equal(patchCalled, false);
});

test("collectConfigVars keeps multiline secrets and omits empty values", () => {
  assert.deepEqual(
    collectConfigVars(
      {
        APP_VERSION: "1.0.10",
        APPLE_PRIVATE_KEY: "line-one\nline-two",
        STRIPE_SECRET_KEY: "",
      },
      ["APP_VERSION", "APPLE_PRIVATE_KEY", "STRIPE_SECRET_KEY"],
    ),
    {
      APP_VERSION: "1.0.10",
      APPLE_PRIVATE_KEY: "line-one\nline-two",
    },
  );
});

test("changedConfigVars only sends values that differ", () => {
  assert.deepEqual(
    changedConfigVars(
      { APP_VERSION: "1.0.9", LOG_LEVEL: "info" },
      { APP_VERSION: "1.0.10", LOG_LEVEL: "info" },
    ),
    { APP_VERSION: "1.0.10" },
  );
});

test("dev config applies and validates shared pools even when an older workflow lacks them", () => {
  const effective = effectiveHerokuConfigEnv({
    DEPLOY_ENV: "dev",
    PAYMENT_RECONCILER_ENABLED: "true",
    POSTGRES_POOL_BUDGET_LIMIT: "30",
    POSTGRES_POOL_HEADROOM_MIN: "10",
  });
  assert.equal(effective.POSTGRES_SHARED_POOL_ENABLED, "true");
  assert.equal(effective.POSTGRES_SHARED_GENERAL_POOL_MAX, "4");
  assert.equal(effective.POSTGRES_SHARED_CRITICAL_POOL_MAX, "4");
  assert.equal(effective.POSTGRES_SHARED_RECONCILER_POOL_MAX, "1");
  assert.equal(effective.POSTGRES_POOL_BUDGET_LIMIT, "15");
  assert.equal(effective.POSTGRES_POOL_HEADROOM_MIN, "6");
});

test("production config is passed through unchanged", () => {
  const env = { DEPLOY_ENV: "production" };
  assert.equal(effectiveHerokuConfigEnv(env), env);
});
