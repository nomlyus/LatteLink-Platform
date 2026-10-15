import { canUseLiquidGlass } from "../ui/glass";
import { type ReactNode } from "react";
import { BlurView } from "expo-blur";
import { GlassView } from "expo-glass-effect";
import { Platform, StyleSheet, Text, View } from "react-native";
import type { OrderHistoryEntry } from "../account/data";
import { formatOrderStatus } from "./history";
import { uiPalette, uiTypography } from "../ui/system";

export function SummaryStatusPill({ status }: { status: OrderHistoryEntry["status"] }) {
  const label = formatOrderStatus(status);
  const useLiquidGlass = canUseLiquidGlass();

  return (
    <View style={styles.statusPillShell}>
      {useLiquidGlass ? (
        <GlassView glassEffectStyle="regular" colorScheme="auto" isInteractive style={styles.statusPillFrame} />
      ) : (
        <BlurView tint="light" intensity={Platform.OS === "ios" ? 24 : 20} style={styles.statusPillFrame} />
      )}
      <View pointerEvents="none" style={styles.statusPillContent}>
        <Text allowFontScaling={false} maxFontSizeMultiplier={1} style={styles.statusPillText}>
          {label}
        </Text>
      </View>
    </View>
  );
}

export function SummaryRow({
  label,
  value,
  emphasized = false
}: {
  label: string;
  value: ReactNode;
  emphasized?: boolean;
}) {
  return (
    <View style={styles.summaryRow}>
      <Text allowFontScaling={false} maxFontSizeMultiplier={1} style={styles.summaryLabel}>
        {label}
      </Text>
      {typeof value === "string" ? (
        <Text
          allowFontScaling={false}
          maxFontSizeMultiplier={1}
          style={[styles.summaryValue, emphasized ? styles.summaryValueStrong : null]}
        >
          {value}
        </Text>
      ) : (
        value
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  summaryRow: {
    paddingVertical: 13,
    borderBottomWidth: 1,
    borderBottomColor: uiPalette.border,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 16
  },
  summaryLabel: {
    fontSize: 14,
    lineHeight: 20,
    color: uiPalette.textSecondary
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
    fontWeight: "700",
    color: uiPalette.text
  },
  summaryValue: {
    flexShrink: 1,
    fontSize: 14,
    lineHeight: 20,
    color: uiPalette.text,
    textAlign: "right"
  },
  summaryValueStrong: {
    fontFamily: uiTypography.displayFamily,
    fontWeight: "600",
    letterSpacing: 1,
    textTransform: "uppercase"
  }
});
