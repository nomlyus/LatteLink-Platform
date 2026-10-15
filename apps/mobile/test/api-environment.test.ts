import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

type RuntimeConfig = {
  appVariant?: string;
  bundleIdentifier?: string;
  apiBaseUrl?: string;
  catalogApiBaseUrl?: string;
  locationId?: string;
  nodeEnv?: string;
};

async function loadApiClientEnvironment(config: RuntimeConfig) {
  vi.resetModules();
  vi.unstubAllEnvs();

  vi.stubEnv("NODE_ENV", config.nodeEnv ?? "production");
  if (config.appVariant) {
    vi.stubEnv("EXPO_PUBLIC_APP_VARIANT", config.appVariant);
  }
  if (config.bundleIdentifier) {
    vi.stubEnv("EXPO_PUBLIC_IOS_BUNDLE_IDENTIFIER", config.bundleIdentifier);
  }
  if (config.apiBaseUrl !== undefined) {
    vi.stubEnv("EXPO_PUBLIC_API_BASE_URL", config.apiBaseUrl);
  }
  if (config.catalogApiBaseUrl) {
    vi.stubEnv("EXPO_PUBLIC_CATALOG_SERVICE_BASE_URL", config.catalogApiBaseUrl);
  }
  if (config.locationId) {
    vi.stubEnv("EXPO_PUBLIC_LOCATION_ID", config.locationId);
  }

  return import("../src/api/client");
}

afterEach(() => {
  vi.resetModules();
  vi.unstubAllEnvs();
});

describe("mobile API environment guard", () => {
  it("keeps the example environment aligned with release host guards", () => {
    const example = readFileSync(join(import.meta.dirname, "..", ".env.example"), "utf8");

    expect(example).not.toContain("example.com");
    expect(example).toContain("EXPO_PUBLIC_API_BASE_URL=https://api-dev.nomly.us/v1");
    expect(example).toContain("IOS_ASSOCIATED_DOMAINS=webcredentials:api-dev.nomly.us");
  });

  it("allows beta builds to use the dev API", async () => {
    const { API_BASE_URL, MOBILE_API_ENVIRONMENT } = await loadApiClientEnvironment({
      appVariant: "beta",
      bundleIdentifier: "com.lattelink.rawaq.beta",
      apiBaseUrl: "https://api-dev.nomly.us/v1",
      locationId: "rawaqcoffee01"
    });

    expect(API_BASE_URL).toBe("https://api-dev.nomly.us/v1");
    expect(MOBILE_API_ENVIRONMENT.locationId).toBe("rawaqcoffee01");
    expect(MOBILE_API_ENVIRONMENT.apiConfigurationError).toBeNull();
  });

  it("blocks beta builds from using the production API", async () => {
    const { API_BASE_URL, MOBILE_API_ENVIRONMENT } = await loadApiClientEnvironment({
      appVariant: "beta",
      bundleIdentifier: "com.lattelink.rawaq.beta",
      apiBaseUrl: "https://api.nomly.us/v1",
      locationId: "rawaqcoffee01"
    });

    expect(API_BASE_URL).toBe("");
    expect(MOBILE_API_ENVIRONMENT.apiConfigurationError).toContain("Beta mobile builds must use api-dev.nomly.us");
  });

  it("blocks production builds from using the dev API", async () => {
    const { API_BASE_URL, MOBILE_API_ENVIRONMENT } = await loadApiClientEnvironment({
      appVariant: "production",
      bundleIdentifier: "com.lattelink.rawaq",
      apiBaseUrl: "https://api-dev.nomly.us/v1",
      locationId: "rawaqcoffee01"
    });

    expect(API_BASE_URL).toBe("");
    expect(MOBILE_API_ENVIRONMENT.apiConfigurationError).toContain("Production mobile builds must use api.nomly.us");
  });

  it("reports a missing API base URL as a startup configuration error", async () => {
    const { API_BASE_URL, MOBILE_API_ENVIRONMENT } = await loadApiClientEnvironment({
      appVariant: "beta",
      bundleIdentifier: "com.lattelink.rawaq.beta",
      locationId: "rawaqcoffee01"
    });

    expect(API_BASE_URL).toBe("");
    expect(MOBILE_API_ENVIRONMENT.apiConfigurationError).toContain("EXPO_PUBLIC_API_BASE_URL is not configured.");
  });

  it("allows local API URLs while running in Expo Go", async () => {
    const { API_BASE_URL, MOBILE_API_ENVIRONMENT } = await loadApiClientEnvironment({
      nodeEnv: "development",
      appVariant: "beta",
      bundleIdentifier: "com.lattelink.rawaq.beta",
      apiBaseUrl: "http://127.0.0.1:8080/v1",
      locationId: "rawaqcoffee01"
    });

    expect(API_BASE_URL).toBe("http://127.0.0.1:8080/v1");
    expect(MOBILE_API_ENVIRONMENT.apiConfigurationError).toBeNull();
  });

  it("reports a missing location id as a startup configuration error", async () => {
    const { MOBILE_API_ENVIRONMENT } = await loadApiClientEnvironment({
      appVariant: "beta",
      bundleIdentifier: "com.lattelink.rawaq.beta",
      apiBaseUrl: "https://api-dev.nomly.us/v1"
    });

    expect(MOBILE_API_ENVIRONMENT.locationId).toBe("");
    expect(MOBILE_API_ENVIRONMENT.apiConfigurationError).toContain("EXPO_PUBLIC_LOCATION_ID is not configured.");
  });
});
