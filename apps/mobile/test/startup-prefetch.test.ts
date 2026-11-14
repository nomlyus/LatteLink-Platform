import { readFileSync } from "node:fs";
import { QueryClient } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";
import { catalogQueryKeys, prefetchCatalogQueries } from "../src/menu/catalog";

const requests = vi.hoisted(() => ({
  menu: vi.fn(() => new Promise<never>(() => {})),
  appConfig: vi.fn(() => new Promise<never>(() => {})),
  storeConfig: vi.fn(() => new Promise<never>(() => {})),
  homeNewsCards: vi.fn(() => new Promise<never>(() => {})),
  mobileExperience: vi.fn(() => new Promise<never>(() => {}))
}));

vi.mock("../src/location/LocationProvider", () => ({ useLocationContext: vi.fn() }));
vi.mock("../src/api/client", () => ({
  API_BASE_URL: "https://example.test/v1",
  CATALOG_API_BASE_URL: "https://example.test/v1",
  apiClient: { forLocation: vi.fn(() => requests) },
  catalogApiClient: { forLocation: vi.fn(() => requests) }
}));
vi.mock("../src/observability/criticalDataLoad", () => ({
  withCriticalDataLoadSentry: (_context: unknown, load: () => Promise<unknown>) => load()
}));

describe("startup catalog warmup", () => {
  it("starts independent data while app-config is still pending and deduplicates repeated warmup", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    try {
      prefetchCatalogQueries(client, { brandId: "brand-a", locationId: "location-a" });
      prefetchCatalogQueries(client, { brandId: "brand-a", locationId: "location-a" });

      for (const request of Object.values(requests)) {
        expect(request).toHaveBeenCalledTimes(1);
      }
      expect(client.getQueryState(catalogQueryKeys.appConfig("location-a", "brand-a"))?.fetchStatus).toBe("fetching");
      expect(client.getQueryState(catalogQueryKeys.menu("location-a", "brand-a"))?.fetchStatus).toBe("fetching");
    } finally {
      await client.cancelQueries();
      client.clear();
    }
  });

  it("does not start catalog requests without a validated location context", () => {
    expect(() => prefetchCatalogQueries(new QueryClient(), { brandId: "brand-a", locationId: "" })).toThrow(
      "A selected branded-app location is required"
    );
  });

  it("mounts warmup outside the config gate without moving authenticated side effects ahead of it", () => {
    const layout = readFileSync(new URL("../app/_layout.tsx", import.meta.url), "utf8");
    expect(layout.indexOf("<CatalogWarmup />")).toBeLessThan(layout.indexOf("<StartupCatalogGate"));
    expect(layout.indexOf("<AppInitializer />")).toBeGreaterThan(layout.indexOf("<StartupCatalogGate"));
    expect(layout).not.toContain("MIN_SPLASH_DURATION_MS");
    expect(layout).not.toContain("InteractionManager");
  });
});
