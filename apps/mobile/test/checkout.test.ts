import { describe, expect, it, vi } from "vitest";
import { normalizeCustomizationGroups } from "@lattelink/contracts-catalog";
import { createCartItem, DEFAULT_CUSTOMIZATION } from "../src/cart/model";
import {
  CheckoutSubmissionError,
  createCheckoutIdempotencyKey,
  createDemoApplePayToken,
  prepareStripeCheckout,
  resolveInlineCheckoutErrorMessage,
  shouldShowCheckoutFailureScreen,
  toQuoteItems,
  type CheckoutDraftSnapshot
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
    const retryOrder: CheckoutDraftSnapshot = {
      checkoutId: "123e4567-e89b-12d3-a456-426614174000",
      quoteId: "5ec083a1-0f31-4d04-a525-7808a0d7624b",
      quoteHash: "quote-hash-123",
      locationId: "flagship-01",
      status: "OPEN",
      items: [],
      total: {
        currency: "USD",
        amountCents: 575
      },
      expiresAt: "2030-03-10T00:00:00.000Z",
      quoteItems: []
    };
    const error = new CheckoutSubmissionError("Payment timed out", "pay", retryOrder);

    expect(shouldShowCheckoutFailureScreen(error)).toBe(true);
    expect(resolveInlineCheckoutErrorMessage(error)).toBe("Payment timed out");
  });

  it("prepares a Stripe payment session after quoting and creating a checkout draft", async () => {
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
      })
    ];

    const checkoutApi = {
      quoteOrder: vi.fn().mockResolvedValue({
        quoteId: "5ec083a1-0f31-4d04-a525-7808a0d7624b",
        locationId: "flagship-01",
        items: [],
        subtotal: { currency: "USD", amountCents: 575 },
        discount: { currency: "USD", amountCents: 0 },
        tax: { currency: "USD", amountCents: 35 },
        total: { currency: "USD", amountCents: 610 },
        pointsToRedeem: 0,
        quoteHash: "quote-hash-123"
      }),
      createCheckoutDraft: vi.fn().mockResolvedValue({
        checkoutId: "123e4567-e89b-12d3-a456-426614174000",
        quoteId: "5ec083a1-0f31-4d04-a525-7808a0d7624b",
        quoteHash: "quote-hash-123",
        locationId: "flagship-01",
        status: "OPEN",
        items: [
          {
            itemId: "latte",
            itemName: "Latte",
            quantity: 1,
            unitPriceCents: 575,
            lineTotalCents: 575,
            customization: {
              notes: "",
              selectedOptions: [
                {
                  groupId: "milk",
                  groupLabel: "Milk",
                  optionId: "whole",
                  optionLabel: "Whole milk",
                  priceDeltaCents: 0
                }
              ]
            }
          }
        ],
        total: { currency: "USD", amountCents: 610 },
        expiresAt: "2030-03-10T00:00:00.000Z"
      }),
      createStripeMobilePaymentSession: vi.fn().mockResolvedValue({
        checkoutId: "123e4567-e89b-12d3-a456-426614174000",
        paymentIntentId: "pi_123",
        paymentIntentClientSecret: "pi_123_secret_456",
        publishableKey: "pk_test_123",
        stripeAccountId: "acct_123",
        merchantDisplayName: "Gazelle Coffee",
        merchantCountryCode: "US",
        amountCents: 610,
        currency: "USD",
        applePayEnabled: true,
        cardEnabled: true
      })
    };

    const preparedCheckout = await prepareStripeCheckout(
      {
        locationId: "flagship-01",
        items
      },
      checkoutApi
    );

    expect(checkoutApi.quoteOrder).toHaveBeenCalledTimes(1);
    expect(checkoutApi.createCheckoutDraft).toHaveBeenCalledTimes(1);
    expect(checkoutApi.createStripeMobilePaymentSession).toHaveBeenCalledWith({
      checkoutId: "123e4567-e89b-12d3-a456-426614174000"
    });
    expect(preparedCheckout.checkout.status).toBe("OPEN");
    expect(preparedCheckout.paymentSession.stripeAccountId).toBe("acct_123");
  });

  it("passes a discount code into quote creation", async () => {
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
      })
    ];

    const checkoutApi = {
      quoteOrder: vi.fn().mockResolvedValue({
        quoteId: "5ec083a1-0f31-4d04-a525-7808a0d7624c",
        locationId: "flagship-01",
        items: [],
        subtotal: { currency: "USD", amountCents: 575 },
        discount: { currency: "USD", amountCents: 100 },
        discounts: [
          {
            type: "discount_code",
            code: "LAUNCH10",
            label: "Launch discount",
            amount: { currency: "USD", amountCents: 100 }
          }
        ],
        appliedDiscountCode: {
          discountCodeId: "123e4567-e89b-12d3-a456-426614174099",
          code: "LAUNCH10",
          name: "Launch discount",
          discountCents: 100
        },
        tax: { currency: "USD", amountCents: 29 },
        total: { currency: "USD", amountCents: 504 },
        pointsToRedeem: 0,
        quoteHash: "quote-hash-discount"
      }),
      createCheckoutDraft: vi.fn().mockResolvedValue({
        checkoutId: "123e4567-e89b-12d3-a456-426614174001",
        quoteId: "5ec083a1-0f31-4d04-a525-7808a0d7624c",
        quoteHash: "quote-hash-discount",
        locationId: "flagship-01",
        status: "OPEN",
        items: [],
        total: { currency: "USD", amountCents: 504 },
        expiresAt: "2030-03-10T00:00:00.000Z"
      }),
      createStripeMobilePaymentSession: vi.fn().mockResolvedValue({
        checkoutId: "123e4567-e89b-12d3-a456-426614174001",
        paymentIntentId: "pi_discount",
        paymentIntentClientSecret: "pi_discount_secret",
        publishableKey: "pk_test_123",
        stripeAccountId: "acct_123",
        merchantDisplayName: "Gazelle Coffee",
        merchantCountryCode: "US",
        amountCents: 504,
        currency: "USD",
        applePayEnabled: true,
        cardEnabled: true
      })
    };

    await prepareStripeCheckout(
      {
        locationId: "flagship-01",
        items,
        discountCode: "LAUNCH10"
      },
      checkoutApi
    );

    expect(checkoutApi.quoteOrder).toHaveBeenCalledWith({
      locationId: "flagship-01",
      items: toQuoteItems(items),
      pointsToRedeem: 0,
      discountCode: "LAUNCH10"
    });
  });

  it("reuses an existing open checkout when retrying Stripe checkout", async () => {
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
      })
    ];
    const existingCheckout: CheckoutDraftSnapshot = {
      checkoutId: "123e4567-e89b-12d3-a456-426614174000",
      quoteId: "5ec083a1-0f31-4d04-a525-7808a0d7624b",
      quoteHash: "quote-hash-123",
      locationId: "flagship-01",
      status: "OPEN",
      items: [],
      total: {
        currency: "USD",
        amountCents: 575
      },
      expiresAt: "2030-03-10T00:00:00.000Z",
      quoteItems: []
    };
    const checkoutApi = {
      quoteOrder: vi.fn(),
      createCheckoutDraft: vi.fn(),
      createStripeMobilePaymentSession: vi.fn().mockResolvedValue({
        checkoutId: existingCheckout.checkoutId,
        paymentIntentId: "pi_retry_123",
        paymentIntentClientSecret: "pi_retry_123_secret_456",
        publishableKey: "pk_test_123",
        stripeAccountId: "acct_123",
        merchantDisplayName: "Gazelle Coffee",
        merchantCountryCode: "US",
        amountCents: 575,
        currency: "USD",
        applePayEnabled: true,
        cardEnabled: true
      })
    };

    const preparedCheckout = await prepareStripeCheckout(
      {
        locationId: "flagship-01",
        items,
        existingCheckout: {
          ...existingCheckout,
          quoteItems: toQuoteItems(items)
        }
      },
      checkoutApi
    );

    expect(checkoutApi.quoteOrder).not.toHaveBeenCalled();
    expect(checkoutApi.createCheckoutDraft).not.toHaveBeenCalled();
    expect(checkoutApi.createStripeMobilePaymentSession).toHaveBeenCalledWith({
      checkoutId: existingCheckout.checkoutId
    });
    expect(preparedCheckout.checkout.checkoutId).toBe(existingCheckout.checkoutId);
  });
});
