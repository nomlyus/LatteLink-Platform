import { canUseLiquidGlass } from "../ui/glass";
import { Ionicons } from "@expo/vector-icons";
import { BlurView } from "expo-blur";
import { GlassView } from "expo-glass-effect";
import { Platform, Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native";
import type { ReactNode } from "react";
import { uiPalette } from "../ui/system";

export function FooterPill({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const useLiquidGlass = canUseLiquidGlass();
  const content = (
    <View
      style={[styles.footerPillInner, useLiquidGlass ? styles.footerPillInnerGlass : styles.footerPillInnerFallback]}
    >
      {children}
    </View>
  );
  return (
    <View style={[styles.footerPillShell, style]}>
      {useLiquidGlass ? (
        <GlassView glassEffectStyle="regular" colorScheme="auto" isInteractive style={styles.footerPillFrame}>
          {content}
        </GlassView>
      ) : (
        <BlurView tint="light" intensity={Platform.OS === "ios" ? 24 : 20} style={styles.footerPillFrame}>
          {content}
        </BlurView>
      )}
    </View>
  );
}

export function FooterQuantityPill({
  quantity,
  onDecrease,
  onIncrease,
  canDecrease,
  canIncrease,
  style
}: {
  quantity: number;
  onDecrease: () => void;
  onIncrease: () => void;
  canDecrease: boolean;
  canIncrease: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const useLiquidGlass = canUseLiquidGlass();
  return (
    <View style={[styles.footerQuantityShell, style]}>
      <View pointerEvents="box-none" style={styles.footerQuantityMergeLayer}>
        {useLiquidGlass ? (
          <>
            <GlassView
              glassEffectStyle="regular"
              colorScheme="auto"
              isInteractive
              style={styles.footerQuantityBaseGlass}
            >
              <View style={styles.footerQuantityBaseGlassInner} />
            </GlassView>
            <View style={[styles.footerQuantityOrbGlassShell, styles.footerQuantityOrbGlassLeft]}>
              <GlassView
                glassEffectStyle="clear"
                colorScheme="auto"
                isInteractive
                style={styles.footerQuantityOrbGlassView}
              />
            </View>
            <View style={[styles.footerQuantityOrbGlassShell, styles.footerQuantityOrbGlassRight]}>
              <GlassView
                glassEffectStyle="clear"
                colorScheme="auto"
                isInteractive
                style={styles.footerQuantityOrbGlassView}
              />
            </View>
          </>
        ) : (
          <>
            <BlurView tint="light" intensity={Platform.OS === "ios" ? 24 : 20} style={styles.footerQuantityBaseGlass}>
              <View style={styles.footerQuantityBaseFallbackInner} />
            </BlurView>
            <View style={[styles.footerQuantityOrbGlassShell, styles.footerQuantityOrbGlassLeft]}>
              <BlurView
                tint="light"
                intensity={Platform.OS === "ios" ? 24 : 20}
                style={styles.footerQuantityOrbGlassView}
              >
                <View style={styles.footerMiniPillFallbackSurface} />
              </BlurView>
            </View>
            <View style={[styles.footerQuantityOrbGlassShell, styles.footerQuantityOrbGlassRight]}>
              <BlurView
                tint="light"
                intensity={Platform.OS === "ios" ? 24 : 20}
                style={styles.footerQuantityOrbGlassView}
              >
                <View style={styles.footerMiniPillFallbackSurface} />
              </BlurView>
            </View>
          </>
        )}
      </View>
      <View pointerEvents="box-none" style={styles.footerQuantityContentLayer}>
        <Text allowFontScaling={false} maxFontSizeMultiplier={1} style={styles.footerQuantityValue}>
          {quantity}
        </Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Decrease quantity"
          accessibilityState={{ disabled: !canDecrease }}
          style={[
            styles.footerOrbButton,
            styles.footerQuantityOrbControlLeft,
            !canDecrease ? styles.footerStepperButtonDisabled : null
          ]}
          onPress={onDecrease}
          disabled={!canDecrease}
        >
          <Ionicons name="remove" size={18} color={!canDecrease ? uiPalette.textMuted : uiPalette.text} />
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Increase quantity"
          accessibilityState={{ disabled: !canIncrease }}
          style={[
            styles.footerOrbButton,
            styles.footerQuantityOrbControlRight,
            !canIncrease ? styles.footerStepperButtonDisabled : null
          ]}
          onPress={onIncrease}
          disabled={!canIncrease}
        >
          <Ionicons name="add" size={18} color={!canIncrease ? uiPalette.textMuted : uiPalette.text} />
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  footerPillShell: {
    borderRadius: 999,
    overflow: "visible",
    minHeight: 60,
    shadowColor: "#000000",
    shadowOpacity: 0.09,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 6
  },
  footerPillFrame: { minHeight: 60, borderRadius: 999, overflow: "hidden" },
  footerPillInner: {
    minHeight: 60,
    borderRadius: 999,
    paddingHorizontal: 4,
    paddingVertical: 2,
    justifyContent: "center"
  },
  footerPillInnerGlass: { backgroundColor: "transparent", borderWidth: 1, borderColor: "rgba(255,255,255,0.3)" },
  footerPillInnerFallback: {
    backgroundColor: "rgba(248, 244, 236, 0.98)",
    borderWidth: 1,
    borderColor: "rgba(230, 221, 208, 0.94)"
  },
  footerQuantityShell: {
    minHeight: 60,
    borderRadius: 999,
    overflow: "visible",
    shadowColor: "#000000",
    shadowOpacity: 0.09,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 6
  },
  footerQuantityMergeLayer: { ...StyleSheet.absoluteFillObject },
  footerQuantityBaseGlass: { ...StyleSheet.absoluteFillObject, borderRadius: 999, overflow: "hidden" },
  footerQuantityBaseGlassInner: {
    flex: 1,
    borderRadius: 999,
    backgroundColor: "rgba(255, 255, 255, 0.003)",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.11)"
  },
  footerQuantityBaseFallbackInner: {
    flex: 1,
    borderRadius: 999,
    backgroundColor: "rgba(248, 244, 236, 0.98)",
    borderWidth: 1,
    borderColor: "rgba(230, 221, 208, 0.94)"
  },
  footerQuantityOrbGlassShell: {
    position: "absolute",
    top: 9,
    width: 42,
    height: 42,
    borderRadius: 999,
    overflow: "visible",
    shadowColor: "#000000",
    shadowOpacity: 0.06,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4
  },
  footerQuantityOrbGlassLeft: { left: 6 },
  footerQuantityOrbGlassRight: { right: 6 },
  footerQuantityOrbGlassView: { width: 42, height: 42, borderRadius: 999, overflow: "hidden" },
  footerMiniPillFallbackSurface: {
    flex: 1,
    borderRadius: 999,
    backgroundColor: "rgba(248, 244, 236, 0.98)",
    borderWidth: 1,
    borderColor: "rgba(230, 221, 208, 0.94)",
    padding: 2,
    justifyContent: "center"
  },
  footerQuantityContentLayer: {
    minHeight: 60,
    width: "100%",
    borderRadius: 999,
    position: "relative",
    alignItems: "center",
    justifyContent: "center"
  },
  footerOrbButton: {
    position: "absolute",
    top: 9,
    width: 42,
    height: 42,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center"
  },
  footerQuantityOrbControlLeft: { left: 6 },
  footerQuantityOrbControlRight: { right: 6 },
  footerStepperButtonDisabled: { opacity: 0.5 },
  footerQuantityValue: {
    minWidth: 28,
    textAlign: "center",
    fontSize: 18,
    lineHeight: 22,
    color: uiPalette.text,
    fontWeight: "600"
  }
});
