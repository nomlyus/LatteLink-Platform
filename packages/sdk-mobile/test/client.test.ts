import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GazelleApiClient } from "../src";

describe("sdk-mobile", () => {
  const fetchMock = vi.fn<typeof fetch>();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("creates client instance", () => {
    const client = new GazelleApiClient({ baseUrl: "https://api.gazellecoffee.com/v1" });
    expect(client).toBeInstanceOf(GazelleApiClient);
  });

  it("parses menu and store config responses", async () => {
    fetchMock
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            locationId: "flagship-01",
            currency: "USD",
            categories: [
              {
                id: "coffee",
                title: "Coffee",
                items: [
                  {
                    id: "latte",
                    name: "Latte",
                    description: "Steamed milk and espresso",
                    priceCents: 575,
                    badgeCodes: ["popular"],
                    visible: true
                  }
                ]
              }
            ]
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        )
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            locationId: "flagship-01",
            prepEtaMinutes: 12,
            taxRateBasisPoints: 600,
            pickupInstructions: "Pickup at the flagship order counter."
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        )
      );

    const client = new GazelleApiClient({ baseUrl: "https://api.gazellecoffee.com/v1" });
    const menu = await client.menu();
    const storeConfig = await client.storeConfig();

    expect(menu.categories[0]?.items[0]?.name).toBe("Latte");
    expect(storeConfig.taxRateBasisPoints).toBe(600);
  });
});
