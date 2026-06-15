import { BlurView } from "expo-blur";
import { GlassView, isLiquidGlassAvailable } from "expo-glass-effect";
import { Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { uiPalette } from "../ui/system";

function canUseLiquidGlass() {
  if (Platform.OS !== "ios") return false;

  try {
    return isLiquidGlassAvailable();
  } catch {
    return false;
  }
}

type GlassActionPillProps = {
  label: string;
  onPress: () => void;
  tone?: "default" | "danger" | "dark";
  disabled?: boolean;
};

export function GlassActionPill({ label, onPress, tone = "default", disabled = false }: GlassActionPillProps) {
  const useLiquidGlass = canUseLiquidGlass();
  const useDarkTone = tone === "dark";
  const glassTintColor = useDarkTone ? "rgba(30, 27, 24, 0.9)" : undefined;

  const content = (
    <View
      style={[
        styles.actionPillInner,
        useLiquidGlass
          ? useDarkTone
            ? styles.actionPillInnerGlassNative
            : styles.actionPillInnerGlass
          : useDarkTone
            ? styles.actionPillInnerFallbackDark
            : styles.actionPillInnerFallback,
        tone === "danger" ? styles.actionPillInnerDanger : null
      ]}
    >
      <Text allowFontScaling={false} maxFontSizeMultiplier={1}
        style={[
          styles.actionPillText,
          tone === "danger" ? styles.actionPillTextDanger : null,
          useDarkTone ? styles.actionPillTextDark : null
        ]}
      >
        {label}
      </Text>
    </View>
  );

  return (
    <Pressable disabled={disabled} onPress={onPress} style={({ pressed }) => [styles.actionPillShell, pressed && !disabled ? styles.actionPillPressed : null, disabled ? styles.actionPillDisabled : null]}>
      {useLiquidGlass ? (
        <GlassView
          glassEffectStyle="regular"
          colorScheme={useDarkTone ? "dark" : "auto"}
          tintColor={glassTintColor}
          isInteractive
          style={styles.actionPillFrame}
        >
          {content}
        </GlassView>
      ) : (
        <BlurView tint={useDarkTone ? "dark" : "light"} intensity={Platform.OS === "ios" ? 24 : 20} style={styles.actionPillFrame}>
          {content}
        </BlurView>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  actionPillShell: {
    minHeight: 58,
    borderRadius: 999,
    overflow: "hidden",
    shadowColor: "#000000",
    shadowOpacity: 0.08,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 5
  },
  actionPillPressed: {
    opacity: 0.9
  },
  actionPillFrame: {
    minHeight: 58,
    borderRadius: 999,
    overflow: "hidden"
  },
  actionPillInner: {
    minHeight: 58,
    paddingHorizontal: 20,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1
  },
  actionPillInnerGlass: {
    backgroundColor: "rgba(255,255,255,0.01)",
    borderColor: "rgba(255,255,255,0.12)"
  },
  actionPillInnerGlassNative: {
    backgroundColor: "transparent",
    borderColor: "transparent"
  },
  actionPillInnerFallback: {
    backgroundColor: "rgba(255,255,255,0.36)",
    borderColor: "rgba(255,255,255,0.28)"
  },
  actionPillInnerFallbackDark: {
    backgroundColor: "rgba(30, 27, 24, 0.74)",
    borderColor: "rgba(255,255,255,0.10)"
  },
  actionPillInnerDanger: {
    backgroundColor: "rgba(180, 91, 79, 0.10)",
    borderColor: "rgba(180, 91, 79, 0.18)"
  },
  actionPillText: {
    fontSize: 15,
    lineHeight: 18,
    fontWeight: "600",
    color: uiPalette.text
  },
  actionPillTextDark: {
    color: uiPalette.primaryText
  },
  actionPillTextDanger: {
    color: uiPalette.danger
  },
  actionPillDisabled: {
    opacity: 0.45
  }
});
