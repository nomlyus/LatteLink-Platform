import { useEffect, useRef, useState } from "react";
import { normalizedDiscountCodeSchema } from "@lattelink/contracts-orders";
import { apiClient } from "../api/client";
import { extractApiErrorDetails } from "../auth/presentation";
import { isCheckoutLocationConsistent, toQuoteItems } from "../orders/checkout";
import type { CartItem } from "./model";

type DiscountContext = {
  items: CartItem[];
  code: string;
  brandId: string;
  userId?: string;
  cartLocationId: string | null;
  selectedLocationId: string | null;
};
type Quote = Awaited<ReturnType<typeof apiClient.quoteOrder>>;
type Result = { key: string; quote?: Quote; error?: string; pending?: boolean };

export function useCartDiscount(context: DiscountContext) {
  const quoteItems = toQuoteItems(context.items);
  const key = JSON.stringify([context.brandId, context.userId, context.cartLocationId, context.selectedLocationId, context.code, quoteItems]);
  const currentKey = useRef(key);
  currentKey.current = key;
  const mounted = useRef(true);
  const request = useRef<{ key: string; id: number } | null>(null);
  const sequence = useRef(0);
  const [result, setResult] = useState<Result | null>(null);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; sequence.current += 1; };
  }, []);
  const current = result?.key === key ? result : null;

  async function apply() {
    if (request.current?.key === key || !mounted.current) return;
    if (!context.userId) {
      setResult({ key, error: "Sign in to apply a discount code." });
      return;
    }
    const code = normalizedDiscountCodeSchema.safeParse(context.code);
    if (!code.success) {
      setResult({ key, error: "Enter a code with 3–32 letters, numbers, hyphens or underscores." });
      return;
    }
    if (!context.items.length || !isCheckoutLocationConsistent(context.cartLocationId, context.selectedLocationId)) {
      setResult({ key, error: "Review your cart and selected location, then try again." });
      return;
    }

    const id = ++sequence.current;
    request.current = { key, id };
    setResult({ key, pending: true });
    const isCurrent = () => mounted.current && currentKey.current === key && sequence.current === id;
    try {
      const quote = await apiClient.quoteOrder({
        locationId: context.cartLocationId!, items: quoteItems, pointsToRedeem: 0, discountCode: code.data
      });
      if (!isCurrent()) return;
      if (quote.locationId !== context.cartLocationId || quote.appliedDiscountCode?.code.toUpperCase() !== code.data
        || quote.appliedDiscountCode.discountCents <= 0) {
        setResult({ key, error: "This code doesn’t apply to your cart." });
        return;
      }
      setResult({ key, quote });
    } catch (error) {
      if (isCurrent()) setResult({ key, error: extractApiErrorDetails(error)?.message || "Couldn’t check this code. Please try again." });
    } finally {
      if (request.current?.id === id) request.current = null;
    }
  }

  return {
    quote: current?.quote,
    error: current?.error,
    applying: current?.pending === true,
    applied: Boolean(current?.quote),
    isApplying: () => request.current?.key === currentKey.current,
    apply
  };
}
