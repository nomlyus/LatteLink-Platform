import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const validatorPath = fileURLToPath(new URL("../scripts/validate-release-env.mjs", import.meta.url));
const releaseEnvironment = {
  APP_VARIANT: "beta",
  EXPO_PUBLIC_APP_VARIANT: "beta",
  APP_DISPLAY_NAME_BASE: "Nomly Test",
  APP_VERSION: "1.0.0",
  EXPO_SLUG: "nomly-test-beta",
  EXPO_SCHEME: "nomly-test",
  IOS_BUNDLE_IDENTIFIER: "com.nomly.test.beta",
  EXPO_PUBLIC_IOS_BUNDLE_IDENTIFIER: "com.nomly.test.beta",
  EXPO_PUBLIC_API_BASE_URL: "https://api-dev.nomly.us/v1",
  EXPO_PUBLIC_LOCATION_ID: "test-location",
  EXPO_PUBLIC_APPLE_PAY_MERCHANT_ID: "merchant.com.nomly.test.beta",
  EXPO_PUBLIC_BRAND_NAME: "Nomly Test",
  EXPO_PUBLIC_SENTRY_DSN: "https://public@example.ingest.sentry.io/123",
  SENTRY_ORG: "nomly",
  SENTRY_PROJECT: "mobile"
};

function validateRelease(extraEnvironment = {}) {
  const env = { ...process.env, ...releaseEnvironment, ...extraEnvironment };
  if (extraEnvironment.EXPO_PUBLIC_BRAND_ID === undefined) {
    delete env.EXPO_PUBLIC_BRAND_ID;
  }
  return spawnSync(process.execPath, [validatorPath, "beta"], {
    env,
    encoding: "utf8"
  });
}

describe("mobile release environment validation", () => {
  it("requires an explicit brand selector", () => {
    const result = validateRelease();
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("Missing required env: EXPO_PUBLIC_BRAND_ID");
  });

  it("accepts an explicitly configured public brand selector", () => {
    const result = validateRelease({
      EXPO_PUBLIC_BRAND_ID: "northside-coffee"
    });
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("PASS: required environment variables are present and profile-safe.");
  });

  it("rejects a brand selector longer than the bootstrap contract allows", () => {
    const result = validateRelease({ EXPO_PUBLIC_BRAND_ID: "b".repeat(161) });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("EXPO_PUBLIC_BRAND_ID must not exceed 160 characters.");
  });
});
