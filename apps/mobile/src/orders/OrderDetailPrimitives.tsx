import { canUseLiquidGlass } from "../ui/glass";
import { BlurView } from "expo-blur";
import { GlassView } from "expo-glass-effect";
import { Platform, StyleSheet, Text, View } from "react-native";
import { type OrderHistoryEntry } from "../account/data";
import { formatOrderStatus } from "./history";
import { uiPalette, uiTypography } from "../ui/system";

export function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.detailRow}>
      <Text allowFontScaling={false} maxFontSizeMultiplier={1} style={styles.detailLabel}>
        {label}
      </Text>
      <Text allowFontScaling={false} maxFontSizeMultiplier={1} style={styles.detailValue}>
        {value}
      </Text>
    </View>
  );
}

export function StatusBadge({ status }: { status: OrderHistoryEntry["status"] }) {
  const useLiquidGlass = canUseLiquidGlass();

  return (
    <View style={styles.statusBadgeShell}>
      {useLiquidGlass ? (
        <GlassView glassEffectStyle="regular" colorScheme="auto" isInteractive style={styles.statusBadgeFrame} />
      ) : (
        <BlurView tint="light" intensity={Platform.OS === "ios" ? 24 : 20} style={styles.statusBadgeFrame} />
      )}
      <View pointerEvents="none" style={styles.statusBadgeContent}>
        <Text
          allowFontScaling={false}
          maxFontSizeMultiplier={1}
          style={[styles.statusBadgeText, styles.statusBadgeTextGlass]}
        >
          {formatOrderStatus(status)}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  statusBadgeShell: {
    position: "relative",
    alignSelf: "flex-start",
    borderRadius: 999,
    overflow: "hidden"
  },
  statusBadgeFrame: {
    ...StyleSheet.absoluteFill,
    borderRadius: 999,
    overflow: "hidden"
  },
  statusBadgeContent: {
    paddingHorizontal: 11,
    paddingVertical: 7,
    borderRadius: 999
  },
  statusBadgeText: {
    fontSize: 11,
    lineHeight: 14,
    letterSpacing: 1,
    textTransform: "uppercase",
    fontWeight: "700"
  },
  statusBadgeTextGlass: {
    color: uiPalette.text
  },
  detailRow: {
    marginTop: 10,
    flexDirection: "row",
    alignItems: "baseline",
    justifyContent: "space-between",
    gap: 18
  },
  detailLabel: {
    fontSize: 14,
    lineHeight: 20,
    color: uiPalette.textSecondary
  },
  detailValue: {
    flexShrink: 1,
    textAlign: "right",
    fontSize: 14,
    lineHeight: 20,
    color: uiPalette.text,
    fontFamily: uiTypography.displayFamily,
    fontWeight: "600"
  }
});
