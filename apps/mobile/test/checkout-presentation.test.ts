import { beforeEach, describe, expect, it, vi } from "vitest";

const config = vi.hoisted(() => ({
  expoConfig: { scheme: "nomly-local" as string | string[] | undefined },
  appOwnership: "standalone"
}));
vi.mock("expo-constants", () => ({ default: config }));
vi.mock("expo-linking", () => ({
  createURL: (path: string, options?: { scheme?: string }) => `${options?.scheme ?? "exp"}://${path}`
}));

import {
  buildCheckoutOrderHistoryEntry,
  normalizeStripeReturnUrl,
  resolveStripeReturnUrl,
  resolveStripeUrlScheme
} from "../src/orders/checkoutPresentation";

beforeEach(() => {
  config.expoConfig.scheme = "nomly-local";
});

describe("checkout presentation", () => {
  it("selects the first nonblank configured scheme and preserves the Stripe redirect path", () => {
    config.expoConfig.scheme = ["", " nomly-beta ", "nomly"];
    expect(resolveStripeUrlScheme()).toBe("nomly-beta");
    expect(resolveStripeReturnUrl()).toBe("nomly-beta://stripe-redirect");
  });
  it("falls back to Expo's URL scheme when configuration is absent", () => {
    config.expoConfig.scheme = undefined;
    expect(resolveStripeUrlScheme()).toBe("exp");
  });
  it("rejects invalid URLs and return URLs for a different scheme", () => {
    expect(normalizeStripeReturnUrl("https://nomly.us", "nomly-local")).toBeUndefined();
    expect(normalizeStripeReturnUrl("invalid", "nomly-local")).toBeUndefined();
    expect(normalizeStripeReturnUrl(undefined, undefined)).toBeUndefined();
  });
  it("maps only the finalized order data into the customer history entry", () => {
    const order = {
      id: "order-id",
      pickupCode: "123",
      items: [],
      total: { currency: "USD" as const, amountCents: 1200 }
    };
    const occurredAt = "2026-10-15T00:00:00.000Z";
    expect(buildCheckoutOrderHistoryEntry({ order, status: "PAID", occurredAt })).toEqual({
      ...order,
      status: "PAID",
      timeline: [{ status: "PAID", occurredAt }]
    });
  });
});
