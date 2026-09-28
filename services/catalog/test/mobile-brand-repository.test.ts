import Fastify from "fastify";
import { afterEach, describe, expect, it } from "vitest";
import { createCatalogRepository } from "../src/repository.js";
import { DEFAULT_LOCATION_ID } from "../src/tenant.js";

const previousDatabaseUrl = process.env.DATABASE_URL;
const previousNodeEnv = process.env.NODE_ENV;

afterEach(() => {
  if (previousDatabaseUrl === undefined) delete process.env.DATABASE_URL;
  else process.env.DATABASE_URL = previousDatabaseUrl;
  if (previousNodeEnv === undefined) delete process.env.NODE_ENV;
  else process.env.NODE_ENV = previousNodeEnv;
});

describe("catalog brand/location membership", () => {
  it("uses persisted tenant/location relationships independently of display configuration", async () => {
    delete process.env.DATABASE_URL;
    process.env.NODE_ENV = "test";
    const fastify = Fastify({ logger: false });
    const repository = await createCatalogRepository(fastify.log);
    try {
      const brandA = await repository.createInternalClient({
        clientName: "Brand A Coffee",
        locationName: "Brand A Flagship",
        marketLabel: "Detroit, MI",
        timezone: "America/Detroit",
        ownerEmail: "owner@brand-a.example"
      });
      const brandB = await repository.createInternalClient({
        clientName: "Brand B Coffee",
        locationName: "Brand B Flagship",
        marketLabel: "Ann Arbor, MI",
        timezone: "America/Detroit",
        ownerEmail: "owner@brand-b.example"
      });

      expect(await repository.doesLocationBelongToBrand(brandA.onboarding.brandId, brandA.locationId)).toBe(true);
      expect(await repository.doesLocationBelongToBrand(brandA.onboarding.brandId, brandB.locationId)).toBe(false);
      expect(await repository.doesLocationBelongToBrand(brandB.onboarding.brandId, "unknown-location")).toBe(false);
      expect(await repository.getAppConfig(DEFAULT_LOCATION_ID)).toBeDefined();
      expect(await repository.doesLocationBelongToBrand(brandA.onboarding.brandId, DEFAULT_LOCATION_ID)).toBe(false);

      const bootstrapA = await repository.getMobileBrandBootstrap(brandA.onboarding.brandId);
      const bootstrapB = await repository.getMobileBrandBootstrap(brandB.onboarding.brandId);
      expect(bootstrapA).toMatchObject({ status: "unavailable", brand: { brandId: brandA.onboarding.brandId } });
      expect(bootstrapB).toMatchObject({ status: "unavailable", brand: { brandId: brandB.onboarding.brandId } });
      expect(bootstrapA?.locations).toEqual([]);
      expect(bootstrapB?.locations).toEqual([]);
      expect(await repository.getMobileBrandBootstrap("unknown-brand")).toBeUndefined();
    } finally {
      await repository.close();
      await fastify.close();
    }
  });
});
