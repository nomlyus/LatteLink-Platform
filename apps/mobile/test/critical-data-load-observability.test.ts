import { beforeEach, describe, expect, it, vi } from "vitest";

type SentryMock = {
  captureException: ReturnType<typeof vi.fn>;
  setContext: ReturnType<typeof vi.fn>;
  setLevel: ReturnType<typeof vi.fn>;
  setTag: ReturnType<typeof vi.fn>;
};

function getSentryMock() {
  return (globalThis as typeof globalThis & { __SENTRY_REACT_NATIVE_MOCK__: SentryMock }).__SENTRY_REACT_NATIVE_MOCK__;
}

describe("critical data-load observability", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("captures handled API failures with safe tags and context", async () => {
    const { captureCriticalDataLoadFailure } = await import("../src/observability/criticalDataLoad");
    const error = new Error(
      'Request failed (400): {"code":"MISSING_LOCATION_ID","message":"locationId is required","requestId":"req_123"}'
    );

    captureCriticalDataLoadFailure({
      feature: "menu",
      operation: "load_menu",
      endpoint: "/menu",
      apiBaseUrl: "https://api-dev.nomly.us/v1",
      locationId: "rawaqcoffee01",
      error
    });

    const sentryMock = getSentryMock();
    expect(sentryMock.captureException).toHaveBeenCalledWith(error);
    expect(sentryMock.setLevel).toHaveBeenCalledWith("warning");
    expect(sentryMock.setTag).toHaveBeenCalledWith("feature", "menu");
    expect(sentryMock.setTag).toHaveBeenCalledWith("operation", "load_menu");
    expect(sentryMock.setTag).toHaveBeenCalledWith("endpoint", "/menu");
    expect(sentryMock.setTag).toHaveBeenCalledWith("apiHost", "api-dev.nomly.us");
    expect(sentryMock.setTag).toHaveBeenCalledWith("locationId", "rawaqcoffee01");
    expect(sentryMock.setTag).toHaveBeenCalledWith("httpStatus", "400");
    expect(sentryMock.setTag).toHaveBeenCalledWith("apiErrorCode", "MISSING_LOCATION_ID");
    expect(sentryMock.setContext).toHaveBeenCalledWith(
      "critical_data_load",
      expect.objectContaining({
        endpoint: "/menu",
        apiHost: "api-dev.nomly.us",
        locationId: "rawaqcoffee01",
        httpStatus: "400",
        apiErrorCode: "MISSING_LOCATION_ID"
      })
    );
  });

  it("throttles duplicate failures to avoid Sentry spam", async () => {
    const { captureCriticalDataLoadFailure } = await import("../src/observability/criticalDataLoad");
    const error = new Error("Unable to reach backend.");
    const input = {
      feature: "home" as const,
      operation: "load_home_news_cards",
      endpoint: "/store/cards",
      apiBaseUrl: "https://api-dev.nomly.us/v1",
      locationId: "rawaqcoffee01",
      error
    };

    captureCriticalDataLoadFailure(input);
    captureCriticalDataLoadFailure(input);

    expect(getSentryMock().captureException).toHaveBeenCalledTimes(1);
  });
});
