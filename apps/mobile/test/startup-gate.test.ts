import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { StartupCatalogGate } from "../src/startup/StartupGate";

const runtime = vi.hoisted(() => ({
  location: { bootstrapStatus: "ready", isResolvingSelection: false, isReady: true, retryBootstrap: vi.fn() },
  query: { isLoading: true, data: undefined, error: null as Error | null, refetch: vi.fn() },
  environment: { apiConfigurationError: null as string | null }
}));

vi.stubGlobal("React", React);
vi.mock("react-native", () => ({
  View: "div", Text: "span", ActivityIndicator: "progress",
  StyleSheet: { create: (styles: unknown) => styles }
}));
vi.mock("../src/ui/system", () => ({
  Button: "button", ScreenBackdrop: () => null, uiPalette: {}, uiTypography: {}
}));
vi.mock("../src/location/LocationProvider", () => ({ useLocationContext: () => runtime.location }));
vi.mock("../src/menu/catalog", () => ({ useAppConfigQuery: () => runtime.query }));
vi.mock("../src/api/client", () => ({
  MOBILE_API_ENVIRONMENT: runtime.environment,
  UNABLE_TO_REACH_BACKEND_MESSAGE: "Unable to reach backend.",
  isBackendReachabilityError: () => false
}));

function renderStartup() {
  return renderToStaticMarkup(React.createElement(StartupCatalogGate, {
    onReadyToDisplay: vi.fn(), children: React.createElement("main", null, "Home content")
  }));
}

describe("startup configuration presentation", () => {
  beforeEach(() => {
    runtime.location.bootstrapStatus = "ready";
    runtime.query.error = null;
    runtime.environment.apiConfigurationError = null;
  });

  it("renders the app while configuration loads after location validation", () => {
    const html = renderStartup();
    expect(html).toContain("Home content");
    expect(html).not.toContain("Loading live store data");
    expect(html).not.toContain("Some actions may be limited");
  });

  it("still blocks the app while locations are being validated", () => {
    runtime.location.bootstrapStatus = "loading";
    expect(renderStartup()).not.toContain("Home content");
  });

  it("still blocks unavailable locations", () => {
    runtime.location.bootstrapStatus = "unavailable";
    const html = renderStartup();
    expect(html).toContain("Store unavailable.");
    expect(html).not.toContain("Home content");
  });

  it("keeps configuration failures visible instead of pretending data loaded", () => {
    runtime.query.error = new Error("Network error");
    expect(renderStartup()).toContain("Some actions may be limited");
    runtime.environment.apiConfigurationError = "Invalid environment";
    const html = renderStartup();
    expect(html).toContain("App data unavailable.");
    expect(html).not.toContain("Home content");
  });
});
