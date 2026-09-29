import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const validatorPath = fileURLToPath(new URL("../scripts/validate-release-env.mjs", import.meta.url));
const releaseEnvironment = {
  APP_VARIANT: "beta",
  EXPO_PUBLIC_APP_VARIANT: "beta",
  APP_DISPLAY_NAME_BASE: "Nomly Test",
  APP_DISPLAY_NAME: "Nomly Test Beta",
  EXPO_PUBLIC_APP_DISPLAY_NAME: "Nomly Test Beta",
  EXPO_PUBLIC_APP_ICON_PATH: "./test/fixtures/brand-b-icon.png",
  EXPO_PUBLIC_APP_SPLASH_PATH: "./test/fixtures/brand-b-splash.png",
  APP_VERSION: "1.0.0",
  EXPO_SLUG: "nomly-test-beta",
  EXPO_SCHEME: "nomly-test",
  IOS_BUNDLE_IDENTIFIER: "com.nomly.test.beta",
  EXPO_PUBLIC_IOS_BUNDLE_IDENTIFIER: "com.nomly.test.beta",
  EXPO_PUBLIC_API_BASE_URL: "https://api-dev.nomly.us/v1",
  EXPO_PUBLIC_APPLE_PAY_MERCHANT_ID: "merchant.com.nomly.test.beta",
  EXPO_PUBLIC_BRAND_NAME: "Nomly Test",
  EAS_PROJECT_ID: "a3e51f78-120f-4d9a-a001-81b040a3d600",
  EXPO_PUBLIC_SENTRY_DSN: "https://public@example.ingest.sentry.io/123",
  SENTRY_ORG: "nomly",
  SENTRY_PROJECT: "mobile"
};

function validateRelease(extraEnvironment = {}, profile = "beta") {
  const env = { ...process.env, ...releaseEnvironment, ...extraEnvironment };
  if (extraEnvironment.EXPO_PUBLIC_BRAND_ID === undefined) {
    delete env.EXPO_PUBLIC_BRAND_ID;
  }
  return spawnSync(process.execPath, [validatorPath, profile], {
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

  it("rejects the explicit local fixture when a release profile is requested", () => {
    const result = validateRelease({
      APP_VARIANT: "local",
      EXPO_PUBLIC_APP_VARIANT: "local"
    });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("APP_VARIANT must match the target profile");
  });

  it.each([
    ["IOS_BUNDLE_IDENTIFIER", "IOS_BUNDLE_IDENTIFIER"],
    ["EXPO_PUBLIC_APPLE_PAY_MERCHANT_ID", "EXPO_PUBLIC_APPLE_PAY_MERCHANT_ID"],
    ["APP_DISPLAY_NAME", "APP_DISPLAY_NAME"]
  ])("fails closed when required merchant identity %s is missing", (key, errorKey) => {
    const result = validateRelease({ [key]: "" });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain(`Missing required env: ${errorKey}`);
  });

  it("requires a production bundle identifier instead of using the beta or Rawaq identity", () => {
    const result = validateRelease({
      ...releaseEnvironment,
      APP_VARIANT: "production",
      EXPO_PUBLIC_APP_VARIANT: "production",
      EXPO_PUBLIC_API_BASE_URL: "https://api.nomly.us/v1",
      EXPO_PUBLIC_BRAND_ID: "northside-coffee",
      IOS_BUNDLE_IDENTIFIER: "",
      EXPO_PUBLIC_IOS_BUNDLE_IDENTIFIER: ""
    }, "production");
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("Missing required env: IOS_BUNDLE_IDENTIFIER");
    expect(result.stderr).toContain("Missing required env: EXPO_PUBLIC_IOS_BUNDLE_IDENTIFIER");
  });

  it("rejects copying Rawaq identity into another brand's release", () => {
    const result = validateRelease({
      EXPO_PUBLIC_BRAND_ID: "harbor-coffee",
      APP_DISPLAY_NAME: "Rawaq Beta",
      EXPO_PUBLIC_APP_DISPLAY_NAME: "Rawaq Beta",
      EXPO_SLUG: "rawaqcoffee-beta",
      EXPO_SCHEME: "rawaq",
      EXPO_PUBLIC_APP_ICON_PATH: "./assets/icon.png",
      EXPO_PUBLIC_APP_SPLASH_PATH: "./assets/splash.png",
      IOS_BUNDLE_IDENTIFIER: "com.lattelink.rawaq.beta",
      EXPO_PUBLIC_IOS_BUNDLE_IDENTIFIER: "com.lattelink.rawaq.beta",
      EXPO_PUBLIC_APPLE_PAY_MERCHANT_ID: "merchant.com.lattelink.rawaq.beta"
    });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("Rawaq/LatteLink native identity values cannot be used for a different EXPO_PUBLIC_BRAND_ID.");
  });

  it("rejects a Rawaq customer-facing label when building another brand", () => {
    const result = validateRelease({
      EXPO_PUBLIC_BRAND_ID: "harbor-coffee",
      EXPO_PUBLIC_BRAND_NAME: "Rawaq Coffee"
    });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("Rawaq/LatteLink native identity values cannot be used for a different EXPO_PUBLIC_BRAND_ID.");
  });

  it("rejects a brand selector longer than the bootstrap contract allows", () => {
    const result = validateRelease({ EXPO_PUBLIC_BRAND_ID: "b".repeat(161) });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("EXPO_PUBLIC_BRAND_ID must not exceed 160 characters.");
  });
});
