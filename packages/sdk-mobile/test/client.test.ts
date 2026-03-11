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

  it("supports quote, create, and pay order flow", async () => {
    fetchMock
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            quoteId: "123e4567-e89b-12d3-a456-426614174011",
            locationId: "flagship-01",
            items: [{ itemId: "latte", quantity: 1, unitPriceCents: 675 }],
            subtotal: { currency: "USD", amountCents: 675 },
            discount: { currency: "USD", amountCents: 0 },
            tax: { currency: "USD", amountCents: 41 },
            total: { currency: "USD", amountCents: 716 },
            pointsToRedeem: 0,
            quoteHash: "quote-hash"
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        )
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            id: "123e4567-e89b-12d3-a456-426614174012",
            locationId: "flagship-01",
            status: "PENDING_PAYMENT",
            items: [{ itemId: "latte", quantity: 1, unitPriceCents: 675 }],
            total: { currency: "USD", amountCents: 716 },
            pickupCode: "A1B2C3",
            timeline: [{ status: "PENDING_PAYMENT", occurredAt: "2026-03-10T00:00:00.000Z" }]
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        )
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            id: "123e4567-e89b-12d3-a456-426614174012",
            locationId: "flagship-01",
            status: "PAID",
            items: [{ itemId: "latte", quantity: 1, unitPriceCents: 675 }],
            total: { currency: "USD", amountCents: 716 },
            pickupCode: "A1B2C3",
            timeline: [
              { status: "PENDING_PAYMENT", occurredAt: "2026-03-10T00:00:00.000Z" },
              { status: "PAID", occurredAt: "2026-03-10T00:01:00.000Z" }
            ]
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        )
      );

    const client = new GazelleApiClient({ baseUrl: "https://api.gazellecoffee.com/v1" });

    const quote = await client.quoteOrder({
      locationId: "flagship-01",
      items: [{ itemId: "latte", quantity: 1 }],
      pointsToRedeem: 0
    });
    const order = await client.createOrder({ quoteId: quote.quoteId, quoteHash: quote.quoteHash });
    const paidOrder = await client.payOrder(order.id, {
      applePayToken: "apple-pay-token",
      idempotencyKey: "checkout-idempotency-key"
    });

    expect(quote.quoteHash).toBe("quote-hash");
    expect(order.status).toBe("PENDING_PAYMENT");
    expect(paidOrder.status).toBe("PAID");
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("supports structured Apple Pay wallet payload for payOrder", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          id: "123e4567-e89b-12d3-a456-426614174112",
          locationId: "flagship-01",
          status: "PAID",
          items: [{ itemId: "latte", quantity: 1, unitPriceCents: 675 }],
          total: { currency: "USD", amountCents: 716 },
          pickupCode: "A1B2C3",
          timeline: [
            { status: "PENDING_PAYMENT", occurredAt: "2026-03-10T00:00:00.000Z" },
            { status: "PAID", occurredAt: "2026-03-10T00:01:00.000Z" }
          ]
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      )
    );

    const client = new GazelleApiClient({ baseUrl: "https://api.gazellecoffee.com/v1" });
    const orderId = "123e4567-e89b-12d3-a456-426614174112";
    const paidOrder = await client.payOrder(orderId, {
      applePayWallet: {
        version: "EC_v1",
        data: "wallet-success-token",
        signature: "signature-value",
        header: {
          ephemeralPublicKey: "ephemeral-key",
          publicKeyHash: "public-key-hash",
          transactionId: "transaction-id"
        }
      },
      idempotencyKey: "checkout-wallet-idempotency-key"
    });

    expect(paidOrder.status).toBe("PAID");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const request = fetchMock.mock.calls[0];
    expect(request).toBeDefined();
    if (request) {
      const body = JSON.parse(String(request[1]?.body ?? "{}")) as Record<string, unknown>;
      expect(body).toMatchObject({
        idempotencyKey: "checkout-wallet-idempotency-key",
        applePayWallet: {
          version: "EC_v1"
        }
      });
      expect(body.applePayToken).toBeUndefined();
    }
  });
});
