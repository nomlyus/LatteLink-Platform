import { afterEach, describe, expect, it, vi } from "vitest";

const storage = new Map<string, string>();

function mockLocalStorage() {
  vi.stubGlobal("window", {
    localStorage: {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => storage.set(key, value),
      removeItem: (key: string) => storage.delete(key)
    }
  });
}

describe("client dashboard storage", () => {
  afterEach(() => {
    storage.clear();
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("uses the configured API base URL when no stored override exists", async () => {
    vi.stubEnv("VITE_API_BASE_URL", "https://api-dev.nomly.us/v1");
    mockLocalStorage();

    const { loadStoredApiBaseUrl } = await import("../src/storage");

    expect(loadStoredApiBaseUrl()).toBe("https://api-dev.nomly.us/v1");
  });

  it("drops a stored API base URL from another deployed environment", async () => {
    vi.stubEnv("VITE_API_BASE_URL", "https://api-dev.nomly.us/v1");
    mockLocalStorage();
    storage.set("lattelink.operator.api-base-url.v2", "https://api.nomly.us/v1");

    const { loadStoredApiBaseUrl } = await import("../src/storage");

    expect(loadStoredApiBaseUrl()).toBe("https://api-dev.nomly.us/v1");
    expect(storage.has("lattelink.operator.api-base-url.v2")).toBe(false);
  });

  it("migrates the legacy setup section to settings", async () => {
    mockLocalStorage();
    storage.set("lattelink.operator.section.v2", "onboarding");

    const { loadStoredSection } = await import("../src/storage");

    expect(loadStoredSection()).toBe("store");
  });

  it("tracks whether the first onboarding wizard has already been shown for an operator location", async () => {
    mockLocalStorage();

    const { hasSeenOnboardingWizard, markOnboardingWizardSeen } = await import("../src/storage");

    expect(hasSeenOnboardingWizard("operator-1", "northside-01")).toBe(false);
    markOnboardingWizardSeen("operator-1", "northside-01");
    expect(hasSeenOnboardingWizard("operator-1", "northside-01")).toBe(true);
    expect(hasSeenOnboardingWizard("operator-1", "downtown-01")).toBe(false);
  });
});
