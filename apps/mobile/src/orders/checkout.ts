import { useMutation } from "@tanstack/react-query";
import { apiClient } from "../api/client";
import type { CartItem } from "../cart/model";
import { checkoutDraftSchema, quoteRequestItemSchema } from "@lattelink/contracts-orders";
import { z } from "zod";

export type QuoteItem = z.input<typeof quoteRequestItemSchema>;
export type CheckoutDraftSnapshot = z.output<typeof checkoutDraftSchema> & {
  quoteItems: QuoteItem[];
};
export type CheckoutSubmissionStage = "quote" | "create" | "pay";
export type PreparedStripeCheckout = {
  checkout: CheckoutDraftSnapshot;
  paymentSession: Awaited<ReturnType<typeof apiClient.createStripeMobilePaymentSession>>;
};

export type CheckoutInput = {
  cartLocationId: string | null;
  selectedLocationId: string | null;
  items: CartItem[];
  pointsToRedeem?: number;
  discountCode?: string;
  existingCheckout?: CheckoutDraftSnapshot;
};

export class CheckoutSubmissionError extends Error {
  readonly stage: CheckoutSubmissionStage;
  readonly checkout?: CheckoutDraftSnapshot;

  constructor(message: string, stage: CheckoutSubmissionStage, checkout?: CheckoutDraftSnapshot) {
    super(message);
    this.name = "CheckoutSubmissionError";
    this.stage = stage;
    this.checkout = checkout;
  }
}

export function shouldShowCheckoutFailureScreen(error: CheckoutSubmissionError) {
  return error.stage !== "pay" || Boolean(error.checkout);
}

export function resolveInlineCheckoutErrorMessage(error: CheckoutSubmissionError) {
  if (error.stage === "pay" && !error.checkout) {
    return "Payment didn’t go through. Your bag is still ready, so you can try again.";
  }

  return error.message;
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

export function isCheckoutLocationConsistent(cartLocationId: string | null, selectedLocationId: string | null) {
  return Boolean(cartLocationId?.trim()) && cartLocationId === selectedLocationId;
}

export function isRetryableCheckoutForCart(
  checkout: CheckoutDraftSnapshot | null,
  quoteItems: QuoteItem[],
  cartLocationId: string | null,
  selectedLocationId: string | null
) {
  return Boolean(
    checkout &&
    isCheckoutLocationConsistent(cartLocationId, selectedLocationId) &&
    checkout.locationId === cartLocationId &&
    quoteItemsEqual(quoteItems, checkout.quoteItems)
  );
}

export function checkoutSnapshotMatchesCart(
  checkout: CheckoutDraftSnapshot,
  items: CartItem[],
  cartLocationId: string | null,
  selectedLocationId: string | null
) {
  return isCheckoutLocationConsistent(cartLocationId, selectedLocationId) &&
    checkout.locationId === cartLocationId &&
    quoteItemsEqual(toQuoteItems(items), checkout.quoteItems);
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
  if (
    parsedApiError?.code === "STRIPE_ACCOUNT_NOT_READY" ||
    parsedApiError?.code === "STRIPE_SECRET_KEY_NOT_CONFIGURED" ||
    parsedApiError?.code === "STRIPE_PUBLISHABLE_KEY_NOT_CONFIGURED"
  ) {
    return "Ordering is unavailable at this location right now. Please try again later.";
  }
  if (typeof parsedApiError?.message === "string" && parsedApiError.message.trim().length > 0) {
    return parsedApiError.message;
  }

  if (!(error instanceof Error) || !error.message) {
    return fallback;
  }

  return error.message;
}

function toCheckoutDraftSnapshot(
  checkout: Awaited<ReturnType<typeof apiClient.createCheckoutDraft>> | CheckoutDraftSnapshot,
  quoteItems: QuoteItem[]
): CheckoutDraftSnapshot {
  return {
    ...checkoutDraftSchema.parse(checkout),
    quoteItems
  };
}

type StripeCheckoutApi = Pick<typeof apiClient, "quoteOrder" | "createCheckoutDraft" | "createStripeMobilePaymentSession">;

export async function prepareStripeCheckout(
  input: CheckoutInput,
  checkoutApi: StripeCheckoutApi = apiClient
): Promise<PreparedStripeCheckout> {
  if (!isCheckoutLocationConsistent(input.cartLocationId, input.selectedLocationId)) {
    throw new CheckoutSubmissionError("Your bag no longer matches the selected location. Return to your bag and try again.", "quote");
  }

  if (input.items.length === 0) {
    throw new Error("Cart is empty.");
  }

  const quoteItems = toQuoteItems(input.items);

  if (input.existingCheckout) {
    const existingCheckout = toCheckoutDraftSnapshot(input.existingCheckout, input.existingCheckout.quoteItems);
    if (
      existingCheckout.locationId !== input.cartLocationId ||
      !quoteItemsEqual(existingCheckout.quoteItems, quoteItems)
    ) {
      throw new CheckoutSubmissionError("This checkout no longer matches your bag. Start checkout again.", "quote");
    }
    if (existingCheckout.status !== "OPEN") {
      throw new CheckoutSubmissionError("Only open checkouts can be retried.", "pay");
    }

    try {
      const paymentSession = await checkoutApi.createStripeMobilePaymentSession({
        checkoutId: existingCheckout.checkoutId
      });
      if (!("checkoutId" in paymentSession) || paymentSession.checkoutId !== existingCheckout.checkoutId) {
        throw new Error("Payment session did not match the selected checkout.");
      }

      return {
        checkout: existingCheckout,
        paymentSession
      };
    } catch (error) {
      const message = resolveCheckoutErrorMessage(error, "Unable to prepare payment.");
      throw new CheckoutSubmissionError(message, "pay", existingCheckout);
    }
  }

  let quote: Awaited<ReturnType<typeof apiClient.quoteOrder>>;
  try {
    const discountCode = input.discountCode?.trim();
    quote = await checkoutApi.quoteOrder({
      locationId: input.cartLocationId!,
      items: quoteItems,
      pointsToRedeem: input.pointsToRedeem ?? 0,
      ...(discountCode ? { discountCode } : {})
    });
  } catch (error) {
    const message = resolveCheckoutErrorMessage(error, "Unable to prepare checkout.");
    throw new CheckoutSubmissionError(message, "quote");
  }

  if (quote.locationId !== input.cartLocationId) {
    throw new CheckoutSubmissionError("The quote location did not match your bag. Please try checkout again.", "quote");
  }

  let checkout: Awaited<ReturnType<typeof apiClient.createCheckoutDraft>>;
  try {
    checkout = await checkoutApi.createCheckoutDraft({
      quoteId: quote.quoteId,
      quoteHash: quote.quoteHash
    });
  } catch (error) {
    const message = resolveCheckoutErrorMessage(error, "Unable to prepare checkout.");
    throw new CheckoutSubmissionError(message, "create");
  }

  const checkoutSnapshot = toCheckoutDraftSnapshot(checkout, quoteItems);
  if (
    checkoutSnapshot.locationId !== input.cartLocationId ||
    checkoutSnapshot.quoteId !== quote.quoteId ||
    checkoutSnapshot.quoteHash !== quote.quoteHash
  ) {
    throw new CheckoutSubmissionError("The checkout could not be matched to your quote. Please try again.", "create");
  }

  try {
    const paymentSession = await checkoutApi.createStripeMobilePaymentSession({
      checkoutId: checkoutSnapshot.checkoutId
    });
    if (!("checkoutId" in paymentSession) || paymentSession.checkoutId !== checkoutSnapshot.checkoutId) {
      throw new Error("Payment session did not match the selected checkout.");
    }

    return {
      checkout: checkoutSnapshot,
      paymentSession
    };
  } catch (error) {
    const message = resolveCheckoutErrorMessage(error, "Unable to prepare payment.");
    throw new CheckoutSubmissionError(message, "pay", checkoutSnapshot);
  }
}

export function useStripeCheckoutMutation() {
  return useMutation({
    mutationFn: async (input: CheckoutInput) => prepareStripeCheckout(input)
  });
}
