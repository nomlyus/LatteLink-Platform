import { afterEach, describe, expect, it, vi } from "vitest";

type RuntimeConfig = {
  appVariant?: string;
  bundleIdentifier?: string;
  apiBaseUrl?: string;
  catalogApiBaseUrl?: string;
  brandId?: string;
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
  vi.stubEnv("EXPO_PUBLIC_BRAND_ID", config.brandId ?? "");
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
  it("allows beta builds to use the dev API", async () => {
    const { API_BASE_URL, MOBILE_API_ENVIRONMENT } = await loadApiClientEnvironment({
      appVariant: "beta",
      bundleIdentifier: "com.lattelink.rawaq.beta",
      apiBaseUrl: "https://api-dev.nomly.us/v1",
      brandId: "northside-coffee",
      locationId: "rawaqcoffee01"
    });

    expect(API_BASE_URL).toBe("https://api-dev.nomly.us/v1");
    expect(MOBILE_API_ENVIRONMENT.brandId).toBe("northside-coffee");
    expect(MOBILE_API_ENVIRONMENT.locationId).toBe("rawaqcoffee01");
    expect(MOBILE_API_ENVIRONMENT.apiConfigurationError).toBeNull();
  });

  it("blocks beta builds from using the production API", async () => {
    const { API_BASE_URL, MOBILE_API_ENVIRONMENT } = await loadApiClientEnvironment({
      appVariant: "beta",
      bundleIdentifier: "com.lattelink.rawaq.beta",
      apiBaseUrl: "https://api.nomly.us/v1",
      brandId: "northside-coffee",
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
      brandId: "northside-coffee",
      locationId: "rawaqcoffee01"
    });

    expect(API_BASE_URL).toBe("");
    expect(MOBILE_API_ENVIRONMENT.apiConfigurationError).toContain("Production mobile builds must use api.nomly.us");
  });

  it("reports a missing API base URL as a startup configuration error", async () => {
    const { API_BASE_URL, MOBILE_API_ENVIRONMENT } = await loadApiClientEnvironment({
      appVariant: "beta",
      bundleIdentifier: "com.lattelink.rawaq.beta",
      brandId: "northside-coffee",
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
      brandId: "northside-coffee",
      locationId: "rawaqcoffee01"
    });

    expect(API_BASE_URL).toBe("http://127.0.0.1:8080/v1");
    expect(MOBILE_API_ENVIRONMENT.apiConfigurationError).toBeNull();
  });

  it("keeps the missing legacy location as a separate compatibility error", async () => {
    const { MOBILE_API_ENVIRONMENT } = await loadApiClientEnvironment({
      appVariant: "beta",
      bundleIdentifier: "com.lattelink.rawaq.beta",
      apiBaseUrl: "https://api-dev.nomly.us/v1",
      brandId: "northside-coffee"
    });

    expect(MOBILE_API_ENVIRONMENT.locationId).toBe("");
    expect(MOBILE_API_ENVIRONMENT.locationCompatibilityError).toContain("EXPO_PUBLIC_LOCATION_ID is not configured.");
    expect(MOBILE_API_ENVIRONMENT.apiConfigurationError).toBeNull();
  });

  it("fails closed when the public brand selector is missing or malformed without Rawaq fallback", async () => {
    const missing = await loadApiClientEnvironment({
      appVariant: "beta",
      bundleIdentifier: "com.lattelink.rawaq.beta",
      apiBaseUrl: "https://api-dev.nomly.us/v1"
    });
    expect(missing.MOBILE_API_ENVIRONMENT.brandId).toBe("");
    expect(missing.MOBILE_API_ENVIRONMENT.brandConfigurationError).toContain("EXPO_PUBLIC_BRAND_ID is not configured.");
    expect(missing.MOBILE_API_ENVIRONMENT.apiConfigurationError).toContain("EXPO_PUBLIC_BRAND_ID is not configured.");

    const invalid = await loadApiClientEnvironment({
      appVariant: "beta",
      bundleIdentifier: "com.lattelink.rawaq.beta",
      apiBaseUrl: "https://api-dev.nomly.us/v1",
      brandId: "   "
    });
    expect(invalid.MOBILE_API_ENVIRONMENT.brandId).toBe("");
    expect(invalid.MOBILE_API_ENVIRONMENT.brandConfigurationError).toContain("EXPO_PUBLIC_BRAND_ID is not configured.");

    const tooLong = await loadApiClientEnvironment({
      appVariant: "beta",
      bundleIdentifier: "com.lattelink.rawaq.beta",
      apiBaseUrl: "https://api-dev.nomly.us/v1",
      brandId: "b".repeat(161)
    });
    expect(tooLong.MOBILE_API_ENVIRONMENT.brandId).toBe("");
    expect(tooLong.MOBILE_API_ENVIRONMENT.brandConfigurationError).toContain("EXPO_PUBLIC_BRAND_ID is invalid.");
  });
});
