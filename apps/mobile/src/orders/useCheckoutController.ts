import { useQueryClient } from "@tanstack/react-query";
import { PaymentSheetError, initPaymentSheet, initStripe, presentPaymentSheet } from "@stripe/stripe-react-native";
import { useEffect, useMemo, useRef, useState } from "react";

import { buildPricingSummary } from "../cart/model";
import { useCart } from "../cart/store";
import { useLocationContext } from "../location/LocationProvider";
import { apiClient } from "../api/client";
import {
  formatUsd,
  resolveAppConfigData,
  resolveStoreConfigData,
  useAppConfigQuery,
  useStoreConfigQuery
} from "../menu/catalog";
import { mergeOrderIntoHistory, orderHistoryQueryKey, type OrderHistoryEntry } from "../account/data";
import {
  CheckoutSubmissionError,
  checkoutSnapshotMatchesCart,
  isCheckoutLocationConsistent,
  isRetryableCheckoutForCart,
  resolveInlineCheckoutErrorMessage,
  shouldShowCheckoutFailureScreen,
  toQuoteItems,
  useStripeCheckoutMutation,
  type CheckoutDraftSnapshot
} from "./checkout";
import { useCheckoutFlow } from "./flow";
import { useAuthSession } from "../auth/session";
import { useCartDiscount } from "../cart/useCartDiscount";

import { resolveConfiguredApplePayMerchantIdentifier } from "./applePay";
import type { Order } from "@lattelink/contracts-orders";
import { buildCheckoutOrderHistoryEntry, resolveStripeReturnUrl, resolveStripeUrlScheme } from "./checkoutPresentation";

export function useCheckoutController() {
  const queryClient = useQueryClient();
  const { isAuthenticated, session } = useAuthSession();
  const { items, locationId: cartLocationId, subtotalCents, discountCode, clear } = useCart();
  const location = useLocationContext();
  const discount = useCartDiscount({ items, code: discountCode, brandId: location.brandId,
    userId: isAuthenticated ? session?.userId : undefined, cartLocationId, selectedLocationId: location.selectedLocationId });
  const [reviewedCheckout, setReviewedCheckout] = useState<CheckoutDraftSnapshot | null>(null);
  const { retryOrder, clearRetryOrder, clearFailure, setConfirmation, setFailure, setRetryOrder, setPaymentConfirmationPending } = useCheckoutFlow();
  const appConfigQuery = useAppConfigQuery();
  const storeConfigQuery = useStoreConfigQuery();
  const appConfig = appConfigQuery.data ? resolveAppConfigData(appConfigQuery.data) : null;
  const storeConfig = storeConfigQuery.data ? resolveStoreConfigData(storeConfigQuery.data) : null;
  const estimatedPricing = buildPricingSummary(subtotalCents, storeConfig?.taxRateBasisPoints ?? 0);
  const checkoutMutation = useStripeCheckoutMutation();
  const liveCartContextRef = useRef({ items, cartLocationId, selectedLocationId: location.selectedLocationId, discountCode, userId: session?.userId, brandId: location.brandId });
  liveCartContextRef.current = { items, cartLocationId, selectedLocationId: location.selectedLocationId, discountCode, userId: session?.userId, brandId: location.brandId };
  const paymentInFlight = useRef(false);
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => {
    checkoutMutation.reset();
  }, [cartLocationId, checkoutMutation.reset, location.selectedLocationId]);
  const storeConfigLoading = !storeConfig && (storeConfigQuery.isLoading || storeConfigQuery.isFetching);
  const appConfigLoading = !appConfig && (appConfigQuery.isLoading || appConfigQuery.isFetching);
  const checkoutContextLoading = storeConfigLoading || appConfigLoading;
  const storeClosedMessage =
    storeConfig && !storeConfig.isOpen ? "The store is currently closed. Come back during opening hours." : null;
  const checkoutUnavailableMessage = storeConfigLoading
    ? "Loading store hours..."
    : appConfigLoading
      ? "Loading checkout configuration..."
      : !storeConfig
        ? "Store details are temporarily unavailable. Retry loading checkout before paying."
        : !appConfig
          ? "Checkout configuration is temporarily unavailable. Retry loading checkout before paying."
          : !appConfig.paymentCapabilities.stripe.enabled
            ? "Stripe checkout is not enabled for this store yet."
            : !appConfig.paymentCapabilities.stripe.onboarded
              ? "Stripe onboarding is incomplete for this store."
              : !appConfig.paymentCapabilities.card && !appConfig.paymentCapabilities.applePay
                ? "No supported mobile payment methods are enabled for this store."
                : storeClosedMessage;
  const checkoutReady = checkoutUnavailableMessage === null;
  const checkoutUnavailableTone = checkoutContextLoading ? "info" : "warning";
  const showCheckoutRetry = Boolean(checkoutUnavailableMessage) && !checkoutContextLoading;
  const quoteItems = useMemo(() => toQuoteItems(items), [items]);
  const knownAppliedCheckout = [reviewedCheckout, retryOrder].find((checkout) =>
    isRetryableCheckoutForCart(checkout, quoteItems, cartLocationId, location.selectedLocationId, discountCode)
    && checkout?.quote?.appliedDiscountCode?.code.toUpperCase() === discountCode
    && (checkout?.quote?.appliedDiscountCode?.discountCents ?? 0) > 0
  );
  // The text field is a draft. Only an accepted, scope-matching code belongs in a payment request.
  const appliedDiscountCode = (discount.quote?.appliedDiscountCode?.code ?? knownAppliedCheckout?.discountCode ?? "").trim().toUpperCase();
  const retryableOrder = isRetryableCheckoutForCart(retryOrder, quoteItems, cartLocationId, location.selectedLocationId, appliedDiscountCode)
    ? (retryOrder ?? undefined)
    : undefined;
  const applePayMerchantIdentifier = resolveConfiguredApplePayMerchantIdentifier();
  const [paymentSheetPending, setPaymentSheetPending] = useState(false);
  const [statusMessage, setStatusMessage] = useState("");
  const [statusTone, setStatusTone] = useState<"info" | "warning">("info");
  const locationContextValid = isCheckoutLocationConsistent(cartLocationId, location.selectedLocationId);
  const payActionDisabled =
    !isAuthenticated || !checkoutReady || !locationContextValid || items.length === 0 || paymentSheetPending || checkoutMutation.isPending || discount.applying;
  const authoritativeCheckout = isRetryableCheckoutForCart(reviewedCheckout, quoteItems, cartLocationId, location.selectedLocationId, appliedDiscountCode)
    ? reviewedCheckout
    : retryableOrder;
  const authoritativeTotal = authoritativeCheckout?.total.amountCents;
  const authoritativeQuote = authoritativeCheckout?.quote ?? discount.quote;
  const pricingSummary = {
    subtotalCents: authoritativeQuote?.subtotal.amountCents ?? estimatedPricing.subtotalCents,
    taxCents: authoritativeQuote?.tax.amountCents ?? estimatedPricing.taxCents,
    discountCents: authoritativeQuote?.discount.amountCents ?? 0,
    totalCents: authoritativeTotal ?? authoritativeQuote?.total.amountCents ?? estimatedPricing.totalCents
  };
  const payActionLabel =
    paymentSheetPending || checkoutMutation.isPending
      ? statusMessage || "Opening secure payment…"
      : discount.applying
        ? "Checking discount…"
        : `Pay ${formatUsd(authoritativeTotal ?? pricingSummary.totalCents)}`;
  async function invalidateAccountQueries() {
    await queryClient.invalidateQueries({ queryKey: ["account"] });
  }
  function refreshCheckoutContext() {
    void Promise.allSettled([appConfigQuery.refetch(), storeConfigQuery.refetch()]);
  }
  async function handleStripeCheckout() {
    if (paymentInFlight.current || discount.isApplying() || !isAuthenticated || !checkoutReady) return;
    if (!isCheckoutLocationConsistent(cartLocationId, location.selectedLocationId)) {
      setStatusMessage("Your bag does not match the selected location. Return to your bag before checkout.");
      setStatusTone("warning");
      return;
    }
    if (items.length === 0) {
      setStatusMessage("Add an item to your bag before checkout.");
      setStatusTone("warning");
      return;
    }

    if (!storeConfig || !appConfig) {
      setStatusMessage(checkoutUnavailableMessage ?? "Checkout is temporarily unavailable.");
      setStatusTone("warning");
      return;
    }

    if (!storeConfig.isOpen) {
      setStatusMessage(storeClosedMessage ?? "The store is currently closed.");
      setStatusTone("warning");
      return;
    }

    paymentInFlight.current = true;
    const operatorId = session?.userId;
    const brandId = location.brandId;
    const sameOperator = () => mounted.current && liveCartContextRef.current.userId === operatorId && liveCartContextRef.current.brandId === brandId;
    setPaymentSheetPending(true);
    setStatusMessage("Preparing secure payment…");
    setStatusTone("info");

    try {
      const preparedCheckout = await checkoutMutation.mutateAsync({
        cartLocationId,
        selectedLocationId: location.selectedLocationId,
        items,
        discountCode: appliedDiscountCode || undefined,
        existingCheckout: retryableOrder
      });

      const checkoutStillMatchesCurrentCart = () => {
        const current = liveCartContextRef.current;
        return sameOperator() && current.discountCode === discountCode && checkoutSnapshotMatchesCart(
          preparedCheckout.checkout,
          current.items,
          current.cartLocationId,
          current.selectedLocationId
        );
      };
      if (!checkoutStillMatchesCurrentCart()) {
        if (!sameOperator()) return;
        clearRetryOrder();
        throw new Error(
          "Your bag or selected location changed while checkout was preparing. Review your bag and try again."
        );
      }

      setReviewedCheckout(preparedCheckout.checkout);

      await initStripe({
        publishableKey: preparedCheckout.paymentSession.publishableKey,
        stripeAccountId: preparedCheckout.paymentSession.stripeAccountId,
        merchantIdentifier: preparedCheckout.paymentSession.applePayEnabled ? applePayMerchantIdentifier : undefined,
        urlScheme: resolveStripeUrlScheme()
      });

      const stripeReturnUrl = resolveStripeReturnUrl();
      const initResult = await initPaymentSheet({
        merchantDisplayName: preparedCheckout.paymentSession.merchantDisplayName,
        paymentIntentClientSecret: preparedCheckout.paymentSession.paymentIntentClientSecret,
        ...(stripeReturnUrl ? { returnURL: stripeReturnUrl } : {}),
        allowsDelayedPaymentMethods: false,
        applePay: preparedCheckout.paymentSession.applePayEnabled
          ? {
              merchantCountryCode: preparedCheckout.paymentSession.merchantCountryCode
            }
          : undefined
      });

      if (!sameOperator()) return;
      if (initResult.error) {
        setRetryOrder(preparedCheckout.checkout);
        setStatusMessage("Payment could not open. Your bag is still ready, so you can try again.");
        setStatusTone("warning");
        return;
      }

      setStatusMessage("Waiting for Stripe confirmation…");

      if (!checkoutStillMatchesCurrentCart()) {
        clearRetryOrder();
        setStatusMessage(
          "Your bag or selected location changed. No payment was started. Review your bag and try again."
        );
        setStatusTone("warning");
        return;
      }

      const presentResult = await presentPaymentSheet();
      if (!sameOperator()) return;
      if (presentResult.error?.code === PaymentSheetError.Canceled) {
        setRetryOrder(preparedCheckout.checkout);
        clearFailure();
        setStatusMessage("");
        setStatusTone("info");
        return;
      }

      if (presentResult.error) {
        setRetryOrder(preparedCheckout.checkout);
        setStatusMessage("Payment didn’t go through. Your bag is still ready, so you can try again.");
        setStatusTone("warning");
        return;
      }

      setStatusMessage("Verifying payment with Stripe…");
      let finalizedOrder: Order;
      try {
        const finalizedPayment = await apiClient.finalizeStripeMobilePayment({
          checkoutId: preparedCheckout.checkout.checkoutId,
          paymentIntentId: preparedCheckout.paymentSession.paymentIntentId
        });
        if (!("order" in finalizedPayment)) throw new Error("Checkout finalization returned a legacy order response");
        finalizedOrder = finalizedPayment.order;
      } catch {
        if (!sameOperator()) return;
        setPaymentConfirmationPending();
        if (checkoutStillMatchesCurrentCart()) clear();
        clearRetryOrder();
        void invalidateAccountQueries();
        return;
      }

      if (!sameOperator()) return;
      const occurredAt = new Date().toISOString();
      const nextOrder = buildCheckoutOrderHistoryEntry({
        order: finalizedOrder,
        status: finalizedOrder.status,
        occurredAt
      });
      queryClient.setQueryData<OrderHistoryEntry[] | undefined>(
        orderHistoryQueryKey(location.brandId),
        (currentOrders) => mergeOrderIntoHistory(currentOrders, nextOrder)
      );
      setConfirmation({
        orderId: finalizedOrder.id,
        pickupCode: finalizedOrder.pickupCode,
        status: finalizedOrder.status,
        total: finalizedOrder.total,
        items: finalizedOrder.items,
        occurredAt
      });
      if (checkoutStillMatchesCurrentCart()) clear();
      setStatusMessage("");
      setStatusTone("info");
      void invalidateAccountQueries();
    } catch (error) {
      if (!sameOperator()) return;
      const message = error instanceof Error ? error.message : "Checkout failed.";

      if (error instanceof CheckoutSubmissionError) {
        void invalidateAccountQueries();

        if (error.stage === "quote") {
          clearFailure();
          clearRetryOrder();
          setStatusMessage(resolveInlineCheckoutErrorMessage(error));
          setStatusTone("warning");
          return;
        }

        if (error.stage === "pay") {
          setStatusMessage("");
          setStatusTone("info");
          setFailure({
            message,
            stage: error.stage,
            occurredAt: new Date().toISOString(),
            checkout: error.checkout
          });
          return;
        }

        if (!shouldShowCheckoutFailureScreen(error)) {
          clearFailure();
          clearRetryOrder();
          setStatusMessage(resolveInlineCheckoutErrorMessage(error));
          setStatusTone("warning");
          return;
        }

        setStatusMessage("");
        setStatusTone("info");
        setFailure({
          message,
          stage: error.stage,
          occurredAt: new Date().toISOString(),
          checkout: error.checkout
        });
        return;
      }

      setStatusMessage(message);
      setStatusTone("warning");
    } finally {
      paymentInFlight.current = false;
      if (mounted.current) setPaymentSheetPending(false);
    }
  }
  return {
    storeConfig,
    pricingSummary,
    storeConfigLoading,
    checkoutUnavailableMessage,
    checkoutUnavailableTone,
    showCheckoutRetry,
    retryableOrder,
    statusMessage,
    statusTone,
    payActionDisabled,
    payActionLabel,
    authoritativeTotal,
    discount: {
      ...discount,
      apply: () => {
        if (paymentInFlight.current) return;
        setReviewedCheckout(null);
        clearRetryOrder();
        setStatusMessage("");
        return discount.apply();
      }
    },
    paymentInProgress: paymentSheetPending || checkoutMutation.isPending,
    isPaymentInFlight: () => paymentInFlight.current,
    checkoutReady,
    checkoutContextLoading,
    locationContextValid,
    refreshCheckoutContext,
    handleStripeCheckout
  } as const;
}
