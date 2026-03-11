import { useMutation } from "@tanstack/react-query";
import { apiClient } from "../api/client";
import type { CartItem } from "../cart/model";

type PayOrderInput = Parameters<(typeof apiClient)["payOrder"]>[1];
type ApplePayWalletInput = NonNullable<PayOrderInput["applePayWallet"]>;

type CheckoutPaymentInput =
  | { applePayToken: string; applePayWallet?: never }
  | { applePayWallet: ApplePayWalletInput; applePayToken?: never };

export type CheckoutInput = {
  locationId: string;
  items: CartItem[];
  pointsToRedeem?: number;
} & CheckoutPaymentInput;

export function toQuoteItems(items: CartItem[]): Array<{ itemId: string; quantity: number }> {
  const quantityByItemId = new Map<string, number>();

  for (const item of items) {
    const currentQuantity = quantityByItemId.get(item.menuItemId) ?? 0;
    quantityByItemId.set(item.menuItemId, currentQuantity + item.quantity);
  }

  return [...quantityByItemId.entries()].map(([itemId, quantity]) => ({ itemId, quantity }));
}

export function createCheckoutIdempotencyKey() {
  return `mobile-checkout-${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;
}

export function createDemoApplePayToken() {
  return `apple-pay-token-${Date.now()}`;
}

export function useApplePayCheckoutMutation() {
  return useMutation({
    mutationFn: async (input: CheckoutInput) => {
      if (input.items.length === 0) {
        throw new Error("Cart is empty.");
      }

      const hasToken = typeof (input as { applePayToken?: string }).applePayToken === "string";
      const hasWallet = typeof (input as { applePayWallet?: ApplePayWalletInput }).applePayWallet !== "undefined";

      if (hasToken === hasWallet) {
        throw new Error("Provide exactly one Apple Pay payment payload.");
      }

      const paymentPayload: Pick<PayOrderInput, "applePayToken" | "applePayWallet"> = hasToken
        ? (() => {
            const applePayToken = (input as { applePayToken: string }).applePayToken.trim();
            if (!applePayToken) {
              throw new Error("Apple Pay token is required.");
            }

            return { applePayToken };
          })()
        : { applePayWallet: (input as { applePayWallet: ApplePayWalletInput }).applePayWallet };

      const quote = await apiClient.quoteOrder({
        locationId: input.locationId,
        items: toQuoteItems(input.items),
        pointsToRedeem: input.pointsToRedeem ?? 0
      });

      const order = await apiClient.createOrder({
        quoteId: quote.quoteId,
        quoteHash: quote.quoteHash
      });

      return apiClient.payOrder(order.id, {
        ...paymentPayload,
        idempotencyKey: createCheckoutIdempotencyKey()
      });
    }
  });
}
