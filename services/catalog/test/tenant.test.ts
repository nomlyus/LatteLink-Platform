import { describe, expect, it } from "vitest";
import {
  LOCAL_FIXTURE_BRAND_ID,
  LOCAL_FIXTURE_LOCATION_ID,
  resolveDefaultAppConfigPayload,
  resolveOperatorFallbackLocationId,
  resolveLocalFixtureAppConfigPayload
} from "../src/tenant.js";

describe("catalog tenant defaults", () => {
  it("does not resolve a production/default location when configuration is missing", () => {
    expect(resolveOperatorFallbackLocationId({})).toBeUndefined();
    expect(resolveOperatorFallbackLocationId({ CATALOG_DEFAULT_LOCATION_ID: "configured-operator-only" })).toBe("configured-operator-only");
    expect(() => resolveDefaultAppConfigPayload({})).toThrow("requires explicit CATALOG_DEFAULT_* values");
  });

  it("allows a seed only when every merchant and location identity is explicit", () => {
    const config = resolveDefaultAppConfigPayload({
      CATALOG_DEFAULT_BRAND_ID: "harbor-coffee",
      CATALOG_DEFAULT_BRAND_NAME: "Harbor Coffee",
      CATALOG_DEFAULT_LOCATION_ID: "harbor-downtown",
      CATALOG_DEFAULT_LOCATION_NAME: "Downtown",
      CATALOG_DEFAULT_MARKET_LABEL: "Detroit, MI"
    });

    expect(config.brand).toMatchObject({
      brandId: "harbor-coffee",
      brandName: "Harbor Coffee",
      locationId: "harbor-downtown",
      locationName: "Downtown"
    });
  });

  it("keeps the legacy Rawaq values isolated to the explicit Vitest in-memory fixture", () => {
    expect(resolveLocalFixtureAppConfigPayload({ NODE_ENV: "test", VITEST: "true" }).brand).toMatchObject({
      brandId: LOCAL_FIXTURE_BRAND_ID,
      locationId: LOCAL_FIXTURE_LOCATION_ID
    });
    expect(() => resolveLocalFixtureAppConfigPayload({ NODE_ENV: "production", VITEST: "true" })).toThrow(
      "requires Vitest or explicit local in-memory persistence"
    );
  });
});
