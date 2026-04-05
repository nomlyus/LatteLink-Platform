import { Ionicons } from "@expo/vector-icons";
import { BlurView } from "expo-blur";
import { GlassView, isLiquidGlassAvailable } from "expo-glass-effect";
import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { useMemo, useState } from "react";
import { Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { buildPricingSummary } from "../src/cart/model";
import { useCart } from "../src/cart/store";
import {
  formatUsd,
  resolveAppConfigData,
  resolveStoreConfigData,
  useAppConfigQuery,
  useStoreConfigQuery
} from "../src/menu/catalog";
import { tokenizeCloverCard, useCloverCardEntryConfigQuery } from "../src/orders/card";
import {
  CheckoutSubmissionError,
  createDemoApplePayToken,
  quoteItemsEqual,
  resolveInlineCheckoutErrorMessage,
  shouldShowCheckoutFailureScreen,
  toQuoteItems,
  useApplePayCheckoutMutation
} from "../src/orders/checkout";
import { useCheckoutFlow } from "../src/orders/flow";
import { Button, uiPalette, uiTypography } from "../src/ui/system";

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

function canUseLiquidGlassSheets() {
  if (Platform.OS !== "ios") return false;

  try {
    return isLiquidGlassAvailable();
  } catch {
    return false;
  }
}

function HeaderActionChip({
  label,
  icon,
  onPress
}: {
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  onPress: () => void;
}) {
  const useLiquidGlass = canUseLiquidGlassSheets();

  const content = (
    <View style={[styles.headerActionChipInner, useLiquidGlass ? styles.headerActionChipInnerGlass : styles.headerActionChipInnerFallback]}>
      <Ionicons name={icon} size={13} color={uiPalette.textSecondary} />
      <Text style={styles.headerActionChipText}>{label}</Text>
    </View>
  );

  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.headerActionChipShell, pressed ? styles.headerActionChipPressed : null]}>
      {useLiquidGlass ? (
        <GlassView glassEffectStyle="regular" colorScheme="auto" isInteractive style={styles.headerActionChipFrame}>
          {content}
        </GlassView>
      ) : (
        <BlurView tint="light" intensity={Platform.OS === "ios" ? 24 : 20} style={styles.headerActionChipFrame}>
          {content}
        </BlurView>
      )}
    </Pressable>
  );
}

export default function CheckoutScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { items, subtotalCents, clear } = useCart();
  const { retryOrder, clearRetryOrder, clearFailure, setConfirmation, setFailure } = useCheckoutFlow();
  const appConfigQuery = useAppConfigQuery();
  const storeConfigQuery = useStoreConfigQuery();
  const appConfig = appConfigQuery.data ? resolveAppConfigData(appConfigQuery.data) : null;
  const storeConfig = storeConfigQuery.data ? resolveStoreConfigData(storeConfigQuery.data) : null;
  const pricingSummary = buildPricingSummary(subtotalCents, storeConfig?.taxRateBasisPoints ?? 0);
  const checkoutMutation = useApplePayCheckoutMutation();
  const storeClosedMessage =
    storeConfig && !storeConfig.isOpen
      ? `The store is closed right now. Orders are accepted during ${storeConfig.hoursText}.`
      : null;
  const checkoutUnavailableMessage = !storeConfig
    ? "Store details are temporarily unavailable. Retry loading checkout before paying."
    : !appConfig
      ? "Checkout configuration is temporarily unavailable. Retry loading checkout before paying."
      : storeClosedMessage;
  const checkoutReady = checkoutUnavailableMessage === null;
  const cardCapabilityEnabled = Boolean(appConfig?.paymentCapabilities.card);
  const cardEntryConfigQuery = useCloverCardEntryConfigQuery(checkoutReady && cardCapabilityEnabled);
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
  const [cardCheckoutPending, setCardCheckoutPending] = useState(false);
  const [statusMessage, setStatusMessage] = useState("");
  const [statusTone, setStatusTone] = useState<"info" | "warning">("info");

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

  function submitCheckout(
    paymentInput:
      | { paymentSourceToken: string }
      | { applePayToken: string }
  ) {
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
          dismissCheckoutToCart();
        },
        onError: (error) => {
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
            dismissCheckoutToCart();
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

    if (!storeConfig.isOpen) {
      setStatusMessage(storeClosedMessage ?? "The store is currently closed.");
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

  return (
    <View style={styles.screen}>
      <View style={styles.handleWrap}>
        <View style={styles.handle} />
      </View>

      <View style={styles.headerArea}>
        <View style={styles.headerRow}>
          <View style={styles.headerCopy}>
            <Text style={styles.headerTitle}>Checkout</Text>
            <Text style={styles.headerSubtitle}>
              {storeConfig
                ? storeConfig.isOpen
                  ? `Estimated wait is ${storeConfig.prepEtaMinutes} min`
                  : `Closed now · Orders resume during ${storeConfig.hoursText}`
                : "Checkout details unavailable"}
            </Text>
          </View>
          {checkoutUnavailableMessage ? (
            <HeaderActionChip label="Retry" icon="refresh-outline" onPress={refreshCheckoutContext} />
          ) : null}
        </View>
      </View>

      <ScrollView
        bounces
        showsVerticalScrollIndicator={false}
        contentInsetAdjustmentBehavior="never"
        contentContainerStyle={[styles.content, { paddingBottom: Math.max(insets.bottom, 16) + 24 }]}
      >
        {items.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyTitle}>Your cart is empty.</Text>
            <Text style={styles.emptyBody}>Add items from the menu before opening checkout.</Text>
            <Button label="Back to cart" variant="secondary" onPress={dismissCheckout} />
          </View>
        ) : (
          <>
            {retryableOrder ? (
              <StatusBanner
                message={`Payment for order ${retryableOrder.pickupCode} did not complete. You can retry without rebuilding the bag.`}
                tone="warning"
              />
            ) : null}

            {checkoutUnavailableMessage ? <StatusBanner message={checkoutUnavailableMessage} tone="warning" /> : null}

            {statusMessage ? (
              <StatusBanner message={statusMessage} tone={statusTone === "warning" ? "warning" : "info"} />
            ) : null}

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
                  label={cardCheckoutPending || checkoutMutation.isPending ? "Processing…" : `Pay ${formatUsd(pricingSummary.totalCents)}`}
                  variant="primary"
                  disabled={
                    !checkoutReady ||
                    !cardEntryVisible ||
                    cardCheckoutPending ||
                    checkoutMutation.isPending ||
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
                    disabled={checkoutMutation.isPending}
                    onPress={handleApplePayTokenCheckout}
                    style={{ flex: 1 }}
                  />
                </View>
              </View>
            ) : null}
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: "rgba(247, 244, 237, 0.985)"
  },
  handleWrap: {
    position: "absolute",
    top: 14,
    left: 0,
    right: 0,
    alignItems: "center",
    zIndex: 10
  },
  handle: {
    width: 38,
    height: 5,
    borderRadius: 999,
    backgroundColor: "rgba(151, 160, 154, 0.52)"
  },
  headerArea: {
    paddingHorizontal: 20,
    paddingTop: 28,
    paddingBottom: 4
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12
  },
  headerCopy: {
    flex: 1
  },
  content: {
    paddingHorizontal: 20,
    paddingTop: 14
  },
  headerTitle: {
    marginTop: 15,
    fontSize: 19,
    lineHeight: 24,
    letterSpacing: 2,
    textTransform: "uppercase",
    color: uiPalette.text,
    fontFamily: uiTypography.displayFamily,
    fontWeight: "600"
  },
  headerSubtitle: {
    marginTop: 6,
    marginBottom: 6,
    fontSize: 13,
    lineHeight: 18,
    color: uiPalette.textSecondary
  },
  emptyState: {
    gap: 14,
    paddingVertical: 32
  },
  emptyTitle: {
    fontSize: 28,
    lineHeight: 32,
    color: uiPalette.text,
    fontFamily: uiTypography.displayFamily
  },
  emptyBody: {
    fontSize: 15,
    lineHeight: 22,
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
    letterSpacing: 1.4,
    textTransform: "uppercase",
    color: uiPalette.textSecondary
  },
  headerActionChipShell: {
    borderRadius: 999
  },
  headerActionChipPressed: {
    opacity: 0.8
  },
  headerActionChipFrame: {
    borderRadius: 999,
    overflow: "hidden"
  },
  headerActionChipInner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999
  },
  headerActionChipInnerGlass: {
    backgroundColor: "rgba(255,255,255,0.025)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)"
  },
  headerActionChipInnerFallback: {
    backgroundColor: "rgba(255,255,255,0.46)",
    borderWidth: 1,
    borderColor: uiPalette.border
  },
  headerActionChipText: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: "600",
    color: uiPalette.textSecondary
  }
});
