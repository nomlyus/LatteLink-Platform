import { canUseLiquidGlass } from "../ui/glass";
import { BlurView } from "expo-blur";
import { GlassView } from "expo-glass-effect";
import { Platform, StyleSheet, Text, View } from "react-native";
import { uiPalette, uiTypography } from "../ui/system";

export function PickupCodePill({ code }: { code: string }) {
  const useLiquidGlass = canUseLiquidGlass();

  return (
    <View style={styles.pickupCodePillShell}>
      {useLiquidGlass ? (
        <GlassView glassEffectStyle="regular" colorScheme="auto" isInteractive style={styles.pickupCodePillFrame} />
      ) : (
        <BlurView tint="light" intensity={Platform.OS === "ios" ? 24 : 20} style={styles.pickupCodePillFrame} />
      )}
      <View pointerEvents="none" style={styles.pickupCodePillContent}>
        <Text allowFontScaling={false} maxFontSizeMultiplier={1} style={styles.pickupCodePillText}>
          {code}
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
  value: string;
  emphasized?: boolean;
}) {
  return (
    <View style={styles.summaryRow}>
      <Text allowFontScaling={false} maxFontSizeMultiplier={1} style={styles.summaryLabel}>
        {label}
      </Text>
      <Text
        allowFontScaling={false}
        maxFontSizeMultiplier={1}
        style={[styles.summaryValue, emphasized ? styles.summaryValueStrong : null]}
      >
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pickupCodePillShell: {
    position: "relative",
    alignSelf: "flex-start",
    borderRadius: 999,
    overflow: "hidden"
  },
  pickupCodePillFrame: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 999,
    overflow: "hidden"
  },
  pickupCodePillContent: {
    paddingHorizontal: 16,
    paddingVertical: 9,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center"
  },
  pickupCodePillText: {
    fontSize: 16,
    lineHeight: 20,
    letterSpacing: 1.3,
    color: uiPalette.text,
    fontFamily: uiTypography.displayFamily,
    fontWeight: "600"
  },
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
