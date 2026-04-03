import { Ionicons } from "@expo/vector-icons";
import { useQueryClient } from "@tanstack/react-query";
import { BlurView } from "expo-blur";
import { GlassView, isLiquidGlassAvailable } from "expo-glass-effect";
import { useRouter } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import { Image, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { getCheckoutRecoveryActionLabel } from "../src/auth/recovery";
import { useAuthSession } from "../src/auth/session";
import { ClearCartSheet } from "../src/cart/ClearCartSheet";
import { buildPricingSummary, describeCustomization } from "../src/cart/model";
import { RemoveItemSheet } from "../src/cart/RemoveItemSheet";
import { useCart } from "../src/cart/store";
import {
  formatUsd,
  resolveAppConfigData,
  resolveMenuData,
  resolveStoreConfigData,
  useAppConfigQuery,
  useMenuQuery,
  useStoreConfigQuery
} from "../src/menu/catalog";
import { canAttemptNativeApplePay, requestNativeApplePayWallet, type ApplePayWalletPayload } from "../src/orders/applePay";
import { tokenizeCloverCard, useCloverCardEntryConfigQuery } from "../src/orders/card";
import {
  CheckoutSubmissionError,
  createDemoApplePayToken,
  quoteItemsEqual,
  toQuoteItems,
  useApplePayCheckoutMutation
} from "../src/orders/checkout";
import { useCheckoutFlow } from "../src/orders/flow";
import { getTabBarBottomOffset, TAB_BAR_HEIGHT } from "../src/navigation/tabBarMetrics";
import { Button, uiPalette, uiTypography } from "../src/ui/system";

function SummaryRow({
  label,
  value,
  emphasized = false
}: {
  label: string;
  value: string;
  emphasized?: boolean;
}) {
  return (
    <View style={styles.summaryRow}>
      <Text style={[styles.summaryText, emphasized ? styles.summaryStrong : null]}>{label}</Text>
      <Text style={[styles.summaryText, emphasized ? styles.summaryStrong : null]}>{value}</Text>
    </View>
  );
}

function StatusBanner({
  message,
  tone = "info"
}: {
  message: string;
  tone?: "info" | "warning";
}) {
  return (
    <View style={[styles.banner, tone === "warning" ? styles.bannerWarning : null]}>
      <Ionicons
        name={tone === "warning" ? "alert-circle-outline" : "information-circle-outline"}
        size={16}
        color={tone === "warning" ? uiPalette.warning : uiPalette.accent}
      />
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

function StickyActionPill({
  label,
  value,
  icon,
  onPress,
  disabled = false
}: {
  label: string;
  value: string;
  icon: keyof typeof Ionicons.glyphMap;
  onPress: () => void;
  disabled?: boolean;
}) {
  const useLiquidGlass = canUseLiquidGlassSheets();

  const content = (
    <View style={[styles.stickyPillInner, disabled ? styles.stickyPillInnerDisabled : null]}>
      <View style={styles.stickyPillLead}>
        <Ionicons name={icon} size={16} color={disabled ? uiPalette.textMuted : uiPalette.text} />
        <Text style={[styles.stickyPillLabel, disabled ? styles.stickyPillLabelDisabled : null]}>{label}</Text>
      </View>
      <Text style={[styles.stickyPillValue, disabled ? styles.stickyPillValueDisabled : null]}>{value}</Text>
    </View>
  );

  return (
    <Pressable disabled={disabled} onPress={onPress} style={({ pressed }) => [styles.stickyPillShell, pressed && !disabled ? styles.stickyPillPressed : null]}>
      {useLiquidGlass ? (
        <GlassView glassEffectStyle="regular" colorScheme="auto" isInteractive style={styles.stickyPillFrame}>
          {content}
        </GlassView>
      ) : (
        <BlurView tint="light" intensity={Platform.OS === "ios" ? 24 : 20} style={styles.stickyPillFrame}>
          {content}
        </BlurView>
      )}
    </Pressable>
  );
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

function RowQuantityControl({
  quantity,
  canDecrease,
  onDecrease,
  onIncrease,
  onRemove
}: {
  quantity: number;
  canDecrease: boolean;
  onDecrease: () => void;
  onIncrease: () => void;
  onRemove: () => void;
}) {
  const useLiquidGlass = canUseLiquidGlassSheets();

  const content = (
    <View style={[styles.stepperInner, useLiquidGlass ? styles.stepperInnerGlass : styles.stepperInnerFallback]}>
      <Pressable style={[styles.stepperButton, useLiquidGlass ? styles.stepperButtonGlass : null]} onPress={onIncrease}>
        <Ionicons name="add" size={16} color={uiPalette.text} />
      </Pressable>
      <Text style={styles.stepperValue}>{quantity}</Text>
      <Pressable style={[styles.stepperButton, useLiquidGlass ? styles.stepperButtonGlass : null, !canDecrease ? styles.stepperButtonDisabled : null]} onPress={onDecrease}>
        <Ionicons name="remove" size={16} color={uiPalette.text} />
      </Pressable>
      <View style={[styles.stepperDivider, useLiquidGlass ? styles.stepperDividerGlass : null]} />
      <Pressable style={[styles.stepperButton, useLiquidGlass ? styles.stepperButtonGlass : null]} onPress={onRemove}>
        <Ionicons name="trash-outline" size={16} color={uiPalette.textSecondary} />
      </Pressable>
    </View>
  );

  return useLiquidGlass ? (
    <GlassView glassEffectStyle="regular" colorScheme="auto" isInteractive style={styles.stepperShell}>
      {content}
    </GlassView>
  ) : (
    <BlurView tint="light" intensity={Platform.OS === "ios" ? 24 : 20} style={styles.stepperShell}>
      {content}
    </BlurView>
  );
}

function SectionHeading({
  eyebrow,
  title,
  action
}: {
  eyebrow: string;
  title: string;
  action?: React.ReactNode;
}) {
  return (
    <View style={styles.sectionHeader}>
      <View style={styles.sectionCopy}>
        <Text style={styles.sectionEyebrow}>{eyebrow}</Text>
        <Text style={styles.sectionTitle}>{title}</Text>
      </View>
      {action ? <View>{action}</View> : null}
    </View>
  );
}

function resolveItemIcon(name: string): keyof typeof Ionicons.glyphMap {
  const haystack = name.toLowerCase();
  if (haystack.includes("tea") || haystack.includes("matcha")) return "leaf-outline";
  if (
    haystack.includes("croissant") ||
    haystack.includes("cookie") ||
    haystack.includes("muffin") ||
    haystack.includes("pastry")
  ) {
    return "nutrition-outline";
  }
  if (
    haystack.includes("latte") ||
    haystack.includes("espresso") ||
    haystack.includes("coffee") ||
    haystack.includes("cappuccino")
  ) {
    return "cafe-outline";
  }
  return "sparkles-outline";
}

function CartItemArtwork({
  itemName,
  imageUrl
}: {
  itemName: string;
  imageUrl?: string;
}) {
  const [imageFailed, setImageFailed] = useState(false);

  useEffect(() => {
    setImageFailed(false);
  }, [imageUrl]);

  return (
    <View style={styles.itemIconWrap}>
      {imageUrl && !imageFailed ? (
        <Image source={{ uri: imageUrl }} style={styles.itemArtwork} resizeMode="contain" onError={() => setImageFailed(true)} />
      ) : (
        <Ionicons name={resolveItemIcon(itemName)} size={18} color={uiPalette.accent} />
      )}
    </View>
  );
}

export default function CartModalScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const insets = useSafeAreaInsets();
  const stickyFooterBottom = getTabBarBottomOffset(insets.bottom > 0);
  const stickyFooterClearance = stickyFooterBottom + TAB_BAR_HEIGHT + 16;
  const { isAuthenticated, authRecoveryState } = useAuthSession();
  const { items, itemCount, subtotalCents, setQuantity, removeItem, clear } = useCart();
  const { retryOrder, clearRetryOrder, clearFailure, setConfirmation, setFailure } = useCheckoutFlow();
  const appConfigQuery = useAppConfigQuery();
  const menuQuery = useMenuQuery();
  const storeConfigQuery = useStoreConfigQuery();
  const menu = menuQuery.data ? resolveMenuData(menuQuery.data) : null;
  const appConfig = appConfigQuery.data ? resolveAppConfigData(appConfigQuery.data) : null;
  const storeConfig = storeConfigQuery.data ? resolveStoreConfigData(storeConfigQuery.data) : null;
  const pricingSummary = buildPricingSummary(subtotalCents, storeConfig?.taxRateBasisPoints ?? 0);
  const checkoutMutation = useApplePayCheckoutMutation();
  const checkoutUnavailableMessage = !storeConfig
    ? "Store details are temporarily unavailable. Retry loading checkout before paying."
    : !appConfig
      ? "Checkout configuration is temporarily unavailable. Retry loading checkout before paying."
      : null;
  const checkoutReady = checkoutUnavailableMessage === null;
  const cardCapabilityEnabled = Boolean(appConfig?.paymentCapabilities.card);
  const cardEntryConfigQuery = useCloverCardEntryConfigQuery(isAuthenticated && checkoutReady && cardCapabilityEnabled);
  const nativeApplePayAvailable = Boolean(checkoutReady && canAttemptNativeApplePay() && appConfig?.paymentCapabilities.applePay);
  const cardEntryAvailable = Boolean(checkoutReady && cardCapabilityEnabled && cardEntryConfigQuery.data?.enabled);
  const cardEntryConfigPending = Boolean(isAuthenticated && checkoutReady && cardCapabilityEnabled && cardEntryConfigQuery.isLoading);
  const showDevFallback = __DEV__ && checkoutReady;
  const quoteItems = useMemo(() => toQuoteItems(items), [items]);
  const retryableOrder = retryOrder && quoteItemsEqual(quoteItems, retryOrder.quoteItems) ? retryOrder : undefined;
  const menuItemsById = useMemo(
    () => new Map((menu?.categories ?? []).flatMap((category) => category.items).map((item) => [item.id, item])),
    [menu?.categories]
  );
  const [pendingRemovalLineId, setPendingRemovalLineId] = useState<string | null>(null);
  const pendingRemovalItem = useMemo(
    () => items.find((item) => item.lineId === pendingRemovalLineId) ?? null,
    [items, pendingRemovalLineId]
  );
  const [clearSheetOpen, setClearSheetOpen] = useState(false);

  const [applePayToken, setApplePayToken] = useState("");
  const [cardNumber, setCardNumber] = useState("");
  const [cardExpMonth, setCardExpMonth] = useState("");
  const [cardExpYear, setCardExpYear] = useState("");
  const [cardCvv, setCardCvv] = useState("");
  const [nativeApplePayPending, setNativeApplePayPending] = useState(false);
  const [cardCheckoutPending, setCardCheckoutPending] = useState(false);
  const [statusMessage, setStatusMessage] = useState("");
  const stickyActionDisabled = isAuthenticated
    ? !checkoutReady ||
      nativeApplePayPending ||
      cardCheckoutPending ||
      checkoutMutation.isPending ||
      (!nativeApplePayAvailable && !cardEntryAvailable)
    : false;
  const stickyActionLabel = isAuthenticated
    ? !checkoutReady
      ? "Checkout unavailable"
      : nativeApplePayPending
        ? "Opening Apple Pay…"
        : cardCheckoutPending
          ? "Preparing card…"
        : cardEntryConfigPending
          ? "Loading payment…"
        : checkoutMutation.isPending
          ? "Processing…"
          : retryableOrder
            ? "Retry payment"
            : nativeApplePayAvailable
              ? "Pay with Apple Pay"
              : cardEntryAvailable
                ? "Use card below"
                : "Payment unavailable"
    : getCheckoutRecoveryActionLabel(authRecoveryState);
  const stickyActionIcon: keyof typeof Ionicons.glyphMap = isAuthenticated
    ? nativeApplePayAvailable
      ? "logo-apple"
      : cardEntryAvailable
        ? "card-outline"
        : "alert-circle-outline"
    : "log-in-outline";
  const stickyActionValue = formatUsd(checkoutReady ? pricingSummary.totalCents : subtotalCents);

  useEffect(() => {
    if (retryOrder && !quoteItemsEqual(quoteItems, retryOrder.quoteItems)) {
      clearRetryOrder();
    }
  }, [clearRetryOrder, quoteItems, retryOrder]);

  useEffect(() => {
    if (pendingRemovalLineId && !pendingRemovalItem) {
      setPendingRemovalLineId(null);
    }
  }, [pendingRemovalItem, pendingRemovalLineId]);

  async function invalidateAccountQueries() {
    await queryClient.invalidateQueries({ queryKey: ["account"] });
  }

  function refreshCheckoutContext() {
    setStatusMessage("");
    void Promise.allSettled([appConfigQuery.refetch(), storeConfigQuery.refetch(), menuQuery.refetch()]);
  }

  function resetCartState() {
    setClearSheetOpen(false);
    setPendingRemovalLineId(null);
    clear();
    clearFailure();
    clearRetryOrder();
    setStatusMessage("");
  }

  function submitCheckout(
    paymentInput:
      | { paymentSourceToken: string }
      | { applePayToken: string }
      | { applePayWallet: ApplePayWalletPayload }
  ) {
    if (!storeConfig || !appConfig) {
      setStatusMessage(checkoutUnavailableMessage ?? "Checkout is temporarily unavailable.");
      return;
    }

    setStatusMessage("Submitting your order…");

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
          void invalidateAccountQueries();
          router.replace("/checkout-success");
        },
        onError: (error) => {
          setNativeApplePayPending(false);
          setCardCheckoutPending(false);
          const message = error instanceof Error ? error.message : "Checkout failed.";

          if (error instanceof CheckoutSubmissionError) {
            setStatusMessage("");
            setFailure({
              message,
              stage: error.stage,
              occurredAt: new Date().toISOString(),
              order: error.order
            });
            void invalidateAccountQueries();
            router.replace("/checkout-failure");
            return;
          }

          setStatusMessage(message);
        }
      }
    );
  }

  function handleApplePayTokenCheckout() {
    const token = applePayToken.trim();
    if (!token) {
      setStatusMessage("Enter a test token before checkout.");
      return;
    }
    setApplePayToken("");
    submitCheckout({ applePayToken: token });
  }

  async function handleCardCheckout() {
    if (!storeConfig || !appConfig) {
      setStatusMessage(checkoutUnavailableMessage ?? "Checkout is temporarily unavailable.");
      return;
    }

    setCardCheckoutPending(true);
    setStatusMessage("Securing card details with Clover…");

    try {
      const tokenizedCard = await tokenizeCloverCard({
        number: cardNumber,
        expMonth: cardExpMonth,
        expYear: cardExpYear,
        cvv: cardCvv
      }, cardEntryConfigQuery.data);
      setCardNumber("");
      setCardExpMonth("");
      setCardExpYear("");
      setCardCvv("");
      submitCheckout({ paymentSourceToken: tokenizedCard.token });
    } catch (error) {
      setCardCheckoutPending(false);
      setStatusMessage(error instanceof Error ? error.message : "Card tokenization failed.");
    }
  }

  async function handleNativeApplePayCheckout() {
    if (!storeConfig || !appConfig) {
      setStatusMessage(checkoutUnavailableMessage ?? "Checkout is temporarily unavailable.");
      return;
    }

    if (!nativeApplePayAvailable) {
      setStatusMessage(
        showDevFallback
          ? "Apple Pay is unavailable in this build. Use the development test flow below."
          : "Apple Pay is unavailable in this build right now."
      );
      return;
    }

    setNativeApplePayPending(true);
    setStatusMessage("Opening Apple Pay…");

    try {
      const walletPayload = await requestNativeApplePayWallet({
        amountCents: pricingSummary.totalCents,
        currencyCode: "USD",
        countryCode: "US",
        label: appConfig.brand.brandName
      });
      submitCheckout({ applePayWallet: walletPayload });
    } catch (error) {
      setNativeApplePayPending(false);
      const message = error instanceof Error ? error.message : "Apple Pay sheet failed.";
      setStatusMessage(message);
    }
  }

  return (
    <View style={styles.backdrop}>
      <View style={styles.sheet}>
        <View style={styles.handleWrap}>
          <View style={styles.modalHandle} />
        </View>

        <View style={styles.headerArea}>
          <View style={styles.headerRow}>
            <View style={styles.headerCopy}>
              <Text style={styles.headerTitle}>Order Review</Text>
              <Text style={styles.headerSubtitle}>
                {storeConfig ? `Estimated wait is ${storeConfig.prepEtaMinutes} min` : "Checkout details unavailable"}
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
          contentContainerStyle={[
            {
              paddingHorizontal: 20,
              paddingTop: items.length > 0 ? 14 : 8,
              paddingBottom: items.length > 0 ? stickyFooterClearance : Math.max(insets.bottom, 12) + 8
            },
            items.length === 0 ? styles.emptyScrollContent : null
          ]}
        >
          {items.length === 0 ? (
            <View style={styles.emptyPage}>
              <Text style={styles.emptyEyebrow}>Bag</Text>
              <Text style={styles.emptyTitle}>Your cart is empty.</Text>
              <Text style={styles.emptyBody}>Add drinks or pastries from the menu, then come back here to review and pay.</Text>
            </View>
          ) : (
            <>
              {retryableOrder ? (
                <StatusBanner
                  message={`Payment for order ${retryableOrder.pickupCode} did not complete. You can retry without rebuilding the bag.`}
                  tone="warning"
                />
              ) : null}

              <View style={styles.sectionBlock}>
                <SectionHeading
                  eyebrow="Bag"
                  title="Items"
                  action={
                    <HeaderActionChip label="Clear" icon="close-outline" onPress={() => setClearSheetOpen(true)} />
                  }
                />

                <View style={styles.lineStack}>
                  {items.map((item, index) => {
                    const customizationSummary = describeCustomization(item, { fallback: "Standard build" });
                    const notes = item.customization.notes.trim();
                    const menuItem = menuItemsById.get(item.menuItemId);

                    return (
                      <View key={item.lineId}>
                        <View style={styles.lineCard}>
                          <View style={styles.lineTopRow}>
                            <CartItemArtwork itemName={item.itemName} imageUrl={menuItem?.imageUrl} />

                            <View style={[styles.lineBodyWrap, index < items.length - 1 ? styles.lineBodyWrapWithDivider : null]}>
                              <View style={styles.lineBodyContent}>
                                <View style={styles.lineDetailColumn}>
                                  <View style={styles.lineHeaderRow}>
                                    <View style={styles.lineCopy}>
                                      <Text style={styles.itemTitle}>{item.itemName}</Text>
                                      <Text style={styles.itemBody}>{`${customizationSummary} • ${formatUsd(item.unitPriceCents)} each`}</Text>
                                      {notes ? <Text style={styles.itemNoteText}>{notes}</Text> : null}
                                    </View>

                                    <View style={styles.linePriceBlock}>
                                      <Text style={styles.linePriceValue}>{formatUsd(item.lineTotalCents)}</Text>
                                    </View>
                                  </View>

                                  <View style={styles.lineFooter}>
                                    <RowQuantityControl
                                      quantity={item.quantity}
                                      canDecrease={item.quantity > 1}
                                      onDecrease={() => {
                                        if (item.quantity <= 1) {
                                          return;
                                        }
                                        setQuantity(item.lineId, item.quantity - 1);
                                      }}
                                      onIncrease={() => setQuantity(item.lineId, item.quantity + 1)}
                                      onRemove={() => setPendingRemovalLineId(item.lineId)}
                                    />
                                  </View>
                                </View>
                              </View>
                            </View>
                          </View>
                        </View>
                      </View>
                    );
                  })}
                </View>
              </View>

              {checkoutUnavailableMessage ? <StatusBanner message={checkoutUnavailableMessage} tone="warning" /> : null}
              {statusMessage ? <StatusBanner message={statusMessage} tone={retryableOrder ? "warning" : "info"} /> : null}

              <View style={styles.checkoutDeck}>
                {storeConfig ? (
                  <View style={styles.pickupMethodBlock}>
                    <Text style={styles.pickupMethodLabel}>Pickup method</Text>
                    <View style={styles.pickupMethodRow}>
                      <Text style={styles.pickupMethodName}>Counter pickup</Text>
                      <Text style={styles.pickupMethodEta}>{`${storeConfig.prepEtaMinutes} min`}</Text>
                    </View>
                    <Text style={styles.pickupMethodBody}>{storeConfig.pickupInstructions}</Text>
                  </View>
                ) : null}

                <SectionHeading eyebrow="Checkout" title="Pay" />
                <View style={styles.checkoutContent}>
                  <View style={styles.deckDivider} />

                  <View style={styles.summaryWrap}>
                    <SummaryRow label={`Items (${itemCount})`} value={formatUsd(pricingSummary.subtotalCents)} />
                    {storeConfig ? (
                      <>
                        <SummaryRow
                          label={`Tax (${(storeConfig.taxRateBasisPoints / 100).toFixed(2)}%)`}
                          value={formatUsd(pricingSummary.taxCents)}
                        />
                        <View style={styles.summaryDivider} />
                        <SummaryRow label="Total due today" value={formatUsd(pricingSummary.totalCents)} emphasized />
                      </>
                    ) : (
                      <Text style={styles.summaryNote}>Reconnect store details to load live tax, pickup timing, and checkout totals.</Text>
                    )}
                  </View>

                  {isAuthenticated && checkoutReady ? (
                    <>
                      <View style={styles.deckDivider} />

                      {nativeApplePayAvailable ? (
                        <View style={styles.paymentStatusRow}>
                          <View style={styles.paymentStatusIconWrap}>
                            <Ionicons name="logo-apple" size={16} color={uiPalette.text} />
                          </View>
                          <View style={styles.paymentStatusCopy}>
                            <Text style={styles.paymentStatusTitle}>Apple Pay ready</Text>
                            <Text style={styles.paymentStatusBody}>Use the footer to confirm payment when you are ready.</Text>
                          </View>
                        </View>
                      ) : cardEntryAvailable ? (
                        <View style={styles.paymentStatusRow}>
                          <View style={styles.paymentStatusIconWrap}>
                            <Ionicons name="card-outline" size={16} color={uiPalette.text} />
                          </View>
                          <View style={styles.paymentStatusCopy}>
                            <Text style={styles.paymentStatusTitle}>Card entry ready</Text>
                            <Text style={styles.paymentStatusBody}>Enter a test card below to tokenize it with Clover and complete checkout.</Text>
                          </View>
                        </View>
                      ) : null}

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
                          <View style={styles.devActions}>
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

                      {cardEntryAvailable ? (
                        <View style={styles.devSection}>
                          <Text style={styles.devEyebrow}>Card checkout</Text>
                          <Text style={styles.paymentStatusBody}>
                            Card details are sent directly to Clover for tokenization before your order is paid.
                          </Text>
                          <TextInput
                            value={cardNumber}
                            onChangeText={setCardNumber}
                            autoCapitalize="none"
                            autoCorrect={false}
                            keyboardType="number-pad"
                            placeholder="Card number"
                            placeholderTextColor={uiPalette.textMuted}
                            style={[styles.tokenInput, styles.cardInput]}
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
                          <View style={styles.devActions}>
                            <Button
                              label={cardCheckoutPending || checkoutMutation.isPending ? "Processing…" : "Pay with card"}
                              variant="secondary"
                              disabled={
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
                      ) : null}
                    </>
                  ) : isAuthenticated ? (
                    <>
                      <View style={styles.deckDivider} />

                      <View style={styles.paymentStatusRow}>
                        <View style={styles.paymentStatusIconWrap}>
                          <Ionicons name="refresh-outline" size={16} color={uiPalette.warning} />
                        </View>
                        <View style={styles.paymentStatusCopy}>
                          <Text style={styles.paymentStatusTitle}>Checkout needs a refresh</Text>
                          <Text style={styles.paymentStatusBody}>Use the retry action in the header to restore live pricing and payment options.</Text>
                        </View>
                      </View>
                    </>
                  ) : null}
                </View>
              </View>
            </>
          )}
        </ScrollView>

        {items.length > 0 ? (
          <View pointerEvents="box-none" style={[styles.stickyFooterWrap, { bottom: stickyFooterBottom }]}>
            <StickyActionPill
              label={stickyActionLabel}
              value={stickyActionValue}
              icon={stickyActionIcon}
              disabled={stickyActionDisabled}
              onPress={() => {
                if (isAuthenticated) {
                  void handleNativeApplePayCheckout();
                  return;
                }

                router.push({ pathname: "/auth", params: { returnTo: "cart" } });
              }}
            />
          </View>
        ) : null}

        <ClearCartSheet
          open={clearSheetOpen}
          itemCount={itemCount}
          bottomInset={Math.max(insets.bottom, 14)}
          onClose={() => setClearSheetOpen(false)}
          onCancel={() => setClearSheetOpen(false)}
          onConfirm={resetCartState}
        />

        <RemoveItemSheet
          open={pendingRemovalItem !== null}
          itemName={pendingRemovalItem?.itemName}
          bottomInset={Math.max(insets.bottom, 14)}
          onClose={() => setPendingRemovalLineId(null)}
          onCancel={() => setPendingRemovalLineId(null)}
          onConfirm={() => {
            if (!pendingRemovalItem) return;
            removeItem(pendingRemovalItem.lineId);
            setPendingRemovalLineId(null);
          }}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "transparent"
  },
  sheet: {
    flex: 1,
    backgroundColor: "rgba(247, 244, 237, 0.985)",
    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,
    borderWidth: 1,
    borderColor: uiPalette.border
  },
  handleWrap: {
    position: "absolute",
    top: 14,
    left: 0,
    right: 0,
    alignItems: "center",
    zIndex: 10
  },
  modalHandle: {
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
  emptyScrollContent: {
    flexGrow: 1,
    justifyContent: "center"
  },
  emptyPage: {
    alignItems: "center"
  },
  emptyEyebrow: {
    fontSize: 11,
    lineHeight: 14,
    textTransform: "uppercase",
    letterSpacing: 1.15,
    color: uiPalette.textMuted,
    fontWeight: "700",
    textAlign: "center"
  },
  emptyTitle: {
    marginTop: 6,
    fontSize: 16,
    lineHeight: 22,
    color: uiPalette.text,
    fontWeight: "600",
    textAlign: "center"
  },
  emptyBody: {
    marginTop: 8,
    fontSize: 14,
    lineHeight: 22,
    color: uiPalette.textSecondary,
    maxWidth: 340,
    textAlign: "center"
  },
  banner: {
    marginTop: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 18,
    backgroundColor: uiPalette.surfaceMuted,
    borderWidth: 1,
    borderColor: uiPalette.border,
    flexDirection: "row",
    alignItems: "center",
    gap: 10
  },
  bannerWarning: {
    backgroundColor: "rgba(176, 122, 58, 0.08)",
    borderColor: "rgba(176, 122, 58, 0.18)"
  },
  bannerText: {
    flex: 1,
    fontSize: 13,
    lineHeight: 19,
    color: uiPalette.textSecondary
  },
  bannerTextWarning: {
    color: uiPalette.text
  },
  sectionBlock: {
    marginTop: 4
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
    gap: 12
  },
  sectionCopy: {
    flex: 1
  },
  sectionEyebrow: {
    fontSize: 11,
    lineHeight: 14,
    textTransform: "uppercase",
    letterSpacing: 1.15,
    color: uiPalette.textMuted,
    fontWeight: "700"
  },
  sectionTitle: {
    marginTop: 4,
    fontSize: 20,
    lineHeight: 24,
    fontWeight: "700",
    color: uiPalette.text,
    letterSpacing: -0.3,
    fontFamily: uiTypography.displayFamily
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
  },
  lineStack: {
    marginTop: 16
  },
  lineCard: {
    paddingHorizontal: 0,
    minHeight: 132,
    borderRadius: 0
  },
  lineTopRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
    width: "100%"
  },
  itemIconWrap: {
    width: 88,
    height: 132,
    alignItems: "center",
    justifyContent: "center"
  },
  itemArtwork: {
    width: "100%",
    height: "100%"
  },
  lineBodyWrap: {
    flex: 1,
    minWidth: 0,
    minHeight: 132,
    justifyContent: "center"
  },
  lineBodyWrapWithDivider: {
    borderBottomWidth: 1,
    borderBottomColor: uiPalette.border
  },
  lineBodyContent: {
    minHeight: 132,
    justifyContent: "center",
    paddingVertical: 10
  },
  lineDetailColumn: {
    flex: 1,
    minHeight: 112,
    justifyContent: "space-between"
  },
  lineHeaderRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12
  },
  lineCopy: {
    flex: 1
  },
  itemTitle: {
    fontSize: 16,
    lineHeight: 20,
    letterSpacing: 1.3,
    textTransform: "uppercase",
    color: uiPalette.text,
    fontFamily: uiTypography.displayFamily,
    fontWeight: "500"
  },
  itemBody: {
    marginTop: 2,
    fontSize: 12,
    lineHeight: 14,
    color: uiPalette.textSecondary
  },
  itemNoteText: {
    marginTop: 4,
    fontSize: 12,
    lineHeight: 17,
    color: uiPalette.textMuted
  },
  linePriceBlock: {
    alignItems: "flex-end"
  },
  linePriceLabel: {
    fontSize: 10,
    lineHeight: 12,
    textTransform: "uppercase",
    letterSpacing: 1,
    color: uiPalette.textMuted,
    fontWeight: "700"
  },
  linePriceValue: {
    fontSize: 14,
    lineHeight: 20,
    letterSpacing: 1.4,
    textTransform: "uppercase",
    color: uiPalette.text,
    fontFamily: uiTypography.displayFamily,
    fontWeight: "400"
  },
  lineFooter: {
    marginTop: 10,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end"
  },
  stepperShell: {
    height: 40,
    borderRadius: 999,
    overflow: "hidden"
  },
  stepperInner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 8,
    height: 40,
    borderRadius: 999
  },
  stepperInnerGlass: {
    backgroundColor: "rgba(255, 255, 255, 0.01)",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.11)"
  },
  stepperInnerFallback: {
    borderRadius: 999,
    backgroundColor: uiPalette.surfaceStrong,
    borderWidth: 1,
    borderColor: uiPalette.border
  },
  stepperButton: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: uiPalette.surfaceMuted
  },
  stepperButtonGlass: {
    backgroundColor: "rgba(255, 255, 255, 0.18)"
  },
  stepperButtonDisabled: {
    opacity: 0.55
  },
  stepperValue: {
    minWidth: 16,
    fontSize: 15,
    lineHeight: 18,
    fontWeight: "700",
    textAlign: "center",
    color: uiPalette.text
  },
  stepperDivider: {
    width: 1,
    height: 24,
    marginHorizontal: 3,
    borderRadius: 999,
    backgroundColor: "rgba(23, 21, 19, 0.20)"
  },
  stepperDividerGlass: {
    backgroundColor: "rgba(23, 21, 19, 0.18)"
  },
  checkoutDeck: {
    marginTop: 18,
    paddingTop: 2
  },
  pickupMethodBlock: {
    marginBottom: 18
  },
  checkoutContent: {
    marginTop: 16
  },
  pickupMethodLabel: {
    fontSize: 11,
    lineHeight: 14,
    textTransform: "uppercase",
    letterSpacing: 1.1,
    color: uiPalette.textMuted,
    fontWeight: "700"
  },
  pickupMethodRow: {
    marginTop: 8,
    flexDirection: "row",
    alignItems: "baseline",
    justifyContent: "space-between",
    gap: 12
  },
  pickupMethodName: {
    fontSize: 16,
    lineHeight: 20,
    fontWeight: "600",
    color: uiPalette.text,
    fontFamily: uiTypography.displayFamily
  },
  pickupMethodEta: {
    fontSize: 13,
    lineHeight: 17,
    color: uiPalette.textMuted,
    fontWeight: "600"
  },
  pickupMethodBody: {
    marginTop: 8,
    fontSize: 13,
    lineHeight: 20,
    color: uiPalette.textSecondary
  },
  deckDivider: {
    height: 1,
    marginVertical: 18,
    backgroundColor: "rgba(23, 21, 19, 0.08)"
  },
  summaryWrap: {
    gap: 10
  },
  summaryRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 12
  },
  summaryText: {
    fontSize: 14,
    lineHeight: 22,
    color: uiPalette.textSecondary
  },
  summaryStrong: {
    fontWeight: "700",
    color: uiPalette.text
  },
  summaryDivider: {
    height: 1,
    backgroundColor: "rgba(23, 21, 19, 0.08)"
  },
  summaryNote: {
    marginTop: 6,
    fontSize: 13,
    lineHeight: 19,
    color: uiPalette.textSecondary
  },
  paymentStatusRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12
  },
  paymentStatusIconWrap: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.56)",
    borderWidth: 1,
    borderColor: uiPalette.border
  },
  paymentStatusCopy: {
    flex: 1
  },
  paymentStatusTitle: {
    fontSize: 15,
    lineHeight: 18,
    fontWeight: "700",
    color: uiPalette.text,
    fontFamily: uiTypography.displayFamily
  },
  paymentStatusBody: {
    marginTop: 4,
    fontSize: 13,
    lineHeight: 19,
    color: uiPalette.textSecondary
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
  },
  tokenInput: {
    minHeight: 52,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: uiPalette.border,
    backgroundColor: uiPalette.surfaceStrong,
    paddingHorizontal: 14,
    color: uiPalette.text
  },
  cardInput: {
    marginTop: 10
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
  devActions: {
    marginTop: 10,
    flexDirection: "row",
    gap: 10
  },
  stickyFooterWrap: {
    position: "absolute",
    left: 18,
    right: 18
  },
  stickyPillShell: {
    minHeight: 60,
    borderRadius: 999,
    overflow: "hidden",
    shadowColor: "#000000",
    shadowOpacity: 0.09,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 6
  },
  stickyPillPressed: {
    opacity: 0.9
  },
  stickyPillFrame: {
    minHeight: 60,
    borderRadius: 999,
    overflow: "hidden"
  },
  stickyPillInner: {
    minHeight: 60,
    paddingHorizontal: 18,
    borderRadius: 999,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "rgba(255,255,255,0.01)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)"
  },
  stickyPillInnerDisabled: {
    backgroundColor: "rgba(255,255,255,0.02)"
  },
  stickyPillLead: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    flexShrink: 1
  },
  stickyPillLabel: {
    fontSize: 15,
    lineHeight: 18,
    fontWeight: "600",
    color: uiPalette.text
  },
  stickyPillLabelDisabled: {
    color: uiPalette.textMuted
  },
  stickyPillValue: {
    fontSize: 16,
    lineHeight: 20,
    fontWeight: "700",
    color: uiPalette.text,
    fontFamily: uiTypography.displayFamily
  },
  stickyPillValueDisabled: {
    color: uiPalette.textMuted
  }
});
