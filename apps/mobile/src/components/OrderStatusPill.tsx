import { BlurView } from "expo-blur";
import { GlassView, isLiquidGlassAvailable } from "expo-glass-effect";
import { Platform, StyleSheet, Text, View } from "react-native";
import { formatOrderStatus } from "../orders/history";
import { uiPalette } from "../ui/system";

type OrderStatusPillProps = {
  status: string;
  glassStyle?: "regular" | "clear";
};

function canUseLiquidGlassStatusPill() {
  if (Platform.OS !== "ios") return false;

  try {
    return isLiquidGlassAvailable();
  } catch {
    return false;
  }
}

function getStatusTone(status: string) {
  switch (status) {
    case "PENDING_PAYMENT":
      return {
        backgroundColor: "rgba(164, 108, 44, 0.08)",
        borderColor: "rgba(164, 108, 44, 0.18)",
        textColor: uiPalette.warning
      };
    case "READY":
      return {
        backgroundColor: "rgba(79, 122, 99, 0.1)",
        borderColor: "rgba(79, 122, 99, 0.22)",
        textColor: uiPalette.success
      };
    case "CANCELED":
      return {
        backgroundColor: "rgba(180, 91, 79, 0.08)",
        borderColor: "rgba(180, 91, 79, 0.18)",
        textColor: uiPalette.danger
      };
    case "COMPLETED":
      return {
        backgroundColor: "rgba(23, 21, 19, 0.05)",
        borderColor: "rgba(23, 21, 19, 0.1)",
        textColor: uiPalette.textSecondary
      };
    case "PAID":
    case "IN_PREP":
    default:
      return {
        backgroundColor: uiPalette.accentSoft,
        borderColor: "rgba(30, 27, 24, 0.1)",
        textColor: uiPalette.accent
      };
  }
}

export function OrderStatusPill({
  status,
  glassStyle = "regular"
}: OrderStatusPillProps) {
  const tone = getStatusTone(status);
  const label = formatOrderStatus(status);
  const shouldUseGlassPill =
    status === "PAID" ||
    status === "IN_PREP" ||
    status === "READY" ||
    status === "COMPLETED" ||
    status === "CANCELED";

  if (shouldUseGlassPill) {
    const useLiquidGlass = canUseLiquidGlassStatusPill();

    return (
      <View style={styles.statusPillShell}>
        {useLiquidGlass ? (
          <GlassView glassEffectStyle={glassStyle} colorScheme="auto" isInteractive style={styles.statusPillFrame} />
        ) : (
          <BlurView tint="light" intensity={Platform.OS === "ios" ? 24 : 20} style={styles.statusPillFrame} />
        )}
        <View pointerEvents="none" style={styles.statusPillContent}>
          <Text style={[styles.statusPillText, styles.statusPillTextGlass]}>{label}</Text>
        </View>
      </View>
    );
  }

  return (
    <View
      style={[
        styles.statusPill,
        {
          backgroundColor: tone.backgroundColor,
          borderColor: tone.borderColor
        }
      ]}
    >
      <Text style={[styles.statusPillText, { color: tone.textColor }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  statusPill: {
    paddingHorizontal: 11,
    paddingVertical: 7,
    borderRadius: 999,
    borderWidth: 1
  },
  statusPillShell: {
    position: "relative",
    alignSelf: "flex-start",
    borderRadius: 999,
    overflow: "hidden"
  },
  statusPillFrame: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 999,
    overflow: "hidden"
  },
  statusPillContent: {
    paddingHorizontal: 11,
    paddingVertical: 7,
    borderRadius: 999
  },
  statusPillText: {
    fontSize: 11,
    lineHeight: 14,
    letterSpacing: 1,
    textTransform: "uppercase",
    fontWeight: "700"
  },
  statusPillTextGlass: {
    color: uiPalette.text
  }
});
