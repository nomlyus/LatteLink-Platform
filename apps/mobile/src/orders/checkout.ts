import { useMutation } from "@tanstack/react-query";
import { apiClient } from "../api/client";
import type { CartItem } from "../cart/model";
import { quoteRequestItemSchema } from "@gazelle/contracts-orders";
import { z } from "zod";

type PayOrderInput = Parameters<(typeof apiClient)["payOrder"]>[1];
type ApplePayWalletInput = NonNullable<PayOrderInput["applePayWallet"]>;
const orderStatusSchema = z.enum(["PENDING_PAYMENT", "PAID", "IN_PREP", "READY", "COMPLETED", "CANCELED"]);
const checkoutOrderSchema = z.object({
  id: z.string().uuid(),
  pickupCode: z.string().min(1),
  status: orderStatusSchema,
  total: z.object({
    currency: z.literal("USD"),
    amountCents: z.number().int().nonnegative()
  })
});

export type QuoteItem = z.input<typeof quoteRequestItemSchema>;
export type CheckoutOrderSnapshot = z.output<typeof checkoutOrderSchema> & {
  quoteItems: QuoteItem[];
};
export type CheckoutSubmissionStage = "quote" | "create" | "pay";

type CheckoutPaymentInput =
  | { paymentSourceToken: string; applePayToken?: never; applePayWallet?: never }
  | { applePayToken: string; applePayWallet?: never }
  | { applePayWallet: ApplePayWalletInput; applePayToken?: never };

export type CheckoutInput = {
  locationId: string;
  items: CartItem[];
  pointsToRedeem?: number;
  existingOrder?: CheckoutOrderSnapshot;
} & CheckoutPaymentInput;

export class CheckoutSubmissionError extends Error {
  readonly stage: CheckoutSubmissionStage;
  readonly order?: CheckoutOrderSnapshot;

  constructor(message: string, stage: CheckoutSubmissionStage, order?: CheckoutOrderSnapshot) {
    super(message);
    this.name = "CheckoutSubmissionError";
    this.stage = stage;
    this.order = order;
  }
}

export function toQuoteItems(items: CartItem[]): QuoteItem[] {
  return items.map((item) => ({
    itemId: item.menuItemId,
    quantity: item.quantity,
    customization: item.customization
  }));
}

export function createCheckoutIdempotencyKey() {
  return `mobile-checkout-${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;
}

export function createDemoApplePayToken() {
  return `apple-pay-token-${Date.now()}`;
}

export function quoteItemsEqual(left: QuoteItem[], right: QuoteItem[]) {
  if (left.length !== right.length) {
    return false;
  }

  return left.every((item, index) => {
    const other = right[index];
    if (!other) {
      return false;
    }

    return (
      item.itemId === other.itemId &&
      item.quantity === other.quantity &&
      JSON.stringify(item.customization ?? { selectedOptions: [], notes: "" }) ===
        JSON.stringify(other.customization ?? { selectedOptions: [], notes: "" })
    );
  });
}

type ParsedCheckoutApiError = {
  code?: string;
  message?: string;
  details?: Record<string, unknown>;
};

function parseCheckoutApiError(error: unknown): ParsedCheckoutApiError | undefined {
  if (!(error instanceof Error) || !error.message) {
    return undefined;
  }

  const jsonSuffixMatch = error.message.match(/:\s*(\{[\s\S]*\})$/);
  if (!jsonSuffixMatch) {
    return undefined;
  }

  try {
    const parsed = JSON.parse(jsonSuffixMatch[1]) as ParsedCheckoutApiError;
    return parsed && typeof parsed === "object" ? parsed : undefined;
  } catch {
    return undefined;
  }
}

function resolveCheckoutErrorMessage(error: unknown, fallback: string) {
  const parsedApiError = parseCheckoutApiError(error);
  if (typeof parsedApiError?.message === "string" && parsedApiError.message.trim().length > 0) {
    return parsedApiError.message;
  }

  if (!(error instanceof Error) || !error.message) {
    return fallback;
  }

  return error.message;
}

export function useApplePayCheckoutMutation() {
  return useMutation({
    mutationFn: async (input: CheckoutInput) => {
      if (input.items.length === 0) {
        throw new Error("Cart is empty.");
      }

      const hasPaymentSourceToken = typeof (input as { paymentSourceToken?: string }).paymentSourceToken === "string";
      const hasToken = typeof (input as { applePayToken?: string }).applePayToken === "string";
      const hasWallet = typeof (input as { applePayWallet?: ApplePayWalletInput }).applePayWallet !== "undefined";

      if ([hasPaymentSourceToken, hasToken, hasWallet].filter(Boolean).length !== 1) {
        throw new Error("Provide exactly one payment method.");
      }

      const paymentPayload: Pick<PayOrderInput, "paymentSourceToken" | "applePayToken" | "applePayWallet"> = hasPaymentSourceToken
        ? (() => {
            const paymentSourceToken = (input as { paymentSourceToken: string }).paymentSourceToken.trim();
            if (!paymentSourceToken) {
              throw new Error("Payment source token is required.");
            }

            return { paymentSourceToken };
          })()
        : hasToken
        ? (() => {
            const applePayToken = (input as { applePayToken: string }).applePayToken.trim();
            if (!applePayToken) {
              throw new Error("Apple Pay token is required.");
            }

            return { applePayToken };
          })()
        : { applePayWallet: (input as { applePayWallet: ApplePayWalletInput }).applePayWallet };

      if (input.existingOrder) {
        try {
          return await apiClient.payOrder(input.existingOrder.id, {
            ...paymentPayload,
            idempotencyKey: createCheckoutIdempotencyKey()
          });
        } catch (error) {
          const parsedApiError = parseCheckoutApiError(error);
          const message = resolveCheckoutErrorMessage(error, "Unable to complete payment.");
          const shouldKeepRetryOrder =
            parsedApiError?.code === "PAYMENT_TIMEOUT" || parsedApiError?.code === "PAYMENT_RECONCILIATION_PENDING";
          throw new CheckoutSubmissionError(message, "pay", shouldKeepRetryOrder ? input.existingOrder : undefined);
        }
      }

      const quoteItems = toQuoteItems(input.items);
      let quote: Awaited<ReturnType<typeof apiClient.quoteOrder>>;
      try {
        quote = await apiClient.quoteOrder({
          locationId: input.locationId,
          items: quoteItems,
          pointsToRedeem: input.pointsToRedeem ?? 0
        });
      } catch (error) {
        const message = resolveCheckoutErrorMessage(error, "Unable to prepare checkout.");
        throw new CheckoutSubmissionError(message, "quote");
      }

      let order: Awaited<ReturnType<typeof apiClient.createOrder>>;
      try {
        order = await apiClient.createOrder({
          quoteId: quote.quoteId,
          quoteHash: quote.quoteHash
        });
      } catch (error) {
        const message = resolveCheckoutErrorMessage(error, "Unable to create order.");
        throw new CheckoutSubmissionError(message, "create");
      }

      const orderSnapshot: CheckoutOrderSnapshot = {
        ...checkoutOrderSchema.parse(order),
        quoteItems
      };

      try {
        return await apiClient.payOrder(order.id, {
          ...paymentPayload,
          idempotencyKey: createCheckoutIdempotencyKey()
        });
      } catch (error) {
        const parsedApiError = parseCheckoutApiError(error);
        const message = resolveCheckoutErrorMessage(error, "Unable to complete payment.");
        const shouldKeepRetryOrder =
          parsedApiError?.code === "PAYMENT_TIMEOUT" || parsedApiError?.code === "PAYMENT_RECONCILIATION_PENDING";
        throw new CheckoutSubmissionError(message, "pay", shouldKeepRetryOrder ? orderSnapshot : undefined);
      }
    }
  });
}
