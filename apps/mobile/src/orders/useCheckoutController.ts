import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { PaymentSheetError, initPaymentSheet, initStripe, presentPaymentSheet } from "@stripe/stripe-react-native";
import { useEffect, useMemo, useRef, useState } from "react";

import { useSafeAreaInsets } from "react-native-safe-area-context";
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
  useStripeCheckoutMutation
} from "./checkout";
import { useCheckoutFlow } from "./flow";

import { resolveConfiguredApplePayMerchantIdentifier } from "./applePay";
import type { Order } from "@lattelink/contracts-orders";
import { buildCheckoutOrderHistoryEntry, resolveStripeReturnUrl, resolveStripeUrlScheme } from "./checkoutPresentation";

export function useCheckoutController() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { items, locationId: cartLocationId, subtotalCents, discountCode, setDiscountCode, clear } = useCart();
  const location = useLocationContext();
  const { retryOrder, clearRetryOrder, clearFailure, setConfirmation, setFailure, setRetryOrder } = useCheckoutFlow();
  const appConfigQuery = useAppConfigQuery();
  const storeConfigQuery = useStoreConfigQuery();
  const appConfig = appConfigQuery.data ? resolveAppConfigData(appConfigQuery.data) : null;
  const storeConfig = storeConfigQuery.data ? resolveStoreConfigData(storeConfigQuery.data) : null;
  const pricingSummary = buildPricingSummary(subtotalCents, storeConfig?.taxRateBasisPoints ?? 0);
  const checkoutMutation = useStripeCheckoutMutation();
  const liveCartContextRef = useRef({ items, cartLocationId, selectedLocationId: location.selectedLocationId });
  liveCartContextRef.current = { items, cartLocationId, selectedLocationId: location.selectedLocationId };
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
  const retryableOrder = isRetryableCheckoutForCart(retryOrder, quoteItems, cartLocationId, location.selectedLocationId)
    ? (retryOrder ?? undefined)
    : undefined;
  const itemCount = useMemo(() => items.reduce((sum, item) => sum + item.quantity, 0), [items]);
  const applePayMerchantIdentifier = resolveConfiguredApplePayMerchantIdentifier();
  const brandName = appConfig?.brand.brandName ?? "Your order";
  const storeStatusLabel = storeConfig
    ? storeConfig.isOpen
      ? "Open now"
      : "Closed right now"
    : storeConfigLoading
      ? "Loading store hours"
      : "Store unavailable";
  const etaLabel = storeConfig ? `${storeConfig.prepEtaMinutes} min pickup` : "ETA unavailable";
  const [paymentSheetPending, setPaymentSheetPending] = useState(false);
  const [statusMessage, setStatusMessage] = useState("");
  const [statusTone, setStatusTone] = useState<"info" | "warning">("info");
  const locationContextValid = isCheckoutLocationConsistent(cartLocationId, location.selectedLocationId);
  const payActionDisabled =
    !checkoutReady || !locationContextValid || items.length === 0 || paymentSheetPending || checkoutMutation.isPending;
  const payActionLabel =
    paymentSheetPending || checkoutMutation.isPending
      ? "Opening secure payment…"
      : discountCode
        ? "Review final total"
        : `Pay ${formatUsd(pricingSummary.totalCents)}`;
  async function invalidateAccountQueries() {
    await queryClient.invalidateQueries({ queryKey: ["account"] });
  }
  function refreshCheckoutContext() {
    void Promise.allSettled([appConfigQuery.refetch(), storeConfigQuery.refetch()]);
  }
  function dismissCheckoutToCart() {
    router.dismissTo("/cart");
  }
  function dismissCheckout() {
    if (router.canGoBack()) {
      router.back();
      return;
    }

    router.replace("/cart");
  }
  async function handleStripeCheckout() {
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

    setPaymentSheetPending(true);
    setStatusMessage("Preparing secure payment…");
    setStatusTone("info");

    try {
      const preparedCheckout = await checkoutMutation.mutateAsync({
        cartLocationId,
        selectedLocationId: location.selectedLocationId,
        items,
        discountCode,
        existingCheckout: retryableOrder
      });

      const checkoutStillMatchesCurrentCart = () => {
        const current = liveCartContextRef.current;
        return checkoutSnapshotMatchesCart(
          preparedCheckout.checkout,
          current.items,
          current.cartLocationId,
          current.selectedLocationId
        );
      };
      if (!checkoutStillMatchesCurrentCart()) {
        clearRetryOrder();
        throw new Error(
          "Your bag or selected location changed while checkout was preparing. Review your bag and try again."
        );
      }

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
      if (presentResult.error?.code === PaymentSheetError.Canceled) {
        setRetryOrder(preparedCheckout.checkout);
        clearFailure();
        setStatusMessage("");
        setStatusTone("info");
        dismissCheckoutToCart();
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
        setStatusMessage("Payment was received, but confirmation is still processing. Check Orders in a moment.");
        setStatusTone("info");
        clear();
        clearRetryOrder();
        void invalidateAccountQueries();
        dismissCheckoutToCart();
        return;
      }

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
      clear();
      setStatusMessage("");
      setStatusTone("info");
      void invalidateAccountQueries();
      dismissCheckoutToCart();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Checkout failed.";

      if (error instanceof CheckoutSubmissionError) {
        void invalidateAccountQueries();

        if (error.stage === "pay") {
          setStatusMessage("");
          setStatusTone("info");
          setFailure({
            message,
            stage: error.stage,
            occurredAt: new Date().toISOString(),
            checkout: error.checkout
          });
          router.replace("/checkout-failure");
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
        dismissCheckoutToCart();
        return;
      }

      setStatusMessage(message);
      setStatusTone("warning");
    } finally {
      setPaymentSheetPending(false);
    }
  }
  const scrollBottomPadding = Math.max(insets.bottom, 16) + 172;
  return {
    insets,
    items,
    subtotalCents,
    discountCode,
    setDiscountCode,
    storeConfig,
    pricingSummary,
    storeConfigLoading,
    checkoutUnavailableMessage,
    checkoutUnavailableTone,
    showCheckoutRetry,
    retryableOrder,
    itemCount,
    brandName,
    storeStatusLabel,
    etaLabel,
    statusMessage,
    statusTone,
    payActionDisabled,
    payActionLabel,
    refreshCheckoutContext,
    dismissCheckout,
    handleStripeCheckout,
    scrollBottomPadding
  } as const;
}
