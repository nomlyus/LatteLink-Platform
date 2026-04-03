import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { GlassActionPill } from "../src/cart/GlassActionPill";
import { useCancelOrderMutation } from "../src/account/data";
import { useCheckoutFlow } from "../src/orders/flow";
import { formatOrderDateTime } from "../src/orders/history";
import { Button, uiPalette, uiTypography } from "../src/ui/system";

function DetailRow({
  label,
  value,
  strong = false,
  mono = false
}: {
  label: string;
  value: string;
  strong?: boolean;
  mono?: boolean;
}) {
  return (
    <View style={styles.detailRow}>
      <Text style={styles.detailLabel}>{label}</Text>
      <Text style={[styles.detailValue, strong ? styles.detailValueStrong : null, mono ? styles.detailValueMono : null]}>
        {value}
      </Text>
    </View>
  );
}

function formatFailureStage(stage?: "quote" | "create" | "pay") {
  switch (stage) {
    case "quote":
      return "Reviewing your cart";
    case "create":
      return "Creating your order";
    case "pay":
      return "Processing payment";
    default:
      return "Checkout";
  }
}

function formatUsd(amountCents: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD"
  }).format(amountCents / 100);
}

export default function CheckoutFailureScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { failure, retryOrder, clearFailure, clearRetryOrder } = useCheckoutFlow();
  const cancelOrderMutation = useCancelOrderMutation();
  const [cancelError, setCancelError] = useState<string | null>(null);

  const createdButUnpaid = failure?.stage === "pay" && failure.order;
  const title = createdButUnpaid ? "Payment Didn’t Finish" : "Payment Didn’t Go Through";
  const body = createdButUnpaid
    ? "Your order is still open. You can retry the payment without creating a duplicate order."
    : "Nothing was charged. Return to your cart, check the order, and try again when you’re ready.";
  const updatedAt = failure ? formatOrderDateTime(failure.occurredAt) : "Just now";

  function returnToCart() {
    clearFailure();
    router.replace("/cart");
  }

  function goToOrders() {
    clearFailure();
    router.dismissTo("/(tabs)/orders");
  }

  function goToMenu() {
    clearFailure();
    router.dismissTo("/(tabs)/menu");
  }

  async function cancelOpenOrder() {
    if (!createdButUnpaid || cancelOrderMutation.isPending) {
      return;
    }

    try {
      setCancelError(null);
      await cancelOrderMutation.mutateAsync({
        orderId: createdButUnpaid.id,
        reason: "Customer canceled unpaid order after payment failure"
      });
      clearRetryOrder();
      clearFailure();
      router.dismissTo("/(tabs)/orders");
    } catch (error) {
      setCancelError(error instanceof Error ? error.message : "Unable to cancel the open order.");
    }
  }

  return (
    <View style={styles.screen}>
      <View style={styles.content}>
        <View style={styles.mainContent}>
          <View style={styles.sheetLead}>
            <View style={styles.handle} />
          </View>

          <View style={styles.heroBlock}>
            <View style={styles.heroTopRow}>
              <Text style={styles.title}>{title}</Text>
              <View style={styles.heroIconWrap}>
                <Ionicons name="alert-circle-outline" size={22} color={uiPalette.danger} />
              </View>
            </View>
            <Text style={styles.body}>{body}</Text>
          </View>

          <View style={styles.detailsSection}>
            <DetailRow label="Stopped at" value={formatFailureStage(failure?.stage)} />
            {failure?.order ? <DetailRow label="Pickup code" value={failure.order.pickupCode} strong mono /> : null}
            {failure?.order ? <DetailRow label="Order total" value={formatUsd(failure.order.total.amountCents)} strong /> : null}
            <DetailRow label="Updated" value={updatedAt} />

            {failure?.message ? (
              <View style={styles.messageBlock}>
                <Text style={styles.messageLabel}>What happened</Text>
                <Text style={styles.messageText}>{failure.message}</Text>
              </View>
            ) : null}

            {cancelError ? (
              <View style={styles.messageBlock}>
                <Text style={styles.messageLabel}>Cancel failed</Text>
                <Text style={styles.messageText}>{cancelError}</Text>
              </View>
            ) : null}
          </View>
        </View>

        <View style={[styles.footerContent, { paddingBottom: Math.max(insets.bottom, 12) }]}>
          <GlassActionPill label={retryOrder ? "Retry Payment" : "Return to Cart"} onPress={returnToCart} tone="dark" />
          <GlassActionPill label={createdButUnpaid ? "View Orders" : "Back to Menu"} onPress={createdButUnpaid ? goToOrders : goToMenu} />
          {createdButUnpaid ? (
            <Button
              label={cancelOrderMutation.isPending ? "Canceling open order…" : "Cancel Open Order"}
              onPress={() => {
                void cancelOpenOrder();
              }}
              disabled={cancelOrderMutation.isPending}
              variant="secondary"
            />
          ) : null}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: uiPalette.surfaceStrong
  },
  content: {
    flex: 1,
    paddingHorizontal: 20,
    paddingTop: 18,
    justifyContent: "space-between"
  },
  mainContent: {
    flex: 1
  },
  sheetLead: {
    paddingTop: 10,
    paddingBottom: 24
  },
  handle: {
    alignSelf: "center",
    width: 46,
    height: 5,
    borderRadius: 999,
    backgroundColor: "rgba(23, 21, 19, 0.16)"
  },
  heroBlock: {
    paddingBottom: 18,
    borderBottomWidth: 1,
    borderBottomColor: uiPalette.border
  },
  heroTopRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 16
  },
  heroIconWrap: {
    width: 42,
    height: 42,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(180, 91, 79, 0.10)"
  },
  title: {
    flex: 1,
    fontSize: 19,
    lineHeight: 24,
    letterSpacing: 2,
    textTransform: "uppercase",
    color: uiPalette.text,
    fontFamily: uiTypography.displayFamily,
    fontWeight: "600"
  },
  body: {
    marginTop: 8,
    maxWidth: 520,
    fontSize: 15,
    lineHeight: 22,
    color: uiPalette.textSecondary,
    fontFamily: uiTypography.bodyFamily
  },
  detailsSection: {
    flex: 1,
    justifyContent: "center",
    paddingTop: 18
  },
  detailRow: {
    flexDirection: "row",
    alignItems: "baseline",
    justifyContent: "space-between",
    gap: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: uiPalette.border
  },
  detailLabel: {
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.8,
    textTransform: "uppercase",
    color: uiPalette.textMuted,
    fontFamily: uiTypography.bodyFamily
  },
  detailValue: {
    flex: 1,
    textAlign: "right",
    fontSize: 16,
    lineHeight: 20,
    color: uiPalette.text,
    fontFamily: uiTypography.bodyFamily
  },
  detailValueStrong: {
    fontWeight: "600"
  },
  detailValueMono: {
    letterSpacing: 1.4,
    fontFamily: uiTypography.monoFamily
  },
  messageBlock: {
    paddingTop: 18,
    gap: 8
  },
  messageLabel: {
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.8,
    textTransform: "uppercase",
    color: uiPalette.textMuted,
    fontFamily: uiTypography.bodyFamily
  },
  messageText: {
    fontSize: 14,
    lineHeight: 22,
    color: uiPalette.textSecondary,
    fontFamily: uiTypography.bodyFamily
  },
  footerContent: {
    gap: 12,
    paddingTop: 24
  }
});
