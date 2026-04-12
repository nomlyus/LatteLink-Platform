import { describe, expect, it } from "vitest";
import { normalizeCustomizationGroups } from "@lattelink/contracts-catalog";
import { createCartItem, DEFAULT_CUSTOMIZATION } from "../src/cart/model";
import {
  CheckoutSubmissionError,
  createCheckoutIdempotencyKey,
  createDemoApplePayToken,
  resolveInlineCheckoutErrorMessage,
  shouldShowCheckoutFailureScreen,
  toQuoteItems,
  type CheckoutOrderSnapshot
} from "../src/orders/checkout";

const espressoGroups = normalizeCustomizationGroups([
  {
    id: "size",
    label: "Size",
    selectionType: "single" as const,
    required: true,
    minSelections: 1,
    maxSelections: 1,
    sortOrder: 0,
    options: [
      { id: "regular", label: "Regular", priceDeltaCents: 0, default: true, sortOrder: 0, available: true },
      { id: "large", label: "Large", priceDeltaCents: 100, sortOrder: 1, available: true }
    ]
  },
  {
    id: "milk",
    label: "Milk",
    selectionType: "single" as const,
    required: true,
    minSelections: 1,
    maxSelections: 1,
    sortOrder: 1,
    options: [
      { id: "whole", label: "Whole milk", priceDeltaCents: 0, default: true, sortOrder: 0, available: true },
      { id: "oat", label: "Oat milk", priceDeltaCents: 75, sortOrder: 1, available: true }
    ]
  }
]);

describe("checkout helpers", () => {
  it("aggregates cart lines by menu item id for quote input", () => {
    const items = [
      createCartItem({
        menuItemId: "latte",
        itemName: "Latte",
        basePriceCents: 575,
        customizationGroups: espressoGroups,
        customization: {
          ...DEFAULT_CUSTOMIZATION,
          selectedOptions: [
            { groupId: "size", optionId: "regular" },
            { groupId: "milk", optionId: "whole" }
          ]
        },
        quantity: 1
      }),
      createCartItem({
        menuItemId: "latte",
        itemName: "Latte",
        basePriceCents: 575,
        customizationGroups: espressoGroups,
        customization: {
          ...DEFAULT_CUSTOMIZATION,
          selectedOptions: [
            { groupId: "size", optionId: "regular" },
            { groupId: "milk", optionId: "oat" }
          ]
        },
        quantity: 2
      }),
      createCartItem({
        menuItemId: "croissant",
        itemName: "Croissant",
        basePriceCents: 425,
        customizationGroups: [],
        customization: DEFAULT_CUSTOMIZATION,
        quantity: 3
      })
    ];

    expect(toQuoteItems(items)).toEqual([
      {
        itemId: "latte",
        quantity: 1,
        customization: {
          selectedOptions: [
            { groupId: "milk", optionId: "whole" },
            { groupId: "size", optionId: "regular" }
          ],
          notes: ""
        }
      },
      {
        itemId: "latte",
        quantity: 2,
        customization: {
          selectedOptions: [
            { groupId: "milk", optionId: "oat" },
            { groupId: "size", optionId: "regular" }
          ],
          notes: ""
        }
      },
      {
        itemId: "croissant",
        quantity: 3,
        customization: {
          selectedOptions: [],
          notes: ""
        }
      }
    ]);
  });

  it("creates prefixed idempotency keys", () => {
    const key = createCheckoutIdempotencyKey();
    expect(key.startsWith("mobile-checkout-")).toBe(true);
  });

  it("creates prefixed demo Apple Pay tokens", () => {
    const token = createDemoApplePayToken();
    expect(token.startsWith("apple-pay-token-")).toBe(true);
  });

  it("keeps definitive pay failures on the cart", () => {
    const error = new CheckoutSubmissionError("Clover declined the charge", "pay");

    expect(shouldShowCheckoutFailureScreen(error)).toBe(false);
    expect(resolveInlineCheckoutErrorMessage(error)).toBe(
      "Payment didn’t go through. Your bag is still ready, so you can try again."
    );
  });

  it("keeps retryable pay failures on the failure screen", () => {
    const retryOrder: CheckoutOrderSnapshot = {
      id: "123e4567-e89b-12d3-a456-426614174000",
      pickupCode: "ABC123",
      status: "PENDING_PAYMENT",
      total: {
        currency: "USD",
        amountCents: 575
      },
      quoteItems: []
    };
    const error = new CheckoutSubmissionError("Payment timed out", "pay", retryOrder);

    expect(shouldShowCheckoutFailureScreen(error)).toBe(true);
    expect(resolveInlineCheckoutErrorMessage(error)).toBe("Payment timed out");
  });
});
