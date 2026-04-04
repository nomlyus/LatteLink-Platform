import BottomSheet, { BottomSheetBackdrop, BottomSheetView } from "@gorhom/bottom-sheet";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState, type ComponentRef } from "react";
import { StyleSheet, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useCart } from "./store";
import {
  formatUsd,
  resolveAppConfigData,
  resolveStoreConfigData,
  useAppConfigQuery,
  useStoreConfigQuery
} from "../menu/catalog";
import { canAttemptNativeApplePay, requestNativeApplePayWallet, type ApplePayWalletPayload } from "../orders/applePay";
import { tokenizeCloverCard, useCloverCardEntryConfigQuery } from "../orders/card";
import {
  CheckoutSubmissionError,
  createDemoApplePayToken,
  quoteItemsEqual,
  resolveInlineCheckoutErrorMessage,
  shouldShowCheckoutFailureScreen,
  toQuoteItems,
  useApplePayCheckoutMutation
} from "../orders/checkout";
import { useCheckoutFlow } from "../orders/flow";
import { Button, uiPalette, uiTypography } from "../ui/system";

type CheckoutSheetProps = {
  isOpen: boolean;
  onClose: () => void;
  totalAmountCents: number;
  currency: string;
  onSuccess: () => void;
  onFailure: (retryable: boolean) => void;
};

function StatusBanner({
  message,
  tone = "info"
}: {
  message: string;
  tone?: "info" | "warning";
}) {
  return (
    <View style={[styles.banner, tone === "warning" ? styles.bannerWarning : null]}>
      <Text style={[styles.bannerText, tone === "warning" ? styles.bannerTextWarning : null]}>{message}</Text>
    </View>
  );
}

export function CheckoutSheet({
  isOpen,
  onClose,
  totalAmountCents,
  currency,
  onSuccess,
  onFailure
}: CheckoutSheetProps) {
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const sheetRef = useRef<ComponentRef<typeof BottomSheet>>(null);
  const snapPoints = useMemo(() => ["86%"], []);
  const { items, clear } = useCart();
  const { retryOrder, clearRetryOrder, clearFailure, setConfirmation, setFailure } = useCheckoutFlow();
  const appConfigQuery = useAppConfigQuery();
  const storeConfigQuery = useStoreConfigQuery();
  const appConfig = appConfigQuery.data ? resolveAppConfigData(appConfigQuery.data) : null;
  const storeConfig = storeConfigQuery.data ? resolveStoreConfigData(storeConfigQuery.data) : null;
  const checkoutMutation = useApplePayCheckoutMutation();
  const checkoutUnavailableMessage = !storeConfig
    ? "Store details are temporarily unavailable. Retry loading checkout before paying."
    : !appConfig
      ? "Checkout configuration is temporarily unavailable. Retry loading checkout before paying."
      : null;
  const checkoutReady = checkoutUnavailableMessage === null;
  const cardCapabilityEnabled = Boolean(appConfig?.paymentCapabilities.card);
  const cardEntryConfigQuery = useCloverCardEntryConfigQuery(checkoutReady && cardCapabilityEnabled);
  const nativeApplePayAvailable = Boolean(checkoutReady && canAttemptNativeApplePay() && appConfig?.paymentCapabilities.applePay);
  const cardEntryVisible = Boolean(checkoutReady && cardCapabilityEnabled);
  const cardEntryConfigured = Boolean(checkoutReady && cardCapabilityEnabled && cardEntryConfigQuery.data?.enabled);
  const cardEntryConfigPending = Boolean(checkoutReady && cardCapabilityEnabled && cardEntryConfigQuery.isLoading);
  const showDevFallback = __DEV__ && checkoutReady;
  const quoteItems = useMemo(() => toQuoteItems(items), [items]);
  const retryableOrder = retryOrder && quoteItemsEqual(quoteItems, retryOrder.quoteItems) ? retryOrder : undefined;

  const [applePayToken, setApplePayToken] = useState("");
  const [cardNumber, setCardNumber] = useState("");
  const [cardExpMonth, setCardExpMonth] = useState("");
  const [cardExpYear, setCardExpYear] = useState("");
  const [cardCvv, setCardCvv] = useState("");
  const [nativeApplePayPending, setNativeApplePayPending] = useState(false);
  const [cardCheckoutPending, setCardCheckoutPending] = useState(false);
  const [statusMessage, setStatusMessage] = useState("");
  const [statusTone, setStatusTone] = useState<"info" | "warning">("info");

  useEffect(() => {
    if (isOpen) {
      sheetRef.current?.snapToIndex(0);
      return;
    }

    sheetRef.current?.close();
  }, [isOpen]);

  async function invalidateAccountQueries() {
    await queryClient.invalidateQueries({ queryKey: ["account"] });
  }

  function resetLocalInputState() {
    setApplePayToken("");
    setCardNumber("");
    setCardExpMonth("");
    setCardExpYear("");
    setCardCvv("");
    setNativeApplePayPending(false);
    setCardCheckoutPending(false);
    setStatusMessage("");
    setStatusTone("info");
  }

  function submitCheckout(
    paymentInput:
      | { paymentSourceToken: string }
      | { applePayToken: string }
      | { applePayWallet: ApplePayWalletPayload }
  ) {
    if (!storeConfig || !appConfig) {
      setStatusMessage(checkoutUnavailableMessage ?? "Checkout is temporarily unavailable.");
      setStatusTone("warning");
      return;
    }

    setStatusMessage("Submitting your order…");
    setStatusTone("info");

    checkoutMutation.mutate(
      {
        locationId: storeConfig.locationId,
        items,
        existingOrder: retryableOrder,
        ...paymentInput
      },
      {
        onSuccess: (paidOrder) => {
          setNativeApplePayPending(false);
          setCardCheckoutPending(false);
          setConfirmation({
            orderId: paidOrder.id,
            pickupCode: paidOrder.pickupCode,
            status: paidOrder.status,
            total: paidOrder.total,
            items: paidOrder.items,
            occurredAt: paidOrder.timeline[paidOrder.timeline.length - 1]?.occurredAt ?? new Date().toISOString()
          });
          clear();
          setStatusMessage("");
          setStatusTone("info");
          void invalidateAccountQueries();
          onClose();
          onSuccess();
          resetLocalInputState();
        },
        onError: (error) => {
          setNativeApplePayPending(false);
          setCardCheckoutPending(false);
          const message = error instanceof Error ? error.message : "Checkout failed.";

          if (error instanceof CheckoutSubmissionError) {
            void invalidateAccountQueries();

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
              order: error.order
            });
            onClose();
            onFailure(Boolean(error.order));
            resetLocalInputState();
            return;
          }

          setStatusMessage(message);
          setStatusTone("warning");
        }
      }
    );
  }

  function handleApplePayTokenCheckout() {
    const token = applePayToken.trim();
    if (!token) {
      setStatusMessage("Enter a test token before checkout.");
      setStatusTone("warning");
      return;
    }
    setApplePayToken("");
    submitCheckout({ applePayToken: token });
  }

  async function handleCardCheckout() {
    if (!storeConfig || !appConfig) {
      setStatusMessage(checkoutUnavailableMessage ?? "Checkout is temporarily unavailable.");
      setStatusTone("warning");
      return;
    }

    setCardCheckoutPending(true);
    setStatusMessage("Securing card details with Clover…");
    setStatusTone("info");

    try {
      const tokenizedCard = await tokenizeCloverCard(
        {
          number: cardNumber,
          expMonth: cardExpMonth,
          expYear: cardExpYear,
          cvv: cardCvv
        },
        cardEntryConfigQuery.data
      );
      setCardNumber("");
      setCardExpMonth("");
      setCardExpYear("");
      setCardCvv("");
      submitCheckout({ paymentSourceToken: tokenizedCard.token });
    } catch (error) {
      setCardCheckoutPending(false);
      setStatusMessage(error instanceof Error ? error.message : "Card tokenization failed.");
      setStatusTone("warning");
    }
  }

  async function handleNativeApplePayCheckout() {
    if (!storeConfig || !appConfig) {
      setStatusMessage(checkoutUnavailableMessage ?? "Checkout is temporarily unavailable.");
      setStatusTone("warning");
      return;
    }

    if (!nativeApplePayAvailable) {
      setStatusMessage(
        showDevFallback
          ? "Apple Pay is unavailable in this build. Use the development test flow below."
          : "Apple Pay is unavailable in this build right now."
      );
      setStatusTone("warning");
      return;
    }

    setNativeApplePayPending(true);
    setStatusMessage("Opening Apple Pay…");
    setStatusTone("info");

    try {
      const walletPayload = await requestNativeApplePayWallet({
        amountCents: totalAmountCents,
        currencyCode: currency,
        countryCode: "US",
        label: appConfig.brand.brandName
      });
      submitCheckout({ applePayWallet: walletPayload });
    } catch (error) {
      setNativeApplePayPending(false);
      const message = error instanceof Error ? error.message : "Apple Pay sheet failed.";
      setStatusMessage(message);
      setStatusTone("warning");
    }
  }

  return (
    <BottomSheet
      ref={sheetRef}
      index={-1}
      snapPoints={snapPoints}
      animateOnMount={false}
      enablePanDownToClose
      onChange={(index) => {
        if (index === -1) {
          onClose();
          resetLocalInputState();
        }
      }}
      backdropComponent={(props) => (
        <BottomSheetBackdrop
          {...props}
          appearsOnIndex={0}
          disappearsOnIndex={-1}
          opacity={0.36}
          pressBehavior="close"
        />
      )}
      backgroundStyle={styles.sheet}
    >
      <BottomSheetView style={[styles.content, { paddingBottom: Math.max(insets.bottom, 14) }]}>
        <Text style={styles.title}>Checkout</Text>
        <Text style={styles.subtitle}>Total due today: {formatUsd(totalAmountCents)}</Text>

        {checkoutUnavailableMessage ? <StatusBanner message={checkoutUnavailableMessage} tone="warning" /> : null}

        {statusMessage ? (
          <StatusBanner message={statusMessage} tone={statusTone === "warning" ? "warning" : "info"} />
        ) : null}

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Apple Pay</Text>
          <Text style={styles.sectionBody}>
            {nativeApplePayAvailable
              ? "Use Apple Pay to confirm payment instantly."
              : "Apple Pay is unavailable right now. You can continue with card checkout."}
          </Text>
          <View style={styles.actions}>
            <Button
              label={nativeApplePayPending ? "Opening Apple Pay…" : "Pay with Apple Pay"}
              variant="secondary"
              disabled={
                !checkoutReady ||
                !nativeApplePayAvailable ||
                nativeApplePayPending ||
                cardCheckoutPending ||
                checkoutMutation.isPending
              }
              onPress={() => {
                void handleNativeApplePayCheckout();
              }}
              style={{ flex: 1 }}
            />
          </View>
        </View>

        <View style={styles.divider} />

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Card checkout</Text>
          <Text style={styles.sectionBody}>
            Card details are sent directly to Clover for tokenization before your order is paid.
          </Text>

          {!cardEntryConfigured && !cardEntryConfigPending && cardEntryVisible ? (
            <StatusBanner
              message="Card setup has not been confirmed yet for this session. Try checkout below and any Clover configuration error will appear here."
              tone="warning"
            />
          ) : null}

          <TextInput
            value={cardNumber}
            onChangeText={setCardNumber}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="number-pad"
            placeholder="Card number"
            placeholderTextColor={uiPalette.textMuted}
            style={styles.tokenInput}
          />
          <View style={styles.cardRow}>
            <TextInput
              value={cardExpMonth}
              onChangeText={setCardExpMonth}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="number-pad"
              placeholder="MM"
              placeholderTextColor={uiPalette.textMuted}
              style={[styles.tokenInput, styles.cardFieldSmall]}
            />
            <TextInput
              value={cardExpYear}
              onChangeText={setCardExpYear}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="number-pad"
              placeholder="YYYY"
              placeholderTextColor={uiPalette.textMuted}
              style={[styles.tokenInput, styles.cardFieldMedium]}
            />
            <TextInput
              value={cardCvv}
              onChangeText={setCardCvv}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="number-pad"
              secureTextEntry
              placeholder="CVV"
              placeholderTextColor={uiPalette.textMuted}
              style={[styles.tokenInput, styles.cardFieldSmall]}
            />
          </View>
          <View style={styles.actions}>
            <Button
              label={cardCheckoutPending || checkoutMutation.isPending ? "Processing…" : `Pay ${formatUsd(totalAmountCents)}`}
              variant="primary"
              disabled={
                !checkoutReady ||
                !cardEntryVisible ||
                cardCheckoutPending ||
                checkoutMutation.isPending ||
                nativeApplePayPending ||
                cardEntryConfigPending
              }
              onPress={() => {
                void handleCardCheckout();
              }}
              style={{ flex: 1 }}
            />
          </View>
        </View>

        {showDevFallback ? (
          <View style={styles.devSection}>
            <Text style={styles.devEyebrow}>Development fallback</Text>
            <TextInput
              value={applePayToken}
              onChangeText={setApplePayToken}
              autoCapitalize="none"
              autoCorrect={false}
              secureTextEntry
              placeholder="Test Apple Pay token"
              placeholderTextColor={uiPalette.textMuted}
              style={styles.tokenInput}
            />
            <View style={styles.actions}>
              <Button
                label="Use Demo Token"
                variant="secondary"
                onPress={() => setApplePayToken(createDemoApplePayToken())}
                style={{ flex: 1 }}
              />
              <Button
                label={checkoutMutation.isPending ? "Processing…" : "Run Test"}
                variant="ghost"
                disabled={checkoutMutation.isPending || nativeApplePayPending}
                onPress={handleApplePayTokenCheckout}
                style={{ flex: 1 }}
              />
            </View>
          </View>
        ) : null}
      </BottomSheetView>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  sheet: {
    backgroundColor: uiPalette.surfaceStrong,
    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,
    borderWidth: 1,
    borderColor: uiPalette.borderStrong
  },
  content: {
    flex: 1,
    paddingHorizontal: 20,
    paddingTop: 20
  },
  title: {
    fontSize: 24,
    lineHeight: 28,
    letterSpacing: -0.4,
    color: uiPalette.text,
    fontFamily: uiTypography.displayFamily,
    fontWeight: "700"
  },
  subtitle: {
    marginTop: 8,
    fontSize: 14,
    lineHeight: 20,
    color: uiPalette.textSecondary
  },
  banner: {
    marginTop: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 18,
    backgroundColor: uiPalette.surfaceMuted,
    borderWidth: 1,
    borderColor: uiPalette.border
  },
  bannerWarning: {
    backgroundColor: "rgba(176, 122, 58, 0.08)",
    borderColor: "rgba(176, 122, 58, 0.18)"
  },
  bannerText: {
    fontSize: 13,
    lineHeight: 19,
    color: uiPalette.textSecondary
  },
  bannerTextWarning: {
    color: uiPalette.text
  },
  section: {
    marginTop: 16
  },
  sectionTitle: {
    fontSize: 16,
    lineHeight: 20,
    fontWeight: "700",
    color: uiPalette.text,
    fontFamily: uiTypography.displayFamily
  },
  sectionBody: {
    marginTop: 6,
    fontSize: 13,
    lineHeight: 19,
    color: uiPalette.textSecondary
  },
  divider: {
    height: 1,
    marginTop: 16,
    backgroundColor: "rgba(23, 21, 19, 0.08)"
  },
  tokenInput: {
    minHeight: 52,
    marginTop: 10,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: uiPalette.border,
    backgroundColor: uiPalette.surfaceStrong,
    paddingHorizontal: 14,
    color: uiPalette.text
  },
  cardRow: {
    marginTop: 10,
    flexDirection: "row",
    gap: 10
  },
  cardFieldSmall: {
    flex: 1
  },
  cardFieldMedium: {
    flex: 1.35
  },
  actions: {
    marginTop: 10,
    flexDirection: "row",
    gap: 10
  },
  devSection: {
    marginTop: 16,
    padding: 14,
    borderRadius: 20,
    backgroundColor: "rgba(255,255,255,0.44)",
    borderWidth: 1,
    borderColor: uiPalette.border
  },
  devEyebrow: {
    marginBottom: 10,
    fontSize: 11,
    lineHeight: 14,
    textTransform: "uppercase",
    letterSpacing: 1.1,
    color: uiPalette.textMuted,
    fontWeight: "700"
  }
});
