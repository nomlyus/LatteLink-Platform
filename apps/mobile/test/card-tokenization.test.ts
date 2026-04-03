import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { apiClient, type CloverCardEntryConfig } from "../src/api/client";
import { tokenizeCloverCard } from "../src/orders/card";

describe("clover card tokenization", () => {
  const fetchMock = vi.fn<typeof fetch>();
  const enabledConfig: CloverCardEntryConfig = {
    enabled: true,
    providerMode: "live",
    environment: "production",
    tokenizeEndpoint: "https://token.clover.com/v1/tokens",
    apiAccessKey: "public-api-access-key",
    merchantId: "merchant-123"
  };

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("tokenizes card details with Clover using the configured public api key", async () => {
    vi.spyOn(apiClient, "getCloverCardEntryConfig").mockResolvedValue(enabledConfig);
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          id: "clv_1TSTxxxxxxxxxxxxxxxxxFQif",
          card: {
            last4: "4242",
            brand: "VISA"
          }
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      )
    );

    const tokenizedCard = await tokenizeCloverCard({
      number: "4242 4242 4242 4242",
      expMonth: "3",
      expYear: "30",
      cvv: "123"
    });

    expect(tokenizedCard).toEqual({
      token: "clv_1TSTxxxxxxxxxxxxxxxxxFQif",
      last4: "4242",
      brand: "VISA"
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const request = fetchMock.mock.calls[0];
    expect(request).toBeDefined();
    if (request) {
      expect(request[0]).toBe("https://token.clover.com/v1/tokens");
      const headers = new Headers(request[1]?.headers as HeadersInit | undefined);
      expect(headers.get("apikey")).toBe("public-api-access-key");
      expect(headers.get("authorization")).toBeNull();
      expect(JSON.parse(String(request[1]?.body ?? "{}"))).toMatchObject({
        card: {
          number: "4242424242424242",
          exp_month: "03",
          exp_year: "2030",
          cvv: "123",
          brand: "VISA"
        }
      });
    }
  });

  it("surfaces Clover tokenization errors with provider detail when available", async () => {
    vi.spyOn(apiClient, "getCloverCardEntryConfig").mockResolvedValue(enabledConfig);
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ message: "Card declined" }), {
        status: 402,
        headers: { "content-type": "application/json" }
      })
    );

    await expect(
      tokenizeCloverCard({
        number: "4005 5717 0222 2222",
        expMonth: "12",
        expYear: "2030",
        cvv: "123"
      })
    ).rejects.toThrow("Card declined (402)");
  });
});
